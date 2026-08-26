import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DesktopV1Alpha2IpcRouter } from "../src/main/desktop-v1alpha2-ipc-router.js";
import { CorePrivateSupervisor } from "../src/main/core-private-supervisor.js";
import { DESKTOP_V1ALPHA2_IPC_CHANNELS } from "../src/shared/foundation-api.js";

describe("DFI-3A.2 Desktop Main/Preload Catalog process chain", () => {
  it("routes Catalog queries through the current Core runtime lease", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dfi3a2-catalog-"));
    const supervisor = new CorePrivateSupervisor({
      entryPath: fileURLToPath(new URL(
        "../../../services/core/dist/desktop-private-main.js",
        import.meta.url,
      )),
      databasePath: join(directory, "robothree.sqlite"),
      maxUnexpectedRestarts: 0,
    });
    try {
      await supervisor.start();
      const router = new DesktopV1Alpha2IpcRouter({
        resolveConnection: () => supervisor.connectionLease(),
        isCurrentConnection: (lease) => supervisor.isCurrentConnectionLease(lease),
        openTaskWorkspaceDirectory: async () => "",
      });
      const compatibility = await router.dispatch(
        DESKTOP_V1ALPHA2_IPC_CHANNELS.compatibility,
        compatibilityQuery(supervisor.clientInstanceId),
      );
      expect(compatibility).toMatchObject({
        ok: true,
        value: {
          runtimeInstanceId: supervisor.runtimeInstanceId,
          features: expect.arrayContaining(["robot_tool_catalog"]),
        },
      });

      const robots = await router.dispatch(
        DESKTOP_V1ALPHA2_IPC_CHANNELS.listRobotCatalog,
        {
          ...catalogQuery(supervisor.clientInstanceId, "1"),
          type: "list_robot_catalog",
          limit: 10,
        },
      );
      expect(robots).toMatchObject({
        ok: true,
        value: {
          contractVersion: "v1alpha2",
          items: [expect.objectContaining({ robotId: "agent.general" })],
        },
      });

      const tools = await router.dispatch(
        DESKTOP_V1ALPHA2_IPC_CHANNELS.listToolCatalog,
        {
          ...catalogQuery(supervisor.clientInstanceId, "2"),
          type: "list_tool_catalog",
          limit: 10,
        },
      );
      expect(tools).toMatchObject({
        ok: true,
        value: { contractVersion: "v1alpha2" },
      });
      expect(JSON.stringify(tools)).not.toMatch(/credential|token|endpoint|stack/iu);
    } finally {
      await supervisor.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function compatibilityQuery(clientInstanceId: string) {
  return {
    contractVersion: "v1alpha2",
    queryId: id("01"),
    correlationId: id("02"),
    clientInstanceId,
    supportedContractVersions: ["v1alpha2", "v1alpha1"],
  } as const;
}

function catalogQuery(clientInstanceId: string, suffix: string) {
  return {
    contractVersion: "v1alpha2",
    queryId: id(`1${suffix}`),
    correlationId: id(`2${suffix}`),
    clientInstanceId,
  } as const;
}

function id(suffix: string): string {
  return `019fab77-3a20-4000-8000-${suffix.padStart(12, "0")}`;
}
