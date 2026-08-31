import { describe, expect, it, vi } from "vitest";

import {
  ReasoningModeAdapter,
  ReasoningModeAdapterError,
} from "../src/renderer/adapters/reasoning-mode-adapter.js";
import type {
  RoboThreeDesktopApiV1Alpha5,
  RoboThreeDesktopTaskReasoningApiV1Alpha1,
} from "../src/shared/foundation-api.js";

const digest = `sha256:${"a".repeat(64)}` as const;
const modelId = "model:test";

describe("DFI-5.4.3 reasoning mode adapter", () => {
  it("keeps Max unavailable when the frozen feature gate is disabled", async () => {
    const adapter = new ReasoningModeAdapter({
      api: apiFixture("unavailable"),
      taskApi: undefined,
    });
    await expect(adapter.negotiate()).resolves.toMatchObject({
      state: "unavailable",
      reasonCode: "production_gate_disabled",
    });
  });

  it("submits default without a Max observation", async () => {
    const api = apiFixture("available");
    const submit = vi.mocked(api.submitTurn);
    const adapter = new ReasoningModeAdapter({ api, taskApi: undefined });
    await adapter.negotiate();
    await adapter.submitTask({
      commandId: crypto.randomUUID(),
      clientTurnId: `turn:${crypto.randomUUID()}`,
      sessionId: "session:test",
      userInput: "test",
      agentId: "agent:test",
      requestedModelId: modelId,
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      workspaceGrantId: "workspace:test",
      reasoning: { requestedMode: "default" },
    });
    expect(submit.mock.calls[0]?.[0].selectionRequest.reasoningPreference)
      .toEqual({ requestedMode: "default" });
  });

  it("selects the exact Max feature instead of trusting feature order", async () => {
    const api = apiFixture("available");
    vi.mocked(api.getCompatibility).mockResolvedValueOnce({
      ok: true,
      value: {
        contractVersion: "v1alpha5",
        coreVersion: "test",
        selectedContractVersion: "v1alpha5",
        runtimeInstanceId: "runtime:test",
        transportClientInstanceId: crypto.randomUUID(),
        features: [
          { feature: "unrelated", state: "unavailable", reasonCode: "not_ready" },
          { feature: "max_reasoning_mode_core", state: "available", reasonCode: "ready" },
        ],
      },
    } as never);
    await expect(new ReasoningModeAdapter({ api, taskApi: undefined }).negotiate())
      .resolves.toMatchObject({ state: "available", reasonCode: "ready" });
  });

  it("reuses the caller-owned preference command identity", async () => {
    const api = apiFixture("available");
    const adapter = new ReasoningModeAdapter({ api, taskApi: undefined });
    await adapter.negotiate();
    const commandId = crypto.randomUUID();
    await adapter.savePreference({ requestedMode: "max", expectedRevision: 0, commandId });
    expect(vi.mocked(api.updateReasoningModePreference).mock.calls[0]?.[0])
      .toMatchObject({ commandId, requestedMode: "max", expectedPreferenceRevision: 0 });
  });

  it("rejects Max when Preview belongs to another effective Model", async () => {
    const adapter = new ReasoningModeAdapter({
      api: apiFixture("available"),
      taskApi: undefined,
    });
    await adapter.negotiate();
    await expect(adapter.submitTask({
      commandId: crypto.randomUUID(),
      clientTurnId: `turn:${crypto.randomUUID()}`,
      sessionId: "session:test",
      userInput: "test",
      agentId: "agent:test",
      requestedModelId: modelId,
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      workspaceGrantId: "workspace:test",
      reasoning: {
        requestedMode: "max",
        preview: {
          effectiveModelId: "model:other",
          maxSupport: "supported",
          maxSupportRevision: digest,
        },
      },
    })).rejects.toBeInstanceOf(ReasoningModeAdapterError);
  });

  it("strictly consumes the independent Task reasoning read model", async () => {
    const taskApi = {
      contractVersion: "task-reasoning.v1alpha1",
      getTaskReasoningMode: vi.fn(async () => ({
        ok: true,
        value: {
          state: "legacy",
          taskId: "task:test",
          safeSummary: "该任务创建时未记录 Max 推理摘要",
        },
      })),
    } as unknown as RoboThreeDesktopTaskReasoningApiV1Alpha1;
    const adapter = new ReasoningModeAdapter({ api: apiFixture("available"), taskApi });
    await expect(adapter.loadTaskReasoning({ taskId: "task:test" }))
      .resolves.toMatchObject({ state: "legacy" });
  });
});

function apiFixture(
  state: "available" | "unavailable",
): RoboThreeDesktopApiV1Alpha5 {
  return {
    contractVersion: "v1alpha5",
    getCompatibility: vi.fn(async () => ({
      ok: true,
      value: {
        contractVersion: "v1alpha5",
        coreVersion: "test",
        selectedContractVersion: "v1alpha5",
        runtimeInstanceId: "runtime:test",
        transportClientInstanceId: crypto.randomUUID(),
        features: [{
          feature: "max_reasoning_mode_core",
          state,
          reasonCode: state === "available" ? "ready" : "production_gate_disabled",
        }],
      },
    })),
    previewReasoningMode: vi.fn(async () => ({
      ok: true,
      value: {
        effectiveModelId: modelId,
        effectiveModelRevision: digest,
        maxSupport: "supported",
        maxSupportRevision: digest,
        preference: "default",
        preferenceRevision: 0,
        preferencePersistence: "available",
        testIdentityUsed: false,
        productionIdentityReady: true,
      },
    })),
    getReasoningModePreference: vi.fn(async () => ({
      ok: true,
      value: {
        contractVersion: "v1alpha5",
        requestedMode: "default",
        preferenceRevision: 0,
        preferencePersistence: "available",
        testIdentityUsed: false,
        productionIdentityReady: true,
      },
    })),
    updateReasoningModePreference: vi.fn(async (input) => ({
      ok: true,
      value: {
        contractVersion: "v1alpha5",
        commandId: input.commandId,
        requestDigest: digest,
        expectedPreferenceRevision: input.expectedPreferenceRevision,
        committedPreferenceRevision: input.expectedPreferenceRevision + 1,
        requestedMode: input.requestedMode,
        outcome: "preference_committed",
        committedAt: "2026-08-28T00:00:00.000Z",
        receiptDigest: digest,
      },
    })),
    submitTurn: vi.fn(async (input) => ({
      ok: true,
      value: {
        contractVersion: "v1alpha5",
        submitTurnCommandId: input.commandId,
        clientTurnId: input.clientTurnId,
        userMessageId: "message:test",
        taskId: "task:test",
        runtimeSelectionId: "runtime-selection:test",
        status: "accepted",
        runtimeSelectionSummary: {
          agentId: "agent:test",
          modelId,
          reasoning: {
            requestedMode: "default",
            resolvedMode: "model_default",
            resolutionReason: "requested_default",
            reasoningModeLockId: crypto.randomUUID(),
            reasoningModeLockDigest: digest,
          },
        },
        acceptedAt: "2026-08-28T00:00:00.000Z",
      },
    })),
    getSubmitTurnStatus: vi.fn(),
  } as unknown as RoboThreeDesktopApiV1Alpha5;
}
