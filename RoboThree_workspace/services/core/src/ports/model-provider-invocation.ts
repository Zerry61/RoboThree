import type {
  ModelExternalDataCategory,
  TaskCapabilityLock,
} from "@robothree/contracts";
import type { ReadableModelRequest } from "@robothree/contracts/model-protocol/v1alpha2";
import type { ReadableTaskRuntimeSelectionV1Alpha4 } from
  "@robothree/contracts/runtime-selection/v1alpha4";
import type {
  ModelInvocationTimeoutMaterial,
} from "./model-invocation-timeout.js";
import type { DynamicRequestFactsV1 } from
  "../application/dynamic-request-facts.js";

/**
 * Core-internal invocation context. It binds a provider call to durable Task
 * facts without widening the public ModelRequest contract.
 */
type ModelProviderInvocationBase = Readonly<{
  sessionId: string;
  taskId: string;
  runId: string;
  stepId: string;
  actionId: string;
  round: number;
  runtimeSelection: ReadableTaskRuntimeSelectionV1Alpha4;
  modelLock: TaskCapabilityLock;
  modelRequest: ReadableModelRequest;
  deadlineAt: string;
  /** Required for local_personal calls; omitted by the unchanged enterprise path. */
  timeout?: ModelInvocationTimeoutMaterial;
  externalTarget: string;
  dataCategories: readonly ModelExternalDataCategory[];
  dataScopeDigest: string;
  admission: Readonly<{
    type: "user_confirmed";
    confirmationId: string;
    scopeDigest: string;
    confirmationDigest: string;
  }>;
  dynamicContext?: Readonly<{
    facts: DynamicRequestFactsV1;
    contextAssemblyReceiptDigest: string;
  }>;
}>;

export type ModelProviderInvocation = ModelProviderInvocationBase & (
  | Readonly<{ purpose?: "assistant_message"; assistantMessageId: string }>
  | Readonly<{
    purpose: "compaction_summary";
    compactionJobId: string;
    executionBindingDigest: string;
  }>
);
