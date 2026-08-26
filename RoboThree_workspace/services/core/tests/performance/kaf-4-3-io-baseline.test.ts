import { mkdtemp, rm } from "node:fs/promises";
import { cpus, platform, release, tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  JsonValueSchema,
  PersistenceSchemaVersion,
} from "@robothree/contracts";
import type { TaskEvent } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  FakeClock,
  FakeEventPublisher,
  OutboxDispatcher,
  PerformanceHarness,
  ProcessEchoToolBackend,
  SqliteTaskPersistence,
  createTaskRunState,
  formatBenchmarkMarkdown,
  replayTaskEvents,
  sha256CanonicalJson,
} from "../../src/index.js";
import {
  initialPersistedTask,
  persistenceIds,
} from "../task-persistence.fixtures.js";
import { processEchoCapabilityRegistry } from "../capability.fixtures.js";

const at = "2026-07-23T08:30:00.000Z";

describe("KAF-4.3 I/O and recovery baseline", () => {
  it("measures SQLite commit/lookup, 10k tail replay, bounded Outbox drain, and Echo IPC", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf43-performance-"));
    const databasePath = join(directory, "performance.sqlite");
    const clock = new FakeClock(at);
    const persistence = new SqliteTaskPersistence({ databasePath, clock });
    const sqliteProbe = new DatabaseSync(":memory:");
    const sqliteVersion = sqliteProbe.prepare("SELECT sqlite_version() AS version").get() as { version: string };
    sqliteProbe.close();
    const { records, snapshot } = processEchoCapabilityRegistry();
    const echo = new ProcessEchoToolBackend({
      adapterDescriptorId: records.descriptor.adapterDescriptorId,
      adapterDescriptorRevision: records.descriptor.revision,
      clock,
    });
    const lock = {
      schemaVersion: records.definition.schemaVersion,
      lockId: entityId(100),
      taskId: entityId(101),
      registryRevision: snapshot.registryRevision,
      definitionSnapshot: records.definition,
      bindingSnapshot: records.binding,
      adapterDescriptorSnapshot: records.descriptor,
      lockedAt: at,
    };
    const initial = initialPersistedTask();
    const tail = authorizationTail(10_000);
    const persistedWithTail = {
      head: { ...initial.head, lastEventSequence: tail.length },
      checkpoint: initial.checkpoint,
    };
    const outbox = new OutboxDispatcher({
      persistence,
      publisher: new FakeEventPublisher(),
      clock,
      maxBatch: 100,
    });
    let createIndex = 0;
    let echoIndex = 0;

    try {
      await persistence.start();
      await echo.start();
      const harness = new PerformanceHarness({
        environment: {
          hardware: `${cpus()[0]?.model ?? "unknown"}; ${cpus().length} logical CPUs`,
          os: `${platform()} ${release()}`,
          node: process.version,
          pnpm: "11.11.0",
          sqlite: `${sqliteVersion.version}; WAL; busy_timeout=5000; synchronous=FULL`,
          dataScale: {
            tailEvents: tail.length,
            sqliteCommits: 30,
            echoRequests: 10,
            outboxMaxBatch: 100,
          },
          parameters: {
            warmupSeparated: true,
            temporaryDatabase: true,
            durabilityRelaxed: false,
          },
        },
      });
      harness.add({
        name: "sqlite.create_task_commit",
        category: "persistence",
        warmupIterations: 2,
        samples: 30,
        iterationsPerSample: 1,
        operation: async () => {
          createIndex += 1;
          const committed = await persistence.createTask(persistedTask(createIndex));
          if (!committed.ok) {
            throw new Error(committed.error.code);
          }
        },
      });
      harness.add({
        name: "confirmation.lookup_miss",
        category: "persistence",
        warmupIterations: 20,
        samples: 50,
        iterationsPerSample: 10,
        operation: async () => {
          await persistence.findUserConfirmationByScopeDigest(`sha256:${"a".repeat(64)}`);
        },
      });
      harness.add({
        name: "checkpoint.tail_replay_10000",
        category: "recovery",
        warmupIterations: 2,
        samples: 20,
        iterationsPerSample: 1,
        operation: () => {
          replayTaskEvents(persistedWithTail, tail);
        },
      });
      harness.add({
        name: "outbox.empty_bounded_drain",
        category: "reliability",
        warmupIterations: 5,
        samples: 30,
        iterationsPerSample: 1,
        operation: async () => {
          await outbox.drain();
        },
      });
      harness.add({
        name: "process_echo.ipc",
        category: "adapter",
        warmupIterations: 2,
        samples: 10,
        iterationsPerSample: 1,
        operation: async () => {
          echoIndex += 1;
          const observation = await echo.execute({
            lock,
            action: {
              actionId: entityId(1_000 + echoIndex),
              kind: "tool.echo",
              payload: { value: echoIndex },
            },
            effectAttemptId: entityId(2_000 + echoIndex),
            idempotencyKey: `kaf43-performance:${echoIndex}`,
            requestedAt: at,
          }, new AbortController().signal);
          if (observation.outcome !== "succeeded") {
            throw new Error(`Echo benchmark returned ${observation.outcome}`);
          }
        },
      });

      const report = await harness.run();
      expect(report.measurements.map((measurement) => measurement.name)).toEqual([
        "sqlite.create_task_commit",
        "confirmation.lookup_miss",
        "checkpoint.tail_replay_10000",
        "outbox.empty_bounded_drain",
        "process_echo.ipc",
      ]);
      expect(report.measurements.every((measurement) => measurement.p95Ms >= 0)).toBe(true);
      expect(formatBenchmarkMarkdown(report)).toContain("checkpoint.tail_replay_10000");
      if (process.env.ROBOTHREE_PERFORMANCE_REPORT === "1") {
        process.stdout.write(`${JSON.stringify(report)}\n${formatBenchmarkMarkdown(report)}\n`);
      }
    } finally {
      await echo.stop();
      await persistence.stop();
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});

function persistedTask(index: number) {
  const state = createTaskRunState({
    taskId: entityId(10_000 + index),
    agentDefinition: {
      agentDefinitionId: entityId(20_000 + index),
      version: "1.0.0",
    },
    goal: `SQLite performance commit ${index}`,
    createdAt: at,
  });
  const checkpoint = {
    schemaVersion: PersistenceSchemaVersion,
    checkpointId: entityId(30_000 + index),
    taskId: state.taskId,
    stateRevision: 0,
    lastEventSequence: 0,
    state,
    stateDigest: sha256CanonicalJson(JsonValueSchema.parse(state)),
    createdAt: at,
  };
  return {
    head: {
      schemaVersion: PersistenceSchemaVersion,
      taskId: state.taskId,
      initializationDigest: sha256CanonicalJson(JsonValueSchema.parse({
        taskId: state.taskId,
        agentDefinition: state.agentDefinition,
        goal: state.goal,
        createdAt: state.createdAt,
      })),
      stateRevision: 0,
      lastEventSequence: 0,
      latestCheckpointId: checkpoint.checkpointId,
      status: state.status,
      updatedAt: at,
    },
    checkpoint,
  };
}

function authorizationTail(count: number): TaskEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    schemaVersion: PersistenceSchemaVersion,
    eventId: entityId(50_000 + index),
    taskId: persistenceIds.task,
    sequence: index + 1,
    type: "authorization.allowed",
    occurredAt: at,
    causationId: entityId(70_000 + index),
    correlationId: persistenceIds.task,
    payload: { authorization: { allowed: true } },
  }));
}

function entityId(value: number): string {
  return `019f7ab2-ec5f-7be0-af01-${String(value).padStart(12, "0")}`;
}
