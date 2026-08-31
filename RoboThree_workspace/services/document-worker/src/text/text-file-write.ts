import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  open,
  readFile,
  realpath,
  rename as defaultRename,
  stat,
  unlink,
  link as defaultLink,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, sep, win32 } from "node:path";

import { computeErrorDigest, computeResultDigest } from "../common/index.js";
import { DocumentCapabilityHandlerError } from "../runtime/document-capability-handler.js";

import type {
  DocumentWorkerLimits,
  DocumentWorkerResultMetadata,
} from "../protocol/index.js";
import type { DocumentCapabilityResult } from "../runtime/document-capability-handler.js";

export const TEXT_FILE_WRITE_CAPABILITY_ID = "tool.workspace.file.write_text";
export const TEXT_FILE_WRITE_LIMITS_REVISION = "workspace-text.v1";

const MAX_TEXT_BYTES = 256 * 1024;
const MAX_RELATIVE_PATH_BYTES = 1024;
const MAX_SEGMENT_BYTES = 255;
const MAX_PATH_DEPTH = 32;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const REQUEST_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;

export type TextFileWriteMode = "create_new" | "replace_existing";

export type TextFileWritePrivateOptions = Readonly<{
  content: string;
  mode: TextFileWriteMode;
  expectedPreviousSha256?: string;
  ownedArtifactProofDigest?: string;
  workspaceGrantId: string;
  limitsRevision: string;
}>;

export type TextFileWriteRequest = Readonly<{
  workspaceRoot: string;
  relativePath: string;
  options: Record<string, unknown>;
  limits: DocumentWorkerLimits;
  idempotencyKey?: string;
  requestDigest?: string;
  signal: AbortSignal;
  dependencies?: Partial<TextFileWriteDependencies>;
}>;

export type TextFileWriteOutput = Readonly<{
  status: "created" | "replaced" | "replayed";
  relativePath: string;
  mode: TextFileWriteMode;
  sha256: string;
  byteSize: number;
  mediaType: string;
  previousSha256?: string;
  backupCreated: boolean;
  warnings: readonly string[];
}>;

export type TextFileWriteFaultPoint =
  | "beforeTemporaryFileCreation"
  | "afterTemporaryFileFsyncBeforePublication"
  | "afterTargetPublicationBeforeObservation"
  | "replacementEvidenceAmbiguous";

export type TextFileWriteDependencies = Readonly<{
  link: typeof defaultLink;
  rename: typeof defaultRename;
  randomName: () => string;
  fault: (point: TextFileWriteFaultPoint) => void | Promise<void>;
  processAlive: (pid: number) => boolean;
}>;

export type TextFileWritePostconditionDecision =
  | "not_found"
  | "safe_retry"
  | "recovered_success"
  | "unknown";

export type TextFileWritePostcondition = Readonly<{
  decision: TextFileWritePostconditionDecision;
  targetSha256?: string;
  backupSha256?: string;
  byteSize?: number;
}>;

export type RecoveredTextFileWriteResult = Readonly<{
  output: TextFileWriteOutput;
  metadata: DocumentWorkerResultMetadata;
}>;

export type TextFileWriteDigestInput = Readonly<{
  idempotencyKey: string;
  workspaceGrantId: string;
  relativePath: string;
  mode: TextFileWriteMode;
  contentSha256: string;
  expectedPreviousSha256?: string;
  ownedArtifactProofDigest?: string;
  limitsRevision: string;
}>;

type ResolvedTarget = Readonly<{
  rootRealPath: string;
  parentRealPath: string;
  targetPath: string;
  backupPath: string;
  normalizedRelativePath: string;
}>;

type NormalizedRequest = Readonly<{
  relativePath: string;
  options: TextFileWritePrivateOptions;
  contentBytes: Buffer;
  contentSha256: string;
}>;

