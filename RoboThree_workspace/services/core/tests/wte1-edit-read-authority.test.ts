import {
  JsonValueSchema,
  PersistenceSchemaVersion,
  TaskRunStateSchema,
  type Action,
  type Observation,
  type TaskRunState,
} from "@robothree/contracts";
import { TEXT_FILE_READ_CAPABILITY_ID } from "@robothree/document-worker";
import { describe, expect, it } from "vitest";

import {
  assertWorkspaceTextEditAttemptCanWrite,
  assertWorkspaceTextPathIsExplicitlyRequested,
  deriveWorkspaceTextEditReadProof,
  sha256CanonicalJson,
  type PersistedTask,
  type TaskPersistence,
} from "../src/index.js";

const at = "2026-09-01T12:00:00.000Z";
const later = "2026-09-01T12:01:00.000Z";
const id = (value: number) =>
  `019fa001-0000-7000-8000-${String(value).padStart(12, "0")}`;
const digest = (character: string) => `sha256:${character.repeat(64)}`;
const grantId = "workspace.grant-wte1";
const relativePath = "notes.md";

describe("WTE-1 current edit read authority", () => {
  it("allows only a path explicitly named or attachment-bound in the current user goal", async () => {
    const named = task([], `请修改 ${relativePath}`);
    await expect(assertWorkspaceTextPathIsExplicitlyRequested({
      taskId: named.head.taskId,
      relativePath,
      tasks: persistence(named),
    })).resolves.toBeUndefined();

    const discovered = task([], "请整理这个工作区");
    await expect(assertWorkspaceTextPathIsExplicitlyRequested({
      taskId: discovered.head.taskId,
      relativePath,
      tasks: persistence(discovered),
    })).rejects.toThrow("workspace.file.policy_denied");
  });

  it("derives a private proof from the latest successful read in the current Task/user turn", async () => {
    const current = task([readStep(20, digest("a")), readStep(30, digest("b"))]);
    const proof = await deriveWorkspaceTextEditReadProof({
      taskId: current.head.taskId,
      workspaceGrantId: grantId,
      relativePath,
      expectedPreviousSha256: digest("b"),
      tasks: persistence(current),
    });

    expect(proof).toMatchObject({
      taskId: current.head.taskId,
      sourceUserMessageId: id(90),
      sourceActionId: id(31),
      sourceObservationId: id(32),
      workspaceGrantId: grantId,
      relativePath,
      sha256: digest("b"),
    });
    expect(JSON.stringify(proof)).not.toContain("latest private content");
  });

  it("rejects a stale digest instead of falling back to an older read", async () => {
    const current = task([readStep(20, digest("a")), readStep(30, digest("b"))]);
    await expect(deriveWorkspaceTextEditReadProof({
      taskId: current.head.taskId,
      workspaceGrantId: grantId,
      relativePath,
      expectedPreviousSha256: digest("a"),
      tasks: persistence(current),
    })).rejects.toThrow("workspace_text_read.proof_not_current");
  });

  it("rejects a proof from another workspace or another relative path", async () => {
    const current = task([readStep(20, digest("a"))]);
    await expect(deriveWorkspaceTextEditReadProof({
      taskId: current.head.taskId,
      workspaceGrantId: "workspace.other",
      relativePath,
      expectedPreviousSha256: digest("a"),
      tasks: persistence(current),
    })).rejects.toThrow("workspace_text_read.workspace_authority_mismatch");
    await expect(deriveWorkspaceTextEditReadProof({
      taskId: current.head.taskId,
      workspaceGrantId: grantId,
      relativePath: "other.md",
      expectedPreviousSha256: digest("a"),
      tasks: persistence(current),
    })).rejects.toThrow("workspace_text_read.proof_missing");
  });

  it("fails closed without the exact user-turn binding or read capability lock", async () => {
    const current = task([readStep(20, digest("a"))]);
    const noBinding = persistence(current);
    noBinding.loadSubmitTurnBindingByTaskId = async () => undefined;
    await expect(deriveWorkspaceTextEditReadProof({
      taskId: current.head.taskId,
      workspaceGrantId: grantId,
      relativePath,
      expectedPreviousSha256: digest("a"),
      tasks: noBinding,
    })).rejects.toThrow("workspace_text_read.user_turn_not_found");

    const noLock = persistence(current);
    noLock.loadTaskCapabilityLock = async () => undefined;
    await expect(deriveWorkspaceTextEditReadProof({
      taskId: current.head.taskId,
      workspaceGrantId: grantId,
      relativePath,
      expectedPreviousSha256: digest("a"),
      tasks: noLock,
    })).rejects.toThrow("workspace_text_read.capability_lock_missing");
  });

  it("requires a new exact read after the first conflict and stops after the second", async () => {
    const firstConflict = task([
      readStep(20, digest("a"), 1),
      failedWriteStep(40, 2),
    ]);
    await expect(deriveWorkspaceTextEditReadProof({
      taskId: firstConflict.head.taskId,
      workspaceGrantId: grantId,
      relativePath,
      expectedPreviousSha256: digest("a"),
      tasks: persistence(firstConflict),
    })).rejects.toThrow("workspace_text_read.rebase_read_required");

    const secondConflict = task([
      readStep(20, digest("a"), 1),
      failedWriteStep(40, 2),
      readStep(50, digest("b"), 3),
      failedWriteStep(60, 4),
      readStep(70, digest("c"), 5),
    ]);
    await expect(assertWorkspaceTextEditAttemptCanWrite({
      taskId: secondConflict.head.taskId,
      relativePath,
      tasks: persistence(secondConflict),
    })).rejects.toThrow("workspace.file.content_changed_repeated");
  });
});

