import { open, realpath, stat } from "node:fs/promises";

import { resolveSafePath } from "../security/index.js";

import type { Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";

const DEFAULT_READ_CHUNK_BYTES = 64 * 1024;

export class SecuredDocumentSourceError extends Error {
  public readonly code:
    | "secured_source.cancelled"
    | "secured_source.invalid_limit"
    | "secured_source.file_too_large"
    | "secured_source.identity_changed"
    | "secured_source.not_file"
    | "secured_source.read_failed";

  public constructor(code: SecuredDocumentSourceError["code"], message: string) {
    super(message);
    this.name = "SecuredDocumentSourceError";
    this.code = code;
  }
}

export type StandaloneDocumentBytes = Readonly<{
  bytes: Uint8Array;
  byteLength: number;
  transferList: [ArrayBuffer];
}>;

export type SecuredDocumentReadResult = Readonly<{
  bytes: StandaloneDocumentBytes;
  fileBytes: number;
  canonicalExtension: string;
}>;

export type SecuredDocumentSourceDependencies = Readonly<{
  resolvePath?: (workspaceRoot: string, relativePath: string) => Promise<string>;
  statFile?: (path: string) => Promise<Stats>;
  realpathFile?: (path: string) => Promise<string>;
  openFile?: (path: string) => Promise<Pick<FileHandle, "read" | "close" | "stat">>;
}>;

export type SecuredDocumentSourceOptions = Readonly<{
  signal?: AbortSignal;
  readChunkBytes?: number;
}> & SecuredDocumentSourceDependencies;

export async function readSecuredDocumentBytes(
  workspaceRoot: string,
  relativePath: string,
  maxFileBytes: number,
  options: SecuredDocumentSourceOptions = {},
): Promise<SecuredDocumentReadResult> {
  throwIfAborted(options.signal);
  validateMaxFileBytes(maxFileBytes);

  const canonicalPath = await (options.resolvePath ?? resolveSafePath)(
    workspaceRoot,
    relativePath,
  );
  const beforeStat = await (options.statFile ?? stat)(canonicalPath);
  validateRegularFile(beforeStat);
  if (beforeStat.size > maxFileBytes) {
    throw new SecuredDocumentSourceError(
      "secured_source.file_too_large",
      "File exceeds configured size limit",
    );
  }

  const handle = await (options.openFile ?? defaultOpenFile)(canonicalPath);
  try {
    throwIfAborted(options.signal);
    const afterStat = await handle.stat();
    validateSameFile(beforeStat, afterStat);
    validateRegularFile(afterStat);
    if (afterStat.size > maxFileBytes) {
      throw new SecuredDocumentSourceError(
        "secured_source.file_too_large",
        "File exceeds configured size limit",
      );
    }

    const bytes = await readExactStandaloneBytes(
      handle,
      afterStat.size,
      normalizeReadChunkBytes(options.readChunkBytes),
      options.signal,
    );

    const finalRealPath = await (options.realpathFile ?? realpath)(canonicalPath);
    if (finalRealPath !== canonicalPath) {
      throw new SecuredDocumentSourceError(
        "secured_source.identity_changed",
        "File identity changed during read",
      );
    }

    return {
      bytes,
      fileBytes: afterStat.size,
      canonicalExtension: extensionFromPath(canonicalPath),
    };
  } catch (error) {
    if (error instanceof SecuredDocumentSourceError) {
      throw error;
    }
    throw new SecuredDocumentSourceError(
      "secured_source.read_failed",
      "Could not read secured document bytes",
    );
  } finally {
    await handle.close();
  }
}

async function defaultOpenFile(
  path: string,
): Promise<Pick<FileHandle, "read" | "close" | "stat">> {
  return open(path, "r");
}

async function readExactStandaloneBytes(
  handle: Pick<FileHandle, "read">,
  fileBytes: number,
  readChunkBytes: number,
  signal: AbortSignal | undefined,
): Promise<StandaloneDocumentBytes> {
  throwIfAborted(signal);
  const arrayBuffer = new ArrayBuffer(fileBytes);
  const bytes = new Uint8Array(arrayBuffer);
  let offset = 0;

  while (offset < fileBytes) {
    throwIfAborted(signal);
    const requested = Math.min(readChunkBytes, fileBytes - offset);
    const chunk = bytes.subarray(offset, offset + requested);
    const result = await handle.read(chunk, 0, chunk.byteLength, offset);
    if (result.bytesRead === 0) {
      throw new SecuredDocumentSourceError(
        "secured_source.read_failed",
        "Could not read complete file contents",
      );
    }
    offset += result.bytesRead;
  }
  throwIfAborted(signal);

  return {
    bytes,
    byteLength: bytes.byteLength,
    transferList: [arrayBuffer],
  };
}

function validateSameFile(beforeStat: Stats, afterStat: Stats): void {
  if (
    beforeStat.size !== afterStat.size ||
    beforeStat.dev !== afterStat.dev ||
    beforeStat.ino !== afterStat.ino
  ) {
    throw new SecuredDocumentSourceError(
      "secured_source.identity_changed",
      "File identity changed during open",
    );
  }
}

function validateRegularFile(fileStat: Stats): void {
  if (!fileStat.isFile()) {
    throw new SecuredDocumentSourceError(
      "secured_source.not_file",
      "Target must be a regular file",
    );
  }
}

function validateMaxFileBytes(maxFileBytes: number): void {
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1) {
    throw new SecuredDocumentSourceError(
      "secured_source.invalid_limit",
      "File size limit is invalid",
    );
  }
}

function normalizeReadChunkBytes(readChunkBytes = DEFAULT_READ_CHUNK_BYTES): number {
  if (!Number.isSafeInteger(readChunkBytes) || readChunkBytes < 1) {
    throw new SecuredDocumentSourceError(
      "secured_source.invalid_limit",
      "Read chunk limit is invalid",
    );
  }
  return readChunkBytes;
}

function extensionFromPath(path: string): string {
  const dotIndex = path.lastIndexOf(".");
  return dotIndex === -1 ? "" : path.slice(dotIndex + 1).toLowerCase();
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new SecuredDocumentSourceError(
      "secured_source.cancelled",
      "Secured document read was cancelled",
    );
  }
}