type InspectedEntry =
  | Readonly<{ state: "missing" }>
  | Readonly<{
    state: "regular";
    sha256: string;
    byteSize: number;
    bytes?: Buffer;
  }>
  | Readonly<{ state: "ambiguous" }>;

const DEFAULT_DEPENDENCIES: TextFileWriteDependencies = {
  link: defaultLink,
  rename: defaultRename,
  randomName: () => randomUUID(),
  fault: () => {},
  processAlive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
};

export async function writeTextFile(
  request: TextFileWriteRequest,
): Promise<DocumentCapabilityResult> {
  const startedAt = Date.now();
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...request.dependencies };
  const normalized = normalizeTextFileWriteRequest(
    request.relativePath,
    request.options,
    request.limits,
  );
  verifyRequestDigest(request, normalized);
  throwIfAborted(request.signal);

  const target = await resolveTextFileTarget(
    request.workspaceRoot,
    normalized.relativePath,
  );
  let targetTempPath: string | null = null;
  let backupTempPath: string | null = null;
  let lockPath: string | null = null;
  let previousSha256: string | undefined;

  try {
    if (normalized.options.mode === "create_new") {
      await requireMissingTarget(target.targetPath);
    } else {
      lockPath = await acquireTargetLock(target, dependencies);
      const previous = await requireReplaceableTarget(
        target.targetPath,
        request.limits,
      );
      previousSha256 = previous.sha256;
      if (previous.sha256 !== normalized.options.expectedPreviousSha256) {
        throw textWriteError(
          "invalid_format",
          "Text target digest changed before replacement",
          "previous_digest_mismatch",
        );
      }
      await requireReplaceableBackup(target.backupPath);
    }

    await dependencies.fault("beforeTemporaryFileCreation");
    targetTempPath = temporaryPath(target.parentRealPath, dependencies.randomName(), "target");
    await writeAndFsync(targetTempPath, normalized.contentBytes, request.signal);
    await dependencies.fault("afterTemporaryFileFsyncBeforePublication");
    throwIfAborted(request.signal);

    if (normalized.options.mode === "create_new") {
      await publishCreate(targetTempPath, target.targetPath, dependencies);
      await verifyLinkedCreateTarget(
        target.targetPath,
        normalized.contentSha256,
        normalized.contentBytes.byteLength,
        request.limits,
      );
      await removeInternalFile(targetTempPath);
      targetTempPath = null;
      await dependencies.fault("afterTargetPublicationBeforeObservation");
      await verifyExactFile(
        target.targetPath,
        normalized.contentSha256,
        normalized.contentBytes.byteLength,
        request.limits,
        "recovery_uncertain",
      );
    } else {
      if (lockPath === null || previousSha256 === undefined) {
        throw textWriteError(
          "internal_failure",
          "Text replacement state is unavailable",
          "write_failed",
        );
      }
      await verifyTargetLock(lockPath);
      const oldBytes = await requireReplaceableTarget(
        target.targetPath,
        request.limits,
      );
      if (oldBytes.sha256 !== previousSha256) {
        throw textWriteError(
          "invalid_format",
          "Text target digest changed before backup publication",
          "previous_digest_mismatch",
        );
      }
      backupTempPath = temporaryPath(target.parentRealPath, dependencies.randomName(), "backup");
      await writeAndFsync(backupTempPath, oldBytes.bytes, request.signal);
      await publishReplace(backupTempPath, target.backupPath, dependencies);
      backupTempPath = null;
      await dependencies.fault("replacementEvidenceAmbiguous");

      await verifyTargetLock(lockPath);
      const rechecked = await requireReplaceableTarget(
        target.targetPath,
        request.limits,
      );
      if (rechecked.sha256 !== previousSha256) {
        throw textWriteError(
          "internal_failure",
          "Text replacement evidence became ambiguous before publication",
          "recovery_uncertain",
        );
      }
      await publishReplace(targetTempPath, target.targetPath, dependencies);
      targetTempPath = null;
      await dependencies.fault("afterTargetPublicationBeforeObservation");
      await verifyExactFile(
        target.targetPath,
        normalized.contentSha256,
        normalized.contentBytes.byteLength,
        request.limits,
        "recovery_uncertain",
      );
      await verifyExactFile(
        target.backupPath,
        previousSha256,
        oldBytes.byteSize,
        request.limits,
        "recovery_uncertain",
      );
    }

    await removeInternalFile(targetTempPath);
    targetTempPath = null;
    const output: TextFileWriteOutput = {
      status: normalized.options.mode === "create_new" ? "created" : "replaced",
      relativePath: normalized.relativePath,
      mode: normalized.options.mode,
      sha256: normalized.contentSha256,
      byteSize: normalized.contentBytes.byteLength,
      mediaType: mediaTypeFor(normalized.relativePath),
      ...(previousSha256 === undefined ? {} : { previousSha256 }),
      backupCreated: normalized.options.mode === "replace_existing",
      warnings: [],
    };
    const metadata: DocumentWorkerResultMetadata = {
      originalCount: 1,
      returnedCount: 1,
      truncated: false,
      resultDigest: computeResultDigest(output),
      timingMs: Date.now() - startedAt,
    };
    return { output, metadata };
  } catch (error) {
    if (error instanceof DocumentCapabilityHandlerError) throw error;
    if (request.signal.aborted) {
      throw new DocumentCapabilityHandlerError("cancelled", "Processing was cancelled");
    }
    throw textWriteError(
      "internal_failure",
      "Text file write failed",
      "write_failed",
    );
  } finally {
    await removeInternalFile(targetTempPath);
    await removeInternalFile(backupTempPath);
    await removeInternalFile(lockPath);
  }
}

