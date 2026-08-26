import { open, stat } from "node:fs/promises";

import type { FileHandle } from "node:fs/promises";
import type { DocumentWorkerErrorCode } from "../protocol/index.js";

const MAX_MAGIC_READ_BYTES = 8192;

const MAGIC_SIGNATURES: Record<string, readonly (readonly [number, number[]])[]> = {
  pdf: [[0, [0x25, 0x50, 0x44, 0x46, 0x2d]]],
  zip: [[0, [0x50, 0x4b, 0x03, 0x04]]],
};

export class FileValidationError extends Error {
  public readonly code:
    | "file_validation.cancelled"
    | "file_validation.invalid_limit"
    | "file_validation.file_too_large"
    | "file_validation.read_failed";

  public constructor(code: FileValidationError["code"], message: string) {
    super(message);
    this.name = "FileValidationError";
    this.code = code;
  }
}

export type FileHeaderReadResult = Readonly<{
  head: Buffer;
  fileBytes: number;
  bytesRead: number;
}>;

export type FileHeaderReadOptions = Readonly<{
  maxBytes?: number;
  maxFileBytes?: number;
  signal?: AbortSignal;
  openFile?: (filePath: string) => Promise<Pick<FileHandle, "read" | "close">>;
  statFile?: (filePath: string) => Promise<{ size: number }>;
}>;

export type MagicDetectionOptions = number | FileHeaderReadOptions;

export async function readFileHeader(
  filePath: string,
  options: FileHeaderReadOptions = {},
): Promise<FileHeaderReadResult> {
  throwIfAborted(options.signal);

  const maxBytes = normalizeMaxBytes(options.maxBytes ?? MAX_MAGIC_READ_BYTES);
  const fileStat = await (options.statFile ?? stat)(filePath);
  const fileBytes = fileStat.size;
  if (
    options.maxFileBytes !== undefined &&
    (options.maxFileBytes < 1 ||
      !Number.isSafeInteger(options.maxFileBytes) ||
      fileBytes > options.maxFileBytes)
  ) {
    throw new FileValidationError(
      "file_validation.file_too_large",
      "File exceeds configured size limit",
    );
  }

  const handle = await (options.openFile ?? defaultOpenFile)(filePath);
  try {
    throwIfAborted(options.signal);
    const buffer = Buffer.alloc(Math.min(maxBytes, fileBytes));
    const result = await handle.read(buffer, 0, buffer.length, 0);
    throwIfAborted(options.signal);
    return {
      head: buffer.subarray(0, result.bytesRead),
      fileBytes,
      bytesRead: result.bytesRead,
    };
  } catch (error) {
    if (error instanceof FileValidationError) {
      throw error;
    }
    throw new FileValidationError(
      "file_validation.read_failed",
      "Could not read file header",
    );
  } finally {
    await handle.close();
  }
}

export async function detectFormatByMagic(
  filePath: string,
  options: MagicDetectionOptions = {},
): Promise<string | null> {
  const normalizedOptions =
    typeof options === "number" ? { maxBytes: options } : options;
  const { head } = await readFileHeader(filePath, normalizedOptions);

  for (const [format, signatures] of Object.entries(MAGIC_SIGNATURES)) {
    if (
      signatures.every(([offset, bytes]) =>
        bytes.every((byte, index) => head[offset + index] === byte),
      )
    ) {
      return format;
    }
  }
  return null;
}

export function isMagicConsistentWithExtension(
  magicHint: string | null,
  extension: string,
): boolean {
  const ext = extension.toLowerCase().replace(/^\./, "");
  switch (ext) {
    case "pdf":
      return magicHint === "pdf";
    case "xlsx":
    case "docx":
    case "xlsm":
    case "docm":
      return magicHint === "zip";
    default:
      return false;
  }
}

export type OoxmlValidationResult = {
  valid: false;
  reason: "validation_unavailable";
  errorCode: Extract<DocumentWorkerErrorCode, "unsupported_feature">;
  entryCount?: never;
  hasMacros?: never;
  hasExternalRelationships?: never;
};

export async function validateOoxmlStructure(
  _filePath: string,
  _maxEntries = 10_000,
): Promise<OoxmlValidationResult> {
  return {
    valid: false,
    reason: "validation_unavailable",
    errorCode: "unsupported_feature",
  };
}

async function defaultOpenFile(
  filePath: string,
): Promise<Pick<FileHandle, "read" | "close">> {
  return open(filePath, "r");
}

function normalizeMaxBytes(maxBytes: number): number {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_MAGIC_READ_BYTES
  ) {
    throw new FileValidationError(
      "file_validation.invalid_limit",
      "Header read limit is invalid",
    );
  }
  return maxBytes;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new FileValidationError(
      "file_validation.cancelled",
      "File header read was cancelled",
    );
  }
}
