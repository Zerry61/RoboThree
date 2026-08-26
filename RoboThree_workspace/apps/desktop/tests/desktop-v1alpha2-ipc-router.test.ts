import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  DESKTOP_V1ALPHA2_IPC_CHANNELS,
} from "../src/shared/foundation-api.js";
import { DesktopV1Alpha2IpcRouter } from "../src/main/desktop-v1alpha2-ipc-router.js";
import type { CorePrivateClient } from "../src/main/core-private-client.js";
import type { CorePrivateConnectionLease } from "../src/main/core-private-supervisor.js";
import type { IpcMainInvokeEvent, WebContents } from "electron";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("DFI-1B Desktop v1alpha2 IPC router", () => {
  it("negotiates the feature and forwards a path-free directory projection", async () => {
    const client = fakeClient();
    const router = createRouter(client);
    const result = await router.dispatch(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.listWorkspaceEntries,
      listQuery(),
    );
    expect(result).toEqual({ ok: true, value: directoryProjection() });
    expect(JSON.stringify(result)).not.toContain("/private/");
  });

  it("opens an exact root once and replays the path-free receipt", async () => {
    const root = await createRoot();
    const client = fakeClient({ root });
    let callCount = 0;
    const router = createRouter(client, async (openedRoot) => {
      callCount += 1;
      expect(openedRoot).toBe(root.rootRealPath);
      return "";
    });
    const command = revealCommand();
    const [first, replay] = await Promise.all([
      router.dispatch(DESKTOP_V1ALPHA2_IPC_CHANNELS.openTaskWorkspaceLocation, command),
      router.dispatch(DESKTOP_V1ALPHA2_IPC_CHANNELS.openTaskWorkspaceLocation, command),
    ]);
    expect(first).toEqual(replay);
    expect(first).toMatchObject({ ok: true, value: { taskId: command.taskId } });
    expect(callCount).toBe(1);
    expect(JSON.stringify(first)).not.toContain(root.rootRealPath);
  });

  it("returns uncertain without a duplicate OS call and releases busy after late settle", async () => {
    const root = await createRoot();
    let settle: ((value: string) => void) | undefined;
    let callCount = 0;
    const router = createRouter(fakeClient({ root }), () => {
      callCount += 1;
      return new Promise<string>((resolve) => { settle = resolve; });
    }, 10);
    const command = revealCommand();
    const result = await router.dispatch(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.openTaskWorkspaceLocation,
      command,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "workspace.reveal_outcome_uncertain", retryable: false },
    });
    const replay = await router.dispatch(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.openTaskWorkspaceLocation,
      command,
    );
    expect(replay).toEqual(result);
    expect(callCount).toBe(1);
    expect(router.resourceSnapshot().unsettledAdapterCount).toBe(1);
    settle?.("");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.resourceSnapshot().unsettledAdapterCount).toBe(0);
  });

  it("rejects feature absence and command digest conflicts", async () => {
    const root = await createRoot();
    const router = createRouter(fakeClient({ root }), async () => "");
    const command = revealCommand();
    await router.dispatch(DESKTOP_V1ALPHA2_IPC_CHANNELS.openTaskWorkspaceLocation, command);
    const conflict = await router.dispatch(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.openTaskWorkspaceLocation,
      { ...command, taskId: `task:${randomUUID()}` },
    );
    expect(conflict).toMatchObject({
      ok: false,
      error: { code: "command.idempotency_conflict" },
    });

    const unavailable = createRouter(fakeClient({ features: [] }));
    const result = await unavailable.dispatch(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.listWorkspaceEntries,
      listQuery(),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "contract.feature_unavailable" },
    });
  });

  it("forwards Robot/Tool Catalog through the leased Core client", async () => {
    const client = fakeClient();
    const router = createRouter(client);
    const result = await router.dispatch(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.listRobotCatalog,
      listRobotCatalogQuery(),
    );
    expect(result).toEqual({ ok: true, value: robotPage() });
  });

  it("rejects Catalog caller mismatch before contacting Core", async () => {
    const counts = { compatibility: 0, listRobot: 0 };
    const client = fakeClient({
      onCompatibility: () => { counts.compatibility += 1; },
      onListRobotCatalog: () => { counts.listRobot += 1; },
    });
    const router = createRouter(client);
    const firstWindow = fakeWebContents(1, 11);
    const secondWindow = fakeWebContents(2, 22);
    router.registerCatalogWebContents(firstWindow.webContents);
    router.registerCatalogWebContents(secondWindow.webContents);

    const first = await router.dispatch(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.listRobotCatalog,
      listRobotCatalogQuery(),
      firstWindow.event,
    );
    expect(first.ok).toBe(true);
    counts.compatibility = 0;
    counts.listRobot = 0;

    const rejected = await router.dispatch(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.listRobotCatalog,
      listRobotCatalogQuery(),
      secondWindow.event,
    );
    expect(rejected).toMatchObject({
      ok: false,
      error: { code: "catalog.client_mismatch" },
    });
    expect(counts).toEqual({ compatibility: 0, listRobot: 0 });
  });

  it("fails Catalog when compatibility runtime differs from the lease", async () => {
    const router = new DesktopV1Alpha2IpcRouter({
      resolveConnection: () => lease(fakeClient({ runtimeInstanceId: "runtime.instance-dfi-3a2-new" })),
      isCurrentConnection: () => true,
      openTaskWorkspaceDirectory: async () => "",
    });
    const result = await router.dispatch(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.listToolCatalog,
      listToolCatalogQuery(),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "contract.feature_unavailable" },
    });
  });

  it("revalidates the runtime lease after Catalog operation completion", async () => {
    let current = true;
    const client = fakeClient({
      onListToolCatalog: () => { current = false; },
    });
    const router = new DesktopV1Alpha2IpcRouter({
      resolveConnection: () => lease(client),
      isCurrentConnection: () => current,
      openTaskWorkspaceDirectory: async () => "",
    });
    const result = await router.dispatch(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.listToolCatalog,
      listToolCatalogQuery(),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "catalog.runtime_changed", retryable: true },
    });
  });

  it("fails closed when Catalog caller binding capacity is exhausted", async () => {
    const counts = { compatibility: 0 };
    const router = createRouter(fakeClient({
      onCompatibility: () => { counts.compatibility += 1; },
    }));
    for (let index = 0; index < 16; index += 1) {
      const fake = fakeWebContents(index + 10, index + 100);
      router.registerCatalogWebContents(fake.webContents);
      const result = await router.dispatch(
        DESKTOP_V1ALPHA2_IPC_CHANNELS.listRobotCatalog,
        listRobotCatalogQuery(`33333333-3333-4333-8333-${String(index).padStart(12, "0")}`),
        fake.event,
      );
      expect(result.ok).toBe(true);
    }
    counts.compatibility = 0;
    const overflow = fakeWebContents(99, 199);
    router.registerCatalogWebContents(overflow.webContents);
    const result = await router.dispatch(
      DESKTOP_V1ALPHA2_IPC_CHANNELS.listRobotCatalog,
      listRobotCatalogQuery("33333333-3333-4333-8333-999999999999"),
      overflow.event,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "catalog.client_mismatch" },
    });
    expect(counts.compatibility).toBe(0);
  });
});