export async function inspectTextFileWritePostcondition(input: Readonly<{
  workspaceRoot: string;
  relativePath: string;
  options: Record<string, unknown>;
  limits: DocumentWorkerLimits;
}>): Promise<TextFileWritePostcondition> {
  const normalized = normalizeTextFileWriteRequest(
    input.relativePath,
    input.options,
    input.limits,
  );
  const target = await resolveTextFileTarget(input.workspaceRoot, normalized.relativePath);
  const targetEntry = await inspectEntry(target.targetPath, input.limits, false);

  if (normalized.options.mode === "create_new") {
    if (targetEntry.state === "missing") return { decision: "not_found" };
    if (
      targetEntry.state === "regular"
      && targetEntry.sha256 === normalized.contentSha256
      && targetEntry.byteSize === normalized.contentBytes.byteLength
    ) {
      return {
        decision: "recovered_success",
        targetSha256: targetEntry.sha256,
        byteSize: targetEntry.byteSize,
      };
    }
    return { decision: "unknown" };
  }

  const expectedPreviousSha256 = normalized.options.expectedPreviousSha256;
  if (expectedPreviousSha256 === undefined) return { decision: "unknown" };
  const backupEntry = await inspectEntry(target.backupPath, input.limits, false);
  if (
    targetEntry.state === "regular"
    && targetEntry.sha256 === expectedPreviousSha256
    && (backupEntry.state === "missing" || backupEntry.state === "regular")
  ) {
    return {
      decision: "safe_retry",
      targetSha256: targetEntry.sha256,
      byteSize: targetEntry.byteSize,
      ...(backupEntry.state === "regular" ? { backupSha256: backupEntry.sha256 } : {}),
    };
  }
  if (
    targetEntry.state === "regular"
    && targetEntry.sha256 === normalized.contentSha256
    && targetEntry.byteSize === normalized.contentBytes.byteLength
    && backupEntry.state === "regular"
    && backupEntry.sha256 === expectedPreviousSha256
  ) {
    return {
      decision: "recovered_success",
      targetSha256: targetEntry.sha256,
      backupSha256: backupEntry.sha256,
      byteSize: targetEntry.byteSize,
    };
  }
  return { decision: "unknown" };
}

