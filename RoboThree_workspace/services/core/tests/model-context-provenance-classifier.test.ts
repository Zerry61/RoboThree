import { JsonValueSchema } from "@robothree/contracts";
import type {
  ConversationMessage,
  TaskCapabilityLock,
  TaskRuntimeSelection,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  ModelContextProvenanceClassifier,
  ModelExternalScopeUnclassifiableError,
  sha256CanonicalJson,
} from "../src/index.js";
import type { ContextAssemblyReceipt } from "../src/index.js";

const digest = (value: string) => `sha256:${value.repeat(64)}`;

describe("ModelContextProvenanceClassifier", () => {
  it("derives categories only from typed context receipts", () => {
    const classifier = new ModelContextProvenanceClassifier();
    const classified = classifier.classify({
      receipt: receipt([
        segment("system:agent", "system_instruction", "a"),
        segment("skill:review", "selected_skill", "b"),
        segment("tool:echo", "tool_schema", "c"),
        segment("message:user-1", "conversation_message", "d"),
        segment("message:tool-1", "conversation_message", "e"),
      ]),
      conversationMessages: [message("user-1", "user"), message("tool-1", "tool")],
      runtimeSelection: selection(),
      modelLock: lock(),
      externalTarget: "enterprise:model-gateway",
    });

    expect(classified.dataCategories).toEqual([
      "platform_agent_instructions",
      "skill_content",
      "tool_result",
      "tool_schema",
      "user_text",
    ]);
    expect(classified.dataScopeDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("rejects assistant history without compatible target provenance", () => {
    const classifier = new ModelContextProvenanceClassifier();
    const input = {
      receipt: receipt([
        segment("message:assistant-1", "conversation_message", "f"),
        segment("message:user-1", "conversation_message", "a"),
      ]),
      conversationMessages: [message("assistant-1", "assistant"), message("user-1", "user")],
      runtimeSelection: selection(),
      modelLock: lock(),
      externalTarget: "enterprise:model-gateway",
    };
    expect(() => classifier.classify(input)).toThrow(ModelExternalScopeUnclassifiableError);
    expect(classifier.classify({
      ...input,
      assistantProvenance: [{
        messageId: "assistant-1",
        externalTargetDigest: sha256CanonicalJson(JsonValueSchema.parse("enterprise:model-gateway")),
        runtimeSelectionDigest: selection().selectionDigest,
        modelCapabilityId: lock().definitionSnapshot.capabilityId,
        modelCapabilityRevision: lock().definitionSnapshot.revision,
        modelLockDigest: sha256CanonicalJson(JsonValueSchema.parse(lock())),
        bindingId: lock().bindingSnapshot.bindingId,
        bindingRevision: lock().bindingSnapshot.revision,
        adapterDescriptorId: lock().adapterDescriptorSnapshot.adapterDescriptorId,
        adapterDescriptorRevision: lock().adapterDescriptorSnapshot.revision,
        registryRevision: lock().registryRevision,
      }],
    }).dataCategories).toEqual(["user_text"]);
  });

  it("inherits categories for an active Summary only from verified immutable source evidence", () => {
    const classifier = new ModelContextProvenanceClassifier();
    const compactionId = "019f8c00-0000-7000-8000-000000000001";
    const sourceDigest = digest("c");
    const input = {
      receipt: {
        ...receipt([segment(`compaction:${compactionId}`, "compaction_summary", "c")]),
        compactionSummaryEvidence: {
          compactionId,
          sourceStartSequence: 1,
          sourceEndSequence: 4,
          sourceDigest,
          summaryDigest: digest("d"),
          contextRevision: 1,
        },
      },
      conversationMessages: [],
      runtimeSelection: selection(),
      modelLock: lock(),
      externalTarget: "enterprise:model-gateway",
    };
    expect(() => classifier.classify(input)).toThrow(ModelExternalScopeUnclassifiableError);
    expect(classifier.classify({
      ...input,
      compactionSummaryProvenance: {
        compactionId,
        sourceDigest,
        dataCategories: ["tool_result", "user_text"] as const,
      },
    }).dataCategories).toEqual(["tool_result", "user_text"]);
    expect(() => classifier.classify({
      ...input,
      compactionSummaryProvenance: {
        compactionId,
        sourceDigest: digest("e"),
        dataCategories: ["user_text"] as const,
      },
    })).toThrow(ModelExternalScopeUnclassifiableError);
  });
});

function segment(
  segmentId: string,
  sourceKind: "system_instruction" | "selected_skill" | "tool_schema" | "compaction_summary" | "conversation_message",
  marker: string,
) {
  return {
    segmentId,
    segmentKind: sourceKind === "conversation_message" || sourceKind === "compaction_summary"
      ? "dynamic" as const
      : "static" as const,
    sourceKind,
    sourceRevision: `revision:${marker}`,
    sourceDigest: digest(marker),
  };
}

function receipt(includedSegments: ContextAssemblyReceipt["includedSegments"]): ContextAssemblyReceipt {
  return {
    phase: "pre_call",
    snapshotId: "snapshot-1",
    snapshotSourceDigest: digest("1"),
    contextSourceDigest: digest("2"),
    policyDigest: digest("3"),
    includedSegments,
    excludedSources: [],
    reducedSegmentIds: [],
    initialEstimatedInputTokens: 1,
    finalEstimatedInputTokens: 1,
    availableInputTokens: 100,
    compactionThresholdTokens: 80,
    reductionApplied: false,
    modelRequestDigest: digest("4"),
  };
}

function message(messageId: string, role: "user" | "assistant" | "tool"): ConversationMessage {
  const message = role === "user"
    ? { role: "user" }
    : role === "assistant"
      ? { role: "assistant" }
      : { role: "tool" };
  return {
    envelope: { messageId },
    message,
  } as unknown as ConversationMessage;
}

function selection(): TaskRuntimeSelection {
  return {
    taskId: "task-1",
    selectionDigest: digest("5"),
    workspaceGrantId: "workspace-1",
  } as TaskRuntimeSelection;
}

function lock(): TaskCapabilityLock {
  return {
    registryRevision: digest("9"),
    definitionSnapshot: { capabilityId: "model.fixture", revision: digest("6") },
    bindingSnapshot: { bindingId: "binding.fixture", revision: digest("7") },
    adapterDescriptorSnapshot: { adapterDescriptorId: "adapter.fixture", revision: digest("8") },
  } as TaskCapabilityLock;
}
