import {
  JsonValueSchema,
  PersistenceSchemaVersion,
  TaskRunStateSchema,
  type Action,
  type Observation,
  type TaskRunState,
} from "@robothree/contracts";
import { TEXT_FILE_WRITE_CAPABILITY_ID } from "@robothree/document-worker";
import { describe, expect, it, vi } from "vitest";

import {
  deriveWorkspaceTextArtifactProof,
  sha256CanonicalJson,
  type PersistedTask,
  type TaskPersistence,
} from "../src/index.js";
import type { ArtifactLifecyclePersistence } from
  "../src/ports/desktop-foundation-persistence.js";

const at = "2026-08-31T10:00:00.000Z";
const later = "2026-08-31T10:01:00.000Z";
const id = (value: number) =>
  `019f9991-0000-7000-8000-${String(value).padStart(12, "0")}`;
const digest = (character: string) => `sha256:${character.repeat(64)}`;
const sessionId = id(2);
const grantA = "workspace.grant-a";
const grantB = "workspace.grant-b";
const relativePath = "site/index.html";
const sourceSha = digest("a");

describe("WFW-3 repair.2 durable WorkspaceGrant authority", () => {
  it("derives the owned head from the source Task readable selection without a private grant in the Step", async () => {
    const source = task(10, [wfwStep(20)]);
    const loadReadable = vi.fn(async (taskId: string) =>
      taskId === source.head.taskId ? { workspaceGrantId: grantA } : undefined);
    const proof = await deriveWorkspaceTextArtifactProof({
      taskId: source.head.taskId,
      workspaceGrantId: grantA,
      relativePath,
      expectedPreviousSha256: sourceSha,
      tasks: persistence(source, [source], loadReadable),
      artifactLifecycles: artifactLifecycles(),
    });

    expect(proof).toMatchObject({
      sourceTaskId: source.head.taskId,
      sourceObservationId: id(22),
      sourceFileSha256: sourceSha,
    });
    expect(loadReadable).toHaveBeenCalledWith(source.head.taskId);
    expect(JSON.stringify(source)).not.toContain("workspaceGrantId");
    expect(JSON.stringify(proof)).not.toContain(grantA);
  });

  it("rejects a source Task whose exact readable WorkspaceGrant differs", async () => {
    const source = task(10, [wfwStep(20)]);
    await expect(deriveWorkspaceTextArtifactProof({
      taskId: source.head.taskId,
      workspaceGrantId: grantA,
      relativePath,
      expectedPreviousSha256: sourceSha,
      tasks: persistence(source, [source], async () => ({
        workspaceGrantId: grantB,
      })),
      artifactLifecycles: artifactLifecycles(),
    })).rejects.toThrow("workspace_text.artifact_head_mismatch");
  });

  it("fails closed when a matching source Task has no readable WorkspaceGrant authority", async () => {
    const source = task(10, [wfwStep(20)]);
    await expect(deriveWorkspaceTextArtifactProof({
      taskId: source.head.taskId,
      workspaceGrantId: grantA,
      relativePath,
      expectedPreviousSha256: sourceSha,
      tasks: persistence(source, [source], async () => undefined),
      artifactLifecycles: artifactLifecycles(),
    })).rejects.toThrow("workspace_text.artifact_head_mismatch");
  });

  it("does not consult authority for unrelated WFW relative paths", async () => {
    const unrelated = task(40, [wfwStep(50, "other/page.html", digest("b"))]);
    const source = task(10, [wfwStep(20)]);
    const loadReadable = vi.fn(async (taskId: string) =>
      taskId === source.head.taskId ? { workspaceGrantId: grantA } : undefined);

    await expect(deriveWorkspaceTextArtifactProof({
      taskId: source.head.taskId,
      workspaceGrantId: grantA,
      relativePath,
      expectedPreviousSha256: sourceSha,
      tasks: persistence(source, [unrelated, source], loadReadable),
      artifactLifecycles: artifactLifecycles(),
    })).resolves.toMatchObject({ sourceTaskId: source.head.taskId });
    expect(loadReadable).not.toHaveBeenCalledWith(unrelated.head.taskId);
  });
});

function task(
  tail: number,
  steps: readonly TaskRunState["runs"][number]["steps"][number][],
): PersistedTask {
  const taskId = id(tail);
  const state = TaskRunStateSchema.parse({
    taskId,
    sessionId,
    agentDefinition: { agentDefinitionId: "agent.general", version: "1.0.0" },
    goal: "write workspace text",
    status: "completed",
    revision: 2,
    runs: steps.length === 0 ? [] : [{
      runId: id(tail + 1),
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
      initializationDigest: sha256CanonicalJson(JsonValueSchema.parse({
        taskId,
        goal: state.goal,
        agentDefinition: state.agentDefinition,
        createdAt: state.createdAt,
      })),
      stateRevision: state.revision,
      lastEventSequence: 2,
      latestCheckpointId: id(tail + 2),
      status: state.status,
      updatedAt: state.updatedAt,
    },
    checkpoint: {
      schemaVersion: PersistenceSchemaVersion,
      checkpointId: id(tail + 2),
      taskId,
      stateRevision: state.revision,
      lastEventSequence: 2,
      state,
      stateDigest: sha256CanonicalJson(JsonValueSchema.parse(state)),
      createdAt: later,
    },
  };
}

function wfwStep(
  tail: number,
  path: string = relativePath,
  sha256: string = sourceSha,
): TaskRunState["runs"][number]["steps"][number] {
  const action: Action = {
    actionId: id(tail + 1),
    kind: TEXT_FILE_WRITE_CAPABILITY_ID,
    payload: {
      relativePath: path,
      content: "<main>private content</main>",
      mode: "create_new",
    },
  };
  const observation: Extract<Observation, { outcome: "succeeded" }> = {
    observationId: id(tail + 2),
    actionId: action.actionId,
    observedAt: later,
    outcome: "succeeded",
    output: JsonValueSchema.parse({
      status: "succeeded",
      result: {
        status: "created",
        relativePath: path,
        mode: "create_new",
        sha256,
        byteSize: 28,
        mediaType: "text/html",
        backupCreated: false,
        warnings: [],
      },
      metadata: {
        originalCount: 1,
        returnedCount: 1,
        truncated: false,
        resultDigest: "c".repeat(64),
        timingMs: 1,
      },
    }),
  };
  return {
    stepId: id(tail),
    sequence: 1,
    status: "succeeded",
    planRevision: {
      executionPlanId: id(tail + 3),
      planRevisionId: id(tail + 4),
      revision: 1,
    },
    action,
    observation,
    startedAt: at,
    updatedAt: later,
    endedAt: later,
  };
}

function persistence(
  current: PersistedTask,
  sessionTasks: readonly PersistedTask[],
  loadReadableTaskRuntimeSelection: (taskId: string) => Promise<unknown>,
): TaskPersistence {
  return {
    loadTask: async (taskId: string) => taskId === current.head.taskId ? current : undefined,
    listTasksBySession: async () => sessionTasks,
    loadReadableTaskRuntimeSelection,
    loadTaskCapabilityLock: async () => ({
      definitionSnapshot: { revision: digest("d") },
    }),
  } as unknown as TaskPersistence;
}

function artifactLifecycles(): ArtifactLifecyclePersistence {
  return {
    loadArtifactLifecycle: async () => undefined,
  } as unknown as ArtifactLifecyclePersistence;
}
