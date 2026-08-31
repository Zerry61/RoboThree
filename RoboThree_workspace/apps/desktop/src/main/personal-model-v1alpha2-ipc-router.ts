import {
  CreatePersonalModelCommandV1Alpha2Schema,
  DeletePersonalModelCommandV1Alpha2Schema,
  GetPersonalModelQueryV1Alpha2Schema,
  ListPersonalModelsQueryV1Alpha2Schema,
  PersonalModelManagementCompatibilityProjectionV1Alpha2Schema,
  PersonalModelManagementCompatibilityQueryV1Alpha2Schema,
  PersonalModelManagementErrorEnvelopeV1Alpha2Schema,
  QueryPersonalModelOperationV1Alpha2Schema,
  RevealPersonalModelKeyCommandV1Alpha2Schema,
  UpdatePersonalModelCommandV1Alpha2Schema,
} from "@robothree/contracts/desktop-local/personal-model-management/v1alpha2";
import type { IpcMainInvokeEvent } from "electron";

import {
  PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS,
  type PersonalModelV1Alpha2InvokeChannel,
  type RendererPersonalModelManagementSafeResultV1Alpha2,
} from "../shared/foundation-api.js";
import type { CorePrivateConnectionLease } from "./core-private-supervisor.js";
import type { PersonalCredentialTransportProductionController } from
  "./personal-credential-transport-controller.js";

type ClientBinding = Readonly<{ clientInstanceId: string; negotiatedRuntimeInstanceId?: string }>;

export class PersonalModelV1Alpha2IpcRouter {
  readonly #clients = new Map<number, ClientBinding>();
  public constructor(private readonly input: Readonly<{
    resolveConnection: () => CorePrivateConnectionLease;
    isCurrentConnection: (lease: CorePrivateConnectionLease) => boolean;
    transport: PersonalCredentialTransportProductionController;
    isAuthorizedWebContents?: (webContentsId: number) => boolean;
  }>) {}

  public async dispatch(channel: PersonalModelV1Alpha2InvokeChannel, raw: unknown, event: IpcMainInvokeEvent): Promise<RendererPersonalModelManagementSafeResultV1Alpha2<unknown>> {
    const correlationId = correlationIdOf(raw);
    try {
      if (event.senderFrame !== event.sender.mainFrame
        || !(this.input.isAuthorizedWebContents?.(event.sender.id) ?? true)) {
        return fail("personal_model.permission_denied", "Personal Model management is not authorized for this frame.", correlationId, "authorization");
      }
      const parsed = parseRequest(channel, raw);
      if (!this.#bindClient(event.sender.id, parsed.clientInstanceId)) {
        return fail("personal_model.permission_denied", "This Desktop client identity does not belong to the current window.", parsed.correlationId, "authorization");
      }
      const lease = this.input.resolveConnection();
      const compatibility = channel === PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.compatibility;
      const binding = this.#clients.get(event.sender.id)!;
      if (!compatibility && binding.negotiatedRuntimeInstanceId !== lease.runtimeInstanceId) return runtimeChanged(parsed.correlationId);
      const result = await dispatchExact(channel, { ...parsed, clientInstanceId: lease.transportClientInstanceId }, lease);
      if (!this.input.isCurrentConnection(lease)) return runtimeChanged(parsed.correlationId);
      if (compatibility && result.ok) {
        this.#clients.set(event.sender.id, Object.freeze({ clientInstanceId: parsed.clientInstanceId, negotiatedRuntimeInstanceId: lease.runtimeInstanceId }));
        return { ok: true, value: PersonalModelManagementCompatibilityProjectionV1Alpha2Schema.parse({ ...result.value, runtimeInstanceId: lease.runtimeInstanceId }) };
      }
      if (result.ok && isTransportPreparation(result.value)) {
        if (!this.input.isCurrentConnection(lease)) return runtimeChanged(parsed.correlationId);
        this.input.transport.openPreparedCommand({
          schemaVersion: "personal-credential-transport-prepared-command.v1",
          runtimeInstanceId: lease.runtimeInstanceId,
          clientInstanceId: lease.transportClientInstanceId,
          commandId: result.value.transport.commandId,
          correlationId: parsed.correlationId,
          operationType: result.value.transport.commandType,
          personalModelId: result.value.transport.personalModelId,
          expectedConfigurationRevision: result.value.transport.expectedConfigurationRevision,
          ...(result.value.transport.expectedExecutionDefinitionDigest === undefined ? {} : { expectedExecutionDefinitionDigest: result.value.transport.expectedExecutionDefinitionDigest }),
          requestDigest: result.value.transport.requestDigest,
          deadlineAt: result.value.transport.deadlineAt,
        }, event);
      }
      return result;
    } catch {
      return fail("personal_model.contract_invalid", "Personal Model request is invalid.", correlationId, "validation");
    }
  }

