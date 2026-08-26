import type { JsonValue, RuntimeError } from "@robothree/contracts";

export type RuntimeStreamEvent =
  | Readonly<{
    kind: "delta";
    streamId: string;
    sequence: number;
    occurredAt: string;
    coalesceKey: string;
    value: JsonValue;
  }>
  | Readonly<{
    kind: "status";
    streamId: string;
    sequence: number;
    occurredAt: string;
    status: string;
    value?: JsonValue;
  }>
  | Readonly<{
    kind: "completion";
    streamId: string;
    sequence: number;
    occurredAt: string;
    value?: JsonValue;
  }>
  | Readonly<{
    kind: "confirmation";
    streamId: string;
    sequence: number;
    occurredAt: string;
    confirmationId: string;
    value?: JsonValue;
  }>
  | Readonly<{
    kind: "error";
    streamId: string;
    sequence: number;
    occurredAt: string;
    error: RuntimeError;
  }>
  | Readonly<{
    kind: "durable";
    streamId: string;
    sequence: number;
    occurredAt: string;
    eventId: string;
    value: JsonValue;
  }>;

export type StreamDisconnectReason =
  | "cancelled"
  | "closed"
  | "slow_consumer";

export type StreamReadResult =
  | Readonly<{ done: false; value: RuntimeStreamEvent }>
  | Readonly<{ done: true; reason: StreamDisconnectReason }>;

export interface EventStreamSubscription {
  readonly subscriberId: string;
  next(signal?: AbortSignal): Promise<StreamReadResult>;
  disconnect(): void;
  stats(): Readonly<{
    buffered: number;
    capacity: number;
    coalescedDeltas: number;
    droppedDeltas: number;
    connected: boolean;
  }>;
}

type PendingRead = {
  resolve: (result: StreamReadResult) => void;
  signal?: AbortSignal;
  abort?: () => void;
};

type Subscriber = {
  subscriberId: string;
  capacity: number;
  buffer: RuntimeStreamEvent[];
  pending: PendingRead | undefined;
  connected: boolean;
  disconnectReason?: StreamDisconnectReason;
  coalescedDeltas: number;
  droppedDeltas: number;
};

export type StreamPublishReport = Readonly<{
  deliveredImmediately: number;
  buffered: number;
  coalescedDeltas: number;
  droppedDeltas: number;
  disconnectedSlowConsumers: readonly string[];
}>;

const DEFAULT_SUBSCRIBER_CAPACITY = 64;
const MAX_SUBSCRIBER_CAPACITY = 65_536;

export class BoundedEventStream {
  readonly #defaultCapacity: number;
  readonly #subscribers = new Map<string, Subscriber>();
  #closed = false;

