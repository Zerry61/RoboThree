import { describe, expect, it } from "vitest";

import {
  FakeClock,
  FakeLogger,
  FakePersistenceAdapter,
  FakeRuntimeComponent,
  createCore,
} from "../src/index.js";

const now = "2026-07-19T12:00:00.000Z";

describe("CoreLifecycle", () => {
  it("starts components in order and stops them in reverse order", async () => {
    const clock = new FakeClock(now);
    const logger = new FakeLogger();
    const trace: string[] = [];
    const first = new FakeRuntimeComponent({ componentId: "first", clock, trace });
    const second = new FakeRuntimeComponent({ componentId: "second", clock, trace });
    const core = createCore({ clock, logger, components: [first, second] });

    await core.start();
    expect(core.state).toBe("ready");
    expect(await core.health()).toMatchObject({ status: "ready" });

    await core.stop();
    expect(core.state).toBe("stopped");
    expect(first.calls).toEqual(["start", "stop"]);
    expect(second.calls).toEqual(["start", "stop"]);
    expect(trace).toEqual(["first.start", "second.start", "second.stop", "first.stop"]);
    expect(logger.records.some((record) => record.event === "core.ready")).toBe(true);
  });

  it("rolls back already-started components when startup fails", async () => {
    const clock = new FakeClock(now);
    const logger = new FakeLogger();
    const first = new FakeRuntimeComponent({ componentId: "first", clock });
    const second = new FakeRuntimeComponent({ componentId: "second", clock });
    second.failOnStart(new Error("boom"));
    const core = createCore({ clock, logger, components: [first, second] });

    await expect(core.start()).rejects.toThrow("boom");
    expect(core.state).toBe("failed");
    expect(first.calls).toEqual(["start", "stop"]);
    expect(second.calls).toEqual(["start"]);
  });

  it("reports the worst component health", async () => {
    const clock = new FakeClock(now);
    const logger = new FakeLogger();
    const ready = new FakeRuntimeComponent({ componentId: "ready", clock });
    const degraded = new FakeRuntimeComponent({ componentId: "degraded", clock });
    degraded.setHealth("degraded");
    const core = createCore({ clock, logger, components: [ready, degraded] });

    await core.start();
    expect(await core.health()).toMatchObject({ status: "degraded" });
  });

  it("boots with a persistence adapter behind the lifecycle port", async () => {
    const clock = new FakeClock(now);
    const logger = new FakeLogger();
    const persistence = new FakePersistenceAdapter(clock);
    const core = createCore({ clock, logger, components: [persistence] });

    await core.start();

    expect(persistence.adapterKind).toBe("persistence");
    expect(await core.health()).toMatchObject({
      status: "ready",
      components: [{ componentId: "persistence.fake", status: "ready" }],
    });
  });
});
