import type {
  CompactionRecord,
  ConversationMessage,
} from "@robothree/contracts";

import type { ConversationPersistence } from "../ports/conversation-persistence.js";

export type CompactedContextView = Readonly<{
  activeCompaction?: CompactionRecord;
  summary?: string;
  rawTail: readonly ConversationMessage[];
}>;

export class CompactedContextViewBuilder {
  readonly #persistence: ConversationPersistence;

  constructor(persistence: ConversationPersistence) {
    this.#persistence = persistence;
  }

  async build(sessionId: string): Promise<CompactedContextView> {
    const head = await this.#persistence.loadSession(sessionId);
    if (head === undefined) throw new Error(`Context view session not found: ${sessionId}`);
    const active = head.activeCompactionId === undefined
      ? undefined
      : await this.#persistence.loadCompactionRecord(head.activeCompactionId);
    if (head.activeCompactionId !== undefined && active === undefined) {
      throw new Error("SessionHead references a missing CompactionRecord");
    }
    const tailStart = active === undefined ? 1 : active.sourceEndSequence + 1;
    const tail = tailStart > head.messageSequence
      ? []
      : await this.#persistence.loadMessageRange(sessionId, tailStart, head.messageSequence);
    if (tail.length !== Math.max(0, head.messageSequence - tailStart + 1)) {
      throw new Error("Raw conversation tail is incomplete");
    }
    if (active === undefined) {
      return Object.freeze({ rawTail: Object.freeze([...tail]) });
    }
    return Object.freeze({
      activeCompaction: active,
      summary: active.summary,
      rawTail: Object.freeze([...tail]),
    });
  }
}
