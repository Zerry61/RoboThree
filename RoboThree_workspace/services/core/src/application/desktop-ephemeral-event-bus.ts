import {
  EphemeralDesktopEventEnvelopeSchema,
  type EphemeralDesktopEventEnvelope,
  type EphemeralDesktopPayload,
} from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";

export type DesktopEphemeralEventListener = (
  event: EphemeralDesktopEventEnvelope,
) => void;

/**
 * Process-local, intentionally non-durable Desktop projection.
 * A disconnected subscriber loses deltas and must converge from Snapshot.
 */
export class DesktopEphemeralEventBus {
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #runtimeInstanceId: string;
  readonly #listeners = new Set<DesktopEphemeralEventListener>();

  constructor(input: {
    clock: Clock;
    ids: IdGenerator;
    runtimeInstanceId: string;
  }) {
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#runtimeInstanceId = input.runtimeInstanceId;
  }

  publish(payload: EphemeralDesktopPayload): EphemeralDesktopEventEnvelope {
    const event = EphemeralDesktopEventEnvelopeSchema.parse({
      contractVersion: "v1alpha1",
      eventId: this.#ids.next(),
      deliveryKind: "ephemeral",
      runtimeInstanceId: this.#runtimeInstanceId,
      emittedAt: this.#clock.now(),
      payload,
    });
    for (const listener of this.#listeners) listener(event);
    return event;
  }

  subscribe(listener: DesktopEphemeralEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  clear(): void {
    this.#listeners.clear();
  }
}
