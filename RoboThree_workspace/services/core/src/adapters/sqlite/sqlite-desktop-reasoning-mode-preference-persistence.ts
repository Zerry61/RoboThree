import { DatabaseSync } from "node:sqlite";

import {
  JsonValueSchema,
  ReasoningModePreferenceReceiptSchema,
  canonicalJsonStringify,
} from "@robothree/contracts";

import {
  DesktopReasoningModePreferenceSchema,
  validateDesktopExperienceOwnerNamespace,
  validateDesktopReasoningModePreference,
  validateDesktopReasoningModePreferenceReceipt,
  type DesktopExperienceOwnerNamespace,
  type DesktopExperiencePreferenceOwnerIdentity,
  type DesktopReasoningModePreference,
} from "../../application/desktop-reasoning-mode-domain.js";
import type { Clock } from "../../ports/clock.js";
import type {
  DesktopReasoningModePreferencePersistence,
  DesktopReasoningModePreferenceReceiptRecord,
  DesktopReasoningModeWriteResult,
} from "../../ports/desktop-reasoning-mode.js";
import { configureSqlite, migrateAndPreflight } from "./schema-preflight.js";

export class SqliteDesktopReasoningModePreferencePersistence
implements DesktopReasoningModePreferencePersistence {
  #database: DatabaseSync | undefined;

  public constructor(private readonly input: Readonly<{ databasePath: string; clock: Clock }>) {}

  public async start(): Promise<void> {
    if (this.#database !== undefined) return;
    const database = new DatabaseSync(this.input.databasePath, { allowExtension: false });
    try {
      configureSqlite(database);
      migrateAndPreflight(database, this.input.clock);
      database.enableDefensive(true);
      selectNamespace(database);
      this.#database = database;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    this.#database?.close();
    this.#database = undefined;
  }

  public async loadActiveOwnerNamespace(): Promise<DesktopExperienceOwnerNamespace | undefined> {
    return selectNamespace(this.#requireDatabase());
  }

  public async initializeOwnerNamespace(
    namespace: DesktopExperienceOwnerNamespace,
  ): Promise<DesktopReasoningModeWriteResult<DesktopExperienceOwnerNamespace>> {
    const validated = validateDesktopExperienceOwnerNamespace(namespace);
    return transaction(this.#requireDatabase(), () => {
      const existing = selectNamespace(this.#requireDatabase());
      if (existing !== undefined) {
        return existing.recordDigest === validated.recordDigest
          ? success(existing, true)
          : failure("reasoning_mode.owner_namespace_unavailable", "An active owner namespace already exists");
      }
      const record = namespaceRecord(validated);
      this.#requireDatabase().prepare(`
        INSERT INTO desktop_experience_owner_scope_namespaces (
          owner_scope_namespace_revision, namespace_key, namespace_key_check_digest,
          lifecycle_state, created_at, record_json, record_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        validated.namespaceRevision,
        validated.namespaceKey,
        validated.namespaceKeyCheckDigest,
        validated.lifecycleState,
        validated.createdAt,
        canonicalJsonStringify(JsonValueSchema.parse(record)),
        validated.recordDigest,
      );
      return success(validated, false);
    });
  }

  public async loadPreference(
    owner: DesktopExperiencePreferenceOwnerIdentity,
  ): Promise<DesktopReasoningModePreference | undefined> {
    this.#requireOwner(owner);
    const row = this.#requireDatabase().prepare(`
      SELECT * FROM desktop_reasoning_mode_preferences
      WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ?
    `).get(owner.ownerScopeNamespaceRevision, owner.ownerScopeDigest) as Record<string, unknown> | undefined;
    return row === undefined ? undefined : parsePreference(row);
  }

  public async loadReceipt(
    owner: DesktopExperiencePreferenceOwnerIdentity,
    commandId: string,
  ): Promise<DesktopReasoningModePreferenceReceiptRecord | undefined> {
    this.#requireOwner(owner);
    return selectReceipt(this.#requireDatabase(), owner, commandId);
  }

  public async commitPreference(input: Readonly<{
    preference: DesktopReasoningModePreference;
    receipt: DesktopReasoningModePreferenceReceiptRecord;
    expectedPreferenceRevision: number;
  }>): Promise<DesktopReasoningModeWriteResult<DesktopReasoningModePreferenceReceiptRecord>> {
    const preference = validateDesktopReasoningModePreference(input.preference);
    const receipt = validateDesktopReasoningModePreferenceReceipt(input.receipt);
    this.#requireOwner(preference);
    const database = this.#requireDatabase();
    return transaction(database, () => {
      const replay = selectReceipt(database, receipt, receipt.commandId);
      if (replay !== undefined) {
        return replay.requestDigest === receipt.requestDigest && replay.receiptDigest === receipt.receiptDigest
          ? success(replay, true)
          : failure("reasoning_mode.preference_conflict", "Command id already represents another preference update");
      }
      const current = database.prepare(`
        SELECT preference_revision FROM desktop_reasoning_mode_preferences
        WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ?
      `).get(preference.ownerScopeNamespaceRevision, preference.ownerScopeDigest) as
        | Record<string, unknown>
        | undefined;
      const currentRevision = current === undefined
        ? 0
        : requireInteger(current.preference_revision, "preference_revision");
      if (!sameOwner(preference, receipt)
        || currentRevision !== input.expectedPreferenceRevision
        || preference.preferenceRevision !== input.expectedPreferenceRevision + 1
        || receipt.expectedPreferenceRevision !== input.expectedPreferenceRevision
        || receipt.committedPreferenceRevision !== preference.preferenceRevision
        || receipt.requestedMode !== preference.requestedMode) {
        return failure("reasoning_mode.preference_conflict", "Preference CAS or Receipt material is stale");
      }
      const changed = currentRevision === 0
        ? database.prepare(`
          INSERT INTO desktop_reasoning_mode_preferences (
            owner_scope_namespace_revision, owner_scope_digest, preference_revision,
            requested_mode, updated_at, record_json, record_digest
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          preference.ownerScopeNamespaceRevision,
          preference.ownerScopeDigest,
          preference.preferenceRevision,
          preference.requestedMode,
          preference.updatedAt,
          canonicalJsonStringify(preference),
          preference.recordDigest,
        ).changes
        : database.prepare(`
          UPDATE desktop_reasoning_mode_preferences SET
            preference_revision = ?, requested_mode = ?, updated_at = ?, record_json = ?, record_digest = ?
          WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ? AND preference_revision = ?
        `).run(
          preference.preferenceRevision,
          preference.requestedMode,
          preference.updatedAt,
          canonicalJsonStringify(preference),
          preference.recordDigest,
          preference.ownerScopeNamespaceRevision,
          preference.ownerScopeDigest,
          input.expectedPreferenceRevision,
        ).changes;
      if (changed !== 1) {
        return failure("reasoning_mode.preference_conflict", "Preference CAS lost its durable race");
      }
      database.prepare(`
        INSERT INTO desktop_reasoning_mode_preference_receipts (
          owner_scope_namespace_revision, owner_scope_digest, command_id, request_digest,
          expected_preference_revision, committed_preference_revision, requested_mode,
          outcome, committed_at, receipt_json, receipt_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        receipt.ownerScopeNamespaceRevision,
        receipt.ownerScopeDigest,
        receipt.commandId,
        receipt.requestDigest,
        receipt.expectedPreferenceRevision,
        receipt.committedPreferenceRevision,
        receipt.requestedMode,
        receipt.outcome,
        receipt.committedAt,
        canonicalJsonStringify(publicReceipt(receipt)),
        receipt.receiptDigest,
      );
      return success(receipt, false);
    });
  }

  #requireOwner(owner: DesktopExperiencePreferenceOwnerIdentity): void {
    const namespace = selectNamespace(this.#requireDatabase());
    if (namespace === undefined || namespace.namespaceRevision !== owner.ownerScopeNamespaceRevision) {
      throw new Error("Reasoning Mode owner namespace is unavailable");
    }
    namespace.namespaceKey.fill(0);
  }

  #requireDatabase(): DatabaseSync {
    if (this.#database === undefined) throw new Error("Reasoning Mode SQLite persistence is not started");
    return this.#database;
  }
}

function selectNamespace(database: DatabaseSync): DesktopExperienceOwnerNamespace | undefined {
  const row = database.prepare(`
    SELECT * FROM desktop_experience_owner_scope_namespaces WHERE lifecycle_state = 'active'
  `).get() as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const record = parseObject(row.record_json, "record_json");
  assertIndexed(record, row, {
    namespaceRevision: "owner_scope_namespace_revision",
    namespaceKeyCheckDigest: "namespace_key_check_digest",
    lifecycleState: "lifecycle_state",
    createdAt: "created_at",
  });
  if (record.recordDigest !== undefined) {
    throw new Error("Reasoning Mode namespace record JSON contains an unexpected digest");
  }
  return validateDesktopExperienceOwnerNamespace({
    namespaceRevision: requireInteger(row.owner_scope_namespace_revision, "owner_scope_namespace_revision"),
    namespaceKey: requireBytes(row.namespace_key, "namespace_key"),
    namespaceKeyCheckDigest: requireString(row.namespace_key_check_digest, "namespace_key_check_digest") as `sha256:${string}`,
    lifecycleState: "active",
    createdAt: requireString(row.created_at, "created_at"),
    recordDigest: requireString(row.record_digest, "record_digest") as `sha256:${string}`,
  });
}

function selectReceipt(
  database: DatabaseSync,
  owner: DesktopExperiencePreferenceOwnerIdentity,
  commandId: string,
): DesktopReasoningModePreferenceReceiptRecord | undefined {
  const row = database.prepare(`
    SELECT * FROM desktop_reasoning_mode_preference_receipts
    WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ? AND command_id = ?
  `).get(owner.ownerScopeNamespaceRevision, owner.ownerScopeDigest, commandId) as
    | Record<string, unknown>
    | undefined;
  if (row === undefined) return undefined;
  const receipt = ReasoningModePreferenceReceiptSchema.parse(
    JSON.parse(requireString(row.receipt_json, "receipt_json")),
  );
  assertIndexed(receipt, row, {
    commandId: "command_id",
    requestDigest: "request_digest",
    expectedPreferenceRevision: "expected_preference_revision",
    committedPreferenceRevision: "committed_preference_revision",
    requestedMode: "requested_mode",
    outcome: "outcome",
    committedAt: "committed_at",
    receiptDigest: "receipt_digest",
  });
  return validateDesktopReasoningModePreferenceReceipt({
    ownerScopeNamespaceRevision: requireInteger(row.owner_scope_namespace_revision, "owner_scope_namespace_revision"),
    ownerScopeDigest: requireString(row.owner_scope_digest, "owner_scope_digest") as `sha256:${string}`,
    ...receipt,
  });
}

function parsePreference(row: Record<string, unknown>): DesktopReasoningModePreference {
  const value = DesktopReasoningModePreferenceSchema.parse(
    JSON.parse(requireString(row.record_json, "record_json")),
  );
  assertIndexed(value, row, {
    ownerScopeNamespaceRevision: "owner_scope_namespace_revision",
    ownerScopeDigest: "owner_scope_digest",
    preferenceRevision: "preference_revision",
    requestedMode: "requested_mode",
    updatedAt: "updated_at",
    recordDigest: "record_digest",
  });
  return validateDesktopReasoningModePreference(value);
}

function namespaceRecord(namespace: DesktopExperienceOwnerNamespace): Record<string, unknown> {
  return {
    namespaceRevision: namespace.namespaceRevision,
    namespaceKeyCheckDigest: namespace.namespaceKeyCheckDigest,
    lifecycleState: namespace.lifecycleState,
    createdAt: namespace.createdAt,
  };
}

function publicReceipt(input: DesktopReasoningModePreferenceReceiptRecord) {
  return ReasoningModePreferenceReceiptSchema.parse({
    contractVersion: input.contractVersion,
    commandId: input.commandId,
    requestDigest: input.requestDigest,
    expectedPreferenceRevision: input.expectedPreferenceRevision,
    committedPreferenceRevision: input.committedPreferenceRevision,
    requestedMode: input.requestedMode,
    outcome: input.outcome,
    committedAt: input.committedAt,
    receiptDigest: input.receiptDigest,
  });
}

function sameOwner(
  left: DesktopExperiencePreferenceOwnerIdentity,
  right: DesktopExperiencePreferenceOwnerIdentity,
): boolean {
  return left.ownerScopeNamespaceRevision === right.ownerScopeNamespaceRevision
    && left.ownerScopeDigest === right.ownerScopeDigest;
}

function transaction<T>(
  database: DatabaseSync,
  operation: () => DesktopReasoningModeWriteResult<T>,
): DesktopReasoningModeWriteResult<T> {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    if (!result.ok) {
      database.exec("ROLLBACK");
      return result;
    }
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* preserve original error */ }
    throw error;
  }
}

function assertIndexed(
  value: Record<string, unknown>,
  row: Record<string, unknown>,
  fields: Readonly<Record<string, string>>,
): void {
  for (const [property, column] of Object.entries(fields)) {
    if (value[property] !== row[column]) {
      throw new Error(`Reasoning Mode indexed column ${column} does not match record material`);
    }
  }
}

function parseObject(value: unknown, field: string): Record<string, unknown> {
  const parsed = JSON.parse(requireString(value, field)) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Reasoning Mode ${field} must contain an object`);
  }
  return parsed as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Reasoning Mode ${field} must be a string`);
  return value;
}

function requireInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Reasoning Mode ${field} must be an integer`);
  }
  return value;
}

function requireBytes(value: unknown, field: string): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error(`Reasoning Mode ${field} must be a BLOB`);
  return Uint8Array.from(value);
}

function success<T>(value: T, replayed: boolean): DesktopReasoningModeWriteResult<T> {
  return { ok: true, replayed, value };
}

function failure<T>(
  code: "reasoning_mode.preference_conflict" | "reasoning_mode.owner_namespace_unavailable",
  message: string,
): DesktopReasoningModeWriteResult<T> {
  return { ok: false, error: { code, message } };
}
