import {
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  type AssistantToolCall,
  type ConversationMessage,
  type ProviderNeutralMessage,
} from "@robothree/contracts";

import type { AgentConversationWriter } from "../ports/agent-conversation-writer.js";
import type { Clock } from "../ports/clock.js";
import type { ConversationPersistence } from "../ports/conversation-persistence.js";
import type { IdGenerator } from "../ports/id-generator.js";
import { sha256CanonicalJson } from "../persistence/digest.js";

export class DurableAgentConversationWriter implements AgentConversationWriter {
  readonly #persistence: ConversationPersistence;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;

  constructor(input: {
    persistence: ConversationPersistence;
    clock: Clock;
    idGenerator: IdGenerator;
  }) {
    this.#persistence = input.persistence;
    this.#clock = input.clock;
    this.#ids = input.idGenerator;
  }

  async appendAssistant(input: {
    messageId?: string;
    sessionId: string;
    taskId?: string;
    text: string;
    toolCalls: readonly AssistantToolCall[];
  }): Promise<ConversationMessage | undefined> {
    if (input.text.length === 0 && input.toolCalls.length === 0) return undefined;
    if (input.toolCalls.length > 0) {
      throw new Error("Durable Agent Tool Calls must use ToolCallBatchCoordinator");
    }
    const taskIds = new Set(input.toolCalls.map((call) => call.taskId));
    if (
      input.taskId !== undefined
      && taskIds.size > 0
      && [...taskIds].some((taskId) => taskId !== input.taskId)
    ) {
      throw new Error("Assistant Tool calls must match the durable Task");
    }
    if (taskIds.size > 1) {
      throw new Error("One durable assistant message cannot span multiple Tasks");
    }
    const message: ProviderNeutralMessage = {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "assistant",
      content: input.text.length === 0 ? [] : [{ type: "text", text: input.text }],
      toolCalls: [...input.toolCalls],
    };
    return this.#append(
      input.sessionId,
      message,
      input.taskId ?? (taskIds.size === 0 ? undefined : [...taskIds][0]),
      input.messageId,
    );
  }

  async #append(
    sessionId: string,
    message: ProviderNeutralMessage,
    taskId?: string,
    messageId?: string,
  ): Promise<ConversationMessage> {
    const head = await this.#persistence.loadSession(sessionId);
    if (head === undefined) throw new Error(`Agent conversation session not found: ${sessionId}`);
    const record: ConversationMessage = {
      envelope: {
        schemaVersion: CONVERSATION_SCHEMA_VERSION,
        messageId: messageId ?? this.#ids.next(),
        sessionId,
        sequence: head.messageSequence + 1,
        messageSchemaVersion: MODEL_PROTOCOL_VERSION,
        messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
        ...(taskId === undefined ? {} : { taskId }),
        createdAt: this.#clock.now(),
      },
      message,
    };
    const committed = await this.#persistence.appendMessage({
      expectedMessageSequence: head.messageSequence,
      message: record,
      updatedAt: record.envelope.createdAt,
    });
    if (!committed.ok) {
      throw new Error(`${committed.error.code}: ${committed.error.message}`);
    }
    return committed.value;
  }
}
