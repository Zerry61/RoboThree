import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";

import { describe, expect, it, vi } from "vitest";

import {
  SseBackpressureWriter,
  SLOW_CONSUMER_DEADLINE_MS,
} from "../src/adapters/http/sse-backpressure-writer.js";

describe("DCF-1.3B SSE backpressure writer", () => {
  it("waits for drain after write returns false and then resumes durable output", async () => {
    const response = new FakeSseResponse([false, true]);
    const writer = new SseBackpressureWriter({
      response: response as unknown as ServerResponse,
    });

    const first = writer.writeDurable("desktop_event", { sequence: 1 });
    await eventually(() => response.chunks.length === 1);
    expect(writer.snapshot().backpressured).toBe(true);
    response.releaseDrain();

    await expect(first).resolves.toBe("written");
    await expect(writer.writeDurable("desktop_event", { sequence: 2 }))
      .resolves.toBe("written");
    expect(writer.snapshot()).toMatchObject({
      durableFramesWritten: 2,
      backpressureCount: 1,
      drainRecoveryCount: 1,
      slowConsumerTimeoutCount: 0,
    });
    writer.dispose();
  });

  it("closes a stream only when the injected slow-consumer deadline expires", async () => {
    const response = new FakeSseResponse([false]);
    const onSlowConsumer = vi.fn();
    const writer = new SseBackpressureWriter({
      response: response as unknown as ServerResponse,
      slowConsumerDeadlineMs: 5,
      onSlowConsumer,
    });

    await expect(writer.writeDurable("desktop_event", { sequence: 1 }))
      .resolves.toBe("slow_consumer");
    expect(response.destroyed).toBe(true);
    expect(onSlowConsumer).toHaveBeenCalledTimes(1);
    expect(writer.snapshot()).toMatchObject({
      backpressureCount: 1,
      drainRecoveryCount: 0,
      slowConsumerTimeoutCount: 1,
    });
  });

  it("drops ephemeral frames and skips heartbeat without building a queue", async () => {
    const response = new FakeSseResponse([false, true]);
    const writer = new SseBackpressureWriter({
      response: response as unknown as ServerResponse,
    });

    expect(writer.writeEphemeral("desktop_event", { deltaSequence: 0 }))
      .toBe("written");
    for (let index = 0; index < 10_000; index += 1) {
      expect(writer.writeEphemeral("desktop_event", { deltaSequence: index + 1 }))
        .toBe("dropped");
    }
    expect(writer.writeHeartbeat("heartbeat", { sentAt: "now" })).toBe("skipped");
    expect(response.chunks).toHaveLength(1);

    const durable = writer.writeDurable("desktop_event", { sequence: 1 });
    response.releaseDrain();
    await expect(durable).resolves.toBe("written");
    expect(response.chunks).toHaveLength(2);
    expect(writer.snapshot()).toMatchObject({
      ephemeralFramesWritten: 1,
      ephemeralFramesDropped: 10_000,
      heartbeatFramesWritten: 0,
      heartbeatFramesSkipped: 1,
      backpressureCount: 1,
      drainRecoveryCount: 1,
    });
    writer.dispose();
  });

  it("keeps the production deadline frozen at 30 seconds", () => {
    expect(SLOW_CONSUMER_DEADLINE_MS).toBe(30_000);
  });

  it("repeats drain recovery and slow timeout for 20 rounds without retained state", async () => {
    for (let index = 0; index < 20; index += 1) {
      const response = new FakeSseResponse([false]);
      const writer = new SseBackpressureWriter({
        response: response as unknown as ServerResponse,
      });
      const writing = writer.writeDurable("desktop_event", { sequence: index });
      await eventually(() => writer.snapshot().backpressured);
      response.releaseDrain();
      await expect(writing).resolves.toBe("written");
      expect(writer.snapshot()).toMatchObject({
        backpressured: false,
        drainRecoveryCount: 1,
        slowConsumerTimeoutCount: 0,
      });
      writer.dispose();
    }

    for (let index = 0; index < 20; index += 1) {
      const response = new FakeSseResponse([false]);
      const writer = new SseBackpressureWriter({
        response: response as unknown as ServerResponse,
        slowConsumerDeadlineMs: 1,
        waitForDrain: async () => "timeout",
      });
      await expect(writer.writeDurable("desktop_event", { sequence: index }))
        .resolves.toBe("slow_consumer");
      expect(response.destroyed).toBe(true);
      expect(writer.snapshot().slowConsumerTimeoutCount).toBe(1);
    }
  });
});

class FakeSseResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  writableNeedDrain = false;
  readonly chunks: string[] = [];
  readonly #writeResults: boolean[];

  constructor(writeResults: boolean[]) {
    super();
    this.#writeResults = [...writeResults];
  }

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    const accepted = this.#writeResults.shift() ?? true;
    this.writableNeedDrain = !accepted;
    return accepted;
  }

  destroy(): this {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.emit("close");
    return this;
  }

  releaseDrain(): void {
    this.writableNeedDrain = false;
    this.emit("drain");
  }
}

async function eventually(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condition was not reached");
}
