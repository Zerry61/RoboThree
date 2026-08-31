import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
  DOCUMENT_WORKER_PROTOCOL_VERSION,
  DocumentCapabilityRouter,
  TEXT_FILE_WRITE_CAPABILITY_ID,
  TEXT_FILE_WRITE_LIMITS_REVISION,
  computeTextFileWriteRequestDigest,
  inspectTextFileWritePostcondition,
  normalizeTextFileWriteRequest,
  writeTextFile,
} from "../../src/index.js";

import type {
  DocumentWorkerInvokeMessage,
  DocumentWorkerLimits,
  TextFileWriteFaultPoint,
  TextFileWriteOutput,
} from "../../src/index.js";

const LIMITS: DocumentWorkerLimits = {
  maxFileBytes: 512 * 1024,
  maxOutputBytes: 512 * 1024,
  maxPageCount: 10,
  maxDecompressionRatio: 10,
};
const IDEMPOTENCY_KEY = "wfw-1-test-idempotency";
const WORKSPACE_GRANT_ID = "workspace-grant-wfw-test";
const OWNED_ARTIFACT_PROOF = digest("owned-artifact-proof");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true,
  })));
});

describe("WFW-1 private text file writer", () => {
  it("creates exact UTF-8 bytes without BOM and derives safe output metadata", async () => {
    const root = await workspace("reports");
    const content = "标题\r\nRoboThree 🚀\n";
    const result = await invokeWrite(root, "reports/index.html", content);
    const output = result.output as TextFileWriteOutput;

    expect(output).toEqual({
      status: "created",
      relativePath: "reports/index.html",
      mode: "create_new",
      sha256: digest(content),
      byteSize: Buffer.byteLength(content, "utf8"),
      mediaType: "text/html",
      backupCreated: false,
      warnings: [],
    });
    expect(await readFile(join(root, "reports/index.html"))).toEqual(Buffer.from(content, "utf8"));
    expect((await stat(join(root, "reports/index.html"))).mode & 0o777).toBe(0o600);
    expect(await internalEntries(join(root, "reports"))).toEqual([]);
  });

  it.each([
    ["guide.md", "text/markdown"],
    ["data.json", "application/json"],
    ["style.css", "text/css"],
    ["rows.csv", "text/csv"],
    ["notes.txt", "text/plain"],
  ])("derives %s as %s", async (relativePath, mediaType) => {
    const root = await workspace();
    const result = await invokeWrite(root, relativePath, "content");
    expect(result.output).toMatchObject({ relativePath, mediaType });
  });

  it("rejects NUL, unpaired surrogates, unknown options, and UTF-8 byte overflow", () => {
    expect(() => normalized("bad\0text")).toThrow(expect.objectContaining({
      detailCode: "invalid_arguments",
    }));
    expect(() => normalized("\ud800")).toThrow(expect.objectContaining({
      detailCode: "invalid_arguments",
    }));
    expect(() => normalizeTextFileWriteRequest("out.txt", {
      ...createOptions("ok"),
      extra: true,
    }, LIMITS)).toThrow(expect.objectContaining({ detailCode: "invalid_arguments" }));
    expect(() => normalized("界".repeat(100_000))).toThrow(expect.objectContaining({
      code: "limit_exceeded",
    }));
    expect(() => normalizeTextFileWriteRequest("revision.txt", {
      ...createOptions("content"),
      limitsRevision: "workspace-text.v999",
    }, LIMITS)).toThrow(expect.objectContaining({
      code: "invalid_format",
      detailCode: "invalid_arguments",
    }));
  });

  it.each([
    "/absolute.txt",
    "C:/drive.txt",
    "../escape.txt",
    "folder/../escape.txt",
    "folder\\escape.txt",
    "https://example.test/file.txt",
    ".hidden",
    "folder/.hidden/file.txt",
    "file.txt.prev",
    "folder//file.txt",
  ])("rejects unsafe target path %s", async (relativePath) => {
    const root = await workspace("folder");
    await expect(invokeWrite(root, relativePath, "content")).rejects.toMatchObject({
      detailCode: "invalid_path",
    });
  });

  it("rejects missing, symlinked, and non-directory parents", async () => {
    const root = await workspace();
    await expect(invokeWrite(root, "missing/out.txt", "content")).rejects.toMatchObject({
      detailCode: "invalid_path",
    });

    await mkdir(join(root, "real"));
    await symlink(join(root, "real"), join(root, "linked"));
    await expect(invokeWrite(root, "linked/out.txt", "content")).rejects.toMatchObject({
      detailCode: "invalid_path",
    });

    await writeFile(join(root, "plain"), "not-a-directory");
    await expect(invokeWrite(root, "plain/out.txt", "content")).rejects.toMatchObject({
      detailCode: "invalid_path",
    });
  });

  it("never clobbers an existing or concurrently-created target", async () => {
    const root = await workspace();
    await writeFile(join(root, "existing.txt"), "original");
    await expect(invokeWrite(root, "existing.txt", "replacement")).rejects.toMatchObject({
      detailCode: "target_exists",
    });
    expect(await readFile(join(root, "existing.txt"), "utf8")).toBe("original");

    await expect(invokeWrite(root, "race.txt", "ours", {
      dependencies: {
        link: async (_temp, target) => {
          await writeFile(target, "external");
          const error = new Error("exists") as NodeJS.ErrnoException;
          error.code = "EEXIST";
          throw error;
        },
      },
    })).rejects.toMatchObject({ detailCode: "target_exists" });
    expect(await readFile(join(root, "race.txt"), "utf8")).toBe("external");
  });

  it("replaces only an exact prior digest and retains one exact .prev backup", async () => {
    const root = await workspace();
    const first = (await invokeWrite(root, "index.html", "old")).output as TextFileWriteOutput;
    await writeFile(join(root, "index.html.prev"), "older-backup");

    const replaced = (await invokeReplace(
      root,
      "index.html",
      "new",
      first.sha256,
    )).output as TextFileWriteOutput;

    expect(replaced).toMatchObject({
      status: "replaced",
      mode: "replace_existing",
      sha256: digest("new"),
      previousSha256: digest("old"),
      backupCreated: true,
    });
    expect(await readFile(join(root, "index.html"), "utf8")).toBe("new");
    expect(await readFile(join(root, "index.html.prev"), "utf8")).toBe("old");
    expect(existsSync(join(root, "index.html.prev.prev"))).toBe(false);
    expect(await internalEntries(root)).toEqual([]);
  });

  it("leaves target and prior backup unchanged on a stale digest", async () => {
    const root = await workspace();
    await writeFile(join(root, "note.txt"), "current");
    await writeFile(join(root, "note.txt.prev"), "prior-backup");

    await expect(invokeReplace(
      root,
      "note.txt",
      "new",
      digest("stale"),
    )).rejects.toMatchObject({ detailCode: "previous_digest_mismatch" });
    expect(await readFile(join(root, "note.txt"), "utf8")).toBe("current");
    expect(await readFile(join(root, "note.txt.prev"), "utf8")).toBe("prior-backup");
  });

  it("requires private ownership proof for replace and forbids it for create", async () => {
    const root = await workspace();
    await writeFile(join(root, "note.txt"), "old");
    const missingProof = replaceOptions("new", digest("old"));
    delete missingProof.ownedArtifactProofDigest;
    await expect(invokeRaw(root, "note.txt", missingProof)).rejects.toMatchObject({
      detailCode: "invalid_arguments",
    });
    expect(await readFile(join(root, "note.txt"), "utf8")).toBe("old");

    await expect(invokeRaw(root, "new.txt", {
      ...createOptions("new"),
      ownedArtifactProofDigest: OWNED_ARTIFACT_PROOF,
    })).rejects.toMatchObject({ detailCode: "invalid_arguments" });
    expect(existsSync(join(root, "new.txt"))).toBe(false);
  });

  it("rejects symlink and hard-link replacement targets and backups", async () => {
    const root = await workspace();
    await writeFile(join(root, "source.txt"), "old");
    await symlink(join(root, "source.txt"), join(root, "symlink.txt"));
    await expect(invokeReplace(root, "symlink.txt", "new", digest("old"))).rejects.toMatchObject({
      detailCode: "invalid_path",
    });

    await link(join(root, "source.txt"), join(root, "hardlink.txt"));
    await expect(invokeReplace(root, "source.txt", "new", digest("old"))).rejects.toMatchObject({
      detailCode: "invalid_path",
    });

    const cleanRoot = await workspace();
    await writeFile(join(cleanRoot, "target.txt"), "old");
    await writeFile(join(cleanRoot, "backup-source"), "backup");
    await link(join(cleanRoot, "backup-source"), join(cleanRoot, "target.txt.prev"));
    await expect(invokeReplace(cleanRoot, "target.txt", "new", digest("old"))).rejects.toMatchObject({
      detailCode: "invalid_path",
    });
    expect(await readFile(join(cleanRoot, "target.txt"), "utf8")).toBe("old");
  });

  it("verifies request digest before touching the workspace", async () => {
    const root = await workspace();
    await expect(writeTextFile({
      workspaceRoot: root,
      relativePath: "out.txt",
      options: createOptions("content"),
      limits: LIMITS,
      idempotencyKey: IDEMPOTENCY_KEY,
      requestDigest: "0".repeat(64),
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ detailCode: "invalid_arguments" });
    expect(await readdir(root)).toEqual([]);
  });

  it("cleans a dead process lock and rejects a live process lock", async () => {
    const root = await workspace();
    await writeFile(join(root, "note.txt"), "old");
    const lockPath = targetLockPath(root, "note.txt");
    await writeFile(lockPath, "99999999\n", { mode: 0o600 });
    await invokeReplace(root, "note.txt", "new", digest("old"), {
      dependencies: { processAlive: () => false },
    });
    expect(await readFile(join(root, "note.txt"), "utf8")).toBe("new");
    expect(existsSync(lockPath)).toBe(false);

    await writeFile(lockPath, `${process.pid}\n`, { mode: 0o600 });
    await expect(invokeReplace(root, "note.txt", "newer", digest("new"))).rejects.toMatchObject({
      detailCode: "write_failed",
    });
    expect(await readFile(join(root, "note.txt"), "utf8")).toBe("new");
  });

  it("classifies the four decision-relevant crash windows", async () => {
    const beforeRoot = await workspace();
    await expect(invokeWrite(beforeRoot, "before.txt", "new", {
      dependencies: faultAt("beforeTemporaryFileCreation"),
    })).rejects.toMatchObject({ detailCode: "write_failed" });
    await expect(inspectCreate(beforeRoot, "before.txt", "new")).resolves.toEqual({
      decision: "not_found",
    });

    const fsyncedRoot = await workspace();
    await expect(invokeWrite(fsyncedRoot, "fsynced.txt", "new", {
      dependencies: faultAt("afterTemporaryFileFsyncBeforePublication"),
    })).rejects.toMatchObject({ detailCode: "write_failed" });
    await expect(inspectCreate(fsyncedRoot, "fsynced.txt", "new")).resolves.toEqual({
      decision: "not_found",
    });
    expect(await internalEntries(fsyncedRoot)).toEqual([]);

    const publishedRoot = await workspace();
    await expect(invokeWrite(publishedRoot, "published.txt", "new", {
      dependencies: faultAt("afterTargetPublicationBeforeObservation"),
    })).rejects.toMatchObject({ detailCode: "write_failed" });
    await expect(inspectCreate(publishedRoot, "published.txt", "new")).resolves.toMatchObject({
      decision: "recovered_success",
      targetSha256: digest("new"),
    });

    const ambiguousRoot = await workspace();
    await writeFile(join(ambiguousRoot, "replace.txt"), "old");
    await expect(invokeReplace(
      ambiguousRoot,
      "replace.txt",
      "new",
      digest("old"),
      {
        dependencies: {
          fault: async (point) => {
            if (point === "replacementEvidenceAmbiguous") {
              await writeFile(join(ambiguousRoot, "replace.txt"), "external");
              throw new Error("simulated crash");
            }
          },
        },
      },
    )).rejects.toMatchObject({ detailCode: "write_failed" });
    await expect(inspectReplace(
      ambiguousRoot,
      "replace.txt",
      "new",
      digest("old"),
    )).resolves.toEqual({ decision: "unknown" });
  });

  it("classifies replacement as safe retry before publication and recovered success after it", async () => {
    const retryRoot = await workspace();
    await writeFile(join(retryRoot, "note.txt"), "old");
    await expect(invokeReplace(
      retryRoot,
      "note.txt",
      "new",
      digest("old"),
      { dependencies: faultAt("afterTemporaryFileFsyncBeforePublication") },
    )).rejects.toMatchObject({ detailCode: "write_failed" });
    await expect(inspectReplace(retryRoot, "note.txt", "new", digest("old"))).resolves.toMatchObject({
      decision: "safe_retry",
      targetSha256: digest("old"),
    });

    const successRoot = await workspace();
    await writeFile(join(successRoot, "note.txt"), "old");
    await expect(invokeReplace(
      successRoot,
      "note.txt",
      "new",
      digest("old"),
      { dependencies: faultAt("afterTargetPublicationBeforeObservation") },
    )).rejects.toMatchObject({ detailCode: "write_failed" });
    await expect(inspectReplace(successRoot, "note.txt", "new", digest("old"))).resolves.toMatchObject({
      decision: "recovered_success",
      targetSha256: digest("new"),
      backupSha256: digest("old"),
    });
  });

  it("cancels before filesystem access and keeps content/path out of safe errors", async () => {
    const root = await workspace();
    const controller = new AbortController();
    controller.abort();
    const secretMarker = "WFW_SECRET_MARKER";
    const rejection = invokeWrite(root, "secret-name.txt", secretMarker, {
      signal: controller.signal,
    }).catch((error: unknown) => error);
    const error = await rejection as Error & { digest?: string };
    expect(error).toMatchObject({ code: "cancelled" });
    expect(JSON.stringify(error)).not.toContain(secretMarker);
    expect(JSON.stringify(error)).not.toContain("secret-name.txt");
    expect(await readdir(root)).toEqual([]);
  });

  it("routes only the exact private capability and keeps final writes out of Core/Main/Renderer", async () => {
    const root = await workspace();
    const invoke = workerInvoke(root, "router.html", "<main>ok</main>");
    const result = await new DocumentCapabilityRouter().invoke({
      invoke,
      signal: new AbortController().signal,
    });
    expect(result.output).toMatchObject({ status: "created", mediaType: "text/html" });

    await expect(new DocumentCapabilityRouter().invoke({
      invoke: {
        ...workerInvoke(root, "public.html", "public"),
        protocolVersion: DOCUMENT_WORKER_PROTOCOL_VERSION,
      },
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      code: "unsupported_feature",
      detailCode: "private_protocol_required",
    });

    const source = readFileSync(
      new URL("../../src/text/text-file-write.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/writeFile\s*\(\s*(target|targetPath)/u);
    expect(source).not.toContain("child_process");
    expect(source).not.toContain("fetch(");
  });
});

async function workspace(...directories: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "robothree-wfw1-"));
  tempRoots.push(root);
  for (const directory of directories) await mkdir(join(root, directory), { recursive: true });
  return root;
}

function createOptions(content: string): Record<string, unknown> {
  return {
    content,
    mode: "create_new",
    workspaceGrantId: WORKSPACE_GRANT_ID,
    limitsRevision: TEXT_FILE_WRITE_LIMITS_REVISION,
  };
}

function replaceOptions(content: string, expectedPreviousSha256: string): Record<string, unknown> {
  return {
    content,
    mode: "replace_existing",
    expectedPreviousSha256,
    ownedArtifactProofDigest: OWNED_ARTIFACT_PROOF,
    workspaceGrantId: WORKSPACE_GRANT_ID,
    limitsRevision: TEXT_FILE_WRITE_LIMITS_REVISION,
  };
}

function normalized(content: string) {
  return normalizeTextFileWriteRequest("out.txt", createOptions(content), LIMITS);
}

async function invokeWrite(
  root: string,
  relativePath: string,
  content: string,
  overrides: Partial<Parameters<typeof writeTextFile>[0]> = {},
) {
  return invokeRaw(root, relativePath, createOptions(content), overrides);
}

async function invokeReplace(
  root: string,
  relativePath: string,
  content: string,
  expectedPreviousSha256: string,
  overrides: Partial<Parameters<typeof writeTextFile>[0]> = {},
) {
  return invokeRaw(root, relativePath, replaceOptions(content, expectedPreviousSha256), overrides);
}

async function invokeRaw(
  root: string,
  relativePath: string,
  options: Record<string, unknown>,
  overrides: Partial<Parameters<typeof writeTextFile>[0]> = {},
) {
  const normalizedRequest = normalizeTextFileWriteRequest(relativePath, options, LIMITS);
  return writeTextFile({
    workspaceRoot: root,
    relativePath,
    options,
    limits: LIMITS,
    idempotencyKey: IDEMPOTENCY_KEY,
    requestDigest: computeTextFileWriteRequestDigest({
      idempotencyKey: IDEMPOTENCY_KEY,
      workspaceGrantId: normalizedRequest.options.workspaceGrantId,
      relativePath: normalizedRequest.relativePath,
      mode: normalizedRequest.options.mode,
      contentSha256: normalizedRequest.contentSha256,
      ...(normalizedRequest.options.expectedPreviousSha256 === undefined
        ? {}
        : { expectedPreviousSha256: normalizedRequest.options.expectedPreviousSha256 }),
      ...(normalizedRequest.options.ownedArtifactProofDigest === undefined
        ? {}
        : { ownedArtifactProofDigest: normalizedRequest.options.ownedArtifactProofDigest }),
      limitsRevision: normalizedRequest.options.limitsRevision,
    }),
    signal: new AbortController().signal,
    ...overrides,
  });
}

function workerInvoke(
  root: string,
  relativePath: string,
  content: string,
): DocumentWorkerInvokeMessage {
  const options = createOptions(content);
  const normalizedRequest = normalizeTextFileWriteRequest(relativePath, options, LIMITS);
  return {
    type: "invoke",
    protocolVersion: DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
    requestId: "request-wfw",
    actionId: "action-wfw",
    effectAttemptId: "attempt-wfw",
    capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID,
    workspaceRoot: root,
    relativePath,
    options,
    limits: LIMITS,
    deadlineAt: new Date(Date.now() + 30_000).toISOString(),
    idempotencyKey: IDEMPOTENCY_KEY,
    requestDigest: computeTextFileWriteRequestDigest({
      idempotencyKey: IDEMPOTENCY_KEY,
      workspaceGrantId: WORKSPACE_GRANT_ID,
      relativePath: normalizedRequest.relativePath,
      mode: "create_new",
      contentSha256: normalizedRequest.contentSha256,
      limitsRevision: TEXT_FILE_WRITE_LIMITS_REVISION,
    }),
  };
}

function faultAt(point: TextFileWriteFaultPoint) {
  return {
    fault: (candidate: TextFileWriteFaultPoint) => {
      if (candidate === point) throw new Error(`simulated crash at ${point}`);
    },
  };
}

function inspectCreate(root: string, relativePath: string, content: string) {
  return inspectTextFileWritePostcondition({
    workspaceRoot: root,
    relativePath,
    options: createOptions(content),
    limits: LIMITS,
  });
}

function inspectReplace(
  root: string,
  relativePath: string,
  content: string,
  expectedPreviousSha256: string,
) {
  return inspectTextFileWritePostcondition({
    workspaceRoot: root,
    relativePath,
    options: replaceOptions(content, expectedPreviousSha256),
    limits: LIMITS,
  });
}

async function internalEntries(directory: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => name.startsWith(".robothree-wfw-"));
}

function targetLockPath(root: string, relativePath: string): string {
  const lockDigest = createHash("sha256").update(relativePath).digest("hex").slice(0, 24);
  return join(root, `.robothree-wfw-${lockDigest}.lock`);
}

function digest(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
