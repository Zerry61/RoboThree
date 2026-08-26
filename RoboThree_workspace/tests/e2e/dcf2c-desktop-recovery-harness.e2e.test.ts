import type {
  DesktopEventEnvelope,
  SubmitTurnCommand,
} from "@robothree/contracts";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CorePrivateClient } from "../../apps/desktop/src/main/core-private-client.js";
import {
  createDesktopPrivateRuntime,
  type DesktopPrivateRuntime,
} from "../../services/core/src/index.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

describe("DCF-2C Desktop/Core/SSE recovery Harness", () => {
  it("converges after Desktop restart, SSE reconnect and Core restart without duplicate durable events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf2c-e2e-"));
    const databasePath = join(directory, "robothree.sqlite");
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
    const firstClient = new CorePrivateClient({
      baseUrl: runtime.server.baseUrl,
      authorizationToken: firstToken,
    });
    const firstClientInstanceId = randomUUID();
    const firstRuntimeInstanceId = await runtimeInstanceId(
      firstClient,
      firstClientInstanceId,
    );
    const session = await firstClient.createSession({
      ...commandMeta(firstClientInstanceId),
      type: "create_session",
      title: "DCF-2C Recovery Harness",
    });
    if (!session.ok) throw new Error(session.error.message);

    await submit(firstClient, firstClientInstanceId, session.value.sessionId);
    const firstStream = await collectTaskCompletion(
      firstClient,
      firstClientInstanceId,
      "delivery:0",
    );
    expect(firstStream.duplicateCount).toBe(0);
    const firstTasks = await listTasks(
      firstClient,
      firstClientInstanceId,
      session.value.sessionId,
    );
    expect(firstTasks).toHaveLength(1);
    const firstDetail = await loadTask(
      firstClient,
      firstClientInstanceId,
      firstTasks[0]!.taskId,
    );
    expect(firstDetail.summary.displayStatus).toBe("completed");
    await eventually(() =>
      runtime!.server.resourceSnapshot().activeEventStreams === 0);

    // A new Main client with a new clientInstanceId simulates Desktop restart
    // while the same Local Core and durable SQLite facts remain active.
    const desktopRestartClient = new CorePrivateClient({
      baseUrl: runtime.server.baseUrl,
      authorizationToken: firstToken,
    });
    const desktopRestartInstanceId = randomUUID();
    expect(await listTasks(
      desktopRestartClient,
      desktopRestartInstanceId,
      session.value.sessionId,
    )).toEqual(firstTasks);
    expect(await loadTask(
      desktopRestartClient,
      desktopRestartInstanceId,
      firstTasks[0]!.taskId,
    )).toEqual(firstDetail);

    const reconnect = collectTaskCompletion(
      desktopRestartClient,
      desktopRestartInstanceId,
      firstStream.latestCursor,
    );
    await submit(
      desktopRestartClient,
      desktopRestartInstanceId,
      session.value.sessionId,
    );
    const reconnectedStream = await reconnect;
    expect(reconnectedStream.duplicateCount).toBe(0);
    expect(reconnectedStream.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        deliveryKind: "durable",
        payload: expect.objectContaining({
          type: "task_status_changed",
          displayStatus: "completed",
        }),
      }),
    ]));

    await runtime.stop();
    const secondToken = randomBytes(32).toString("base64url");
    runtime = createDesktopPrivateRuntime({
      databasePath,
      authorizationToken: secondToken,
    });
    await runtime.start();
    const restartedClient = new CorePrivateClient({
      baseUrl: runtime.server.baseUrl,
      authorizationToken: secondToken,
    });
    const restartedClientInstanceId = randomUUID();
    const secondRuntimeInstanceId = await runtimeInstanceId(
      restartedClient,
      restartedClientInstanceId,
    );
    expect(secondRuntimeInstanceId).not.toBe(firstRuntimeInstanceId);
    const restoredTasks = await listTasks(
      restartedClient,
      restartedClientInstanceId,
      session.value.sessionId,
    );
    expect(restoredTasks).toHaveLength(2);
    expect(restoredTasks.every((task) =>
      task.displayStatus === "completed")).toBe(true);

    const afterCoreRestart = collectTaskCompletion(
      restartedClient,
      restartedClientInstanceId,
      reconnectedStream.latestCursor,
    );
    await submit(
      restartedClient,
      restartedClientInstanceId,
      session.value.sessionId,
    );
    const restartedStream = await afterCoreRestart;
    expect(restartedStream.duplicateCount).toBe(0);
    expect(new Set(restartedStream.events.map((event) => event.eventId)).size)
      .toBe(restartedStream.events.length);
    await eventually(() =>
      runtime!.server.resourceSnapshot().activeEventStreams === 0);
    expect(runtime.server.resourceSnapshot()).toMatchObject({
      activeServers: 1,
      activeEventStreams: 0,
      activePollTimers: 0,
      activeHeartbeatTimers: 0,
      activeEphemeralSubscriptions: 0,
    });
  });
});

