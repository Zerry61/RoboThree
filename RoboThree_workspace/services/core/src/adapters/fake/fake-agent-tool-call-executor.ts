import {
  MODEL_PROTOCOL_VERSION,
  type AssistantToolCall,
  type ProviderNeutralMessage,
} from "@robothree/contracts";

import type {
  AgentToolCallExecutionHooks,
  AgentToolCallExecutor,
} from "../../ports/agent-tool-call-executor.js";
import { sha256CanonicalJson } from "../../persistence/digest.js";
import { JsonValueSchema } from "@robothree/contracts";

export class FakeAgentToolCallExecutor implements AgentToolCallExecutor {
  readonly calls: AssistantToolCall[] = [];
  readonly #results = new Map<string, Extract<ProviderNeutralMessage, { role: "tool" }>>();

  async execute(
    call: AssistantToolCall,
    signal: AbortSignal,
    hooks?: AgentToolCallExecutionHooks,
  ): Promise<Extract<ProviderNeutralMessage, { role: "tool" }>> {
    if (signal.aborted) throw signal.reason ?? new Error("Tool execution cancelled");
    this.calls.push(structuredClone(call));
    await hooks?.onEffectPrepared(call.actionId);
    const observation = {
      observationId: call.toolCallId,
      actionId: call.actionId,
      outcome: "succeeded",
      result: call.arguments,
    };
    const result: Extract<ProviderNeutralMessage, { role: "tool" }> = {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "tool",
      toolCallId: call.toolCallId,
      taskId: call.taskId,
      actionId: call.actionId,
      observationId: call.toolCallId,
      outcome: "succeeded",
      resultDigest: sha256CanonicalJson(JsonValueSchema.parse(observation)),
      content: [{ type: "text", text: JSON.stringify(call.arguments) }],
    };
    this.#results.set(call.actionId, structuredClone(result));
    return result;
  }

  async loadResult(
    call: AssistantToolCall,
    effectAttemptId: string,
  ): Promise<Extract<ProviderNeutralMessage, { role: "tool" }> | undefined> {
    if (effectAttemptId !== call.actionId) return undefined;
    const result = this.#results.get(call.actionId);
    return result === undefined ? undefined : structuredClone(result);
  }
}
