import { describe, expect, it } from "vitest";

import {
  CompatibilityProjectionV1Alpha4Schema,
  SubmitTurnCommandV1Alpha4Schema,
  SubmitTurnReceiptV1Alpha4Schema,
} from "../src/desktop-local/v1alpha4/index.js";

const id = (suffix: string) => `019f7447-a784-77b2-a716-${suffix}`;
const digest = `sha256:${"a".repeat(64)}`;

describe("R2D-P.3 Desktop Local v1alpha4 contracts", () => {
  it("accepts only the default-only SubmitTurn command", () => {
    const command = SubmitTurnCommandV1Alpha4Schema.parse({
      contractVersion: "v1alpha4",
      commandId: id("000000000101"),
      correlationId: id("000000000102"),
      clientInstanceId: id("000000000103"),
      type: "submit_turn",
      clientTurnId: "turn:default-only",
      sessionId: "session.desktop-test",
      userInput: "完成当前任务",
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
    expect(command.selectionRequest.requestedModelId).toBeUndefined();
    expect(() => SubmitTurnCommandV1Alpha4Schema.parse({
      ...command,
      selectionRequest: {
        ...command.selectionRequest,
        reasoningPreference: { requestedMode: "max" },
      },
    })).toThrow();
    expect(() => SubmitTurnCommandV1Alpha4Schema.parse({
      ...command,
      observedMaxSupport: "supported",
    })).toThrow();
  });

  it("projects an exact resolved Model without legacy Agent-default authority", () => {
    const receipt = SubmitTurnReceiptV1Alpha4Schema.parse({
      contractVersion: "v1alpha4",
      submitTurnCommandId: id("000000000101"),
      clientTurnId: "turn:default-only",
      userMessageId: "message.user-1",
      taskId: "task.task-1",
      runtimeSelectionId: "runtime-selection.selection-1",
      status: "accepted",
      acceptedAt: "2026-08-28T00:00:00.000Z",
      runtimeSelectionSummary: {
        runtimeSelectionId: "runtime-selection.selection-1",
        digest,
        agent: { id: "agent.general", revision: digest },
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
      },
    });
    expect(receipt.runtimeSelectionSummary?.resolvedModel.id)
      .toBe("model.personal.openai");
    expect(JSON.stringify(receipt)).not.toContain("defaultModelId");
    expect(() => SubmitTurnReceiptV1Alpha4Schema.parse({
      ...receipt,
      runtimeSelectionSummary: {
        ...receipt.runtimeSelectionSummary,
        defaultModelId: "model.forbidden",
      },
    })).toThrow();
  });

  it("binds compatibility to runtime and transport identities", () => {
    const projection = CompatibilityProjectionV1Alpha4Schema.parse({
      contractVersion: "v1alpha4",
      coreVersion: "0.0.0-r2dp.3-pra.3",
      selectedContractVersion: "v1alpha4",
      runtimeInstanceId: "runtime.instance-1",
      transportClientInstanceId: id("000000000104"),
      features: [{
        feature: "r2d_submit_turn_default",
        state: "unavailable",
        reasonCode: "production_gate_disabled",
      }],
    });
    expect(projection.features[0]?.state).toBe("unavailable");
  });
});
