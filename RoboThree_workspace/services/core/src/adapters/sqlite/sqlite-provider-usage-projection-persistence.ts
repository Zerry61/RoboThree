import { DatabaseSync } from "node:sqlite";

import type { Clock } from "../../ports/clock.js";
import {
  InvocationUsageProjectionSchema,
  type InvocationUsageProjection,
  type PrepareInvocationUsageProjection,
  type ProviderUsageProjectionPersistence,
  type UsageProjectionWriteResult,
  withUsageProjectionDigest,
} from "../../ports/provider-usage-projection-persistence.js";
import { configureSqlite, migrateAndPreflight } from "./schema-preflight.js";

export class SqliteProviderUsageProjectionPersistence
implements ProviderUsageProjectionPersistence {
  readonly #databasePath: string;
  readonly #clock: Clock;
  #database: DatabaseSync | undefined;

  constructor(input: Readonly<{ databasePath: string; clock: Clock }>) {
    this.#databasePath = input.databasePath;
    this.#clock = input.clock;
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

  async record(input: PrepareInvocationUsageProjection): Promise<UsageProjectionWriteResult> {
    const next = withUsageProjectionDigest(input);
    const database = this.#requireDatabase();
    database.exec("BEGIN IMMEDIATE");
    try {
      const current = selectByLink(
        database,
        next.invocationKind,
        next.invocationLinkId,
      );
      if (current !== undefined) {
        database.exec("COMMIT");
        return current.recordDigest === next.recordDigest
          ? { ok: true, replayed: true, value: current }
          : conflict();
      }
      const event = database.prepare(`
        SELECT record_json FROM provider_usage_projections
        WHERE usage_event_id = ?
      `).get(next.usageEventId) as Record<string, unknown> | undefined;
      if (event !== undefined) {
        database.exec("ROLLBACK");
        return conflict();
      }
      database.prepare(`
        INSERT INTO provider_usage_projections (
          invocation_kind, invocation_link_id, session_id, usage_event_id,
          usage_event_digest, record_digest, record_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        next.invocationKind,
        next.invocationLinkId,
        next.sessionId,
        next.usageEventId,
        next.usageEventDigest,
        next.recordDigest,
        JSON.stringify(next),
      );
      database.exec("COMMIT");
      return { ok: true, replayed: false, value: next };
    } catch (error) {
      rollback(database);
      if (String(error).includes("UNIQUE constraint failed")) return conflict();
      throw error;
    }
  }

  async loadByLink(
    invocationKind: InvocationUsageProjection["invocationKind"],
    invocationLinkId: string,
  ): Promise<InvocationUsageProjection | undefined> {
    return selectByLink(this.#requireDatabase(), invocationKind, invocationLinkId);
  }

  async listBySession(sessionId: string): Promise<readonly InvocationUsageProjection[]> {
    return this.#requireDatabase().prepare(`
      SELECT record_json FROM provider_usage_projections
      WHERE session_id = ? ORDER BY record_digest
    `).all(sessionId).map((row) => parse(row as Record<string, unknown>));
  }

  #requireDatabase(): DatabaseSync {
    if (this.#database === undefined) throw new Error("Usage projection persistence is not started");
    return this.#database;
  }
}

function rollback(database: DatabaseSync): void {
  try {
    database.exec("ROLLBACK");
  } catch {
    // Preserve the original write failure.
  }
}

function selectByLink(
  database: DatabaseSync,
  kind: string,
  id: string,
): InvocationUsageProjection | undefined {
  const row = database.prepare(`
    SELECT record_json FROM provider_usage_projections
    WHERE invocation_kind = ? AND invocation_link_id = ?
  `).get(kind, id) as Record<string, unknown> | undefined;
  return row === undefined ? undefined : parse(row);
}

function parse(row: Record<string, unknown>): InvocationUsageProjection {
  if (typeof row.record_json !== "string") throw new Error("Usage projection row is invalid");
  return InvocationUsageProjectionSchema.parse(JSON.parse(row.record_json) as unknown);
}

function conflict(): UsageProjectionWriteResult {
  return {
    ok: false,
    error: { code: "usage_projection.conflict", message: "Usage projection identity changed" },
  };
}
