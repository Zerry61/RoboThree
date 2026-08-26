import {
  EntityIdSchema,
  NamespacedResourceIdSchema,
  Sha256DigestSchema,
  TimestampSchema,
} from "@robothree/contracts";
import { z } from "zod";

import {
  PersonalCredentialObservationSchema,
  PersonalModelDefinitionSchema,
  PersonalModelHeadSchema,
  PersonalModelOwnerIdentitySchema,
  PersonalModelPreferenceSchema,
  PersonalModelStatusFactSchema,
  calculateCredentialObservationDigest,
  calculatePersonalModelRecordDigest,
  type PersonalModelDefinition,
  type PersonalModelHead,
  type PersonalModelOwnerIdentity,
  type PersonalModelOwnerNamespace,
  type PersonalModelPreference,
  type PersonalModelStatusFact,
} from "../application/personal-model-domain.js";

export const PersonalModelOperationPhaseSchema = z.enum([
  "intent_committed",
  "credential_step_observed",
  "credential_cleanup_pending",
  "committed",
  "manual_attention",
]);

export const PersonalModelOperationSchema = z.object({
  ownerScopeNamespaceRevision: z.number().int().positive(),
  ownerScopeDigest: Sha256DigestSchema,
  commandId: EntityIdSchema,
  operationType: z.enum(["create", "update", "delete"]),
  requestDigest: Sha256DigestSchema,
  targetModelId: NamespacedResourceIdSchema,
  expectedConfigurationRevision: Sha256DigestSchema.optional(),
  expectedExecutionDefinitionDigest: Sha256DigestSchema.optional(),
  targetConfigurationRevision: Sha256DigestSchema.optional(),
  targetExecutionDefinitionDigest: Sha256DigestSchema.optional(),
  targetCredentialRef: z.string().min(32).max(160).optional(),
  previousCredentialRef: z.string().min(32).max(160).optional(),
  targetDefinition: PersonalModelDefinitionSchema.optional(),
  operationPhase: PersonalModelOperationPhaseSchema,
  phaseRevision: z.number().int().positive(),
  credentialObservation: PersonalCredentialObservationSchema.optional(),
  credentialObservationDigest: Sha256DigestSchema.optional(),
  recoveryErrorCode: z.string().min(3).max(120).optional(),
  recoveryErrorDigest: Sha256DigestSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  recordDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  const targetFields = [
    value.targetConfigurationRevision,
    value.targetExecutionDefinitionDigest,
    value.targetCredentialRef,
    value.targetDefinition,
  ];
  if (value.operationType === "delete") {
    if (value.expectedConfigurationRevision === undefined
      || value.expectedExecutionDefinitionDigest === undefined
      || value.previousCredentialRef === undefined
      || targetFields.some((field) => field !== undefined)) {
      context.addIssue({ code: "custom", message: "delete operation target identity is invalid" });
    }
  } else {
    if (targetFields.some((field) => field === undefined)) {
      context.addIssue({ code: "custom", message: "create/update operation requires exact target definition" });
    }
    if (value.operationType === "create"
      && (value.expectedConfigurationRevision !== undefined
        || value.expectedExecutionDefinitionDigest !== undefined
        || value.previousCredentialRef !== undefined)) {
      context.addIssue({ code: "custom", message: "create operation cannot carry previous revision identity" });
    }
    if (value.operationType === "update"
      && (value.expectedConfigurationRevision === undefined
        || value.expectedExecutionDefinitionDigest === undefined)) {
      context.addIssue({ code: "custom", message: "update operation requires exact previous revision identity" });
    }
  }

  if (value.targetDefinition !== undefined
    && (value.targetDefinition.configurationRevision !== value.targetConfigurationRevision
      || value.targetDefinition.executionDefinitionDigest !== value.targetExecutionDefinitionDigest
      || value.targetDefinition.credentialRef !== value.targetCredentialRef
      || value.targetDefinition.personalModelId !== value.targetModelId)) {
    context.addIssue({ code: "custom", message: "operation target definition identity does not match indexed fields" });
  }

  const hasObservation = value.credentialObservation !== undefined;
  if (hasObservation !== (value.credentialObservationDigest !== undefined)) {
    context.addIssue({ code: "custom", message: "credential observation and digest must be present together" });
  }
  if (value.operationPhase === "intent_committed" && hasObservation) {
    context.addIssue({ code: "custom", message: "intent cannot contain credential observation" });
  }
  if (["credential_step_observed", "credential_cleanup_pending", "committed"]
    .includes(value.operationPhase) && !hasObservation) {
    context.addIssue({ code: "custom", message: "operation phase requires credential observation" });
  }
});

