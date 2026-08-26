import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  LATEST_SQLITE_SCHEMA_VERSION,
  SqliteConversationPersistence,
  SqliteTaskPersistence,
  TurnSnapshotBuilder,
  readSchemaVersion,
  sqliteMigrations,
} from "../src/index.js";
import { conversationMessage, initialSessionHead } from "./conversation-persistence.fixtures.js";
import {
  seedTurnFixture,
  turnAt,
  turnIds,
} from "./turn-snapshot.fixtures.js";

describe("KAF-5.1 SQLite rich conversation recovery", () => {
  it("preserves rich messages, Task associations, projection order, and digest across close/reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf51-reopen-"));
    const databasePath = join(directory, "robothree.sqlite");
    try {
      const clock = new FakeClock(turnAt.created);
      const firstTasks = new SqliteTaskPersistence({ databasePath, clock });
      const firstConversation = new SqliteConversationPersistence({ databasePath, clock });
      await firstTasks.start();
      await firstConversation.start();
      const messages = await seedTurnFixture(firstConversation, firstTasks);
      const expected = await new TurnSnapshotBuilder({
        conversationPersistence: firstConversation,
        taskPersistence: firstTasks,
      }).build({
        snapshotId: turnIds.snapshot,
        sessionId: turnIds.session,
        createdAt: turnAt.snapshot,
      });
      await firstConversation.stop();
      await firstTasks.stop();

      const secondTasks = new SqliteTaskPersistence({ databasePath, clock });
      const secondConversation = new SqliteConversationPersistence({ databasePath, clock });
      await secondTasks.start();
      await secondConversation.start();
      expect(await secondConversation.loadMessageRange(turnIds.session, 1, 7)).toEqual(messages);
      expect(await secondTasks.listTasksBySession(turnIds.session)).toHaveLength(2);
      const restored = await new TurnSnapshotBuilder({
        conversationPersistence: secondConversation,
        taskPersistence: secondTasks,
      }).build({
        snapshotId: turnIds.snapshot,
        sessionId: turnIds.session,
        createdAt: turnAt.snapshot,
      });
      expect(restored).toEqual(expected);
      await secondConversation.stop();
      await secondTasks.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("migrates schema 5 to 6 but fails closed when a legacy envelope has no rich content", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf51-legacy-envelope-"));
    const databasePath = join(directory, "robothree.sqlite");
    try {
      const database = new DatabaseSync(databasePath);
      for (const migration of sqliteMigrations.slice(0, 5)) {
        database.exec(migration.sql);
        database.prepare(
          "INSERT INTO schema_migrations (migration_id, name, applied_at) VALUES (?, ?, ?)",
        ).run(migration.id, migration.name, turnAt.created);
      }
      const head = initialSessionHead();
      database.prepare(`
        INSERT INTO session_heads (
          session_id, schema_version, message_sequence, session_event_sequence,
          context_revision, active_compaction_id, created_at, updated_at, head_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        head.sessionId,
        head.schemaVersion,
        1,
        head.sessionEventSequence,
        head.contextRevision,
        null,
        head.createdAt,
        turnAt.snapshot,
        JSON.stringify({ ...head, messageSequence: 1, updatedAt: turnAt.snapshot }),
      );
      const envelope = conversationMessage(1).envelope;
      database.prepare(`
        INSERT INTO conversation_messages (
          message_id, session_id, sequence, schema_version, message_schema_version,
          message_digest, task_id, created_at, message_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        envelope.messageId,
        envelope.sessionId,
        envelope.sequence,
        envelope.schemaVersion,
        envelope.messageSchemaVersion,
        envelope.messageDigest,
        null,
        envelope.createdAt,
        JSON.stringify(envelope),
      );
      database.close();

      const persistence = new SqliteConversationPersistence({
        databasePath,
        clock: new FakeClock(turnAt.created),
      });
      await persistence.start();
      const inspection = new DatabaseSync(databasePath, { readOnly: true });
      expect(readSchemaVersion(inspection)).toBe(LATEST_SQLITE_SCHEMA_VERSION);
      inspection.close();
      await expect(persistence.loadMessageRange(envelope.sessionId, 1, 1))
        .rejects.toThrow("pre-KAF-5.1 envelope without rich content");
      await persistence.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when persisted rich content JSON is corrupted", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf51-corrupt-content-"));
    const databasePath = join(directory, "robothree.sqlite");
    try {
      const persistence = new SqliteConversationPersistence({
        databasePath,
        clock: new FakeClock(turnAt.created),
      });
      await persistence.start();
      await persistence.createSession(initialSessionHead());
      await persistence.appendMessage({
        expectedMessageSequence: 0,
        message: conversationMessage(1),
        updatedAt: turnAt.snapshot,
      });
      await persistence.stop();
      const database = new DatabaseSync(databasePath);
      database.prepare(
        "UPDATE conversation_messages SET content_json = ? WHERE message_id = ?",
      ).run(JSON.stringify({
        schemaVersion: "v1alpha1",
        role: "user",
        content: [{ type: "text", text: "tampered after persistence" }],
      }), conversationMessage(1).envelope.messageId);
      database.close();

      const reopened = new SqliteConversationPersistence({
        databasePath,
        clock: new FakeClock(turnAt.created),
      });
      await reopened.start();
      await expect(reopened.loadMessageRange(initialSessionHead().sessionId, 1, 1))
        .rejects.toThrow("does not match messageDigest");
      await reopened.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
