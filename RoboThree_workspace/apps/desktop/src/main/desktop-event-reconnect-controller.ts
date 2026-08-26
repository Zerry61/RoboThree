import { randomUUID } from "node:crypto";

import {
  ReplayResetRequiredSchema,
  type DesktopEventEnvelope,
  type ReplayResetRequired,
} from "@robothree/contracts";

import type { CorePrivateClient } from "./core-private-client.js";

export type DesktopEventForwardedValue =
  | DesktopEventEnvelope
  | ReplayResetRequired;

export type DesktopEventReconnectMetrics = Readonly<{
  dedupeSetSize: number;
  maxDedupeSize: number;
  cleanupCount: number;
}>;

const MAX_DEDUPE_SIZE = 2_048;

export class DesktopEventReconnectController {
  readonly #resolveConnection: () => {
    client: CorePrivateClient;
    clientInstanceId: string;
  };
  readonly #wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly #random: () => number;
  readonly #canReconnect: () => boolean;
  #dedupeSetSize = 0;
  #maxDedupeSize = 0;
  #cleanupCount = 0;

  constructor(input: {
    resolveConnection: () => {
      client: CorePrivateClient;
      clientInstanceId: string;
    };
    wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
    random?: () => number;
    canReconnect?: () => boolean;
  }) {
    this.#resolveConnection = input.resolveConnection;
    this.#wait = input.wait ?? abortableDelay;
    this.#random = input.random ?? Math.random;
    this.#canReconnect = input.canReconnect ?? (() => true);
  }

  start(forward: (value: DesktopEventForwardedValue) => void): AbortController {
    const controller = new AbortController();
    void this.#run(controller.signal, forward);
    return controller;
  }

  snapshotMetrics(): DesktopEventReconnectMetrics {
    return Object.freeze({
      dedupeSetSize: this.#dedupeSetSize,
      maxDedupeSize: this.#maxDedupeSize,
      cleanupCount: this.#cleanupCount,
    });
  }

  async #run(
    signal: AbortSignal,
    forward: (value: DesktopEventForwardedValue) => void,
  ): Promise<void> {
    let durableCursor = "delivery:0";
    let runtimeInstanceId: string | undefined;
    let backoffMs = 250;
    const deliveredEventIds = new Set<string>();
    const resetProjection = (
      reason: "old_projection_generation" | "projection_cleaned",
    ): void => {
      forward(ReplayResetRequiredSchema.parse({
        type: "replay_reset_required",
        reason,
        snapshotQueryRef: "conversation-snapshot:active-session",
        replacementCursor: durableCursor,
      }));
    };

    try {
      while (!signal.aborted) {
        try {
          const connection = this.#resolveConnection();
          await connection.client.subscribe({
            query: {
              contractVersion: "v1alpha1",
              type: "desktop_event_subscription",
              queryId: randomUUID(),
              correlationId: randomUUID(),
              clientInstanceId: connection.clientInstanceId,
              durableCursor,
            },
            signal,
            onReplayReset: (reset) => {
              durableCursor = reset.replacementCursor;
              this.#clearDedupe(deliveredEventIds);
              forward(reset);
            },
            onEvent: (event) => {
              backoffMs = 250;
              if (
                runtimeInstanceId !== undefined
                && runtimeInstanceId !== event.runtimeInstanceId
              ) {
                this.#clearDedupe(deliveredEventIds);
                resetProjection("old_projection_generation");
              }
              runtimeInstanceId = event.runtimeInstanceId;
              if (deliveredEventIds.has(event.eventId)) return;
              if (deliveredEventIds.size >= MAX_DEDUPE_SIZE) {
                const first = deliveredEventIds.values().next().value;
                if (first !== undefined) {
                  deliveredEventIds.delete(first);
                  this.#cleanupCount += 1;
                }
              }
              deliveredEventIds.add(event.eventId);
              this.#dedupeSetSize = deliveredEventIds.size;
              this.#maxDedupeSize = Math.max(
                this.#maxDedupeSize,
                deliveredEventIds.size,
              );
              if (event.deliveryKind === "durable") {
                durableCursor = event.durableCursor;
              }
              forward(event);
            },
          });
          if (!signal.aborted) resetProjection("projection_cleaned");
        } catch {
          if (!signal.aborted) resetProjection("projection_cleaned");
        }
        if (signal.aborted || !this.#canReconnect()) break;
        await this.#wait(
          Math.min(10_000, backoffMs + Math.floor(this.#random() * 100)),
          signal,
        );
        backoffMs = Math.min(10_000, backoffMs * 2);
      }
    } finally {
      this.#clearDedupe(deliveredEventIds);
    }
  }

  #clearDedupe(deliveredEventIds: Set<string>): void {
    if (deliveredEventIds.size === 0) return;
    deliveredEventIds.clear();
    this.#dedupeSetSize = 0;
    this.#cleanupCount += 1;
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    function finish(): void {
      signal.removeEventListener("abort", finish);
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener("abort", finish, { once: true });
  });
}
