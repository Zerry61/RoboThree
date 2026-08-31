import { describe, expect, it, vi } from "vitest";

import type { CorePrivateConnectionLease } from "../src/main/core-private-supervisor.js";
import { DesktopV1Alpha4IpcRouter } from "../src/main/desktop-v1alpha4-ipc-router.js";
import { DESKTOP_V1ALPHA4_IPC_CHANNELS } from "../src/shared/foundation-api.js";

const id = (suffix: string) => `019f7447-a784-77b2-a716-${suffix}`;

function lease() {
  return {
    runtimeInstanceId: "runtime.test",
    transportClientInstanceId: id("000000000401"),
    client: {
      compatibilityV1Alpha4: vi.fn(async () => ({
        ok: true as const,
        value: {
          contractVersion: "v1alpha4" as const,
          coreVersion: "test",
          selectedContractVersion: "v1alpha4" as const,
          runtimeInstanceId: "runtime.test",
          transportClientInstanceId: id("000000000000"),
          features: [{
            feature: "r2d_submit_turn_default" as const,
            state: "available" as const,
            reasonCode: "ready" as const,
          }],
        },
      })),
    },
  } as unknown as CorePrivateConnectionLease;
}

describe("Desktop v1alpha4 Main router", () => {
  it("projects the exact transport lease and rejects a late old-runtime response", async () => {
    const current = lease();
    let currentLease = true;
    const router = new DesktopV1Alpha4IpcRouter({
      resolveConnection: () => current,
      isCurrentConnection: () => currentLease,
    });
    const query = {
      contractVersion: "v1alpha4" as const,
      queryId: id("000000000402"),
      correlationId: id("000000000403"),
      clientInstanceId: id("000000000404"),
      supportedContractVersions: ["v1alpha4" as const],
    };
    const first = await router.dispatch(
      DESKTOP_V1ALPHA4_IPC_CHANNELS.compatibility,
      query,
    );
    expect(first.ok && (first.value as { transportClientInstanceId: string })
      .transportClientInstanceId).toBe(current.transportClientInstanceId);
    currentLease = false;
    const late = await router.dispatch(
      DESKTOP_V1ALPHA4_IPC_CHANNELS.compatibility,
      { ...query, queryId: id("000000000405") },
    );
    expect(late).toMatchObject({ ok: false, error: { code: "runtime_changed" } });
  });
});
