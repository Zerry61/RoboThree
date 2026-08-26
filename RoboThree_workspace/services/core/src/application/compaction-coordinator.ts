import {
  COMPACTION_SCHEMA_VERSION,
  CONVERSATION_SCHEMA_VERSION,
  CompactionRecordSchema,
  JsonValueSchema,
} from "@robothree/contracts";
import type {
  CompactionFailureReason,
  CompactionJob,
  CompactionRecord,
  ConversationMessage,
  SessionCommand,
  SessionCommandReceipt,
  SessionEvent,
  SessionHead,
} from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type {
  CommitCompactionInput,
  ConversationPersistence,
  RequestCompactionInput,
  SessionOutboxRecord,
  TerminateCompactionInput,
} from "../ports/conversation-persistence.js";
import type { CompactionSummarizer } from "../ports/compaction-summarizer.js";
import type { IdGenerator } from "../ports/id-generator.js";
import { digestConversationRange } from "../persistence/conversation-validation.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  createCompactionExecutionBinding,
  createCompactionExecutionBindingV1Alpha2,
  type CompactionExecutionBindingMaterial,
  type CompactionExecutionBindingV1Alpha2Material,
  type ReadableCompactionExecutionBinding,
} from "../persistence/compaction-execution-binding.js";
import { stableCompactionModelRequestId } from "./model-backed-compaction-summarizer.js";

export type CompactionExecutionBindingSeed =
  | Omit<
    CompactionExecutionBindingMaterial,
    "schemaVersion" | "compactionJobId" | "sessionId" | "createdAt"
  >
  | Omit<
    CompactionExecutionBindingV1Alpha2Material,
    "schemaVersion" | "compactionJobId" | "sessionId" | "createdAt"
  >;

export type CompactionRunResult =
  | Readonly<{ status: "completed"; record: CompactionRecord; replayed: boolean }>
  | Readonly<{ status: "failed" | "stale"; job: CompactionJob; replayed: boolean }>
  | Readonly<{ status: "rejected"; errorCode: string }>;

export type CompactionCoordinatorFaultPoint =
  "compaction.summary_obtained_before_commit";

export interface CompactionSummarizerResolver {
  resolve(input: Readonly<{
    job: Extract<CompactionJob, { status: "pending" }>;
    binding: ReadableCompactionExecutionBinding;
  }>): Promise<CompactionSummarizer>;
}

export class CompactionCoordinator {
  readonly #persistence: ConversationPersistence;
  readonly #summarizer: CompactionSummarizer | undefined;
  readonly #summarizerResolver: CompactionSummarizerResolver | undefined;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #faultInjector:
    | ((point: CompactionCoordinatorFaultPoint) => void)
    | undefined;

