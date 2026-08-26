import type { ConversationMessage, ProviderNeutralMessage } from "@robothree/contracts";

import type {
  ToolCallBatchRecord,
  ToolCallDispositionRecord,
} from "../persistence/tool-call-batch.js";

export type AtomicConversationEntry = Readonly<{
  sequence: number;
  segmentId: string;
  message: ProviderNeutralMessage;
}>;

export type ToolCallBatchEvidence = Readonly<{
  batch: ToolCallBatchRecord;
  dispositions: readonly ToolCallDispositionRecord[];
}>;

export type ConversationAtomicGroup = Readonly<{
  entries: readonly AtomicConversationEntry[];
  startSequence: number;
  endSequence: number;
  closed: boolean;
  containsToolBatch: boolean;
}>;

/**
 * Creates one deterministic set of conversation boundaries for both temporary
 * reduction and durable compaction planning. A Tool Call batch never becomes
 * compactable until every durable disposition is terminal and every committed
 * result is present in the same group.
 */
export function planConversationAtomicGroups(input: {
  entries: readonly AtomicConversationEntry[];
  toolCallBatches?: readonly ToolCallBatchEvidence[];
}): readonly ConversationAtomicGroup[] {
  const entries = [...input.entries].sort((left, right) => left.sequence - right.sequence);
  validateEntryOrder(entries);
  const evidenceByAssistant = new Map<string, ToolCallBatchEvidence>();
  for (const evidence of input.toolCallBatches ?? []) {
    if (evidenceByAssistant.has(evidence.batch.assistantMessageId)) {
      throw new Error("Tool Call batch evidence contains a duplicate assistant message");
    }
    evidenceByAssistant.set(evidence.batch.assistantMessageId, evidence);
  }
  const groups: MutableGroup[] = [];
  const resultOwner = new Map<string, Readonly<{
    group: MutableGroup;
    actionId: string;
    taskId: string | undefined;
  }>>();

  for (const entry of entries) {
    if (entry.message.role === "tool") {
      const owner = resultOwner.get(entry.message.toolCallId);
      if (owner === undefined) {
        throw new Error("Conversation contains an orphan Tool Result");
      }
      if (
        owner.group !== groups.at(-1)
        || entry.message.actionId !== owner.actionId
        || (owner.taskId !== undefined && entry.message.taskId !== owner.taskId)
      ) throw new Error("Tool Result crossed or drifted from its owning atomic group");
      owner.group.entries.push(entry);
      owner.group.pendingResultToolCallIds.delete(entry.message.toolCallId);
      continue;
    }

    let group = groups.at(-1);
    const closesPriorToolCycle = group !== undefined
      && group.containsToolBatch
      && !isOpen(group);
    if (
      group === undefined
      || (entry.message.role === "user" && !isOpen(group))
      || closesPriorToolCycle
    ) {
      group = {
        entries: [],
        blocked: false,
        pendingResultToolCallIds: new Set(),
        containsToolBatch: false,
      };
      groups.push(group);
    }
    group.entries.push(entry);

    if (entry.message.role === "assistant" && entry.message.toolCalls.length > 0) {
      group.containsToolBatch = true;
      const evidence = evidenceByAssistant.get(messageId(entry.segmentId));
      const state = validateToolBatch(entry, evidence);
      group.blocked ||= state.blocked;
      for (const expectedResult of state.expectedResults) {
        if (resultOwner.has(expectedResult.toolCallId)) {
          throw new Error("Tool Result identity is owned by more than one batch");
        }
        group.pendingResultToolCallIds.add(expectedResult.toolCallId);
        resultOwner.set(expectedResult.toolCallId, {
          group,
          actionId: expectedResult.actionId,
          taskId: evidence?.batch.taskId,
        });
      }
    }
  }

  return Object.freeze(groups.map((group) => {
    const first = group.entries[0];
    const last = group.entries.at(-1);
    if (first === undefined || last === undefined) throw new Error("Atomic group cannot be empty");
    return Object.freeze({
      entries: Object.freeze([...group.entries]),
      startSequence: first.sequence,
      endSequence: last.sequence,
      closed: !isOpen(group),
      containsToolBatch: group.containsToolBatch,
    });
  }));
}

export function conversationEntries(
  messages: readonly ConversationMessage[],
): readonly AtomicConversationEntry[] {
  return Object.freeze(messages.map((record) => Object.freeze({
    sequence: record.envelope.sequence,
    segmentId: `message:${record.envelope.messageId}`,
    message: record.message,
  })));
}

type MutableGroup = {
  entries: AtomicConversationEntry[];
  blocked: boolean;
  pendingResultToolCallIds: Set<string>;
  containsToolBatch: boolean;
};

function isOpen(group: MutableGroup): boolean {
  return group.blocked || group.pendingResultToolCallIds.size > 0;
}

function validateEntryOrder(entries: readonly AtomicConversationEntry[]): void {
  if (entries.some((entry, index) =>
    !Number.isSafeInteger(entry.sequence)
    || entry.sequence <= 0
    || (index > 0 && entries[index - 1]!.sequence + 1 !== entry.sequence)
    || !entry.segmentId.trim())) {
    throw new Error("Conversation entries must be contiguous and have stable segment identities");
  }
}

function validateToolBatch(
  entry: AtomicConversationEntry,
  evidence: ToolCallBatchEvidence | undefined,
): Readonly<{
  blocked: boolean;
  expectedResults: readonly Readonly<{ toolCallId: string; actionId: string }>[];
}> {
  if (entry.message.role !== "assistant") throw new Error("Expected assistant Tool Call entry");
  const calls = entry.message.toolCalls;
  if (evidence === undefined) {
    return {
      blocked: true,
      expectedResults: calls.map((call) => ({
        toolCallId: call.toolCallId,
        actionId: call.actionId,
      })),
    };
  }
  const messageIdentity = messageId(entry.segmentId);
  if (
    evidence.batch.assistantMessageId !== messageIdentity
    || evidence.batch.assistantMessageSequence !== entry.sequence
    || evidence.batch.callCount !== calls.length
    || evidence.dispositions.length !== calls.length
  ) throw new Error("Tool Call batch evidence does not match its assistant message");

  const expectedResults: Readonly<{ toolCallId: string; actionId: string }>[] = [];
  for (const [ordinal, call] of calls.entries()) {
    const disposition = evidence.dispositions.find((candidate) => candidate.ordinal === ordinal);
    if (
      disposition === undefined
      || disposition.batchId !== evidence.batch.batchId
      || disposition.toolCallId !== call.toolCallId
      || disposition.actionId !== call.actionId
    ) throw new Error("Tool Call disposition identity drifted from the assistant message");
    if (disposition.disposition === "result_committed") {
      expectedResults.push({ toolCallId: call.toolCallId, actionId: call.actionId });
    }
    else if (
      disposition.disposition !== "cancelled_before_dispatch"
      && disposition.disposition !== "denied_before_dispatch"
    ) return { blocked: true, expectedResults };
  }
  return { blocked: false, expectedResults };
}

function messageId(segmentId: string): string {
  if (!segmentId.startsWith("message:") || segmentId.length === "message:".length) {
    throw new Error("Conversation segmentId must identify a persisted message");
  }
  return segmentId.slice("message:".length);
}