export function createRecoveredTextFileWriteResult(input: Readonly<{
  relativePath: string;
  options: Record<string, unknown>;
  limits: DocumentWorkerLimits;
  postcondition: TextFileWritePostcondition;
  timingMs?: number;
}>): RecoveredTextFileWriteResult {
  if (
    input.postcondition.decision !== "recovered_success"
    || input.postcondition.targetSha256 === undefined
    || input.postcondition.byteSize === undefined
  ) {
    throw textWriteError(
      "internal_failure",
      "Text write recovery result is not proven",
      "recovery_uncertain",
    );
  }
  const normalized = normalizeTextFileWriteRequest(
    input.relativePath,
    input.options,
    input.limits,
  );
  if (
    input.postcondition.targetSha256 !== normalized.contentSha256
    || input.postcondition.byteSize !== normalized.contentBytes.byteLength
  ) {
    throw textWriteError(
      "internal_failure",
      "Text write recovery result does not match the persisted request",
      "recovery_uncertain",
    );
  }
  const output: TextFileWriteOutput = {
    status: "replayed",
    relativePath: normalized.relativePath,
    mode: normalized.options.mode,
    sha256: input.postcondition.targetSha256,
    byteSize: input.postcondition.byteSize,
    mediaType: mediaTypeFor(normalized.relativePath),
    ...(normalized.options.expectedPreviousSha256 === undefined
      ? {}
      : { previousSha256: normalized.options.expectedPreviousSha256 }),
    backupCreated: normalized.options.mode === "replace_existing",
    warnings: [],
  };
  return {
    output,
    metadata: {
      originalCount: 1,
      returnedCount: 1,
      truncated: false,
      resultDigest: computeResultDigest(output),
      timingMs: input.timingMs ?? 0,
    },
  };
}

export function normalizeTextFileWriteRequest(
  relativePath: string,
  options: Record<string, unknown>,
  limits: DocumentWorkerLimits,
): NormalizedRequest {
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  const normalizedOptions = parsePrivateOptions(options);
  validateText(normalizedOptions.content);
  const contentBytes = Buffer.from(normalizedOptions.content, "utf8");
  if (contentBytes.byteLength > Math.min(MAX_TEXT_BYTES, limits.maxOutputBytes)) {
    throw textWriteError(
      "limit_exceeded",
      "Text content exceeds the configured byte limit",
      "invalid_arguments",
    );
  }
  return {
    relativePath: normalizedRelativePath,
    options: normalizedOptions,
    contentBytes,
    contentSha256: prefixedSha256(contentBytes),
  };
}

export function computeTextFileWriteRequestDigest(
  input: TextFileWriteDigestInput,
): string {
  return rawSha256(JSON.stringify({
    capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID,
    contentSha256: input.contentSha256,
    idempotencyKey: input.idempotencyKey,
    limitsRevision: input.limitsRevision,
    mode: input.mode,
    ...(input.expectedPreviousSha256 === undefined
      ? {}
      : { expectedPreviousSha256: input.expectedPreviousSha256 }),
    ...(input.ownedArtifactProofDigest === undefined
      ? {}
      : { ownedArtifactProofDigest: input.ownedArtifactProofDigest }),
    relativePath: input.relativePath,
    workspaceGrantId: input.workspaceGrantId,
  }, stableStringifyReplacer));
}

