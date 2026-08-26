import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import {
  FakeClock,
  SqliteConversationPersistence,
  calculateToolCallBatchDigest,
} from "../src/index.js";
import {
  assistantBatchInput,
  batchAt,
  batchIds,
  batchSessionHead,
  effectLinkedDisposition,
  legacyConversationMessage,
  toolResultCompletion,
} from "./tool-call-batch-persistence.fixtures.js";

describe("SQLite ADR17-I1 integration", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })));
  });

  it("preserves batch intent and atomic Tool Result completion across close/reopen", async () => {
    const { databasePath } = await createDatabasePath(directories);
    const first = persistence(databasePath);
    await first.start();
    await first.createSession(batchSessionHead());
    await first.appendAssistantToolCallBatch(assistantBatchInput());
    await first.transitionToolCallDisposition({
      batchId: batchIds.batch,
      toolCallId: batchIds.firstToolCall,
      expectedRevision: 0,
      next: effectLinkedDisposition(),
    });
    await first.appendToolResultAndCompleteDisposition(toolResultCompletion());
    await first.stop();

    const reopened = persistence(databasePath);
    await reopened.start();
    expect(await reopened.loadToolCallBatch(batchIds.batch)).toEqual(assistantBatchInput().batch);
    expect(await reopened.loadToolCallDisposition(
      batchIds.batch,
      batchIds.firstToolCall,
    )).toEqual(toolResultCompletion().completedDisposition);
    expect(await reopened.loadMessageById(batchIds.resultMessage))
      .toEqual(toolResultCompletion().message);
    expect(await reopened.listRecoverableToolCallBatches())
      .toEqual([assistantBatchInput().batch]);
    await reopened.stop();
  });

  it("upgrades a v12 conversation database without rewriting legacy messages", async () => {
    const { databasePath } = await createDatabasePath(directories);
    const seeded = persistence(databasePath);
    await seeded.start();
    await seeded.createSession(batchSessionHead());
    const legacy = legacyConversationMessage();
    await seeded.appendMessage({
      expectedMessageSequence: 0,
      message: legacy,
      updatedAt: batchAt.legacy,
    });
    await seeded.stop();

    const database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("DROP TABLE desktop_reasoning_mode_preference_receipts");
    database.exec("DROP TABLE desktop_reasoning_mode_preferences");
    database.exec("DROP TABLE desktop_experience_owner_scope_namespaces");
    database.exec("DROP TABLE local_personal_invocation_timeout_facts");
    database.exec("DROP TABLE local_personal_provider_usage_facts");
    database.exec("DROP TABLE local_personal_model_invocation_links");
    database.exec("DROP TABLE personal_model_command_receipts");
    database.exec("DROP TABLE personal_model_operations");
    database.exec("DROP TABLE personal_model_preferences");
    database.exec("DROP TABLE personal_model_heads");
    database.exec("DROP TABLE personal_model_status_facts");
    database.exec("DROP TABLE personal_model_definitions");
    database.exec("DROP TABLE personal_model_owner_scope_namespaces");
    database.exec("DROP TABLE task_authorization_selections");
    database.exec("DROP TABLE model_invocation_cache_contexts");
    database.exec("DROP TABLE prompt_cache_scope_namespaces");
    database.exec("DROP TABLE provider_usage_projections");
    database.exec("DROP TABLE compaction_model_invocation_links");
    database.exec("DROP TABLE model_invocation_links");
    database.exec("DROP TABLE compaction_execution_bindings");
    database.exec("DROP TABLE artifact_lifecycle_records");
    database.exec("DROP TABLE manual_artifact_registrations");
    database.exec("DROP TABLE tool_call_dispositions");
    database.exec("DROP TABLE tool_call_batches");
    database.prepare("DELETE FROM schema_migrations WHERE migration_id >= 13").run();
    database.close();

    const upgraded = persistence(databasePath);
    await upgraded.start();
    expect(await upgraded.loadMessageById(batchIds.legacyMessage)).toEqual(legacy);
    const input = batchAtSequenceTwo();
    expect(await upgraded.appendAssistantToolCallBatch(input)).toMatchObject({
      ok: true,
      replayed: false,
    });
    expect((await upgraded.loadSession(batchIds.session))?.messageSequence).toBe(2);
    await upgraded.stop();

    const inspection = new DatabaseSync(databasePath, { readOnly: true });
    expect(inspection.prepare(
      "SELECT COUNT(*) AS count FROM schema_migrations WHERE migration_id = 13",
    ).get()).toMatchObject({ count: 1 });
    expect(inspection.prepare(
      "SELECT COUNT(*) AS count FROM tool_call_dispositions",
    ).get()).toMatchObject({ count: 2 });
    inspection.close();
  });
});

function persistence(databasePath: string): SqliteConversationPersistence {
  return new SqliteConversationPersistence({
    databasePath,
    clock: new FakeClock(batchAt.created),
  });
}

async function createDatabasePath(directories: string[]): Promise<{ databasePath: string }> {
  const directory = await mkdtemp(join(tmpdir(), "robothree-adr17-i1-sqlite-"));
  directories.push(directory);
  return { databasePath: join(directory, "robothree.sqlite") };
}

function batchAtSequenceTwo(): ReturnType<typeof assistantBatchInput> {
  const input = assistantBatchInput();
  input.expectedMessageSequence = 1;
  input.message.envelope.sequence = 2;
  input.batch.assistantMessageSequence = 2;
  input.batch.batchDigest = calculateToolCallBatchDigest({
    sessionId: input.batch.sessionId,
    taskId: input.batch.taskId,
    runId: input.batch.runId,
    assistantMessageId: input.batch.assistantMessageId,
    assistantMessageSequence: input.batch.assistantMessageSequence,
    assistantMessageDigest: input.batch.assistantMessageDigest,
    toolCalls: input.message.message.toolCalls,
  });
  return input;
}
