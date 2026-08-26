import { describe, expect, it } from "vitest";

import {
  assertSafeHarnessReport,
  runDcf13cStabilityHarness,
} from "./run-dcf13c-stability.mjs";

describe("DCF-1.3C stability Harness", () => {
  it("runs a compressed real child/loopback/SSE/SQLite matrix", async () => {
    const report = await runDcf13cStabilityHarness({
      mode: "gate",
      seed: 13013,
      durationMs: 2_000,
      turnIntervalMs: 250,
      reconnectIntervalMs: 500,
      restartIntervalMs: 750,
      resetIntervalMs: 600,
      gracefulCycleIntervalMs: 1_000,
      slowProbeIntervalMs: 400,
      sampleIntervalMs: 200,
      settleDelayMs: 25,
      loopDelayMs: 20,
      snapshotTimeoutMs: 2_000,
    });

    assertSafeHarnessReport(report);
    expect(report).toMatchObject({
      schema: "robothree.dcf13c.stability-report.v1",
      status: "pass",
      mode: "gate",
      seed: 13013,
      counters: {
        turnCount: expect.any(Number),
        reconnectCount: expect.any(Number),
        coreRestartCount: expect.any(Number),
        gracefulCycleCount: expect.any(Number),
        injectedResetCount: expect.any(Number),
        slowConsumerDrainRecoveryCount: expect.any(Number),
        slowConsumerTimeoutCount: expect.any(Number),
        sqliteReopenCount: 1,
        peakActiveChildren: 1,
      },
      resources: {
        peakActiveEventControllers: 1,
        finalActiveEventControllers: 0,
        finalActiveChildren: 0,
        finalDedupeSetSize: 0,
        dedupeCleanupCount: expect.any(Number),
      },
      errorCodes: [],
    });
    expect(report.actualDurationMs).toBeGreaterThanOrEqual(2_000);
    expect(report.counters.turnCount).toBeGreaterThan(0);
    expect(report.counters.runtimeInstanceCount).toBeGreaterThan(1);
    expect(report.resources.dedupeCleanupCount).toBeGreaterThan(0);
    expect(report.finalDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(report)).not.toMatch(
      /(?:Bearer |\/Users\/|userInput|messageContent|credential|selectedPath)/iu,
    );
  }, 20_000);
});
