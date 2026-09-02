import {
  MODEL_PROTOCOL_VERSION,
  type ModelContextArtifact,
  type ProviderNeutralMessage,
} from "@robothree/contracts";

import type { TokenEstimator } from "../ports/token-estimator.js";
import type { ContextBudgetDecision } from "./context-budget-policy.js";
import type { AssembledContext, ReducedContext } from "./context-types.js";
import {
  planConversationAtomicGroups,
  type AtomicConversationEntry,
  type ToolCallBatchEvidence,
} from "./conversation-atomic-group-planner.js";
import type {
  ModelConversionInput,
  ModelMessageConverter,
} from "./model-message-converter.js";
import { ContextMaterialPolicy } from "./context-material-policy.js";

export type ContextReductionResult = Readonly<{
  context: ReducedContext;
  estimatedBeforeBoundedPreviewTokens: number;
  initialEstimatedInputTokens: number;
  finalEstimatedInputTokens: number;
  reducedSegmentIds: readonly string[];
  boundedPreviewApplied: boolean;
}>;

export class ContextReducer {
  readonly #estimator: TokenEstimator;
  readonly #converter: ModelMessageConverter;
  readonly #materials: ContextMaterialPolicy;

  constructor(input: {
    estimator: TokenEstimator;
    converter: ModelMessageConverter;
    materialPolicy?: ContextMaterialPolicy;
  }) {
    this.#estimator = input.estimator;
    this.#converter = input.converter;
    this.#materials = input.materialPolicy ?? new ContextMaterialPolicy();
  }

  reduce(
    assembled: AssembledContext,
    conversion: ModelConversionInput,
    budget: ContextBudgetDecision,
    toolCallBatches?: readonly ToolCallBatchEvidence[],
    options: Readonly<{ enforceAvailableInput?: boolean }> = {},
  ): ContextReductionResult {
    const unbounded = unboundedContext(assembled);
    const estimatedBeforeBoundedPreviewTokens = this.#estimator.estimate(
      this.#converter.measurementValue(unbounded, conversion),
    );
    const bounded = boundToolResults(
      assembled,
      budget.maxPreviewBytes,
      this.#materials,
    );
    const initialEstimatedInputTokens = this.#estimator.estimate(
      this.#converter.measurementValue(bounded, conversion),
    );
    let current = bounded;
    const reducedSegmentIds: string[] = [];
    const groups = conversationGroups(current, toolCallBatches);

    while (
      this.#estimator.estimate(this.#converter.measurementValue(current, conversion))
        > budget.compactionThresholdTokens
      && groups.length > 1
    ) {
      const removed = groups.shift();
      if (removed === undefined) break;
      const removedIds = new Set(removed.map((entry) => entry.segmentId));
      reducedSegmentIds.push(...removedIds);
      const retained = current.messages.flatMap((message, index) => {
        const segmentId = current.messageSegmentIds[index];
        return segmentId === undefined || removedIds.has(segmentId)
          ? []
          : [{ message, segmentId }];
      });
      current = {
        ...current,
        messages: retained.map((entry) => entry.message),
        messageSegmentIds: retained.map((entry) => entry.segmentId),
        segments: current.segments.filter((segment) => !removedIds.has(segment.segmentId)),
        artifacts: current.artifacts.filter(
          (artifact) => !removed.some(({ message }) =>
            message.role === "tool" && message.observationId === artifact.observationId),
        ),
      };
    }

    const finalEstimatedInputTokens = this.#estimator.estimate(
      this.#converter.measurementValue(current, conversion),
    );
    if (
      options.enforceAvailableInput !== false
      && finalEstimatedInputTokens > budget.availableInputTokens
    ) {
      throw new ContextBudgetExceededError(
        finalEstimatedInputTokens,
        budget.availableInputTokens,
      );
    }
    return Object.freeze({
      context: freezeReducedContext(current),
      estimatedBeforeBoundedPreviewTokens,
      initialEstimatedInputTokens,
      finalEstimatedInputTokens,
      reducedSegmentIds: Object.freeze(reducedSegmentIds),
      boundedPreviewApplied: bounded.artifacts.some((artifact) => artifact.truncated),
    });
  }
}

export class ContextBudgetExceededError extends Error {
  readonly code = "context.available_input_exceeded" as const;
  readonly estimatedInputTokens: number;
  readonly availableInputTokens: number;

  constructor(estimatedInputTokens: number, availableInputTokens: number) {
    super(
      `Context requires ${estimatedInputTokens} estimated input tokens; `
      + `only ${availableInputTokens} are available`,
    );
    this.name = "ContextBudgetExceededError";
    this.estimatedInputTokens = estimatedInputTokens;
    this.availableInputTokens = availableInputTokens;
  }
}

