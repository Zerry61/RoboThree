import {
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  type AssistantToolCall,
  type ProviderNeutralMessage,
  type RuntimeError,
} from "@robothree/contracts";
import type { ReadableModelRequest } from "@robothree/contracts/model-protocol/v1alpha2";

import type { AgentToolCallExecutor } from "../ports/agent-tool-call-executor.js";
import type { AgentConversationWriter } from "../ports/agent-conversation-writer.js";
import type { ModelProvider } from "../ports/model-provider.js";
import type { ModelProviderInvocation } from "../ports/model-provider-invocation.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type { ToolCallBatchCoordinator } from "./tool-call-batch-coordinator.js";
import {
  ModelStreamProtocolError,
  validateModelStream,
} from "../reliability/model-stream-validator.js";
import { ReasoningProtocolUnavailableError } from "./model-reasoning-protocol.js";

export type AgentLoopTimelineEvent =
  | Readonly<{ sequence: number; type: "model_requested"; requestId: string; requestDigest: string }>
  | Readonly<{ sequence: number; type: "model_text"; text: string }>
  | Readonly<{ sequence: number; type: "tool_requested"; call: AssistantToolCall }>
  | Readonly<{
    sequence: number;
    type: "confirmation_requested";
    call: AssistantToolCall;
    confirmationId: string;
  }>
  | Readonly<{
    sequence: number;
    type: "tool_observed";
    result: Extract<ProviderNeutralMessage, { role: "tool" }>;
  }>
  | Readonly<{ sequence: number; type: "completed"; finishReason: string }>
  | Readonly<{ sequence: number; type: "failed"; error: RuntimeError }>
  | Readonly<{ sequence: number; type: "cancelled" }>;

export type AgentLoopResult =
  | Readonly<{
    status: "completed";
    text: string;
    rounds: number;
    toolResults: readonly Extract<ProviderNeutralMessage, { role: "tool" }>[];
    timeline: readonly AgentLoopTimelineEvent[];
    timelineDigest: string;
  }>
  | Readonly<{
    status: "failed" | "cancelled";
    rounds: number;
    error?: RuntimeError;
    timeline: readonly AgentLoopTimelineEvent[];
    timelineDigest: string;
  }>
  | Readonly<{
    status: "waiting_user_confirmation";
    rounds: number;
    call: AssistantToolCall;
    confirmationId: string;
    timeline: readonly AgentLoopTimelineEvent[];
    timelineDigest: string;
  }>;

export type AgentLoopRecoverySeed = Readonly<{
  completedRoundCount: number;
  activeRound: number;
  activeAssistantMessageId: string;
  priorToolResults: readonly Extract<ProviderNeutralMessage, { role: "tool" }>[];
}>;

export class AgentLoopCoordinator {
  readonly #model: ModelProvider;
  readonly #tools: AgentToolCallExecutor;
  readonly #maxModelRounds: number;
  readonly #maxToolCalls: number;
  readonly #conversation: AgentConversationWriter | undefined;
  readonly #batches: ToolCallBatchCoordinator | undefined;

  constructor(input: {
    model: ModelProvider;
    tools: AgentToolCallExecutor;
    maxModelRounds?: number;
    maxToolCalls?: number;
    conversation?: AgentConversationWriter;
    batches?: ToolCallBatchCoordinator;
  }) {
    this.#model = input.model;
    this.#tools = input.tools;
    this.#maxModelRounds = input.maxModelRounds ?? 16;
    this.#maxToolCalls = input.maxToolCalls ?? 50;
    this.#conversation = input.conversation;
    this.#batches = input.batches;
    if (this.#maxModelRounds < 1 || this.#maxModelRounds > 64) {
      throw new Error("maxModelRounds must be between 1 and 64");
    }
    if (this.#maxToolCalls < 0 || this.#maxToolCalls > 256) {
      throw new Error("maxToolCalls must be between 0 and 256");
    }
  }

