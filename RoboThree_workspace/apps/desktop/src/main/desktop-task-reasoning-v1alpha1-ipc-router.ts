import {
  GetTaskReasoningModeQueryV1Alpha1Schema,
  TaskReasoningErrorEnvelopeV1Alpha1Schema,
} from "@robothree/contracts/desktop-local/task-reasoning/v1alpha1";
import type { IpcMainInvokeEvent } from "electron";

import {
  DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS,
  type DesktopTaskReasoningV1Alpha1InvokeChannel,
  type RendererTaskReasoningSafeResult,
} from "../shared/foundation-api.js";
import type { CorePrivateConnectionLease } from "./core-private-supervisor.js";

export class DesktopTaskReasoningV1Alpha1IpcRouter {
  readonly #resolveConnection: () => CorePrivateConnectionLease;
  readonly #isCurrentConnection: (lease: CorePrivateConnectionLease) => boolean;
  readonly #clients = new Map<number, string>();

  public constructor(input: Readonly<{
    resolveConnection: () => CorePrivateConnectionLease;
    isCurrentConnection: (lease: CorePrivateConnectionLease) => boolean;
  }>) {
    this.#resolveConnection = input.resolveConnection;
    this.#isCurrentConnection = input.isCurrentConnection;
  }

  public async dispatch(
    channel: DesktopTaskReasoningV1Alpha1InvokeChannel,
    input: unknown,
    event?: IpcMainInvokeEvent,
  ): Promise<RendererTaskReasoningSafeResult<unknown>> {
    const correlationId = correlationIdOf(input);
    try {
      if (channel !== DESKTOP_TASK_REASONING_V1ALPHA1_IPC_CHANNELS.getTaskReasoningMode) {
        return fail("contract.invalid", "Task reasoning request is invalid.", correlationId);
      }
      const parsed = GetTaskReasoningModeQueryV1Alpha1Schema.parse(input);
      const webContentsId = event?.sender.id ?? 0;
      if (!this.#bindClient(webContentsId, parsed.clientInstanceId)) {
        return fail(
          "reasoning.client_mismatch",
          "This Desktop client identity does not belong to the current window.",
          parsed.correlationId,
          "compatibility",
        );
      }
      const lease = this.#resolveConnection();
      const result = await lease.client.getTaskReasoningModeV1Alpha1(parsed);
      if (!this.#isCurrentConnection(lease)) {
        return fail(
          "reasoning.runtime_changed",
          "Local Core changed while loading the Task reasoning summary.",
          parsed.correlationId,
          "conflict",
          true,
        );
      }
      return result;
    } catch {
      return fail("contract.invalid", "Task reasoning request is invalid.", correlationId);
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
    if (existing !== undefined) return existing === clientInstanceId;
    for (const existingClientId of this.#clients.values()) {
      if (existingClientId === clientInstanceId) return false;
    }
    if (this.#clients.size >= 16) return false;
    this.#clients.set(webContentsId, clientInstanceId);
    return true;
  }
}

function fail<T>(
  code: "contract.invalid" | "reasoning.runtime_changed" | "reasoning.client_mismatch",
  safeSummary: string,
  correlationId: string,
  category: "validation" | "compatibility" | "conflict" = "validation",
  retryable = false,
): RendererTaskReasoningSafeResult<T> {
  return {
    ok: false,
    error: TaskReasoningErrorEnvelopeV1Alpha1Schema.parse({
      contractVersion: "task-reasoning.v1alpha1",
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
