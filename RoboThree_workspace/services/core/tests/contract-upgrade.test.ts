import { JsonValueSchema, LEGACY_CONTRACT_VERSION, PersistenceSchemaVersion } from "@robothree/contracts";
import type { TaskCommand } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  createTaskRunState,
  parsePersistedTaskCheckpoint,
  reduceTaskState,
  sha256CanonicalJson,
} from "../src/index.js";

const entityId = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const at = "2026-07-22T12:00:00.000Z";

describe("v1alpha1 TaskCheckpoint read boundary", () => {
  it("upgrades approval to user_confirmation and recalculates the state digest", () => {
    const legacy = legacyWaitingCheckpoint();
    const upgraded = parsePersistedTaskCheckpoint(legacy);
    expect(upgraded.schemaVersion).toBe(PersistenceSchemaVersion);
    expect(upgraded.state.runs[0]?.steps[0]?.wait?.reason).toBe("user_confirmation");
    expect(upgraded.stateDigest).toBe(sha256CanonicalJson(JsonValueSchema.parse(upgraded.state)));
    expect(upgraded.stateDigest).not.toBe(legacy.stateDigest);
  });

  it("fails closed for unknown versions and a corrupt legacy digest", () => {
    const legacy = legacyWaitingCheckpoint();
    expect(() => parsePersistedTaskCheckpoint({ ...legacy, schemaVersion: "v9" }))
      .toThrow("Unsupported TaskCheckpoint Contract version");
    expect(() => parsePersistedTaskCheckpoint({ ...legacy, stateDigest: `sha256:${"0".repeat(64)}` }))
      .toThrow("state digest mismatch");
  });
});

function legacyWaitingCheckpoint() {
  const taskId = entityId(4701);
  let state = createTaskRunState({
    taskId,
    agentDefinition: { agentDefinitionId: entityId(4702), version: "1.0.0" },
    goal: "Upgrade a legacy waiting checkpoint",
    createdAt: at,
  });
  for (const command of commands(taskId)) {
    const reduced = reduceTaskState(state, command);
    if (!reduced.accepted) throw new Error(reduced.error.code);
    state = reduced.state;
  }
  const legacyState = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  const runs = legacyState.runs as { steps: { wait?: { reason: string } }[] }[];
  runs[0]!.steps[0]!.wait!.reason = "approval";
  return {
    schemaVersion: LEGACY_CONTRACT_VERSION,
    checkpointId: entityId(4703),
    taskId,
    stateRevision: 3,
    lastEventSequence: 3,
    parentCheckpointId: entityId(4704),
    state: legacyState,
    stateDigest: sha256CanonicalJson(JsonValueSchema.parse(legacyState)),
    createdAt: at,
  };
}

function commands(taskId: string): TaskCommand[] {
  const runId = entityId(4710);
  const stepId = entityId(4711);
  return [
    { commandId: entityId(4712), taskId, type: "start_run", issuedAt: at, runId },
    {
      commandId: entityId(4713), taskId, type: "start_step", issuedAt: at, runId, stepId,
      planRevision: { executionPlanId: entityId(4714), planRevisionId: entityId(4715), revision: 1 },
      action: { actionId: entityId(4716), kind: "tool.echo", payload: {} },
    },
    {
      commandId: entityId(4717), taskId, type: "wait_step", issuedAt: at, runId, stepId,
      reason: "user_confirmation", context: {},
    },
  ];
}
