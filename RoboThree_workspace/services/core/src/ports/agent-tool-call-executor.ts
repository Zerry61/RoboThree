import type {
  AssistantToolCall,
  ProviderNeutralMessage,
  RuntimeError,
  UserConfirmationRequest,
} from "@robothree/contracts";

export type AgentToolCallExecutionHooks = Readonly<{
  /**
   * Called only after the exact EffectAttempt is durable and before Backend
   * dispatch. Implementations must not report an uncommitted Effect identity.
   */
  onEffectPrepared(effectAttemptId: string): Promise<void>;
}>;

export type AgentToolCallExecutionResult =
  | Extract<ProviderNeutralMessage, { role: "tool" }>
  | Readonly<{
    status: "waiting_user_confirmation";
    request: UserConfirmationRequest;
  }>
  | Readonly<{
    status: "denied";
    error: RuntimeError;
  }>;

export interface AgentToolCallExecutor {
  execute(
    call: AssistantToolCall,
    signal: AbortSignal,
    hooks?: AgentToolCallExecutionHooks,
  ): Promise<AgentToolCallExecutionResult>;
  loadResult?(
    call: AssistantToolCall,
    effectAttemptId: string,
  ): Promise<Extract<ProviderNeutralMessage, { role: "tool" }> | undefined>;
}
