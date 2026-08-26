import { describe, expect, it } from "vitest";

import {
  DesktopDeliveryRecordSchema,
  PersistedSubmitTurnReceiptSchema,
  SubmitTurnRecordSchema,
} from "../src/index.js";

const id = (suffix: string) =>
  `019f9000-0000-7000-8000-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const at = "2026-07-26T16:00:00.000Z";

function validRecord() {
  return {
    schemaVersion: "v1alpha1",
    submitTurnCommandId: id("1"),
    clientTurnId: "client-turn-0001",
    desktopSessionId: `session:${id("2")}`,
    internalSessionId: id("2"),
    requestDigest: digest("1"),
    selectionRequest: {
      agentId: "agent.general",
      selectedSkillIds: ["skill.claude"],
      selectedKnowledgeIds: [],
    },
    lockedAgent: {
      agentDefinitionId: "agent.general",
      revision: digest("2"),
      digest: digest("2"),
    },
    registryRevision: digest("3"),
    platformPromptRevision: digest("4"),
    plannedSelectionDigest: digest("5"),
    capabilityLockIds: [id("3")],
    internalUserMessageId: id("4"),
    internalTaskId: id("5"),
    internalRuntimeSelectionId: id("6"),
    initialCheckpointId: id("7"),
    status: "accepted",
    createdAt: at,
    updatedAt: at,
  } as const;
}

describe("DCF-1.1C SubmitTurn coordination contracts", () => {
  it("accepts only the recovery facts and rejects user content or Runtime handles", () => {
    expect(SubmitTurnRecordSchema.safeParse(validRecord()).success).toBe(true);
    for (const forbidden of [
      { userInput: "secret body" },
      { runtimeHandle: { pid: 1234 } },
      { credentialRef: "keychain://secret" },
      { taskState: { status: "created" } },
    ]) {
      expect(SubmitTurnRecordSchema.safeParse({
        ...validRecord(),
        ...forbidden,
      }).success).toBe(false);
    }
  });

  it("enforces exact Agent, unique lock and terminal-state invariants", () => {
    expect(SubmitTurnRecordSchema.safeParse({
      ...validRecord(),
      lockedAgent: {
        ...validRecord().lockedAgent,
        digest: digest("9"),
      },
    }).success).toBe(false);
    expect(SubmitTurnRecordSchema.safeParse({
      ...validRecord(),
      capabilityLockIds: [id("3"), id("3")],
    }).success).toBe(false);
    expect(SubmitTurnRecordSchema.safeParse({
      ...validRecord(),
      status: "failed_terminal",
    }).success).toBe(false);
    expect(SubmitTurnRecordSchema.safeParse({
      ...validRecord(),
      loopStartedAt: at,
    }).success).toBe(false);
  });

  it("keeps persisted receipt internals out of the public delivery record", () => {
    expect(PersistedSubmitTurnReceiptSchema.safeParse({
      submitTurnCommandId: id("1"),
      clientTurnId: "client-turn-0001",
      userMessageId: `message:${id("4")}`,
      taskId: `task:${id("5")}`,
      runtimeSelectionId: `runtime-selection:${id("6")}`,
      status: "rejected",
      acceptedAt: at,
      requestDigest: digest("1"),
      completedAt: at,
      terminalError: {
        code: "selection.agent_unavailable",
        category: "configuration",
        message: "Agent unavailable",
        retryable: false,
      },
    }).success).toBe(true);
    expect(DesktopDeliveryRecordSchema.safeParse({
      schemaVersion: "v1alpha1",
      deliveryId: id("8"),
      sequence: 1,
      submitTurnCommandId: id("1"),
      type: "turn.rejected",
      sessionId: `session:${id("2")}`,
      createdAt: at,
      requestDigest: digest("1"),
    }).success).toBe(false);
  });
});
