import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  LATEST_SQLITE_SCHEMA_VERSION,
  SqliteConversationPersistence,
  readSchemaVersion,
  sqliteMigrations,
} from "../src/index.js";
import type { ConversationPersistence } from "../src/index.js";
import {
  commitCompactionInput,
  conversationAt,
  conversationIds,
  conversationMessage,
  initialSessionHead,
  requestCompactionInput,
} from "./conversation-persistence.fixtures.js";
import {
  firstAcceptedCommit,
  initialPersistedTask,
} from "./task-persistence.fixtures.js";

describe("SqliteConversationPersistence integration", () => {
  it("applies migrations through the current durable Prompt Cache schema", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf50-schema-"));
    const databasePath = join(directory, "robothree.sqlite");
    try {
      const persistence = new SqliteConversationPersistence({
        databasePath,
        clock: new FakeClock(conversationAt.created),
      });
      await persistence.start();
      await persistence.stop();

      const database = new DatabaseSync(databasePath, { readOnly: true });
      expect(readSchemaVersion(database)).toBe(LATEST_SQLITE_SCHEMA_VERSION);
      expect(LATEST_SQLITE_SCHEMA_VERSION).toBe(26);
      for (const table of [
        "session_heads",
        "conversation_messages",
        "session_events",
        "session_command_receipts",
        "compaction_jobs",
        "compaction_records",
        "compaction_execution_bindings",
        "compaction_model_invocation_links",
        "provider_usage_projections",
        "prompt_cache_scope_namespaces",
        "model_invocation_cache_contexts",
        "desktop_workspace_grants",
        "desktop_session_metadata",
        "desktop_session_create_intents",
        "desktop_command_receipts",
        "conversation_message_intents",
        "task_submit_turn_bindings",
        "submit_turn_records",
        "submit_turn_receipts",
        "desktop_delivery_records",
        "tool_call_batches",
        "tool_call_dispositions",
        "model_invocation_links",
        "artifact_lifecycle_records",
        "manual_artifact_registrations",
        "personal_model_owner_scope_namespaces",
        "personal_model_definitions",
        "personal_model_heads",
        "personal_model_status_facts",
        "personal_model_preferences",
        "personal_model_operations",
        "personal_model_command_receipts",
      ]) {
        expect(database.prepare(
          "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
        ).get(table)).toEqual({ present: 1 });
      }
      const outboxColumns = database.prepare("PRAGMA table_info(outbox)").all() as { name: string }[];
      expect(outboxColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
        "task_event_id",
        "session_event_id",
        "task_id",
        "session_id",
      ]));
      const index = database.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'index' AND name = 'compaction_jobs_one_pending_per_session_idx'
      `).get() as { sql: string };
      expect(index.sql.toLowerCase()).toContain("unique index");
      expect(index.sql.toLowerCase()).toContain("where status = 'pending'");
      const messageForeignKeys = database.prepare(
        "PRAGMA foreign_key_list(conversation_messages)",
      ).all() as { table: string }[];
      expect(messageForeignKeys.map((foreignKey) => foreignKey.table))
        .not.toContain("task_heads");
      expect(database.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
      expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      database.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("upgrades a complete migration-4 database through the latest migration exactly once", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf50-upgrade-"));
    const databasePath = join(directory, "robothree.sqlite");
    try {
      const database = new DatabaseSync(databasePath);
      for (const migration of sqliteMigrations.slice(0, 4)) {
        database.exec(migration.sql);
        database.prepare(
          "INSERT INTO schema_migrations (migration_id, name, applied_at) VALUES (?, ?, ?)",
        ).run(migration.id, migration.name, conversationAt.created);
      }
      const task = initialPersistedTask();
      const accepted = firstAcceptedCommit();
      database.prepare(`
        INSERT INTO task_heads (
          task_id, schema_version, initialization_digest, state_revision,
          last_event_sequence, latest_checkpoint_id, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        task.head.taskId,
        task.head.schemaVersion,
        task.head.initializationDigest,
        task.head.stateRevision,
        task.head.lastEventSequence,
        task.head.latestCheckpointId,
        task.head.status,
        task.head.updatedAt,
      );
      database.prepare(`
        INSERT INTO task_events (
          event_id, task_id, sequence, type, occurred_at, causation_id,
          correlation_id, event_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        accepted.event.eventId,
        accepted.event.taskId,
        accepted.event.sequence,
        accepted.event.type,
        accepted.event.occurredAt,
        accepted.event.causationId,
        accepted.event.correlationId,
        JSON.stringify(accepted.event),
      );
      const taskOutbox = accepted.outbox[0]!;
      database.prepare(`
        INSERT INTO outbox (
          outbox_id, event_id, task_id, destination, attempt_count,
          created_at, next_attempt_at, published_at, record_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskOutbox.outboxId,
        taskOutbox.eventId,
        taskOutbox.taskId,
        taskOutbox.destination,
        taskOutbox.attemptCount,
        taskOutbox.createdAt,
        taskOutbox.nextAttemptAt ?? null,
        taskOutbox.publishedAt ?? null,
        JSON.stringify(taskOutbox),
      );
      expect(readSchemaVersion(database)).toBe(4);
      database.close();

      for (let cycle = 0; cycle < 2; cycle += 1) {
        const persistence = new SqliteConversationPersistence({
          databasePath,
          clock: new FakeClock(conversationAt.created),
        });
        await persistence.start();
        await persistence.stop();
      }
      const inspection = new DatabaseSync(databasePath, { readOnly: true });
      expect(readSchemaVersion(inspection)).toBe(LATEST_SQLITE_SCHEMA_VERSION);
      expect(inspection.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get())
        .toEqual({ count: LATEST_SQLITE_SCHEMA_VERSION });
      expect(inspection.prepare(`
        SELECT event_id, task_event_id, task_id, session_event_id, session_id, record_json
        FROM outbox
      `).get()).toEqual({
        event_id: taskOutbox.eventId,
        task_event_id: taskOutbox.eventId,
        task_id: taskOutbox.taskId,
        session_event_id: null,
        session_id: null,
        record_json: JSON.stringify(taskOutbox),
      });
      inspection.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("recovers the pending Job and accepted receipt after a crash following T1 commit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf50-t1-crash-"));
    const databasePath = join(directory, "robothree.sqlite");
    try {
      const first = sqlitePersistence(databasePath, (point) => {
        if (point === "request_compaction.after_commit") throw new Error("fixture crash after T1");
      });
      await first.start();
      await seedTwoMessages(first);
      expect(await first.requestCompaction(requestCompactionInput())).toMatchObject({
        ok: false,
        error: { code: "persistence.sqlite_write_failed" },
      });
      await first.stop();

      const recovered = sqlitePersistence(databasePath);
      await recovered.start();
      expect(await recovered.listPendingCompactionJobs()).toMatchObject([{
        compactionJobId: conversationIds.job,
        status: "pending",
      }]);
      expect(await recovered.requestCompaction(requestCompactionInput())).toMatchObject({
        ok: true,
        replayed: true,
      });
      await recovered.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rolls back Job, binding, Event and Receipt when T1 fails between Job and binding", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-arh21-binding-atomicity-"));
    const databasePath = join(directory, "robothree.sqlite");
    try {
      const persistence = sqlitePersistence(databasePath, (point) => {
        if (point === "request_compaction.after_job_before_binding") {
          throw new Error("fixture failure before binding");
        }
      });
      await persistence.start();
      await seedTwoMessages(persistence);
      expect(await persistence.requestCompaction(requestCompactionInput())).toMatchObject({
        ok: false,
        error: { code: "persistence.sqlite_write_failed" },
      });
      expect(await persistence.listPendingCompactionJobs()).toEqual([]);
      expect(await persistence.loadCompactionExecutionBinding(conversationIds.job)).toBeUndefined();
      expect(await persistence.loadSessionEventsAfter(conversationIds.session, 0)).toEqual([]);
      expect(await persistence.findSessionCommandReceipt(conversationIds.requestCommand))
        .toBeUndefined();
      await persistence.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("commits a previously acquired summary after close/reopen without creating another Job", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf50-between-tx-"));
    const databasePath = join(directory, "robothree.sqlite");
    try {
      const first = sqlitePersistence(databasePath);
      await first.start();
      await seedTwoMessages(first);
      await first.requestCompaction(requestCompactionInput());
      await first.stop();

      const recovered = sqlitePersistence(databasePath);
      await recovered.start();
      expect(await recovered.commitCompaction(commitCompactionInput())).toMatchObject({
        ok: true,
        replayed: false,
      });
      expect(await recovered.listPendingCompactionJobs()).toEqual([]);
      expect(await recovered.loadCompactionRecord(conversationIds.compaction)).toBeDefined();
      await recovered.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("replays T2 after a crash following commit without duplicating Record, Event, Receipt, or Outbox", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf50-t2-crash-"));
    const databasePath = join(directory, "robothree.sqlite");
    try {
      const first = sqlitePersistence(databasePath, (point) => {
        if (point === "commit_compaction.after_commit") throw new Error("fixture crash after T2");
      });
      await first.start();
      await seedTwoMessages(first);
      await first.requestCompaction(requestCompactionInput());
      expect(await first.commitCompaction(commitCompactionInput())).toMatchObject({
        ok: false,
        error: { code: "persistence.sqlite_write_failed" },
      });
      await first.stop();

      const recovered = sqlitePersistence(databasePath);
      await recovered.start();
      expect(await recovered.commitCompaction(commitCompactionInput())).toMatchObject({
        ok: true,
        replayed: true,
      });
      expect(await recovered.loadSession(conversationIds.session)).toMatchObject({
        contextRevision: 1,
        activeCompactionId: conversationIds.compaction,
      });
      await recovered.stop();

      const database = new DatabaseSync(databasePath, { readOnly: true });
      for (const table of [
        "compaction_records",
        "session_command_receipts",
      ]) {
        expect(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({
          count: table === "session_command_receipts" ? 2 : 1,
        });
      }
      expect(database.prepare("SELECT COUNT(*) AS count FROM session_events").get()).toEqual({
        count: 2,
      });
      expect(database.prepare(
        "SELECT COUNT(*) AS count FROM outbox WHERE session_id = ?",
      ).get(conversationIds.session)).toEqual({ count: 2 });
      database.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when a claimed current schema loses a required index", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf50-corrupt-index-"));
    const databasePath = join(directory, "robothree.sqlite");
    try {
      const initial = sqlitePersistence(databasePath);
      await initial.start();
      await initial.stop();
      const database = new DatabaseSync(databasePath);
      database.exec("DROP INDEX compaction_jobs_one_pending_per_session_idx");
      database.close();

      const corrupted = sqlitePersistence(databasePath);
      await expect(corrupted.start()).rejects.toThrow(
        "missing required index compaction_jobs_one_pending_per_session_idx",
      );
      expect(await corrupted.health()).toMatchObject({
        status: "unavailable",
        details: { startupError: expect.stringContaining("missing required index") },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function sqlitePersistence(
  databasePath: string,
  faultInjector?: ConstructorParameters<typeof SqliteConversationPersistence>[0]["faultInjector"],
): SqliteConversationPersistence {
  return new SqliteConversationPersistence({
    databasePath,
    clock: new FakeClock(conversationAt.created),
    ...(faultInjector === undefined ? {} : { faultInjector }),
  });
}

async function seedTwoMessages(persistence: ConversationPersistence): Promise<void> {
  await persistence.createSession(initialSessionHead());
  await persistence.appendMessage({
    expectedMessageSequence: 0,
    message: conversationMessage(1),
    updatedAt: conversationAt.message1,
  });
  await persistence.appendMessage({
    expectedMessageSequence: 1,
    message: conversationMessage(2),
    updatedAt: conversationAt.message2,
  });
}
