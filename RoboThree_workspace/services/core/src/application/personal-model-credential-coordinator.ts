import { createHash } from "node:crypto";

import {
  EntityIdSchema,
  JsonValueSchema,
  ModelCapabilitySchema,
  NamespacedResourceIdSchema,
  PersonalModelProtocolSchema,
  PersonalModelProviderSchema,
  Sha256DigestSchema,
  canonicalJsonStringify,
} from "@robothree/contracts";
import { z } from "zod";

import {
  allocatePersonalCredentialReference,
  calculateCredentialBindingDigest,
  canonicalizePersonalModelEndpoint,
  createPersonalModelDefinition,
  createPersonalModelHead,
  createPersonalModelOwnerNamespace,
  createPersonalModelStatusFact,
  validatePersonalModelOwnerNamespace,
  type PersonalCredentialObservation,
  type PersonalModelDefinition,
  type PersonalModelOwnerIdentity,
  type PersonalModelOwnerNamespace,
  type PersonalModelStatusFact,
} from "./personal-model-domain.js";
import {
  PersonalModelOwnerAuthorityError,
  StrictPersonalModelOwnerAuthorityResolver,
} from "./personal-model-owner-authority.js";
import {
  InMemoryPersonalModelOperationGate,
  type PersonalModelOperationGate,
} from "./personal-model-operation-gate.js";
import type { Clock } from "../ports/clock.js";
import type { PersonalCredentialStore } from "../ports/personal-credential-store.js";
import type {
  PersonalCredentialReferenceUsage,
  PersonalModelDeletionGuard,
  PersonalModelOwnerAuthorityContextProvider,
} from "../ports/personal-model-credential-coordination.js";
import {
  createPersonalModelCommandReceipt,
  createPersonalModelOperation,
  type PersonalModelCommandReceipt,
  type PersonalModelOperation,
  type PersonalModelPersistence,
} from "../ports/personal-model-persistence.js";

const VisibleTextSchema = z.string().min(1).max(160)
  .refine((value) => !containsControl(value));
const DeadlineSchema = z.string().datetime({ offset: true });

const CommonCommandSchema = z.object({
  commandId: EntityIdSchema,
  requestDigest: Sha256DigestSchema,
  personalModelId: NamespacedResourceIdSchema,
}).strict();

const CommonCommandMaterialSchema = CommonCommandSchema.omit({ requestDigest: true });

const TargetMaterialSchema = z.object({
  providerKind: PersonalModelProviderSchema,
  providerProfileRevision: Sha256DigestSchema,
  protocol: PersonalModelProtocolSchema,
  endpoint: z.string().min(8).max(2048),
  providerModelId: VisibleTextSchema,
  displayName: VisibleTextSchema,
  capabilities: z.array(ModelCapabilitySchema).max(16),
}).strict();

const CreateCommandMaterialSchema = CommonCommandMaterialSchema.extend({
  commandType: z.literal("create"),
  target: TargetMaterialSchema,
  credentialInputExpected: z.literal(true),
}).strict();

const UpdateCommandMaterialSchema = CommonCommandMaterialSchema.extend({
  commandType: z.literal("update"),
  expectedConfigurationRevision: Sha256DigestSchema,
  expectedExecutionDefinitionDigest: Sha256DigestSchema,
  target: TargetMaterialSchema,
  credentialMutation: z.enum(["reuse_existing", "replace_secret"]),
  credentialInputExpected: z.boolean(),
}).strict().superRefine((value, context) => {
  if ((value.credentialMutation === "replace_secret") !== value.credentialInputExpected) {
    context.addIssue({
      code: "custom",
      path: ["credentialInputExpected"],
      message: "Credential mutation mode and input expectation must agree",
    });
  }
});

const DeleteCommandMaterialSchema = CommonCommandMaterialSchema.extend({
  commandType: z.literal("delete"),
  expectedConfigurationRevision: Sha256DigestSchema,
  expectedExecutionDefinitionDigest: Sha256DigestSchema,
  credentialInputExpected: z.literal(false),
}).strict();

export const PreparePersonalModelCredentialMutationCommandSchema = z.discriminatedUnion(
  "commandType",
  [
    CommonCommandSchema.extend({
      commandType: z.literal("create"),
      target: TargetMaterialSchema,
      credentialInputExpected: z.literal(true),
    }).strict(),
    CommonCommandSchema.extend({
      commandType: z.literal("update"),
      expectedConfigurationRevision: Sha256DigestSchema,
      expectedExecutionDefinitionDigest: Sha256DigestSchema,
      target: TargetMaterialSchema,
      credentialMutation: z.enum(["reuse_existing", "replace_secret"]),
      credentialInputExpected: z.boolean(),
    }).strict().superRefine((value, context) => {
      if ((value.credentialMutation === "replace_secret") !== value.credentialInputExpected) {
        context.addIssue({
          code: "custom",
          path: ["credentialInputExpected"],
          message: "Credential mutation mode and input expectation must agree",
        });
      }
    }),
    CommonCommandSchema.extend({
      commandType: z.literal("delete"),
      expectedConfigurationRevision: Sha256DigestSchema,
      expectedExecutionDefinitionDigest: Sha256DigestSchema,
      credentialInputExpected: z.literal(false),
    }).strict(),
  ],
);

