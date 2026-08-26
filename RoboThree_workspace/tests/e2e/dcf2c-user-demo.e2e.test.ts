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

describe("DCF-2C isolated user demo", () => {
  it("restores a pending confirmation after Core restart and executes Process Echo exactly once", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf2c-demo-"));
    const databasePath = join(directory, "robothree.sqlite");
    let runtime: DesktopPrivateRuntime | undefined;
    cleanups.push(async () => {
      await runtime?.stop();
      await rm(directory, { recursive: true, force: true });
    });

    const first = await startDemo(databasePath);
    runtime = first.runtime;
    const session = await first.client.createSession({
      ...commandMeta(first.clientInstanceId),
      type: "create_session",
      title: "DCF-2C 用户现场演示",
    });
    if (!session.ok) throw new Error(session.error.message);
    const submitted = await first.client.submitTurn({
      ...commandMeta(first.clientInstanceId),
      type: "submit_turn",
      clientTurnId: `dcf2c-demo:${randomUUID()}`,
      sessionId: session.value.sessionId,
      userInput: "执行 DCF-2C 用户确认与重启恢复演示",
      selectionRequest: {
        agentId: "agent.dcf2c-demo",
        selectedSkillIds: [],
        selectedKnowledgeIds: [],
      },
    });
    if (!submitted.ok) throw new Error(submitted.error.message);

    const waiting = await eventuallyTask(
      first.client,
      first.clientInstanceId,
      session.value.sessionId,
      "waiting_confirmation",
    );
    const waitingDetail = await loadDetail(
      first.client,
      first.clientInstanceId,
      waiting.taskId,
    );
    expect(waitingDetail.userConfirmations).toEqual([
      expect.objectContaining({ status: "pending" }),
    ]);
    expect(waitingDetail.toolActivities).toEqual([]);

    await runtime.stop();
    const second = await startDemo(databasePath);
    runtime = second.runtime;
    const restored = await eventuallyTask(
      second.client,
      second.clientInstanceId,
      session.value.sessionId,
      "waiting_confirmation",
    );
    expect(restored.taskId).toBe(waiting.taskId);
    const restoredDetail = await loadDetail(
      second.client,
      second.clientInstanceId,
      restored.taskId,
    );
    expect(restoredDetail.userConfirmations)
      .toEqual(waitingDetail.userConfirmations);

    const confirmation = restoredDetail.userConfirmations[0];
    if (confirmation === undefined) throw new Error("Demo confirmation missing");
    const decided = await second.client.controlTask({
      ...commandMeta(second.clientInstanceId),
      type: "decide_user_confirmation",
      taskId: restored.taskId,
      expectedTaskRevision: restored.revision,
      confirmationId: confirmation.confirmationId,
      requestDigest: confirmation.requestDigest,
      decision: "confirmed",
    });
    if (!decided.ok) throw new Error(decided.error.message);
    expect(decided.value.status).toBe("accepted");

    const completed = await eventuallyTask(
      second.client,
      second.clientInstanceId,
      session.value.sessionId,
      "completed",
    );
    const completedDetail = await loadDetail(
      second.client,
      second.clientInstanceId,
      completed.taskId,
    );
    expect(completedDetail.userConfirmations).toEqual([
      expect.objectContaining({ status: "confirmed" }),
    ]);
    expect(completedDetail.toolActivities).toEqual([
      expect.objectContaining({ status: "completed" }),
    ]);
    const snapshot = await second.client.loadConversationSnapshot({
      ...queryMeta(second.clientInstanceId),
      type: "conversation_snapshot",
      sessionId: session.value.sessionId,
    });
    if (!snapshot.ok) throw new Error(snapshot.error.message);
    expect(snapshot.value.messages.filter((message) =>
      message.role === "assistant"
      && message.content.includes("DCF-2C Demo Echo 已执行完成")))
      .toHaveLength(1);

    await runtime.stop();
    const third = await startDemo(databasePath);
    runtime = third.runtime;
    const afterSecondRestart = await eventuallyTask(
      third.client,
      third.clientInstanceId,
      session.value.sessionId,
      "completed",
    );
    expect(afterSecondRestart.taskId).toBe(completed.taskId);
    const finalSnapshot = await third.client.loadConversationSnapshot({
      ...queryMeta(third.clientInstanceId),
      type: "conversation_snapshot",
      sessionId: session.value.sessionId,
    });
    if (!finalSnapshot.ok) throw new Error(finalSnapshot.error.message);
    expect(finalSnapshot.value.messages.filter((message) =>
      message.role === "assistant"
      && message.content.includes("DCF-2C Demo Echo 已执行完成")))
      .toHaveLength(1);
  });
});

async function startDemo(databasePath: string) {
  const authorizationToken = randomBytes(32).toString("base64url");
  const runtime = createDesktopPrivateRuntime({
    databasePath,
    authorizationToken,
    demoMode: "dcf2c",
  });
  await runtime.start();
  const client = new CorePrivateClient({
    baseUrl: runtime.server.baseUrl,
    authorizationToken,
  });
  return {
    runtime,
    client,
    clientInstanceId: randomUUID(),
  };
}

async function eventuallyTask(
  client: CorePrivateClient,
  clientInstanceId: string,
  sessionId: string,
  displayStatus: "waiting_confirmation" | "completed",
) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await client.listTasks({
      ...queryMeta(clientInstanceId),
      type: "list_tasks",
      sessionId,
    });
    if (!result.ok) throw new Error(result.error.message);
    const task = result.value.find((candidate) =>
      candidate.displayStatus === displayStatus);
    if (task !== undefined) return task;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`DCF-2C Demo did not reach ${displayStatus}`);
}

async function loadDetail(
  client: CorePrivateClient,
  clientInstanceId: string,
  taskId: string,
) {
  const result = await client.loadTaskDetail({
    ...queryMeta(clientInstanceId),
    type: "task_detail",
    taskId,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
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
