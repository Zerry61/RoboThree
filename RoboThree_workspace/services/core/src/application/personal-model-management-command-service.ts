import {
  PersonalModelCommandPreparationV1Alpha2Schema,
  PersonalModelOperationReceiptV1Alpha2Schema,
  PersonalModelPreparedTransportV1Alpha2Schema,
  QueryPersonalModelOperationV1Alpha2Schema,
  type CreatePersonalModelCommandV1Alpha2,
  type DeletePersonalModelCommandV1Alpha2,
  type PersonalModelCommandPreparationV1Alpha2,
  type PersonalModelOperationReceiptV1Alpha2,
  type QueryPersonalModelOperationV1Alpha2,
  type RevealPersonalModelKeyCommandV1Alpha2,
  type UpdatePersonalModelCommandV1Alpha2,
} from "@robothree/contracts/desktop-local/personal-model-management/v1alpha2";

import {
  createPersonalModelCredentialCommand,
  type PersonalModelCredentialCoordinator,
  type PersonalModelCredentialCoordinatorResult,
} from "./personal-model-credential-coordinator.js";
import { createPersonalModelRevealCommand } from "./personal-model-credential-reveal-service.js";
import type { PersonalModelManagementAuthoritySource } from
  "./personal-model-management-authority.js";
import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";

export type PersonalModelManagementCommandErrorCode =
  | "personal_model.feature_unavailable"
  | "personal_model.permission_denied"
  | "personal_model.not_found"
  | "personal_model.revision_conflict"
  | "personal_model.operation_in_progress"
  | "personal_model.in_use"
  | "personal_model.usage_unknown"
  | "personal_model.operation_uncertain"
  | "personal_model.manual_attention"
  | "personal_model.cleanup_pending"
  | "personal_model.reveal_expired"
  | "personal_model.internal";

export type PersonalModelManagementCommandResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: PersonalModelManagementCommandErrorCode }>;

export class PersonalModelManagementCommandService {
  public constructor(private readonly input: Readonly<{
    coordinator: PersonalModelCredentialCoordinator;
    persistence: PersonalModelPersistence;
    authority: PersonalModelManagementAuthoritySource;
    ids: IdGenerator;
    clock: Clock;
    sensitiveOperationsReady: () => boolean;
  }>) {}

  public create(command: CreatePersonalModelCommandV1Alpha2): Promise<
    PersonalModelManagementCommandResult<PersonalModelCommandPreparationV1Alpha2>
  > {
    const personalModelId = `model.personal.${this.input.ids.next()}`;
    const prepared = createPersonalModelCredentialCommand({
      commandId: command.commandId,
      commandType: "create",
      personalModelId,
      target: command.target,
      credentialInputExpected: true,
    });
    return this.#prepareTransport(prepared, command.deadlineAt);
  }

  public async update(command: UpdatePersonalModelCommandV1Alpha2): Promise<
    PersonalModelManagementCommandResult<PersonalModelCommandPreparationV1Alpha2>
  > {
    const prepared = createPersonalModelCredentialCommand({
      commandId: command.commandId,
      commandType: "update",
      personalModelId: command.personalModelId,
      expectedConfigurationRevision: command.expectedConfigurationRevision,
      expectedExecutionDefinitionDigest: command.expectedExecutionDefinitionDigest,
      target: command.target,
      credentialMutation: command.credentialMutation,
      credentialInputExpected: command.credentialMutation === "replace_secret",
    });
    if (command.credentialMutation === "replace_secret") {
      return this.#prepareTransport(prepared, command.deadlineAt);
    }
    if (!this.input.sensitiveOperationsReady()) return unavailable();
    const first = await this.input.coordinator.prepare(prepared);
    if (!first.ok) return failureFromCoordinator(first);
    const executed = await this.input.coordinator.executePrepared({
      commandId: prepared.commandId,
      commandType: "update",
      personalModelId: prepared.personalModelId,
      expectedConfigurationRevision: command.expectedConfigurationRevision,
      requestDigest: prepared.requestDigest,
      deadlineAt: command.deadlineAt,
      secret: new Uint8Array(0),
    });
    return executed.ok
      ? { ok: true, value: completed(executed) }
      : failureFromCoordinator(executed);
  }

