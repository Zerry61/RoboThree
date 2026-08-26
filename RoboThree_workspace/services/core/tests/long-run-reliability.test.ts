import { describe, expect, it } from "vitest";

import type { TaskEvent } from "@robothree/contracts";
import { PersistenceSchemaVersion } from "@robothree/contracts";

import { BoundedEventStream, replayTaskEvents } from "../src/index.js";
import {
  initialPersistedTask,
  persistenceIds,
} from "./task-persistence.fixtures.js";

describe("KAF-4.3 long-run reliability", () => {
  it("replays a contiguous 10,000-event tail from one valid checkpoint without changing durable state", () => {
    const initial = initialPersistedTask();
    const events: TaskEvent[] = Array.from({ length: 10_000 }, (_, index) => ({
      schemaVersion: PersistenceSchemaVersion,
      eventId: entityId(50_000 + index),
      taskId: persistenceIds.task,
      sequence: index + 1,
      type: "authorization.allowed",
      occurredAt: "2026-07-23T07:30:00.000Z",
      causationId: entityId(70_000 + index),
      correlationId: persistenceIds.task,
      payload: { authorization: { allowed: true } },
    }));
    const restored = replayTaskEvents({
      head: {
        ...initial.head,
        lastEventSequence: events.length,
      },
      checkpoint: initial.checkpoint,
    }, events);

    expect(restored).toEqual(initial.checkpoint.state);
    expect(events).toHaveLength(10_000);
  });

  it("keeps a 100,000-delta slow-consumer window bounded and releases all subscriber state", () => {
    const stream = new BoundedEventStream({ defaultSubscriberCapacity: 64 });
    const subscription = stream.subscribe({ subscriberId: "long-run-slow" });
    for (let index = 0; index < 100_000; index += 1) {
      stream.publish({
        kind: "delta",
        streamId: "long-run",
        sequence: index + 1,
        occurredAt: "2026-07-23T07:30:00.000Z",
        coalesceKey: `channel-${index % 128}`,
        value: index,
      });
    }
    expect(subscription.stats()).toMatchObject({
      buffered: 64,
      capacity: 64,
      connected: true,
    });
    expect(stream.stats()).toEqual({
      closed: false,
      subscribers: 1,
      totalBuffered: 64,
    });
    subscription.disconnect();
    expect(stream.stats()).toEqual({
      closed: false,
      subscribers: 0,
      totalBuffered: 0,
    });
  });
});

function entityId(value: number): string {
  return `019f7aa4-ae1f-7fe0-8cc5-${String(value).padStart(12, "0")}`;
}
