import type { ServerResponse } from "node:http";

export const SLOW_CONSUMER_DEADLINE_MS = 30_000;

export type SseWriteOutcome =
  | "written"
  | "dropped"
  | "skipped"
  | "closed"
  | "slow_consumer";

export type SseBackpressureMetrics = Readonly<{
  backpressured: boolean;
  durableFramesWritten: number;
  ephemeralFramesWritten: number;
  ephemeralFramesDropped: number;
  heartbeatFramesWritten: number;
  heartbeatFramesSkipped: number;
  backpressureCount: number;
  drainRecoveryCount: number;
  slowConsumerTimeoutCount: number;
}>;

type DrainOutcome = "drain" | "closed" | "timeout" | "aborted";
type WaitForDrain = (
  response: ServerResponse,
  deadlineMs: number,
  signal: AbortSignal,
) => Promise<DrainOutcome>;

/**
 * Owns writes for one SSE response. It never queues application frames:
 * durable writers await drain, while ephemeral and heartbeat frames are
 * dropped/skipped during backpressure so SQLite + Snapshot remain the recovery
 * source of truth.
 */
export class SseBackpressureWriter {
  readonly #response: ServerResponse;
  readonly #slowConsumerDeadlineMs: number;
  readonly #waitForDrain: WaitForDrain;
  readonly #onSlowConsumer: () => void;
  readonly #drainAbort = new AbortController();
  #drainPromise: Promise<DrainOutcome> | undefined;
  #disposed = false;
  #durableFramesWritten = 0;
  #ephemeralFramesWritten = 0;
  #ephemeralFramesDropped = 0;
  #heartbeatFramesWritten = 0;
  #heartbeatFramesSkipped = 0;
  #backpressureCount = 0;
  #drainRecoveryCount = 0;
  #slowConsumerTimeoutCount = 0;

  constructor(input: {
    response: ServerResponse;
    slowConsumerDeadlineMs?: number;
    waitForDrain?: WaitForDrain;
    onSlowConsumer?: () => void;
  }) {
    this.#response = input.response;
    this.#slowConsumerDeadlineMs = input.slowConsumerDeadlineMs
      ?? SLOW_CONSUMER_DEADLINE_MS;
    if (
      !Number.isSafeInteger(this.#slowConsumerDeadlineMs)
      || this.#slowConsumerDeadlineMs < 1
      || this.#slowConsumerDeadlineMs > SLOW_CONSUMER_DEADLINE_MS
    ) {
      throw new Error("SSE slow-consumer deadline is invalid");
    }
    this.#waitForDrain = input.waitForDrain ?? waitForDrain;
    this.#onSlowConsumer = input.onSlowConsumer ?? (() => undefined);
  }

  async writeDurable(event: string, value: unknown): Promise<SseWriteOutcome> {
    const ready = await this.#awaitWritable();
    if (ready !== "drain") return ready;
    if (!this.#canWrite()) return "closed";
    this.#durableFramesWritten += 1;
    const accepted = this.#response.write(frame(event, value));
    if (accepted) return "written";
    return this.#awaitBackpressure();
  }

  writeEphemeral(event: string, value: unknown): SseWriteOutcome {
    if (!this.#canWrite()) return "closed";
    if (this.#isBackpressured()) {
      this.#ephemeralFramesDropped += 1;
      return "dropped";
    }
    this.#ephemeralFramesWritten += 1;
    if (!this.#response.write(frame(event, value))) {
      void this.#beginDrainWait();
    }
    return "written";
  }

  writeHeartbeat(event: string, value: unknown): SseWriteOutcome {
    if (!this.#canWrite()) return "closed";
    if (this.#isBackpressured()) {
      this.#heartbeatFramesSkipped += 1;
      return "skipped";
    }
    this.#heartbeatFramesWritten += 1;
    if (!this.#response.write(frame(event, value))) {
      void this.#beginDrainWait();
    }
    return "written";
  }

  snapshot(): SseBackpressureMetrics {
    return Object.freeze({
      backpressured: this.#isBackpressured(),
      durableFramesWritten: this.#durableFramesWritten,
      ephemeralFramesWritten: this.#ephemeralFramesWritten,
      ephemeralFramesDropped: this.#ephemeralFramesDropped,
      heartbeatFramesWritten: this.#heartbeatFramesWritten,
      heartbeatFramesSkipped: this.#heartbeatFramesSkipped,
      backpressureCount: this.#backpressureCount,
      drainRecoveryCount: this.#drainRecoveryCount,
      slowConsumerTimeoutCount: this.#slowConsumerTimeoutCount,
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#drainAbort.abort();
  }

  async #awaitWritable(): Promise<"drain" | "closed" | "slow_consumer"> {
    if (!this.#canWrite()) return "closed";
    if (this.#drainPromise === undefined) return "drain";
    const outcome = await this.#drainPromise;
    if (outcome === "drain") return "drain";
    return outcome === "timeout" ? "slow_consumer" : "closed";
  }

  async #awaitBackpressure(): Promise<SseWriteOutcome> {
    const outcome = await this.#beginDrainWait();
    if (outcome === "drain") return "written";
    return outcome === "timeout" ? "slow_consumer" : "closed";
  }

  #beginDrainWait(): Promise<DrainOutcome> {
    if (this.#drainPromise !== undefined) return this.#drainPromise;
    this.#backpressureCount += 1;
    const operation = this.#waitForDrain(
      this.#response,
      this.#slowConsumerDeadlineMs,
      this.#drainAbort.signal,
    ).then((outcome) => {
      if (outcome === "drain") {
        this.#drainRecoveryCount += 1;
      } else if (outcome === "timeout") {
        this.#slowConsumerTimeoutCount += 1;
        this.#onSlowConsumer();
        if (!this.#response.destroyed) this.#response.destroy();
      }
      return outcome;
    });
    this.#drainPromise = operation;
    void operation.finally(() => {
      if (this.#drainPromise === operation) this.#drainPromise = undefined;
    });
    return operation;
  }

  #isBackpressured(): boolean {
    return this.#drainPromise !== undefined || this.#response.writableNeedDrain;
  }

  #canWrite(): boolean {
    return !this.#disposed
      && !this.#response.destroyed
      && !this.#response.writableEnded;
  }
}

function frame(event: string, value: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
}

function waitForDrain(
  response: ServerResponse,
  deadlineMs: number,
  signal: AbortSignal,
): Promise<DrainOutcome> {
  if (signal.aborted) return Promise.resolve("aborted");
  if (response.destroyed || response.writableEnded) {
    return Promise.resolve("closed");
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => finish("timeout"), deadlineMs);
    const onDrain = (): void => finish("drain");
    const onClose = (): void => finish("closed");
    const onError = (): void => finish("closed");
    const onAbort = (): void => finish("aborted");
    const finish = (outcome: DrainOutcome): void => {
      clearTimeout(timeout);
      response.off("drain", onDrain);
      response.off("close", onClose);
      response.off("error", onError);
      signal.removeEventListener("abort", onAbort);
      resolve(outcome);
    };
    response.once("drain", onDrain);
    response.once("close", onClose);
    response.once("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
