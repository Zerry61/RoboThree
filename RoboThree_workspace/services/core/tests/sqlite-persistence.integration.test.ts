import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";
import { TaskCommandSchema } from "@robothree/contracts";

import {
  DurableTaskRuntime,
  FakeClock,
  FakeIdGenerator,
  FakeToolExecutionBackend,
  LATEST_SQLITE_SCHEMA_VERSION,
  SqliteTaskPersistence,
  RuntimeAdapterHandles,
  readSchemaVersion,
} from "../src/index.js";
import {
  firstAcceptedCommit,
  initialPersistedTask,
  persistenceAt,
  persistenceIds,
} from "./task-persistence.fixtures.js";
import { capabilityLock } from "./capability.fixtures.js";

describe("SqliteTaskPersistence integration", () => {
  it("restores a DurableTaskRuntime snapshot after closing and reopening SQLite", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf22-runtime-reopen-"));
    const databasePath = join(directory, "robothree.sqlite");
    const clock = new FakeClock(persistenceAt.command);
    try {
      const firstPersistence = new SqliteTaskPersistence({ databasePath, clock });
      await firstPersistence.start();
      await firstPersistence.createTask(initialPersistedTask());
      const expected = firstAcceptedCommit();
      const firstRuntime = new DurableTaskRuntime({
        persistence: firstPersistence,
        idGenerator: new FakeIdGenerator([
          expected.event.eventId,
          expected.checkpoint.checkpointId,
          expected.outbox[0]!.outboxId,
        ]),
      });
      const command = TaskCommandSchema.parse(expected.event.payload.command);
      expect(await firstRuntime.dispatch(command)).toMatchObject({ accepted: true, state: { revision: 1 } });
      await firstPersistence.stop();

      const secondPersistence = new SqliteTaskPersistence({ databasePath, clock });
      await secondPersistence.start();
      const restartedRuntime = new DurableTaskRuntime({
        persistence: secondPersistence,
        idGenerator: new FakeIdGenerator([]),
      });
      expect(await restartedRuntime.snapshot(persistenceIds.task)).toEqual(expected.checkpoint.state);
      expect(await secondPersistence.listPendingOutbox(10)).toHaveLength(1);
      await secondPersistence.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reopens a file database without rerunning migrations and preserves committed state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf21-reopen-"));
    const databasePath = join(directory, "robothree.sqlite");
    const clock = new FakeClock(persistenceAt.command);
    try {
      const first = new SqliteTaskPersistence({ databasePath, clock });
      await first.start();
      await first.createTask(initialPersistedTask());
      const lock = capabilityLock();
      expect(await first.commitTaskCapabilityLock(lock)).toMatchObject({ ok: true, replayed: false });
      const committed = await first.commitAcceptedCommand(firstAcceptedCommit());
      expect(committed.ok).toBe(true);
      await first.stop();

      const second = new SqliteTaskPersistence({ databasePath, clock });
      await second.start();
      expect(await second.loadTask(persistenceIds.task)).toEqual(committed.ok ? committed.value : undefined);
      expect(await second.findCommandReceipt(persistenceIds.command1)).toEqual(firstAcceptedCommit().receipt);
      expect(await second.loadTaskCapabilityLock(persistenceIds.task, "tool.echo")).toEqual(lock);
      const rebuiltBackend = new FakeToolExecutionBackend({
        adapterDescriptorId: lock.adapterDescriptorSnapshot.adapterDescriptorId,
        adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
      });
      const rebuiltHandles = new RuntimeAdapterHandles([rebuiltBackend]);
      expect(rebuiltHandles.toolExecutionBackend(
        lock.adapterDescriptorSnapshot.adapterDescriptorId,
        lock.adapterDescriptorSnapshot.revision,
      )).toBe(rebuiltBackend);
      await second.stop();

      const inspection = new DatabaseSync(databasePath, { readOnly: true });
      expect(readSchemaVersion(inspection)).toBe(LATEST_SQLITE_SCHEMA_VERSION);
      const migrations = inspection.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as { count: number };
      expect(migrations.count).toBe(LATEST_SQLITE_SCHEMA_VERSION);
      const expectedRows = {
        task_heads: 1,
        task_events: 1,
        task_checkpoints: 2,
        command_receipts: 1,
        outbox: 1,
        task_capability_locks: 1,
      } as const;
      for (const [table, expectedCount] of Object.entries(expectedRows)) {
        const row = inspection.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
        expect(row.count, `${table} must contain the expected durable records`).toBe(expectedCount);
      }
      inspection.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("survives repeated restart and preflight cycles without schema or durable-state drift", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf43-restart-cycle-"));
    const databasePath = join(directory, "robothree.sqlite");
    const clock = new FakeClock(persistenceAt.command);
    try {
      const initial = new SqliteTaskPersistence({ databasePath, clock });
      await initial.start();
      await initial.createTask(initialPersistedTask());
      await initial.commitAcceptedCommand(firstAcceptedCommit());
      await initial.stop();

      for (let cycle = 0; cycle < 20; cycle += 1) {
        const restarted = new SqliteTaskPersistence({ databasePath, clock });
        await restarted.start();
        expect(await restarted.loadTask(persistenceIds.task)).toMatchObject({
          head: { stateRevision: 1, lastEventSequence: 1 },
          checkpoint: { state: { status: "running", revision: 1 } },
        });
        expect(await restarted.listPendingOutbox(100)).toHaveLength(1);
        await restarted.stop();
      }

      const inspection = new DatabaseSync(databasePath, { readOnly: true });
      expect(readSchemaVersion(inspection)).toBe(LATEST_SQLITE_SCHEMA_VERSION);
      expect(inspection.prepare("PRAGMA integrity_check").get()).toMatchObject({
        integrity_check: "ok",
      });
      expect(inspection.prepare("SELECT COUNT(*) AS count FROM task_events").get()).toMatchObject({
        count: 1,
      });
      inspection.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves Outbox backoff across close/reopen and only selects due records", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf42-outbox-reopen-"));
    const databasePath = join(directory, "robothree.sqlite");
    const clock = new FakeClock(persistenceAt.command);
    try {
      const first = new SqliteTaskPersistence({ databasePath, clock });
      await first.start();
      await first.createTask(initialPersistedTask());
      await first.commitAcceptedCommand(firstAcceptedCommit());
      expect(await first.recordOutboxAttempt({
        outboxId: persistenceIds.outbox1,
        expectedAttemptCount: 0,
        nextAttemptAt: persistenceAt.command2,
      })).toMatchObject({
        ok: true,
        value: { attemptCount: 1, nextAttemptAt: persistenceAt.command2 },
      });
      await first.stop();

      const second = new SqliteTaskPersistence({ databasePath, clock });
      await second.start();
      expect(await second.listPendingOutbox(10, persistenceAt.command)).toEqual([]);
      expect(await second.listPendingOutbox(10, persistenceAt.command2)).toMatchObject([{
        outboxId: persistenceIds.outbox1,
        attemptCount: 1,
        nextAttemptAt: persistenceAt.command2,
      }]);
      await second.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when the database schema is newer than the binary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf21-newer-"));
    const databasePath = join(directory, "robothree.sqlite");
    try {
      const database = new DatabaseSync(databasePath);
      database.exec(`
        CREATE TABLE schema_migrations (
          migration_id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        ) STRICT;
        INSERT INTO schema_migrations VALUES (999, 'future', '2026-07-20T13:00:00.000Z');
      `);
      database.close();

      const persistence = new SqliteTaskPersistence({
        databasePath,
        clock: new FakeClock(persistenceAt.command),
      });
      await expect(persistence.start()).rejects.toThrow("newer than supported");
      expect(await persistence.health()).toMatchObject({
        status: "unavailable",
        details: { startupError: expect.stringContaining("newer than supported") },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when a claimed current schema is missing required tables", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf21-corrupt-"));
    const databasePath = join(directory, "robothree.sqlite");
    try {
      const database = new DatabaseSync(databasePath);
      database.exec(`
        CREATE TABLE schema_migrations (
          migration_id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        ) STRICT;
        INSERT INTO schema_migrations VALUES (1, 'incomplete', '2026-07-20T13:00:00.000Z');
      `);
      database.close();

      const persistence = new SqliteTaskPersistence({
        databasePath,
        clock: new FakeClock(persistenceAt.command),
      });
      await expect(persistence.start()).rejects.toThrow("missing required table task_heads");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
