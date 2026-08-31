import type { ModelStreamEvent } from "@robothree/contracts";
import type { ReadableModelRequest } from
  "@robothree/contracts/model-protocol/v1alpha2";

import type { ModelProvider } from "../ports/model-provider.js";

/** Structural default for production graphs. A Task-locked resolver must
 * supply the real Provider; this object can never act as a fixture fallback. */
export class FailClosedModelProvider implements ModelProvider {
  readonly adapterDescriptorId = "adapter.model.fail-closed";
  readonly adapterDescriptorRevision = "fail-closed.v1";
  readonly adapterKind = "model_provider" as const;

  async *stream(
    _request: ReadableModelRequest,
    _signal: AbortSignal,
  ): AsyncIterable<ModelStreamEvent> {
    yield await Promise.reject(
      new Error("model_provider.task_locked_resolution_required"),
    );
  }
}
