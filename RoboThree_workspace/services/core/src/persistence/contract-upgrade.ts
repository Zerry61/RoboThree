import {
  CONTRACT_VERSION,
  LEGACY_CONTRACT_VERSION,
  JsonValueSchema,
  TaskCheckpointSchema,
  TaskEventSchema,
} from "@robothree/contracts";
import type { JsonValue, TaskCheckpoint, TaskEvent } from "@robothree/contracts";

import { sha256CanonicalJson } from "./digest.js";

export function parsePersistedTaskCheckpoint(input: unknown): TaskCheckpoint {
  const value = JsonValueSchema.parse(input);
  if (!isJsonObject(value)) {
    throw new Error("Persisted TaskCheckpoint must be a JSON object");
  }
  if (value.schemaVersion === CONTRACT_VERSION) {
    const parsed = TaskCheckpointSchema.parse(value);
    requireStateDigest(JsonValueSchema.parse(parsed.state), parsed.stateDigest);
    return parsed;
  }
  if (value.schemaVersion !== LEGACY_CONTRACT_VERSION) {
    throw new Error(`Unsupported TaskCheckpoint Contract version ${String(value.schemaVersion)}`);
  }
  if (!("state" in value) || typeof value.stateDigest !== "string") {
    throw new Error("Legacy TaskCheckpoint is missing state or stateDigest");
  }
  requireStateDigest(value.state, value.stateDigest);
  const upgradedState = upgradeApprovalReason(value.state);
  return TaskCheckpointSchema.parse({
    ...value,
    schemaVersion: CONTRACT_VERSION,
    state: upgradedState,
    stateDigest: sha256CanonicalJson(JsonValueSchema.parse(upgradedState)),
  });
}

export function parsePersistedTaskEvent(input: unknown): TaskEvent {
  const value = JsonValueSchema.parse(input);
  if (!isJsonObject(value)) {
    throw new Error("Persisted TaskEvent must be a JSON object");
  }
  if (value.schemaVersion === CONTRACT_VERSION) {
    return TaskEventSchema.parse(value);
  }
  if (value.schemaVersion !== LEGACY_CONTRACT_VERSION) {
    throw new Error(`Unsupported TaskEvent Contract version ${String(value.schemaVersion)}`);
  }
  return TaskEventSchema.parse({
    ...value,
    schemaVersion: CONTRACT_VERSION,
    payload: upgradeApprovalReason(JsonValueSchema.parse(value.payload)),
  });
}

function upgradeApprovalReason(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(upgradeApprovalReason);
  }
  if (!isJsonObject(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    key === "reason" && child === "approval" ? "user_confirmation" : upgradeApprovalReason(child),
  ]));
}

function requireStateDigest(state: JsonValue, expected: string): void {
  if (sha256CanonicalJson(JsonValueSchema.parse(state)) !== expected) {
    throw new Error("Persisted TaskCheckpoint state digest mismatch");
  }
}

function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