function verifyRequestDigest(
  request: TextFileWriteRequest,
  normalized: NormalizedRequest,
): void {
  if (
    request.idempotencyKey === undefined
    || request.idempotencyKey.length === 0
    || request.idempotencyKey.length > 240
  ) {
    throw textWriteError(
      "invalid_format",
      "Text write idempotency key is required",
      "invalid_arguments",
    );
  }
  if (request.requestDigest === undefined || !REQUEST_DIGEST_PATTERN.test(request.requestDigest)) {
    throw textWriteError(
      "invalid_format",
      "Text write request digest is required",
      "invalid_arguments",
    );
  }
  const expected = computeTextFileWriteRequestDigest({
    idempotencyKey: request.idempotencyKey,
    workspaceGrantId: normalized.options.workspaceGrantId,
    relativePath: normalized.relativePath,
    mode: normalized.options.mode,
    contentSha256: normalized.contentSha256,
    ...(normalized.options.expectedPreviousSha256 === undefined
      ? {}
      : { expectedPreviousSha256: normalized.options.expectedPreviousSha256 }),
    ...(normalized.options.ownedArtifactProofDigest === undefined
      ? {}
      : { ownedArtifactProofDigest: normalized.options.ownedArtifactProofDigest }),
    limitsRevision: normalized.options.limitsRevision,
  });
  if (request.requestDigest !== expected) {
    throw textWriteError(
      "invalid_format",
      "Text write request digest mismatch",
      "invalid_arguments",
    );
  }
}

function parsePrivateOptions(options: Record<string, unknown>): TextFileWritePrivateOptions {
  requireOnlyKeys(options, [
    "content",
    "expectedPreviousSha256",
    "limitsRevision",
    "mode",
    "ownedArtifactProofDigest",
    "workspaceGrantId",
  ]);
  if (typeof options.content !== "string") {
    throw textWriteError("invalid_format", "Text content must be a string", "invalid_arguments");
  }
  const mode = options.mode === undefined
    ? "create_new"
    : requireEnum(options.mode, ["create_new", "replace_existing"], "mode");
  const workspaceGrantId = requireBoundedString(options.workspaceGrantId, "workspaceGrantId", 256);
  const limitsRevision = requireBoundedString(options.limitsRevision, "limitsRevision", 128);
  if (limitsRevision !== TEXT_FILE_WRITE_LIMITS_REVISION) {
    throw textWriteError(
      "invalid_format",
      "Text write limits revision is unsupported",
      "invalid_arguments",
    );
  }
  const expectedPreviousSha256 = optionalPrefixedSha256(
    options.expectedPreviousSha256,
    "expectedPreviousSha256",
  );
  const ownedArtifactProofDigest = optionalPrefixedSha256(
    options.ownedArtifactProofDigest,
    "ownedArtifactProofDigest",
  );

  if (mode === "create_new") {
    if (expectedPreviousSha256 !== undefined || ownedArtifactProofDigest !== undefined) {
      throw textWriteError(
        "invalid_format",
        "Create mode forbids replacement authority",
        "invalid_arguments",
      );
    }
  } else if (expectedPreviousSha256 === undefined || ownedArtifactProofDigest === undefined) {
    throw textWriteError(
      "invalid_format",
      "Replace mode requires exact prior digest and owned Artifact proof",
      "invalid_arguments",
    );
  }

  return {
    content: options.content,
    mode,
    workspaceGrantId,
    limitsRevision,
    ...(expectedPreviousSha256 === undefined ? {} : { expectedPreviousSha256 }),
    ...(ownedArtifactProofDigest === undefined ? {} : { ownedArtifactProofDigest }),
  };
}

function normalizeRelativePath(relativePath: string): string {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw textWriteError("invalid_format", "Text target path is invalid", "invalid_path");
  }
  const normalized = relativePath.normalize("NFC");
  if (
    Buffer.byteLength(normalized, "utf8") > MAX_RELATIVE_PATH_BYTES
    || normalized.includes("\0")
    || normalized.includes("\\")
    || normalized.includes("://")
    || isAbsolute(normalized)
    || win32.isAbsolute(normalized)
    || normalized.startsWith("\\\\")
  ) {
    throw textWriteError("invalid_format", "Text target path is invalid", "invalid_path");
  }
  const segments = normalized.split("/");
  if (
    segments.length > MAX_PATH_DEPTH
    || segments.some((segment) =>
      segment.length === 0
      || segment === "."
      || segment === ".."
      || segment.startsWith(".")
      || Buffer.byteLength(segment, "utf8") > MAX_SEGMENT_BYTES)
    || normalized.toLowerCase().endsWith(".prev")
  ) {
    throw textWriteError("invalid_format", "Text target path is invalid", "invalid_path");
  }
  return normalized;
}

