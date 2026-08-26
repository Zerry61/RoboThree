import { DatabaseSync } from "node:sqlite";

import type { Clock } from "../../ports/clock.js";
import {
  ModelInvocationLinkSchema,
  type ModelInvocationLink,
  type ModelInvocationLinkPersistence,
  type ModelInvocationLinkWriteResult,
  type PrepareModelInvocationLinkInput,
} from "../../ports/model-invocation-link-persistence.js";
import {
  calculateModelInvocationLinkDigest,
  samePreparedModelInvocationLink,
} from "../../application/model-invocation-link-digest.js";
import { configureSqlite, migrateAndPreflight } from "./schema-preflight.js";

export type SqliteModelInvocationLinkFaultPoint =
  | "before_l1_commit"
  | "after_l1_commit_before_response"
  | "before_l2_commit"
  | "after_l2_commit_before_response"
  | "before_l3_commit"
  | "after_l3_commit_before_response";

export class SqliteModelInvocationLinkPersistence
implements ModelInvocationLinkPersistence {
  readonly #databasePath: string;
  readonly #clock: Clock;
  readonly #faultInjector: ((point: SqliteModelInvocationLinkFaultPoint) => void) | undefined;
  #database: DatabaseSync | undefined;

  public constructor(input: {
    databasePath: string;
    clock: Clock;
    faultInjector?: (point: SqliteModelInvocationLinkFaultPoint) => void;
  }) {
    this.#databasePath = input.databasePath;
    this.#clock = input.clock;
    this.#faultInjector = input.faultInjector;
  }

  async start(): Promise<void> {
    if (this.#database !== undefined) return;
    const database = new DatabaseSync(this.#databasePath, { allowExtension: false });
    try {
      configureSqlite(database);
      migrateAndPreflight(database, this.#clock);
      database.enableDefensive(true);
      this.#database = database;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.#database?.close();
    this.#database = undefined;
  }

  async loadByClientRequestId(clientRequestId: string): Promise<ModelInvocationLink | undefined> {
    return selectOne(this.#requireDatabase(), "client_request_id", clientRequestId);
  }

  async loadRound(taskId: string, runId: string, round: number): Promise<ModelInvocationLink | undefined> {
    const row = this.#requireDatabase().prepare(`
      SELECT record_json FROM model_invocation_links
      WHERE task_id = ? AND run_id = ? AND round = ?
    `).get(taskId, runId, round) as Record<string, unknown> | undefined;
    return parseRow(row);
  }

  async listIncomplete(limit: number): Promise<readonly ModelInvocationLink[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error("Model invocation link recovery limit must be between 1 and 1000");
    }
    const rows = this.#requireDatabase().prepare(`
      SELECT record_json FROM model_invocation_links
      WHERE message_committed_at IS NULL
      ORDER BY created_at, client_request_id LIMIT ?
    `).all(limit) as Record<string, unknown>[];
    return rows.map((row) => parseRow(row)!);
  }

  async prepare(input: PrepareModelInvocationLinkInput): Promise<ModelInvocationLinkWriteResult> {
    const material = { ...input, updatedAt: input.createdAt };
    const record = validate({
      ...material,
      recordDigest: calculateModelInvocationLinkDigest(material),
    });
    const database = this.#requireDatabase();
    const existing = selectOne(database, "client_request_id", record.clientRequestId)
      ?? this.#loadRoundSync(record.taskId, record.runId, record.round);
    if (existing !== undefined) {
      return samePreparedModelInvocationLink(existing, input)
        ? success(existing, true)
        : conflict("Model invocation round or clientRequestId already has different facts");
    }
    let committed = false;
    try {
      database.exec("BEGIN IMMEDIATE");
      this.#faultInjector?.("before_l1_commit");
      insert(database, record);
      database.exec("COMMIT");
      committed = true;
      this.#faultInjector?.("after_l1_commit_before_response");
      return success(record, false);
    } catch (error) {
      rollback(database);
      if (committed) throw error;
      const concurrent = selectOne(database, "client_request_id", record.clientRequestId)
        ?? this.#loadRoundSync(record.taskId, record.runId, record.round);
      if (concurrent !== undefined) {
        return samePreparedModelInvocationLink(concurrent, input)
          ? success(concurrent, true)
          : conflict("Concurrent Model invocation link has different facts");
      }
      throw error;
    }
  }

  async recordAccepted(input: Parameters<ModelInvocationLinkPersistence["recordAccepted"]>[0]): Promise<ModelInvocationLinkWriteResult> {
    return this.#advance(
      input.clientRequestId,
      input.expectedRecordDigest,
      "before_l2_commit",
      "after_l2_commit_before_response",
      (record) => ({
        ...record,
        invocationId: input.invocationId,
        statusRevision: input.statusRevision,
        ...(input.durableCursor === undefined ? {} : { durableCursor: input.durableCursor }),
        acceptedAt: input.acceptedAt,
        updatedAt: input.acceptedAt,
      }),
    );
  }

  async recordStreamProgress(input: Parameters<ModelInvocationLinkPersistence["recordStreamProgress"]>[0]): Promise<ModelInvocationLinkWriteResult> {
    return this.#advance(
      input.clientRequestId,
      input.expectedRecordDigest,
      "before_l2_commit",
      "after_l2_commit_before_response",
      (record) => ({
        ...record,
        statusRevision: input.statusRevision,
        ...(input.durableCursor === undefined ? {} : { durableCursor: input.durableCursor }),
        ...(record.outputStartedAt !== undefined
          ? {}
          : input.outputStartedAt === undefined ? {} : { outputStartedAt: input.outputStartedAt }),
        updatedAt: input.updatedAt,
      }),
    );
  }

  async recordMessageCommitted(input: Parameters<ModelInvocationLinkPersistence["recordMessageCommitted"]>[0]): Promise<ModelInvocationLinkWriteResult> {
    return this.#advance(
      input.clientRequestId,
      input.expectedRecordDigest,
      "before_l3_commit",
      "after_l3_commit_before_response",
      (record) => ({
        ...record,
        messageCommittedAt: input.messageCommittedAt,
        updatedAt: input.messageCommittedAt,
      }),
    );
  }

  #loadRoundSync(taskId: string, runId: string, round: number): ModelInvocationLink | undefined {
    const row = this.#requireDatabase().prepare(`
      SELECT record_json FROM model_invocation_links
      WHERE task_id = ? AND run_id = ? AND round = ?
    `).get(taskId, runId, round) as Record<string, unknown> | undefined;
    return parseRow(row);
  }

  #advance(
    clientRequestId: string,
    expectedRecordDigest: string,
    before: SqliteModelInvocationLinkFaultPoint,
    after: SqliteModelInvocationLinkFaultPoint,
    mutate: (record: ModelInvocationLink) => Omit<ModelInvocationLink, "recordDigest">,
  ): ModelInvocationLinkWriteResult {
    const database = this.#requireDatabase();
    const existing = selectOne(database, "client_request_id", clientRequestId);
    if (existing === undefined) return notFound();
    if (existing.recordDigest !== expectedRecordDigest) return stale();
    const material = mutate(existing);
    const updated = validate({
      ...material,
      recordDigest: calculateModelInvocationLinkDigest(material),
    });
    database.exec("BEGIN IMMEDIATE");
    try {
      const current = selectOne(database, "client_request_id", clientRequestId);
      if (current?.recordDigest !== expectedRecordDigest) {
        rollback(database);
        return stale();
      }
      this.#faultInjector?.(before);
      update(database, updated, expectedRecordDigest);
      database.exec("COMMIT");
      this.#faultInjector?.(after);
      return success(updated, false);
    } catch (error) {
      rollback(database);
      throw error;
    }
  }

  #requireDatabase(): DatabaseSync {
    if (this.#database === undefined) throw new Error("Model invocation link persistence is not started");
    return this.#database;
  }
}

function insert(database: DatabaseSync, record: ModelInvocationLink): void {
  database.prepare(`
    INSERT INTO model_invocation_links (
      client_request_id, task_id, run_id, step_id, action_id, round,
      runtime_selection_digest, assistant_message_id, model_request_id,
      model_request_digest, confirmation_id, scope_digest, data_scope_digest,
      central_accept_request_digest, invocation_id, status_revision,
      durable_cursor, accepted_at, output_started_at, message_committed_at,
      record_digest, created_at, updated_at, record_json
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(...values(record));
}

function update(database: DatabaseSync, record: ModelInvocationLink, expectedDigest: string): void {
  const result = database.prepare(`
    UPDATE model_invocation_links SET
      invocation_id = ?, status_revision = ?, durable_cursor = ?, accepted_at = ?,
      output_started_at = ?, message_committed_at = ?, record_digest = ?,
      updated_at = ?, record_json = ?
    WHERE client_request_id = ? AND record_digest = ?
  `).run(
    record.invocationId ?? null,
    record.statusRevision ?? null,
    record.durableCursor ?? null,
    record.acceptedAt ?? null,
    record.outputStartedAt ?? null,
    record.messageCommittedAt ?? null,
    record.recordDigest,
    record.updatedAt,
    JSON.stringify(record),
    record.clientRequestId,
    expectedDigest,
  );
  if (result.changes !== 1) throw new Error("Model invocation link CAS update failed");
}

function values(record: ModelInvocationLink): readonly (string | number | null)[] {
  return [
    record.clientRequestId, record.taskId, record.runId, record.stepId, record.actionId,
    record.round, record.runtimeSelectionDigest, record.assistantMessageId,
    record.modelRequestId, record.modelRequestDigest, record.confirmationId,
    record.scopeDigest, record.dataScopeDigest, record.centralAcceptRequestDigest,
    record.invocationId ?? null, record.statusRevision ?? null, record.durableCursor ?? null,
    record.acceptedAt ?? null, record.outputStartedAt ?? null,
    record.messageCommittedAt ?? null, record.recordDigest, record.createdAt,
    record.updatedAt, JSON.stringify(record),
  ];
}

function selectOne(database: DatabaseSync, column: "client_request_id", value: string): ModelInvocationLink | undefined {
  const row = database.prepare(
    `SELECT record_json FROM model_invocation_links WHERE ${column} = ?`,
  ).get(value) as Record<string, unknown> | undefined;
  return parseRow(row);
}
function parseRow(row: Record<string, unknown> | undefined): ModelInvocationLink | undefined {
  if (row === undefined || typeof row.record_json !== "string") return undefined;
  return ModelInvocationLinkSchema.parse(JSON.parse(row.record_json) as unknown);
}
function validate(record: ModelInvocationLink): ModelInvocationLink {
  return ModelInvocationLinkSchema.parse(record);
}
function success(value: ModelInvocationLink, replayed: boolean): ModelInvocationLinkWriteResult {
  return { ok: true, replayed, value: ModelInvocationLinkSchema.parse(value) };
}
function conflict(message: string): ModelInvocationLinkWriteResult {
  return { ok: false, error: { code: "model_invocation_link.conflict", message } };
}
function stale(): ModelInvocationLinkWriteResult {
  return { ok: false, error: { code: "model_invocation_link.stale_revision", message: "Model invocation link revision changed" } };
}
function notFound(): ModelInvocationLinkWriteResult {
  return { ok: false, error: { code: "model_invocation_link.not_found", message: "Model invocation link does not exist" } };
}
function rollback(database: DatabaseSync): void {
  try { database.exec("ROLLBACK"); } catch { /* preserve original failure */ }
}