export type PreparePersonalModelCredentialMutationCommand = z.infer<
  typeof PreparePersonalModelCredentialMutationCommandSchema
>;

export type PersonalModelCredentialCommandMaterial =
  Omit<Extract<PreparePersonalModelCredentialMutationCommand, { commandType: "create" }>, "requestDigest">
  | Omit<Extract<PreparePersonalModelCredentialMutationCommand, { commandType: "update" }>, "requestDigest">
  | Omit<Extract<PreparePersonalModelCredentialMutationCommand, { commandType: "delete" }>, "requestDigest">;

export type PersonalModelCredentialCoordinatorErrorCode =
  | "personal_model.not_prepared"
  | "personal_model.permission_denied"
  | "personal_model.conflict"
  | "personal_model.not_found"
  | "personal_model.invalid_transition"
  | "personal_model.in_use_or_usage_unknown"
  | "personal_model.manual_attention_required"
  | "personal_model.credential_unavailable"
  | "personal_model.credential_operation_uncertain"
  | "personal_model.deadline_exceeded"
  | "personal_model.cancelled";

export type PersonalModelCredentialCoordinatorResult =
  | Readonly<{
    ok: true;
    status: "prepared" | "committed" | "cleanup_pending" | "manual_attention";
    replayed: boolean;
    commandId: string;
    commandType: "create" | "update" | "delete";
    personalModelId: string;
    committedConfigurationRevision?: string;
  }>
  | Readonly<{
    ok: false;
    error: Readonly<{
      code: PersonalModelCredentialCoordinatorErrorCode;
      message: string;
    }>;
  }>;

export type ExecutePreparedPersonalModelCredentialMutation = Readonly<{
  commandId: string;
  commandType: "create" | "update" | "delete";
  personalModelId: string;
  expectedConfigurationRevision?: string;
  requestDigest: string;
  deadlineAt: string;
  secret: Uint8Array;
}>;

export function createPersonalModelCredentialCommand(
  material: PersonalModelCredentialCommandMaterial,
): PreparePersonalModelCredentialMutationCommand {
  const compact = compactObject(material);
  return PreparePersonalModelCredentialMutationCommandSchema.parse({
    ...compact,
    requestDigest: calculatePersonalModelCredentialCommandDigest(compact),
  });
}

