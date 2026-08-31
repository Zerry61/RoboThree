import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ActionSchema,
  CONTRACT_VERSION,
  EffectAttemptSchema,
  PersistenceSchemaVersion,
  TaskCapabilityLockSchema,
} from "@robothree/contracts";
import {
  TEXT_FILE_WRITE_CAPABILITY_ID,
  TEXT_FILE_WRITE_LIMITS_REVISION,
} from "@robothree/document-worker";
import { describe, expect, it } from "vitest";

import {
  DocumentWorkerToolBackend,
  FakeClock,
  WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR,
  WORKSPACE_TEXT_TOOL_BINDING,
  WORKSPACE_TEXT_TOOL_DEFINITION,
  calculateWorkspaceTextArtifactProofDigest,
  workspaceTextPostconditionToEffectQueryResult,
} from "../src/index.js";
import type { DocumentWorkerBackendError } from "../src/index.js";

const now = "2026-08-31T08:00:00.000Z";
const id = (tail: string) => `019f9990-0000-7000-8000-${tail.padStart(12, "0")}`;
const digest = (character: string) => `sha256:${character.repeat(64)}`;
const limits = {
  maxFileBytes: 262_144,
  maxOutputBytes: 262_144,
  maxPageCount: 1,
  maxDecompressionRatio: 1,
};

describe("WFW-2 Core text write activation", () => {
  it("keeps the owned Artifact proof in one named canonical digest domain", () => {
    const material = {
      sessionId: id("71"),
      sourceTaskId: id("72"),
      sourceObservationId: id("73"),
      artifactId: `artifact:${"a".repeat(64)}`,
      capabilityRevision: digest("b"),
      workspaceGrantId: id("74"),
      relativePath: "site/index.html",
      sourceFileSha256: digest("c"),
      artifactLifecycleRevision: 0,
    };
    const first = calculateWorkspaceTextArtifactProofDigest(material);
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(calculateWorkspaceTextArtifactProofDigest({
      ...material,
      artifactLifecycleRevision: 1,
    })).not.toBe(first);
  });

  it("registers one strict model-facing capability with an independent query_then_retry descriptor", () => {
    expect(WORKSPACE_TEXT_TOOL_DEFINITION).toMatchObject({
      capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID,
      kind: "tool",
      tool: {
        readOnlyHint: false,
        risk: { staticFacts: ["routine_file"] },
        inputSchema: {
          additionalProperties: false,
          required: ["relativePath", "content"],
        },
      },
    });
    expect(WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR).toMatchObject({
      adapterDescriptorId: "adapter.tool.workspace-text-document-worker",
      effectRecoveryMode: "query_then_retry",
      maxConcurrency: 1,
    });
    const serialized = JSON.stringify(WORKSPACE_TEXT_TOOL_DEFINITION.tool.inputSchema);
    expect(serialized).not.toContain("workspaceRoot");
    expect(serialized).not.toContain("workspaceGrantId");
    expect(serialized).not.toContain("ownedArtifactProofDigest");
    expect(serialized).not.toContain("idempotencyKey");
  });

  it("uses one child for the existing owner and WFW handle and enforces shared single-flight", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "robothree-wfw2-shared-"));
    await mkdir(join(workspace, "out"));
    const backend = new DocumentWorkerToolBackend({
      adapterDescriptorId: "adapter.tool.document-worker",
      adapterDescriptorRevision: digest("a"),
      clock: new FakeClock(now),
    });
    const handle = backend.createTextWriteHandle({
      adapterDescriptorId: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
      adapterDescriptorRevision: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.revision,
    });
    try {
      await backend.start();
      const pid = backend.processIdentity();
      expect(pid).toBeTypeOf("number");
      expect(handle.processIdentity()).toBe(pid);

      const first = handle.execute(request(workspace, "out/first.html", "<h1>first</h1>", "1"), new AbortController().signal);
      const second = handle.execute(request(workspace, "out/second.md", "second", "2"), new AbortController().signal);
      const settled = await Promise.allSettled([first, second]);
      expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = settled.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({
        status: "rejected",
        reason: expect.objectContaining<DocumentWorkerBackendError>({
          code: "document_worker.concurrent_execution",
        }),
      });
      expect(backend.processIdentity()).toBe(pid);
      expect(handle.processIdentity()).toBe(pid);
    } finally {
      await backend.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("inspects recovered success without creating a second child", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "robothree-wfw2-recovery-"));
    await mkdir(join(workspace, "out"));
    const backend = new DocumentWorkerToolBackend({
      adapterDescriptorId: "adapter.tool.document-worker",
      adapterDescriptorRevision: digest("b"),
      clock: new FakeClock(now),
    });
    const handle = backend.createTextWriteHandle({
      adapterDescriptorId: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
      adapterDescriptorRevision: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.revision,
    });
    const toolRequest = request(workspace, "out/index.html", "<main>ready</main>", "3");
    try {
      await expect(handle.execute(toolRequest, new AbortController().signal))
        .resolves.toMatchObject({ outcome: "succeeded" });
      const pid = backend.processIdentity();
      await expect(backend.inspectTextWritePostcondition({
        request: toolRequest,
        adapterDescriptorId: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
        adapterDescriptorRevision: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.revision,
      })).resolves.toMatchObject({
        decision: "recovered_success",
        output: {
          status: "replayed",
          relativePath: "out/index.html",
        },
      });
      expect(backend.processIdentity()).toBe(pid);
    } finally {
      await backend.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("converts safe_retry exactly to the existing not_found result", () => {
    const action = ActionSchema.parse({
      actionId: id("41"),
      kind: TEXT_FILE_WRITE_CAPABILITY_ID,
      payload: {},
    });
    const attempt = EffectAttemptSchema.parse({
      schemaVersion: PersistenceSchemaVersion,
      effectAttemptId: id("42"),
      taskId: id("43"),
      runId: id("44"),
      stepId: id("45"),
      actionId: action.actionId,
      idempotencyKey: "workspace-text:task:call",
      executorCapability: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
      recoveryMode: "query_then_retry",
      status: "prepared",
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });
    expect(workspaceTextPostconditionToEffectQueryResult({
      postcondition: {
        type: "text_write_postcondition",
        protocolVersion: "v1alpha2",
        requestId: id("46"),
        actionId: action.actionId,
        effectAttemptId: attempt.effectAttemptId,
        decision: "safe_retry",
      },
      attempt,
      action,
      observedAt: now,
    })).toEqual({ outcome: "not_found" });
  });
});

function request(workspaceRoot: string, relativePath: string, content: string, tail: string) {
  return {
    lock: TaskCapabilityLockSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      lockId: id(`10${tail}`),
      taskId: id(`20${tail}`),
      registryRevision: digest("c"),
      definitionSnapshot: WORKSPACE_TEXT_TOOL_DEFINITION,
      bindingSnapshot: WORKSPACE_TEXT_TOOL_BINDING,
      adapterDescriptorSnapshot: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR,
      lockedAt: now,
    }),
    action: ActionSchema.parse({
      actionId: id(`30${tail}`),
      kind: TEXT_FILE_WRITE_CAPABILITY_ID,
      payload: {
        workspaceRoot,
        workspaceGrantId: id(`40${tail}`),
        relativePath,
        content,
        mode: "create_new",
        limitsRevision: TEXT_FILE_WRITE_LIMITS_REVISION,
        limits,
      },
    }),
    effectAttemptId: id(`50${tail}`),
    idempotencyKey: `workspace-text:${tail}`,
    requestedAt: now,
    deadlineAt: new Date(Date.now() + 30_000).toISOString(),
  };
}
