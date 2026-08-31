import { describe, expect, it, vi } from "vitest";

import { DesktopV1Alpha5IpcRouter } from "../src/main/desktop-v1alpha5-ipc-router.js";
import type { CorePrivateClient } from "../src/main/core-private-client.js";
import { DESKTOP_V1ALPHA5_IPC_CHANNELS } from "../src/shared/foundation-api.js";

const clientInstanceId = "11111111-1111-4111-8111-111111111111";
const correlationId = "33333333-3333-4333-8333-333333333333";

function compatibilityQuery() {
  return {
    contractVersion: "v1alpha5" as const,
    queryId: "22222222-2222-4222-8222-222222222222",
    correlationId,
    clientInstanceId,
    supportedContractVersions: ["v1alpha5" as const],
  };
}

function client() {
  return {
    compatibilityV1Alpha5: vi.fn(async () => ({
      ok: true as const,
      value: {
        contractVersion: "v1alpha5" as const,
        coreVersion: "test",
        selectedContractVersion: "v1alpha5" as const,
        runtimeInstanceId: "runtime:placeholder",
        transportClientInstanceId: "55555555-5555-4555-8555-555555555555",
        features: [{
          feature: "max_reasoning_mode_core" as const,
          state: "unavailable" as const,
          reasonCode: "production_gate_disabled" as const,
        }],
      },
    })),
    getReasoningModePreferenceV1Alpha5: vi.fn(async () => ({
      ok: false as const,
      error: {
        contractVersion: "v1alpha5" as const,
        code: "contract.feature_unavailable",
        category: "availability" as const,
        safeSummary: "Unavailable",
        retryable: true,
        correlationId,
      },
    })),
  } as unknown as CorePrivateClient;
}

describe("DFI-5.4.2 Main restart lease", () => {
  it("requires compatibility before business calls", async () => {
    const core = client();
    const router = new DesktopV1Alpha5IpcRouter({
      resolveConnection: () => ({
        client: core,
        runtimeInstanceId: "runtime:one",
        transportClientInstanceId: "66666666-6666-4666-8666-666666666666",
      }),
      isCurrentConnection: () => true,
    });
    const result = await router.dispatch(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.getReasoningModePreference,
      {
        contractVersion: "v1alpha5",
        queryId: "77777777-7777-4777-8777-777777777777",
        correlationId,
        clientInstanceId,
        type: "get_reasoning_mode_preference",
      },
    );
    expect(result).toMatchObject({ ok: false, error: { code: "reasoning.runtime_changed" } });
  });

  it("binds compatibility to one runtime generation", async () => {
    const core = client();
    let runtimeInstanceId = "runtime:one";
    const router = new DesktopV1Alpha5IpcRouter({
      resolveConnection: () => ({
        client: core,
        runtimeInstanceId,
        transportClientInstanceId: "66666666-6666-4666-8666-666666666666",
      }),
      isCurrentConnection: (lease) => lease.runtimeInstanceId === runtimeInstanceId,
    });
    const negotiated = await router.dispatch(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.compatibility,
      compatibilityQuery(),
    );
    expect(negotiated).toMatchObject({
      ok: true,
      value: { runtimeInstanceId: "runtime:one" },
    });
    expect(core.compatibilityV1Alpha5).toHaveBeenCalledWith(expect.objectContaining({
      clientInstanceId: "66666666-6666-4666-8666-666666666666",
    }));
    runtimeInstanceId = "runtime:two";
    const stale = await router.dispatch(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.getReasoningModePreference,
      {
        contractVersion: "v1alpha5",
        queryId: "77777777-7777-4777-8777-777777777777",
        correlationId,
        clientInstanceId,
        type: "get_reasoning_mode_preference",
      },
    );
    expect(stale).toMatchObject({ ok: false, error: { code: "reasoning.runtime_changed" } });
  });

  it("keeps the Renderer identity at Main and forwards the current transport identity", async () => {
    const core = client();
    const router = new DesktopV1Alpha5IpcRouter({
      resolveConnection: () => ({
        client: core,
        runtimeInstanceId: "runtime:one",
        transportClientInstanceId: "66666666-6666-4666-8666-666666666666",
      }),
      isCurrentConnection: () => true,
    });
    await router.dispatch(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.compatibility,
      compatibilityQuery(),
    );
    await router.dispatch(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.getReasoningModePreference,
      {
        contractVersion: "v1alpha5",
        queryId: "77777777-7777-4777-8777-777777777777",
        correlationId,
        clientInstanceId,
        type: "get_reasoning_mode_preference",
      },
    );
    expect(core.getReasoningModePreferenceV1Alpha5).toHaveBeenCalledWith(
      expect.objectContaining({
        clientInstanceId: "66666666-6666-4666-8666-666666666666",
      }),
    );
  });

  it("rejects a client reused by another webContents", async () => {
    const core = client();
    const router = new DesktopV1Alpha5IpcRouter({
      resolveConnection: () => ({
        client: core,
        runtimeInstanceId: "runtime:one",
        transportClientInstanceId: "66666666-6666-4666-8666-666666666666",
      }),
      isCurrentConnection: () => true,
    });
    await router.dispatch(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.compatibility,
      compatibilityQuery(),
      { sender: { id: 1 } } as never,
    );
    const result = await router.dispatch(
      DESKTOP_V1ALPHA5_IPC_CHANNELS.compatibility,
      compatibilityQuery(),
      { sender: { id: 2 } } as never,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "reasoning.client_mismatch" } });
  });
});