function task(
  steps: readonly TaskRunState["runs"][number]["steps"][number][],
  goal = "edit workspace text",
): PersistedTask {
  const taskId = id(10);
  const state = TaskRunStateSchema.parse({
    taskId,
    sessionId: id(11),
    agentDefinition: { agentDefinitionId: "agent.general", version: "1.0.0" },
    goal,
    status: "completed",
    revision: 2,
    runs: [{
      runId: id(12),
      attempt: 1,
      status: "succeeded",
      steps,
      startedAt: at,
      updatedAt: later,
      endedAt: later,
    }],
    createdAt: at,
    updatedAt: later,
    endedAt: later,
  });
  return {
    head: {
      schemaVersion: PersistenceSchemaVersion,
      taskId,
      initializationDigest: sha256CanonicalJson(JsonValueSchema.parse({ taskId })),
      stateRevision: state.revision,
      lastEventSequence: 2,
      latestCheckpointId: id(13),
      status: state.status,
      updatedAt: state.updatedAt,
    },
    checkpoint: {
      schemaVersion: PersistenceSchemaVersion,
      checkpointId: id(13),
      taskId,
      stateRevision: state.revision,
      lastEventSequence: 2,
      state,
      stateDigest: sha256CanonicalJson(JsonValueSchema.parse(state)),
      createdAt: later,
    },
  };
}

function readStep(
  tail: number,
  sha256: string,
  sequence = tail === 20 ? 1 : 2,
): TaskRunState["runs"][number]["steps"][number] {
  const action: Action = {
    actionId: id(tail + 1),
    kind: TEXT_FILE_READ_CAPABILITY_ID,
    payload: { relativePath },
  };
  const observation: Extract<Observation, { outcome: "succeeded" }> = {
    observationId: id(tail + 2),
    actionId: action.actionId,
    observedAt: new Date(Date.parse(at) + tail * 1000).toISOString(),
    outcome: "succeeded",
    output: JsonValueSchema.parse({
      status: "succeeded",
      result: {
        relativePath,
        content: tail === 30 ? "latest private content" : "old private content",
        mediaType: "text/markdown",
        byteSize: 22,
        sha256,
      },
      metadata: { originalCount: 1, returnedCount: 1, truncated: false },
    }),
  };
  return {
    stepId: id(tail),
    sequence,
    status: "succeeded",
    planRevision: {
      executionPlanId: id(tail + 3),
      planRevisionId: id(tail + 4),
      revision: 1,
    },
    action,
    observation,
    startedAt: at,
    updatedAt: observation.observedAt,
    endedAt: observation.observedAt,
  };
}

function failedWriteStep(
  tail: number,
  sequence: number,
): TaskRunState["runs"][number]["steps"][number] {
  const action: Action = {
    actionId: id(tail + 1),
    kind: "tool.workspace.file.write_text",
    payload: {
      relativePath,
      content: "replacement",
      mode: "replace_existing",
      expectedPreviousSha256: digest("a"),
    },
  };
  return {
    stepId: id(tail),
    sequence,
    status: "failed",
    planRevision: {
      executionPlanId: id(tail + 3),
      planRevisionId: id(tail + 4),
      revision: 1,
    },
    action,
    observation: {
      observationId: id(tail + 2),
      actionId: action.actionId,
      observedAt: new Date(Date.parse(at) + tail * 1000).toISOString(),
      outcome: "failed",
      error: {
        code: "workspace.file.content_changed",
        category: "validation",
        message: "The file changed",
        retryable: true,
        details: { detailCode: "workspace.file.content_changed" },
      },
    },
    terminalError: {
      code: "workspace.file.content_changed",
      category: "validation",
      message: "The file changed",
      retryable: true,
      details: { detailCode: "workspace.file.content_changed" },
    },
    startedAt: at,
    updatedAt: new Date(Date.parse(at) + tail * 1000).toISOString(),
    endedAt: new Date(Date.parse(at) + tail * 1000).toISOString(),
  };
}

function persistence(current: PersistedTask): TaskPersistence {
  return {
    loadTask: async (taskId: string) => taskId === current.head.taskId ? current : undefined,
    loadSubmitTurnBindingByTaskId: async () => ({ userMessageId: id(90) }),
    loadReadableTaskRuntimeSelection: async () => ({ workspaceGrantId: grantId }),
    loadTaskCapabilityLock: async () => ({ definitionSnapshot: { revision: digest("c") } }),
  } as unknown as TaskPersistence;
}