async function resolveTextFileTarget(
  workspaceRoot: string,
  relativePath: string,
): Promise<ResolvedTarget> {
  const rootRealPath = await realpath(workspaceRoot).catch(() => {
    throw textWriteError("invalid_format", "Workspace is unavailable", "path_escape");
  });
  const parentSegments = dirname(relativePath) === "."
    ? []
    : dirname(relativePath).split("/");
  let parentRealPath = rootRealPath;
  for (const segment of parentSegments) {
    const candidate = join(parentRealPath, segment);
    if (!isContained(rootRealPath, candidate)) {
      throw textWriteError("invalid_format", "Text target escapes workspace", "path_escape");
    }
    let entry: Awaited<ReturnType<typeof lstat>>;
    try {
      entry = await lstat(candidate);
    } catch (error) {
      if (isNodeErrorCode(error, "ENOENT")) {
        throw textWriteError("invalid_format", "Text target parent is missing", "invalid_path");
      }
      throw textWriteError("internal_failure", "Text target parent is unavailable", "write_failed");
    }
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw textWriteError("invalid_format", "Text target parent is invalid", "invalid_path");
    }
    parentRealPath = await realpath(candidate).catch(() => {
      throw textWriteError("invalid_format", "Text target parent is unavailable", "invalid_path");
    });
    if (!isContained(rootRealPath, parentRealPath)) {
      throw textWriteError("invalid_format", "Text target parent escapes workspace", "path_escape");
    }
  }
  const targetPath = join(parentRealPath, basename(relativePath));
  if (!isContained(rootRealPath, targetPath)) {
    throw textWriteError("invalid_format", "Text target escapes workspace", "path_escape");
  }
  return {
    rootRealPath,
    parentRealPath,
    targetPath,
    backupPath: `${targetPath}.prev`,
    normalizedRelativePath: relativePath,
  };
}

async function requireMissingTarget(targetPath: string): Promise<void> {
  try {
    const entry = await lstat(targetPath);
    if (entry.isSymbolicLink()) {
      throw textWriteError("invalid_format", "Text target is a symlink", "invalid_path");
    }
    throw textWriteError("invalid_format", "Text target already exists", "target_exists");
  } catch (error) {
    if (error instanceof DocumentCapabilityHandlerError) throw error;
    if (isNodeErrorCode(error, "ENOENT")) return;
    throw textWriteError("internal_failure", "Text target is unavailable", "write_failed");
  }
}

async function requireReplaceableTarget(
  targetPath: string,
  limits: DocumentWorkerLimits,
): Promise<{ bytes: Buffer; sha256: string; byteSize: number }> {
  const entry = await inspectEntry(targetPath, limits, true);
  if (entry.state === "missing") {
    throw textWriteError("invalid_format", "Text replacement target is missing", "target_missing");
  }
  if (entry.state !== "regular" || entry.bytes === undefined) {
    throw textWriteError("invalid_format", "Text replacement target is unsafe", "invalid_path");
  }
  return { bytes: entry.bytes, sha256: entry.sha256, byteSize: entry.byteSize };
}

async function requireReplaceableBackup(backupPath: string): Promise<void> {
  let entry: Awaited<ReturnType<typeof lstat>>;
  try {
    entry = await lstat(backupPath);
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return;
    throw textWriteError("internal_failure", "Text backup is unavailable", "write_failed");
  }
  if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1) {
    throw textWriteError("invalid_format", "Text backup is unsafe", "invalid_path");
  }
}

