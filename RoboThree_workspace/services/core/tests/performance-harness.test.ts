import { describe, expect, it } from "vitest";

import {
  PerformanceHarness,
  formatBenchmarkMarkdown,
} from "../src/index.js";

describe("PerformanceHarness", () => {
  it("separates warmup, records deterministic percentiles, and emits JSON-safe and Markdown reports", async () => {
    let calls = 0;
    let now = 0;
    const harness = new PerformanceHarness({
      environment: {
        hardware: "test-machine",
        os: "test-os",
        node: "24.13.0",
        pnpm: "11.11.0",
        sqlite: "node:sqlite",
        dataScale: { events: 10_000 },
        parameters: { wal: true, synchronous: "FULL" },
      },
      monotonicNow: () => {
        now += 1;
        return now;
      },
      generatedAt: () => "2026-07-23T07:00:00.000Z",
    });
    harness.add({
      name: "task.reducer",
      category: "pure",
      warmupIterations: 2,
      samples: 3,
      iterationsPerSample: 2,
      operation: () => {
        calls += 1;
      },
    });

    const report = await harness.run();
    expect(calls).toBe(8);
    expect(report).toMatchObject({
      schemaVersion: "robothree.performance.v1",
      generatedAt: "2026-07-23T07:00:00.000Z",
      measurements: [{
        name: "task.reducer",
        samples: 3,
        iterationsPerSample: 2,
        p50Ms: 0.5,
        p95Ms: 0.5,
        p99Ms: 0.5,
      }],
    });
    expect(() => JSON.stringify(report)).not.toThrow();
    expect(formatBenchmarkMarkdown(report)).toContain("| task.reducer | pure | 3 | 2 |");
  });

  it("rejects duplicate or unbounded benchmark definitions", () => {
    const harness = new PerformanceHarness({
      environment: {
        hardware: "test",
        os: "test",
        node: "test",
        pnpm: "test",
        sqlite: "test",
        dataScale: {},
        parameters: {},
      },
    });
    const definition = {
      name: "duplicate",
      category: "test",
      warmupIterations: 0,
      samples: 1,
      iterationsPerSample: 1,
      operation: () => undefined,
    };
    harness.add(definition);
    expect(() => harness.add(definition)).toThrow("already exists");
    expect(() => harness.add({
      ...definition,
      name: "invalid",
      samples: 0,
    })).toThrow("samples must be a positive integer");
  });
});
