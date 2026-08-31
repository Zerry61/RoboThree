import { describe, expect, it, vi } from "vitest";

import { createDesktopApiV1Alpha4 } from "../src/preload/create-desktop-api.js";
import { DESKTOP_V1ALPHA4_IPC_CHANNELS } from "../src/shared/foundation-api.js";

const id = (suffix: string) => `019f7447-a784-77b2-a716-${suffix}`;

describe("Desktop v1alpha4 sandboxed API", () => {
  it("exposes exactly compatibility, submit and status query with strict parsing", async () => {
    const invoke = vi.fn(async (channel: string) => ({
      ok: true,
      value: channel === DESKTOP_V1ALPHA4_IPC_CHANNELS.compatibility
        ? {
          contractVersion: "v1alpha4",
          coreVersion: "test",
          selectedContractVersion: "v1alpha4",
          runtimeInstanceId: "runtime.test",
          transportClientInstanceId: id("000000000301"),
          features: [{
            feature: "r2d_submit_turn_default",
            state: "unavailable",
            reasonCode: "production_gate_disabled",
          }],
        }
        : undefined,
    }));
    const api = createDesktopApiV1Alpha4(invoke);
    expect(Object.keys(api).sort()).toEqual([
      "contractVersion",
      "getCompatibility",
      "querySubmitTurn",
      "submitTurn",
    ]);
    const result = await api.getCompatibility({
      contractVersion: "v1alpha4",
      queryId: id("000000000302"),
      correlationId: id("000000000303"),
      clientInstanceId: id("000000000304"),
      supportedContractVersions: ["v1alpha4"],
    });
    expect(result.ok && result.value.features[0]?.state).toBe("unavailable");
  });
});
