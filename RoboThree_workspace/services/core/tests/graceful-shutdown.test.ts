import { describe, expect, it } from "vitest";

import {
  FakeClock,
  FakeLogger,
  FakeRuntimeComponent,
  FakeScheduler,
  GracefulWorkController,
  ProcessEchoToolBackend,
  WorkNotAcceptedError,
  createCore,
} from "../src/index.js";
import { processEchoCapabilityRegistry } from "./capability.fixtures.js";

const at = "2026-07-23T06:30:00.000Z";

describe("GracefulWorkController", () => {
  it("stops admission, aborts active work, waits for completion, then closes components in reverse", async () => {
    const scheduler = new FakeScheduler();
    const controller = new GracefulWorkController({ scheduler, maxActive: 2 });
    const clock = new FakeClock(at);
    const logger = new FakeLogger();
    const trace: string[] = [];
    const first = new FakeRuntimeComponent({ componentId: "first", clock, trace });
    const second = new FakeRuntimeComponent({ componentId: "second", clock, trace });
    const core = createCore({
      clock,
      logger,
      components: [first, second],
      gracefulShutdown: controller,
      shutdownTimeoutMs: 1_000,
    });
    await core.start();

    let observedAbort = false;
    const work = controller.run("run-1", (signal) => new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => {
        observedAbort = true;
        trace.push("work.aborted");
        resolve();
      }, { once: true });
    }));
    await Promise.resolve();
    await core.stop();
    await work;

    expect(observedAbort).toBe(true);
    expect(trace).toEqual([
      "first.start",
      "second.start",
      "work.aborted",
      "second.stop",
      "first.stop",
    ]);
    expect(controller.stats()).toMatchObject({ accepting: false, active: 0 });
    expect(scheduler.pendingCount()).toBe(0);
    expect(() => controller.run("late", async () => undefined)).toThrow(WorkNotAcceptedError);
  });

  it("uses a bounded deadline when active work ignores cancellation and still closes adapters", async () => {
    const scheduler = new FakeScheduler();
    const controller = new GracefulWorkController({ scheduler, maxActive: 1 });
    const clock = new FakeClock(at);
    const logger = new FakeLogger();
    const component = new FakeRuntimeComponent({ componentId: "adapter", clock });
    const core = createCore({
      clock,
      logger,
      components: [component],
      gracefulShutdown: controller,
      shutdownTimeoutMs: 50,
    });
    await core.start();

    let finish: (() => void) | undefined;
    const work = controller.run("stuck", async () => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    await Promise.resolve();
    const stopping = core.stop();
    scheduler.advanceBy(50);
    await stopping;

    expect(core.state).toBe("stopped");
    expect(component.calls).toEqual(["start", "stop"]);
    expect(logger.records).toContainEqual(expect.objectContaining({
      event: "core.shutdown_timeout",
      attributes: expect.objectContaining({ timedOut: 1 }),
    }));
    finish?.();
    await work;
    expect(controller.stats().active).toBe(0);
  });

  it("fails closed when active tracking reaches its explicit capacity", async () => {
    const controller = new GracefulWorkController({
      scheduler: new FakeScheduler(),
      maxActive: 1,
    });
    controller.startAccepting();
    let finish: (() => void) | undefined;
    const first = controller.run("first", async () => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    await Promise.resolve();

    expect(() => controller.run("overflow", async () => undefined)).toThrow(
      expect.objectContaining({
        runtimeError: expect.objectContaining({ code: "runtime.active_work_full" }),
      }),
    );
    finish?.();
    await first;
  });

  it("closes the real Process Echo child through reverse Core component shutdown", async () => {
    const clock = new FakeClock(at);
    const { records } = processEchoCapabilityRegistry();
    const backend = new ProcessEchoToolBackend({
      adapterDescriptorId: records.descriptor.adapterDescriptorId,
      adapterDescriptorRevision: records.descriptor.revision,
      clock,
    });
    const core = createCore({
      clock,
      logger: new FakeLogger(),
      components: [backend],
    });
    await core.start();
    expect(await backend.health()).toMatchObject({ status: "ready" });
    await core.stop();
    expect(await backend.health()).toMatchObject({ status: "unavailable" });
  });
});