  public constructor(input: { defaultSubscriberCapacity?: number } = {}) {
    this.#defaultCapacity = requireCapacity(
      input.defaultSubscriberCapacity ?? DEFAULT_SUBSCRIBER_CAPACITY,
    );
  }

  public subscribe(input: {
    subscriberId: string;
    capacity?: number;
  }): EventStreamSubscription {
    if (this.#closed) {
      throw new Error("event stream is closed");
    }
    if (input.subscriberId.length === 0) {
      throw new Error("subscriberId cannot be empty");
    }
    if (this.#subscribers.has(input.subscriberId)) {
      throw new Error(`subscriber ${input.subscriberId} already exists`);
    }
    const subscriber: Subscriber = {
      subscriberId: input.subscriberId,
      capacity: requireCapacity(input.capacity ?? this.#defaultCapacity),
      buffer: [],
      pending: undefined,
      connected: true,
      coalescedDeltas: 0,
      droppedDeltas: 0,
    };
    this.#subscribers.set(subscriber.subscriberId, subscriber);
    return Object.freeze({
      subscriberId: subscriber.subscriberId,
      next: (signal?: AbortSignal) => this.#next(subscriber, signal),
      disconnect: () => this.#disconnect(subscriber, "cancelled"),
      stats: () => Object.freeze({
        buffered: subscriber.buffer.length,
        capacity: subscriber.capacity,
        coalescedDeltas: subscriber.coalescedDeltas,
        droppedDeltas: subscriber.droppedDeltas,
        connected: subscriber.connected,
      }),
    });
  }

  public publish(event: RuntimeStreamEvent): StreamPublishReport {
    if (this.#closed) {
      throw new Error("event stream is closed");
    }
    let deliveredImmediately = 0;
    let buffered = 0;
    let coalescedDeltas = 0;
    let droppedDeltas = 0;
    const disconnectedSlowConsumers: string[] = [];

    for (const subscriber of [...this.#subscribers.values()]) {
      const pending = subscriber.pending;
      if (pending !== undefined) {
        subscriber.pending = undefined;
        cleanupPending(pending);
        pending.resolve(Object.freeze({ done: false, value: event }));
        deliveredImmediately += 1;
        continue;
      }

      if (event.kind === "delta") {
        const existingIndex = findCoalescibleDelta(subscriber.buffer, event);
        if (existingIndex >= 0) {
          subscriber.buffer[existingIndex] = event;
          subscriber.coalescedDeltas += 1;
          coalescedDeltas += 1;
          continue;
        }
        if (subscriber.buffer.length >= subscriber.capacity) {
          subscriber.droppedDeltas += 1;
          droppedDeltas += 1;
          continue;
        }
        subscriber.buffer.push(event);
        buffered += 1;
        continue;
      }

      if (subscriber.buffer.length >= subscriber.capacity) {
        const evictableDelta = subscriber.buffer.findIndex((candidate) => candidate.kind === "delta");
        if (evictableDelta >= 0) {
          subscriber.buffer.splice(evictableDelta, 1);
          subscriber.droppedDeltas += 1;
          droppedDeltas += 1;
        } else {
          disconnectedSlowConsumers.push(subscriber.subscriberId);
          this.#disconnect(subscriber, "slow_consumer");
          continue;
        }
      }
      subscriber.buffer.push(event);
      buffered += 1;
    }

    return Object.freeze({
      deliveredImmediately,
      buffered,
      coalescedDeltas,
      droppedDeltas,
      disconnectedSlowConsumers: Object.freeze(disconnectedSlowConsumers),
    });
  }

  public close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    for (const subscriber of [...this.#subscribers.values()]) {
      this.#disconnect(subscriber, "closed");
    }
  }

  public stats(): Readonly<{
    closed: boolean;
    subscribers: number;
    totalBuffered: number;
  }> {
    let totalBuffered = 0;
    for (const subscriber of this.#subscribers.values()) {
      totalBuffered += subscriber.buffer.length;
    }
    return Object.freeze({
      closed: this.#closed,
      subscribers: this.#subscribers.size,
      totalBuffered,
    });
  }

  #next(subscriber: Subscriber, signal?: AbortSignal): Promise<StreamReadResult> {
    if (!subscriber.connected) {
      return Promise.resolve(Object.freeze({
        done: true,
        reason: subscriber.disconnectReason ?? "closed",
      }));
    }
    const buffered = subscriber.buffer.shift();
    if (buffered !== undefined) {
      return Promise.resolve(Object.freeze({ done: false, value: buffered }));
    }
    if (signal?.aborted === true) {
      this.#disconnect(subscriber, "cancelled");
      return Promise.resolve(Object.freeze({ done: true, reason: "cancelled" }));
    }
    if (subscriber.pending !== undefined) {
      throw new Error("subscriber already has a pending read");
    }
    return new Promise((resolve) => {
      const pending: PendingRead = { resolve };
      if (signal !== undefined) {
        pending.signal = signal;
        pending.abort = () => this.#disconnect(subscriber, "cancelled");
        signal.addEventListener("abort", pending.abort, { once: true });
      }
      subscriber.pending = pending;
    });
  }

  #disconnect(subscriber: Subscriber, reason: StreamDisconnectReason): void {
    if (!subscriber.connected) {
      return;
    }
    subscriber.connected = false;
    subscriber.disconnectReason = reason;
    this.#subscribers.delete(subscriber.subscriberId);
    subscriber.buffer.length = 0;
    const pending = subscriber.pending;
    subscriber.pending = undefined;
    if (pending !== undefined) {
      cleanupPending(pending);
      pending.resolve(Object.freeze({ done: true, reason }));
    }
  }
}

function cleanupPending(pending: PendingRead): void {
  if (pending.abort !== undefined) {
    pending.signal?.removeEventListener("abort", pending.abort);
  }
}

function findCoalescibleDelta(
  buffer: readonly RuntimeStreamEvent[],
  incoming: Extract<RuntimeStreamEvent, { kind: "delta" }>,
): number {
  for (let index = buffer.length - 1; index >= 0; index -= 1) {
    const candidate = buffer[index];
    if (candidate?.kind === "delta"
      && candidate.streamId === incoming.streamId
      && candidate.coalesceKey === incoming.coalesceKey) {
      return index;
    }
  }
  return -1;
}

function requireCapacity(capacity: number): number {
  if (!Number.isSafeInteger(capacity) || capacity <= 0 || capacity > MAX_SUBSCRIBER_CAPACITY) {
    throw new Error(`subscriber capacity must be between 1 and ${MAX_SUBSCRIBER_CAPACITY}`);
  }
  return capacity;
}
