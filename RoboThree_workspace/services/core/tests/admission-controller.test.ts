import { describe, expect, it } from "vitest";

import {
  FakeClock,
  FakeScheduler,
  RuntimeAdmissionController,
} from "../src/index.js";

const at = "2026-07-23T04:00:00.000Z";

describe("RuntimeAdmissionController", () => {
  it("uses the Alpha defaults: 16 active Runs and FIFO admission after release", async () => {
    const controller = new RuntimeAdmissionController({
      clock: new FakeClock(at),
      scheduler: new FakeScheduler(),
    });
    const active = await Promise.all(Array.from(
      { length: 16 },
      (_, index) => controller.acquire({ requestId: `run-${index}`, kind: "run" }),
    ));
    expect(active.every((result) => result.ok)).toBe(true);
    expect(controller.stats()).toMatchObject({ activeRuns: 16, queued: 0 });

    const order: string[] = [];
    const seventeenth = controller.acquire({ requestId: "run-16", kind: "run" })
      .then((result) => {
        if (result.ok) {
          order.push(result.lease.requestId);
        }
        return result;
      });
    const eighteenth = controller.acquire({ requestId: "run-17", kind: "run" })
      .then((result) => {
        if (result.ok) {
          order.push(result.lease.requestId);
        }
        return result;
      });
    expect(controller.stats()).toMatchObject({ activeRuns: 16, queued: 2 });

    const firstLease = active[0];
    if (!firstLease?.ok) {
      throw new Error("expected an active lease");
    }
    firstLease.lease.release();
    const next = await seventeenth;
    expect(next).toMatchObject({ ok: true, lease: { requestId: "run-16" } });
    expect(order).toEqual(["run-16"]);
    if (!next.ok) {
      throw new Error("expected queued lease");
    }
    next.lease.release();
    const last = await eighteenth;
    expect(last).toMatchObject({ ok: true, lease: { requestId: "run-17" } });
    if (last.ok) {
      last.lease.release();
    }
    for (const result of active.slice(1)) {
      if (result.ok) {
        result.lease.release();
      }
    }
    expect(controller.stats()).toMatchObject({ activeRuns: 0, activeTools: 0, queued: 0 });
  });

  it("returns typed backpressure when the bounded queue is full", async () => {
    const controller = smallController({ maxQueued: 2 });
    const active = await controller.acquire({ requestId: "active", kind: "tool" });
    const queuedOne = controller.acquire({ requestId: "queued-1", kind: "tool" });
    const queuedTwo = controller.acquire({ requestId: "queued-2", kind: "tool" });
    expect(await controller.acquire({ requestId: "overflow", kind: "tool" })).toMatchObject({
      ok: false,
      error: { code: "admission.queue_full", retryable: true },
    });
    expect(controller.stats()).toMatchObject({ activeTools: 1, queued: 2 });
    if (!active.ok) {
      throw new Error("expected active lease");
    }
    active.lease.release();
    const first = await queuedOne;
    if (first.ok) {
      first.lease.release();
    }
    const second = await queuedTwo;
    if (second.ok) {
      second.lease.release();
    }
  });

  it("removes cancelled and expired queued work without consuming a slot", async () => {
    const scheduler = new FakeScheduler();
    const clock = new FakeClock(at);
    const controller = new RuntimeAdmissionController({
      clock,
      scheduler,
      maxActiveTools: 1,
      maxQueued: 3,
    });
    const active = await controller.acquire({ requestId: "active", kind: "tool" });
    const cancellation = new AbortController();
    const cancelled = controller.acquire({
      requestId: "cancelled",
      kind: "tool",
      signal: cancellation.signal,
    });
    const expired = controller.acquire({
      requestId: "expired",
      kind: "tool",
      deadlineAt: "2026-07-23T04:00:01.000Z",
    });
    cancellation.abort();
    expect(await cancelled).toMatchObject({
      ok: false,
      error: { code: "admission.cancelled_before_admission" },
    });
    clock.set("2026-07-23T04:00:01.000Z");
    scheduler.advanceBy(1_000);
    expect(await expired).toMatchObject({
      ok: false,
      error: { code: "admission.deadline_expired" },
    });
    expect(controller.stats()).toMatchObject({ activeTools: 1, queued: 0 });
    if (active.ok) {
      active.lease.release();
    }
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("enforces a narrower Adapter limit and releases slots on success and throw", async () => {
    const controller = new RuntimeAdmissionController({
      clock: new FakeClock(at),
      scheduler: new FakeScheduler(),
      maxActiveTools: 8,
      maxQueued: 4,
    });
    const first = await controller.acquire({
      requestId: "adapter-1",
      kind: "tool",
      resourceId: "adapter.echo@revision",
      resourceLimit: 1,
    });
    const secondPromise = controller.acquire({
      requestId: "adapter-2",
      kind: "tool",
      resourceId: "adapter.echo@revision",
      resourceLimit: 1,
    });
    expect(controller.stats()).toMatchObject({
      activeTools: 1,
      queued: 1,
      activeResources: { "adapter.echo@revision": 1 },
    });
    if (first.ok) {
      first.lease.release();
    }
    const second = await secondPromise;
    if (second.ok) {
      second.lease.release();
    }

    await expect(controller.run(
      { requestId: "throws", kind: "tool" },
      async () => {
        throw new Error("injected failure");
      },
    )).rejects.toThrow("injected failure");
    expect(controller.stats()).toMatchObject({ activeTools: 0, queued: 0 });
  });

  it("keeps active cancellation counted until work stops, then releases the slot", async () => {
    const controller = smallController({ maxQueued: 1 });
    const cancellation = new AbortController();
    const active = controller.run(
      { requestId: "active-cancel", kind: "tool", signal: cancellation.signal },
      () => new Promise<"stopped">((resolve) => {
        cancellation.signal.addEventListener("abort", () => resolve("stopped"), { once: true });
      }),
    );
    await Promise.resolve();
    const queued = controller.acquire({ requestId: "after-cancel", kind: "tool" });
    expect(controller.stats()).toMatchObject({ activeTools: 1, queued: 1 });
    cancellation.abort();
    await expect(active).resolves.toEqual({ ok: true, value: "stopped" });
    const admitted = await queued;
    expect(admitted).toMatchObject({ ok: true, lease: { requestId: "after-cancel" } });
    if (admitted.ok) {
      admitted.lease.release();
    }
    expect(controller.stats()).toMatchObject({ activeTools: 0, queued: 0 });
  });

  it("emits structural diagnostics without work payloads", async () => {
    const events: unknown[] = [];
    const controller = new RuntimeAdmissionController({
      clock: new FakeClock(at),
      scheduler: new FakeScheduler(),
      maxActiveRuns: 1,
      maxQueued: 1,
      observer: (event) => events.push(event),
    });
    const first = await controller.acquire({ requestId: "run-safe-id", kind: "run" });
    const secondPromise = controller.acquire({ requestId: "run-safe-id-2", kind: "run" });
    if (first.ok) {
      first.lease.release();
    }
    const second = await secondPromise;
    if (second.ok) {
      second.lease.release();
    }
    expect(events.map((event) => (event as { type: string }).type)).toEqual([
      "admission.acquired",
      "admission.queued",
      "admission.released",
      "admission.acquired",
      "admission.released",
    ]);
    expect(JSON.stringify(events)).not.toContain("payload");
  });
});

function smallController(input: { maxQueued: number }): RuntimeAdmissionController {
  return new RuntimeAdmissionController({
    clock: new FakeClock(at),
    scheduler: new FakeScheduler(),
    maxActiveTools: 1,
    maxQueued: input.maxQueued,
  });
}