  public removeWebContents(webContentsId: number): void { this.#clients.delete(webContentsId); }
  public clear(): void { this.#clients.clear(); }

  #bindClient(webContentsId: number, clientInstanceId: string): boolean {
    const existing = this.#clients.get(webContentsId);
    if (existing !== undefined) return existing.clientInstanceId === clientInstanceId;
    for (const binding of this.#clients.values()) if (binding.clientInstanceId === clientInstanceId) return false;
    if (this.#clients.size >= 16) return false;
    this.#clients.set(webContentsId, Object.freeze({ clientInstanceId }));
    return true;
  }
}

function parseRequest(channel: PersonalModelV1Alpha2InvokeChannel, input: unknown) {
  switch (channel) {
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.compatibility: return PersonalModelManagementCompatibilityQueryV1Alpha2Schema.parse(input);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.listPersonalModels: return ListPersonalModelsQueryV1Alpha2Schema.parse(input);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.getPersonalModel: return GetPersonalModelQueryV1Alpha2Schema.parse(input);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.createPersonalModel: return CreatePersonalModelCommandV1Alpha2Schema.parse(input);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.updatePersonalModel: return UpdatePersonalModelCommandV1Alpha2Schema.parse(input);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.deletePersonalModel: return DeletePersonalModelCommandV1Alpha2Schema.parse(input);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.revealPersonalModelKey: return RevealPersonalModelKeyCommandV1Alpha2Schema.parse(input);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.queryPersonalModelOperation: return QueryPersonalModelOperationV1Alpha2Schema.parse(input);
  }
}

function dispatchExact(channel: PersonalModelV1Alpha2InvokeChannel, input: ReturnType<typeof parseRequest>, lease: CorePrivateConnectionLease) {
  switch (channel) {
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.compatibility: return lease.client.personalModelManagementCompatibilityV1Alpha2(input as never);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.listPersonalModels: return lease.client.listPersonalModelsV1Alpha2(input as never);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.getPersonalModel: return lease.client.getPersonalModelV1Alpha2(input as never);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.createPersonalModel: return lease.client.createPersonalModelV1Alpha2(input as never);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.updatePersonalModel: return lease.client.updatePersonalModelV1Alpha2(input as never);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.deletePersonalModel: return lease.client.deletePersonalModelV1Alpha2(input as never);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.revealPersonalModelKey: return lease.client.revealPersonalModelV1Alpha2(input as never);
    case PERSONAL_MODEL_V1ALPHA2_IPC_CHANNELS.queryPersonalModelOperation: return lease.client.queryPersonalModelOperationV1Alpha2(input as never);
  }
}

function isTransportPreparation(value: unknown): value is { state: "transport_prepared"; transport: { commandId: string; commandType: "create" | "update" | "reveal"; personalModelId: string; expectedConfigurationRevision: string; expectedExecutionDefinitionDigest?: string; requestDigest: string; deadlineAt: string } } {
  return typeof value === "object" && value !== null && "state" in value && value.state === "transport_prepared" && "transport" in value && typeof value.transport === "object" && value.transport !== null;
}

function runtimeChanged<T>(correlationId: string): RendererPersonalModelManagementSafeResultV1Alpha2<T> {
  return fail("personal_model.runtime_changed", "Local Core changed. Reconnect before managing Personal Models.", correlationId, "conflict", true);
}

function fail<T>(code: ReturnType<typeof PersonalModelManagementErrorEnvelopeV1Alpha2Schema.parse>["code"], safeSummary: string, correlationId: string, category: ReturnType<typeof PersonalModelManagementErrorEnvelopeV1Alpha2Schema.parse>["category"], retryable = false): RendererPersonalModelManagementSafeResultV1Alpha2<T> {
  return { ok: false, error: PersonalModelManagementErrorEnvelopeV1Alpha2Schema.parse({ contractVersion: "personal-model-management.v1alpha2", code, category, safeSummary, retryable, correlationId }) };
}

function correlationIdOf(value: unknown): string {
  return typeof value === "object" && value !== null && "correlationId" in value && typeof value.correlationId === "string" && /^[0-9a-f-]{36}$/iu.test(value.correlationId)
    ? value.correlationId : "00000000-0000-4000-8000-000000000000";
}
