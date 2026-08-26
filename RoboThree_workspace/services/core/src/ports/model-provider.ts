import type { ModelStreamEvent } from "@robothree/contracts";
import type { ReadableModelRequest } from "@robothree/contracts/model-protocol/v1alpha2";

import type { RuntimeAdapterHandle } from "./runtime-adapter-handle.js";
import type { ModelProviderInvocation } from "./model-provider-invocation.js";
import type {
  DynamicRequestFactsSubject,
  DynamicRequestFactsV1,
} from "../application/dynamic-request-facts.js";

export interface ModelProvider extends RuntimeAdapterHandle {
  readonly adapterKind: "model_provider";
  stream(
    request: ReadableModelRequest,
    signal: AbortSignal,
    invocation?: ModelProviderInvocation,
  ): AsyncIterable<ModelStreamEvent>;
  messageCommitted?(
    invocation: ModelProviderInvocation,
    committedAt: string,
  ): Promise<void>;
  reconcileMessageCommitted?(input: Readonly<{
    taskId: string;
    assistantMessageId: string;
    committedAt: string;
  }>): Promise<void>;
  loadDynamicRequestFacts?(
    subject: DynamicRequestFactsSubject,
  ): Promise<DynamicRequestFactsV1 | undefined>;
}