async function submit(
  client: CorePrivateClient,
  clientInstanceId: string,
  sessionId: string,
) {
  const command: SubmitTurnCommand = {
    ...commandMeta(clientInstanceId),
    type: "submit_turn",
    clientTurnId: `dcf2c:${randomUUID()}`,
    sessionId,
    userInput: "Execute the bounded DCF-2C recovery turn.",
    selectionRequest: {
      agentId: "agent.general",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
    },
  };
  const receipt = await client.submitTurn(command);
  if (!receipt.ok) throw new Error(receipt.error.message);
  expect(receipt.value.status).toBe("accepted");
  expect(await client.submitTurn(command)).toMatchObject({
    ok: true,
    value: { status: "replayed" },
  });
  return receipt.value;
}

async function collectTaskCompletion(
  client: CorePrivateClient,
  clientInstanceId: string,
  durableCursor: string,
) {
  const controller = new AbortController();
  const events: DesktopEventEnvelope[] = [];
  let latestCursor = durableCursor;
  const subscription = client.subscribe({
    query: {
      ...queryMeta(clientInstanceId),
      type: "desktop_event_subscription",
      durableCursor,
    },
    signal: controller.signal,
    onEvent: (event) => {
      events.push(event);
      if (event.deliveryKind === "durable") {
        latestCursor = event.durableCursor;
      }
      if (
        event.deliveryKind === "durable"
        && event.payload.type === "task_status_changed"
        && event.payload.displayStatus === "completed"
      ) {
        controller.abort();
      }
    },
  }).catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      throw error;
    }
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      subscription,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("DCF-2C event convergence timed out"));
        }, 5_000);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    if (!controller.signal.aborted) {
        controller.abort();
    }
  }
  const durableIds = events
    .filter((event) => event.deliveryKind === "durable")
    .map((event) => event.eventId);
  return {
    events,
    latestCursor,
    duplicateCount: durableIds.length - new Set(durableIds).size,
  };
}

async function listTasks(
  client: CorePrivateClient,
  clientInstanceId: string,
  sessionId: string,
) {
  const tasks = await client.listTasks({
    ...queryMeta(clientInstanceId),
    type: "list_tasks",
    sessionId,
  });
  if (!tasks.ok) throw new Error(tasks.error.message);
  return tasks.value;
}

async function loadTask(
  client: CorePrivateClient,
  clientInstanceId: string,
  taskId: string,
) {
  const detail = await client.loadTaskDetail({
    ...queryMeta(clientInstanceId),
    type: "task_detail",
    taskId,
  });
  if (!detail.ok) throw new Error(detail.error.message);
  return detail.value;
}

async function runtimeInstanceId(
  client: CorePrivateClient,
  clientInstanceId: string,
) {
  const status = await client.runtimeStatus({
    ...queryMeta(clientInstanceId),
    type: "runtime_status_query",
  });
  if (!status.ok) throw new Error(status.error.message);
  return status.value.runtimeInstanceId;
}

function commandMeta(clientInstanceId: string) {
  return {
    contractVersion: "v1alpha1" as const,
    commandId: randomUUID(),
    correlationId: randomUUID(),
    clientInstanceId,
  };
}

function queryMeta(clientInstanceId: string) {
  return {
    contractVersion: "v1alpha1" as const,
    queryId: randomUUID(),
    correlationId: randomUUID(),
    clientInstanceId,
  };
}

async function eventually(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("DCF-2C resource convergence timed out");
}
