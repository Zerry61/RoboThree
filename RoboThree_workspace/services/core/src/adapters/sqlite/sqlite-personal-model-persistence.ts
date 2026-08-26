import { createHmac, timingSafeEqual } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { JsonValueSchema, canonicalJsonStringify } from "@robothree/contracts";

import {
  PersonalModelDefinitionSchema,
  PersonalModelHeadSchema,
  PersonalModelPreferenceSchema,
  PersonalModelStatusFactSchema,
  calculateCredentialBindingDigest,
  calculatePersonalModelAuxiliaryDigest,
  createPersonalModelHead,
  validatePersonalModelDefinition,
  validatePersonalModelHead,
  validatePersonalModelOwnerNamespace,
  validatePersonalModelPreference,
  validatePersonalModelStatusFact,
  type PersonalModelDefinition,
  type PersonalModelHead,
  type PersonalModelOwnerIdentity,
  type PersonalModelOwnerNamespace,
  type PersonalModelPreference,
  type PersonalModelStatusFact,
} from "../../application/personal-model-domain.js";
import type { Clock } from "../../ports/clock.js";
import {
  sameOwner,
  validatePersonalModelCommandReceipt,
  validatePersonalModelOperation,
  type CommitCreateOutcomeInput,
  type CommitDeleteOutcomeInput,
  type CommitPreferenceOutcomeInput,
  type CommitStatusOutcomeInput,
  type CommitUpdateOutcomeInput,
  type PersonalModelCommandReceipt,
  type PersonalModelListPage,
  type PersonalModelOperation,
  type PersonalModelOperationPhase,
  type PersonalModelPersistence,
  type PersonalModelPersistenceErrorCode,
  type PersonalModelWriteResult,
} from "../../ports/personal-model-persistence.js";
import { configureSqlite, migrateAndPreflight } from "./schema-preflight.js";

const CURSOR_DOMAIN = "robothree.personal-model.active-head-cursor.v1";
const MAX_PAGE_BYTES = 256 * 1024;
const MAX_QUERY_HEADS = 10_000;

export type SqlitePersonalModelFaultPoint =
  | "personal_model.begin.before_commit"
  | "personal_model.begin.after_commit_before_response"
  | "personal_model.observation.before_commit"
  | "personal_model.observation.after_commit_before_response"
  | "personal_model.outcome.before_commit"
  | "personal_model.outcome.after_commit_before_response";

export class SqlitePersonalModelPersistence implements PersonalModelPersistence {
  readonly #databasePath: string;
  readonly #clock: Clock;
  readonly #faultInjector: ((point: SqlitePersonalModelFaultPoint) => void) | undefined;
  #database: DatabaseSync | undefined;

  constructor(input: Readonly<{
    databasePath: string;
    clock: Clock;
    faultInjector?: (point: SqlitePersonalModelFaultPoint) => void;
  }>) {
    this.#databasePath = input.databasePath;
    this.#clock = input.clock;
    this.#faultInjector = input.faultInjector;
  }

