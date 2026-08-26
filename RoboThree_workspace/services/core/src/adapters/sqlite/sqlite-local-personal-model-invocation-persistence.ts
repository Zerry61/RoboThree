import { DatabaseSync } from "node:sqlite";
import { JsonValueSchema } from "@robothree/contracts";

import {
  validateLocalPersonalModelInvocationLink,
  type LocalPersonalModelInvocationLink,
} from "../../application/local-personal-model-invocation.js";
import {
  validateLocalPersonalInvocationTimeoutFact,
  type LocalPersonalInvocationTimeoutFact,
} from "../../application/model-invocation-timeout-policy.js";
import {
  PersonalModelStatusFactSchema,
  validatePersonalModelStatusFact,
  type PersonalModelStatusFact,
} from "../../application/personal-model-domain.js";
import type { Clock } from "../../ports/clock.js";
import type {
  LocalPersonalInvocationWriteResult,
  LocalPersonalModelInvocationPersistence,
} from "../../ports/local-personal-model-invocation-persistence.js";
import {
  ProviderUsageFactSchema,
  providerAttemptKey,
  type ProviderUsageFact,
  type ProviderUsageWriteResult,
} from "../../ports/provider-usage.js";
import {
  InvocationUsageProjectionSchema,
  type InvocationUsageProjection,
} from "../../ports/provider-usage-projection-persistence.js";
import {
  PersonalModelCommandReceiptSchema,
  validatePersonalModelCommandReceipt,
  type PersonalModelCommandReceipt,
} from "../../ports/personal-model-persistence.js";
import { configureSqlite, migrateAndPreflight } from "./schema-preflight.js";
import { sha256CanonicalJson } from "../../persistence/digest.js";