function createRouter(
  client: CorePrivateClient,
  openTaskWorkspaceDirectory: (rootRealPath: string) => Promise<string> = async () => "",
  openDeadlineMs = 100,
) {
  return new DesktopV1Alpha2IpcRouter({
    resolveConnection: () => lease(client),
    isCurrentConnection: () => true,
    openTaskWorkspaceDirectory,
    openDeadlineMs,
  });
}

function fakeClient(input: Readonly<{
  root?: Awaited<ReturnType<typeof createRoot>>;
  features?: readonly string[];
  runtimeInstanceId?: string;
  onCompatibility?: () => void;
  onListRobotCatalog?: () => void;
  onListToolCatalog?: () => void;
}> = {}): CorePrivateClient {
  const features = input.features ?? [
    "task_workspace_browser",
    "task_workspace_reveal",
    "robot_tool_catalog",
  ];
  return {
    compatibilityV1Alpha2: async () => {
      input.onCompatibility?.();
      return {
        ok: true,
        value: {
          contractVersion: "v1alpha2",
          coreVersion: "0.0.0-dfi.1b",
          supportedContractVersions: ["v1alpha1", "v1alpha2"],
          selectedContractVersion: "v1alpha2",
          features,
          runtimeInstanceId: input.runtimeInstanceId ?? "runtime.instance-dfi-3a2",
          activationState: "uninitialized",
          pendingRuntimeActivation: false,
          enterpriseConfigurationStatusQueryRef: "enterprise-configuration-status:current",
        },
      };
    },
    listRobotCatalogV1Alpha2: async () => {
      input.onListRobotCatalog?.();
      return { ok: true, value: robotPage() };
    },
    getRobotCatalogV1Alpha2: async () => ({ ok: true, value: robotDetail() }),
    listToolCatalogV1Alpha2: async () => {
      input.onListToolCatalog?.();
      return { ok: true, value: toolPage() };
    },
    getToolCatalogV1Alpha2: async () => ({ ok: true, value: toolDetail() }),
    listWorkspaceEntriesV1Alpha2: async () => ({ ok: true, value: directoryProjection() }),
    prepareWorkspaceRevealV1Alpha2: async () => ({
      ok: true,
      value: { authorityToken: `wra1.${"a".repeat(48)}.${"b".repeat(48)}` },
    }),
    consumeWorkspaceRevealV1Alpha2: async ({ command }: { command: ReturnType<typeof revealCommand> }) => ({
      ok: true,
      value: {
        commandId: command.commandId,
        taskId: command.taskId,
        workspaceGrantId: "workspace:11111111-1111-4111-8111-111111111111",
        root: input.root ?? {
          rootRealPath: "/unavailable",
          device: "1",
          inode: "2",
          mode: 16877,
        },
      },
    }),
  } as unknown as CorePrivateClient;
}

