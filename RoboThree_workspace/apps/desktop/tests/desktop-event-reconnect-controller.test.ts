import type {
  DesktopEventEnvelope,
  DesktopEventSubscriptionQuery,
  ReplayResetRequired,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import { DesktopEventReconnectController } from "../src/main/desktop-event-reconnect-controller.js";
import type { CorePrivateClient } from "../src/main/core-private-client.js";

const id = (suffix: string) =>
  `019f9300-0000-7000-8000-${suffix.padStart(12, "0")}`;

describe("DCF-1.2C Desktop event reconnect controller", () => {
  it("deduplicates events, resumes from durable cursor and resets ephemeral projection", async () => {
    const queries: DesktopEventSubscriptionQuery[] = [];
    const forwarded: Array<DesktopEventEnvelope | ReplayResetRequired> = [];
    let subscribeCount = 0;
    const client = {
      async subscribe(input: {
        query: DesktopEventSubscriptionQuery;
        signal: AbortSignal;
        onEvent: (event: DesktopEventEnvelope) => void;
      }) {
        queries.push(input.query);
        subscribeCount += 1;
        if (subscribeCount === 1) {
          const event = durableEvent("runtime.instance-a", "delivery:4");
          input.onEvent(event);
          input.onEvent(event);
          throw new Error("simulated disconnect");
        }
        await new Promise<void>((resolve) => {
          input.signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    } as unknown as CorePrivateClient;
    const reconnect = new DesktopEventReconnectController({
      resolveConnection: () => ({
        client,
        clientInstanceId: id("1"),
      }),
      wait: async () => Promise.resolve(),
      random: () => 0,
    });
    const controller = reconnect.start((value) => forwarded.push(value));
    await eventually(() => subscribeCount === 2);
    controller.abort();
    await Promise.resolve();

    expect(queries.map((query) => query.durableCursor)).toEqual([
      "delivery:0",
      "delivery:4",
    ]);
    expect(forwarded.filter((item) => "deliveryKind" in item)).toHaveLength(1);
    expect(forwarded).toContainEqual(expect.objectContaining({
      type: "replay_reset_required",
      reason: "projection_cleaned",
      replacementCursor: "delivery:4",
    }));
  });

  it("forces Snapshot reset before accepting a new runtime generation", async () => {
    const forwarded: Array<DesktopEventEnvelope | ReplayResetRequired> = [];
    const client = {
      async subscribe(input: {
        signal: AbortSignal;
        onEvent: (event: DesktopEventEnvelope) => void;
      }) {
        input.onEvent(durableEvent("runtime.instance-a", "delivery:1"));
        input.onEvent(durableEvent("runtime.instance-b", "delivery:2", id("4")));
        await new Promise<void>((resolve) => {
          input.signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    } as unknown as CorePrivateClient;
    const reconnect = new DesktopEventReconnectController({
      resolveConnection: () => ({ client, clientInstanceId: id("1") }),
    });
    const controller = reconnect.start((value) => forwarded.push(value));
    await eventually(() => forwarded.length === 3);
    controller.abort();

    expect(forwarded[1]).toMatchObject({
      type: "replay_reset_required",
      reason: "old_projection_generation",
      replacementCursor: "delivery:1",
    });
  });

  it("stops reconnecting after the Core lifecycle reaches failed", async () => {
    let subscribeCount = 0;
    let canReconnect = true;
    const forwarded: Array<DesktopEventEnvelope | ReplayResetRequired> = [];
    const client = {
      async subscribe() {
        subscribeCount += 1;
        canReconnect = false;
        throw new Error("runtime failed");
      },
    } as unknown as CorePrivateClient;
    const reconnect = new DesktopEventReconnectController({
      resolveConnection: () => ({ client, clientInstanceId: id("1") }),
      wait: async () => {
        throw new Error("wait must not run after terminal failure");
      },
      canReconnect: () => canReconnect,
    });

    reconnect.start((value) => forwarded.push(value));
    await eventually(() => forwarded.length === 1);
    await Promise.resolve();

    expect(subscribeCount).toBe(1);
    expect(forwarded[0]).toMatchObject({
      type: "replay_reset_required",
      reason: "projection_cleaned",
    });
  });

  it("keeps dedupe metrics bounded and releases the set on abort", async () => {
    const forwarded: Array<DesktopEventEnvelope | ReplayResetRequired> = [];
    const client = {
      async subscribe(input: {
        signal: AbortSignal;
        onEvent: (event: DesktopEventEnvelope) => void;
      }) {
        for (let index = 0; index < 3_000; index += 1) {
          input.onEvent(durableEvent(
            "runtime.instance-a",
            `delivery:${String(index + 1)}`,
            id(String(index + 10)),
          ));
        }
        await new Promise<void>((resolve) => {
          input.signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    } as unknown as CorePrivateClient;
    const reconnect = new DesktopEventReconnectController({
      resolveConnection: () => ({ client, clientInstanceId: id("1") }),
    });
    const controller = reconnect.start((value) => forwarded.push(value));
    await eventually(() => forwarded.length === 3_000);

    expect(reconnect.snapshotMetrics()).toEqual({
      dedupeSetSize: 2_048,
      maxDedupeSize: 2_048,
      cleanupCount: 952,
    });
    controller.abort();
    await eventually(() => reconnect.snapshotMetrics().dedupeSetSize === 0);
    expect(reconnect.snapshotMetrics()).toEqual({
      dedupeSetSize: 0,
      maxDedupeSize: 2_048,
      cleanupCount: 953,
    });
  });

  it("supports a durable-only stream without synthesizing ephemeral deltas", async () => {
    const forwarded: Array<DesktopEventEnvelope | ReplayResetRequired> = [];
    const client = {
      async subscribe(input: {
        signal: AbortSignal;
        onEvent: (event: DesktopEventEnvelope) => void;
      }) {
        input.onEvent({
          ...durableEvent("runtime.instance-a", "delivery:1", id("20")),
          payload: {
            type: "message_committed",
            sessionId: `session:${id("21")}`,
            messageId: `message:${id("22")}`,
            messageRevision: 1,
            status: "completed",
            queryRef: "conversation-snapshot:active-session",
          },
        });
        input.onEvent({
          ...durableEvent("runtime.instance-a", "delivery:2", id("23")),
          payload: {
            type: "task_status_changed",
            sessionId: `session:${id("21")}`,
            taskId: `task:${id("24")}`,
            taskRevision: 2,
            displayStatus: "completed",
            queryRef: "task-snapshot:active-task",
          },
        });
        await new Promise<void>((resolve) => {
          input.signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    } as unknown as CorePrivateClient;
    const reconnect = new DesktopEventReconnectController({
      resolveConnection: () => ({ client, clientInstanceId: id("1") }),
    });
    const controller = reconnect.start((value) => forwarded.push(value));
    await eventually(() => forwarded.length === 2);
    controller.abort();

    expect(forwarded.map((item) =>
      "deliveryKind" in item ? item.payload.type : item.type)).toEqual([
      "message_committed",
      "task_status_changed",
    ]);
    expect(forwarded.every((item) =>
      !("deliveryKind" in item) || item.deliveryKind === "durable")).toBe(true);
  });

  it("releases an abortable reconnect loop across 100 disconnects", async () => {
    let subscribeCount = 0;
    const client = {
      async subscribe(input: { signal: AbortSignal }) {
        subscribeCount += 1;
        if (subscribeCount < 100) throw new Error("synthetic disconnect");
        await new Promise<void>((resolve) => {
          input.signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    } as unknown as CorePrivateClient;
    const reconnect = new DesktopEventReconnectController({
      resolveConnection: () => ({ client, clientInstanceId: id("1") }),
      wait: async (_milliseconds, signal) => {
        if (signal.aborted) throw new Error("aborted reconnect must not wait");
      },
      random: () => 0,
    });
    const controller = reconnect.start(() => undefined);
    await eventually(() => subscribeCount === 100);
    controller.abort();
    await Promise.resolve();

    expect(subscribeCount).toBe(100);
    expect(reconnect.snapshotMetrics().dedupeSetSize).toBe(0);
  });

  it("aborts a pending reconnect backoff immediately", async () => {
    let subscribeCount = 0;
    let waitStarted = false;
    let waitReleased = false;
    const client = {
      async subscribe() {
        subscribeCount += 1;
        throw new Error("synthetic disconnect");
      },
    } as unknown as CorePrivateClient;
    const reconnect = new DesktopEventReconnectController({
      resolveConnection: () => ({ client, clientInstanceId: id("1") }),
      wait: async (_milliseconds, signal) =>
        new Promise<void>((resolve) => {
          waitStarted = true;
          signal.addEventListener("abort", () => {
            waitReleased = true;
            resolve();
          }, { once: true });
        }),
    });
    const controller = reconnect.start(() => undefined);
    await eventually(() => waitStarted);
    controller.abort();
    await eventually(() => waitReleased);

    expect(subscribeCount).toBe(1);
    expect(reconnect.snapshotMetrics().dedupeSetSize).toBe(0);
  });
});

function durableEvent(
  runtimeInstanceId: string,
  durableCursor: string,
  eventId = id("3"),
): DesktopEventEnvelope {
  return {
    contractVersion: "v1alpha1",
    eventId,
    deliveryKind: "durable",
    durableCursor,
    runtimeInstanceId,
    emittedAt: "2026-07-26T20:00:00.000Z",
    payload: {
      type: "runtime_notice",
      noticeCode: "runtime.ready",
      safeSummary: "ready",
    },
  };
}

async function eventually(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condition was not reached");
}