export const PersonalModelCommandReceiptSchema = z.object({
  ownerScopeNamespaceRevision: z.number().int().positive(),
  ownerScopeDigest: Sha256DigestSchema,
  commandId: EntityIdSchema,
  commandType: z.enum(["create", "update", "delete", "status", "preference"]),
  requestDigest: Sha256DigestSchema,
  modelId: NamespacedResourceIdSchema.optional(),
  committedConfigurationRevision: Sha256DigestSchema.optional(),
  outcome: z.enum([
    "create_committed",
    "update_committed",
    "update_committed_cleanup_pending",
    "delete_committed",
    "status_committed",
    "preference_committed",
    "manual_attention",
  ]),
  committedAt: TimestampSchema,
  receiptDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  const expectedOutcomes: Readonly<Record<typeof value.commandType, readonly typeof value.outcome[]>> = {
    create: ["create_committed", "manual_attention"],
    update: ["update_committed", "update_committed_cleanup_pending", "manual_attention"],
    delete: ["delete_committed", "manual_attention"],
    status: ["status_committed"],
    preference: ["preference_committed"],
  };
  if (!expectedOutcomes[value.commandType].includes(value.outcome)) {
    context.addIssue({ code: "custom", path: ["outcome"], message: "receipt outcome does not match command type" });
  }
  const needsDefinition = [
    "create_committed",
    "update_committed",
    "update_committed_cleanup_pending",
    "status_committed",
  ].includes(value.outcome);
  if (needsDefinition
    ? value.modelId === undefined || value.committedConfigurationRevision === undefined
    : value.outcome === "preference_committed"
      && (value.modelId !== undefined || value.committedConfigurationRevision !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "receipt definition identity does not match outcome",
    });
  }
});

export type PersonalModelOperationPhase = z.infer<
  typeof PersonalModelOperationPhaseSchema
>;
export type PersonalModelOperation = z.infer<typeof PersonalModelOperationSchema>;
export type PersonalModelCommandReceipt = z.infer<
  typeof PersonalModelCommandReceiptSchema
>;

export type PersonalModelPersistenceErrorCode =
  | "personal_model.conflict"
  | "personal_model.not_found"
  | "personal_model.stale_cursor"
  | "personal_model.limit_exceeded"
  | "personal_model.integrity_invalid"
  | "personal_model.owner_namespace_unavailable"
  | "personal_model.credential_binding_conflict"
  | "personal_model.invalid_transition";

export type PersonalModelWriteResult<T> =
  | Readonly<{ ok: true; replayed: boolean; value: T }>
  | Readonly<{
    ok: false;
    error: Readonly<{ code: PersonalModelPersistenceErrorCode; message: string }>;
  }>;

export type PersonalModelListPage = Readonly<{
  heads: readonly PersonalModelHead[];
  queryRevision: string;
  nextCursor?: string;
}>;

export type CommitCreateOutcomeInput = Readonly<{
  operation: PersonalModelOperation;
  definition: PersonalModelDefinition;
  head: PersonalModelHead;
  status: PersonalModelStatusFact;
  receipt: PersonalModelCommandReceipt;
}>;

export type CommitUpdateOutcomeInput = CommitCreateOutcomeInput & Readonly<{
  expectedHeadRevision: number;
}>;

export type CommitDeleteOutcomeInput = Readonly<{
  operation: PersonalModelOperation;
  head: PersonalModelHead;
  expectedHeadRevision: number;
  receipt: PersonalModelCommandReceipt;
}>;

export type CommitStatusOutcomeInput = Readonly<{
  status: PersonalModelStatusFact;
  expectedStatusRevision: number;
  receipt: PersonalModelCommandReceipt;
}>;

export type CommitPreferenceOutcomeInput = Readonly<{
  preference: PersonalModelPreference;
  expectedPreferenceRevision: number;
  receipt: PersonalModelCommandReceipt;
}>;