export class SqliteLocalPersonalModelInvocationPersistence
implements LocalPersonalModelInvocationPersistence {
  readonly #databasePath: string;
  readonly #clock: Clock;
  #database: DatabaseSync | undefined;

  public constructor(input: Readonly<{ databasePath: string; clock: Clock }>) {
    this.#databasePath = input.databasePath;
    this.#clock = input.clock;
  }

  public async start(): Promise<void> {
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

  public async stop(): Promise<void> {
    this.#database?.close();
    this.#database = undefined;
  }

  public async prepareInvocation(
    input: Readonly<{
      link: LocalPersonalModelInvocationLink;
      timeoutFact: LocalPersonalInvocationTimeoutFact;
    }>,
  ): Promise<LocalPersonalInvocationWriteResult> {
    const link = validateLocalPersonalModelInvocationLink(input.link);
    const timeoutFact = validateLocalPersonalInvocationTimeoutFact(input.timeoutFact);
    if (link.status !== "accepted") return conflict("accepted status required");
    if (timeoutFact.authorityInvocationId !== link.authorityInvocationId) {
      return timeoutDrift("timeout fact references a different authority invocation");
    }
    return withTransaction(this.#requireDatabase(), () => {
      const existing = selectLink(this.#requireDatabase(), link.invocationKind, link.invocationLinkId);
      if (existing !== undefined) {
        const existingTimeout = selectTimeoutFact(
          this.#requireDatabase(),
          existing.authorityInvocationId,
        );
        if (existingTimeout === undefined) return legacyTimeoutMissing();
        return existing.recordDigest === link.recordDigest
          && existingTimeout.recordDigest === timeoutFact.recordDigest
          ? success(existing, true)
          : timeoutDrift("invocation or timeout identity changed");
      }
      insertLink(this.#requireDatabase(), link);
      insertTimeoutFact(this.#requireDatabase(), timeoutFact);
      return success(link, false);
    });
  }

  public async advanceInvocation(input: Readonly<{
    expectedRecordDigest: string;
    next: LocalPersonalModelInvocationLink;
  }>): Promise<LocalPersonalInvocationWriteResult> {
    const next = validateLocalPersonalModelInvocationLink(input.next);
    return withTransaction(this.#requireDatabase(), () =>
      updateLink(this.#requireDatabase(), input.expectedRecordDigest, next));
  }

  public async commitTerminalOutcome(input: Readonly<{
    expectedRecordDigest: string;
    terminal: LocalPersonalModelInvocationLink;
    usageFact?: ProviderUsageFact;
    usageProjection?: InvocationUsageProjection;
    statusObservation?: Readonly<{
      status: PersonalModelStatusFact;
      expectedStatusRevision: number;
      receipt: PersonalModelCommandReceipt;
    }>;
  }>): Promise<LocalPersonalInvocationWriteResult> {
    const terminal = validateLocalPersonalModelInvocationLink(input.terminal);
    if (terminal.status !== "terminal") return conflict("terminal status required");
    const fact = input.usageFact === undefined
      ? undefined
      : ProviderUsageFactSchema.parse(input.usageFact);
    const projection = input.usageProjection === undefined
      ? undefined
      : InvocationUsageProjectionSchema.parse(input.usageProjection);
    if ((fact === undefined) !== (projection === undefined)) {
      return conflict("Usage fact and projection must converge together");
    }
    if (fact !== undefined && projection !== undefined
      && (projection.invocationKind !== terminal.invocationKind
        || projection.invocationLinkId !== terminal.invocationLinkId
        || projection.authorityInvocationId !== terminal.authorityInvocationId
        || projection.usageAuthority !== "local_personal"
        || projection.usageEventDigest !== fact.usageDigest)) {
      return conflict("Usage projection references a different invocation or fact");
    }
    try {
      return withTransaction(this.#requireDatabase(), () => {
        if (fact !== undefined) {
          if (fact.usageAuthority !== "local_personal"
            || fact.authorityInvocationId !== terminal.authorityInvocationId) {
            abortTransaction(conflict("Usage fact references a different local invocation"));
          }
          const usage = recordUsage(this.#requireDatabase(), fact, this.#clock.now());
          if (!usage.ok) abortTransaction(conflict(usage.error.message));
          const usageProjection = recordUsageProjection(this.#requireDatabase(), projection!);
          if (!usageProjection.ok) abortTransaction(conflict(usageProjection.message));
        }
        if (input.statusObservation !== undefined) {
          const status = recordStatusObservation(
            this.#requireDatabase(),
            terminal,
            input.statusObservation,
          );
          if (!status.ok) abortTransaction(conflict(status.message));
        }
        const result = updateLink(
          this.#requireDatabase(),
          input.expectedRecordDigest,
          terminal,
        );
        if (!result.ok) abortTransaction(result);
        return result;
      });
    } catch (error) {
      if (error instanceof LocalInvocationTransactionAbort) return error.result;
      throw error;
    }
  }

  public async loadInvocation(input: Readonly<{
    invocationKind: LocalPersonalModelInvocationLink["invocationKind"];
    invocationLinkId: string;
  }>): Promise<LocalPersonalModelInvocationLink | undefined> {
    return selectLink(this.#requireDatabase(), input.invocationKind, input.invocationLinkId);
  }

  public async loadInvocationTimeoutFact(
    authorityInvocationId: string,
  ): Promise<LocalPersonalInvocationTimeoutFact | undefined> {
    return selectTimeoutFact(this.#requireDatabase(), authorityInvocationId);
  }

  public async listPending(limit: number): Promise<readonly LocalPersonalModelInvocationLink[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new Error("Local invocation pending limit must be between 1 and 200");
    }
    return this.#requireDatabase().prepare(`
      SELECT record_json FROM local_personal_model_invocation_links
      WHERE status NOT IN ('terminal','recovery_exhausted')
      ORDER BY created_at, invocation_link_id LIMIT ?
    `).all(limit).map((row) => parseLink(row as Record<string, unknown>));
  }

  public async registerAttempt(input: Readonly<{
    authorityInvocationId: string;
    fencingEpoch: number;
    providerAttemptKey: string;
  }>): Promise<void> {
    if (input.providerAttemptKey !== providerAttemptKey(
      "local_personal",
      input.authorityInvocationId,
      input.fencingEpoch,
    )) throw new Error("Local Provider attempt key mismatch");
    withTransaction(this.#requireDatabase(), () => {
      const link = this.#requireDatabase().prepare(`
        SELECT fencing_epoch, status FROM local_personal_model_invocation_links
        WHERE authority_invocation_id = ?
      `).get(input.authorityInvocationId) as Record<string, unknown> | undefined;
      if (link?.fencing_epoch !== input.fencingEpoch
        || link.status === "terminal" || link.status === "recovery_exhausted") {
        throw new Error("Local Provider attempt has no exact invocation link");
      }
      const existing = this.#requireDatabase().prepare(`
        SELECT fencing_epoch FROM local_personal_provider_usage_facts
        WHERE authority_invocation_id = ? AND provider_attempt_key = ?
      `).get(input.authorityInvocationId, input.providerAttemptKey) as
        Record<string, unknown> | undefined;
      if (existing !== undefined) {
        if (existing.fencing_epoch !== input.fencingEpoch) {
          throw new Error("Local Provider attempt fencing changed");
        }
        return;
      }
      const now = this.#clock.now();
      this.#requireDatabase().prepare(`
        INSERT INTO local_personal_provider_usage_facts (
          authority_invocation_id, provider_attempt_key, fencing_epoch, state,
          usage_digest, fact_json, created_at, updated_at
        ) VALUES (?, ?, ?, 'registered', NULL, NULL, ?, ?)
      `).run(input.authorityInvocationId, input.providerAttemptKey, input.fencingEpoch, now, now);
    });
  }

  public async record(fact: ProviderUsageFact): Promise<ProviderUsageWriteResult> {
    const parsed = ProviderUsageFactSchema.parse(fact);
    return withTransaction(this.#requireDatabase(), () =>
      recordUsage(this.#requireDatabase(), parsed, this.#clock.now()));
  }

  public async load(input: Readonly<{
    authorityInvocationId: string;
    providerAttemptKey: string;
  }>): Promise<ProviderUsageFact | undefined> {
    const row = this.#requireDatabase().prepare(`
      SELECT fact_json FROM local_personal_provider_usage_facts
      WHERE authority_invocation_id = ? AND provider_attempt_key = ? AND state = 'recorded'
    `).get(input.authorityInvocationId, input.providerAttemptKey) as Record<string, unknown> | undefined;
    if (typeof row?.fact_json !== "string") return undefined;
    return ProviderUsageFactSchema.parse(JSON.parse(row.fact_json) as unknown);
  }

  #requireDatabase(): DatabaseSync {
    if (this.#database === undefined) throw new Error("Local invocation persistence is not started");
    return this.#database;
  }
}

function recordUsageProjection(
  database: DatabaseSync,
  projection: InvocationUsageProjection,
): Readonly<{ ok: true } | { ok: false; message: string }> {
  const existing = database.prepare(`
    SELECT record_digest FROM provider_usage_projections
    WHERE invocation_kind = ? AND invocation_link_id = ?
  `).get(projection.invocationKind, projection.invocationLinkId) as
    Record<string, unknown> | undefined;
  if (existing !== undefined) {
    return existing.record_digest === projection.recordDigest
      ? { ok: true }
      : { ok: false, message: "Usage projection identity changed" };
  }
  const duplicateEvent = database.prepare(`
    SELECT 1 AS present FROM provider_usage_projections WHERE usage_event_id = ?
  `).get(projection.usageEventId);
  if (duplicateEvent !== undefined) return { ok: false, message: "Usage event identity changed" };
  database.prepare(`
    INSERT INTO provider_usage_projections (
      invocation_kind, invocation_link_id, session_id, usage_event_id,
      usage_event_digest, record_digest, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    projection.invocationKind, projection.invocationLinkId, projection.sessionId,
    projection.usageEventId, projection.usageEventDigest, projection.recordDigest,
    JSON.stringify(projection),
  );
  return { ok: true };
}

function recordStatusObservation(
  database: DatabaseSync,
  terminal: LocalPersonalModelInvocationLink,
  input: Readonly<{
    status: PersonalModelStatusFact;
    expectedStatusRevision: number;
    receipt: PersonalModelCommandReceipt;
  }>,
): Readonly<{ ok: true } | { ok: false; message: string }> {
  const status = validatePersonalModelStatusFact(input.status);
  const receipt = validatePersonalModelCommandReceipt(input.receipt);
  if (status.ownerScopeNamespaceRevision !== terminal.ownerScopeNamespaceRevision
    || status.ownerScopeDigest !== terminal.ownerScopeDigest
    || status.personalModelId !== terminal.personalModelId
    || status.configurationRevision !== terminal.configurationRevision
    || status.executionDefinitionDigest !== terminal.executionDefinitionDigest
    || status.statusRevision !== input.expectedStatusRevision + 1
    || status.statusOrigin !== "provider_observation"
    || receipt.ownerScopeNamespaceRevision !== status.ownerScopeNamespaceRevision
    || receipt.ownerScopeDigest !== status.ownerScopeDigest
    || receipt.commandType !== "status"
    || receipt.modelId !== status.personalModelId
    || receipt.committedConfigurationRevision !== status.configurationRevision) {
    return { ok: false, message: "Status observation does not match exact invocation configuration" };
  }
  const existingReceipt = database.prepare(`
    SELECT receipt_json FROM personal_model_command_receipts
    WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ? AND command_id = ?
  `).get(
    receipt.ownerScopeNamespaceRevision, receipt.ownerScopeDigest, receipt.commandId,
  ) as Record<string, unknown> | undefined;
  if (typeof existingReceipt?.receipt_json === "string") {
    const value = validatePersonalModelCommandReceipt(PersonalModelCommandReceiptSchema.parse(
      JSON.parse(existingReceipt.receipt_json) as unknown,
    ));
    if (value.receiptDigest !== receipt.receiptDigest) {
      return { ok: false, message: "Status receipt identity changed" };
    }
    const existingStatus = database.prepare(`
      SELECT record_digest FROM personal_model_status_facts
      WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ?
        AND personal_model_id = ? AND configuration_revision = ? AND status_revision = ?
    `).get(
      status.ownerScopeNamespaceRevision, status.ownerScopeDigest, status.personalModelId,
      status.configurationRevision, status.statusRevision,
    ) as Record<string, unknown> | undefined;
    return existingStatus?.record_digest === status.recordDigest
      ? { ok: true }
      : { ok: false, message: "Status receipt has no matching durable status fact" };
  }
  const current = database.prepare(`
    SELECT record_json FROM personal_model_status_facts
    WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ?
      AND personal_model_id = ? AND configuration_revision = ?
    ORDER BY status_revision DESC LIMIT 1
  `).get(
    status.ownerScopeNamespaceRevision, status.ownerScopeDigest, status.personalModelId,
    status.configurationRevision,
  ) as Record<string, unknown> | undefined;
  const currentRevision = typeof current?.record_json === "string"
    ? validatePersonalModelStatusFact(PersonalModelStatusFactSchema.parse(
      JSON.parse(current.record_json) as unknown,
    )).statusRevision
    : 0;
  if (currentRevision !== input.expectedStatusRevision) {
    return { ok: false, message: "Status observation revision changed" };
  }
  database.prepare(`
    INSERT INTO personal_model_status_facts (
      owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
      configuration_revision, execution_definition_digest, status_revision, status,
      detail_code, detail_digest, status_origin, carried_from_configuration_revision,
      carried_from_status_revision, carried_from_status_record_digest, updated_at,
      record_json, record_digest
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    status.ownerScopeNamespaceRevision, status.ownerScopeDigest, status.personalModelId,
    status.configurationRevision, status.executionDefinitionDigest, status.statusRevision,
    status.status, nullable(status.detailCode), nullable(status.detailDigest), status.statusOrigin,
    nullable(status.carriedFromConfigurationRevision), status.carriedFromStatusRevision ?? null,
    nullable(status.carriedFromStatusRecordDigest), status.updatedAt, JSON.stringify(status),
    status.recordDigest,
  );
  database.prepare(`
    INSERT INTO personal_model_command_receipts (
      owner_scope_namespace_revision, owner_scope_digest, command_id, command_type,
      request_digest, model_id, committed_configuration_revision, outcome,
      committed_at, receipt_json, receipt_digest
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    receipt.ownerScopeNamespaceRevision, receipt.ownerScopeDigest, receipt.commandId,
    receipt.commandType, receipt.requestDigest, receipt.modelId ?? null,
    receipt.committedConfigurationRevision ?? null, receipt.outcome, receipt.committedAt,
    JSON.stringify(receipt), receipt.receiptDigest,
  );
  return { ok: true };
}

function insertLink(database: DatabaseSync, link: LocalPersonalModelInvocationLink): void {
  database.prepare(`
    INSERT INTO local_personal_model_invocation_links (
      invocation_kind, invocation_link_id, authority_invocation_id, session_id, task_id,
      run_id, round, task_runtime_selection_id, task_runtime_selection_digest,
      model_lock_id, model_lock_digest, owner_scope_namespace_revision, owner_scope_digest,
      personal_model_id, configuration_revision, execution_definition_digest,
      provider_profile_revision, endpoint_identity_digest, credential_binding_digest,
      model_request_digest, admission_scope_digest, status, fencing_epoch,
      output_started_at, terminal_at, terminal_class, typed_error_code,
      created_at, updated_at, record_json, record_digest
    ) VALUES (${Array.from({ length: 31 }, () => "?").join(",")})
  `).run(...linkValues(link));
}

function insertTimeoutFact(
  database: DatabaseSync,
  fact: LocalPersonalInvocationTimeoutFact,
): void {
  database.prepare(`
    INSERT INTO local_personal_invocation_timeout_facts (
      authority_invocation_id, timeout_policy_revision, timeout_policy_digest,
      selected_overall_timeout_ms, effective_deadline_source, outer_deadline_at,
      invocation_started_at, policy_deadline_at, invocation_deadline_at,
      record_json, record_digest
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fact.authorityInvocationId, fact.timeoutPolicyRevision, fact.timeoutPolicyDigest,
    fact.selectedOverallTimeoutMs, fact.effectiveDeadlineSource,
    fact.outerDeadlineAt ?? null, fact.invocationStartedAt, fact.policyDeadlineAt,
    fact.invocationDeadlineAt, JSON.stringify(fact), fact.recordDigest,
  );
}

function selectTimeoutFact(
  database: DatabaseSync,
  authorityInvocationId: string,
): LocalPersonalInvocationTimeoutFact | undefined {
  const row = database.prepare(`
    SELECT * FROM local_personal_invocation_timeout_facts
    WHERE authority_invocation_id = ?
  `).get(authorityInvocationId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  if (typeof row.record_json !== "string") {
    throw new Error("local_personal.timeout_fact_drift");
  }
  try {
    const fact = validateLocalPersonalInvocationTimeoutFact(
      JSON.parse(row.record_json) as LocalPersonalInvocationTimeoutFact,
    );
    const matches = row.authority_invocation_id === fact.authorityInvocationId
      && row.timeout_policy_revision === fact.timeoutPolicyRevision
      && row.timeout_policy_digest === fact.timeoutPolicyDigest
      && row.selected_overall_timeout_ms === fact.selectedOverallTimeoutMs
      && row.effective_deadline_source === fact.effectiveDeadlineSource
      && (row.outer_deadline_at ?? undefined) === fact.outerDeadlineAt
      && row.invocation_started_at === fact.invocationStartedAt
      && row.policy_deadline_at === fact.policyDeadlineAt
      && row.invocation_deadline_at === fact.invocationDeadlineAt
      && row.record_digest === fact.recordDigest;
    if (!matches) throw new Error("local_personal.timeout_fact_drift");
    return fact;
  } catch {
    throw new Error("local_personal.timeout_fact_drift");
  }
}

function updateLink(
  database: DatabaseSync,
  expectedRecordDigest: string,
  next: LocalPersonalModelInvocationLink,
): LocalPersonalInvocationWriteResult {
  const current = selectLink(database, next.invocationKind, next.invocationLinkId);
  if (current === undefined) return notFound();
  if (current.recordDigest !== expectedRecordDigest) return conflict("invocation CAS conflict");
  const immutable = linkValues(current).slice(0, 21);
  const nextImmutable = linkValues(next).slice(0, 21);
  if (immutable.some((value, index) => value !== nextImmutable[index])
    || current.createdAt !== next.createdAt) {
    return conflict("immutable invocation identity changed");
  }
  if (current.schemaVersion !== next.schemaVersion
    || (current.schemaVersion === "v1alpha2" && next.schemaVersion === "v1alpha2"
      && (current.contextAssemblyReceiptDigest !== next.contextAssemblyReceiptDigest
        || sha256CanonicalJson(JsonValueSchema.parse(current.dynamicRequestFacts))
          !== sha256CanonicalJson(JsonValueSchema.parse(next.dynamicRequestFacts))))) {
    return conflict("immutable dynamic invocation context changed");
  }
  if (next.fencingEpoch < current.fencingEpoch) return staleFencing();
  if (next.updatedAt < current.updatedAt) return conflict("invocation timestamp regressed");
  if (current.outputStartedAt !== undefined
    && next.outputStartedAt !== current.outputStartedAt) {
    return conflict("output-started evidence changed");
  }
  const order = ["accepted", "dispatching", "output_started", "terminal", "recovery_exhausted"];
  if (order.indexOf(next.status) < order.indexOf(current.status)) {
    return conflict("invocation status regressed");
  }
  if (current.recordDigest === next.recordDigest) return success(current, true);
  if (current.status === "terminal" || current.status === "recovery_exhausted") {
    return conflict("terminal invocation is immutable");
  }
  const result = database.prepare(`
    UPDATE local_personal_model_invocation_links SET
      status = ?, fencing_epoch = ?, output_started_at = ?, terminal_at = ?,
      terminal_class = ?, typed_error_code = ?, updated_at = ?, record_json = ?, record_digest = ?
    WHERE invocation_kind = ? AND invocation_link_id = ? AND record_digest = ?
  `).run(
    next.status, next.fencingEpoch, nullable(next.outputStartedAt), nullable(next.terminalAt),
    nullable(next.terminalClass), nullable(next.typedErrorCode), next.updatedAt,
    JSON.stringify(next), next.recordDigest, next.invocationKind, next.invocationLinkId,
    expectedRecordDigest,
  );
  return Number(result.changes) === 1 ? success(next, false) : conflict("invocation CAS conflict");
}

function selectLink(
  database: DatabaseSync,
  kind: string,
  id: string,
): LocalPersonalModelInvocationLink | undefined {
  const row = database.prepare(`
    SELECT record_json FROM local_personal_model_invocation_links
    WHERE invocation_kind = ? AND invocation_link_id = ?
  `).get(kind, id) as Record<string, unknown> | undefined;
  return row === undefined ? undefined : parseLink(row);
}

function parseLink(row: Record<string, unknown>): LocalPersonalModelInvocationLink {
  if (typeof row.record_json !== "string") throw new Error("Local invocation row is invalid");
  return validateLocalPersonalModelInvocationLink(JSON.parse(row.record_json) as
    LocalPersonalModelInvocationLink);
}

function linkValues(link: LocalPersonalModelInvocationLink): readonly (string | number | null)[] {
  return [
    link.invocationKind, link.invocationLinkId, link.authorityInvocationId, link.sessionId,
    link.taskId, link.runId, link.round, link.taskRuntimeSelectionId,
    link.taskRuntimeSelectionDigest, link.modelLockId, link.modelLockDigest,
    link.ownerScopeNamespaceRevision, link.ownerScopeDigest, link.personalModelId,
    link.configurationRevision, link.executionDefinitionDigest, link.providerProfileRevision,
    link.endpointIdentityDigest, link.credentialBindingDigest, link.modelRequestDigest,
    link.admissionScopeDigest, link.status, link.fencingEpoch, nullable(link.outputStartedAt),
    nullable(link.terminalAt), nullable(link.terminalClass), nullable(link.typedErrorCode),
    link.createdAt, link.updatedAt, JSON.stringify(link), link.recordDigest,
  ];
}

function recordUsage(
  database: DatabaseSync,
  fact: ProviderUsageFact,
  now: string,
): ProviderUsageWriteResult {
  if (fact.usageAuthority !== "local_personal") return usageConflict();
  const row = database.prepare(`
    SELECT state, usage_digest, fact_json FROM local_personal_provider_usage_facts
    WHERE authority_invocation_id = ? AND provider_attempt_key = ?
  `).get(fact.authorityInvocationId, fact.providerAttemptKey) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return {
      ok: false,
      error: {
        code: "provider_usage.attempt_not_registered",
        message: "Provider Usage references an unregistered attempt",
      },
    };
  }
  if (row.state === "recorded") {
    if (row.usage_digest !== fact.usageDigest || typeof row.fact_json !== "string") {
      return usageConflict();
    }
    return {
      ok: true,
      replayed: true,
      value: ProviderUsageFactSchema.parse(JSON.parse(row.fact_json) as unknown),
    };
  }
  const result = database.prepare(`
    UPDATE local_personal_provider_usage_facts
    SET state = 'recorded', usage_digest = ?, fact_json = ?, updated_at = ?
    WHERE authority_invocation_id = ? AND provider_attempt_key = ? AND state = 'registered'
  `).run(
    fact.usageDigest, JSON.stringify(fact), now,
    fact.authorityInvocationId, fact.providerAttemptKey,
  );
  return Number(result.changes) === 1
    ? { ok: true, replayed: false, value: fact }
    : usageConflict();
}

function withTransaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const value = work();
    database.exec("COMMIT");
    return value;
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* preserve original */ }
    throw error;
  }
}

class LocalInvocationTransactionAbort extends Error {
  public constructor(public readonly result: LocalPersonalInvocationWriteResult) {
    super(result.ok ? "Local invocation transaction aborted" : result.error.message);
    this.name = "LocalInvocationTransactionAbort";
  }
}

function abortTransaction(result: LocalPersonalInvocationWriteResult): never {
  throw new LocalInvocationTransactionAbort(result);
}

function nullable(value: string | undefined): string | null { return value ?? null; }
function success(
  value: LocalPersonalModelInvocationLink,
  replayed: boolean,
): LocalPersonalInvocationWriteResult { return { ok: true, replayed, value }; }
function conflict(message: string): LocalPersonalInvocationWriteResult {
  return { ok: false, error: { code: "local_personal_invocation.conflict", message } };
}
function notFound(): LocalPersonalInvocationWriteResult {
  return {
    ok: false,
    error: { code: "local_personal_invocation.not_found", message: "invocation link not found" },
  };
}
function legacyTimeoutMissing(): LocalPersonalInvocationWriteResult {
  return {
    ok: false,
    error: {
      code: "local_personal.timeout_fact_legacy_missing",
      message: "pending local invocation has no durable timeout fact",
    },
  };
}
function timeoutDrift(message: string): LocalPersonalInvocationWriteResult {
  return { ok: false, error: { code: "local_personal.timeout_fact_drift", message } };
}
function staleFencing(): LocalPersonalInvocationWriteResult {
  return {
    ok: false,
    error: {
      code: "local_personal_invocation.stale_fencing",
      message: "stale invocation owner cannot advance durable facts",
    },
  };
}
function usageConflict(): ProviderUsageWriteResult {
  return {
    ok: false,
    error: { code: "provider_usage.conflict", message: "Provider Usage digest changed" },
  };
}
