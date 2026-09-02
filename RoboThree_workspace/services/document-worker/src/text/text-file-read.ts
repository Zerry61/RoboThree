import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, resolve, sep, win32 } from "node:path";

import { computeResultDigest } from "../common/index.js";
import { DocumentCapabilityHandlerError } from "../runtime/document-capability-handler.js";

import type { DocumentWorkerLimits } from "../protocol/index.js";
import type { DocumentCapabilityResult } from "../runtime/document-capability-handler.js";
import type { Stats } from "node:fs";

export const TEXT_FILE_READ_CAPABILITY_ID = "tool.workspace.file.read_text";
export const TEXT_FILE_READ_LIMITS_REVISION = "workspace-text-read.v1";

const MAX_TEXT_BYTES = 256 * 1024;
const MAX_RELATIVE_PATH_BYTES = 1024;
const MAX_PATH_DEPTH = 32;

export type TextFileReadOutput = Readonly<{
  relativePath: string;
  content: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
}>;

export type TextFileReadDependencies = Readonly<{
  afterBytesRead: (attempt: number) => void | Promise<void>;
}>;

export type TextFileReadRequest = Readonly<{
  workspaceRoot: string;
  relativePath: string;
  options: Record<string, unknown>;
  limits: DocumentWorkerLimits;
  signal: AbortSignal;
  dependencies?: Partial<TextFileReadDependencies>;
}>;

type StableStat = Readonly<{
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  nlink: number;
}>;

const DEFAULT_DEPENDENCIES: TextFileReadDependencies = {
  afterBytesRead: () => {},
};

export async function readTextFile(
  request: TextFileReadRequest,
): Promise<DocumentCapabilityResult> {
  const startedAt = Date.now();
  requireEmptyOptions(request.options);
  const relativePath = normalizeRelativePath(request.relativePath);
  const absolutePath = await resolveReadableTarget(request.workspaceRoot, relativePath);
  const maxBytes = Math.min(
    MAX_TEXT_BYTES,
    request.limits.maxFileBytes,
    request.limits.maxOutputBytes,
  );
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...request.dependencies };

  let bytes: Buffer | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    throwIfAborted(request.signal);
    const result = await readStableRegularFile(
      absolutePath,
      maxBytes,
      request.signal,
      () => dependencies.afterBytesRead(attempt),
    );
    if (result.stable) {
      bytes = result.bytes;
      break;
    }
  }
  if (bytes === undefined) {
    throw readError(
      "internal_failure",
      "Text file changed while it was being read",
      "workspace.file.changed_during_read",
    );
  }

  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw readError(
      "invalid_format",
      "Text file is not valid UTF-8",
      "workspace.file.invalid_utf8",
    );
  }
  if (content.includes("\u0000")) {
    throw readError(
      "invalid_format",
      "Text file contains NUL bytes",
      "workspace.file.not_text",
    );
  }

  const output: TextFileReadOutput = {
    relativePath,
    content,
    mediaType: mediaTypeFor(relativePath),
    byteSize: bytes.byteLength,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
  return {
    output,
    metadata: {
      originalCount: 1,
      returnedCount: 1,
      truncated: false,
      resultDigest: computeResultDigest(output),
      timingMs: Date.now() - startedAt,
    },
  };
}

async function readStableRegularFile(
  absolutePath: string,
  maxBytes: number,
  signal: AbortSignal,
  afterBytesRead: () => void | Promise<void>,
): Promise<Readonly<{ stable: boolean; bytes: Buffer }>> {
  const handle = await open(
    absolutePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  ).catch((error: unknown) => {
    throw mapOpenError(error);
  });
  try {
    const beforeStats = await handle.stat();
    requireRegularFile(beforeStats, maxBytes);
    const before = stableStat(beforeStats);
    throwIfAborted(signal);
    const bytes = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < before.size) {
      throwIfAborted(signal);
      const result = await handle.read(bytes, offset, before.size - offset, offset);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    const exact = offset === bytes.byteLength ? bytes : bytes.subarray(0, offset);
    await afterBytesRead();
    const after = stableStat(await handle.stat());
    return { stable: offset === before.size && sameStat(before, after), bytes: exact };
  } finally {
    await handle.close();
  }
}

