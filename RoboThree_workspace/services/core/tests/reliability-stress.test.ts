import { describe, expect, it } from "vitest";

import {
  FakeClock,
  FakeRandomSource,
  FakeScheduler,
  RetryCoordinator,
  RetryPolicy,
  RuntimeAdmissionController,
} from "../src/index.js";

const at = "2026-07-23T09:00:00.000Z";

describe("KAF-4.3 bounded reliability stress", () => {
  it("bounds 16 active Runs plus 256 queued Runs and cleans a full cancellation storm", async () => {
    const scheduler = new FakeScheduler();
    const controller = new RuntimeAdmissionController({
      clock: new FakeClock(at),
      scheduler,
    });
    const active = await Promise.all(Array.from({ length: 16 }, (_, index) => (
      controller.acquire({ requestId: `active-${index}`, kind: "run" })
    )));
    const cancellations = Array.from({ length: 256 }, () => new AbortController());
    const queued = cancellations.map((cancellation, index) => controller.acquire({
      requestId: `queued-${index}`,
      kind: "run",
      signal: cancellation.signal,
    }));
    expect(controller.stats()).toMatchObject({ activeRuns: 16, queued: 256 });
    await expect(controller.acquire({ requestId: "overflow", kind: "run" })).resolves.toMatchObject({
      ok: false,
      error: { code: "admission.queue_full" },
    });

    for (const cancellation of cancellations) {
      cancellation.abort();
    }
    const cancelled = await Promise.all(queued);
    expect(cancelled.every((result) => !result.ok
      && result.error.code === "admission.cancelled_before_admission")).toBe(true);
    expect(controller.stats()).toMatchObject({ activeRuns: 16, queued: 0 });
    for (const result of active) {
      if (result.ok) {
        result.lease.release();
      }
    }
    expect(controller.stats()).toMatchObject({ activeRuns: 0, queued: 0 });
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("keeps a retry storm bounded to the active operation set and exactly three attempts", async () => {
    const scheduler = new FakeScheduler();
    const coordinator = new RetryCoordinator({
      policy: new RetryPolicy(),
      clock: new FakeClock(at),
      random: new FakeRandomSource(Array.from({ length: 24 }, () => 0.5)),
      scheduler,
    });
    const attempts = Array.from({ length: 8 }, () => 0);
    const operations = attempts.map((_, index) => coordinator.execute({
      operationName: `storm-${index}`,
      safety: "pre_effect",
      operation: async (attempt) => {
        attempts[index] = attempt;
        return {
          ok: false as const,
          error: {
            code: "provider.network",
            category: "provider" as const,
            message: "temporary",
            retryable: true,
          },
        };
      },
    }));
    await flushMicrotasks();
    expect(scheduler.pendingCount()).toBe(8);
    scheduler.advanceBy(2_000);
    await flushMicrotasks();
    expect(scheduler.pendingCount()).toBe(8);
    scheduler.advanceBy(4_000);
    await expect(Promise.all(operations)).resolves.toHaveLength(8);
    expect(attempts).toEqual(Array.from({ length: 8 }, () => 3));
    expect(scheduler.pendingCount()).toBe(0);
  });
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
