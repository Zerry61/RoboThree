import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import type { SubmitTurnCommand } from "@robothree/contracts";

import { CorePrivateClient } from "../../apps/desktop/src/main/core-private-client.js";
import {
  CORE_PRIVATE_ORIGIN,
  CORE_PRIVATE_ROUTES,
  createDesktopPrivateRuntime,
  type DesktopPrivateRuntime,
} from "../../services/core/src/index.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

describe("DCF-1.2A Core private HTTP/SSE and Main client", () => {
  it("runs the shared Facade through Main-only HTTP and recovers after restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf12a-"));
    const databasePath = join(directory, "robothree.sqlite");
    const workspacePath = join(directory, "workspace");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(workspacePath));
    let runtime: DesktopPrivateRuntime | undefined;
    cleanups.push(async () => {
      await runtime?.stop();
      await rm(directory, { recursive: true, force: true });
    });

    const firstToken = randomBytes(32).toString("base64url");
    runtime = createDesktopPrivateRuntime({
      databasePath,
      authorizationToken: firstToken,
    });
    await runtime.start();
    const clientInstanceId = randomUUID();
    const firstClient = new CorePrivateClient({
      baseUrl: runtime.server.baseUrl,
      authorizationToken: firstToken,
    });

    const compatibility = await firstClient.compatibility(
      query("compatibility_query", clientInstanceId),
    );
    expect(compatibility).toMatchObject({
      ok: true,
      value: {
        selectedContractVersion: "v1alpha1",
        features: expect.arrayContaining(["submit_turn", "durable_event_stream"]),
      },
    });

    const workspaceCorrelationId = randomUUID();
    const selection = await firstClient.registerWorkspaceSelection({
      selectedPath: workspacePath,
      clientInstanceId,
      correlationId: workspaceCorrelationId,
    });
    expect(selection.ok).toBe(true);
    if (!selection.ok) throw new Error("selection registration failed");
    const createWorkspace = {
      contractVersion: "v1alpha1" as const,
      type: "create_workspace_grant" as const,
      commandId: randomUUID(),
      correlationId: workspaceCorrelationId,
      clientInstanceId,
      selectionHandle: selection.value.selectionHandle,
      displayName: "DCF 1.2 Workspace",
      accessMode: "read_write" as const,
    };
    const grant = await firstClient.createWorkspaceGrant(createWorkspace);
    expect(grant).toMatchObject({
      ok: true,
      value: {
        displayName: "DCF 1.2 Workspace",
        status: "active",
      },
    });
    expect(await firstClient.createWorkspaceGrant(createWorkspace))
      .toEqual(grant);
    if (!grant.ok) throw new Error("workspace grant creation failed");

    const createSession = {
      contractVersion: "v1alpha1" as const,
      type: "create_session" as const,
      commandId: randomUUID(),
      correlationId: randomUUID(),
      clientInstanceId,
      title: "DCF-1.2A E2E",
    };
    const session = await firstClient.createSession(createSession);
    expect(session).toMatchObject({
      ok: true,
      value: { title: "DCF-1.2A E2E", tombstoned: false },
    });
    if (!session.ok) throw new Error("session creation failed");

    const agentsQuery = query("list_agents", clientInstanceId);
    const [agentsOverHttp, agentsDirect] = await Promise.all([
      firstClient.listAgents(agentsQuery),
      runtime.facade.listAgents(agentsQuery),
    ]);
    expect(agentsOverHttp).toEqual(agentsDirect);
    expect(agentsOverHttp).toMatchObject({
      ok: true,
      value: [{ agentId: "agent.general", runnable: true }],
    });

    const commandId = randomUUID();
    const submitCommand: SubmitTurnCommand = {
      contractVersion: "v1alpha1",
      type: "submit_turn",
      commandId,
      correlationId: randomUUID(),
      clientInstanceId,
      clientTurnId: `client-${randomUUID()}`,
      sessionId: session.value.sessionId,
      userInput: "Run the DCF-1.2A scripted turn",
      selectionRequest: {
        agentId: "agent.general",
        selectedSkillIds: [],
        selectedKnowledgeIds: [],
        workspaceGrantId: grant.value.workspaceGrantId,
      },
    };
    const receipt = await firstClient.submitTurn(submitCommand);
    expect(receipt).toMatchObject({
      ok: true,
      value: {
        submitTurnCommandId: commandId,
        status: "accepted",
        runtimeSelectionSummary: {
          agent: { id: "agent.general" },
          resolvedModel: { id: "model.desktop-scripted" },
        },
      },
    });
    expect(await firstClient.submitTurn(submitCommand)).toMatchObject({
      ok: true,
      value: { status: "replayed" },
    });
    const snapshot = await firstClient.loadConversationSnapshot({
      ...query("conversation_snapshot", clientInstanceId),
      sessionId: session.value.sessionId,
    });
    expect(snapshot).toMatchObject({
      ok: true,
      value: {
        messages: [
          { role: "user", status: "completed" },
          {
            role: "assistant",
            status: "completed",
            content: "RoboThree Desktop scripted response.",
          },
        ],
      },
    });
    const tasks = await firstClient.listTasks({
      ...query("list_tasks", clientInstanceId),
      sessionId: session.value.sessionId,
    });
    expect(await firstClient.listTasks({
      ...query("list_tasks", clientInstanceId),
      sessionId: session.value.sessionId,
    })).toEqual(tasks);
    expect(tasks).toMatchObject({
      ok: true,
      value: [{
        sessionId: session.value.sessionId,
        displayStatus: "completed",
        resolvedAgentId: "agent.general",
        resolvedModelId: "model.desktop-scripted",
      }],
    });
    if (!tasks.ok || tasks.value[0] === undefined) {
      throw new Error("Task list projection failed");
    }
    const firstDetail = await firstClient.loadTaskDetail({
      ...query("task_detail", clientInstanceId),
      taskId: tasks.value[0].taskId,
    });
    expect(firstDetail).toMatchObject({
      ok: true,
      value: {
        summary: { displayStatus: "completed" },
        runs: [{ displayStatus: "completed" }],
        toolActivities: [],
        userConfirmations: [],
      },
    });

    const controller = new AbortController();
    const events: unknown[] = [];
    const stream = firstClient.subscribe({
      query: {
        ...query("desktop_event_subscription", clientInstanceId),
        durableCursor: "delivery:0",
      },
      signal: controller.signal,
      onEvent: (event) => {
        events.push(event);
        if (
          event.deliveryKind === "durable"
          && event.payload.type === "task_status_changed"
          && event.payload.displayStatus === "completed"
        ) controller.abort();
      },
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
    });
    await stream;
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        deliveryKind: "durable",
        payload: expect.objectContaining({
          type: "submit_turn_status_changed",
          status: "accepted",
        }),
      }),
      expect.objectContaining({
        deliveryKind: "durable",
        payload: expect.objectContaining({
          type: "message_committed",
          status: "completed",
        }),
      }),
      expect.objectContaining({
        deliveryKind: "durable",
        payload: expect.objectContaining({
          type: "task_status_changed",
          displayStatus: "completed",
        }),
      }),
    ]));
    const durableEventIds = events
      .filter((event): event is { eventId: string } =>
        typeof event === "object"
        && event !== null
        && "eventId" in event
        && typeof event.eventId === "string")
      .map((event) => event.eventId);
    expect(new Set(durableEventIds).size).toBe(durableEventIds.length);

    const oldSelectionHandle = selection.value.selectionHandle;
    await runtime.stop();
    for (const file of await readdir(directory)) {
      if (!file.startsWith("robothree.sqlite")) continue;
      expect(
        (await readFile(join(directory, file))).includes(
          Buffer.from(oldSelectionHandle),
        ),
        `${file} must not contain selectionHandle`,
      ).toBe(false);
    }
    const secondToken = randomBytes(32).toString("base64url");
    runtime = createDesktopPrivateRuntime({
      databasePath,
      authorizationToken: secondToken,
    });
    await runtime.start();
    const secondClient = new CorePrivateClient({
      baseUrl: runtime.server.baseUrl,
      authorizationToken: secondToken,
    });
    expect(await secondClient.querySubmitTurn({
      ...query("submit_turn_status", clientInstanceId),
      submitTurnCommandId: commandId,
    })).toMatchObject({
      ok: true,
      value: { status: "accepted" },
    });
    expect(await secondClient.listTasks({
      ...query("list_tasks", clientInstanceId),
      sessionId: session.value.sessionId,
    })).toEqual(tasks);
    expect(await secondClient.loadTaskDetail({
      ...query("task_detail", clientInstanceId),
      taskId: tasks.value[0].taskId,
    })).toEqual(firstDetail);
    const staleSelection = await secondClient.createWorkspaceGrant({
      ...createWorkspace,
      commandId: randomUUID(),
      selectionHandle: oldSelectionHandle,
      displayName: "Must not be created",
    });
    expect(staleSelection).toMatchObject({
      ok: false,
      error: { code: "workspace.selection_invalid" },
    });
  });

  it("fails closed for missing Origin, wrong token and a second SSE stream", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf12a-threat-"));
    const token = randomBytes(32).toString("base64url");
    const runtime = createDesktopPrivateRuntime({
      databasePath: join(directory, "robothree.sqlite"),
      authorizationToken: token,
    });
    cleanups.push(async () => {
      await runtime.stop();
      await rm(directory, { recursive: true, force: true });
    });
    await runtime.start();

    const body = JSON.stringify(query("runtime_status_query", randomUUID()));
    const missingOrigin = await fetch(
      new URL(CORE_PRIVATE_ROUTES.runtimeStatus, runtime.server.baseUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body,
      },
    );
    expect(missingOrigin.status).toBe(401);
    const wrongToken = await fetch(
      new URL(CORE_PRIVATE_ROUTES.runtimeStatus, runtime.server.baseUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${randomBytes(32).toString("base64url")}`,
          origin: CORE_PRIVATE_ORIGIN,
          "content-type": "application/json",
        },
        body,
      },
    );
    expect(wrongToken.status).toBe(401);

    const first = await fetch(
      new URL(CORE_PRIVATE_ROUTES.events, runtime.server.baseUrl),
      {
        headers: {
          authorization: `Bearer ${token}`,
          origin: CORE_PRIVATE_ORIGIN,
        },
      },
    );
    expect(first.status).toBe(200);
    const second = await fetch(
      new URL(CORE_PRIVATE_ROUTES.events, runtime.server.baseUrl),
      {
        headers: {
          authorization: `Bearer ${token}`,
          origin: CORE_PRIVATE_ORIGIN,
        },
      },
    );
    expect(second.status).toBe(409);
    await first.body?.cancel();
  });

  it("returns SSE timers, subscriptions and responses to baseline after 100 disconnects", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf13b-sse-"));
    const token = randomBytes(32).toString("base64url");
    const runtime = createDesktopPrivateRuntime({
      databasePath: join(directory, "robothree.sqlite"),
      authorizationToken: token,
    });
    cleanups.push(async () => {
      await runtime.stop();
      await rm(directory, { recursive: true, force: true });
    });
    await runtime.start();

    for (let index = 0; index < 100; index += 1) {
      const response = await fetch(
        new URL(CORE_PRIVATE_ROUTES.events, runtime.server.baseUrl),
        {
          headers: {
            authorization: `Bearer ${token}`,
            origin: CORE_PRIVATE_ORIGIN,
          },
        },
      );
      expect(response.status).toBe(200);
      await response.body?.cancel();
      await eventually(() =>
        runtime.server.resourceSnapshot().activeEventStreams === 0);
    }

    expect(runtime.server.resourceSnapshot()).toMatchObject({
      activeServers: 1,
      activeEventStreams: 0,
      activePollTimers: 0,
      activeHeartbeatTimers: 0,
      activeEphemeralSubscriptions: 0,
      cleanupCount: 100,
      slowConsumerTimeoutCount: 0,
    });
    await runtime.stop();
    expect(runtime.server.resourceSnapshot()).toMatchObject({
      activeServers: 0,
      activeEventStreams: 0,
      activePollTimers: 0,
      activeHeartbeatTimers: 0,
      activeEphemeralSubscriptions: 0,
    });
  });
});

function query<
  T extends
    | "compatibility_query"
    | "runtime_status_query"
    | "list_agents"
    | "conversation_snapshot"
    | "list_tasks"
    | "task_detail"
    | "submit_turn_status"
    | "desktop_event_subscription",
>(type: T, clientInstanceId: string) {
  return {
    contractVersion: "v1alpha1" as const,
    type,
    queryId: randomUUID(),
    correlationId: randomUUID(),
    clientInstanceId,
  };
}

async function eventually(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 1_000; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condition was not reached");
}
