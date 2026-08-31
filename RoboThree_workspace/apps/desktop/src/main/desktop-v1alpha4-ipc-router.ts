import {
  CompatibilityProjectionV1Alpha4Schema,
  CompatibilityQueryV1Alpha4Schema,
  DesktopErrorEnvelopeV1Alpha4Schema,
  SubmitTurnCommandV1Alpha4Schema,
  SubmitTurnStatusQueryV1Alpha4Schema,
} from "@robothree/contracts/desktop-local/v1alpha4";
import type { IpcMainInvokeEvent } from "electron";

import {
  DESKTOP_V1ALPHA4_IPC_CHANNELS,
  type DesktopV1Alpha4InvokeChannel,
  type RendererSafeResultV1Alpha4,
} from "../shared/foundation-api.js";
import type { CorePrivateConnectionLease } from "./core-private-supervisor.js";

export class DesktopV1Alpha4IpcRouter {
  readonly #resolveConnection: () => CorePrivateConnectionLease;
  readonly #isCurrentConnection: (lease: CorePrivateConnectionLease) => boolean;
  readonly #ensureDefaultWorkspaceGrant: ((input: Readonly<{
    clientInstanceId: string;
    correlationId: string;
  }>) => Promise<string>) | undefined;
  readonly #clients = new Map<number, string>();

  constructor(input: Readonly<{
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

  async dispatch(
    channel: DesktopV1Alpha4InvokeChannel,
    input: unknown,
    event?: IpcMainInvokeEvent,
  ): Promise<RendererSafeResultV1Alpha4<unknown>> {
    try {
      const lease = this.#resolveConnection();
      const parsed = channel === DESKTOP_V1ALPHA4_IPC_CHANNELS.compatibility
        ? CompatibilityQueryV1Alpha4Schema.parse(input)
        : channel === DESKTOP_V1ALPHA4_IPC_CHANNELS.submitTurn
          ? SubmitTurnCommandV1Alpha4Schema.parse(input)
          : SubmitTurnStatusQueryV1Alpha4Schema.parse(input);
      if (!this.#bindClient(event?.sender.id ?? 0, parsed.clientInstanceId)) {
        return fail(
          "runtime.client_mismatch",
          "This Desktop client identity does not belong to the current window.",
          parsed.correlationId,
          "authorization",
        );
      }
      let request = parsed;
      if (channel === DESKTOP_V1ALPHA4_IPC_CHANNELS.submitTurn) {
        const submit = SubmitTurnCommandV1Alpha4Schema.parse(parsed);
        if (
          submit.selectionRequest.workspaceGrantId === undefined
          && this.#ensureDefaultWorkspaceGrant !== undefined
        ) {
          try {
            const workspaceGrantId = await this.#ensureDefaultWorkspaceGrant({
              clientInstanceId: submit.clientInstanceId,
              correlationId: submit.correlationId,
            });
            request = SubmitTurnCommandV1Alpha4Schema.parse({
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
      const result = channel === DESKTOP_V1ALPHA4_IPC_CHANNELS.compatibility
        ? await lease.client.compatibilityV1Alpha4(parsed as never)
        : channel === DESKTOP_V1ALPHA4_IPC_CHANNELS.submitTurn
          ? await lease.client.submitTurnV1Alpha4(request as never)
          : await lease.client.querySubmitTurnV1Alpha4(parsed as never);
      if (!this.#isCurrentConnection(lease)) {
        return fail(
          "runtime_changed",
          "Local Core changed while handling this request. Reconnect and try again.",
          parsed.correlationId,
          "conflict",
          true,
        );
      }
      if (channel === DESKTOP_V1ALPHA4_IPC_CHANNELS.compatibility && result.ok) {
        return {
          ok: true,
          value: CompatibilityProjectionV1Alpha4Schema.parse({
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
        "The Desktop v1alpha4 request is invalid.",
        correlationIdOf(input),
        "validation",
      );
    }
  }

  clear(): void {
    this.#clients.clear();
  }

  #bindClient(windowId: number, clientInstanceId: string): boolean {
    const existing = this.#clients.get(windowId);
    if (existing !== undefined) return existing === clientInstanceId;
    if ([...this.#clients.values()].includes(clientInstanceId)) return false;
    if (this.#clients.size >= 16) return false;
    this.#clients.set(windowId, clientInstanceId);
    return true;
  }
}

function fail<T>(
  code: string,
  safeSummary: string,
  correlationId: string,
  category: "validation" | "authorization" | "availability" | "compatibility"
    | "conflict" | "uncertain" | "internal",
  retryable = false,
): RendererSafeResultV1Alpha4<T> {
  return {
    ok: false,
    error: DesktopErrorEnvelopeV1Alpha4Schema.parse({
      contractVersion: "v1alpha4",
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
