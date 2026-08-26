import type {
  AssistantToolCall,
  ConversationMessage,
} from "@robothree/contracts";

export interface AgentConversationWriter {
  appendAssistant(input: {
    messageId?: string;
    sessionId: string;
    taskId?: string;
    text: string;
    toolCalls: readonly AssistantToolCall[];
  }): Promise<ConversationMessage | undefined>;
}
