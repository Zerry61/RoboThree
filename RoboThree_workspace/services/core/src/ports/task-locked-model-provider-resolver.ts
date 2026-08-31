import type { TaskCapabilityLock } from "@robothree/contracts";
import type { ReadableTaskRuntimeSelectionV1Alpha4 } from
  "@robothree/contracts/runtime-selection/v1alpha4";

import type { ModelProvider } from "./model-provider.js";

export type TaskLockedModelPurpose = "assistant_message" | "compaction_summary";

export type ResolvedTaskModelProvider = Readonly<{
  provider: ModelProvider;
  authority: "central_enterprise" | "local_personal";
  externalTarget: string;
  exactLockDigest: string;
}>;

/**
 * Core-private exhaustive resolver for the exact Model lock already committed
 * with a Task. It never selects a model and never mutates preference facts.
 */
export interface TaskLockedModelProviderResolver {
  resolve(input: Readonly<{
    taskId: string;
    runtimeSelection: ReadableTaskRuntimeSelectionV1Alpha4;
    modelLock: TaskCapabilityLock;
    purpose: TaskLockedModelPurpose;
  }>): Promise<ResolvedTaskModelProvider>;
  reconcileMessageCommitted?(input: Readonly<{
    taskId: string;
    modelLock: TaskCapabilityLock;
    assistantMessageId: string;
    committedAt: string;
  }>): Promise<void>;
}
