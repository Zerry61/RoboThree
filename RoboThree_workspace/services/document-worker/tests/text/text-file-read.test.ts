import { createHash } from "node:crypto";
import { link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
  DOCUMENT_WORKER_PROTOCOL_VERSION,
  DocumentCapabilityRouter,
  TEXT_FILE_READ_CAPABILITY_ID,
  readTextFile,
} from "../../src/index.js";

import type {
  DocumentWorkerInvokeMessage,
  DocumentWorkerLimits,
  TextFileReadOutput,
} from "../../src/index.js";

const LIMITS: DocumentWorkerLimits = {
  maxFileBytes: 256 * 1024,
  maxOutputBytes: 256 * 1024,
  maxPageCount: 1,
  maxDecompressionRatio: 1,
};
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WTE-1A private workspace text reader", () => {
  it("returns the exact UTF-8 content, digest, size, path and media type", async () => {
    const root = await workspace();
    const content = "# RoboThree\r\n连续编辑 🚀\n";
    await writeFile(join(root, "notes.md"), content);

    const result = await invoke(root, "notes.md");
    expect(result.output).toEqual({
      relativePath: "notes.md",
      content,
      mediaType: "text/markdown",
      byteSize: Buffer.byteLength(content),
      sha256: digest(content),
    });
    expect(result.metadata.truncated).toBe(false);
  });

  it.each([
    ["index.html", "text/html"],
    ["style.css", "text/css"],
    ["app.ts", "text/typescript"],
    ["data.json", "application/json"],
    ["config.yaml", "application/yaml"],
    ["query.sql", "text/plain"],
  ])("projects %s as %s", async (relativePath, mediaType) => {
    const root = await workspace();
    await writeFile(join(root, relativePath), "content");
    await expect(invoke(root, relativePath)).resolves.toMatchObject({
      output: { relativePath, mediaType },
    });
  });

  it.each([
    "/absolute.txt",
    "C:/drive.txt",
    "../escape.txt",
    "folder/../escape.txt",
    "folder\\escape.txt",
    "https://example.test/a.txt",
    ".env",
    ".github/workflow.yml",
    "folder/.hidden.txt",
  ])("rejects unsafe relative path %s", async (relativePath) => {
    const root = await workspace("folder");
    await expect(invoke(root, relativePath)).rejects.toMatchObject({
      detailCode: "workspace.file.invalid_path",
    });
  });

  it("rejects a symlink and a hard-linked file", async () => {
    const root = await workspace();
    await writeFile(join(root, "target.txt"), "target");
    await symlink(join(root, "target.txt"), join(root, "linked.txt"));
    await expect(invoke(root, "linked.txt")).rejects.toMatchObject({
      detailCode: "workspace.file.symlink_rejected",
    });
    await link(join(root, "target.txt"), join(root, "hard.txt"));
    await expect(invoke(root, "hard.txt")).rejects.toMatchObject({
      detailCode: "workspace.file.not_regular_file",
    });
  });

  it("rejects invalid UTF-8, NUL content and files above the hard limit without truncation", async () => {
    const root = await workspace();
    await writeFile(join(root, "invalid.txt"), Buffer.from([0xc3, 0x28]));
    await expect(invoke(root, "invalid.txt")).rejects.toMatchObject({
      detailCode: "workspace.file.invalid_utf8",
    });
    await writeFile(join(root, "binary.txt"), Buffer.from("a\0b"));
    await expect(invoke(root, "binary.txt")).rejects.toMatchObject({
      detailCode: "workspace.file.not_text",
    });
    await writeFile(join(root, "large.txt"), Buffer.alloc(256 * 1024 + 1, 0x61));
    await expect(invoke(root, "large.txt")).rejects.toMatchObject({
      code: "limit_exceeded",
      detailCode: "workspace.file.too_large",
    });
  });

  it("retries one observed read race and returns only the stable latest version", async () => {
    const root = await workspace();
    const target = join(root, "race.txt");
    await writeFile(target, "A");
    const result = await readTextFile({
      workspaceRoot: root,
      relativePath: "race.txt",
      options: {},
      limits: LIMITS,
      signal: new AbortController().signal,
      dependencies: {
        afterBytesRead: async (attempt) => {
          if (attempt === 0) await writeFile(target, "BBBB");
        },
      },
    });
    expect(result.output).toMatchObject({ content: "BBBB", sha256: digest("BBBB") });
  });

  it("fails closed when both bounded attempts observe a changing file", async () => {
    const root = await workspace();
    const target = join(root, "race.txt");
    await writeFile(target, "A");
    await expect(readTextFile({
      workspaceRoot: root,
      relativePath: "race.txt",
      options: {},
      limits: LIMITS,
      signal: new AbortController().signal,
      dependencies: {
        afterBytesRead: async (attempt) => writeFile(target, attempt === 0 ? "BB" : "CCC"),
      },
    })).rejects.toMatchObject({ detailCode: "workspace.file.changed_during_read" });
  });

  it("requires the private protocol and rejects model-controlled read options", async () => {
    const root = await workspace();
    await writeFile(join(root, "notes.txt"), "notes");
    await expect(invoke(root, "notes.txt", DOCUMENT_WORKER_PROTOCOL_VERSION)).rejects.toMatchObject({
      detailCode: "private_protocol_required",
    });
    await expect(invoke(root, "notes.txt", DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION, {
      maxBytes: 1,
    })).rejects.toMatchObject({ detailCode: "workspace.file.invalid_arguments" });
  });

  it("never logs the read content while returning it only in the private result", async () => {
    const root = await workspace();
    const secretSentinel = "WTE_PRIVATE_CONTENT_SENTINEL";
    await writeFile(join(root, "notes.txt"), secretSentinel);
    const result = await invoke(root, "notes.txt");
    expect((result.output as TextFileReadOutput).content).toBe(secretSentinel);
    expect(JSON.stringify(result.metadata)).not.toContain(secretSentinel);
  });
});

async function workspace(...directories: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "robothree-wte1-"));
  roots.push(root);
  for (const directory of directories) await mkdir(join(root, directory), { recursive: true });
  return root;
}

async function invoke(
  workspaceRoot: string,
  relativePath: string,
  protocolVersion: DocumentWorkerInvokeMessage["protocolVersion"] = DOCUMENT_WORKER_PRIVATE_PROTOCOL_VERSION,
  options: Record<string, unknown> = {},
) {
  const controller = new AbortController();
  return new DocumentCapabilityRouter().invoke({
    invoke: {
      type: "invoke",
      protocolVersion,
      requestId: "request-wte1",
      actionId: "action-wte1",
      effectAttemptId: "effect-wte1",
      capabilityId: TEXT_FILE_READ_CAPABILITY_ID,
      workspaceRoot,
      relativePath,
      options,
      limits: LIMITS,
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    },
    signal: controller.signal,
  });
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
