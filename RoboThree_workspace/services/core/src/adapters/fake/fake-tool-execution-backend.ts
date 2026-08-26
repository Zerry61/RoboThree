import {
  ActionSchema,
  ObservationSchema,
  TaskCapabilityLockSchema,
  type JsonValue,
  type Observation,
} from "@robothree/contracts";

import type {
  ToolExecutionBackend,
  ToolExecutionRequest,
} from "../../ports/tool-execution-backend.js";

export type FakeToolHandler = (
  request: ToolExecutionRequest,
) => Promise<Observation> | Observation;

export class FakeToolExecutionBackend implements ToolExecutionBackend {
  readonly adapterKind = "tool_execution_backend" as const;
  readonly adapterDescriptorId: string;
  readonly adapterDescriptorRevision: string;
  readonly calls: ToolExecutionRequest[] = [];
  readonly #handler: FakeToolHandler;

  public constructor(input: {
    adapterDescriptorId: string;
    adapterDescriptorRevision: string;
    handler?: FakeToolHandler;
  }) {
    this.adapterDescriptorId = input.adapterDescriptorId;
    this.adapterDescriptorRevision = input.adapterDescriptorRevision;
    this.#handler = input.handler ?? ((request) => ({
      observationId: request.action.actionId,
      actionId: request.action.actionId,
      observedAt: request.requestedAt,
      outcome: "succeeded",
      output: request.action.payload as JsonValue,
    }));
  }

  public async execute(request: ToolExecutionRequest, signal: AbortSignal): Promise<Observation> {
    const lock = TaskCapabilityLockSchema.parse(request.lock);
    const action = ActionSchema.parse(request.action);
    if (lock.definitionSnapshot.kind !== "tool") {
      throw new Error("ToolExecutionBackend requires a tool capability lock");
    }
    if (
      lock.adapterDescriptorSnapshot.adapterDescriptorId !== this.adapterDescriptorId
      || lock.adapterDescriptorSnapshot.revision !== this.adapterDescriptorRevision
    ) {
      throw new Error("ToolExecutionBackend handle does not match the locked adapter descriptor");
    }
    if (signal.aborted) {
      return ObservationSchema.parse({
        observationId: action.actionId,
        actionId: action.actionId,
        observedAt: request.requestedAt,
        outcome: "cancelled",
        error: {
          code: "tool.cancelled",
          category: "cancelled",
          message: "Tool execution was cancelled",
          retryable: false,
        },
      });
    }
    if (request.deadlineAt !== undefined && Date.parse(request.deadlineAt) <= Date.parse(request.requestedAt)) {
      return ObservationSchema.parse({
        observationId: action.actionId,
        actionId: action.actionId,
        observedAt: request.requestedAt,
        outcome: "timed_out",
        error: {
          code: "tool.deadline_expired",
          category: "timeout",
          message: "Tool execution deadline has expired",
          retryable: false,
        },
      });
    }
    const normalized = Object.freeze({ ...request, lock, action });
    this.calls.push(normalized);
    return ObservationSchema.parse(await this.#handler(normalized));
  }
}
