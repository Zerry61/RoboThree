import {
  GetPersonalModelQueryV1Alpha1Schema,
  ListPersonalModelsQueryV1Alpha1Schema,
  PersonalModelManagementCompatibilityProjectionV1Alpha1Schema,
  PersonalModelManagementCompatibilityQueryV1Alpha1Schema,
  PersonalModelManagementErrorEnvelopeV1Alpha1Schema,
} from "@robothree/contracts/desktop-local/personal-model-management/v1alpha1";
import type { IpcMainInvokeEvent } from "electron";

import {
  PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS,
  type PersonalModelV1Alpha1InvokeChannel,
  type RendererPersonalModelManagementSafeResult,
} from "../shared/foundation-api.js";
import type { CorePrivateConnectionLease } from "./core-private-supervisor.js";

type ClientBinding = Readonly<{
  clientInstanceId: string;
  negotiatedRuntimeInstanceId?: string;
}>;

export class PersonalModelV1Alpha1IpcRouter {
  readonly #resolveConnection: () => CorePrivateConnectionLease;
  readonly #isCurrentConnection: (lease: CorePrivateConnectionLease) => boolean;
  readonly #isAuthorizedWebContents: (webContentsId: number) => boolean;
  readonly #clients = new Map<number, ClientBinding>();

  public constructor(input: Readonly<{
    resolveConnection: () => CorePrivateConnectionLease;
    isCurrentConnection: (lease: CorePrivateConnectionLease) => boolean;
    isAuthorizedWebContents?: (webContentsId: number) => boolean;
  }>) {
    this.#resolveConnection = input.resolveConnection;
    this.#isCurrentConnection = input.isCurrentConnection;
    this.#isAuthorizedWebContents = input.isAuthorizedWebContents ?? (() => true);
  }

  public async dispatch(
    channel: PersonalModelV1Alpha1InvokeChannel,
    input: unknown,
    event?: IpcMainInvokeEvent,
  ): Promise<RendererPersonalModelManagementSafeResult<unknown>> {
    const correlationId = correlationIdOf(input);
    try {
      if (event !== undefined
        && (event.senderFrame !== event.sender.mainFrame
          || !this.#isAuthorizedWebContents(event.sender.id))) {
        return fail(
          "personal_model.permission_denied",
          "Personal Model catalog access is not authorized for this frame.",
          correlationId,
          "authorization",
        );
      }
      const parsed = parseRequest(channel, input);
      const webContentsId = event?.sender.id ?? 0;
      if (!this.#bindClient(webContentsId, parsed.clientInstanceId)) {
        return fail(
          "personal_model.permission_denied",
          "This Desktop client identity does not belong to the current window.",
          parsed.correlationId,
          "authorization",
        );
      }
      const lease = this.#resolveConnection();
      const binding = this.#clients.get(webContentsId)!;
      const compatibility =
        channel === PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.compatibility;
      if (!compatibility
        && binding.negotiatedRuntimeInstanceId !== lease.runtimeInstanceId) {
        return runtimeChanged(parsed.correlationId);
      }
      const result = await dispatchExact(channel, parsed, lease);
      if (!this.#isCurrentConnection(lease)) {
        return runtimeChanged(parsed.correlationId);
      }
      if (compatibility && result.ok) {
        this.#clients.set(webContentsId, Object.freeze({
          clientInstanceId: parsed.clientInstanceId,
          negotiatedRuntimeInstanceId: lease.runtimeInstanceId,
        }));
        return {
          ok: true,
          value: PersonalModelManagementCompatibilityProjectionV1Alpha1Schema.parse({
            ...result.value,
            runtimeInstanceId: lease.runtimeInstanceId,
          }),
        };
      }
      return result;
    } catch {
      return fail(
        "personal_model.contract_invalid",
        "Personal Model request is invalid.",
        correlationId,
        "validation",
      );
    }
  }

  public removeWebContents(webContentsId: number): void {
    this.#clients.delete(webContentsId);
  }

  public clear(): void {
    this.#clients.clear();
  }

  #bindClient(webContentsId: number, clientInstanceId: string): boolean {
    const existing = this.#clients.get(webContentsId);
    if (existing !== undefined) return existing.clientInstanceId === clientInstanceId;
    for (const binding of this.#clients.values()) {
      if (binding.clientInstanceId === clientInstanceId) return false;
    }
    if (this.#clients.size >= 16) return false;
    this.#clients.set(webContentsId, Object.freeze({ clientInstanceId }));
    return true;
  }
}

function parseRequest(channel: PersonalModelV1Alpha1InvokeChannel, input: unknown) {
  switch (channel) {
    case PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.compatibility:
      return PersonalModelManagementCompatibilityQueryV1Alpha1Schema.parse(input);
    case PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.listPersonalModels:
      return ListPersonalModelsQueryV1Alpha1Schema.parse(input);
    case PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.getPersonalModel:
      return GetPersonalModelQueryV1Alpha1Schema.parse(input);
  }
}

async function dispatchExact(
  channel: PersonalModelV1Alpha1InvokeChannel,
  input: ReturnType<typeof parseRequest>,
  lease: CorePrivateConnectionLease,
) {
  const transportBoundInput = {
    ...input,
    clientInstanceId: lease.transportClientInstanceId,
  };
  switch (channel) {
    case PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.compatibility:
      return lease.client.personalModelManagementCompatibilityV1Alpha1(
        transportBoundInput as never,
      );
    case PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.listPersonalModels:
      return lease.client.listPersonalModelsV1Alpha1(transportBoundInput as never);
    case PERSONAL_MODEL_V1ALPHA1_IPC_CHANNELS.getPersonalModel:
      return lease.client.getPersonalModelV1Alpha1(transportBoundInput as never);
  }
}

function runtimeChanged<T>(
  correlationId: string,
): RendererPersonalModelManagementSafeResult<T> {
  return fail(
    "personal_model.runtime_changed",
    "Local Core changed. Reconnect before reading Personal Models.",
    correlationId,
    "conflict",
    true,
  );
}

function fail<T>(
  code: ReturnType<typeof PersonalModelManagementErrorEnvelopeV1Alpha1Schema.parse>["code"],
  safeSummary: string,
  correlationId: string,
  category: ReturnType<
    typeof PersonalModelManagementErrorEnvelopeV1Alpha1Schema.parse
  >["category"],
  retryable = false,
): RendererPersonalModelManagementSafeResult<T> {
  return {
    ok: false,
    error: PersonalModelManagementErrorEnvelopeV1Alpha1Schema.parse({
      contractVersion: "personal-model-management.v1alpha1",
      code,
      category,
      safeSummary,
      retryable,
      correlationId,
    }),
  };
}

function correlationIdOf(value: unknown): string {
  return typeof value === "object" && value !== null
    && "correlationId" in value && typeof value.correlationId === "string"
    && /^[0-9a-f-]{36}$/iu.test(value.correlationId)
    ? value.correlationId
    : "00000000-0000-4000-8000-000000000000";
}
