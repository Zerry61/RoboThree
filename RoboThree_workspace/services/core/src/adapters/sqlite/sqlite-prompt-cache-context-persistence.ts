import { DatabaseSync } from "node:sqlite";

import type { Clock } from "../../ports/clock.js";
import {
  calculateModelInvocationCacheContextDigest,
  calculatePromptCacheNamespaceDigest,
} from "../../application/session-scope-digest-provider.js";
import {
  ModelInvocationCacheContextSchema,
  PromptCacheScopeNamespaceSchema,
  type CacheExecutionAuthority,
  type ModelInvocationCacheContext,
  type ModelInvocationKind,
  type PromptCacheContextPersistence,
  type PromptCacheScopeNamespace,
  type PromptCacheWriteResult,
} from "../../ports/session-scope-digest-provider.js";
import { configureSqlite, migrateAndPreflight } from "./schema-preflight.js";

export type SqlitePromptCacheContextFaultPoint =
  | "before_namespace_commit"
  | "after_namespace_commit_before_response"
  | "before_context_commit"
  | "after_context_commit_before_response"
  | "before_retire_commit"
  | "after_retire_commit_before_response";

export class SqlitePromptCacheContextPersistence
implements PromptCacheContextPersistence {
  readonly #databasePath: string;
  readonly #clock: Clock;
  readonly #faultInjector: ((point: SqlitePromptCacheContextFaultPoint) => void) | undefined;
  #database: DatabaseSync | undefined;

  public constructor(input: Readonly<{
    databasePath: string;
    clock: Clock;
    faultInjector?: (point: SqlitePromptCacheContextFaultPoint) => void;
  }>) {
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

  async loadContext(
    invocationKind: ModelInvocationKind,
    invocationLinkId: string,
  ): Promise<ModelInvocationCacheContext | undefined> {
    const row = this.#requireDatabase().prepare(`
      SELECT record_json FROM model_invocation_cache_contexts
      WHERE invocation_kind = ? AND invocation_link_id = ?
    `).get(invocationKind, invocationLinkId) as Record<string, unknown> | undefined;
    return parseContext(row);
  }

  async loadNamespace(namespaceRevision: string): Promise<PromptCacheScopeNamespace | undefined> {
    const row = this.#requireDatabase().prepare(`
      SELECT record_json FROM prompt_cache_scope_namespaces
      WHERE namespace_revision = ?
    `).get(namespaceRevision) as Record<string, unknown> | undefined;
    return parseNamespace(row);
  }

  async loadActiveNamespace(
    authority: CacheExecutionAuthority,
  ): Promise<PromptCacheScopeNamespace | undefined> {
    const row = this.#requireDatabase().prepare(`
      SELECT record_json FROM prompt_cache_scope_namespaces
      WHERE cache_execution_authority = ? AND status = 'active'
    `).get(authority) as Record<string, unknown> | undefined;
    return parseNamespace(row);
  }

  async listNamespaces(
    authority: CacheExecutionAuthority,
  ): Promise<readonly PromptCacheScopeNamespace[]> {
    const rows = this.#requireDatabase().prepare(`
      SELECT record_json FROM prompt_cache_scope_namespaces
      WHERE cache_execution_authority = ?
      ORDER BY created_at, namespace_revision
    `).all(authority) as Record<string, unknown>[];
    return rows.map((row) => parseNamespace(row)!);
  }

  async createNamespace(
    namespace: PromptCacheScopeNamespace,
  ): Promise<PromptCacheWriteResult<PromptCacheScopeNamespace>> {
    const validated = validateNamespace(namespace);
    const database = this.#requireDatabase();
    const existing = selectNamespace(database, validated.namespaceRevision);
    if (existing !== undefined) return sameNamespace(existing, validated);
    let committed = false;
    try {
      database.exec("BEGIN IMMEDIATE");
      this.#faultInjector?.("before_namespace_commit");
      database.prepare(`
        INSERT INTO prompt_cache_scope_namespaces (
          namespace_revision, cache_execution_authority, namespace_key,
          status, created_at, record_digest, record_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        validated.namespaceRevision,
        validated.cacheExecutionAuthority,
        validated.namespaceKey,
        validated.status,
        validated.createdAt,
        validated.recordDigest,
        JSON.stringify(validated),
      );
      database.exec("COMMIT");
      committed = true;
      this.#faultInjector?.("after_namespace_commit_before_response");
      return success(validated, false);
    } catch (error) {
      rollback(database);
      if (committed) throw error;
      const concurrent = selectNamespace(database, validated.namespaceRevision)
        ?? selectActiveNamespace(database, validated.cacheExecutionAuthority);
      if (concurrent !== undefined) return sameNamespace(concurrent, validated);
      throw error;
    }
  }

  async createContext(
    context: ModelInvocationCacheContext,
  ): Promise<PromptCacheWriteResult<ModelInvocationCacheContext>> {
    const validated = validateContext(context);
    const database = this.#requireDatabase();
    const existing = selectContext(database, validated.invocationKind, validated.invocationLinkId);
    if (existing !== undefined) return sameContext(existing, validated);
    let committed = false;
    try {
      database.exec("BEGIN IMMEDIATE");
      const namespace = selectNamespace(database, validated.scopeNamespaceRevision);
      if (namespace === undefined || namespace.status !== "active") {
        rollback(database);
        return failure("prompt_cache.namespace_unavailable", "Prompt Cache namespace is not active");
      }
      this.#faultInjector?.("before_context_commit");
      database.prepare(`
        INSERT INTO model_invocation_cache_contexts (
          invocation_kind, invocation_link_id, cache_execution_authority,
          session_scope_digest, scope_namespace_revision, cache_context_digest,
          gateway_contract_version, record_digest, created_at, record_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        validated.invocationKind,
        validated.invocationLinkId,
        validated.cacheExecutionAuthority,
        validated.sessionScopeDigest,
        validated.scopeNamespaceRevision,
        validated.cacheContextDigest,
        validated.gatewayContractVersion,
        validated.recordDigest,
        validated.createdAt,
        JSON.stringify(validated),
      );
      database.exec("COMMIT");
      committed = true;
      this.#faultInjector?.("after_context_commit_before_response");
      return success(validated, false);
    } catch (error) {
      rollback(database);
      if (committed) throw error;
      const concurrent = selectContext(database, validated.invocationKind, validated.invocationLinkId);
      if (concurrent !== undefined) return sameContext(concurrent, validated);
      throw error;
    }
  }

  async retireNamespace(
    namespaceRevision: string,
    expectedRecordDigest: string,
  ): Promise<PromptCacheWriteResult<PromptCacheScopeNamespace>> {
    const database = this.#requireDatabase();
    const existing = selectNamespace(database, namespaceRevision);
    if (existing === undefined) {
      return failure("prompt_cache.namespace_unavailable", "Prompt Cache namespace does not exist");
    }
    if (existing.recordDigest !== expectedRecordDigest) {
      return failure("prompt_cache.namespace_conflict", "Prompt Cache namespace revision changed");
    }
    if (existing.status === "retired") return success(existing, true);
    const { recordDigest: _oldDigest, ...material } = { ...existing, status: "retired" as const };
    const retired = validateNamespace({
      ...material,
      recordDigest: calculatePromptCacheNamespaceDigest(material),
    });
    let committed = false;
    try {
      database.exec("BEGIN IMMEDIATE");
      this.#faultInjector?.("before_retire_commit");
      const result = database.prepare(`
        UPDATE prompt_cache_scope_namespaces
        SET status = ?, record_digest = ?, record_json = ?
        WHERE namespace_revision = ? AND record_digest = ?
      `).run(
        retired.status,
        retired.recordDigest,
        JSON.stringify(retired),
        namespaceRevision,
        expectedRecordDigest,
      );
      if (result.changes !== 1) {
        rollback(database);
        return failure("prompt_cache.namespace_conflict", "Prompt Cache namespace revision changed");
      }
      database.exec("COMMIT");
      committed = true;
      this.#faultInjector?.("after_retire_commit_before_response");
      return success(retired, false);
    } catch (error) {
      rollback(database);
      if (committed) throw error;
      throw error;
    }
  }

  #requireDatabase(): DatabaseSync {
    if (this.#database === undefined) {
      throw new Error("Prompt Cache context persistence is not started");
    }
    return this.#database;
  }
}

function selectNamespace(
  database: DatabaseSync,
  namespaceRevision: string,
): PromptCacheScopeNamespace | undefined {
  const row = database.prepare(`
    SELECT record_json FROM prompt_cache_scope_namespaces
    WHERE namespace_revision = ?
  `).get(namespaceRevision) as Record<string, unknown> | undefined;
  return parseNamespace(row);
}

function selectActiveNamespace(
  database: DatabaseSync,
  authority: CacheExecutionAuthority,
): PromptCacheScopeNamespace | undefined {
  const row = database.prepare(`
    SELECT record_json FROM prompt_cache_scope_namespaces
    WHERE cache_execution_authority = ? AND status = 'active'
  `).get(authority) as Record<string, unknown> | undefined;
  return parseNamespace(row);
}

function selectContext(
  database: DatabaseSync,
  invocationKind: ModelInvocationKind,
  invocationLinkId: string,
): ModelInvocationCacheContext | undefined {
  const row = database.prepare(`
    SELECT record_json FROM model_invocation_cache_contexts
    WHERE invocation_kind = ? AND invocation_link_id = ?
  `).get(invocationKind, invocationLinkId) as Record<string, unknown> | undefined;
  return parseContext(row);
}

function parseNamespace(
  row: Record<string, unknown> | undefined,
): PromptCacheScopeNamespace | undefined {
  if (typeof row?.record_json !== "string") return undefined;
  return validateNamespace(PromptCacheScopeNamespaceSchema.parse(JSON.parse(row.record_json)));
}

function parseContext(
  row: Record<string, unknown> | undefined,
): ModelInvocationCacheContext | undefined {
  if (typeof row?.record_json !== "string") return undefined;
  return validateContext(ModelInvocationCacheContextSchema.parse(JSON.parse(row.record_json)));
}

function validateNamespace(value: PromptCacheScopeNamespace): PromptCacheScopeNamespace {
  const parsed = PromptCacheScopeNamespaceSchema.parse(value);
  const { recordDigest, ...material } = parsed;
  if (recordDigest !== calculatePromptCacheNamespaceDigest(material)) {
    throw new Error("Prompt Cache namespace record digest is invalid");
  }
  return parsed;
}

function validateContext(value: ModelInvocationCacheContext): ModelInvocationCacheContext {
  const parsed = ModelInvocationCacheContextSchema.parse(value);
  const { recordDigest, ...material } = parsed;
  if (recordDigest !== calculateModelInvocationCacheContextDigest(material)) {
    throw new Error("Prompt Cache context record digest is invalid");
  }
  return parsed;
}

function sameNamespace(
  existing: PromptCacheScopeNamespace,
  requested: PromptCacheScopeNamespace,
): PromptCacheWriteResult<PromptCacheScopeNamespace> {
  return existing.recordDigest === requested.recordDigest
    ? success(existing, true)
    : failure("prompt_cache.namespace_conflict", "Prompt Cache namespace has different facts");
}

function sameContext(
  existing: ModelInvocationCacheContext,
  requested: ModelInvocationCacheContext,
): PromptCacheWriteResult<ModelInvocationCacheContext> {
  return existing.recordDigest === requested.recordDigest
    ? success(existing, true)
    : failure("prompt_cache.context_conflict", "Invocation link already has a different Prompt Cache context");
}

function success<T>(value: T, replayed: boolean): PromptCacheWriteResult<T> {
  return { ok: true, replayed, value };
}

function failure<T>(
  code: Exclude<PromptCacheWriteResult<T>, { ok: true }>["error"]["code"],
  message: string,
): PromptCacheWriteResult<T> {
  return { ok: false, error: { code, message } };
}

function rollback(database: DatabaseSync): void {
  try { database.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ }
}