async function inspectEntry(
  path: string,
  limits: DocumentWorkerLimits,
  includeBytes: boolean,
): Promise<InspectedEntry> {
  let before: Awaited<ReturnType<typeof lstat>>;
  try {
    before = await lstat(path);
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return { state: "missing" };
    return { state: "ambiguous" };
  }
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) {
    return { state: "ambiguous" };
  }
  if (before.size > Math.min(MAX_TEXT_BYTES, limits.maxFileBytes)) {
    return { state: "ambiguous" };
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await readFile(path));
  } catch {
    return { state: "ambiguous" };
  }
  const after = await stat(path).catch(() => undefined);
  if (
    after === undefined
    || !after.isFile()
    || after.dev !== before.dev
    || after.ino !== before.ino
    || after.size !== before.size
    || bytes.byteLength !== before.size
  ) {
    return { state: "ambiguous" };
  }
  return {
    state: "regular",
    sha256: prefixedSha256(bytes),
    byteSize: bytes.byteLength,
    ...(includeBytes ? { bytes } : {}),
  };
}

async function writeAndFsync(
  path: string,
  bytes: Buffer,
  signal: AbortSignal,
): Promise<void> {
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    throwIfAborted(signal);
    await handle.writeFile(bytes);
    throwIfAborted(signal);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function publishCreate(
  tempPath: string,
  targetPath: string,
  dependencies: TextFileWriteDependencies,
): Promise<void> {
  try {
    await dependencies.link(tempPath, targetPath);
  } catch (error) {
    if (isNodeErrorCode(error, "EEXIST")) {
      throw textWriteError("invalid_format", "Text target already exists", "target_exists");
    }
    throw textWriteError("internal_failure", "Text no-clobber publication failed", "write_failed");
  }
}

async function publishReplace(
  tempPath: string,
  targetPath: string,
  dependencies: TextFileWriteDependencies,
): Promise<void> {
  try {
    await dependencies.rename(tempPath, targetPath);
  } catch {
    throw textWriteError("internal_failure", "Text replacement publication failed", "write_failed");
  }
}

async function verifyExactFile(
  path: string,
  expectedSha256: string,
  expectedByteSize: number,
  limits: DocumentWorkerLimits,
  detailCode: "write_failed" | "recovery_uncertain",
): Promise<void> {
  const entry = await inspectEntry(path, limits, false);
  if (
    entry.state !== "regular"
    || entry.sha256 !== expectedSha256
    || entry.byteSize !== expectedByteSize
  ) {
    throw textWriteError("internal_failure", "Text publication could not be verified", detailCode);
  }
}

async function verifyLinkedCreateTarget(
  path: string,
  expectedSha256: string,
  expectedByteSize: number,
  limits: DocumentWorkerLimits,
): Promise<void> {
  const before = await lstat(path).catch(() => undefined);
  if (
    before === undefined
    || before.isSymbolicLink()
    || !before.isFile()
    || before.nlink !== 2
    || before.size > Math.min(MAX_TEXT_BYTES, limits.maxFileBytes)
  ) {
    throw textWriteError("internal_failure", "Text publication could not be verified", "write_failed");
  }
  const bytes = Buffer.from(await readFile(path));
  const after = await stat(path).catch(() => undefined);
  if (
    after === undefined
    || after.dev !== before.dev
    || after.ino !== before.ino
    || after.size !== before.size
    || bytes.byteLength !== expectedByteSize
    || prefixedSha256(bytes) !== expectedSha256
  ) {
    throw textWriteError("internal_failure", "Text publication could not be verified", "write_failed");
  }
}

async function acquireTargetLock(
  target: ResolvedTarget,
  dependencies: TextFileWriteDependencies,
): Promise<string> {
  const lockName = `.robothree-wfw-${rawSha256(target.normalizedRelativePath).slice(0, 24)}.lock`;
  const lockPath = join(target.parentRealPath, lockName);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      await handle.writeFile(`${process.pid}\n`, "utf8");
      await handle.sync();
      return lockPath;
    } catch (error) {
      if (!isNodeErrorCode(error, "EEXIST")) {
        throw textWriteError("internal_failure", "Text target lock is unavailable", "write_failed");
      }
      if (!(await removeStaleLock(lockPath, dependencies))) {
        throw textWriteError("internal_failure", "Text target is already being modified", "write_failed");
      }
    } finally {
      await handle?.close();
    }
  }
  throw textWriteError("internal_failure", "Text target lock is unavailable", "write_failed");
}