export function calculatePersonalModelCredentialCommandDigest(
  material: PersonalModelCredentialCommandMaterial,
): string {
  const parsed = commandMaterialSchema(material.commandType).parse(material);
  const canonical = canonicalJsonStringify(JsonValueSchema.parse({
    domain: "robothree.personal-model.credential-command.v1",
    schemaVersion: "v1alpha1",
    material: canonicalCommandMaterial(parsed),
  }));
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`,
  );
}

export class PersonalModelCredentialCoordinator {
  readonly #persistence: PersonalModelPersistence;
  readonly #credentials: PersonalCredentialStore;
  readonly #authorityContexts: PersonalModelOwnerAuthorityContextProvider;
  readonly #authority = new StrictPersonalModelOwnerAuthorityResolver();
  readonly #deletionGuard: PersonalModelDeletionGuard;
  readonly #usage: PersonalCredentialReferenceUsage;
  readonly #clock: Clock;
  readonly #operationGate: PersonalModelOperationGate;
  #recovering = false;

  public constructor(input: {
    persistence: PersonalModelPersistence;
    credentials: PersonalCredentialStore;
    authorityContexts: PersonalModelOwnerAuthorityContextProvider;
    deletionGuard: PersonalModelDeletionGuard;
    credentialUsage: PersonalCredentialReferenceUsage;
    clock: Clock;
    operationGate?: PersonalModelOperationGate;
  }) {
    this.#persistence = input.persistence;
    this.#credentials = input.credentials;
    this.#authorityContexts = input.authorityContexts;
    this.#deletionGuard = input.deletionGuard;
    this.#usage = input.credentialUsage;
    this.#clock = input.clock;
    this.#operationGate = input.operationGate ?? new InMemoryPersonalModelOperationGate();
  }

  public async ensureOwnerNamespace(): Promise<PersonalModelOwnerNamespace> {
    const existing = await this.#persistence.loadActiveOwnerNamespace();
    if (existing !== undefined) return validatePersonalModelOwnerNamespace(existing);
    const candidate = createPersonalModelOwnerNamespace({
      namespaceRevision: 1,
      createdAt: this.#clock.now(),
    });
    const initialized = await this.#persistence.initializeOwnerNamespace(candidate);
    candidate.namespaceKey.fill(0);
    if (initialized.ok) return validatePersonalModelOwnerNamespace(initialized.value);
    const winner = await this.#persistence.loadActiveOwnerNamespace();
    if (winner === undefined) throw new Error("Personal Model owner namespace initialization failed");
    return validatePersonalModelOwnerNamespace(winner);
  }

  public async prepare(
    input: PreparePersonalModelCredentialMutationCommand,
  ): Promise<PersonalModelCredentialCoordinatorResult> {
    let command: PreparePersonalModelCredentialMutationCommand;
    try {
      command = validateCommand(input);
    } catch {
      return failure("personal_model.conflict", "Personal Model command is invalid");
    }
    const action = command.commandType === "delete" ? "delete" : "configure";
    const owner = await this.#resolveOwner(action).catch(() => undefined);
    if (owner === undefined) return failure("personal_model.permission_denied", "Personal Model permission is unavailable");
    const receipt = await this.#persistence.loadReceipt(owner, command.commandId);
    if (receipt !== undefined) {
      if (receipt.requestDigest !== command.requestDigest) {
        return failure("personal_model.conflict", "Personal Model command identity conflicts");
      }
      const operation = receipt.outcome === "update_committed_cleanup_pending"
        ? await this.#persistence.loadByCommand(owner, command.commandId)
        : undefined;
      return operation === undefined
        ? resultFromReceipt(receipt, true)
        : resultFromOperation(operation, true);
    }
    const existing = await this.#persistence.loadByCommand(owner, command.commandId);
    if (existing !== undefined) return existing.requestDigest === command.requestDigest
      ? resultFromOperation(existing, true)
      : failure("personal_model.conflict", "Personal Model command identity conflicts");

    const lease = this.#operationGate.tryAcquire(owner, command.personalModelId, "mutation");
    if (lease === undefined) {
      return failure("personal_model.conflict", "Another Personal Model mutation is active");
    }
    try {
      const operation = await this.#buildIntent(owner, command);
      if (!operation.prepared) return operation.result;
      const persisted = await this.#persistence.beginCredentialOperation(operation.value);
      return persisted.ok
        ? resultFromOperation(persisted.value, persisted.replayed)
        : failure(mapPersistenceError(persisted.error.code), "Personal Model intent could not be committed");
    } finally {
      lease.release();
    }
  }

  public async executePrepared(
    input: ExecutePreparedPersonalModelCredentialMutation,
  ): Promise<PersonalModelCredentialCoordinatorResult> {
    const secret = Uint8Array.from(input.secret);
    try {
      EntityIdSchema.parse(input.commandId);
      NamespacedResourceIdSchema.parse(input.personalModelId);
      Sha256DigestSchema.parse(input.requestDigest);
      DeadlineSchema.parse(input.deadlineAt);
      const action = input.commandType === "delete" ? "delete" : "configure";
      const owner = await this.#resolveOwner(action).catch(() => undefined);
      if (owner === undefined) return failure("personal_model.permission_denied", "Personal Model permission is unavailable");
      const receipt = await this.#persistence.loadReceipt(owner, input.commandId);
      if (receipt !== undefined) {
        if (receipt.requestDigest !== input.requestDigest) {
          return failure("personal_model.conflict", "Personal Model command identity conflicts");
        }
        const operation = receipt.outcome === "update_committed_cleanup_pending"
          ? await this.#persistence.loadByCommand(owner, input.commandId)
          : undefined;
        return operation === undefined
          ? resultFromReceipt(receipt, true)
          : resultFromOperation(operation, true);
      }
      if (Date.parse(input.deadlineAt) <= Date.parse(this.#clock.now())) {
        return failure("personal_model.deadline_exceeded", "Personal Model command deadline elapsed");
      }
      const operation = await this.#persistence.loadByCommand(owner, input.commandId);
      if (operation === undefined) return failure("personal_model.not_prepared", "Personal Model command is not prepared");
      if (operation.operationType !== input.commandType
        || operation.targetModelId !== input.personalModelId
        || operation.requestDigest !== input.requestDigest
        || operation.expectedConfigurationRevision !== input.expectedConfigurationRevision) {
        return failure("personal_model.conflict", "Prepared Personal Model identity does not match transport command");
      }
      const needsSecret = operation.operationType === "create"
        || (operation.operationType === "update"
          && operation.targetCredentialRef !== operation.previousCredentialRef);
      if (needsSecret ? secret.byteLength === 0 : secret.byteLength !== 0) {
        return failure("personal_model.conflict", "Personal Model Secret presence does not match prepared intent");
      }
      return await this.#converge(owner, operation, secret, false);
    } catch {
      return failure("personal_model.conflict", "Personal Model command is invalid");
    } finally {
      secret.fill(0);
      input.secret.fill(0);
    }
  }

  public async recoverOnce(limit = 100): Promise<readonly PersonalModelCredentialCoordinatorResult[]> {
    if (this.#recovering) {
      return [failure("personal_model.conflict", "Personal Model recovery is already active")];
    }
    this.#recovering = true;
    try {
      const owner = await this.#resolveOwner("delete").catch(() => undefined);
      if (owner === undefined) return [failure(
        "personal_model.permission_denied",
        "Personal Model recovery authority is unavailable",
      )];
      const pending = await this.#persistence.loadPending(owner, limit);
      const outcomes: PersonalModelCredentialCoordinatorResult[] = [];
      for (const operation of pending) {
        const action = operation.operationType === "delete" ? "delete" : "configure";
        const operationOwner = await this.#resolveOwner(action).catch(() => undefined);
        if (operationOwner === undefined
          || operationOwner.ownerScopeNamespaceRevision !== owner.ownerScopeNamespaceRevision
          || operationOwner.ownerScopeDigest !== owner.ownerScopeDigest) {
          outcomes.push(failure(
            "personal_model.permission_denied",
            "Personal Model recovery authority is unavailable",
          ));
          continue;
        }
        outcomes.push(await this.#recoverOperation(operationOwner, operation));
      }
      return outcomes;
    } finally {
      this.#recovering = false;
    }
  }

  async #resolveOwner(action: "configure" | "delete"): Promise<PersonalModelOwnerIdentity> {
    const namespace = await this.ensureOwnerNamespace();
    const context = await this.#authorityContexts.load(action);
    try {
      return this.#authority.resolve({ ...context, namespace, action }).ownerIdentity;
    } catch (error) {
      if (error instanceof PersonalModelOwnerAuthorityError) throw error;
      throw new PersonalModelOwnerAuthorityError("personal_model.permission_denied");
    } finally {
      namespace.namespaceKey.fill(0);
    }
  }

  async #buildIntent(
    owner: PersonalModelOwnerIdentity,
    command: PreparePersonalModelCredentialMutationCommand,
  ): Promise<
    | Readonly<{ prepared: true; value: PersonalModelOperation }>
    | Readonly<{ prepared: false; result: PersonalModelCredentialCoordinatorResult }>
  > {
    const now = this.#clock.now();
    const head = await this.#persistence.loadHead(owner, command.personalModelId);
    if (command.commandType === "create") {
      if (head !== undefined) {
        return { prepared: false, result: failure("personal_model.conflict", "Personal Model already exists") };
      }
      const credentialRef = allocatePersonalCredentialReference();
      const binding = calculateCredentialBindingDigest({
        credentialRef,
        createdByOperationId: command.commandId,
        credentialRevision: 1,
      });
      const definition = createDefinition(owner, command, credentialRef, 1, binding, now);
      return { prepared: true, value: createPersonalModelOperation({
        ...owner,
        commandId: command.commandId,
        operationType: "create",
        requestDigest: command.requestDigest,
        targetModelId: command.personalModelId,
        targetConfigurationRevision: definition.configurationRevision,
        targetExecutionDefinitionDigest: definition.executionDefinitionDigest,
        targetCredentialRef: credentialRef,
        targetDefinition: definition,
        operationPhase: "intent_committed",
        phaseRevision: 1,
        createdAt: now,
        updatedAt: now,
      }) };
    }
    if (head === undefined || head.selectionState !== "active"
      || head.currentConfigurationRevision !== command.expectedConfigurationRevision
      || head.currentExecutionDefinitionDigest !== command.expectedExecutionDefinitionDigest) {
      return { prepared: false, result: failure("personal_model.conflict", "Personal Model head is stale or unavailable") };
    }
    const current = await this.#persistence.loadDefinition(
      owner,
      command.personalModelId,
      command.expectedConfigurationRevision,
    );
    if (current === undefined) {
      return { prepared: false, result: failure("personal_model.not_found", "Personal Model definition is unavailable") };
    }
    if (command.commandType === "delete") {
      return { prepared: true, value: createPersonalModelOperation({
        ...owner,
        commandId: command.commandId,
        operationType: "delete",
        requestDigest: command.requestDigest,
        targetModelId: command.personalModelId,
        expectedConfigurationRevision: current.configurationRevision,
        expectedExecutionDefinitionDigest: current.executionDefinitionDigest,
        previousCredentialRef: current.credentialRef,
        operationPhase: "intent_committed",
        phaseRevision: 1,
        createdAt: now,
        updatedAt: now,
      }) };
    }
    if (command.credentialMutation === "reuse_existing"
      && (command.target.providerKind !== current.providerKind
        || command.target.providerProfileRevision !== current.providerProfileRevision
        || command.target.protocol !== current.protocol
        || canonicalEndpoint(command.target.endpoint) !== current.canonicalEndpoint)) {
      return {
        prepared: false,
        result: failure(
          "personal_model.conflict",
          "Upstream boundary changes require replacement Credential input",
        ),
      };
    }
    const replace = command.credentialMutation === "replace_secret";
    const targetRef = replace ? allocatePersonalCredentialReference() : current.credentialRef;
    const targetRevision = replace ? current.credentialRevision + 1 : current.credentialRevision;
    const binding = replace
      ? calculateCredentialBindingDigest({
        credentialRef: targetRef,
        createdByOperationId: command.commandId,
        credentialRevision: targetRevision,
      })
      : current.credentialBindingDigest;
    const definition = createDefinition(owner, command, targetRef, targetRevision, binding, now);
    return { prepared: true, value: createPersonalModelOperation({
      ...owner,
      commandId: command.commandId,
      operationType: "update",
      requestDigest: command.requestDigest,
      targetModelId: command.personalModelId,
      expectedConfigurationRevision: current.configurationRevision,
      expectedExecutionDefinitionDigest: current.executionDefinitionDigest,
      targetConfigurationRevision: definition.configurationRevision,
      targetExecutionDefinitionDigest: definition.executionDefinitionDigest,
      targetCredentialRef: targetRef,
      previousCredentialRef: current.credentialRef,
      targetDefinition: definition,
      operationPhase: "intent_committed",
      phaseRevision: 1,
      createdAt: now,
      updatedAt: now,
    }) };
  }

  async #recoverOperation(
    owner: PersonalModelOwnerIdentity,
    operation: PersonalModelOperation,
  ): Promise<PersonalModelCredentialCoordinatorResult> {
    if (operation.operationPhase === "credential_step_observed") {
      return this.#commitObserved(owner, operation);
    }
    if (operation.operationPhase === "credential_cleanup_pending") {
      return this.#cleanupOldCredential(owner, operation);
    }
    if (operation.operationPhase !== "intent_committed") return resultFromOperation(operation, true);
    const ref = operation.operationType === "delete"
      ? operation.previousCredentialRef!
      : operation.targetCredentialRef!;
    const observation = await this.#inspect(ref);
    if (observation.state === "unavailable") {
      return this.#manualAttention(operation, observation.errorCode);
    }
    if (operation.operationType === "delete") {
      if (observation.state === "absent") return this.#observeAndCommit(owner, operation, observation);
      return this.#converge(owner, operation, new Uint8Array(0), true);
    }
    if (observation.state === "absent") {
      return this.#manualAttention(operation, "personal_model.credential_input_unrecoverable");
    }
    return observationMatches(operation, observation)
      ? this.#observeAndCommit(owner, operation, observation)
      : this.#manualAttention(operation, "personal_model.credential_binding_conflict");
  }

  async #converge(
    owner: PersonalModelOwnerIdentity,
    operation: PersonalModelOperation,
    secret: Uint8Array,
    recovery: boolean,
  ): Promise<PersonalModelCredentialCoordinatorResult> {
    const lease = this.#operationGate.tryAcquire(owner, operation.targetModelId, "mutation");
    if (lease === undefined) return failure("personal_model.conflict", "Another Personal Model mutation is active");
    try {
      if (operation.operationType === "delete") {
        const guard = await this.#deletionGuard.evaluate({
          ...owner,
          personalModelId: operation.targetModelId,
          configurationRevision: operation.expectedConfigurationRevision!,
          executionDefinitionDigest: operation.expectedExecutionDefinitionDigest!,
        });
        if (guard.status !== "clear") {
          return failure("personal_model.in_use_or_usage_unknown", "Personal Model usage does not permit deletion");
        }
        const result = await this.#credentials.delete(
          operation.commandId,
          operation.previousCredentialRef!,
        ).catch(() => undefined);
        if (result === undefined) {
          const observed = await this.#inspect(operation.previousCredentialRef!);
          return observed.state === "absent"
            ? this.#observeAndCommit(owner, operation, observed)
            : failure(
              "personal_model.credential_operation_uncertain",
              "Personal Model Credential delete outcome is uncertain",
            );
        }
        if (!result.ok) {
          const observed = await this.#inspect(operation.previousCredentialRef!);
          return observed.state === "absent"
            ? this.#observeAndCommit(owner, operation, observed)
            : recovery
              ? this.#manualAttention(operation, result.error.code)
              : failure(mapCredentialError(result.error.code), "Personal Model Credential delete did not settle");
        }
        return this.#observeAndCommit(owner, operation, result.value);
      }
      const reuse = operation.operationType === "update"
        && operation.targetCredentialRef === operation.previousCredentialRef;
      if (reuse) {
        const observation = await this.#inspect(operation.targetCredentialRef!);
        if (observation.state !== "present" || !observationMatches(operation, observation)) {
          return observation.state === "unavailable"
            ? failure("personal_model.credential_unavailable", "Personal Model Credential is unavailable")
            : failure("personal_model.conflict", "Personal Model Credential binding does not match");
        }
        return this.#observeAndCommit(owner, operation, observation);
      }
      const stored = await (operation.operationType === "create"
        ? this.#credentials.store(operation.commandId, operation.targetCredentialRef!, secret)
        : this.#credentials.replace(
          operation.commandId,
          operation.previousCredentialRef!,
          operation.targetCredentialRef!,
          secret,
        )).catch(() => undefined);
      if (stored === undefined) {
        const observed = await this.#inspect(operation.targetCredentialRef!);
        if (observed.state === "present" && observationMatches(operation, observed)) {
          return this.#observeAndCommit(owner, operation, observed);
        }
        return failure(
          "personal_model.credential_operation_uncertain",
          "Personal Model Credential mutation outcome is uncertain",
        );
      }
      if (!stored.ok) {
        const observed = await this.#inspect(operation.targetCredentialRef!);
        if (observed.state === "present" && observationMatches(operation, observed)) {
          return this.#observeAndCommit(owner, operation, observed);
        }
        return failure(mapCredentialError(stored.error.code), "Personal Model Credential mutation did not settle");
      }
      if (!observationMatches(operation, stored.value)) {
        return this.#manualAttention(operation, "personal_model.credential_binding_conflict");
      }
      return this.#observeAndCommit(owner, operation, stored.value);
    } finally {
      lease.release();
    }
  }

  async #observeAndCommit(
    owner: PersonalModelOwnerIdentity,
    operation: PersonalModelOperation,
    observation: PersonalCredentialObservation,
  ): Promise<PersonalModelCredentialCoordinatorResult> {
    const observed = createPersonalModelOperation({
      ...withoutOperationDigests(operation),
      operationPhase: "credential_step_observed",
      phaseRevision: operation.phaseRevision + 1,
      credentialObservation: observation,
      updatedAt: this.#clock.now(),
    });
    const advanced = await this.#persistence.advanceCredentialObservation({
      ownerIdentity: owner,
      commandId: operation.commandId,
      expectedPhase: operation.operationPhase,
      operation: observed,
    });
    if (!advanced.ok) return failure(mapPersistenceError(advanced.error.code), "Credential observation could not be committed");
    return this.#commitObserved(owner, advanced.value);
  }

  async #commitObserved(
    owner: PersonalModelOwnerIdentity,
    operation: PersonalModelOperation,
  ): Promise<PersonalModelCredentialCoordinatorResult> {
    if (operation.operationType === "delete") {
      if (operation.credentialObservation?.state !== "absent") {
        return this.#manualAttention(operation, "personal_model.credential_delete_unproven");
      }
      const currentHead = await this.#persistence.loadHead(owner, operation.targetModelId);
      if (currentHead === undefined || currentHead.selectionState !== "delete_pending") {
        return failure("personal_model.conflict", "Delete head is unavailable");
      }
      const committed = createPersonalModelOperation({
        ...withoutOperationDigests(operation),
        operationPhase: "committed",
        phaseRevision: operation.phaseRevision + 1,
        updatedAt: this.#clock.now(),
      });
      const head = createPersonalModelHead({
        ...withoutRecordDigest(currentHead),
        selectionState: "tombstoned",
        headRevision: currentHead.headRevision + 1,
        updatedAt: this.#clock.now(),
      });
      const receipt = receiptFor(committed, "delete_committed", this.#clock.now());
      const result = await this.#persistence.commitDeleteOutcome({
        operation: committed,
        head,
        expectedHeadRevision: currentHead.headRevision,
        receipt,
      });
      return result.ok
        ? resultFromReceipt(result.value, result.replayed)
        : failure(mapPersistenceError(result.error.code), "Delete outcome could not be committed");
    }
    const definition = operation.targetDefinition!;
    const currentHead = await this.#persistence.loadHead(owner, operation.targetModelId);
    const cleanup = operation.operationType === "update"
      && operation.previousCredentialRef !== operation.targetCredentialRef;
    let cleanupPermitted = false;
    if (cleanup) {
      const usage = await this.#usage.evaluate({
        ...owner,
        personalModelId: operation.targetModelId,
        configurationRevision: operation.expectedConfigurationRevision!,
        executionDefinitionDigest: operation.expectedExecutionDefinitionDigest!,
        credentialRef: operation.previousCredentialRef!,
      });
      cleanupPermitted = usage.status === "unused";
    }
    const terminalPhase = cleanup ? "credential_cleanup_pending" : "committed";
    const committed = createPersonalModelOperation({
      ...withoutOperationDigests(operation),
      operationPhase: terminalPhase,
      phaseRevision: operation.phaseRevision + 1,
      updatedAt: this.#clock.now(),
    });
    const head = createPersonalModelHead({
      ...owner,
      personalModelId: definition.personalModelId,
      currentConfigurationRevision: definition.configurationRevision,
      currentExecutionDefinitionDigest: definition.executionDefinitionDigest,
      headRevision: operation.operationType === "create" ? 1 : currentHead!.headRevision + 1,
      selectionState: "active",
      updatedAt: this.#clock.now(),
    });
    const status = await this.#statusFor(owner, operation, definition);
    const receiptOutcome = operation.operationType === "create"
      ? "create_committed"
      : cleanup && !cleanupPermitted
        ? "update_committed_cleanup_pending"
        : "update_committed";
    const receipt = receiptFor(committed, receiptOutcome, this.#clock.now(), definition.configurationRevision);
    const result = operation.operationType === "create"
      ? await this.#persistence.commitCreateOutcome({ operation: committed, definition, head, status, receipt })
      : await this.#persistence.commitUpdateOutcome({
        operation: committed,
        definition,
        head,
        status,
        receipt,
        expectedHeadRevision: currentHead!.headRevision,
      });
    if (!result.ok) return failure(mapPersistenceError(result.error.code), "Personal Model outcome could not be committed");
    if (cleanup && cleanupPermitted) return this.#cleanupOldCredential(owner, committed);
    return resultFromReceipt(result.value, result.replayed);
  }

  async #statusFor(
    owner: PersonalModelOwnerIdentity,
    operation: PersonalModelOperation,
    definition: PersonalModelDefinition,
  ): Promise<PersonalModelStatusFact> {
    if (operation.operationType === "update") {
      const previous = await this.#persistence.loadStatus(
        owner,
        operation.targetModelId,
        operation.expectedConfigurationRevision!,
      );
      if (previous !== undefined
        && previous.executionDefinitionDigest === definition.executionDefinitionDigest) {
        return createPersonalModelStatusFact({
          ...owner,
          personalModelId: definition.personalModelId,
          configurationRevision: definition.configurationRevision,
          executionDefinitionDigest: definition.executionDefinitionDigest,
          statusRevision: 1,
          status: previous.status,
          ...(previous.detailCode === undefined ? {} : { detailCode: previous.detailCode }),
          ...(previous.detailDigest === undefined ? {} : { detailDigest: previous.detailDigest }),
          statusOrigin: "carry_forward",
          carriedFromConfigurationRevision: previous.configurationRevision,
          carriedFromStatusRevision: previous.statusRevision,
          carriedFromStatusRecordDigest: previous.recordDigest,
          updatedAt: this.#clock.now(),
        });
      }
    }
    return createPersonalModelStatusFact({
      ...owner,
      personalModelId: definition.personalModelId,
      configurationRevision: definition.configurationRevision,
      executionDefinitionDigest: definition.executionDefinitionDigest,
      statusRevision: 1,
      status: "unverified",
      statusOrigin: "initialized",
      updatedAt: this.#clock.now(),
    });
  }

  async #cleanupOldCredential(
    owner: PersonalModelOwnerIdentity,
    operation: PersonalModelOperation,
  ): Promise<PersonalModelCredentialCoordinatorResult> {
    if (operation.previousCredentialRef === undefined
      || operation.previousCredentialRef === operation.targetCredentialRef) {
      return resultFromOperation(operation, true);
    }
    const usage = await this.#usage.evaluate({
      ...owner,
      personalModelId: operation.targetModelId,
      configurationRevision: operation.expectedConfigurationRevision!,
      executionDefinitionDigest: operation.expectedExecutionDefinitionDigest!,
      credentialRef: operation.previousCredentialRef,
    });
    if (usage.status !== "unused") return resultFromOperation(operation, true);
    const deleted = await this.#credentials.delete(
      deriveCleanupOperationId(operation.commandId),
      operation.previousCredentialRef,
    ).catch(() => undefined);
    if (deleted === undefined || !deleted.ok) return resultFromOperation(operation, true);
    const committed = createPersonalModelOperation({
      ...withoutOperationDigests(operation),
      operationPhase: "committed",
      phaseRevision: operation.phaseRevision + 1,
      updatedAt: this.#clock.now(),
    });
    const advanced = await this.#persistence.advanceCredentialObservation({
      ownerIdentity: owner,
      commandId: operation.commandId,
      expectedPhase: "credential_cleanup_pending",
      operation: committed,
    });
    return advanced.ok
      ? resultFromOperation(advanced.value, advanced.replayed)
      : failure(mapPersistenceError(advanced.error.code), "Credential cleanup state could not be committed");
  }

  async #inspect(credentialRef: string): Promise<PersonalCredentialObservation> {
    return this.#credentials.inspect(credentialRef).catch(() => ({
      state: "unavailable",
      credentialRef,
      errorCode: "credential_store_internal",
    }));
  }

  async #manualAttention(
    operation: PersonalModelOperation,
    errorCode: string,
  ): Promise<PersonalModelCredentialCoordinatorResult> {
    const manual = createPersonalModelOperation({
      ...withoutOperationDigests(operation),
      operationPhase: "manual_attention",
      phaseRevision: operation.phaseRevision + 1,
      recoveryErrorCode: safeErrorCode(errorCode),
      recoveryErrorDigest: digestError(errorCode),
      updatedAt: this.#clock.now(),
    });
    const receipt = receiptFor(manual, "manual_attention", this.#clock.now());
    const result = await this.#persistence.markOperationManualAttention({ operation: manual, receipt });
    return result.ok
      ? resultFromReceipt(result.value, result.replayed)
      : failure(mapPersistenceError(result.error.code), "Manual attention state could not be committed");
  }
}

export class PersonalModelCredentialRecoveryCoordinator {
  public constructor(private readonly coordinator: PersonalModelCredentialCoordinator) {}

  public recoverOnce(limit = 100): Promise<readonly PersonalModelCredentialCoordinatorResult[]> {
    return this.coordinator.recoverOnce(limit);
  }
}

function createDefinition(
  owner: PersonalModelOwnerIdentity,
  command: Extract<PreparePersonalModelCredentialMutationCommand, { commandType: "create" | "update" }>,
  credentialRef: string,
  credentialRevision: number,
  credentialBindingDigest: string,
  createdAt: string,
): PersonalModelDefinition {
  return createPersonalModelDefinition({
    ownerIdentity: owner,
    personalModelId: command.personalModelId,
    providerKind: command.target.providerKind,
    providerProfileRevision: Sha256DigestSchema.parse(command.target.providerProfileRevision),
    protocol: command.target.protocol,
    endpoint: command.target.endpoint,
    providerModelId: command.target.providerModelId,
    displayName: command.target.displayName,
    capabilities: command.target.capabilities,
    credentialRef,
    credentialRevision,
    credentialBindingDigest: Sha256DigestSchema.parse(credentialBindingDigest),
    createdAt,
  });
}

function validateCommand(
  input: PreparePersonalModelCredentialMutationCommand,
): PreparePersonalModelCredentialMutationCommand {
  const parsed = PreparePersonalModelCredentialMutationCommandSchema.parse(input);
  const { requestDigest, ...material } = parsed;
  if (requestDigest !== calculatePersonalModelCredentialCommandDigest(material as PersonalModelCredentialCommandMaterial)) {
    throw new Error("Personal Model request digest is invalid");
  }
  return parsed;
}

function commandMaterialSchema(commandType: "create" | "update" | "delete"): z.ZodTypeAny {
  switch (commandType) {
    case "create": return CreateCommandMaterialSchema;
    case "update": return UpdateCommandMaterialSchema;
    case "delete": return DeleteCommandMaterialSchema;
  }
}

function receiptFor(
  operation: PersonalModelOperation,
  outcome: PersonalModelCommandReceipt["outcome"],
  committedAt: string,
  committedConfigurationRevision?: string,
): PersonalModelCommandReceipt {
  return createPersonalModelCommandReceipt({
    ownerScopeNamespaceRevision: operation.ownerScopeNamespaceRevision,
    ownerScopeDigest: operation.ownerScopeDigest,
    commandId: operation.commandId,
    commandType: operation.operationType,
    requestDigest: operation.requestDigest,
    modelId: operation.targetModelId,
    ...(committedConfigurationRevision === undefined ? {} : { committedConfigurationRevision }),
    outcome,
    committedAt,
  });
}

function observationMatches(
  operation: PersonalModelOperation,
  observation: PersonalCredentialObservation,
): observation is Extract<PersonalCredentialObservation, { state: "present" }> {
  const definition = operation.targetDefinition;
  return observation.state === "present"
    && definition !== undefined
    && observation.credentialRef === definition.credentialRef
    && observation.credentialRevision === definition.credentialRevision
    && observation.credentialBindingDigest === definition.credentialBindingDigest
    && (operation.operationType === "update"
      && operation.targetCredentialRef === operation.previousCredentialRef
      || observation.createdByOperationId === operation.commandId);
}

function resultFromOperation(
  operation: PersonalModelOperation,
  replayed: boolean,
): PersonalModelCredentialCoordinatorResult {
  const status = operation.operationPhase === "manual_attention"
    ? "manual_attention"
    : operation.operationPhase === "credential_cleanup_pending"
      ? "cleanup_pending"
      : operation.operationPhase === "committed"
        ? "committed"
        : "prepared";
  return {
    ok: true,
    status,
    replayed,
    commandId: operation.commandId,
    commandType: operation.operationType,
    personalModelId: operation.targetModelId,
    ...(operation.operationPhase === "committed"
      && operation.targetConfigurationRevision !== undefined
      ? { committedConfigurationRevision: operation.targetConfigurationRevision }
      : {}),
  };
}

function resultFromReceipt(
  receipt: PersonalModelCommandReceipt,
  replayed: boolean,
): PersonalModelCredentialCoordinatorResult {
  return {
    ok: true,
    status: receipt.outcome === "manual_attention"
      ? "manual_attention"
      : receipt.outcome === "update_committed_cleanup_pending"
        ? "cleanup_pending"
        : "committed",
    replayed,
    commandId: receipt.commandId,
    commandType: receipt.commandType as "create" | "update" | "delete",
    personalModelId: receipt.modelId!,
    ...(receipt.committedConfigurationRevision === undefined
      ? {}
      : { committedConfigurationRevision: receipt.committedConfigurationRevision }),
  };
}

function failure(
  code: PersonalModelCredentialCoordinatorErrorCode,
  message: string,
): PersonalModelCredentialCoordinatorResult {
  return { ok: false, error: { code, message } };
}

function mapPersistenceError(code: string): PersonalModelCredentialCoordinatorErrorCode {
  if (code === "personal_model.not_found") return "personal_model.not_found";
  if (code === "personal_model.invalid_transition") return "personal_model.invalid_transition";
  return "personal_model.conflict";
}

function mapCredentialError(code: string): PersonalModelCredentialCoordinatorErrorCode {
  if (code === "credential_store_cancelled") return "personal_model.cancelled";
  if (code.includes("uncertain")) return "personal_model.credential_operation_uncertain";
  return "personal_model.credential_unavailable";
}

function canonicalEndpoint(value: string): string {
  return canonicalizePersonalModelEndpoint(value).canonicalEndpoint;
}

function canonicalCommandMaterial(value: unknown): unknown {
  if (value === null || typeof value !== "object" || !("target" in value)) {
    return compactObject(value);
  }
  const material = value as Record<string, unknown> & {
    target: Record<string, unknown> & {
      endpoint: string;
      providerModelId: string;
      displayName: string;
      capabilities: string[];
    };
  };
  return compactObject({
    ...material,
    target: {
      ...material.target,
      endpoint: canonicalEndpoint(material.target.endpoint),
      providerModelId: material.target.providerModelId.normalize("NFC"),
      displayName: material.target.displayName.normalize("NFC"),
      capabilities: [...new Set(material.target.capabilities)]
        .sort((left, right) => left.localeCompare(right)),
    },
  });
}

function withoutOperationDigests(operation: PersonalModelOperation): Omit<
  PersonalModelOperation,
  "recordDigest" | "credentialObservationDigest"
> {
  const { recordDigest: _recordDigest, credentialObservationDigest: _observationDigest, ...material } = operation;
  return material;
}

function withoutRecordDigest<T extends { recordDigest: string }>(value: T): Omit<T, "recordDigest"> {
  const { recordDigest: _recordDigest, ...material } = value;
  return material;
}

function safeErrorCode(value: string): string {
  return /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/u.test(value)
    ? value.slice(0, 120)
    : "personal_model.recovery_failed";
}

function digestError(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function deriveCleanupOperationId(commandId: string): string {
  const hex = createHash("sha256")
    .update(`robothree.personal-model.credential-cleanup.v1:${commandId}`, "utf8")
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function containsControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

function compactObject<T>(value: T): T {
  if (Array.isArray(value)) return value.map(compactObject) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, compactObject(item)])) as T;
  }
  return value;
}
