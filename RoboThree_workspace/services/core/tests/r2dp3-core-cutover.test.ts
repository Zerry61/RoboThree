import { describe, expect, it } from "vitest";

import {
  R2DP3_DESKTOP_V1ALPHA4_DEFAULT_ENABLED,
  assertR2DP3ProductionReleaseDecision,
  normalizeSubmitTurnV1Alpha4,
  projectSubmitTurnReceiptV1Alpha4,
} from "../src/index.js";

const id = (suffix: string) => `019f7447-a784-77b2-a716-${suffix}`;
const digest = `sha256:${"b".repeat(64)}`;

describe("R2D-P.3 Core cutover", () => {
  it("keeps the production release decision code-owned and disabled", () => {
    expect(R2DP3_DESKTOP_V1ALPHA4_DEFAULT_ENABLED).toBe(false);
    expect(() => assertR2DP3ProductionReleaseDecision()).not.toThrow();
  });

  it("normalizes v1alpha4 explicitly into the existing R2D default path", () => {
    const normalized = normalizeSubmitTurnV1Alpha4({
      contractVersion: "v1alpha4",
      commandId: id("000000000201"),
      correlationId: id("000000000202"),
      clientInstanceId: id("000000000203"),
      type: "submit_turn",
      clientTurnId: "turn:normalized",
      sessionId: "session.desktop-test",
      userInput: "继续",
      selectionRequest: {
        agentId: "agent.general",
        selectedSkillIds: [],
        selectedKnowledgeIds: [],
        authorizationPreference: {
          schemaVersion: "v1alpha1",
          requestedMode: "manual_review",
        },
        reasoningPreference: { requestedMode: "default" },
      },
    });
    expect(normalized.contractVersion).toBe("v1alpha3");
    expect(normalized.selectionRequest.reasoningPreference).toEqual({
      requestedMode: "default",
    });
    expect(normalized.selectionRequest.requestedModelId).toBeUndefined();
  });

  it("uses one projector for submit and status replay and omits internal reasoning identity", () => {
    const projected = projectSubmitTurnReceiptV1Alpha4({
      contractVersion: "v1alpha3",
      submitTurnCommandId: id("000000000201"),
      clientTurnId: "turn:normalized",
      userMessageId: "message.user-1",
      taskId: "task.task-1",
      runtimeSelectionId: "runtime-selection.selection-1",
      status: "replayed",
      acceptedAt: "2026-08-28T00:00:00.000Z",
      runtimeSelectionSummary: {
        runtimeSelectionId: "runtime-selection.selection-1",
        digest,
        agent: { id: "agent.general", revision: digest },
        defaultModelId: "model.personal.openai",
        resolvedModel: { id: "model.personal.openai", revision: digest },
        activeSkills: [],
        allowedTools: [],
        knowledge: [],
        resolvedAuthorization: {
          requestedMode: "manual_review",
          resolvedMode: "manual_review",
          policyRevision: digest,
          source: "user_selected",
          authorizationSelectionDigest: digest,
        },
        executionSelectionDigest: digest,
        reasoning: {
          requestedMode: "default",
          resolvedMode: "model_default",
          resolutionReason: "requested_default",
          reasoningModeLockId: id("000000000204"),
          reasoningModeLockDigest: digest,
        },
      },
    });
    expect(projected.status).toBe("replayed");
    expect(JSON.stringify(projected)).not.toMatch(/defaultModelId|reasoningModeLock/u);
  });
});