export interface PersonalModelPersistence {
  start(): Promise<void>;
  stop(): Promise<void>;
  loadActiveOwnerNamespace(): Promise<PersonalModelOwnerNamespace | undefined>;
  initializeOwnerNamespace(
    namespace: PersonalModelOwnerNamespace,
  ): Promise<PersonalModelWriteResult<PersonalModelOwnerNamespace>>;
  loadDefinition(
    ownerIdentity: PersonalModelOwnerIdentity,
    modelId: string,
    configurationRevision: string,
  ): Promise<PersonalModelDefinition | undefined>;
  loadHead(
    ownerIdentity: PersonalModelOwnerIdentity,
    modelId: string,
  ): Promise<PersonalModelHead | undefined>;
  listActiveHeads(
    ownerIdentity: PersonalModelOwnerIdentity,
    cursor: string | undefined,
    limit: number,
  ): Promise<PersonalModelWriteResult<PersonalModelListPage>>;
  loadStatus(
    ownerIdentity: PersonalModelOwnerIdentity,
    modelId: string,
    configurationRevision: string,
  ): Promise<PersonalModelStatusFact | undefined>;
  loadPreference(
    ownerIdentity: PersonalModelOwnerIdentity,
  ): Promise<PersonalModelPreference | undefined>;
  loadByCommand(
    ownerIdentity: PersonalModelOwnerIdentity,
    commandId: string,
  ): Promise<PersonalModelOperation | undefined>;
  loadPending(
    ownerIdentity: PersonalModelOwnerIdentity,
    limit: number,
  ): Promise<readonly PersonalModelOperation[]>;
  loadReceipt(
    ownerIdentity: PersonalModelOwnerIdentity,
    commandId: string,
  ): Promise<PersonalModelCommandReceipt | undefined>;
  beginCredentialOperation(
    operation: PersonalModelOperation,
  ): Promise<PersonalModelWriteResult<PersonalModelOperation>>;
  advanceCredentialObservation(input: Readonly<{
    ownerIdentity: PersonalModelOwnerIdentity;
    commandId: string;
    expectedPhase: PersonalModelOperationPhase;
    operation: PersonalModelOperation;
  }>): Promise<PersonalModelWriteResult<PersonalModelOperation>>;
  commitCreateOutcome(
    input: CommitCreateOutcomeInput,
  ): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>>;
  commitUpdateOutcome(
    input: CommitUpdateOutcomeInput,
  ): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>>;
  commitDeleteOutcome(
    input: CommitDeleteOutcomeInput,
  ): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>>;
  commitStatusOutcome(
    input: CommitStatusOutcomeInput,
  ): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>>;
  commitPreferenceOutcome(
    input: CommitPreferenceOutcomeInput,
  ): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>>;
  markOperationManualAttention(input: Readonly<{
    operation: PersonalModelOperation;
    receipt: PersonalModelCommandReceipt;
  }>): Promise<PersonalModelWriteResult<PersonalModelCommandReceipt>>;
}

export function createPersonalModelOperation(
  input: Omit<PersonalModelOperation, "recordDigest" | "credentialObservationDigest">,
): PersonalModelOperation {
  const material = {
    ...input,
    ...(input.credentialObservation === undefined
      ? {}
      : {
        credentialObservationDigest:
          calculateCredentialObservationDigest(input.credentialObservation),
      }),
  };
  const withoutUndefined = compact(material);
  return validatePersonalModelOperation(PersonalModelOperationSchema.parse({
    ...withoutUndefined,
    recordDigest: calculatePersonalModelRecordDigest("operation", withoutUndefined),
  }));
}

export function validatePersonalModelOperation(
  value: PersonalModelOperation,
): PersonalModelOperation {
  const parsed = PersonalModelOperationSchema.parse(value);
  if (parsed.credentialObservation !== undefined
    && parsed.credentialObservationDigest
      !== calculateCredentialObservationDigest(parsed.credentialObservation)) {
    throw new Error("Personal Model credential observation digest is invalid");
  }
  const { recordDigest, ...material } = parsed;
  if (recordDigest !== calculatePersonalModelRecordDigest("operation", compact(material))) {
    throw new Error("Personal Model operation record digest is invalid");
  }
  return parsed;
}

export function createPersonalModelCommandReceipt(
  input: Omit<PersonalModelCommandReceipt, "receiptDigest">,
): PersonalModelCommandReceipt {
  const material = compact(input);
  return PersonalModelCommandReceiptSchema.parse({
    ...material,
    receiptDigest: calculatePersonalModelRecordDigest("receipt", material),
  });
}

export function validatePersonalModelCommandReceipt(
  value: PersonalModelCommandReceipt,
): PersonalModelCommandReceipt {
  const parsed = PersonalModelCommandReceiptSchema.parse(value);
  const { receiptDigest, ...material } = parsed;
  if (receiptDigest !== calculatePersonalModelRecordDigest("receipt", compact(material))) {
    throw new Error("Personal Model command receipt digest is invalid");
  }
  return parsed;
}

export function sameOwner(
  left: PersonalModelOwnerIdentity,
  right: PersonalModelOwnerIdentity,
): boolean {
  const a = PersonalModelOwnerIdentitySchema.parse(left);
  const b = PersonalModelOwnerIdentitySchema.parse(right);
  return a.ownerScopeNamespaceRevision === b.ownerScopeNamespaceRevision
    && a.ownerScopeDigest === b.ownerScopeDigest;
}

function compact<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => compact(item)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, compact(item)])) as T;
  }
  return value;
}

export const PersonalModelPersistenceSchemas = Object.freeze({
  ownerIdentity: PersonalModelOwnerIdentitySchema,
  definition: PersonalModelDefinitionSchema,
  head: PersonalModelHeadSchema,
  status: PersonalModelStatusFactSchema,
  preference: PersonalModelPreferenceSchema,
  operation: PersonalModelOperationSchema,
  receipt: PersonalModelCommandReceiptSchema,
});