  async run(input: {
    model?: ModelProvider;
    sessionId?: string;
    taskId?: string;
    runId?: string;
    buildRequest: (
      round: number,
      priorToolResults: readonly Extract<ProviderNeutralMessage, { role: "tool" }>[],
    ) => Promise<ReadableModelRequest> | ReadableModelRequest;
    buildInvocation?: (
      request: ReadableModelRequest,
      round: number,
      assistantMessageId: string,
    ) => Promise<ModelProviderInvocation> | ModelProviderInvocation;
    signal?: AbortSignal;
    now?: () => string;
    createAssistantMessageId?: (round: number) => string;
    recoverySeed?: AgentLoopRecoverySeed;
    onModelRoundCompleted?: (input: Readonly<{
      round: number;
      assistantMessageId: string | undefined;
      text: string;
      toolCalls: readonly AssistantToolCall[];
      finishReason: string;
    }>) => Promise<void> | void;
    onTextDelta?: (input: Readonly<{
      round: number;
      messageId: string | undefined;
      deltaSequence: number;
      delta: string;
    }>) => void;
  }): Promise<AgentLoopResult> {
    const model = input.model ?? this.#model;
    const signal = input.signal ?? new AbortController().signal;
    const timeline: AgentLoopTimelineEvent[] = [];
    const recoverySeed = input.recoverySeed === undefined
      ? undefined
      : validateRecoverySeed(input.recoverySeed, this.#maxModelRounds, this.#maxToolCalls);
    const toolResults: Array<Extract<ProviderNeutralMessage, { role: "tool" }>> =
      recoverySeed === undefined ? [] : [...recoverySeed.priorToolResults];
    let allText = "";
    let rounds = recoverySeed?.completedRoundCount ?? 0;
    const append = <T extends Omit<AgentLoopTimelineEvent, "sequence">>(event: T): void => {
      timeline.push(Object.freeze({
        ...event,
        sequence: timeline.length + 1,
      }) as AgentLoopTimelineEvent);
    };

    while (rounds < this.#maxModelRounds) {
      if (signal.aborted) {
        append({ type: "cancelled" });
        return finish({ status: "cancelled", rounds, timeline });
      }
      rounds += 1;
      const assistantMessageId = recoverySeed !== undefined
        && rounds === recoverySeed.activeRound
        ? recoverySeed.activeAssistantMessageId
        : input.createAssistantMessageId?.(rounds);
      const request = await input.buildRequest(rounds, Object.freeze([...toolResults]));
      append({
        type: "model_requested",
        requestId: request.requestId,
        requestDigest: request.requestDigest,
      });
      let roundText = "";
      const invocation = input.buildInvocation === undefined
        ? undefined
        : await input.buildInvocation(
          request,
          rounds,
          assistantMessageId ?? missingAssistantMessageId(),
        );
      let deltaSequence = 0;
      const calls: AssistantToolCall[] = [];
      let terminal: "completed" | "failed" | undefined;
      let finishReason = "";
      let failure: RuntimeError | undefined;

      try {
        for await (const event of validateModelStream(
          model.stream(request, signal, invocation),
          signal,
        )) {
          if (signal.aborted) break;
          if (event.type === "text_delta") {
            roundText += event.delta;
            input.onTextDelta?.({
              round: rounds,
              messageId: assistantMessageId,
              deltaSequence,
              delta: event.delta,
            });
            deltaSequence += 1;
          } else if (event.type === "tool_call") {
            calls.push(event.call);
          } else if (event.type === "completed") {
            terminal = "completed";
            finishReason = event.finishReason;
          } else if (event.type === "failed") {
            terminal = "failed";
            failure = event.error;
          }
        }
      } catch (cause) {
        if (signal.aborted) {
          append({ type: "cancelled" });
          return finish({ status: "cancelled", rounds, timeline });
        }
        if (isModelStreamResumeUnavailable(cause)) throw cause;
        const error = cause instanceof ReasoningProtocolUnavailableError
          ? modelStreamError(
            cause.code,
            cause.code,
            cause.retryable,
          )
          : cause instanceof ModelStreamProtocolError
          ? modelStreamError(
            cause.code === "model_stream.terminal_missing"
              ? "agent.model_stream_incomplete"
              : "agent.model_stream_protocol_invalid",
            cause.code,
          )
          : modelStreamError(
            "agent.model_provider_failed",
            "model_stream.provider_failed",
            true,
          );
        append({ type: "failed", error });
        return finish({ status: "failed", rounds, error, timeline });
      }
      if (signal.aborted) {
        append({ type: "cancelled" });
        return finish({ status: "cancelled", rounds, timeline });
      }
      if (roundText.length > 0) {
        allText += roundText;
        append({ type: "model_text", text: roundText });
      }
      if (terminal === "failed") {
        append({ type: "failed", error: failure! });
        return finish({ status: "failed", rounds, error: failure!, timeline });
      }
      if (terminal !== "completed") {
        const error = loopError("agent.model_stream_incomplete", "Model stream ended without a terminal event");
        append({ type: "failed", error });
        return finish({ status: "failed", rounds, error, timeline });
      }
      let durableBatchId: string | undefined;
      if (calls.length > 0 && this.#batches !== undefined) {
        if (
          input.sessionId === undefined
          || input.taskId === undefined
          || input.runId === undefined
          || assistantMessageId === undefined
        ) {
          throw new Error("A durable Tool Call batch requires Session, Task, Run, and Assistant Message identities");
        }
        const committed = await this.#batches.appendAssistantBatch({
          messageId: assistantMessageId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          runId: input.runId,
          text: roundText,
          toolCalls: calls,
        });
        durableBatchId = committed.batch.batchId;
      } else if (this.#conversation !== undefined) {
        if (input.sessionId === undefined) {
          throw new Error("A durable Agent Loop requires sessionId");
        }
        if (calls.length > 0) {
          throw new Error("Durable Agent Tool Calls require ToolCallBatchCoordinator");
        }
        await this.#conversation.appendAssistant({
          ...(assistantMessageId === undefined
            ? {}
            : { messageId: assistantMessageId }),
          sessionId: input.sessionId,
          ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
          text: roundText,
          toolCalls: calls,
        });
      }
      if (invocation !== undefined && model.messageCommitted !== undefined) {
        await model.messageCommitted(invocation, input.now?.() ?? new Date().toISOString());
      }
      await input.onModelRoundCompleted?.({
        round: rounds,
        assistantMessageId,
        text: roundText,
        toolCalls: Object.freeze([...calls]),
        finishReason,
      });
      if (calls.length === 0) {
        append({ type: "completed", finishReason });
        return finish({
          status: "completed",
          text: allText,
          rounds,
          toolResults,
          timeline,
        });
      }
      if (toolResults.length + calls.length > this.#maxToolCalls) {
        const error = loopError("agent.tool_loop_limit", "Tool call limit exceeded");
        append({ type: "failed", error });
        return finish({ status: "failed", rounds, error, timeline });
      }
      if (durableBatchId !== undefined) {
        const dispatched = await this.#batches!.dispatchBatch(durableBatchId, signal);
        if (dispatched.status === "completed") {
          for (const result of dispatched.results) {
            const call = calls.find((candidate) => candidate.toolCallId === result.toolCallId);
            if (call === undefined) {
              const error = loopError("agent.tool_result_mismatch", "Tool result does not match its durable batch");
              append({ type: "failed", error });
              return finish({ status: "failed", rounds, error, timeline });
            }
            append({ type: "tool_requested", call });
            toolResults.push(result);
            append({ type: "tool_observed", result });
          }
          continue;
        }
        if (dispatched.status === "waiting_user_confirmation") {
          append({ type: "tool_requested", call: dispatched.call });
          append({
            type: "confirmation_requested",
            call: dispatched.call,
            confirmationId: dispatched.confirmationId,
          });
          return finish({
            status: "waiting_user_confirmation",
            rounds,
            call: dispatched.call,
            confirmationId: dispatched.confirmationId,
            timeline,
          });
        }
        if (dispatched.status === "cancelled") {
          append({ type: "cancelled" });
          return finish({ status: "cancelled", rounds, timeline });
        }
        append({ type: "failed", error: dispatched.error });
        return finish({
          status: "failed",
          rounds,
          error: dispatched.error,
          timeline,
        });
      }
      for (const call of calls) {
        append({ type: "tool_requested", call });
        let executed;
        try {
          executed = await this.#tools.execute(call, signal);
        } catch (cause) {
          if (signal.aborted) {
            append({ type: "cancelled" });
            return finish({ status: "cancelled", rounds, timeline });
          }
          const error = loopError(
            "agent.tool_execution_failed",
            cause instanceof Error ? cause.message : "Tool execution failed",
          );
          append({ type: "failed", error });
          return finish({ status: "failed", rounds, error, timeline });
        }
        if ("status" in executed) {
          if (executed.status === "waiting_user_confirmation") {
            append({
              type: "confirmation_requested",
              call,
              confirmationId: executed.request.confirmationId,
            });
            return finish({
              status: "waiting_user_confirmation",
              rounds,
              call,
              confirmationId: executed.request.confirmationId,
              timeline,
            });
          }
          append({ type: "failed", error: executed.error });
          return finish({ status: "failed", rounds, error: executed.error, timeline });
        }
        const result = executed;
        if (
          result.schemaVersion !== MODEL_PROTOCOL_VERSION
          || result.toolCallId !== call.toolCallId
          || result.taskId !== call.taskId
          || result.actionId !== call.actionId
        ) {
          const error = loopError("agent.tool_result_mismatch", "Tool result does not match its call");
          append({ type: "failed", error });
          return finish({ status: "failed", rounds, error, timeline });
        }
        toolResults.push(result);
        append({ type: "tool_observed", result });
      }
    }
    const error = loopError("agent.model_round_limit", "Model round limit exceeded");
    append({ type: "failed", error });
    return finish({ status: "failed", rounds, error, timeline });
  }
}

