import { JsonValueSchema } from "@robothree/contracts";
import type {
  ConversationMessage,
  ModelExternalDataCategory,
  TaskCapabilityLock,
} from "@robothree/contracts";
import type { ReadableTaskRuntimeSelectionV1Alpha4 } from
  "@robothree/contracts/runtime-selection/v1alpha4";

import type { ConversationPersistence } from "../ports/conversation-persistence.js";
import { digestConversationRange } from "../persistence/conversation-validation.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type { AssistantMessageProvenance } from "./model-context-provenance-classifier.js";
import { ModelExternalScopeUnclassifiableError } from "./model-context-provenance-classifier.js";

export type CompactionProvenance = Readonly<{
  sourceMessages: readonly ConversationMessage[];
  dataCategories: readonly ModelExternalDataCategory[];
  dataScopeDigest: string;
}>;

export class CompactionProvenanceResolver {
  readonly #persistence: ConversationPersistence;

  constructor(persistence: ConversationPersistence) {
    this.#persistence = persistence;
  }

  async resolve(input: Readonly<{
    taskId: string;
    runId: string;
    round: number;
    sessionId: string;
    sourceStartSequence: number;
    sourceEndSequence: number;
    sourceDigest: string;
    baseActiveCompactionId?: string;
    baseSummaryDigest?: string;
    runtimeSelection: ReadableTaskRuntimeSelectionV1Alpha4;
    modelLock: TaskCapabilityLock;
    externalTarget: string;
    summarizerPromptRevision: string;
    assistantProvenance?: readonly AssistantMessageProvenance[];
  }>): Promise<CompactionProvenance> {
    const sourceMessages = await this.#persistence.loadMessageRange(
      input.sessionId,
      input.sourceStartSequence,
      input.sourceEndSequence,
    );
    if (
      sourceMessages.length !== input.sourceEndSequence - input.sourceStartSequence + 1
      || digestConversationRange(sourceMessages) !== input.sourceDigest
    ) throw new ModelExternalScopeUnclassifiableError("Compaction source evidence is incomplete or changed");

    const provenance = new Map((input.assistantProvenance ?? []).map((item) => [item.messageId, item]));
    const expected = exactAssistantTuple(input);
    const categories = new Set<ModelExternalDataCategory>();
    for (const message of sourceMessages) {
      if (message.message.role === "user") categories.add("user_text");
      if (message.message.role === "tool") categories.add("tool_result");
      if (message.message.role === "assistant") {
        const fact = provenance.get(message.envelope.messageId);
        if (fact === undefined || !sameAssistantTuple(fact, expected)) {
          throw new ModelExternalScopeUnclassifiableError(
            "Assistant history lacks exact compatible Model provenance",
          );
        }
      }
    }
    if (categories.size === 0) {
      throw new ModelExternalScopeUnclassifiableError("Compaction source has no classifiable external data");
    }
    const dataCategories = Object.freeze([...categories].sort());
    return Object.freeze({
      sourceMessages: Object.freeze([...sourceMessages]),
      dataCategories,
      dataScopeDigest: sha256CanonicalJson(JsonValueSchema.parse({
        purpose: "compaction_summary",
        taskId: input.taskId,
        runId: input.runId,
        round: input.round,
        sourceStartSequence: input.sourceStartSequence,
        sourceEndSequence: input.sourceEndSequence,
        sourceDigest: input.sourceDigest,
        baseActiveCompactionId: input.baseActiveCompactionId ?? null,
        baseSummaryDigest: input.baseSummaryDigest ?? null,
        runtimeSelectionDigest: input.runtimeSelection.selectionDigest,
        modelCapabilityId: input.modelLock.definitionSnapshot.capabilityId,
        modelCapabilityRevision: input.modelLock.definitionSnapshot.revision,
        modelLockDigest: sha256CanonicalJson(JsonValueSchema.parse(input.modelLock)),
        bindingRevision: input.modelLock.bindingSnapshot.revision,
        adapterDescriptorRevision: input.modelLock.adapterDescriptorSnapshot.revision,
        registryRevision: input.runtimeSelection.registryRevision,
        summarizerPromptRevision: input.summarizerPromptRevision,
        externalTargetDigest: sha256CanonicalJson(JsonValueSchema.parse(input.externalTarget)),
        dataCategories,
      })),
    });
  }
}

function exactAssistantTuple(input: Readonly<{
  runtimeSelection: ReadableTaskRuntimeSelectionV1Alpha4;
  modelLock: TaskCapabilityLock;
  externalTarget: string;
}>): Omit<AssistantMessageProvenance, "messageId"> {
  return {
    externalTargetDigest: sha256CanonicalJson(JsonValueSchema.parse(input.externalTarget)),
    runtimeSelectionDigest: input.runtimeSelection.selectionDigest,
    modelCapabilityId: input.modelLock.definitionSnapshot.capabilityId,
    modelCapabilityRevision: input.modelLock.definitionSnapshot.revision,
    modelLockDigest: sha256CanonicalJson(JsonValueSchema.parse(input.modelLock)),
    bindingId: input.modelLock.bindingSnapshot.bindingId,
    bindingRevision: input.modelLock.bindingSnapshot.revision,
    adapterDescriptorId: input.modelLock.adapterDescriptorSnapshot.adapterDescriptorId,
    adapterDescriptorRevision: input.modelLock.adapterDescriptorSnapshot.revision,
    registryRevision: input.modelLock.registryRevision,
  };
}

function sameAssistantTuple(
  actual: AssistantMessageProvenance,
  expected: Omit<AssistantMessageProvenance, "messageId">,
): boolean {
  return Object.entries(expected).every(([key, value]) =>
    actual[key as keyof AssistantMessageProvenance] === value);
}
