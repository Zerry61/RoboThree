import { describe, expect, it, vi } from "vitest";

import { createDesktopApiV1Alpha5 } from "../src/preload/create-desktop-api.js";
import { DESKTOP_V1ALPHA5_IPC_CHANNELS } from "../src/shared/foundation-api.js";

const clientInstanceId = "11111111-1111-4111-8111-111111111111";
const queryId = "22222222-2222-4222-8222-222222222222";
const correlationId = "33333333-3333-4333-8333-333333333333";

describe("DFI-5.4.2 sandboxed v1alpha5 API", () => {
  it("is frozen and exposes exactly six business methods", () => {
    const api = createDesktopApiV1Alpha5(vi.fn());
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.keys(api).sort()).toEqual([
      "contractVersion",
      "getCompatibility",
      "getReasoningModePreference",
      "getSubmitTurnStatus",
      "previewReasoningMode",
      "submitTurn",
      "updateReasoningModePreference",
    ].sort());
  });

  it("uses the exact compatibility channel and strict response", async () => {
    const invoke = vi.fn(async () => ({
      ok: true,
      value: {
        contractVersion: "v1alpha5",
        coreVersion: "test",
        selectedContractVersion: "v1alpha5",
        runtimeInstanceId: "runtime:test",
        transportClientInstanceId: "44444444-4444-4444-8444-444444444444",
        features: [{
          feature: "max_reasoning_mode_core",
          state: "unavailable",
          reasonCode: "production_gate_disabled",
        }],
      },
    }));
    const api = createDesktopApiV1Alpha5(invoke);
    const result = await api.getCompatibility({
      contractVersion: "v1alpha5",
      queryId,
      correlationId,
      clientInstanceId,
      supportedContractVersions: ["v1alpha5"],
    });
    expect(result.ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.compatibility,
      expect.objectContaining({ clientInstanceId }),
    );
  });

  it("rejects extra fields in Main result envelopes", async () => {
    const api = createDesktopApiV1Alpha5(async () => ({
      ok: false,
      error: {
        contractVersion: "v1alpha5",
        code: "contract.feature_unavailable",
        category: "availability",
        safeSummary: "Unavailable",
        retryable: true,
        correlationId,
      },
      internal: "forbidden",
    }));
    await expect(api.getReasoningModePreference({
      contractVersion: "v1alpha5",
      queryId,
      correlationId,
      clientInstanceId,
      type: "get_reasoning_mode_preference",
    })).rejects.toThrow("invalid v1alpha5 error envelope");
  });
});