function lease(client: CorePrivateClient): CorePrivateConnectionLease {
  return Object.freeze({
    client,
    runtimeInstanceId: "runtime.instance-dfi-3a2",
    transportClientInstanceId: "99999999-9999-4999-8999-999999999999",
  });
}

async function createRoot() {
  const created = await mkdtemp(join(tmpdir(), "robothree-dfi1b-"));
  roots.push(created);
  const rootRealPath = await realpath(created);
  const metadata = await lstat(rootRealPath);
  return {
    rootRealPath,
    device: String(metadata.dev),
    inode: String(metadata.ino),
    mode: metadata.mode,
  };
}

function listQuery() {
  return {
    contractVersion: "v1alpha2",
    queryId: "11111111-1111-4111-8111-111111111111",
    correlationId: "22222222-2222-4222-8222-222222222222",
    clientInstanceId: "33333333-3333-4333-8333-333333333333",
    type: "list_workspace_entries",
    taskId: "task:44444444-4444-4444-8444-444444444444",
  } as const;
}

function listRobotCatalogQuery(clientInstanceId = "33333333-3333-4333-8333-333333333333") {
  return {
    contractVersion: "v1alpha2",
    queryId: "11111111-1111-4111-8111-111111111111",
    correlationId: "22222222-2222-4222-8222-222222222222",
    clientInstanceId,
    type: "list_robot_catalog",
    limit: 10,
  } as const;
}

function listToolCatalogQuery() {
  return {
    contractVersion: "v1alpha2",
    queryId: "11111111-1111-4111-8111-111111111112",
    correlationId: "22222222-2222-4222-8222-222222222222",
    clientInstanceId: "33333333-3333-4333-8333-333333333333",
    type: "list_tool_catalog",
    limit: 10,
  } as const;
}

function revealCommand() {
  return {
    contractVersion: "v1alpha2",
    commandId: "55555555-5555-4555-8555-555555555555",
    correlationId: "22222222-2222-4222-8222-222222222222",
    clientInstanceId: "33333333-3333-4333-8333-333333333333",
    type: "open_task_workspace_location",
    taskId: "task:44444444-4444-4444-8444-444444444444",
  } as const;
}

function directoryProjection() {
  return {
    contractVersion: "v1alpha2",
    workspaceGrantId: "workspace:11111111-1111-4111-8111-111111111111",
    breadcrumbDisplayNames: [],
    entries: [],
    truncated: false,
    snapshotDigest: `sha256:${"a".repeat(64)}`,
  } as const;
}

function robotPage() {
  return {
    contractVersion: "v1alpha2",
    queryRevision: `sha256:${"a".repeat(64)}`,
    items: [{
      robotId: "agent:catalog-fixture",
      configurationRevision: `sha256:${"b".repeat(64)}`,
      displayName: "Catalog fixture robot",
      description: "Safe catalog fixture.",
      source: "local_trusted",
      restrictionSummary: {
        models: "restricted_nonempty",
        skills: "restricted_empty",
        tools: "restricted_nonempty",
        knowledge: "restricted_empty",
      },
      runnable: false,
      unavailableReason: "catalog.model_unavailable",
    }],
  } as const;
}

function robotDetail() {
  return {
    ...robotPage().items[0],
    defaultModel: {
      resourceId: "model.catalog_fixture",
      displayName: "Catalog fixture model",
      availability: "unavailable",
      unavailableReason: "catalog.model_unavailable",
    },
    allowModelOverride: false,
    eligibleModels: [],
    skills: [],
    tools: [],
    knowledge: [],
  } as const;
}

function toolPage() {
  return {
    contractVersion: "v1alpha2",
    queryRevision: `sha256:${"c".repeat(64)}`,
    items: [{
      toolId: "tool.catalog_fixture",
      capabilityRevision: `sha256:${"d".repeat(64)}`,
      registryRevision: `sha256:${"e".repeat(64)}`,
      displayName: "Catalog fixture tool",
      description: "Safe catalog fixture tool.",
      source: "official_package",
      readOnly: true,
      riskSummary: ["routine_file"],
      availability: "unknown",
      unavailableReason: "catalog.availability_unknown",
    }],
  } as const;
}

function toolDetail() {
  return {
    ...toolPage().items[0],
    inputShape: "structured_object",
    outputShape: "structured_object",
  } as const;
}

function fakeWebContents(id: number, routingId: number) {
  const emitter = new EventEmitter();
  const frame = {
    routingId,
    isDestroyed: () => false,
  };
  const webContents = Object.assign(emitter, {
    id,
    mainFrame: frame,
    isDestroyed: () => false,
  }) as unknown as WebContents;
  return {
    webContents,
    event: {
      sender: webContents,
      senderFrame: frame,
    } as unknown as IpcMainInvokeEvent,
  };
}
