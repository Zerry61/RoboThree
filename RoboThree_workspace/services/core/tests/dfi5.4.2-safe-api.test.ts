import { describe, expect, it, vi } from "vitest";

import { DesktopApplicationFacade } from "../src/application/desktop-application-facade.js";

const correlationId = "11111111-1111-4111-8111-111111111111";
const clientInstanceId = "22222222-2222-4222-8222-222222222222";

describe("DFI-5.4.2 Core safe API", () => {
  it("projects compatibility as unavailable while the production gate is disabled", () => {
    const facade = createFacade();
    expect(facade.compatibilityV1Alpha5({
      contractVersion: "v1alpha5",
      queryId: "33333333-3333-4333-8333-333333333333",
      correlationId,
      clientInstanceId,
      supportedContractVersions: ["v1alpha5"],
    })).toMatchObject({
      ok: true,
      value: {
        selectedContractVersion: "v1alpha5",
        features: [{
          feature: "max_reasoning_mode_core",
          state: "unavailable",
          reasonCode: "production_gate_disabled",
        }],
      },
    });
  });

  it("returns a typed unavailable error without calling disabled services", async () => {
    const preview = vi.fn();
    const preference = vi.fn();
    const facade = createFacade({
      reasoningPreview: { preview } as never,
      reasoningPreferences: { get: preference } as never,
    });
    const result = await facade.getReasoningModePreferenceV1Alpha5({
      contractVersion: "v1alpha5",
      queryId: "33333333-3333-4333-8333-333333333333",
      correlationId,
      clientInstanceId,
      type: "get_reasoning_mode_preference",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "contract.feature_unavailable", category: "availability" },
    });
    expect(preview).not.toHaveBeenCalled();
    expect(preference).not.toHaveBeenCalled();
  });

  it("fails fast when an enabled graph is incomplete", () => {
    expect(() => createFacade({ dfi541MaxEnabled: true })).toThrow(
      "DFI-5.4.2 enabled graph requires Preview and Preference services",
    );
  });

  it("returns the strict preference projection from a complete test graph", async () => {
    const get = vi.fn(async () => ({
      contractVersion: "v1alpha5" as const,
      requestedMode: "max" as const,
      preferenceRevision: 9,
      preferencePersistence: "available" as const,
      testIdentityUsed: true,
      productionIdentityReady: false,
    }));
    const facade = createFacade({
      dfi541MaxEnabled: true,
      reasoningPreview: { preview: vi.fn() } as never,
      reasoningPreferences: { get, update: vi.fn() } as never,
    });
    const result = await facade.getReasoningModePreferenceV1Alpha5({
      contractVersion: "v1alpha5",
      queryId: "33333333-3333-4333-8333-333333333333",
      correlationId,
      clientInstanceId,
      type: "get_reasoning_mode_preference",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        contractVersion: "v1alpha5",
        requestedMode: "max",
        preferenceRevision: 9,
        preferencePersistence: "available",
        testIdentityUsed: true,
        productionIdentityReady: false,
      },
    });
    expect(get).toHaveBeenCalledTimes(1);
  });
});

function createFacade(overrides: Readonly<Record<string, unknown>> = {}) {
  return new DesktopApplicationFacade({
    clock: { now: () => "2026-08-28T00:00:00.000Z" },
    runtimeInstanceId: "runtime:test",
    coreVersion: "0.0.0-dfi.5.4.2",
    runtimeStatus: () => "ready",
    workspaceSelections: {} as never,
    workspaces: {} as never,
    sessions: {} as never,
    conversations: {} as never,
    catalog: {} as never,
    selectionContexts: {} as never,
    submitTurns: {} as never,
    coordination: {} as never,
    ...overrides,
  });
}