function missingAssistantMessageId(): never {
  throw new Error("A Model provider invocation requires a preallocated Assistant Message ID");
}

function finish<T extends Omit<AgentLoopResult, "timelineDigest">>(
  result: T,
): AgentLoopResult {
  const timeline = Object.freeze([...result.timeline]);
  return Object.freeze({
    ...result,
    timeline,
    timelineDigest: sha256CanonicalJson(JsonValueSchema.parse(timeline)),
  }) as AgentLoopResult;
}

function loopError(code: string, message: string): RuntimeError {
  return {
    code,
    category: "internal",
    message,
    retryable: false,
  };
}

function modelStreamError(
  code: string,
  detailCode: string,
  retryable = false,
): RuntimeError {
  return {
    code,
    category: "provider",
    message: `Model provider stream failed validation (${detailCode})`,
    retryable,
  };
}

function isModelStreamResumeUnavailable(cause: unknown): cause is Error & { code: string } {
  return cause instanceof Error
    && "code" in cause
    && cause.code === "model_stream_resume_unavailable";
}

function validateRecoverySeed(
  seed: AgentLoopRecoverySeed,
  maxModelRounds: number,
  maxToolCalls: number,
): AgentLoopRecoverySeed {
  if (
    !Number.isSafeInteger(seed.completedRoundCount)
    || seed.completedRoundCount < 0
    || !Number.isSafeInteger(seed.activeRound)
    || seed.activeRound !== seed.completedRoundCount + 1
    || seed.activeRound > maxModelRounds
  ) throw new Error("Agent Loop recovery round identity is invalid");
  if (seed.activeAssistantMessageId.length === 0) {
    throw new Error("Agent Loop recovery Assistant Message identity is unavailable");
  }
  if (seed.priorToolResults.length > maxToolCalls) {
    throw new Error("Agent Loop recovery Tool Result count exceeds the configured limit");
  }
  const toolCallIds = seed.priorToolResults.map((result) => result.toolCallId);
  const observationIds = seed.priorToolResults.map((result) => result.observationId);
  if (
    new Set(toolCallIds).size !== toolCallIds.length
    || new Set(observationIds).size !== observationIds.length
  ) throw new Error("Agent Loop recovery Tool Result identity is ambiguous");
  return Object.freeze({
    completedRoundCount: seed.completedRoundCount,
    activeRound: seed.activeRound,
    activeAssistantMessageId: seed.activeAssistantMessageId,
    priorToolResults: Object.freeze(seed.priorToolResults.map((result) => ({
      ...result,
      content: result.content.map((part) => ({ ...part })),
    }))),
  });
}