async function resolveReadableTarget(
  workspaceRoot: string,
  relativePath: string,
): Promise<string> {
  let rootRealPath: string;
  try {
    rootRealPath = await realpath(workspaceRoot);
  } catch {
    throw readError("invalid_format", "Workspace was not found", "workspace.file.read_unavailable");
  }
  if (rootRealPath === sep) {
    throw readError("invalid_format", "Workspace root is unsafe", "workspace.file.outside_workspace");
  }
  const lexicalTarget = resolve(rootRealPath, relativePath);
  if (!isContained(rootRealPath, lexicalTarget)) {
    throw readError("invalid_format", "Path is outside the workspace", "workspace.file.outside_workspace");
  }
  const lexicalStat = await lstat(lexicalTarget).catch((error: unknown) => {
    throw mapOpenError(error);
  });
  if (lexicalStat.isSymbolicLink()) {
    throw readError("invalid_format", "Symbolic links are not readable", "workspace.file.symlink_rejected");
  }
  let targetRealPath: string;
  try {
    targetRealPath = await realpath(lexicalTarget);
  } catch {
    throw readError("invalid_format", "Text file was not found", "workspace.file.not_found");
  }
  if (!isContained(rootRealPath, targetRealPath)) {
    throw readError("invalid_format", "Path resolves outside the workspace", "workspace.file.outside_workspace");
  }
  return targetRealPath;
}

function normalizeRelativePath(relativePath: string): string {
  if (
    relativePath.length === 0
    || Buffer.byteLength(relativePath, "utf8") > MAX_RELATIVE_PATH_BYTES
    || relativePath.includes("\u0000")
    || relativePath.includes("\\")
    || relativePath.includes("://")
    || isAbsolute(relativePath)
    || win32.isAbsolute(relativePath)
    || relativePath.startsWith("\\\\")
  ) {
    throw readError("invalid_format", "Text path is invalid", "workspace.file.invalid_path");
  }
  const segments = relativePath.split("/");
  if (
    segments.length > MAX_PATH_DEPTH
    || segments.some((segment) => segment.length === 0 || segment === "." || segment === ".." || segment.startsWith("."))
  ) {
    throw readError("invalid_format", "Text path is invalid", "workspace.file.invalid_path");
  }
  return segments.join("/");
}

function requireEmptyOptions(options: Record<string, unknown>): void {
  if (Object.keys(options).length > 0) {
    throw readError("invalid_format", "Text read options must be empty", "workspace.file.invalid_arguments");
  }
}

function stableStat(value: Stats): StableStat {
  return {
    dev: value.dev,
    ino: value.ino,
    size: value.size,
    mtimeMs: value.mtimeMs,
    ctimeMs: value.ctimeMs,
    nlink: value.nlink,
  };
}

function requireRegularFile(value: Stats, maxBytes: number): void {
  if (!value.isFile() || value.nlink !== 1) {
    throw readError("invalid_format", "Hard-linked text files are not readable", "workspace.file.not_regular_file");
  }
  if (value.size > maxBytes) {
    throw readError("limit_exceeded", "Text file exceeds the read limit", "workspace.file.too_large");
  }
}

function sameStat(left: StableStat, right: StableStat): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
    && left.nlink === right.nlink;
}

function mapOpenError(error: unknown): DocumentCapabilityHandlerError {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  if (code === "ENOENT") return readError("invalid_format", "Text file was not found", "workspace.file.not_found");
  if (code === "ELOOP") return readError("invalid_format", "Symbolic links are not readable", "workspace.file.symlink_rejected");
  if (code === "EACCES" || code === "EPERM") {
    return readError("invalid_format", "Text file is not readable", "workspace.file.policy_denied");
  }
  return readError("internal_failure", "Text file could not be read", "workspace.file.read_unavailable");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw readError("cancelled", "Text read was cancelled", "workspace.file.read_unavailable");
}

function readError(
  code: ConstructorParameters<typeof DocumentCapabilityHandlerError>[0],
  message: string,
  detailCode: string,
): DocumentCapabilityHandlerError {
  return new DocumentCapabilityHandlerError(code, message, undefined, detailCode);
}

function isContained(root: string, target: string): boolean {
  return target === root || target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

function mediaTypeFor(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".css")) return "text/css";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "application/yaml";
  if (lower.endsWith(".xml") || lower.endsWith(".svg")) return "application/xml";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "text/javascript";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "text/typescript";
  return "text/plain";
}
