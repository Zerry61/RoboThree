import { cpus, platform, release, totalmem } from "node:os";

import { CONTRACT_VERSION } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  AuthorizationEvaluator,
  CapabilityResolver,
  FakeClock,
  FakeScheduler,
  PerformanceHarness,
  RuntimeAdmissionController,
  createTaskRunState,
  createToolRiskFacts,
  formatBenchmarkMarkdown,
  reduceTaskState,
} from "../../src/index.js";
import { capabilityLock, capabilityRegistry } from "../capability.fixtures.js";

const at = "2026-07-23T08:00:00.000Z";

describe("KAF-4.3 reproducible baseline", () => {
  it("keeps pure reducer, authorization, registry resolve, and admission within Alpha guardrails", async () => {
    const lock = capabilityLock();
    if (lock.definitionSnapshot.kind !== "tool") {
      throw new Error("performance fixture requires a Tool lock");
    }
    const authorizationInput = {
      taskId: lock.taskId,
      runId: entityId(2),
      stepId: entityId(3),
      action: { actionId: entityId(4), kind: "tool.echo", payload: { text: "bounded" } },
      lock,
      riskFacts: createToolRiskFacts(lock.definitionSnapshot.tool.risk),
      context: {
        schemaVersion: CONTRACT_VERSION,
        subject: {
          schemaVersion: CONTRACT_VERSION,
          userId: entityId(5),
          activeConfigRevision: "performance-v1",
          canUseTools: true,
          assignedToolCapabilityIds: ["tool.echo"],
          grants: [],
        },
        resourceAccesses: [],
        availability: {
          enabled: true,
          healthy: true,
          credentialAvailable: true,
          revision: "performance-v1",
        },
      },
    } as const;
    const evaluator = new AuthorizationEvaluator();
    const { snapshot } = capabilityRegistry();
    const resolver = new CapabilityResolver(snapshot);
    const initial = createTaskRunState({
      taskId: entityId(10),
      agentDefinition: { agentDefinitionId: entityId(11), version: "1.0.0" },
      goal: "KAF-4.3 reducer baseline",
      createdAt: at,
    });
    const command = {
      commandId: entityId(12),
      taskId: initial.taskId,
      type: "start_run" as const,
      issuedAt: at,
      runId: entityId(13),
    };
    const admission = new RuntimeAdmissionController({
      clock: new FakeClock(at),
      scheduler: new FakeScheduler(),
      maxActiveRuns: 16,
      maxQueued: 256,
    });
    let admissionId = 0;
    const harness = new PerformanceHarness({
      environment: {
        hardware: `${cpus()[0]?.model ?? "unknown"}; ${cpus().length} logical CPUs`,
        os: `${platform()} ${release()}`,
        node: process.version,
        pnpm: "11.11.0",
        sqlite: "node:sqlite; WAL; busy_timeout=5000; synchronous=FULL",
        dataScale: { events: 10_000, activeRuns: 16, queue: 256 },
        parameters: { samples: 100, iterationsPerSample: 10, totalMemoryBytes: totalmem() },
      },
    });
    harness.add({
      name: "task.reducer",
      category: "pure",
      warmupIterations: 100,
      samples: 100,
      iterationsPerSample: 10,
      operation: () => {
        const result = reduceTaskState(initial, command);
        if (!result.accepted) {
          throw new Error(result.error.code);
        }
      },
    });
    harness.add({
      name: "authorization.evaluate",
      category: "pure",
      warmupIterations: 100,
      samples: 100,
      iterationsPerSample: 10,
      operation: () => {
        if (evaluator.evaluate(authorizationInput).outcome !== "allowed") {
          throw new Error("authorization benchmark unexpectedly denied");
        }
      },
    });
    harness.add({
      name: "registry.resolveById",
      category: "pure",
      warmupIterations: 100,
      samples: 100,
      iterationsPerSample: 10,
      operation: () => {
        resolver.resolveById(snapshot.registryRevision, "tool.echo");
      },
    });
    harness.add({
      name: "admission.acquire_release",
      category: "reliability",
      warmupIterations: 20,
      samples: 100,
      iterationsPerSample: 10,
      operation: async () => {
        admissionId += 1;
        const result = await admission.acquire({
          requestId: `performance-${admissionId}`,
          kind: "run",
        });
        if (!result.ok) {
          throw new Error(result.error.code);
        }
        result.lease.release();
      },
    });
    harness.add({
      name: "cancellation.fake_backend",
      category: "reliability",
      warmupIterations: 20,
      samples: 100,
      iterationsPerSample: 10,
      operation: async () => {
        const cancellation = new AbortController();
        const observed = new Promise<void>((resolve) => {
          cancellation.signal.addEventListener("abort", () => resolve(), { once: true });
        });
        cancellation.abort();
        await observed;
      },
    });

    const report = await harness.run();
    const byName = Object.fromEntries(
      report.measurements.map((measurement) => [measurement.name, measurement]),
    );
    expect(byName["task.reducer"]?.p95Ms).toBeLessThan(10);
    expect(byName["authorization.evaluate"]?.p95Ms).toBeLessThan(5);
    expect(byName["registry.resolveById"]?.p95Ms).toBeLessThan(5);
    expect(byName["admission.acquire_release"]?.p95Ms).toBeLessThan(10);
    expect(byName["cancellation.fake_backend"]?.p95Ms).toBeLessThan(100);
    expect(JSON.parse(JSON.stringify(report))).toMatchObject({
      schemaVersion: "robothree.performance.v1",
      measurements: expect.arrayContaining([
        expect.objectContaining({ name: "task.reducer" }),
        expect.objectContaining({ name: "authorization.evaluate" }),
      ]),
    });
    expect(formatBenchmarkMarkdown(report)).toContain("## Measurements");
    if (process.env.ROBOTHREE_PERFORMANCE_REPORT === "1") {
      process.stdout.write(`${JSON.stringify(report)}\n${formatBenchmarkMarkdown(report)}\n`);
    }
  });
});

function entityId(value: number): string {
  return `019f7aac-0043-7730-8862-${String(value).padStart(12, "0")}`;
}
