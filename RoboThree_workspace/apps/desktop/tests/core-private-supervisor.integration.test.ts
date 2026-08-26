import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CorePrivateSupervisor } from "../src/main/core-private-supervisor.js";

describe("DCF-1.2A Electron Main CorePrivateSupervisor", () => {
  it("boots the formal Core child, performs the Contract handshake and stops", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf12a-child-"));
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
      expect(await supervisor.probe()).toMatchObject({
        fixtureOnly: false,
        runtimeState: "ready",
        coreReady: true,
        compatible: true,
      });
      expect(await supervisor.client.listAgents({
        contractVersion: "v1alpha1",
        type: "list_agents",
        queryId: "019f9400-0000-7000-8000-000000000001",
        correlationId: "019f9400-0000-7000-8000-000000000002",
        clientInstanceId: supervisor.clientInstanceId,
      })).toMatchObject({
        ok: true,
        value: [{ agentId: "agent.general", runnable: true }],
      });
      expect(await supervisor.personalCredentialBroker.execute({
        commandId: id("301"),
        commandType: "delete",
        personalModelId: "model.personal.test",
        commandRequestDigest: `sha256:${"a".repeat(64)}`,
        deadlineAt: new Date(Date.now() + 5_000).toISOString(),
      })).toMatchObject({
        header: {
          status: "rejected",
          typedErrorCode: "credential_store_unavailable",
        },
      });
    } finally {
      await supervisor.stop();
      await rm(directory, { recursive: true, force: true });
    }
    expect(supervisor.snapshot()).toMatchObject({
      runtimeState: "stopped",
      coreReady: false,
    });
  });

  it("restarts with a new runtime instance and preserves only durable SQLite facts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf13a-restart-"));
    const supervisor = new CorePrivateSupervisor({
      entryPath: fileURLToPath(new URL(
        "../../../services/core/dist/desktop-private-main.js",
        import.meta.url,
      )),
      databasePath: join(directory, "robothree.sqlite"),
      maxUnexpectedRestarts: 1,
    });
    try {
      await supervisor.start();
      const oldClient = supervisor.client;
      const before = await oldClient.runtimeStatus(query("1"));
      const selection = await oldClient.registerWorkspaceSelection({
        selectedPath: directory,
        clientInstanceId: supervisor.clientInstanceId,
        correlationId: id("2"),
      });
      expect(selection.ok).toBe(true);
      if (!selection.ok) throw new Error("selection registration failed");
      const session = await oldClient.createSession({
        contractVersion: "v1alpha1",
        type: "create_session",
        commandId: id("3"),
        correlationId: id("4"),
        clientInstanceId: supervisor.clientInstanceId,
        title: "Restart durable session",
      });
      expect(session.ok).toBe(true);

      const oldCredentialBroker = supervisor.personalCredentialBroker;
      const oldSensitiveChannel = oldCredentialBroker.channelInstanceId;

      await supervisor.restart();

      expect(supervisor.personalCredentialBroker.channelInstanceId).not.toBe(oldSensitiveChannel);
      expect(await oldCredentialBroker.execute({
        commandId: id("302"),
        commandType: "delete",
        personalModelId: "model.personal.test",
        commandRequestDigest: `sha256:${"b".repeat(64)}`,
        deadlineAt: new Date(Date.now() + 5_000).toISOString(),
      })).toMatchObject({
        header: { typedErrorCode: "credential_transport_unavailable" },
      });

      const after = await supervisor.client.runtimeStatus(query("5"));
      expect(before).toMatchObject({ ok: true });
      expect(after).toMatchObject({ ok: true });
      if (!before.ok || !after.ok) throw new Error("runtime status failed");
      expect(after.value.runtimeInstanceId)
        .not.toBe(before.value.runtimeInstanceId);
      expect(supervisor.snapshot()).toMatchObject({
        runtimeState: "ready",
        unexpectedRestartCount: 0,
      });
      await expect(oldClient.runtimeStatus(query("6"))).rejects.toThrow();

      const staleSelection = await supervisor.client.createWorkspaceGrant({
        contractVersion: "v1alpha1",
        type: "create_workspace_grant",
        commandId: id("7"),
        correlationId: id("2"),
        clientInstanceId: supervisor.clientInstanceId,
        selectionHandle: selection.value.selectionHandle,
        displayName: "Stale selection",
        accessMode: "read_write",
      });
      expect(staleSelection).toMatchObject({
        ok: false,
        error: { code: "workspace.selection_invalid" },
      });

      const sessions = await supervisor.client.listSessions({
        contractVersion: "v1alpha1",
        type: "list_sessions",
        queryId: id("8"),
        correlationId: id("9"),
        clientInstanceId: supervisor.clientInstanceId,
      });
      expect(sessions).toMatchObject({
        ok: true,
        value: [expect.objectContaining({ title: "Restart durable session" })],
      });
    } finally {
      await supervisor.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps one durable SQLite view across 25 restarts and 20 start-stop cycles", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf13b-pressure-"));
    const supervisor = new CorePrivateSupervisor({
      entryPath: fileURLToPath(new URL(
        "../../../services/core/dist/desktop-private-main.js",
        import.meta.url,
      )),
      databasePath: join(directory, "robothree.sqlite"),
      maxUnexpectedRestarts: 1,
    });
    const runtimeInstanceIds = new Set<string>();
    try {
      await supervisor.start();
      const session = await supervisor.client.createSession({
        contractVersion: "v1alpha1",
        type: "create_session",
        commandId: id("100"),
        correlationId: id("101"),
        clientInstanceId: supervisor.clientInstanceId,
        title: "DCF-1.3B pressure session",
      });
      expect(session.ok).toBe(true);
      await recordRuntimeInstance(supervisor, runtimeInstanceIds, "110");

      for (let index = 0; index < 25; index += 1) {
        await supervisor.restart();
        await recordRuntimeInstance(
          supervisor,
          runtimeInstanceIds,
          String(120 + index),
        );
      }

      for (let index = 0; index < 20; index += 1) {
        await supervisor.stop();
        expect(supervisor.snapshot().runtimeState).toBe("stopped");
        await supervisor.start();
        await recordRuntimeInstance(
          supervisor,
          runtimeInstanceIds,
          String(160 + index),
        );
      }

      expect(runtimeInstanceIds.size).toBe(46);
      expect(supervisor.snapshot()).toMatchObject({
        runtimeState: "ready",
        coreReady: true,
        unexpectedRestartCount: 0,
      });
      expect(await supervisor.client.listSessions({
        contractVersion: "v1alpha1",
        type: "list_sessions",
        queryId: id("200"),
        correlationId: id("201"),
        clientInstanceId: supervisor.clientInstanceId,
      })).toMatchObject({
        ok: true,
        value: [expect.objectContaining({ title: "DCF-1.3B pressure session" })],
      });
    } finally {
      await supervisor.stop();
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});

const id = (suffix: string) =>
  `019f9600-0000-4000-8000-${suffix.padStart(12, "0")}`;

function query(suffix: string) {
  return {
    contractVersion: "v1alpha1" as const,
    type: "runtime_status_query" as const,
    queryId: id(suffix),
    correlationId: id(`${Number.parseInt(suffix, 10) + 20}`),
    clientInstanceId: id(`${Number.parseInt(suffix, 10) + 40}`),
  };
}

async function recordRuntimeInstance(
  supervisor: CorePrivateSupervisor,
  runtimeInstanceIds: Set<string>,
  suffix: string,
): Promise<void> {
  const status = await supervisor.client.runtimeStatus(query(suffix));
  expect(status.ok).toBe(true);
  if (!status.ok) throw new Error("runtime status failed");
  runtimeInstanceIds.add(status.value.runtimeInstanceId);
}