function boundToolResults(
  assembled: AssembledContext,
  maxPreviewBytes: number,
  materialPolicy: ContextMaterialPolicy,
): ReducedContext {
  const artifacts: ModelContextArtifact[] = [];
  const materialDecisions = materialPolicy.classifyToolResults(assembled.messages);
  const conversationMessages = assembled.messages.map(({ message }) => {
    if (message.role !== "tool") return message;
    const material = materialDecisions.get(message.toolCallId);
    // WTE read results are one exact JSON envelope split only to satisfy the
    // per-part transport bound. Rejoining those fragments with a newline would
    // corrupt JSON whenever the split lands inside an escaped string.
    const original = message.content.map((part) => part.text).join(
      material?.materialClass === "protected_exact" ? "" : "\n",
    );
    const originalBytes = byteLength(original);
    const preview = material?.materialClass === "protected_exact"
      ? original
      : truncateUtf8(original, maxPreviewBytes);
    const previewBytes = byteLength(preview);
    artifacts.push({
      type: "tool_result",
      toolCallId: message.toolCallId,
      taskId: message.taskId,
      actionId: message.actionId,
      observationId: message.observationId,
      resultDigest: message.resultDigest,
      originalBytes,
      previewBytes,
      truncated: previewBytes < originalBytes,
    });
    return {
      ...message,
      schemaVersion: MODEL_PROTOCOL_VERSION,
      content: preview.length === 0 ? [] : [{ type: "text" as const, text: preview }],
    };
  });
  return {
    snapshot: assembled.snapshot,
    contextSourceDigest: assembled.contextSourceDigest,
    ...(assembled.compactionSummaryEvidence === undefined
      ? {}
      : { compactionSummaryEvidence: assembled.compactionSummaryEvidence }),
    ...(assembled.instructionBundleEvidence === undefined
      ? {}
      : { instructionBundleEvidence: assembled.instructionBundleEvidence }),
    ...(assembled.dynamicRequestFactsEvidence === undefined
      ? {}
      : {
        dynamicRequestFactsEvidence: assembled.dynamicRequestFactsEvidence,
        requestScopedSystemMessageDigest: assembled.requestScopedSystemMessageDigest,
      }),
    instructions: assembled.instructions,
    messages: [
      ...assembled.derivedMessages.map((entry) => entry.message),
      ...conversationMessages,
    ],
    messageSegmentIds: [
      ...assembled.derivedMessages.map((entry) => entry.segmentId),
      ...assembled.messages.map((record) => `message:${record.envelope.messageId}`),
    ],
    tools: assembled.tools,
    artifacts,
    segments: assembled.segments,
    exclusions: assembled.exclusions,
  };
}

function unboundedContext(assembled: AssembledContext): ReducedContext {
  return {
    snapshot: assembled.snapshot,
    contextSourceDigest: assembled.contextSourceDigest,
    ...(assembled.compactionSummaryEvidence === undefined
      ? {}
      : { compactionSummaryEvidence: assembled.compactionSummaryEvidence }),
    ...(assembled.instructionBundleEvidence === undefined
      ? {}
      : { instructionBundleEvidence: assembled.instructionBundleEvidence }),
    ...(assembled.dynamicRequestFactsEvidence === undefined
      ? {}
      : {
        dynamicRequestFactsEvidence: assembled.dynamicRequestFactsEvidence,
        requestScopedSystemMessageDigest: assembled.requestScopedSystemMessageDigest,
      }),
    instructions: assembled.instructions,
    messages: [
      ...assembled.derivedMessages.map((entry) => entry.message),
      ...assembled.messages.map((record) => record.message),
    ],
    messageSegmentIds: [
      ...assembled.derivedMessages.map((entry) => entry.segmentId),
      ...assembled.messages.map((record) => `message:${record.envelope.messageId}`),
    ],
    tools: assembled.tools,
    artifacts: [],
    segments: assembled.segments,
    exclusions: assembled.exclusions,
  };
}

type MessageEntry = Readonly<{ message: ProviderNeutralMessage; segmentId: string }>;

function conversationGroups(
  context: ReducedContext,
  toolCallBatches: readonly ToolCallBatchEvidence[] | undefined,
): MessageEntry[][] {
  const entries = context.messages.map((message, index) => ({
    message,
    segmentId: context.messageSegmentIds[index]!,
  }));
  const persisted = entries.filter((entry) => entry.segmentId.startsWith("message:"));
  const plannedEntries = persisted.map((entry) => ({
    sequence: sequenceFromRevision(context, entry.segmentId),
    segmentId: entry.segmentId,
    message: entry.message,
  }));
  if (toolCallBatches === undefined) return legacyConversationGroups(plannedEntries);
  return planConversationAtomicGroups({
    entries: plannedEntries,
    toolCallBatches,
  }).filter((group) => group.closed).map((group) => [...group.entries]);
}

function legacyConversationGroups(entries: readonly AtomicConversationEntry[]): MessageEntry[][] {
  const groups: MessageEntry[][] = [];
  let current: MessageEntry[] = [];
  for (const entry of entries) {
    if (entry.message.role === "user" && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(entry);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function sequenceFromRevision(context: ReducedContext, segmentId: string): number {
  const segment = context.segments.find((candidate) => candidate.segmentId === segmentId);
  if (segment?.sourceKind !== "conversation_message") {
    throw new Error("Conversation reduction segment is missing its persisted source revision");
  }
  const sequence = Number.parseInt(segment.sourceRevision.replace("sequence:", ""), 10);
  if (!Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new Error("Conversation reduction source sequence is invalid");
  }
  return sequence;
}

function freezeReducedContext(context: ReducedContext): ReducedContext {
  return Object.freeze({
    ...context,
    instructions: Object.freeze([...context.instructions]),
    messages: Object.freeze([...context.messages]),
    messageSegmentIds: Object.freeze([...context.messageSegmentIds]),
    tools: Object.freeze([...context.tools]),
    artifacts: Object.freeze([...context.artifacts]),
    segments: Object.freeze([...context.segments]),
    exclusions: Object.freeze([...context.exclusions]),
  });
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const characterBytes = byteLength(character);
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}
