import {
  ConversationSnapshotSchema,
  MessageProjectionSchema,
} from "@robothree/contracts";
import type {
  ConversationMessage,
  ConversationSnapshot,
  MessageProjection,
  RuntimeError,
  TaskSummaryProjection,
} from "@robothree/contracts";

import type { ConversationPersistence } from "../ports/conversation-persistence.js";
import type { DesktopSessionMetadataPersistence } from "../ports/desktop-foundation-persistence.js";
import { desktopFoundationError } from "./desktop-foundation-errors.js";

export interface DesktopTaskSummaryReader {
  listActiveTaskSummaries(
    internalSessionId: string,
  ): Promise<readonly TaskSummaryProjection[]>;
}

export class EmptyDesktopTaskSummaryReader implements DesktopTaskSummaryReader {
  async listActiveTaskSummaries(): Promise<readonly TaskSummaryProjection[]> {
    return [];
  }
}

export class DesktopConversationProjectionService {
  readonly #conversation: ConversationPersistence;
  readonly #metadata: DesktopSessionMetadataPersistence;
  readonly #tasks: DesktopTaskSummaryReader;

  constructor(input: {
    conversation: ConversationPersistence;
    metadata: DesktopSessionMetadataPersistence;
    tasks?: DesktopTaskSummaryReader;
  }) {
    this.#conversation = input.conversation;
    this.#metadata = input.metadata;
    this.#tasks = input.tasks ?? new EmptyDesktopTaskSummaryReader();
  }

  /**
   * DCF-1.1A projects durable Session facts. The opaque durable cursor is
   * supplied by the future DCF-1.1C delivery owner and is not synthesized here.
   */
  async loadSnapshot(input: {
    desktopSessionId: string;
    latestDurableCursor: string;
    beforeSequence?: number;
    limit?: number;
  }): Promise<
    | { ok: true; value: ConversationSnapshot }
    | { ok: false; error: RuntimeError }
  > {
    const metadata = await this.#metadata.loadDesktopSession(
      input.desktopSessionId,
    );
    if (metadata === undefined || metadata.summary.tombstoned) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.session_not_found",
          "active session does not exist",
        ),
      };
    }
    const head = await this.#conversation.loadSession(metadata.internalSessionId);
    if (head === undefined) {
      return {
        ok: false,
        error: desktopFoundationError(
          "desktop.session_integrity_failure",
          "session metadata references a missing SessionHead",
        ),
      };
    }
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
    const end = Math.min(input.beforeSequence ?? head.messageSequence + 1, head.messageSequence + 1) - 1;
    const start = Math.max(1, end - limit + 1);
    const messages = end < start
      ? []
      : await this.#conversation.loadMessageRange(
        metadata.internalSessionId,
        start,
        end,
      );
    const value = ConversationSnapshotSchema.parse({
      sessionId: metadata.summary.sessionId,
      sessionRevision: metadata.summary.revision,
      messages: messages.map((message) =>
        projectMessage(message, metadata.summary.sessionId)),
      activeTaskSummaries: await this.#tasks.listActiveTaskSummaries(
        metadata.internalSessionId,
      ),
      latestDurableCursor: input.latestDurableCursor,
      hasMoreBefore: start > 1,
    });
    return { ok: true, value };
  }
}

function projectMessage(
  record: ConversationMessage,
  desktopSessionId: string,
): MessageProjection {
  const rawContent = record.message.content.map((part) => part.text).join("\n");
  const content = rawContent.length > 0
    ? rawContent
    : record.message.role === "assistant" && record.message.toolCalls.length > 0
      ? toolCallSummary(record.message.toolCalls.length)
      : rawContent;
  const status = record.message.role === "tool"
    && record.message.outcome !== "succeeded"
    ? "failed"
    : "completed";
  return MessageProjectionSchema.parse({
    messageId: `message:${record.envelope.messageId}`,
    sessionId: desktopSessionId,
    sequence: record.envelope.sequence,
    role: record.message.role,
    status,
    content,
    ...(record.envelope.taskId === undefined
      ? {}
      : { taskId: `task:${record.envelope.taskId}` }),
    createdAt: record.envelope.createdAt,
  });
}

function toolCallSummary(count: number): string {
  return count === 1
    ? "Using 1 Tool."
    : `Using ${count} Tools.`;
}
