import type { OutboxRecord } from "@robothree/contracts";

export interface EventPublisher {
  publish(record: OutboxRecord, signal?: AbortSignal): Promise<void>;
}
