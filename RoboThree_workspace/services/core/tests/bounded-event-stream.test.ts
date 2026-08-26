import { describe, expect, it } from "vitest";

import {
  BoundedEventStream,
  BoundedEventStreamPublisher,
} from "../src/index.js";
import type { RuntimeStreamEvent } from "../src/index.js";

const at = "2026-07-23T06:00:00.000Z";

describe("BoundedEventStream", () => {
  it("coalesces only matching deltas while preserving status and completion order", async () => {
    const stream = new BoundedEventStream({ defaultSubscriberCapacity: 4 });
    const subscription = stream.subscribe({ subscriberId: "desktop" });

    stream.publish(delta(1, "answer", "a"));
    stream.publish(status(2, "running"));
    expect(stream.publish(delta(3, "answer", "abc"))).toMatchObject({
      coalescedDeltas: 1,
      droppedDeltas: 0,
    });
    stream.publish(completion(4));

    await expect(subscription.next()).resolves.toMatchObject({
      done: false,
      value: { kind: "delta", sequence: 3, value: "abc" },
    });
    await expect(subscription.next()).resolves.toMatchObject({
      done: false,
      value: { kind: "status", sequence: 2 },
    });
    await expect(subscription.next()).resolves.toMatchObject({
      done: false,
      value: { kind: "completion", sequence: 4 },
    });
    expect(subscription.stats()).toMatchObject({
      buffered: 0,
      coalescedDeltas: 1,
      droppedDeltas: 0,
      connected: true,
    });
  });

  it("evicts a rebuildable delta before admitting a critical durable event", async () => {
    const stream = new BoundedEventStream({ defaultSubscriberCapacity: 2 });
    const subscription = stream.subscribe({ subscriberId: "slow" });
    stream.publish(delta(1, "tokens", "a"));
    stream.publish(status(2, "running"));
    expect(stream.publish(durable(3))).toMatchObject({
      droppedDeltas: 1,
      disconnectedSlowConsumers: [],
    });

    await expect(subscription.next()).resolves.toMatchObject({
      done: false,
      value: { kind: "status" },
    });
    await expect(subscription.next()).resolves.toMatchObject({
      done: false,
      value: { kind: "durable", eventId: entityId(3) },
    });
  });

  it("disconnects a slow subscriber instead of dropping or unboundedly buffering critical events", async () => {
    const stream = new BoundedEventStream({ defaultSubscriberCapacity: 2 });
    const slow = stream.subscribe({ subscriberId: "slow" });
    stream.publish(status(1, "queued"));
    stream.publish(status(2, "running"));

    expect(stream.publish(completion(3))).toMatchObject({
      droppedDeltas: 0,
      disconnectedSlowConsumers: ["slow"],
    });
    expect(stream.stats()).toEqual({ closed: false, subscribers: 0, totalBuffered: 0 });
    await expect(slow.next()).resolves.toEqual({ done: true, reason: "slow_consumer" });
  });

  it("keeps subscriber buffers independent and cleans pending reads on cancel and close", async () => {
    const stream = new BoundedEventStream({ defaultSubscriberCapacity: 1 });
    const fast = stream.subscribe({ subscriberId: "fast" });
    const slow = stream.subscribe({ subscriberId: "slow" });
    const immediate = fast.next();
    stream.publish(delta(1, "tokens", "a"));
    await expect(immediate).resolves.toMatchObject({ done: false, value: { sequence: 1 } });
    expect(slow.stats().buffered).toBe(1);

    const cancellation = new AbortController();
    const pending = fast.next(cancellation.signal);
    cancellation.abort();
    await expect(pending).resolves.toEqual({ done: true, reason: "cancelled" });
    expect(stream.stats().subscribers).toBe(1);

    stream.close();
    expect(stream.stats()).toEqual({ closed: true, subscribers: 0, totalBuffered: 0 });
    await expect(slow.next()).resolves.toEqual({ done: true, reason: "closed" });
  });
});

describe("BoundedEventStreamPublisher", () => {
  it("projects durable Outbox records into the bounded live stream without losing stable IDs", async () => {
    const stream = new BoundedEventStream();
    const subscription = stream.subscribe({ subscriberId: "desktop" });
    const publisher = new BoundedEventStreamPublisher(stream);
    await publisher.publish({
      schemaVersion: 1,
      outboxId: entityId(1),
      eventId: entityId(2),
      taskId: entityId(3),
      destination: "runtime.events",
      payload: {
        sequence: 7,
        occurredAt: at,
        type: "task.completed",
      },
      attemptCount: 0,
      createdAt: at,
    });

    await expect(subscription.next()).resolves.toMatchObject({
      done: false,
      value: {
        kind: "durable",
        streamId: entityId(3),
        sequence: 7,
        eventId: entityId(2),
      },
    });
  });
});

function delta(
  sequence: number,
  coalesceKey: string,
  value: string,
): RuntimeStreamEvent {
  return {
    kind: "delta",
    streamId: "run-1",
    sequence,
    occurredAt: at,
    coalesceKey,
    value,
  };
}

function status(sequence: number, value: string): RuntimeStreamEvent {
  return {
    kind: "status",
    streamId: "run-1",
    sequence,
    occurredAt: at,
    status: value,
  };
}

function completion(sequence: number): RuntimeStreamEvent {
  return {
    kind: "completion",
    streamId: "run-1",
    sequence,
    occurredAt: at,
  };
}

function durable(sequence: number): RuntimeStreamEvent {
  return {
    kind: "durable",
    streamId: "run-1",
    sequence,
    occurredAt: at,
    eventId: entityId(sequence),
    value: { type: "task.event" },
  };
}

function entityId(value: number): string {
  return `019f7a9a-2ab2-7f30-a241-${String(value).padStart(12, "0")}`;
}