  public async delete(command: DeletePersonalModelCommandV1Alpha2): Promise<
    PersonalModelManagementCommandResult<PersonalModelCommandPreparationV1Alpha2>
  > {
    if (!this.input.sensitiveOperationsReady()) return unavailable();
    const prepared = createPersonalModelCredentialCommand({
      commandId: command.commandId,
      commandType: "delete",
      personalModelId: command.personalModelId,
      expectedConfigurationRevision: command.expectedConfigurationRevision,
      expectedExecutionDefinitionDigest: command.expectedExecutionDefinitionDigest,
      credentialInputExpected: false,
    });
    const first = await this.input.coordinator.prepare(prepared);
    if (!first.ok) return failureFromCoordinator(first);
    const executed = await this.input.coordinator.executePrepared({
      commandId: prepared.commandId,
      commandType: "delete",
      personalModelId: prepared.personalModelId,
      expectedConfigurationRevision: command.expectedConfigurationRevision,
      requestDigest: prepared.requestDigest,
      deadlineAt: command.deadlineAt,
      secret: new Uint8Array(0),
    });
    return executed.ok
      ? { ok: true, value: completed(executed) }
      : failureFromCoordinator(executed);
  }

  public async reveal(command: RevealPersonalModelKeyCommandV1Alpha2): Promise<
    PersonalModelManagementCommandResult<PersonalModelCommandPreparationV1Alpha2>
  > {
    if (!this.input.sensitiveOperationsReady()) return unavailable();
    const prepared = createPersonalModelRevealCommand({
      commandId: command.commandId,
      commandType: "reveal",
      personalModelId: command.personalModelId,
      expectedConfigurationRevision: command.expectedConfigurationRevision,
      expectedExecutionDefinitionDigest: command.expectedExecutionDefinitionDigest,
      deadlineAt: command.deadlineAt,
    });
    return {
      ok: true,
      value: PersonalModelCommandPreparationV1Alpha2Schema.parse({
        state: "transport_prepared",
        receipt: PersonalModelOperationReceiptV1Alpha2Schema.parse({
          contractVersion: "personal-model-management.v1alpha2",
          state: "prepared",
          replayed: false,
          commandId: prepared.commandId,
          commandType: "reveal",
          personalModelId: prepared.personalModelId,
        }),
        transport: PersonalModelPreparedTransportV1Alpha2Schema.parse({
          schemaVersion: "personal-model-transport-preparation.v1alpha2",
          commandId: prepared.commandId,
          commandType: "reveal",
          personalModelId: prepared.personalModelId,
          expectedConfigurationRevision: prepared.expectedConfigurationRevision,
          expectedExecutionDefinitionDigest: prepared.expectedExecutionDefinitionDigest,
          requestDigest: prepared.requestDigest,
          deadlineAt: prepared.deadlineAt,
          transportMode: "strm_message_port",
        }),
      }),
    };
  }

  public async query(queryInput: QueryPersonalModelOperationV1Alpha2): Promise<
    PersonalModelManagementCommandResult<PersonalModelOperationReceiptV1Alpha2>
  > {
    const query = QueryPersonalModelOperationV1Alpha2Schema.parse(queryInput);
    const authority = await this.input.authority.resolve();
    if (authority === undefined) return { ok: false, code: "personal_model.permission_denied" };
    const owner = {
      ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
      ownerScopeDigest: authority.ownerScopeDigest,
    };
    const durableReceipt = await this.input.persistence.loadReceipt(owner, query.commandId);
    if (durableReceipt !== undefined) {
      return {
        ok: true,
        value: PersonalModelOperationReceiptV1Alpha2Schema.parse({
          contractVersion: "personal-model-management.v1alpha2",
          commandId: durableReceipt.commandId,
          commandType: durableReceipt.commandType,
          personalModelId: durableReceipt.modelId,
          state: durableReceipt.outcome === "manual_attention"
            ? "manual_attention"
            : durableReceipt.outcome === "update_committed_cleanup_pending"
              ? "cleanup_pending"
              : "committed",
          replayed: true,
          ...(durableReceipt.committedConfigurationRevision === undefined ? {} : {
            committedConfigurationRevision: durableReceipt.committedConfigurationRevision,
          }),
          receiptIdentity: durableReceipt.receiptDigest,
        }),
      };
    }
    const operation = await this.input.persistence.loadByCommand(owner, query.commandId);
    if (operation === undefined) return { ok: false, code: "personal_model.not_found" };
    return {
      ok: true,
      value: PersonalModelOperationReceiptV1Alpha2Schema.parse({
        contractVersion: "personal-model-management.v1alpha2",
        commandId: operation.commandId,
        commandType: operation.operationType,
        personalModelId: operation.targetModelId,
        state: operation.operationPhase === "manual_attention"
          ? "manual_attention"
          : operation.operationPhase === "credential_cleanup_pending"
            ? "cleanup_pending"
            : operation.operationPhase === "committed" ? "committed" : "prepared",
        replayed: true,
        ...(operation.targetConfigurationRevision === undefined ? {} : {
          committedConfigurationRevision: operation.targetConfigurationRevision,
        }),
        receiptIdentity: operation.recordDigest,
      }),
    };
  }

