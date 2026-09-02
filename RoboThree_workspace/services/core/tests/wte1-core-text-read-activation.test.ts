import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ActionSchema,
  CONTRACT_VERSION,
  TaskCapabilityLockSchema,
} from "@robothree/contracts";
import {
  TEXT_FILE_READ_CAPABILITY_ID,
  TEXT_FILE_READ_LIMITS_REVISION,
  TEXT_FILE_WRITE_CAPABILITY_ID,
  TEXT_FILE_WRITE_LIMITS_REVISION,
} from "@robothree/document-worker";
import { describe, expect, it } from "vitest";

import {
  DocumentWorkerToolBackend,
  FakeClock,
  WORKSPACE_TEXT_READ_TOOL_ADAPTER_DESCRIPTOR,
  WORKSPACE_TEXT_READ_TOOL_BINDING,
  WORKSPACE_TEXT_READ_TOOL_DEFINITION,
  WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR,
  WORKSPACE_TEXT_TOOL_BINDING,
  WORKSPACE_TEXT_TOOL_DEFINITION,
} from "../src/index.js";

const now = "2026-09-01T13:00:00.000Z";
const id = (tail: string) => `019fa101-0000-7000-8000-${tail.padStart(12, "0")}`;
const digest = (character: string) => `sha256:${character.repeat(64)}`;
const limits = {
  maxFileBytes: 262_144,
  maxOutputBytes: 262_144,
  maxPageCount: 1,
  maxDecompressionRatio: 1,
};

describe("WTE-1 Core text read activation", () => {
  it("registers a strict read-only model schema without private authority fields", () => {
    expect(WORKSPACE_TEXT_READ_TOOL_DEFINITION).toMatchObject({
      capabilityId: TEXT_FILE_READ_CAPABILITY_ID,
      kind: "tool",
      tool: {
        readOnlyHint: true,
        risk: { staticFacts: ["routine_file"] },
        inputSchema: {
          additionalProperties: false,
          required: ["relativePath"],
        },
      },
    });
    const serialized = JSON.stringify(WORKSPACE_TEXT_READ_TOOL_DEFINITION.tool.inputSchema);
    expect(serialized).not.toContain("workspaceRoot");
    expect(serialized).not.toContain("workspaceGrantId");
    expect(serialized).not.toContain("taskId");
    expect(serialized).not.toContain("content");
  });

  it("uses the existing Document Worker child and returns the exact UTF-8 content", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "robothree-wte1-core-read-"));
    await writeFile(join(workspace, "notes.md"), "第一版\nsecond line\n", "utf8");
    const backend = new DocumentWorkerToolBackend({
      adapterDescriptorId: "adapter.tool.document-worker",
      adapterDescriptorRevision: digest("a"),
      clock: new FakeClock(now),
    });
    const readHandle = backend.createTextReadHandle({
      adapterDescriptorId: WORKSPACE_TEXT_READ_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
      adapterDescriptorRevision: WORKSPACE_TEXT_READ_TOOL_ADAPTER_DESCRIPTOR.revision,
    });
    const writeHandle = backend.createTextWriteHandle({
      adapterDescriptorId: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
      adapterDescriptorRevision: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.revision,
    });
    try {
      const result = await readHandle.execute(request(workspace), new AbortController().signal);
      expect(result).toMatchObject({
        outcome: "succeeded",
        output: {
          status: "succeeded",
          result: {
            relativePath: "notes.md",
            content: "第一版\nsecond line\n",
            mediaType: "text/markdown",
          },
        },
      });
      expect(readHandle.processIdentity()).toBe(backend.processIdentity());
      expect(writeHandle.processIdentity()).toBe(backend.processIdentity());
    } finally {
      await backend.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("normalizes a stale replacement digest to the WTE content_changed fact", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "robothree-wte1-conflict-"));
    await writeFile(join(workspace, "notes.md"), "external edit", "utf8");
    const backend = new DocumentWorkerToolBackend({
      adapterDescriptorId: "adapter.tool.document-worker",
      adapterDescriptorRevision: digest("d"),
      clock: new FakeClock(now),
    });
    const writeHandle = backend.createTextWriteHandle({
      adapterDescriptorId: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
      adapterDescriptorRevision: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.revision,
    });
    try {
      const result = await writeHandle.execute(
        writeRequest(workspace),
        new AbortController().signal,
      );
      expect(result).toMatchObject({
        outcome: "failed",
        error: {
          code: "workspace.file.content_changed",
          retryable: true,
          details: { detailCode: "workspace.file.content_changed" },
        },
      });
    } finally {
      await backend.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

function request(workspaceRoot: string) {
  return {
    lock: TaskCapabilityLockSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      lockId: id("10"),
      taskId: id("20"),
      registryRevision: digest("b"),
      definitionSnapshot: WORKSPACE_TEXT_READ_TOOL_DEFINITION,
      bindingSnapshot: WORKSPACE_TEXT_READ_TOOL_BINDING,
      adapterDescriptorSnapshot: WORKSPACE_TEXT_READ_TOOL_ADAPTER_DESCRIPTOR,
      lockedAt: now,
    }),
    action: ActionSchema.parse({
      actionId: id("30"),
      kind: TEXT_FILE_READ_CAPABILITY_ID,
      payload: {
        workspaceRoot,
        workspaceGrantId: id("40"),
        relativePath: "notes.md",
        limitsRevision: TEXT_FILE_READ_LIMITS_REVISION,
        limits,
      },
    }),
    effectAttemptId: id("50"),
    idempotencyKey: "workspace-text-read:1",
    requestedAt: now,
    deadlineAt: "2026-09-02T13:00:30.000Z",
  };
}

function writeRequest(workspaceRoot: string) {
  const content = "replacement";
  return {
    lock: TaskCapabilityLockSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      lockId: id("60"),
      taskId: id("61"),
      registryRevision: digest("e"),
      definitionSnapshot: WORKSPACE_TEXT_TOOL_DEFINITION,
      bindingSnapshot: WORKSPACE_TEXT_TOOL_BINDING,
      adapterDescriptorSnapshot: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR,
      lockedAt: now,
    }),
    action: ActionSchema.parse({
      actionId: id("62"),
      kind: TEXT_FILE_WRITE_CAPABILITY_ID,
      payload: {
        workspaceRoot,
        workspaceGrantId: id("63"),
        relativePath: "notes.md",
        content,
        mode: "replace_existing",
        expectedPreviousSha256: digest("f"),
        editReadProofDigest: digest("1"),
        limitsRevision: TEXT_FILE_WRITE_LIMITS_REVISION,
        limits,
      },
    }),
    effectAttemptId: id("64"),
    idempotencyKey: "workspace-text-write:conflict",
    requestedAt: now,
    deadlineAt: "2026-09-02T13:00:30.000Z",
  };
}
