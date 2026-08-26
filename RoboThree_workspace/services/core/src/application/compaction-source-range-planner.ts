import type { CompactionRecord, ConversationMessage } from "@robothree/contracts";

import {
  conversationEntries,
  planConversationAtomicGroups,
  type ToolCallBatchEvidence,
} from "./conversation-atomic-group-planner.js";

export type CompactionSourceRangePlan = Readonly<{
  sourceStartSequence: 1;
  sourceEndSequence: number;
  rawExtensionStartSequence: number;
  rawExtensionEndSequence: number;
  retainedRawStartSequence: number;
  compactedGroupCount: number;
}>;

export class CompactionSourceRangePlanner {
  plan(input: {
    rawMessages: readonly ConversationMessage[];
    activeCompaction?: CompactionRecord;
    toolCallBatches?: readonly ToolCallBatchEvidence[];
  }): CompactionSourceRangePlan | undefined {
    if (input.rawMessages.length === 0) return undefined;
    const activeEnd = input.activeCompaction?.sourceEndSequence ?? 0;
    if (input.rawMessages[0]!.envelope.sequence !== activeEnd + 1) {
      throw new Error("Raw tail does not begin immediately after the active Compaction");
    }
    const entries = conversationEntries(input.rawMessages);
    const containsToolFacts = entries.some((entry) =>
      entry.message.role === "tool"
      || entry.message.role === "assistant" && entry.message.toolCalls.length > 0);
    if (containsToolFacts && input.toolCallBatches === undefined) {
      throw new Error("Durable Tool Call batch evidence is required for Compaction planning");
    }
    const groups = planConversationAtomicGroups({
      entries,
      toolCallBatches: input.toolCallBatches ?? [],
    });
    if (groups.length <= 1) return undefined;

    let eligibleEnd: number | undefined;
    let compactedGroupCount = 0;
    for (const group of groups.slice(0, -1)) {
      if (!group.closed) break;
      eligibleEnd = group.endSequence;
      compactedGroupCount += 1;
    }
    if (eligibleEnd === undefined || eligibleEnd <= activeEnd) return undefined;
    return Object.freeze({
      sourceStartSequence: 1,
      sourceEndSequence: eligibleEnd,
      rawExtensionStartSequence: activeEnd + 1,
      rawExtensionEndSequence: eligibleEnd,
      retainedRawStartSequence: eligibleEnd + 1,
      compactedGroupCount,
    });
  }
}
