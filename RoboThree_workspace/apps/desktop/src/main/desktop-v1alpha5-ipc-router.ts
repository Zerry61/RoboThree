import {
  CompatibilityProjectionV1Alpha5Schema,
  CompatibilityQueryV1Alpha5Schema,
  DesktopErrorEnvelopeV1Alpha5Schema,
  GetReasoningModePreferenceQueryV1Alpha5Schema,
  PreviewReasoningModeQueryV1Alpha5Schema,
  SubmitTurnCommandV1Alpha5Schema,
  SubmitTurnStatusQueryV1Alpha5Schema,
  UpdateReasoningModePreferenceCommandV1Alpha5Schema,
} from "@robothree/contracts/desktop-local/v1alpha5";
import type { IpcMainInvokeEvent } from "electron";

import {
  DESKTOP_V1ALPHA5_IPC_CHANNELS,
  type DesktopV1Alpha5InvokeChannel,
  type RendererSafeResultV1Alpha5,
} from "../shared/foundation-api.js";
import type { CorePrivateConnectionLease } from "./core-private-supervisor.js";

type ClientBinding = Readonly<{
  clientInstanceId: string;
  negotiatedRuntimeInstanceId?: string;
}>;

export class DesktopV1Alpha5IpcRouter {
  readonly #resolveConnection: () => CorePrivateConnectionLease;
  readonly #isCurrentConnection: (lease: CorePrivateConnectionLease) => boolean;
  readonly #ensureDefaultWorkspaceGrant: ((input: Readonly<{
    clientInstanceId: string;
    correlationId: string;
  }>) => Promise<string>) | undefined;
  readonly #clients = new Map<number, ClientBinding>();

  public constructor(input: Readonly<{
    resolveConnection: () => CorePrivateConnectionLease;
    isCurrentConnection: (lease: CorePrivateConnectionLease) => boolean;
    ensureDefaultWorkspaceGrant?: (input: Readonly<{
      clientInstanceId: string;
      correlationId: string;
    }>) => Promise<string>;
  }>) {
    this.#resolveConnection = input.resolveConnection;
    this.#isCurrentConnection = input.isCurrentConnection;
    this.#ensureDefaultWorkspaceGrant = input.ensureDefaultWorkspaceGrant;
  }

  public async dispatch(
    channel: DesktopV1Alpha5InvokeChannel,
    input: unknown,
    event?: IpcMainInvokeEvent,
  ): Promise<RendererSafeResultV1Alpha5<unknown>> {
    const correlationId = correlationIdOf(input);
    try {
      const parsed = parseRequest(channel, input);
      const webContentsId = event?.sender.id ?? 0;
      if (!this.#bindClient(webContentsId, parsed.clientInstanceId)) {
        return fail(
          "reasoning.client_mismatch",
          "This Desktop client identity does not belong to the current window.",
          parsed.correlationId,
          "authorization",
        );
      }
      const lease = this.#resolveConnection();
      const binding = this.#clients.get(webContentsId)!;
      const compatibility = channel === DESKTOP_V1ALPHA5_IPC_CHANNELS.compatibility;
      if (!compatibility
        && binding.negotiatedRuntimeInstanceId !== lease.runtimeInstanceId) {
        return fail(
          "reasoning.runtime_changed",
          "Local Core changed. Reconnect before using Max reasoning.",
          parsed.correlationId,
          "conflict",
          true,
        );
      }
      let request = parsed;
      if (channel === DESKTOP_V1ALPHA5_IPC_CHANNELS.submitTurn) {
        const submit = SubmitTurnCommandV1Alpha5Schema.parse(parsed);
        if (
          submit.selectionRequest.workspaceGrantId === undefined
          && this.#ensureDefaultWorkspaceGrant !== undefined
        ) {
          try {
            const workspaceGrantId = await this.#ensureDefaultWorkspaceGrant({
              clientInstanceId: submit.clientInstanceId,
              correlationId: submit.correlationId,
            });
            request = SubmitTurnCommandV1Alpha5Schema.parse({
              ...submit,
              selectionRequest: { ...submit.selectionRequest, workspaceGrantId },
            });
          } catch {
            return fail(
              "workspace.default_unavailable",
              "The default workspace is unavailable. Choose a workspace and try again.",
              parsed.correlationId,
              "availability",
              true,
            );
          }
        }
      }
      const result = await dispatchExact(channel, request, lease);
      if (!this.#isCurrentConnection(lease)) {
        return fail(
          "reasoning.runtime_changed",
          "Local Core changed while handling this request. Reconnect and try again.",
          parsed.correlationId,
          "conflict",
          true,
        );
      }
      if (compatibility && result.ok) {
        this.#clients.set(webContentsId, Object.freeze({
          clientInstanceId: parsed.clientInstanceId,
          negotiatedRuntimeInstanceId: lease.runtimeInstanceId,
        }));
        return {
          ok: true,
          value: CompatibilityProjectionV1Alpha5Schema.parse({
            ...result.value,
            runtimeInstanceId: lease.runtimeInstanceId,
            transportClientInstanceId: lease.transportClientInstanceId,
          }),
        };
      }
      return result;
    } catch {
      return fail(
        "contract.invalid",
        "The Desktop v1alpha5 request is invalid.",
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

function parseRequest(channel: DesktopV1Alpha5InvokeChannel, input: unknown) {
  switch (channel) {
    case DESKTOP_V1ALPHA5_IPC_CHANNELS.compatibility:
      return CompatibilityQueryV1Alpha5Schema.parse(input);
    case DESKTOP_V1ALPHA5_IPC_CHANNELS.previewReasoningMode:
      return PreviewReasoningModeQueryV1Alpha5Schema.parse(input);
    case DESKTOP_V1ALPHA5_IPC_CHANNELS.getReasoningModePreference:
      return GetReasoningModePreferenceQueryV1Alpha5Schema.parse(input);
    case DESKTOP_V1ALPHA5_IPC_CHANNELS.updateReasoningModePreference:
      return UpdateReasoningModePreferenceCommandV1Alpha5Schema.parse(input);
    case DESKTOP_V1ALPHA5_IPC_CHANNELS.submitTurn:
      return SubmitTurnCommandV1Alpha5Schema.parse(input);
    case DESKTOP_V1ALPHA5_IPC_CHANNELS.getSubmitTurnStatus:
      return SubmitTurnStatusQueryV1Alpha5Schema.parse(input);
  }
}

async function dispatchExact(
  channel: DesktopV1Alpha5InvokeChannel,
  input: ReturnType<typeof parseRequest>,
  lease: CorePrivateConnectionLease,
) {
  const transportBoundInput = {
    ...input,
    clientInstanceId: lease.transportClientInstanceId,
  };
  switch (channel) {
    case DESKTOP_V1ALPHA5_IPC_CHANNELS.compatibility:
      return lease.client.compatibilityV1Alpha5(transportBoundInput as never);
    case DESKTOP_V1ALPHA5_IPC_CHANNELS.previewReasoningMode:
      return lease.client.previewReasoningModeV1Alpha5(transportBoundInput as never);
    case DESKTOP_V1ALPHA5_IPC_CHANNELS.getReasoningModePreference:
      return lease.client.getReasoningModePreferenceV1Alpha5(transportBoundInput as never);
    case DESKTOP_V1ALPHA5_IPC_CHANNELS.updateReasoningModePreference:
      return lease.client.updateReasoningModePreferenceV1Alpha5(transportBoundInput as never);
    case DESKTOP_V1ALPHA5_IPC_CHANNELS.submitTurn:
      return lease.client.submitTurnV1Alpha5(transportBoundInput as never);
    case DESKTOP_V1ALPHA5_IPC_CHANNELS.getSubmitTurnStatus:
      return lease.client.querySubmitTurnV1Alpha5(transportBoundInput as never);
  }
}

function fail<T>(
  code: string,
  safeSummary: string,
  correlationId: string,
  category: "validation" | "authorization" | "availability" | "compatibility"
    | "conflict" | "uncertain" | "internal",
  retryable = false,
): RendererSafeResultV1Alpha5<T> {
  return {
    ok: false,
    error: DesktopErrorEnvelopeV1Alpha5Schema.parse({
      contractVersion: "v1alpha5",
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