async function removeStaleLock(
  lockPath: string,
  dependencies: TextFileWriteDependencies,
): Promise<boolean> {
  const entry = await lstat(lockPath).catch(() => undefined);
  if (entry === undefined) return true;
  if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 || entry.size > 32) {
    return false;
  }
  const text = await readFile(lockPath, "utf8").catch(() => "");
  const pid = Number.parseInt(text.trim(), 10);
  if (!Number.isSafeInteger(pid) || pid <= 0 || dependencies.processAlive(pid)) {
    return false;
  }
  try {
    await unlink(lockPath);
    return true;
  } catch (error) {
    return isNodeErrorCode(error, "ENOENT");
  }
}

async function verifyTargetLock(lockPath: string): Promise<void> {
  const entry = await lstat(lockPath).catch(() => undefined);
  if (entry === undefined || !entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1) {
    throw textWriteError("internal_failure", "Text target lock was lost", "recovery_uncertain");
  }
}

async function removeInternalFile(path: string | null): Promise<void> {
  if (path === null) return;
  try {
    await unlink(path);
  } catch (error) {
    if (!isNodeErrorCode(error, "ENOENT")) {
      throw textWriteError("internal_failure", "Text internal file cleanup failed", "write_failed");
    }
  }
}

function temporaryPath(parentRealPath: string, randomName: string, role: string): string {
  return join(parentRealPath, `.robothree-wfw-${role}-${randomName}.tmp`);
}

function mediaTypeFor(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".css")) return "text/css";
  if (lower.endsWith(".csv")) return "text/csv";
  return "text/plain";
}

function validateText(content: string): void {
  if (content.includes("\0")) {
    throw textWriteError("invalid_format", "Text content contains NUL", "invalid_arguments");
  }
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = content.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw textWriteError("invalid_format", "Text content contains an unpaired surrogate", "invalid_arguments");
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw textWriteError("invalid_format", "Text content contains an unpaired surrogate", "invalid_arguments");
    }
  }
}

function requireOnlyKeys(object: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(object).some((key) => !allowed.has(key))) {
    throw textWriteError("invalid_format", "Text write options contain unknown fields", "invalid_arguments");
  }
}

function requireEnum<const T extends string>(
  value: unknown,
  values: readonly T[],
  name: string,
): T {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    throw textWriteError("invalid_format", `${name} is invalid`, "invalid_arguments");
  }
  return value as T;
}

function requireBoundedString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw textWriteError("invalid_format", `${name} is invalid`, "invalid_arguments");
  }
  return value;
}

function optionalPrefixedSha256(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw textWriteError("invalid_format", `${name} is invalid`, "invalid_arguments");
  }
  return value;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DocumentCapabilityHandlerError("cancelled", "Processing was cancelled");
  }
}

function textWriteError(
  code: "invalid_format" | "limit_exceeded" | "internal_failure",
  message: string,
  detailCode:
    | "invalid_arguments"
    | "invalid_path"
    | "path_escape"
    | "target_exists"
    | "target_missing"
    | "previous_digest_mismatch"
    | "write_failed"
    | "recovery_uncertain",
): DocumentCapabilityHandlerError {
  return new DocumentCapabilityHandlerError(
    code,
    message,
    computeErrorDigest(code, detailCode),
    detailCode,
  );
}

function prefixedSha256(bytes: Uint8Array): string {
  return `sha256:${rawSha256(bytes)}`;
}

function rawSha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isContained(root: string, target: string): boolean {
  return target === root || target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}

function stableStringifyReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = (value as Record<string, unknown>)[key];
  }
  return sorted;
}