  public async start(): Promise<void> {
    if (this.#database !== undefined) return;
    const database = new DatabaseSync(this.#databasePath, { allowExtension: false });
    try {
      configureSqlite(database);
      migrateAndPreflight(database, this.#clock);
      database.enableDefensive(true);
      const namespace = selectNamespace(database);
      if (namespace !== undefined) validatePersonalModelOwnerNamespace(namespace);
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

  public async loadActiveOwnerNamespace(): Promise<PersonalModelOwnerNamespace | undefined> {
    return selectNamespace(this.#requireDatabase());
  }

  public async initializeOwnerNamespace(
    namespace: PersonalModelOwnerNamespace,
  ): Promise<PersonalModelWriteResult<PersonalModelOwnerNamespace>> {
    const validated = validatePersonalModelOwnerNamespace(namespace);
    const database = this.#requireDatabase();
    return withWriteResult<PersonalModelOwnerNamespace>(database, () => {
      const existing = selectNamespace(database);
      if (existing !== undefined) {
        return existing.recordDigest === validated.recordDigest
          ? success(existing, true)
          : failure("personal_model.owner_namespace_unavailable", "An active owner namespace already exists");
      }
      insertNamespace(database, validated);
      return success(validated, false);
    });
  }

  public async loadDefinition(
    owner: PersonalModelOwnerIdentity,
    modelId: string,
    configurationRevision: string,
  ): Promise<PersonalModelDefinition | undefined> {
    this.#requireOwner(owner);
    return selectDefinition(this.#requireDatabase(), owner, modelId, configurationRevision);
  }

  public async loadHead(
    owner: PersonalModelOwnerIdentity,
    modelId: string,
  ): Promise<PersonalModelHead | undefined> {
    this.#requireOwner(owner);
    return selectHead(this.#requireDatabase(), owner, modelId);
  }

  public async listActiveHeads(
    owner: PersonalModelOwnerIdentity,
    cursor: string | undefined,
    limit: number,
  ): Promise<PersonalModelWriteResult<PersonalModelListPage>> {
    const namespace = this.#requireOwner(owner);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return failure("personal_model.limit_exceeded", "Personal Model page limit must be within 1..100");
    }
    const database = this.#requireDatabase();
    const rows = database.prepare(`
      SELECT * FROM personal_model_heads
      WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ? AND selection_state = 'active'
      ORDER BY updated_at, personal_model_id LIMIT ?
    `).all(owner.ownerScopeNamespaceRevision, owner.ownerScopeDigest, MAX_QUERY_HEADS + 1);
    if (rows.length > MAX_QUERY_HEADS) {
      return failure("personal_model.limit_exceeded", "Personal Model active head set exceeds the bounded query limit");
    }
    const active = rows.map((row) => parseHead(row as Record<string, unknown>));
    const queryRevision = calculateQueryRevision(owner, active);
    let start = 0;
    if (cursor !== undefined) {
      const decoded = decodeCursor(namespace, cursor);
      if (!decoded.ok) return decoded;
      if (!sameOwner(decoded.value.ownerIdentity, owner)
        || decoded.value.queryRevision !== queryRevision) {
        return failure("personal_model.stale_cursor", "Personal Model cursor no longer matches the active set");
      }
      start = active.findIndex((head) => head.updatedAt === decoded.value.lastUpdatedAt
        && head.personalModelId === decoded.value.lastModelId) + 1;
      if (start === 0) {
        return failure("personal_model.stale_cursor", "Personal Model cursor sort key is unavailable");
      }
    }
    const heads = active.slice(start, start + limit);
    const last = heads.at(-1);
    const nextCursor = start + heads.length < active.length && last !== undefined
      ? encodeCursor(namespace, {
        ownerIdentity: owner,
        queryRevision,
        lastUpdatedAt: last.updatedAt,
        lastModelId: last.personalModelId,
      })
      : undefined;
    const page = { heads, queryRevision, ...(nextCursor === undefined ? {} : { nextCursor }) };
    if (Buffer.byteLength(canonicalJsonStringify(JsonValueSchema.parse(page)), "utf8") > MAX_PAGE_BYTES) {
      return failure("personal_model.limit_exceeded", "Personal Model page exceeds the bounded response size");
    }
    return success(page, false);
  }

  public async loadStatus(
    owner: PersonalModelOwnerIdentity,
    modelId: string,
    configurationRevision: string,
  ): Promise<PersonalModelStatusFact | undefined> {
    this.#requireOwner(owner);
    return selectLatestStatus(this.#requireDatabase(), owner, modelId, configurationRevision);
  }

  public async loadPreference(
    owner: PersonalModelOwnerIdentity,
  ): Promise<PersonalModelPreference | undefined> {
    this.#requireOwner(owner);
    return selectPreference(this.#requireDatabase(), owner);
  }

  public async loadByCommand(
    owner: PersonalModelOwnerIdentity,
    commandId: string,
  ): Promise<PersonalModelOperation | undefined> {
    this.#requireOwner(owner);
    return selectOperation(this.#requireDatabase(), owner, commandId);
  }

  public async loadPending(
    owner: PersonalModelOwnerIdentity,
    limit: number,
  ): Promise<readonly PersonalModelOperation[]> {
    this.#requireOwner(owner);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Personal Model pending limit must be within 1..100");
    }
    return this.#requireDatabase().prepare(`
      SELECT * FROM personal_model_operations
      WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ?
        AND operation_phase NOT IN ('committed','manual_attention')
      ORDER BY updated_at, command_id LIMIT ?
    `).all(owner.ownerScopeNamespaceRevision, owner.ownerScopeDigest, limit)
      .map((row) => parseOperation(row as Record<string, unknown>));
  }

  public async loadReceipt(
    owner: PersonalModelOwnerIdentity,
    commandId: string,
  ): Promise<PersonalModelCommandReceipt | undefined> {
    this.#requireOwner(owner);
    return selectReceipt(this.#requireDatabase(), owner, commandId);
  }

  public async beginCredentialOperation(
    operation: PersonalModelOperation,
  ): Promise<PersonalModelWriteResult<PersonalModelOperation>> {
    const validated = validatePersonalModelOperation(operation);
    const owner = ownerOf(validated);
    this.#requireOwner(owner);
    if (validated.operationPhase !== "intent_committed" || validated.phaseRevision !== 1) {
      return failure("personal_model.invalid_transition", "Credential operation must begin at intent revision 1");
    }
    const database = this.#requireDatabase();
    const result = withWriteResult<PersonalModelOperation>(database, () => {
      const existing = selectOperation(database, owner, validated.commandId);
      if (existing !== undefined) return sameOperation(existing, validated);
      if (validated.operationType === "delete") {
        const current = selectHead(database, owner, validated.targetModelId);
        if (current === undefined
          || current.selectionState !== "active"
          || current.currentConfigurationRevision !== validated.expectedConfigurationRevision
          || current.currentExecutionDefinitionDigest !== validated.expectedExecutionDefinitionDigest) {
          return failure("personal_model.conflict", "Delete intent does not match the active Personal Model head");
        }
        updateHead(database, createHeadRevision(current, "delete_pending", validated.updatedAt), current.headRevision);
      }
      insertOperation(database, validated);
      this.#faultInjector?.("personal_model.begin.before_commit");
      return success(validated, false);
    });
    if (result.ok && !result.replayed) {
      this.#faultInjector?.("personal_model.begin.after_commit_before_response");
    }
    return result;
  }

  public async advanceCredentialObservation(input: Readonly<{
    ownerIdentity: PersonalModelOwnerIdentity;
    commandId: string;
    expectedPhase: PersonalModelOperationPhase;
    operation: PersonalModelOperation;
  }>): Promise<PersonalModelWriteResult<PersonalModelOperation>> {
    const target = validatePersonalModelOperation(input.operation);
    this.#requireOwner(input.ownerIdentity);
    if (!sameOwner(ownerOf(target), input.ownerIdentity) || target.commandId !== input.commandId) {
      return failure("personal_model.conflict", "Credential observation owner or command identity changed");
    }
    const database = this.#requireDatabase();
    const result = withWriteResult<PersonalModelOperation>(database, () => {
      const current = selectOperation(database, input.ownerIdentity, input.commandId);
      if (current === undefined) return failure("personal_model.not_found", "Credential operation does not exist");
      if (current.recordDigest === target.recordDigest) return success(current, true);
      if (current.operationPhase !== input.expectedPhase
        || target.phaseRevision !== current.phaseRevision + 1
        || !validTransition(current.operationPhase, target.operationPhase)
        || current.requestDigest !== target.requestDigest) {
        return failure("personal_model.invalid_transition", "Credential operation phase transition is stale or invalid");
      }
      updateOperation(database, target, current.phaseRevision);
      this.#faultInjector?.("personal_model.observation.before_commit");
      return success(target, false);
    });
    if (result.ok && !result.replayed) {
      this.#faultInjector?.("personal_model.observation.after_commit_before_response");
    }
    return result;
  }

  public async commitCreateOutcome(
    input: CommitCreateOutcomeInput,
  ): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>> {
    return this.#commitDefinitionOutcome(input, undefined);
  }

  public async commitUpdateOutcome(
    input: CommitUpdateOutcomeInput,
  ): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>> {
    return this.#commitDefinitionOutcome(input, input.expectedHeadRevision);
  }

  public async commitDeleteOutcome(
    input: CommitDeleteOutcomeInput,
  ): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>> {
    const operation = validatePersonalModelOperation(input.operation);
    const head = validatePersonalModelHead(input.head);
    const receipt = validatePersonalModelCommandReceipt(input.receipt);
    const owner = ownerOf(operation);
    this.#requireOwner(owner);
    const database = this.#requireDatabase();
    const result = withWriteResult<PersonalModelCommandReceipt>(database, () => {
      const replay = replayReceipt(database, owner, receipt);
      if (replay !== undefined) return replay;
      const currentOperation = selectOperation(database, owner, operation.commandId);
      const currentHead = selectHead(database, owner, operation.targetModelId);
      if (currentOperation === undefined
        || currentOperation.operationPhase !== "credential_step_observed"
        || operation.operationPhase !== "committed"
        || operation.credentialObservation?.state !== "absent"
        || operation.credentialObservation.credentialRef !== operation.previousCredentialRef
        || currentHead === undefined
        || currentHead.selectionState !== "delete_pending"
        || currentHead.headRevision !== input.expectedHeadRevision
        || head.selectionState !== "tombstoned"
        || head.headRevision !== currentHead.headRevision + 1
        || receipt.modelId !== operation.targetModelId
        || receipt.committedConfigurationRevision !== undefined
        || !sameOutcomeIdentity(operation, receipt)) {
        return failure("personal_model.conflict", "Delete outcome does not match durable intent and head");
      }
      updateOperation(database, operation, currentOperation.phaseRevision);
      updateHead(database, head, currentHead.headRevision);
      insertReceipt(database, receipt);
      this.#faultInjector?.("personal_model.outcome.before_commit");
      return success(receipt, false);
    });
    if (result.ok && !result.replayed) {
      this.#faultInjector?.("personal_model.outcome.after_commit_before_response");
    }
    return result;
  }

  public async commitStatusOutcome(
    input: CommitStatusOutcomeInput,
  ): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>> {
    const status = validatePersonalModelStatusFact(input.status);
    const receipt = validatePersonalModelCommandReceipt(input.receipt);
    const owner = ownerOf(status);
    this.#requireOwner(owner);
    const database = this.#requireDatabase();
    const result = withWriteResult<PersonalModelCommandReceipt>(database, () => {
      const replay = replayReceipt(database, owner, receipt);
      if (replay !== undefined) return replay;
      const definition = selectDefinition(
        database,
        owner,
        status.personalModelId,
        status.configurationRevision,
      );
      const current = selectLatestStatus(
        database,
        owner,
        status.personalModelId,
        status.configurationRevision,
      );
      if (definition === undefined
        || definition.executionDefinitionDigest !== status.executionDefinitionDigest
        || (current?.statusRevision ?? 0) !== input.expectedStatusRevision
        || status.statusRevision !== input.expectedStatusRevision + 1
        || receipt.commandType !== "status"
        || receipt.modelId !== status.personalModelId
        || receipt.committedConfigurationRevision !== status.configurationRevision) {
        return failure("personal_model.conflict", "Status outcome does not match exact Personal Model revision");
      }
      const provenance = validateCarryForward(database, status);
      if (!provenance.ok) return provenance;
      insertStatus(database, status);
      insertReceipt(database, receipt);
      this.#faultInjector?.("personal_model.outcome.before_commit");
      return success(receipt, false);
    });
    if (result.ok && !result.replayed) {
      this.#faultInjector?.("personal_model.outcome.after_commit_before_response");
    }
    return result;
  }

  public async commitPreferenceOutcome(
    input: CommitPreferenceOutcomeInput,
  ): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>> {
    const preference = validatePersonalModelPreference(input.preference);
    const receipt = validatePersonalModelCommandReceipt(input.receipt);
    const owner = ownerOf(preference);
    this.#requireOwner(owner);
    const database = this.#requireDatabase();
    const result = withWriteResult<PersonalModelCommandReceipt>(database, () => {
      const replay = replayReceipt(database, owner, receipt);
      if (replay !== undefined) return replay;
      const current = selectPreference(database, owner);
      if ((current?.preferenceRevision ?? 0) !== input.expectedPreferenceRevision
        || preference.preferenceRevision !== input.expectedPreferenceRevision + 1
        || receipt.commandType !== "preference"
        || !sameOwner(ownerOf(receipt), owner)) {
        return failure("personal_model.conflict", "Preference outcome revision is stale");
      }
      if (preference.modelSource === "personal") {
        const head = selectHead(database, owner, preference.modelId!);
        if (head === undefined
          || head.selectionState !== "active"
          || head.currentConfigurationRevision !== preference.configurationRevision) {
          return failure("personal_model.conflict", "Personal preference does not reference an active exact revision");
        }
      }
      upsertPreference(database, preference, current?.preferenceRevision ?? 0);
      insertReceipt(database, receipt);
      this.#faultInjector?.("personal_model.outcome.before_commit");
      return success(receipt, false);
    });
    if (result.ok && !result.replayed) {
      this.#faultInjector?.("personal_model.outcome.after_commit_before_response");
    }
    return result;
  }

  public async markOperationManualAttention(input: Readonly<{
    operation: PersonalModelOperation;
    receipt: PersonalModelCommandReceipt;
  }>): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>> {
    const operation = validatePersonalModelOperation(input.operation);
    const receipt = validatePersonalModelCommandReceipt(input.receipt);
    const owner = ownerOf(operation);
    this.#requireOwner(owner);
    const database = this.#requireDatabase();
    const result = withWriteResult<PersonalModelCommandReceipt>(database, () => {
      const replay = replayReceipt(database, owner, receipt);
      if (replay !== undefined) return replay;
      const current = selectOperation(database, owner, operation.commandId);
      if (current === undefined
        || !validTransition(current.operationPhase, "manual_attention")
        || operation.operationPhase !== "manual_attention"
        || operation.phaseRevision !== current.phaseRevision + 1
        || receipt.outcome !== "manual_attention"
        || !sameOutcomeIdentity(operation, receipt)) {
        return failure("personal_model.invalid_transition", "Manual attention outcome does not match operation");
      }
      updateOperation(database, operation, current.phaseRevision);
      insertReceipt(database, receipt);
      this.#faultInjector?.("personal_model.outcome.before_commit");
      return success(receipt, false);
    });
    if (result.ok && !result.replayed) {
      this.#faultInjector?.("personal_model.outcome.after_commit_before_response");
    }
    return result;
  }

  #commitDefinitionOutcome(
    input: CommitCreateOutcomeInput | CommitUpdateOutcomeInput,
    expectedHeadRevision: number | undefined,
  ): PersonalModelWriteResult<PersonalModelCommandReceipt> {
    const operation = validatePersonalModelOperation(input.operation);
    const definition = validatePersonalModelDefinition(input.definition);
    const head = validatePersonalModelHead(input.head);
    const status = validatePersonalModelStatusFact(input.status);
    const receipt = validatePersonalModelCommandReceipt(input.receipt);
    const owner = ownerOf(operation);
    this.#requireOwner(owner);
    const database = this.#requireDatabase();
    const result = withWriteResult<PersonalModelCommandReceipt>(database, () => {
      const replay = replayReceipt(database, owner, receipt);
      if (replay !== undefined) return replay;
      const currentOperation = selectOperation(database, owner, operation.commandId);
      const currentHead = selectHead(database, owner, operation.targetModelId);
      const observation = operation.credentialObservation;
      if (currentOperation === undefined
        || currentOperation.operationPhase !== "credential_step_observed"
        || !["committed", "credential_cleanup_pending"].includes(operation.operationPhase)
        || observation?.state !== "present"
        || observation.credentialRef !== definition.credentialRef
        || observation.credentialRevision !== definition.credentialRevision
        || observation.credentialBindingDigest !== definition.credentialBindingDigest
        || calculateCredentialBindingDigest(observation) !== definition.credentialBindingDigest
        || (operation.operationType === "create"
          && observation.createdByOperationId !== operation.commandId)
        || !sameOwner(ownerOf(definition), owner)
        || !sameOwner(ownerOf(head), owner)
        || !sameOwner(ownerOf(status), owner)
        || definition.personalModelId !== operation.targetModelId
        || head.personalModelId !== definition.personalModelId
        || head.currentConfigurationRevision !== definition.configurationRevision
        || head.currentExecutionDefinitionDigest !== definition.executionDefinitionDigest
        || status.configurationRevision !== definition.configurationRevision
        || status.executionDefinitionDigest !== definition.executionDefinitionDigest
        || status.statusRevision !== 1
        || receipt.modelId !== definition.personalModelId
        || receipt.committedConfigurationRevision !== definition.configurationRevision
        || !sameOutcomeIdentity(operation, receipt)) {
        return failure(
          "personal_model.credential_binding_conflict",
          "Definition outcome does not match Credential binding proof",
        );
      }
      if (expectedHeadRevision === undefined) {
        if (operation.operationType !== "create" || currentHead !== undefined || head.headRevision !== 1) {
          return failure("personal_model.conflict", "Create outcome conflicts with an existing Personal Model head");
        }
      } else if (operation.operationType !== "update"
        || currentHead === undefined
        || currentHead.selectionState !== "active"
        || currentHead.headRevision !== expectedHeadRevision
        || currentHead.currentConfigurationRevision !== operation.expectedConfigurationRevision
        || currentHead.currentExecutionDefinitionDigest !== operation.expectedExecutionDefinitionDigest
        || head.headRevision !== expectedHeadRevision + 1) {
        return failure("personal_model.conflict", "Update outcome expected head is stale");
      }
      const existingDefinition = selectDefinition(
        database,
        owner,
        definition.personalModelId,
        definition.configurationRevision,
      );
      if (existingDefinition !== undefined && existingDefinition.recordDigest !== definition.recordDigest) {
        return failure("personal_model.conflict", "Immutable Personal Model definition revision conflicts");
      }
      const provenance = validateCarryForward(database, status);
      if (!provenance.ok) return provenance;
      if (existingDefinition === undefined) insertDefinition(database, definition);
      if (currentHead === undefined) insertHead(database, head);
      else updateHead(database, head, currentHead.headRevision);
      insertStatus(database, status);
      updateOperation(database, operation, currentOperation.phaseRevision);
      insertReceipt(database, receipt);
      this.#faultInjector?.("personal_model.outcome.before_commit");
      return success(receipt, false);
    });
    if (result.ok && !result.replayed) {
      this.#faultInjector?.("personal_model.outcome.after_commit_before_response");
    }
    return result;
  }

  #requireOwner(owner: PersonalModelOwnerIdentity): PersonalModelOwnerNamespace {
    const namespace = selectNamespace(this.#requireDatabase());
    if (namespace === undefined || namespace.namespaceRevision !== owner.ownerScopeNamespaceRevision) {
      throw new Error("Personal Model owner namespace is unavailable");
    }
    return namespace;
  }

  #requireDatabase(): DatabaseSync {
    if (this.#database === undefined) throw new Error("Personal Model persistence is not started");
    return this.#database;
  }
}

function selectNamespace(database: DatabaseSync): PersonalModelOwnerNamespace | undefined {
  const activeRows = database.prepare(`
    SELECT namespace_revision, namespace_key, namespace_key_check_digest, status,
      created_at, record_json, record_digest
    FROM personal_model_owner_scope_namespaces WHERE status = 'active'
  `).all() as Record<string, unknown>[];
  if (activeRows.length > 1) {
    throw new Error("Personal Model owner namespace has multiple active rows");
  }
  const row = activeRows[0];
  if (row === undefined) {
    const facts = database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM personal_model_definitions)
        + (SELECT COUNT(*) FROM personal_model_heads)
        + (SELECT COUNT(*) FROM personal_model_status_facts)
        + (SELECT COUNT(*) FROM personal_model_preferences)
        + (SELECT COUNT(*) FROM personal_model_operations)
        + (SELECT COUNT(*) FROM personal_model_command_receipts) AS fact_count
    `).get() as Record<string, unknown> | undefined;
    if (typeof facts?.fact_count === "number" && facts.fact_count > 0) {
      throw new Error("Personal Model owner facts exist without an active namespace");
    }
    return undefined;
  }
  const safe = parseJsonObject(row.record_json, "record_json");
  const namespace: PersonalModelOwnerNamespace = {
    namespaceRevision: requireNumber(row.namespace_revision, "namespace_revision"),
    namespaceKey: requireBytes(row.namespace_key, "namespace_key"),
    namespaceKeyCheckDigest: requireString(row.namespace_key_check_digest, "namespace_key_check_digest") as never,
    status: requireString(row.status, "status") as "active",
    createdAt: requireString(row.created_at, "created_at"),
    recordDigest: requireString(row.record_digest, "record_digest") as never,
  };
  const expectedSafe = {
    namespaceRevision: namespace.namespaceRevision,
    namespaceKeyCheckDigest: namespace.namespaceKeyCheckDigest,
    status: namespace.status,
    createdAt: namespace.createdAt,
    recordDigest: namespace.recordDigest,
  };
  if (canonicalJsonStringify(JsonValueSchema.parse(safe))
    !== canonicalJsonStringify(JsonValueSchema.parse(expectedSafe))) {
    throw new Error("Personal Model owner namespace indexed columns do not match record_json");
  }
  return validatePersonalModelOwnerNamespace(namespace);
}

function insertNamespace(database: DatabaseSync, namespace: PersonalModelOwnerNamespace): void {
  const safe = {
    namespaceRevision: namespace.namespaceRevision,
    namespaceKeyCheckDigest: namespace.namespaceKeyCheckDigest,
    status: namespace.status,
    createdAt: namespace.createdAt,
    recordDigest: namespace.recordDigest,
  };
  database.prepare(`
    INSERT INTO personal_model_owner_scope_namespaces (
      namespace_revision, namespace_key, namespace_key_check_digest, status,
      created_at, record_json, record_digest
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    namespace.namespaceRevision,
    Buffer.from(namespace.namespaceKey),
    namespace.namespaceKeyCheckDigest,
    namespace.status,
    namespace.createdAt,
    JSON.stringify(safe),
    namespace.recordDigest,
  );
}

function selectDefinition(
  database: DatabaseSync,
  owner: PersonalModelOwnerIdentity,
  modelId: string,
  revision: string,
): PersonalModelDefinition | undefined {
  const row = database.prepare(`
    SELECT * FROM personal_model_definitions
    WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ?
      AND personal_model_id = ? AND configuration_revision = ?
  `).get(owner.ownerScopeNamespaceRevision, owner.ownerScopeDigest, modelId, revision) as
    Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const value = validatePersonalModelDefinition(PersonalModelDefinitionSchema.parse(
    parseJsonObject(row.record_json, "record_json"),
  ));
  assertIndexed(value, row, {
    ownerScopeNamespaceRevision: "owner_scope_namespace_revision",
    ownerScopeDigest: "owner_scope_digest",
    personalModelId: "personal_model_id",
    configurationRevision: "configuration_revision",
    executionDefinitionDigest: "execution_definition_digest",
    providerKind: "provider_kind",
    providerProfileRevision: "provider_profile_revision",
    protocol: "protocol",
    canonicalEndpoint: "canonical_endpoint",
    endpointIdentityDigest: "endpoint_identity_digest",
    providerModelId: "provider_model_id",
    displayName: "display_name",
    credentialRef: "credential_ref",
    credentialRevision: "credential_revision",
    credentialBindingDigest: "credential_binding_digest",
    createdAt: "created_at",
    recordDigest: "record_digest",
  });
  assertJsonIndexed(value.capabilities, row.capabilities_json, "capabilities_json");
  return value;
}

function insertDefinition(database: DatabaseSync, value: PersonalModelDefinition): void {
  database.prepare(`
    INSERT INTO personal_model_definitions (
      owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
      configuration_revision, execution_definition_digest, provider_kind,
      provider_profile_revision, protocol, canonical_endpoint, endpoint_identity_digest,
      provider_model_id, display_name, capabilities_json, credential_ref, credential_revision,
      credential_binding_digest, record_json, record_digest, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    value.ownerScopeNamespaceRevision,
    value.ownerScopeDigest,
    value.personalModelId,
    value.configurationRevision,
    value.executionDefinitionDigest,
    value.providerKind,
    value.providerProfileRevision,
    value.protocol,
    value.canonicalEndpoint,
    value.endpointIdentityDigest,
    value.providerModelId,
    value.displayName,
    JSON.stringify(value.capabilities),
    value.credentialRef,
    value.credentialRevision,
    value.credentialBindingDigest,
    JSON.stringify(value),
    value.recordDigest,
    value.createdAt,
  );
}

function selectHead(
  database: DatabaseSync,
  owner: PersonalModelOwnerIdentity,
  modelId: string,
): PersonalModelHead | undefined {
  const row = database.prepare(`
    SELECT * FROM personal_model_heads
    WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ? AND personal_model_id = ?
  `).get(owner.ownerScopeNamespaceRevision, owner.ownerScopeDigest, modelId) as
    Record<string, unknown> | undefined;
  return row === undefined ? undefined : parseHead(row);
}

function parseHead(row: Record<string, unknown>): PersonalModelHead {
  const value = validatePersonalModelHead(PersonalModelHeadSchema.parse(
    parseJsonObject(row.record_json, "record_json"),
  ));
  assertIndexed(value, row, {
    ownerScopeNamespaceRevision: "owner_scope_namespace_revision",
    ownerScopeDigest: "owner_scope_digest",
    personalModelId: "personal_model_id",
    currentConfigurationRevision: "current_configuration_revision",
    currentExecutionDefinitionDigest: "current_execution_definition_digest",
    headRevision: "head_revision",
    selectionState: "selection_state",
    updatedAt: "updated_at",
    recordDigest: "record_digest",
  });
  return value;
}

function insertHead(database: DatabaseSync, value: PersonalModelHead): void {
  database.prepare(`
    INSERT INTO personal_model_heads (
      owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
      current_configuration_revision, current_execution_definition_digest,
      head_revision, selection_state, updated_at, record_json, record_digest
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...headValues(value));
}

function updateHead(database: DatabaseSync, value: PersonalModelHead, expectedRevision: number): void {
  const result = database.prepare(`
    UPDATE personal_model_heads SET
      current_configuration_revision = ?, current_execution_definition_digest = ?,
      head_revision = ?, selection_state = ?, updated_at = ?, record_json = ?, record_digest = ?
    WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ? AND personal_model_id = ?
      AND head_revision = ?
  `).run(
    value.currentConfigurationRevision,
    value.currentExecutionDefinitionDigest,
    value.headRevision,
    value.selectionState,
    value.updatedAt,
    JSON.stringify(value),
    value.recordDigest,
    value.ownerScopeNamespaceRevision,
    value.ownerScopeDigest,
    value.personalModelId,
    expectedRevision,
  );
  if (Number(result.changes) !== 1) throw new Error("Personal Model head compare-and-set failed");
}

function headValues(value: PersonalModelHead): SQLInputValue[] {
  return [
    value.ownerScopeNamespaceRevision,
    value.ownerScopeDigest,
    value.personalModelId,
    value.currentConfigurationRevision,
    value.currentExecutionDefinitionDigest,
    value.headRevision,
    value.selectionState,
    value.updatedAt,
    JSON.stringify(value),
    value.recordDigest,
  ];
}

function selectLatestStatus(
  database: DatabaseSync,
  owner: PersonalModelOwnerIdentity,
  modelId: string,
  revision: string,
): PersonalModelStatusFact | undefined {
  const row = database.prepare(`
    SELECT * FROM personal_model_status_facts
    WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ?
      AND personal_model_id = ? AND configuration_revision = ?
    ORDER BY status_revision DESC LIMIT 1
  `).get(owner.ownerScopeNamespaceRevision, owner.ownerScopeDigest, modelId, revision) as
    Record<string, unknown> | undefined;
  return row === undefined ? undefined : parseStatus(row);
}

function selectExactStatus(
  database: DatabaseSync,
  owner: PersonalModelOwnerIdentity,
  modelId: string,
  revision: string,
  statusRevision: number,
): PersonalModelStatusFact | undefined {
  const row = database.prepare(`
    SELECT * FROM personal_model_status_facts
    WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ?
      AND personal_model_id = ? AND configuration_revision = ? AND status_revision = ?
  `).get(owner.ownerScopeNamespaceRevision, owner.ownerScopeDigest, modelId, revision, statusRevision) as
    Record<string, unknown> | undefined;
  return row === undefined ? undefined : parseStatus(row);
}

function parseStatus(row: Record<string, unknown>): PersonalModelStatusFact {
  const value = validatePersonalModelStatusFact(PersonalModelStatusFactSchema.parse(
    parseJsonObject(row.record_json, "record_json"),
  ));
  assertIndexed(value, row, {
    ownerScopeNamespaceRevision: "owner_scope_namespace_revision",
    ownerScopeDigest: "owner_scope_digest",
    personalModelId: "personal_model_id",
    configurationRevision: "configuration_revision",
    executionDefinitionDigest: "execution_definition_digest",
    statusRevision: "status_revision",
    status: "status",
    detailCode: "detail_code",
    detailDigest: "detail_digest",
    statusOrigin: "status_origin",
    carriedFromConfigurationRevision: "carried_from_configuration_revision",
    carriedFromStatusRevision: "carried_from_status_revision",
    carriedFromStatusRecordDigest: "carried_from_status_record_digest",
    updatedAt: "updated_at",
    recordDigest: "record_digest",
  });
  return value;
}

function insertStatus(database: DatabaseSync, value: PersonalModelStatusFact): void {
  database.prepare(`
    INSERT INTO personal_model_status_facts (
      owner_scope_namespace_revision, owner_scope_digest, personal_model_id,
      configuration_revision, execution_definition_digest, status_revision, status,
      detail_code, detail_digest, status_origin, carried_from_configuration_revision,
      carried_from_status_revision, carried_from_status_record_digest, updated_at,
      record_json, record_digest
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    value.ownerScopeNamespaceRevision,
    value.ownerScopeDigest,
    value.personalModelId,
    value.configurationRevision,
    value.executionDefinitionDigest,
    value.statusRevision,
    value.status,
    nullable(value.detailCode),
    nullable(value.detailDigest),
    value.statusOrigin,
    nullable(value.carriedFromConfigurationRevision),
    nullable(value.carriedFromStatusRevision),
    nullable(value.carriedFromStatusRecordDigest),
    value.updatedAt,
    JSON.stringify(value),
    value.recordDigest,
  );
}

function selectPreference(
  database: DatabaseSync,
  owner: PersonalModelOwnerIdentity,
): PersonalModelPreference | undefined {
  const row = database.prepare(`
    SELECT * FROM personal_model_preferences
    WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ?
  `).get(owner.ownerScopeNamespaceRevision, owner.ownerScopeDigest) as
    Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const value = validatePersonalModelPreference(PersonalModelPreferenceSchema.parse(
    parseJsonObject(row.record_json, "record_json"),
  ));
  assertIndexed(value, row, {
    ownerScopeNamespaceRevision: "owner_scope_namespace_revision",
    ownerScopeDigest: "owner_scope_digest",
    modelSource: "model_source",
    modelId: "model_id",
    configurationRevision: "configuration_revision",
    preferenceRevision: "preference_revision",
    updatedAt: "updated_at",
    recordDigest: "record_digest",
  });
  return value;
}

function upsertPreference(
  database: DatabaseSync,
  value: PersonalModelPreference,
  expectedRevision: number,
): void {
  if (expectedRevision === 0) {
    database.prepare(`
      INSERT INTO personal_model_preferences (
        owner_scope_namespace_revision, owner_scope_digest, model_source, model_id,
        configuration_revision, preference_revision, updated_at, record_json, record_digest
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      value.ownerScopeNamespaceRevision,
      value.ownerScopeDigest,
      nullable(value.modelSource),
      nullable(value.modelId),
      nullable(value.configurationRevision),
      value.preferenceRevision,
      value.updatedAt,
      JSON.stringify(value),
      value.recordDigest,
    );
    return;
  }
  const result = database.prepare(`
    UPDATE personal_model_preferences SET
      model_source = ?, model_id = ?, configuration_revision = ?, preference_revision = ?,
      updated_at = ?, record_json = ?, record_digest = ?
    WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ? AND preference_revision = ?
  `).run(
    nullable(value.modelSource),
    nullable(value.modelId),
    nullable(value.configurationRevision),
    value.preferenceRevision,
    value.updatedAt,
    JSON.stringify(value),
    value.recordDigest,
    value.ownerScopeNamespaceRevision,
    value.ownerScopeDigest,
    expectedRevision,
  );
  if (Number(result.changes) !== 1) throw new Error("Personal Model preference compare-and-set failed");
}

function selectOperation(
  database: DatabaseSync,
  owner: PersonalModelOwnerIdentity,
  commandId: string,
): PersonalModelOperation | undefined {
  const row = database.prepare(`
    SELECT * FROM personal_model_operations
    WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ? AND command_id = ?
  `).get(owner.ownerScopeNamespaceRevision, owner.ownerScopeDigest, commandId) as
    Record<string, unknown> | undefined;
  return row === undefined ? undefined : parseOperation(row);
}

function parseOperation(row: Record<string, unknown>): PersonalModelOperation {
  const value = validatePersonalModelOperation(
    parseJsonObject(row.record_json, "record_json") as PersonalModelOperation,
  );
  assertIndexed(value, row, {
    ownerScopeNamespaceRevision: "owner_scope_namespace_revision",
    ownerScopeDigest: "owner_scope_digest",
    commandId: "command_id",
    operationType: "operation_type",
    requestDigest: "request_digest",
    targetModelId: "target_model_id",
    expectedConfigurationRevision: "expected_configuration_revision",
    expectedExecutionDefinitionDigest: "expected_execution_definition_digest",
    targetConfigurationRevision: "target_configuration_revision",
    targetExecutionDefinitionDigest: "target_execution_definition_digest",
    targetCredentialRef: "target_credential_ref",
    previousCredentialRef: "previous_credential_ref",
    operationPhase: "operation_phase",
    phaseRevision: "phase_revision",
    credentialObservationDigest: "credential_observation_digest",
    recoveryErrorCode: "recovery_error_code",
    recoveryErrorDigest: "recovery_error_digest",
    createdAt: "created_at",
    updatedAt: "updated_at",
    recordDigest: "record_digest",
  });
  assertJsonIndexed(
    value.credentialObservation,
    row.credential_observation_json,
    "credential_observation_json",
  );
  return value;
}

function insertOperation(database: DatabaseSync, value: PersonalModelOperation): void {
  database.prepare(`
    INSERT INTO personal_model_operations (
      owner_scope_namespace_revision, owner_scope_digest, command_id, operation_type,
      request_digest, target_model_id, expected_configuration_revision,
      expected_execution_definition_digest, target_configuration_revision,
      target_execution_definition_digest, target_credential_ref, previous_credential_ref,
      operation_phase, phase_revision, credential_observation_json,
      credential_observation_digest, recovery_error_code, recovery_error_digest,
      created_at, updated_at, record_json, record_digest
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...operationValues(value));
}

function updateOperation(
  database: DatabaseSync,
  value: PersonalModelOperation,
  expectedPhaseRevision: number,
): void {
  const result = database.prepare(`
    UPDATE personal_model_operations SET
      expected_configuration_revision = ?, expected_execution_definition_digest = ?,
      target_configuration_revision = ?, target_execution_definition_digest = ?,
      target_credential_ref = ?, previous_credential_ref = ?, operation_phase = ?,
      phase_revision = ?, credential_observation_json = ?, credential_observation_digest = ?,
      recovery_error_code = ?, recovery_error_digest = ?, updated_at = ?, record_json = ?, record_digest = ?
    WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ? AND command_id = ?
      AND phase_revision = ?
  `).run(
    nullable(value.expectedConfigurationRevision),
    nullable(value.expectedExecutionDefinitionDigest),
    nullable(value.targetConfigurationRevision),
    nullable(value.targetExecutionDefinitionDigest),
    nullable(value.targetCredentialRef),
    nullable(value.previousCredentialRef),
    value.operationPhase,
    value.phaseRevision,
    value.credentialObservation === undefined ? null : JSON.stringify(value.credentialObservation),
    nullable(value.credentialObservationDigest),
    nullable(value.recoveryErrorCode),
    nullable(value.recoveryErrorDigest),
    value.updatedAt,
    JSON.stringify(value),
    value.recordDigest,
    value.ownerScopeNamespaceRevision,
    value.ownerScopeDigest,
    value.commandId,
    expectedPhaseRevision,
  );
  if (Number(result.changes) !== 1) throw new Error("Personal Model operation compare-and-set failed");
}

function operationValues(value: PersonalModelOperation): SQLInputValue[] {
  return [
    value.ownerScopeNamespaceRevision,
    value.ownerScopeDigest,
    value.commandId,
    value.operationType,
    value.requestDigest,
    value.targetModelId,
    nullable(value.expectedConfigurationRevision),
    nullable(value.expectedExecutionDefinitionDigest),
    nullable(value.targetConfigurationRevision),
    nullable(value.targetExecutionDefinitionDigest),
    nullable(value.targetCredentialRef),
    nullable(value.previousCredentialRef),
    value.operationPhase,
    value.phaseRevision,
    value.credentialObservation === undefined ? null : JSON.stringify(value.credentialObservation),
    nullable(value.credentialObservationDigest),
    nullable(value.recoveryErrorCode),
    nullable(value.recoveryErrorDigest),
    value.createdAt,
    value.updatedAt,
    JSON.stringify(value),
    value.recordDigest,
  ];
}

function selectReceipt(
  database: DatabaseSync,
  owner: PersonalModelOwnerIdentity,
  commandId: string,
): PersonalModelCommandReceipt | undefined {
  const row = database.prepare(`
    SELECT * FROM personal_model_command_receipts
    WHERE owner_scope_namespace_revision = ? AND owner_scope_digest = ? AND command_id = ?
  `).get(owner.ownerScopeNamespaceRevision, owner.ownerScopeDigest, commandId) as
    Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const value = validatePersonalModelCommandReceipt(
    parseJsonObject(row.receipt_json, "receipt_json") as PersonalModelCommandReceipt,
  );
  assertIndexed(value, row, {
    ownerScopeNamespaceRevision: "owner_scope_namespace_revision",
    ownerScopeDigest: "owner_scope_digest",
    commandId: "command_id",
    commandType: "command_type",
    requestDigest: "request_digest",
    modelId: "model_id",
    committedConfigurationRevision: "committed_configuration_revision",
    outcome: "outcome",
    committedAt: "committed_at",
    receiptDigest: "receipt_digest",
  });
  return value;
}

function insertReceipt(database: DatabaseSync, value: PersonalModelCommandReceipt): void {
  database.prepare(`
    INSERT INTO personal_model_command_receipts (
      owner_scope_namespace_revision, owner_scope_digest, command_id, command_type,
      request_digest, model_id, committed_configuration_revision, outcome,
      committed_at, receipt_json, receipt_digest
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    value.ownerScopeNamespaceRevision,
    value.ownerScopeDigest,
    value.commandId,
    value.commandType,
    value.requestDigest,
    nullable(value.modelId),
    nullable(value.committedConfigurationRevision),
    value.outcome,
    value.committedAt,
    JSON.stringify(value),
    value.receiptDigest,
  );
}

function validateCarryForward(
  database: DatabaseSync,
  status: PersonalModelStatusFact,
): PersonalModelWriteResult<PersonalModelStatusFact> {
  if (status.statusOrigin !== "carry_forward") return success(status, false);
  const source = selectExactStatus(
    database,
    ownerOf(status),
    status.personalModelId,
    status.carriedFromConfigurationRevision!,
    status.carriedFromStatusRevision!,
  );
  if (source === undefined
    || source.recordDigest !== status.carriedFromStatusRecordDigest
    || source.executionDefinitionDigest !== status.executionDefinitionDigest
    || source.status !== status.status) {
    return failure(
      "personal_model.integrity_invalid",
      "Carry-forward status provenance is unavailable or incompatible",
    );
  }
  return success(status, false);
}

function replayReceipt(
  database: DatabaseSync,
  owner: PersonalModelOwnerIdentity,
  candidate: PersonalModelCommandReceipt,
): PersonalModelWriteResult<PersonalModelCommandReceipt> | undefined {
  const existing = selectReceipt(database, owner, candidate.commandId);
  if (existing === undefined) return undefined;
  return existing.requestDigest === candidate.requestDigest
    && existing.receiptDigest === candidate.receiptDigest
    ? success(existing, true)
    : failure("personal_model.conflict", "Personal Model command id already has another receipt");
}

function createHeadRevision(
  current: PersonalModelHead,
  selectionState: PersonalModelHead["selectionState"],
  updatedAt: string,
): PersonalModelHead {
  const { recordDigest: _recordDigest, ...material } = current;
  return createPersonalModelHead({
    ...material,
    selectionState,
    headRevision: current.headRevision + 1,
    updatedAt,
  });
}

function validTransition(from: PersonalModelOperationPhase, to: PersonalModelOperationPhase): boolean {
  return (from === "intent_committed" && ["credential_step_observed", "manual_attention"].includes(to))
    || (from === "credential_step_observed"
      && ["committed", "credential_cleanup_pending", "manual_attention"].includes(to))
    || (from === "credential_cleanup_pending" && ["committed", "manual_attention"].includes(to));
}

function sameOperation(
  existing: PersonalModelOperation,
  candidate: PersonalModelOperation,
): PersonalModelWriteResult<PersonalModelOperation> {
  return existing.requestDigest === candidate.requestDigest
    && existing.recordDigest === candidate.recordDigest
    ? success(existing, true)
    : failure("personal_model.conflict", "Personal Model command id already represents another operation");
}

function sameOutcomeIdentity(
  operation: PersonalModelOperation,
  receipt: PersonalModelCommandReceipt,
): boolean {
  return sameOwner(ownerOf(operation), ownerOf(receipt))
    && operation.commandId === receipt.commandId
    && operation.requestDigest === receipt.requestDigest
    && operation.operationType === receipt.commandType;
}

function calculateQueryRevision(
  owner: PersonalModelOwnerIdentity,
  heads: readonly PersonalModelHead[],
): string {
  return calculatePersonalModelAuxiliaryDigest("active-head-query", {
    ownerScopeNamespaceRevision: owner.ownerScopeNamespaceRevision,
    ownerScopeDigest: owner.ownerScopeDigest,
    heads: heads.map((head) => ({
      ownerScopeNamespaceRevision: head.ownerScopeNamespaceRevision,
      ownerScopeDigest: head.ownerScopeDigest,
      personalModelId: head.personalModelId,
      headRevision: head.headRevision,
      configurationRevision: head.currentConfigurationRevision,
      selectionState: head.selectionState,
    })),
  });
}

type CursorMaterial = Readonly<{
  ownerIdentity: PersonalModelOwnerIdentity;
  queryRevision: string;
  lastUpdatedAt: string;
  lastModelId: string;
}>;

function encodeCursor(namespace: PersonalModelOwnerNamespace, material: CursorMaterial): string {
  const payload = Buffer.from(canonicalJsonStringify(JsonValueSchema.parse(material)), "utf8")
    .toString("base64url");
  const signature = createHmac("sha256", namespace.namespaceKey)
    .update(`${CURSOR_DOMAIN}.${payload}`, "utf8")
    .digest("base64url");
  return `pmc1.${payload}.${signature}`;
}

function decodeCursor(
  namespace: PersonalModelOwnerNamespace,
  cursor: string,
): PersonalModelWriteResult<CursorMaterial> {
  const match = /^pmc1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u.exec(cursor);
  if (match === null) return failure("personal_model.stale_cursor", "Personal Model cursor is invalid");
  const payload = match[1]!;
  const actual = Buffer.from(match[2]!, "base64url");
  const expected = createHmac("sha256", namespace.namespaceKey)
    .update(`${CURSOR_DOMAIN}.${payload}`, "utf8")
    .digest();
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
    return failure("personal_model.stale_cursor", "Personal Model cursor signature is invalid");
  }
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CursorMaterial;
    if (typeof value.queryRevision !== "string"
      || typeof value.lastUpdatedAt !== "string"
      || typeof value.lastModelId !== "string"
      || typeof value.ownerIdentity?.ownerScopeNamespaceRevision !== "number"
      || typeof value.ownerIdentity.ownerScopeDigest !== "string") {
      return failure("personal_model.stale_cursor", "Personal Model cursor material is invalid");
    }
    return success(value, false);
  } catch {
    return failure("personal_model.stale_cursor", "Personal Model cursor payload is invalid");
  }
}

function ownerOf(value: {
  ownerScopeNamespaceRevision: number;
  ownerScopeDigest: string;
}): PersonalModelOwnerIdentity {
  return {
    ownerScopeNamespaceRevision: value.ownerScopeNamespaceRevision,
    ownerScopeDigest: value.ownerScopeDigest,
  };
}

function assertIndexed<T extends Record<string, unknown>>(
  value: T,
  row: Record<string, unknown>,
  fields: Readonly<Record<string, string>>,
): void {
  for (const [property, column] of Object.entries(fields)) {
    const expected = value[property];
    const actual = row[column] ?? undefined;
    if (expected !== actual) {
      throw new Error(`Personal Model indexed column ${column} does not match record material`);
    }
  }
}

function assertJsonIndexed(value: unknown, stored: unknown, column: string): void {
  const expected = value === undefined
    ? undefined
    : canonicalJsonStringify(JsonValueSchema.parse(value));
  const actual = stored === null || stored === undefined
    ? undefined
    : canonicalJsonStringify(
      JsonValueSchema.parse(JSON.parse(requireString(stored, column))),
    );
  if (expected !== actual) {
    throw new Error(`Personal Model indexed JSON column ${column} does not match record material`);
  }
}

function parseJsonObject(value: unknown, field: string): Record<string, unknown> {
  const text = requireString(value, field);
  const parsed = JSON.parse(text) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`SQLite Personal Model field ${field} must contain an object`);
  }
  return parsed as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`SQLite Personal Model field ${field} must be a string`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`SQLite Personal Model field ${field} must be an integer`);
  }
  return value;
}

function requireBytes(value: unknown, field: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new Error(`SQLite Personal Model field ${field} must be a BLOB`);
  }
  return Uint8Array.from(value);
}

function nullable(value: string | number | undefined): SQLInputValue {
  return value ?? null;
}

function success<T>(value: T, replayed: boolean): PersonalModelWriteResult<T> {
  return { ok: true, replayed, value };
}

function failure<T>(
  code: PersonalModelPersistenceErrorCode,
  message: string,
): PersonalModelWriteResult<T> {
  return { ok: false, error: { code, message } };
}

function withWriteResult<T>(
  database: DatabaseSync,
  operation: () => PersonalModelWriteResult<T>,
): PersonalModelWriteResult<T> {
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
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve the original failure.
    }
    throw error;
  }
}
