import { JsonValueSchema } from "@robothree/contracts";
import type {
  ConversationMessage,
  ModelExternalDataCategory,
  TaskCapabilityLock,
} from "@robothree/contracts";
import type { ReadableTaskRuntimeSelectionV1Alpha4 } from
  "@robothree/contracts/runtime-selection/v1alpha4";

import { sha256CanonicalJson } from "../persistence/digest.js";
import type { ContextAssemblyReceipt } from "./context-types.js";

export type AssistantMessageProvenance = Readonly<{
  messageId: string;
  externalTargetDigest: string;
  runtimeSelectionDigest: string;
  modelCapabilityId: string;
  modelCapabilityRevision: string;
  modelLockDigest: string;
  bindingId: string;
  bindingRevision: string;
  adapterDescriptorId: string;
  adapterDescriptorRevision: string;
  registryRevision: string;
}>;

export type CompactionSummaryProvenance = Readonly<{
  compactionId: string;
  sourceDigest: string;
  dataCategories: readonly ModelExternalDataCategory[];
}>;

export class ModelExternalScopeUnclassifiableError extends Error {
  public readonly code = "model.external_scope_unclassifiable";

  public constructor(message: string) {
    super(message);
    this.name = "ModelExternalScopeUnclassifiableError";
  }
}

export class ModelContextProvenanceClassifier {
  public classify(input: Readonly<{
    receipt: ContextAssemblyReceipt;
    conversationMessages: readonly ConversationMessage[];
    runtimeSelection: ReadableTaskRuntimeSelectionV1Alpha4;
    modelLock: TaskCapabilityLock;
    externalTarget: string;
    assistantProvenance?: readonly AssistantMessageProvenance[];
    compactionSummaryProvenance?: CompactionSummaryProvenance;
  }>): Readonly<{
    dataCategories: readonly ModelExternalDataCategory[];
    dataScopeDigest: string;
  }> {
    const messages = new Map(input.conversationMessages.map((message) => [
      message.envelope.messageId,
      message,
    ]));
    const assistantProvenance = new Map((input.assistantProvenance ?? []).map((item) => [
      item.messageId,
      item,
    ]));
    const categories = new Set<ModelExternalDataCategory>();
    const sources = input.receipt.includedSegments.map((segment) => {
      switch (segment.sourceKind) {
        case "system_instruction":
          categories.add("platform_agent_instructions");
          if (input.receipt.instructionBundleEvidence?.orderedSources.some(
            (source) => source.sourceKind === "skill",
          )) categories.add("skill_content");
          break;
        case "selected_skill":
          categories.add("skill_content");
          break;
        case "compaction_summary": {
          const evidence = input.receipt.compactionSummaryEvidence;
          const provenance = input.compactionSummaryProvenance;
          if (
            evidence === undefined
            || provenance === undefined
            || provenance.compactionId !== evidence.compactionId
            || provenance.sourceDigest !== evidence.sourceDigest
          ) {
            throw new ModelExternalScopeUnclassifiableError(
              "Compaction Summary lacks verified immutable source provenance",
            );
          }
          for (const category of provenance.dataCategories) categories.add(category);
          break;
        }
        case "tool_schema":
          categories.add("tool_schema");
          break;
        case "conversation_message": {
          const messageId = segment.segmentId.replace(/^message:/u, "");
          const message = messages.get(messageId);
          if (message === undefined) {
            throw new ModelExternalScopeUnclassifiableError(
              "Context receipt references an unavailable conversation message",
            );
          }
          if (message.message.role === "user") {
            categories.add("user_text");
          } else if (message.message.role === "tool") {
            categories.add("tool_result");
          } else if (message.message.role === "assistant") {
            const provenance = assistantProvenance.get(messageId);
            if (
              provenance === undefined
              || provenance.externalTargetDigest !== sha256CanonicalJson(JsonValueSchema.parse(input.externalTarget))
              || provenance.runtimeSelectionDigest !== input.runtimeSelection.selectionDigest
              || provenance.modelCapabilityId !== input.modelLock.definitionSnapshot.capabilityId
              || provenance.modelCapabilityRevision !== input.modelLock.definitionSnapshot.revision
              || provenance.modelLockDigest !== sha256CanonicalJson(JsonValueSchema.parse(input.modelLock))
              || provenance.bindingId !== input.modelLock.bindingSnapshot.bindingId
              || provenance.bindingRevision !== input.modelLock.bindingSnapshot.revision
              || provenance.adapterDescriptorId !== input.modelLock.adapterDescriptorSnapshot.adapterDescriptorId
              || provenance.adapterDescriptorRevision !== input.modelLock.adapterDescriptorSnapshot.revision
              || provenance.registryRevision !== input.modelLock.registryRevision
            ) {
              throw new ModelExternalScopeUnclassifiableError(
                "Assistant history lacks compatible external Model provenance",
              );
            }
          }
          break;
        }
      }
      return {
        sourceKind: segment.sourceKind,
        sourceRevision: segment.sourceRevision,
        sourceDigest: segment.sourceDigest,
      };
    });
    const dataCategories = Object.freeze([...categories].sort());
    if (dataCategories.length === 0) {
      throw new ModelExternalScopeUnclassifiableError("Model context has no classifiable external data");
    }
    return Object.freeze({
      dataCategories,
      dataScopeDigest: sha256CanonicalJson(JsonValueSchema.parse({
        runtimeSelectionDigest: input.runtimeSelection.selectionDigest,
        modelCapabilityRevision: input.modelLock.definitionSnapshot.revision,
        bindingRevision: input.modelLock.bindingSnapshot.revision,
        adapterDescriptorRevision: input.modelLock.adapterDescriptorSnapshot.revision,
        workspaceGrantId: input.runtimeSelection.workspaceGrantId ?? null,
        ...(input.receipt.instructionBundleEvidence === undefined
          ? {}
          : { instructionBundleEvidence: input.receipt.instructionBundleEvidence }),
        ...(input.receipt.dynamicRequestFactsEvidence === undefined
          ? {}
          : {
            dynamicRequestFactsEvidence: input.receipt.dynamicRequestFactsEvidence,
            requestScopedSystemMessageDigest:
              input.receipt.requestScopedSystemMessageDigest,
          }),
        sources,
      })),
    });
  }
}
