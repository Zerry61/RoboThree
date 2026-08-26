import type { Action, Observation, TaskCapabilityLock } from "@robothree/contracts";

import type { RuntimeAdapterHandle } from "./runtime-adapter-handle.js";

export type ToolExecutionRequest = Readonly<{
  lock: TaskCapabilityLock;
  action: Action;
  effectAttemptId: string;
  idempotencyKey: string;
  requestedAt: string;
  deadlineAt?: string;
}>;

export interface ToolExecutionBackend extends RuntimeAdapterHandle {
  readonly adapterKind: "tool_execution_backend";
  execute(request: ToolExecutionRequest, signal: AbortSignal): Promise<Observation>;
}
