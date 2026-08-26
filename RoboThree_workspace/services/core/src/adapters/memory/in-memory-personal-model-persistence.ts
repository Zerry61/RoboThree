import { createHmac, timingSafeEqual } from "node:crypto";

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

const CURSOR_DOMAIN = "robothree.personal-model.active-head-cursor.v1";
const MAX_PAGE_BYTES = 256 * 1024;
const MAX_QUERY_HEADS = 10_000;

export class InMemoryPersonalModelPersistence implements PersonalModelPersistence {
  #namespace: PersonalModelOwnerNamespace | undefined;
  readonly #definitions = new Map<string, PersonalModelDefinition>();
  readonly #heads = new Map<string, PersonalModelHead>();
  readonly #statuses = new Map<string, PersonalModelStatusFact[]>();
  readonly #preferences = new Map<string, PersonalModelPreference>();
  readonly #operations = new Map<string, PersonalModelOperation>();
  readonly #receipts = new Map<string, PersonalModelCommandReceipt>();
  #started = false;

  public async start(): Promise<void> { this.#started = true; }
  public async stop(): Promise<void> { this.#started = false; }

  public async loadActiveOwnerNamespace(): Promise<PersonalModelOwnerNamespace | undefined> {
    this.#requireStarted();
    return this.#namespace === undefined ? undefined : cloneNamespace(validatePersonalModelOwnerNamespace(this.#namespace));
  }

  public async initializeOwnerNamespace(
    namespace: PersonalModelOwnerNamespace,
  ): Promise<PersonalModelWriteResult<PersonalModelOwnerNamespace>> {
    this.#requireStarted();
    const validated = validatePersonalModelOwnerNamespace(namespace);
    if (this.#namespace !== undefined) {
      return this.#namespace.recordDigest === validated.recordDigest
        ? success(cloneNamespace(this.#namespace), true)
        : failure("personal_model.owner_namespace_unavailable", "An active owner namespace already exists");
    }
    this.#namespace = cloneNamespace(validated);
    return success(cloneNamespace(validated), false);
  }

  public async loadDefinition(
    owner: PersonalModelOwnerIdentity,
    modelId: string,
    configurationRevision: string,
  ): Promise<PersonalModelDefinition | undefined> {
    this.#requireOwner(owner);
    return cloneDefinition(this.#definitions.get(definitionKey(owner, modelId, configurationRevision)));
  }

  public async loadHead(
    owner: PersonalModelOwnerIdentity,
    modelId: string,
  ): Promise<PersonalModelHead | undefined> {
    this.#requireOwner(owner);
    return cloneHead(this.#heads.get(modelKey(owner, modelId)));
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
    const active = [...this.#heads.values()]
      .filter((head) => sameOwner(ownerOf(head), owner) && head.selectionState === "active")
      .map(validatePersonalModelHead)
      .sort(compareHeads);
    if (active.length > MAX_QUERY_HEADS) {
      return failure("personal_model.limit_exceeded", "Personal Model active head set exceeds the bounded query limit");
    }
    const queryRevision = calculateQueryRevision(owner, active);
    let start = 0;
    if (cursor !== undefined) {
      const decoded = decodeCursor(namespace, cursor);
      if (!decoded.ok) return decoded;
      if (!sameOwner(decoded.value.ownerIdentity, owner)
        || decoded.value.queryRevision !== queryRevision) {
        return failure("personal_model.stale_cursor", "Personal Model cursor no longer matches the active set");
      }
      start = active.findIndex((head) =>
        head.updatedAt === decoded.value.lastUpdatedAt
        && head.personalModelId === decoded.value.lastModelId) + 1;
      if (start === 0) {
        return failure("personal_model.stale_cursor", "Personal Model cursor sort key is unavailable");
      }
    }
    const heads = active.slice(start, start + limit).map((head) => cloneHead(head)!);
    const last = heads.at(-1);
    const hasMore = start + heads.length < active.length;
    const nextCursor = hasMore && last !== undefined
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
    return cloneStatus((this.#statuses.get(statusKey(owner, modelId, configurationRevision)) ?? [])
      .toSorted((a, b) => b.statusRevision - a.statusRevision)[0]);
  }

  public async loadPreference(
    owner: PersonalModelOwnerIdentity,
  ): Promise<PersonalModelPreference | undefined> {
    this.#requireOwner(owner);
    return clonePreference(this.#preferences.get(ownerKey(owner)));
  }

  public async loadByCommand(
    owner: PersonalModelOwnerIdentity,
    commandId: string,
  ): Promise<PersonalModelOperation | undefined> {
    this.#requireOwner(owner);
    return cloneOperation(this.#operations.get(commandKey(owner, commandId)));
  }

  public async loadPending(
    owner: PersonalModelOwnerIdentity,
    limit: number,
  ): Promise<readonly PersonalModelOperation[]> {
    this.#requireOwner(owner);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Personal Model pending limit must be within 1..100");
    }
    return [...this.#operations.values()]
      .filter((operation) => sameOwner(ownerOf(operation), owner)
        && operation.operationPhase !== "committed"
        && operation.operationPhase !== "manual_attention")
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.commandId.localeCompare(b.commandId))
      .slice(0, limit)
      .map((operation) => cloneOperation(operation)!);
  }

  public async loadReceipt(
    owner: PersonalModelOwnerIdentity,
    commandId: string,
  ): Promise<PersonalModelCommandReceipt | undefined> {
    this.#requireOwner(owner);
    return cloneReceipt(this.#receipts.get(commandKey(owner, commandId)));
  }

  public async beginCredentialOperation(
    operation: PersonalModelOperation,
  ): Promise<PersonalModelWriteResult<PersonalModelOperation>> {
    const validated = validatePersonalModelOperation(operation);
    this.#requireOwner(ownerOf(validated));
    if (validated.operationPhase !== "intent_committed" || validated.phaseRevision !== 1) {
      return failure("personal_model.invalid_transition", "Credential operation must begin at intent revision 1");
    }
    const key = commandKey(ownerOf(validated), validated.commandId);
    const existing = this.#operations.get(key);
    if (existing !== undefined) return sameOperation(existing, validated);

    let deleteHead: PersonalModelHead | undefined;
    if (validated.operationType === "delete") {
      const current = this.#heads.get(modelKey(ownerOf(validated), validated.targetModelId));
      if (current === undefined
        || current.selectionState !== "active"
        || current.currentConfigurationRevision !== validated.expectedConfigurationRevision
        || current.currentExecutionDefinitionDigest !== validated.expectedExecutionDefinitionDigest) {
        return failure("personal_model.conflict", "Delete intent does not match the active Personal Model head");
      }
      deleteHead = createHeadRevision(current, "delete_pending", validated.updatedAt);
    }
    this.#operations.set(key, cloneOperation(validated)!);
    if (deleteHead !== undefined) {
      this.#heads.set(modelKey(ownerOf(deleteHead), deleteHead.personalModelId), deleteHead);
    }
    return success(cloneOperation(validated)!, false);
  }

  public async advanceCredentialObservation(input: Readonly<{
    ownerIdentity: PersonalModelOwnerIdentity;
    commandId: string;
    expectedPhase: PersonalModelOperationPhase;
    operation: PersonalModelOperation;
  }>): Promise<PersonalModelWriteResult<PersonalModelOperation>> {
    this.#requireOwner(input.ownerIdentity);
    const target = validatePersonalModelOperation(input.operation);
    if (!sameOwner(ownerOf(target), input.ownerIdentity) || target.commandId !== input.commandId) {
      return failure("personal_model.conflict", "Credential observation owner or command identity changed");
    }
    const key = commandKey(input.ownerIdentity, input.commandId);
    const current = this.#operations.get(key);
    if (current === undefined) return failure("personal_model.not_found", "Credential operation does not exist");
    if (current.recordDigest === target.recordDigest) return success(cloneOperation(current)!, true);
    if (current.operationPhase !== input.expectedPhase
      || target.phaseRevision !== current.phaseRevision + 1
      || !validTransition(current.operationPhase, target.operationPhase)
      || current.requestDigest !== target.requestDigest) {
      return failure("personal_model.invalid_transition", "Credential operation phase transition is stale or invalid");
    }
    this.#operations.set(key, cloneOperation(target)!);
    return success(cloneOperation(target)!, false);
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
    const replay = this.#replayReceipt(owner, receipt);
    if (replay !== undefined) return replay;
    const existingOperation = this.#operations.get(commandKey(owner, operation.commandId));
    const currentHead = this.#heads.get(modelKey(owner, operation.targetModelId));
    if (existingOperation === undefined
      || existingOperation.operationPhase !== "credential_step_observed"
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
    this.#operations.set(commandKey(owner, operation.commandId), cloneOperation(operation)!);
    this.#heads.set(modelKey(owner, head.personalModelId), cloneHead(head)!);
    this.#receipts.set(commandKey(owner, receipt.commandId), cloneReceipt(receipt)!);
    return success(cloneReceipt(receipt)!, false);
  }

  public async commitStatusOutcome(
    input: CommitStatusOutcomeInput,
  ): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>> {
    const status = validatePersonalModelStatusFact(input.status);
    const receipt = validatePersonalModelCommandReceipt(input.receipt);
    const owner = ownerOf(status);
    this.#requireOwner(owner);
    const replay = this.#replayReceipt(owner, receipt);
    if (replay !== undefined) return replay;
    const definition = this.#definitions.get(definitionKey(owner, status.personalModelId, status.configurationRevision));
    const current = await this.loadStatus(owner, status.personalModelId, status.configurationRevision);
    if (definition === undefined
      || definition.executionDefinitionDigest !== status.executionDefinitionDigest
      || (current?.statusRevision ?? 0) !== input.expectedStatusRevision
      || status.statusRevision !== input.expectedStatusRevision + 1
      || receipt.commandType !== "status"
      || receipt.modelId !== status.personalModelId
      || receipt.committedConfigurationRevision !== status.configurationRevision) {
      return failure("personal_model.conflict", "Status outcome does not match exact Personal Model revision");
    }
    const provenance = this.#validateCarryForward(status);
    if (!provenance.ok) return provenance;
    this.#appendStatus(status);
    this.#receipts.set(commandKey(owner, receipt.commandId), cloneReceipt(receipt)!);
    return success(cloneReceipt(receipt)!, false);
  }

  public async commitPreferenceOutcome(
    input: CommitPreferenceOutcomeInput,
  ): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>> {
    const preference = validatePersonalModelPreference(input.preference);
    const receipt = validatePersonalModelCommandReceipt(input.receipt);
    const owner = ownerOf(preference);
    this.#requireOwner(owner);
    const replay = this.#replayReceipt(owner, receipt);
    if (replay !== undefined) return replay;
    const current = this.#preferences.get(ownerKey(owner));
    if ((current?.preferenceRevision ?? 0) !== input.expectedPreferenceRevision
      || preference.preferenceRevision !== input.expectedPreferenceRevision + 1
      || receipt.commandType !== "preference"
      || !sameOwner(ownerOf(receipt), owner)) {
      return failure("personal_model.conflict", "Preference outcome revision is stale");
    }
    if (preference.modelSource === "personal") {
      const head = this.#heads.get(modelKey(owner, preference.modelId!));
      if (head === undefined
        || head.selectionState !== "active"
        || head.currentConfigurationRevision !== preference.configurationRevision) {
        return failure("personal_model.conflict", "Personal preference does not reference an active exact revision");
      }
    }
    this.#preferences.set(ownerKey(owner), clonePreference(preference)!);
    this.#receipts.set(commandKey(owner, receipt.commandId), cloneReceipt(receipt)!);
    return success(cloneReceipt(receipt)!, false);
  }

  public async markOperationManualAttention(input: Readonly<{
    operation: PersonalModelOperation;
    receipt: PersonalModelCommandReceipt;
  }>): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>> {
    const operation = validatePersonalModelOperation(input.operation);
    const receipt = validatePersonalModelCommandReceipt(input.receipt);
    const owner = ownerOf(operation);
    this.#requireOwner(owner);
    const replay = this.#replayReceipt(owner, receipt);
    if (replay !== undefined) return replay;
    const current = this.#operations.get(commandKey(owner, operation.commandId));
    if (current === undefined
      || !validTransition(current.operationPhase, "manual_attention")
      || operation.operationPhase !== "manual_attention"
      || operation.phaseRevision !== current.phaseRevision + 1
      || receipt.outcome !== "manual_attention"
      || !sameOutcomeIdentity(operation, receipt)) {
      return failure("personal_model.invalid_transition", "Manual attention outcome does not match operation");
    }
    this.#operations.set(commandKey(owner, operation.commandId), cloneOperation(operation)!);
    this.#receipts.set(commandKey(owner, receipt.commandId), cloneReceipt(receipt)!);
    return success(cloneReceipt(receipt)!, false);
  }

  async #commitDefinitionOutcome(
    input: CommitCreateOutcomeInput | CommitUpdateOutcomeInput,
    expectedHeadRevision: number | undefined,
  ): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>> {
    const operation = validatePersonalModelOperation(input.operation);
    const definition = validatePersonalModelDefinition(input.definition);
    const head = validatePersonalModelHead(input.head);
    const status = validatePersonalModelStatusFact(input.status);
    const receipt = validatePersonalModelCommandReceipt(input.receipt);
    const owner = ownerOf(operation);
    this.#requireOwner(owner);
    const replay = this.#replayReceipt(owner, receipt);
    if (replay !== undefined) return replay;
    const currentOperation = this.#operations.get(commandKey(owner, operation.commandId));
    const currentHead = this.#heads.get(modelKey(owner, operation.targetModelId));
    const observation = operation.credentialObservation;
    const commonValid = currentOperation !== undefined
      && currentOperation.operationPhase === "credential_step_observed"
      && ["committed", "credential_cleanup_pending"].includes(operation.operationPhase)
      && observation?.state === "present"
      && observation.credentialRef === definition.credentialRef
      && observation.credentialRevision === definition.credentialRevision
      && observation.credentialBindingDigest === definition.credentialBindingDigest
      && calculateCredentialBindingDigest(observation) === definition.credentialBindingDigest
      && (operation.operationType !== "create"
        || observation.createdByOperationId === operation.commandId)
      && sameOwner(ownerOf(definition), owner)
      && sameOwner(ownerOf(head), owner)
      && sameOwner(ownerOf(status), owner)
      && definition.personalModelId === operation.targetModelId
      && head.personalModelId === definition.personalModelId
      && head.currentConfigurationRevision === definition.configurationRevision
      && head.currentExecutionDefinitionDigest === definition.executionDefinitionDigest
      && status.configurationRevision === definition.configurationRevision
      && status.executionDefinitionDigest === definition.executionDefinitionDigest
      && status.statusRevision === 1
      && receipt.modelId === definition.personalModelId
      && receipt.committedConfigurationRevision === definition.configurationRevision
      && sameOutcomeIdentity(operation, receipt);
    if (!commonValid) {
      return failure("personal_model.credential_binding_conflict", "Definition outcome does not match Credential binding proof");
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
    const definitionKeyValue = definitionKey(owner, definition.personalModelId, definition.configurationRevision);
    const existingDefinition = this.#definitions.get(definitionKeyValue);
    if (existingDefinition !== undefined && existingDefinition.recordDigest !== definition.recordDigest) {
      return failure("personal_model.conflict", "Immutable Personal Model definition revision conflicts");
    }
    const provenance = this.#validateCarryForward(status);
    if (!provenance.ok) return provenance;
    this.#definitions.set(definitionKeyValue, cloneDefinition(definition)!);
    this.#heads.set(modelKey(owner, head.personalModelId), cloneHead(head)!);
    this.#appendStatus(status);
    this.#operations.set(commandKey(owner, operation.commandId), cloneOperation(operation)!);
    this.#receipts.set(commandKey(owner, receipt.commandId), cloneReceipt(receipt)!);
    return success(cloneReceipt(receipt)!, false);
  }

  #appendStatus(status: PersonalModelStatusFact): void {
    const key = statusKey(ownerOf(status), status.personalModelId, status.configurationRevision);
    this.#statuses.set(key, [...(this.#statuses.get(key) ?? []), cloneStatus(status)!]);
  }

  #validateCarryForward(
    status: PersonalModelStatusFact,
  ): PersonalModelWriteResult<PersonalModelStatusFact> {
    if (status.statusOrigin !== "carry_forward") return success(status, false);
    const owner = ownerOf(status);
    const source = (this.#statuses.get(statusKey(
      owner,
      status.personalModelId,
      status.carriedFromConfigurationRevision!,
    )) ?? []).find((candidate) =>
      candidate.statusRevision === status.carriedFromStatusRevision
      && candidate.recordDigest === status.carriedFromStatusRecordDigest);
    if (source === undefined
      || source.executionDefinitionDigest !== status.executionDefinitionDigest
      || source.status !== status.status) {
      return failure("personal_model.integrity_invalid", "Carry-forward status provenance is unavailable or incompatible");
    }
    return success(status, false);
  }

  #replayReceipt(
    owner: PersonalModelOwnerIdentity,
    candidate: PersonalModelCommandReceipt,
  ): PersonalModelWriteResult<PersonalModelCommandReceipt> | undefined {
    const existing = this.#receipts.get(commandKey(owner, candidate.commandId));
    if (existing === undefined) return undefined;
    return existing.requestDigest === candidate.requestDigest
      && existing.receiptDigest === candidate.receiptDigest
      ? success(cloneReceipt(existing)!, true)
      : failure("personal_model.conflict", "Personal Model command id already has another receipt");
  }

  #requireOwner(owner: PersonalModelOwnerIdentity): PersonalModelOwnerNamespace {
    this.#requireStarted();
    const namespace = this.#namespace;
    if (namespace === undefined
      || namespace.namespaceRevision !== owner.ownerScopeNamespaceRevision) {
      throw new Error("Personal Model owner namespace is unavailable");
    }
    return validatePersonalModelOwnerNamespace(namespace);
  }

  #requireStarted(): void {
    if (!this.#started) throw new Error("Personal Model persistence is not started");
  }
}

function createHeadRevision(
  current: PersonalModelHead,
  selectionState: PersonalModelHead["selectionState"],
  updatedAt: string,
): PersonalModelHead {
  const { recordDigest: _recordDigest, ...material } = current;
  const next = { ...material, selectionState, headRevision: current.headRevision + 1, updatedAt };
  return createPersonalModelHead(next);
}

function validTransition(from: PersonalModelOperationPhase, to: PersonalModelOperationPhase): boolean {
  return (from === "intent_committed" && ["credential_step_observed", "manual_attention"].includes(to))
    || (from === "credential_step_observed" && ["committed", "credential_cleanup_pending", "manual_attention"].includes(to))
    || (from === "credential_cleanup_pending" && ["committed", "manual_attention"].includes(to));
}

function sameOperation(
  existing: PersonalModelOperation,
  candidate: PersonalModelOperation,
): PersonalModelWriteResult<PersonalModelOperation> {
  return existing.requestDigest === candidate.requestDigest
    && existing.recordDigest === candidate.recordDigest
    ? success(cloneOperation(existing)!, true)
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
      || typeof value.lastModelId !== "string") {
      return failure("personal_model.stale_cursor", "Personal Model cursor material is invalid");
    }
    return success(value, false);
  } catch {
    return failure("personal_model.stale_cursor", "Personal Model cursor payload is invalid");
  }
}

function compareHeads(left: PersonalModelHead, right: PersonalModelHead): number {
  return left.updatedAt.localeCompare(right.updatedAt)
    || left.personalModelId.localeCompare(right.personalModelId);
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

function ownerKey(owner: PersonalModelOwnerIdentity): string {
  return `${owner.ownerScopeNamespaceRevision}:${owner.ownerScopeDigest}`;
}
function modelKey(owner: PersonalModelOwnerIdentity, modelId: string): string {
  return `${ownerKey(owner)}:${modelId}`;
}
function definitionKey(owner: PersonalModelOwnerIdentity, modelId: string, revision: string): string {
  return `${modelKey(owner, modelId)}:${revision}`;
}
function statusKey(owner: PersonalModelOwnerIdentity, modelId: string, revision: string): string {
  return `${definitionKey(owner, modelId, revision)}:status`;
}
function commandKey(owner: PersonalModelOwnerIdentity, commandId: string): string {
  return `${ownerKey(owner)}:${commandId}`;
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

function cloneNamespace(value: PersonalModelOwnerNamespace): PersonalModelOwnerNamespace {
  return { ...value, namespaceKey: Uint8Array.from(value.namespaceKey) };
}
function cloneDefinition(value: PersonalModelDefinition | undefined): PersonalModelDefinition | undefined {
  return value === undefined ? undefined : PersonalModelDefinitionSchema.parse(structuredClone(value));
}
function cloneHead(value: PersonalModelHead | undefined): PersonalModelHead | undefined {
  return value === undefined ? undefined : PersonalModelHeadSchema.parse(structuredClone(value));
}
function cloneStatus(value: PersonalModelStatusFact | undefined): PersonalModelStatusFact | undefined {
  return value === undefined ? undefined : PersonalModelStatusFactSchema.parse(structuredClone(value));
}
function clonePreference(value: PersonalModelPreference | undefined): PersonalModelPreference | undefined {
  return value === undefined ? undefined : PersonalModelPreferenceSchema.parse(structuredClone(value));
}
function cloneOperation(value: PersonalModelOperation | undefined): PersonalModelOperation | undefined {
  return value === undefined ? undefined : validatePersonalModelOperation(structuredClone(value));
}
function cloneReceipt(value: PersonalModelCommandReceipt | undefined): PersonalModelCommandReceipt | undefined {
  return value === undefined ? undefined : validatePersonalModelCommandReceipt(structuredClone(value));
}