  constructor(input: {
    persistence: ConversationPersistence;
    summarizer?: CompactionSummarizer;
    summarizerResolver?: CompactionSummarizerResolver;
    clock: Clock;
    idGenerator: IdGenerator;
    faultInjector?: (point: CompactionCoordinatorFaultPoint) => void;
  }) {
    this.#persistence = input.persistence;
    this.#summarizer = input.summarizer;
    this.#summarizerResolver = input.summarizerResolver;
    this.#clock = input.clock;
    this.#ids = input.idGenerator;
    this.#faultInjector = input.faultInjector;
    if ((this.#summarizer === undefined) === (this.#summarizerResolver === undefined)) {
      throw new Error("CompactionCoordinator requires exactly one summarizer source");
    }
  }

  async compact(input: {
    sessionId: string;
    sourceStartSequence: number;
    sourceEndSequence: number;
    executionBinding: CompactionExecutionBindingSeed;
    signal?: AbortSignal;
  }): Promise<CompactionRunResult> {
    const head = await this.#requireHead(input.sessionId);
    const source = await this.#loadExactRange(
      input.sessionId,
      input.sourceStartSequence,
      input.sourceEndSequence,
    );
    const requested = this.#requestInput(head, source, input.executionBinding);
    const result = await this.#persistence.requestCompaction(requested);
    if (!result.ok) return { status: "rejected", errorCode: result.error.code };
    return this.#summarizeAndCommit(
      result.value as Extract<CompactionJob, { status: "pending" }>,
      input.signal ?? new AbortController().signal,
    );
  }

  async recoverPending(
    signal: AbortSignal = new AbortController().signal,
  ): Promise<readonly CompactionRunResult[]> {
    const results: CompactionRunResult[] = [];
    for (const job of await this.#persistence.listPendingCompactionJobs()) {
      if (signal.aborted) break;
      results.push(await this.#summarizeAndCommit(
        job as Extract<CompactionJob, { status: "pending" }>,
        signal,
      ));
    }
    return results;
  }

  async recoverSessionPending(
    sessionId: string,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<CompactionRunResult | undefined> {
    const pending = (await this.#persistence.listPendingCompactionJobs())
      .filter((job) => job.sessionId === sessionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    if (pending.length > 1) throw new Error("Session has more than one pending CompactionJob");
    return pending[0] === undefined
      ? undefined
      : this.#summarizeAndCommit(
        pending[0] as Extract<CompactionJob, { status: "pending" }>,
        signal,
      );
  }

  async #summarizeAndCommit(
    job: Extract<CompactionJob, { status: "pending" }>,
    signal: AbortSignal,
  ): Promise<CompactionRunResult> {
    const binding = await this.#persistence.loadCompactionExecutionBinding(job.compactionJobId);
    if (binding === undefined) {
      return { status: "rejected", errorCode: "persistence.compaction_execution_binding_missing" };
    }
    const source = await this.#loadExactRange(
      job.sessionId,
      job.sourceStartSequence,
      job.sourceEndSequence,
    );
    if (digestConversationRange(source) !== job.sourceDigest) {
      return this.#terminate(job, "source_changed");
    }
    let summary;
    try {
      const base = job.baseActiveCompactionId === undefined
        ? undefined
        : await this.#persistence.loadCompactionRecord(job.baseActiveCompactionId);
      if (job.baseActiveCompactionId !== undefined && base === undefined) {
        return this.#terminate(job, "base_view_changed");
      }
      const rawExtensionStart = base?.sourceEndSequence === undefined
        ? job.sourceStartSequence
        : base.sourceEndSequence + 1;
      const rawExtension = source.filter((message) =>
        message.envelope.sequence >= rawExtensionStart);
      if (
        rawExtension.length === 0
        || rawExtension[0]!.envelope.sequence !== rawExtensionStart
        || rawExtension.at(-1)!.envelope.sequence !== job.sourceEndSequence
      ) return this.#terminate(job, "source_changed");
      const summarizer = this.#summarizer ?? await this.#summarizerResolver!.resolve({ job, binding });
      summary = await summarizer.summarize({
        job,
        ...(base === undefined
          ? {}
          : {
            baseSummary: {
              compactionId: base.compactionId,
              sourceEndSequence: base.sourceEndSequence,
              sourceDigest: base.sourceDigest,
              summary: base.summary,
              summaryDigest: sha256CanonicalJson(JsonValueSchema.parse(base.summary)),
            },
          }),
        rawExtension,
        fullSourceRangeEvidence: {
          sourceStartSequence: job.sourceStartSequence,
          sourceEndSequence: job.sourceEndSequence,
          sourceDigest: job.sourceDigest,
        },
      }, stableCompactionModelRequestId(job.compactionJobId, binding.summarizerPromptRevision), signal);
    } catch (error) {
      const errorCode = error instanceof Error && "code" in error
        ? (error as Error & { code?: unknown }).code
        : undefined;
      const outputStarted = error instanceof Error && "outputStarted" in error
        ? (error as Error & { outputStarted?: unknown }).outputStarted
        : undefined;
      if (
        !signal.aborted
        && errorCode === "model_stream_resume_unavailable"
        && outputStarted === false
      ) throw error;
      return this.#terminate(
        job,
        signal.aborted
          ? "cancelled"
          : errorCode === "model_stream_resume_unavailable"
            ? "recovery_exhausted"
            : "summary_generation_failed",
      );
    }
    this.#faultInjector?.("compaction.summary_obtained_before_commit");
    const now = this.#clock.now();
    const { invocationCommit, ...recordSummary } = summary;
    const recordResult = CompactionRecordSchema.safeParse({
      schemaVersion: COMPACTION_SCHEMA_VERSION,
      compactionId: job.compactionId,
      compactionJobId: job.compactionJobId,
      sessionId: job.sessionId,
      sourceStartSequence: job.sourceStartSequence,
      sourceEndSequence: job.sourceEndSequence,
      sourceDigest: job.sourceDigest,
      ...(job.baseActiveCompactionId === undefined
        ? {}
        : { baseActiveCompactionId: job.baseActiveCompactionId }),
      baseContextRevision: job.baseContextRevision,
      ...recordSummary,
      createdAt: now,
    });
    if (!recordResult.success) return this.#terminate(job, "summary_invalid");
    const head = await this.#requireHead(job.sessionId);
    const input = this.#commitInput(head, job, recordResult.data, now, invocationCommit);
    const committed = await this.#persistence.commitCompaction(input);
    if (committed.ok) {
      return { status: "completed", record: committed.value, replayed: committed.replayed };
    }
    if (
      committed.error.code === "persistence.compaction_stale"
      || committed.error.code === "persistence.compaction_source_changed"
    ) return this.#terminate(job, "base_view_changed");
    return { status: "rejected", errorCode: committed.error.code };
  }

  async #terminate(
    job: Extract<CompactionJob, { status: "pending" }>,
    reason: CompactionFailureReason,
  ): Promise<CompactionRunResult> {
    const head = await this.#requireHead(job.sessionId);
    const now = this.#clock.now();
    const stale = reason === "base_view_changed" || reason === "source_changed";
    const commandId = this.#ids.next();
    const eventId = this.#ids.next();
    const command: Extract<SessionCommand, { type: "fail_compaction" | "mark_compaction_stale" }> =
      stale
        ? {
          schemaVersion: CONVERSATION_SCHEMA_VERSION,
          commandId,
          sessionId: job.sessionId,
          issuedAt: now,
          type: "mark_compaction_stale",
          compactionJobId: job.compactionJobId,
          observedContextRevision: head.contextRevision,
          ...(head.activeCompactionId === undefined
            ? {}
            : { observedActiveCompactionId: head.activeCompactionId }),
        }
        : {
          schemaVersion: CONVERSATION_SCHEMA_VERSION,
          commandId,
          sessionId: job.sessionId,
          issuedAt: now,
          type: "fail_compaction",
          compactionJobId: job.compactionJobId,
          failureReason: reason,
        };
    const terminalJob: Extract<CompactionJob, { status: "failed" | "stale" }> = stale
      ? {
        ...job,
        status: "stale",
        terminalCommandId: commandId,
        observedContextRevision: head.contextRevision,
        ...(head.activeCompactionId === undefined
          ? {}
          : { observedActiveCompactionId: head.activeCompactionId }),
        staleAt: now,
        updatedAt: now,
      }
      : {
        ...job,
        status: "failed",
        terminalCommandId: commandId,
        failureReason: reason,
        failedAt: now,
        updatedAt: now,
      };
    const event: Extract<SessionEvent, {
      type: "context.compaction_failed" | "context.compaction_stale";
    }> = stale
      ? {
        schemaVersion: CONVERSATION_SCHEMA_VERSION,
        eventId,
        sessionId: job.sessionId,
        sequence: head.sessionEventSequence + 1,
        occurredAt: now,
        causationId: commandId,
        correlationId: job.sessionId,
        type: "context.compaction_stale",
        payload: {
          compactionJobId: job.compactionJobId,
          observedContextRevision: head.contextRevision,
          ...(head.activeCompactionId === undefined
            ? {}
            : { observedActiveCompactionId: head.activeCompactionId }),
        },
      }
      : {
        schemaVersion: CONVERSATION_SCHEMA_VERSION,
        eventId,
        sessionId: job.sessionId,
        sequence: head.sessionEventSequence + 1,
        occurredAt: now,
        causationId: commandId,
        correlationId: job.sessionId,
        type: "context.compaction_failed",
        payload: { compactionJobId: job.compactionJobId, failureReason: reason },
      };
    const receipt = acceptedReceipt(command, event, job, head.contextRevision, now);
    const terminated = await this.#persistence.terminateCompaction({
      command,
      job: terminalJob,
      event,
      receipt,
      outbox: [outbox(this.#ids.next(), event, now)],
    } as TerminateCompactionInput);
    return terminated.ok
      ? { status: stale ? "stale" : "failed", job: terminated.value, replayed: terminated.replayed }
      : { status: "rejected", errorCode: terminated.error.code };
  }

  #requestInput(
    head: SessionHead,
    source: readonly ConversationMessage[],
    executionBindingSeed: CompactionExecutionBindingSeed,
  ): RequestCompactionInput {
    const now = this.#clock.now();
    const commandId = this.#ids.next();
    const eventId = this.#ids.next();
    const compactionJobId = this.#ids.next();
    const compactionId = this.#ids.next();
    const sourceDigest = digestConversationRange(source);
    const command: Extract<SessionCommand, { type: "request_compaction" }> = {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      commandId,
      sessionId: head.sessionId,
      issuedAt: now,
      type: "request_compaction",
      compactionSchemaVersion: COMPACTION_SCHEMA_VERSION,
      compactionJobId,
      compactionId,
      sourceStartSequence: source[0]!.envelope.sequence,
      sourceEndSequence: source.at(-1)!.envelope.sequence,
      sourceDigest,
      ...(head.activeCompactionId === undefined
        ? {}
        : { baseActiveCompactionId: head.activeCompactionId }),
      baseContextRevision: head.contextRevision,
    };
    const job: Extract<CompactionJob, { status: "pending" }> = {
      schemaVersion: COMPACTION_SCHEMA_VERSION,
      compactionJobId,
      compactionId,
      sessionId: head.sessionId,
      requestCommandId: commandId,
      sourceStartSequence: command.sourceStartSequence,
      sourceEndSequence: command.sourceEndSequence,
      sourceDigest,
      ...(head.activeCompactionId === undefined
        ? {}
        : { baseActiveCompactionId: head.activeCompactionId }),
      baseContextRevision: head.contextRevision,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    const executionBinding = "modelRequestProtocolVersion" in executionBindingSeed
      ? createCompactionExecutionBindingV1Alpha2({
        schemaVersion: "v1alpha2",
        compactionJobId,
        sessionId: head.sessionId,
        ...executionBindingSeed,
        createdAt: now,
      })
      : createCompactionExecutionBinding({
        schemaVersion: "v1alpha1",
        compactionJobId,
        sessionId: head.sessionId,
        ...executionBindingSeed,
        createdAt: now,
      });
    const event: Extract<SessionEvent, { type: "context.compaction_requested" }> = {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      eventId,
      sessionId: head.sessionId,
      sequence: head.sessionEventSequence + 1,
      occurredAt: now,
      causationId: commandId,
      correlationId: head.sessionId,
      type: "context.compaction_requested",
      payload: {
        compactionJobId,
        compactionId,
        sourceStartSequence: command.sourceStartSequence,
        sourceEndSequence: command.sourceEndSequence,
        sourceDigest,
        ...(head.activeCompactionId === undefined
          ? {}
          : { baseActiveCompactionId: head.activeCompactionId }),
        baseContextRevision: head.contextRevision,
      },
    };
    return {
      command,
      job,
      executionBinding,
      event,
      receipt: acceptedReceipt(command, event, job, head.contextRevision, now),
      outbox: [outbox(this.#ids.next(), event, now)],
    };
  }

  #commitInput(
    head: SessionHead,
    job: Extract<CompactionJob, { status: "pending" }>,
    record: CompactionRecord,
    now: string,
    summaryInvocationCommit?: NonNullable<Awaited<ReturnType<CompactionSummarizer["summarize"]>>["invocationCommit"]>,
  ): CommitCompactionInput {
    const commandId = this.#ids.next();
    const eventId = this.#ids.next();
    const command: Extract<SessionCommand, { type: "commit_compaction" }> = {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      commandId,
      sessionId: job.sessionId,
      issuedAt: now,
      type: "commit_compaction",
      compactionJobId: job.compactionJobId,
      compactionId: job.compactionId,
      record,
    };
    const event: Extract<SessionEvent, { type: "context.compaction_committed" }> = {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      eventId,
      sessionId: job.sessionId,
      sequence: head.sessionEventSequence + 1,
      occurredAt: now,
      causationId: commandId,
      correlationId: job.sessionId,
      type: "context.compaction_committed",
      payload: {
        compactionJobId: job.compactionJobId,
        compactionId: job.compactionId,
        previousContextRevision: job.baseContextRevision,
        contextRevision: job.baseContextRevision + 1,
        sourceEndSequence: job.sourceEndSequence,
      },
    };
    return {
      command,
      event,
      receipt: acceptedReceipt(command, event, job, job.baseContextRevision + 1, now),
      outbox: [outbox(this.#ids.next(), event, now)],
      ...(summaryInvocationCommit === undefined ? {} : { summaryInvocationCommit }),
    };
  }

  async #requireHead(sessionId: string): Promise<SessionHead> {
    const head = await this.#persistence.loadSession(sessionId);
    if (head === undefined) throw new Error(`Compaction session not found: ${sessionId}`);
    return head;
  }

  async #loadExactRange(
    sessionId: string,
    start: number,
    end: number,
  ): Promise<readonly ConversationMessage[]> {
    const messages = await this.#persistence.loadMessageRange(sessionId, start, end);
    if (
      messages.length !== end - start + 1
      || messages.some((message, index) => message.envelope.sequence !== start + index)
    ) throw new Error("Compaction source range is incomplete or non-contiguous");
    return messages;
  }
}

function acceptedReceipt(
  command: SessionCommand,
  event: SessionEvent,
  job: CompactionJob,
  contextRevision: number,
  now: string,
): Extract<SessionCommandReceipt, { outcome: "accepted" }> {
  return {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    commandId: command.commandId,
    sessionId: command.sessionId,
    commandType: command.type,
    commandDigest: sha256CanonicalJson(JsonValueSchema.parse(command)),
    receivedAt: now,
    outcome: "accepted",
    contextRevision,
    sessionEventId: event.eventId,
    compactionJobId: job.compactionJobId,
    ...(command.type === "commit_compaction" ? { compactionId: job.compactionId } : {}),
  };
}

function outbox(id: string, event: SessionEvent, now: string): SessionOutboxRecord {
  return {
    outboxId: id,
    eventId: event.eventId,
    sessionId: event.sessionId,
    destination: "session.events",
    payload: JsonValueSchema.parse(event) as SessionOutboxRecord["payload"],
    attemptCount: 0,
    createdAt: now,
  };
}
