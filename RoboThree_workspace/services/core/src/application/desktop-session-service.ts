import {
  CONVERSATION_SCHEMA_VERSION,
  CreateSessionCommandSchema,
  DeleteSessionCommandSchema,
  JsonValueSchema,
  RenameSessionCommandSchema,
} from "@robothree/contracts";
import type {
  CreateSessionCommand,
  DeleteSessionCommand,
  RenameSessionCommand,
  SessionHead,
  SessionSummary,
} from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type { ConversationPersistence } from "../ports/conversation-persistence.js";
import type {
  DesktopFoundationWriteResult,
  DesktopSessionMetadataPersistence,
} from "../ports/desktop-foundation-persistence.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import { desktopFoundationError } from "./desktop-foundation-errors.js";

export type DesktopSessionServiceFaultPoint = "session.create.after_head";
export type DesktopSessionServiceFaultInjector = (
  point: DesktopSessionServiceFaultPoint,
) => void;

export class DesktopSessionService {
  readonly #clock: Clock;
  readonly #conversation: ConversationPersistence;
  readonly #metadata: DesktopSessionMetadataPersistence;
  readonly #faultInjector: DesktopSessionServiceFaultInjector | undefined;

  constructor(input: {
    clock: Clock;
    conversation: ConversationPersistence;
    metadata: DesktopSessionMetadataPersistence;
    faultInjector?: DesktopSessionServiceFaultInjector;
  }) {
    this.#clock = input.clock;
    this.#conversation = input.conversation;
    this.#metadata = input.metadata;
    this.#faultInjector = input.faultInjector;
  }

  async create(
    input: CreateSessionCommand,
  ): Promise<DesktopFoundationWriteResult<SessionSummary>> {
    const parsed = CreateSessionCommandSchema.safeParse(input);
    if (!parsed.success) return invalidCommand(parsed.error.issues[0]?.message);
    const command = parsed.data;
    const requestDigest = digestCommand(command);
    const replay = await this.#metadata.findSessionMetadataCommandReceipt(
      command.commandId,
    );
    if (replay !== undefined) {
      if (
        replay.commandType !== command.type
        || replay.requestDigest !== requestDigest
        || !("summary" in replay)
      ) return idempotencyConflict();
      return { ok: true, replayed: true, value: replay.summary };
    }

    const now = this.#clock.now();
    const prepared = await this.#metadata.prepareDesktopSessionCreation({
      commandId: command.commandId,
      requestDigest,
      internalSessionId: command.commandId,
      desktopSessionId: `session:${command.commandId}`,
      preparedAt: now,
    });
    if (!prepared.ok) return prepared;
    const intent = prepared.value;
    const existingHead = await this.#conversation.loadSession(command.commandId);
    const createdAt = intent.preparedAt;
    if (existingHead === undefined) {
      const head: SessionHead = {
        schemaVersion: CONVERSATION_SCHEMA_VERSION,
        sessionId: command.commandId,
        messageSequence: 0,
        sessionEventSequence: 0,
        contextRevision: 0,
        createdAt,
        updatedAt: createdAt,
      };
      const headResult = await this.#conversation.createSession(head);
      if (!headResult.ok) return headResult;
    } else {
      if (
        existingHead.messageSequence !== 0
        || existingHead.sessionEventSequence !== 0
        || existingHead.contextRevision !== 0
        || existingHead.activeCompactionId !== undefined
      ) {
        return {
          ok: false,
          error: desktopFoundationError(
            "desktop.session_recovery_conflict",
            "orphan SessionHead changed before Desktop metadata recovery",
          ),
        };
      }
      if (existingHead.createdAt !== createdAt) {
        return {
          ok: false,
          error: desktopFoundationError(
            "desktop.session_recovery_conflict",
            "SessionHead creation time does not match the durable create intent",
          ),
        };
      }
    }
    this.#faultInjector?.("session.create.after_head");

    return this.#metadata.commitDesktopSessionCreation({
      commandId: command.commandId,
      requestDigest,
      committedAt: now,
      record: {
        internalSessionId: intent.internalSessionId,
        summary: {
          sessionId: intent.desktopSessionId,
          revision: 0,
          title: command.title ?? "新会话",
          tombstoned: false,
          createdAt,
          updatedAt: createdAt,
        },
      },
    });
  }

  async rename(
    input: RenameSessionCommand,
  ): Promise<DesktopFoundationWriteResult<SessionSummary>> {
    const parsed = RenameSessionCommandSchema.safeParse(input);
    if (!parsed.success) return invalidCommand(parsed.error.issues[0]?.message);
    const command = parsed.data;
    return this.#metadata.commitDesktopSessionRename({
      desktopSessionId: command.sessionId,
      title: command.title,
      expectedRevision: command.expectedRevision,
      commandId: command.commandId,
      requestDigest: digestCommand(command),
      committedAt: this.#clock.now(),
    });
  }

  async delete(
    input: DeleteSessionCommand,
  ): Promise<DesktopFoundationWriteResult<SessionSummary>> {
    const parsed = DeleteSessionCommandSchema.safeParse(input);
    if (!parsed.success) return invalidCommand(parsed.error.issues[0]?.message);
    const command = parsed.data;
    return this.#metadata.commitDesktopSessionTombstone({
      desktopSessionId: command.sessionId,
      expectedRevision: command.expectedRevision,
      commandId: command.commandId,
      requestDigest: digestCommand(command),
      committedAt: this.#clock.now(),
    });
  }

  async load(desktopSessionId: string): Promise<SessionSummary | undefined> {
    return (await this.#metadata.loadDesktopSession(desktopSessionId))?.summary;
  }

  async list(includeTombstoned = false): Promise<readonly SessionSummary[]> {
    return (await this.#metadata.listDesktopSessions(includeTombstoned))
      .map((record) => record.summary);
  }
}

function digestCommand(
  command: CreateSessionCommand | RenameSessionCommand | DeleteSessionCommand,
): string {
  return sha256CanonicalJson(JsonValueSchema.parse(command));
}

function invalidCommand(message?: string): DesktopFoundationWriteResult<never> {
  return {
    ok: false,
    error: desktopFoundationError(
      "desktop.invalid_command",
      message ?? "invalid Desktop command",
      "validation",
    ),
  };
}

function idempotencyConflict(): DesktopFoundationWriteResult<never> {
  return {
    ok: false,
    error: desktopFoundationError(
      "desktop.command_idempotency_conflict",
      "commandId was already used with another command digest",
    ),
  };
}
