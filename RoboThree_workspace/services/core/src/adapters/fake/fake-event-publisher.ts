import type { OutboxRecord } from "@robothree/contracts";

import type { EventPublisher } from "../../ports/event-publisher.js";

export class FakeEventPublisher implements EventPublisher {
  readonly published: OutboxRecord[] = [];
  #nextError: Error | undefined;

  failNext(error = new Error("Fake event publisher failure")): void {
    this.#nextError = error;
  }

  async publish(record: OutboxRecord, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) {
      throw signal.reason instanceof Error ? signal.reason : new Error("event publishing cancelled");
    }
    if (this.#nextError !== undefined) {
      const error = this.#nextError;
      this.#nextError = undefined;
      throw error;
    }
    this.published.push(structuredClone(record));
  }
}
