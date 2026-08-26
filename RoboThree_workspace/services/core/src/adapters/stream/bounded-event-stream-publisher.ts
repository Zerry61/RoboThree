import type { OutboxRecord } from "@robothree/contracts";

import type { EventPublisher } from "../../ports/event-publisher.js";
import type { BoundedEventStream } from "../../reliability/bounded-event-stream.js";

export class BoundedEventStreamPublisher implements EventPublisher {
  readonly #stream: BoundedEventStream;

  public constructor(stream: BoundedEventStream) {
    this.#stream = stream;
  }

  public async publish(record: OutboxRecord, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new Error("event stream publishing cancelled");
    }
    this.#stream.publish({
      kind: "durable",
      streamId: record.taskId,
      sequence: eventSequence(record),
      occurredAt: eventOccurredAt(record),
      eventId: record.eventId,
      value: record.payload,
    });
  }
}

function eventSequence(record: OutboxRecord): number {
  const sequence = record.payload.sequence;
  return typeof sequence === "number" && Number.isSafeInteger(sequence) && sequence >= 0
    ? sequence
    : record.attemptCount;
}

function eventOccurredAt(record: OutboxRecord): string {
  const occurredAt = record.payload.occurredAt;
  return typeof occurredAt === "string" && Number.isFinite(Date.parse(occurredAt))
    ? occurredAt
    : record.createdAt;
}