  async #prepareTransport(
    command: ReturnType<typeof createPersonalModelCredentialCommand>,
    deadlineAt: string,
  ): Promise<PersonalModelManagementCommandResult<PersonalModelCommandPreparationV1Alpha2>> {
    if (!this.input.sensitiveOperationsReady()) return unavailable();
    const result = await this.input.coordinator.prepare(command);
    if (!result.ok) return failureFromCoordinator(result);
    const expectedConfigurationRevision = command.commandType === "create"
      ? await this.#loadPreparedCreateRevision(command.commandId)
      : command.expectedConfigurationRevision;
    if (expectedConfigurationRevision === undefined) {
      return { ok: false, code: "personal_model.operation_uncertain" };
    }
    return {
      ok: true,
      value: PersonalModelCommandPreparationV1Alpha2Schema.parse({
        state: "transport_prepared",
        receipt: receipt(result),
        transport: {
          schemaVersion: "personal-model-transport-preparation.v1alpha2",
          commandId: command.commandId,
          commandType: command.commandType,
          personalModelId: command.personalModelId,
          expectedConfigurationRevision,
          requestDigest: command.requestDigest,
          deadlineAt,
          transportMode: "strm_message_port",
        },
      }),
    };
  }

  async #loadPreparedCreateRevision(commandId: string): Promise<string | undefined> {
    const authority = await this.input.authority.resolve();
    if (authority === undefined || !authority.permissions.configure) return undefined;
    const operation = await this.input.persistence.loadByCommand({
      ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
      ownerScopeDigest: authority.ownerScopeDigest,
    }, commandId);
    return operation?.operationType === "create"
      ? operation.targetConfigurationRevision
      : undefined;
  }
}

function receipt(result: PersonalModelCredentialCoordinatorResult & { ok: true }): PersonalModelOperationReceiptV1Alpha2 {
  return PersonalModelOperationReceiptV1Alpha2Schema.parse({
    contractVersion: "personal-model-management.v1alpha2",
    commandId: result.commandId,
    commandType: result.commandType,
    personalModelId: result.personalModelId,
    state: result.status,
    replayed: result.replayed,
    ...(result.committedConfigurationRevision === undefined ? {} : {
      committedConfigurationRevision: result.committedConfigurationRevision,
    }),
  });
}

function completed(result: PersonalModelCredentialCoordinatorResult & { ok: true }): PersonalModelCommandPreparationV1Alpha2 {
  return PersonalModelCommandPreparationV1Alpha2Schema.parse({ state: "completed", receipt: receipt(result) });
}

function unavailable<T>(): PersonalModelManagementCommandResult<T> {
  return { ok: false, code: "personal_model.feature_unavailable" };
}

function failureFromCoordinator<T>(
  result: Extract<PersonalModelCredentialCoordinatorResult, { ok: false }>,
): PersonalModelManagementCommandResult<T> {
  switch (result.error.code) {
    case "personal_model.permission_denied": return { ok: false, code: "personal_model.permission_denied" };
    case "personal_model.not_found": return { ok: false, code: "personal_model.not_found" };
    case "personal_model.in_use_or_usage_unknown": return { ok: false, code: "personal_model.usage_unknown" };
    case "personal_model.manual_attention_required": return { ok: false, code: "personal_model.manual_attention" };
    case "personal_model.credential_operation_uncertain": return { ok: false, code: "personal_model.operation_uncertain" };
    case "personal_model.conflict":
    case "personal_model.invalid_transition": return { ok: false, code: "personal_model.revision_conflict" };
    case "personal_model.not_prepared":
    case "personal_model.credential_unavailable":
    case "personal_model.deadline_exceeded":
    case "personal_model.cancelled": return { ok: false, code: "personal_model.feature_unavailable" };
  }
}
