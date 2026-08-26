import {
  JsonValueSchema,
  type AssistantToolCall,
  type ProviderNeutralMessage,
} from "@robothree/contracts";

import type {
  AgentToolCallExecutionHooks,
  AgentToolCallExecutionResult,
  AgentToolCallExecutor,
} from "../ports/agent-tool-call-executor.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type {
  ToolExecutionInput,
  ToolExecutionService,
} from "./tool-execution-service.js";
import { toolObservationMessage } from "./document-tool-context.js";

export type AgentToolExecutionInputFactory = (
  call: AssistantToolCall,
  signal: AbortSignal,
) => Promise<ToolExecutionInput> | ToolExecutionInput;

export type AgentToolExecutionInput = ToolExecutionInput & Readonly<{
  /**
   * Model-visible Tool arguments before Core-internal execution binding. When
   * omitted, the exact execution Action payload remains the model argument.
   */
  modelArguments?: unknown;
}>;

export class ToolExecutionAgentBridge implements AgentToolCallExecutor {
  readonly #service: ToolExecutionService;
  readonly #persistence: TaskPersistence;
  readonly #buildExecution: AgentToolExecutionInputFactory;

  constructor(input: {
    service: ToolExecutionService;
    persistence: TaskPersistence;
    buildExecution: AgentToolExecutionInputFactory;
  }) {
    this.#service = input.service;
    this.#persistence = input.persistence;
    this.#buildExecution = input.buildExecution;
  }

  async execute(
    call: AssistantToolCall,
    signal: AbortSignal,
    hooks?: AgentToolCallExecutionHooks,
  ): Promise<AgentToolCallExecutionResult> {
    const execution = this.#withHooks(
      await this.#validatedExecution(call, signal),
      hooks,
    );
    const outcome = await this.#service.execute(execution);
    if ("status" in outcome && outcome.status === "waiting_user_confirmation") {
      return outcome;
    }
    if ("status" in outcome && (
      outcome.status === "denied"
      || outcome.status === "not_admitted"
    )) {
      return outcome.status === "denied"
        ? { status: "denied", error: outcome.error }
        : Promise.reject(new Error(`${outcome.error.code}: ${outcome.error.message}`));
    }
    return this.#requiredResult(call);
  }

  async loadResult(
    call: AssistantToolCall,
    effectAttemptId: string,
  ): Promise<Extract<ProviderNeutralMessage, { role: "tool" }> | undefined> {
    const effect = await this.#persistence.loadEffectAttempt(effectAttemptId);
    if (
      effect === undefined
      || effect.taskId !== call.taskId
      || effect.actionId !== call.actionId
    ) return undefined;
    return this.#loadResult(call, false);
  }

  async submitDecision(input: {
    call: AssistantToolCall;
    signal?: AbortSignal;
    confirmationId: string;
    decisionId?: string;
    decision: "confirmed" | "rejected";
    decidedByUserId: string;
    decidedAt?: string;
  }): Promise<AgentToolCallExecutionResult> {
    const signal = input.signal ?? new AbortController().signal;
    const execution = await this.#validatedExecution(input.call, signal);
    const outcome = await this.#service.submitDecision({
      execution,
      confirmationId: input.confirmationId,
      ...(input.decisionId === undefined ? {} : { decisionId: input.decisionId }),
      decision: input.decision,
      decidedByUserId: input.decidedByUserId,
      ...(input.decidedAt === undefined ? {} : { decidedAt: input.decidedAt }),
    });
    if ("status" in outcome && outcome.status === "waiting_user_confirmation") {
      return outcome;
    }
    if ("status" in outcome && outcome.status === "denied") {
      throw new Error(`${outcome.error.code}: ${outcome.error.message}`);
    }
    if ("status" in outcome && outcome.status === "user_rejected") {
      return this.#requiredResult(input.call);
    }
    return this.#requiredResult(input.call);
  }

  async #validatedExecution(
    call: AssistantToolCall,
    signal: AbortSignal,
  ): Promise<AgentToolExecutionInput> {
    const execution = await this.#buildExecution(call, signal) as AgentToolExecutionInput;
    const modelArguments = execution.modelArguments ?? execution.action.payload;
    if (
      execution.taskId !== call.taskId
      || execution.action.actionId !== call.actionId
      || execution.capabilityId !== call.capabilityId
      || sha256CanonicalJson(JsonValueSchema.parse(modelArguments))
        !== sha256CanonicalJson(JsonValueSchema.parse(call.arguments))
    ) throw new Error("Agent Tool execution input does not match the model Tool Call");
    return execution;
  }

  #withHooks(
    execution: ToolExecutionInput,
    hooks: AgentToolCallExecutionHooks | undefined,
  ): ToolExecutionInput {
    if (hooks === undefined) return execution;
    const existing = execution.onEffectPrepared;
    return {
      ...execution,
      onEffectPrepared: async (attempt) => {
        await existing?.(attempt);
        await hooks.onEffectPrepared(attempt.effectAttemptId);
      },
    };
  }

  async #loadResult(
    call: AssistantToolCall,
    required = true,
  ): Promise<Extract<ProviderNeutralMessage, { role: "tool" }> | undefined> {
    const task = await this.#persistence.loadTask(call.taskId);
    const observation = task?.checkpoint.state.runs
      .flatMap((run) => run.steps)
      .find((step) => step.action.actionId === call.actionId)
      ?.observation;
    if (observation === undefined) {
      if (!required) return undefined;
      throw new Error("Tool execution completed without a durable Observation");
    }
    return toolObservationMessage(call, observation);
  }

  async #requiredResult(
    call: AssistantToolCall,
  ): Promise<Extract<ProviderNeutralMessage, { role: "tool" }>> {
    const result = await this.#loadResult(call);
    if (result === undefined) {
      throw new Error("Tool execution completed without a durable Observation");
    }
    return result;
  }
}
