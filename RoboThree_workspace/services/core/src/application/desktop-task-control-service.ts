import {
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  TaskControlCommandSchema,
  TaskControlReceiptSchema,
} from "@robothree/contracts";
import type {
  PersistedUserConfirmation,
  RuntimeError,
  TaskCommand,
  TaskControlCommand,
  TaskControlReceipt,
  TaskRunState,
} from "@robothree/contracts";
import { createHash } from "node:crypto";

import type { Clock } from "../ports/clock.js";
import type { ConversationPersistence } from "../ports/conversation-persistence.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import { desktopFoundationError } from "./desktop-foundation-errors.js";
import type {
  DurableTaskCommandResult,
  DurableTaskRuntime,
} from "./durable-task-runtime.js";
import type { UserConfirmationCoordinator } from "./user-confirmation-coordinator.js";

export type DesktopTaskControlResult =
  | Readonly<{ ok: true; value: TaskControlReceipt }>
  | Readonly<{ ok: false; error: RuntimeError }>;

type RuntimeCommandBuildResult =
  | Readonly<{ ok: true; value: TaskCommand }>
  | Readonly<{ ok: false; error: RuntimeError }>;

export interface DesktopTaskExecutionController {
  cancel(taskId: string): void;
  resume(taskId: string): Promise<void>;
}

export interface DesktopConfirmationDecisionGateway {
  decide(input: Readonly<{
    record: PersistedUserConfirmation;
    decisionId: string;
    decision: "confirmed" | "rejected";
    decidedByUserId: string;
    decidedAt: string;
  }>): Promise<DurableTaskCommandResult | {
    accepted: true;
    replayed: boolean;
    state: TaskRunState;
  }>;
}

export class CoordinatorDesktopConfirmationDecisionGateway
implements DesktopConfirmationDecisionGateway {
  readonly #coordinator: UserConfirmationCoordinator;
  readonly #revalidateConfirmed: (
    record: PersistedUserConfirmation,
  ) => Promise<RuntimeError | undefined>;

  constructor(input: {
    coordinator: UserConfirmationCoordinator;
    revalidateConfirmed: (
      record: PersistedUserConfirmation,
    ) => Promise<RuntimeError | undefined>;
  }) {
    this.#coordinator = input.coordinator;
    this.#revalidateConfirmed = input.revalidateConfirmed;
  }

  async decide(input: Readonly<{
    record: PersistedUserConfirmation;
    decisionId: string;
    decision: "confirmed" | "rejected";
    decidedByUserId: string;
    decidedAt: string;
  }>) {
    if (input.decision === "confirmed") {
      const narrowed = await this.#revalidateConfirmed(input.record);
      if (narrowed !== undefined) {
        return {
          accepted: false as const,
          error: narrowed,
        };
      }
    }
    return this.#coordinator.decide({
      confirmationId: input.record.request.confirmationId,
      decisionId: input.decisionId,
      decision: input.decision,
      decidedByUserId: input.decidedByUserId,
      decidedAt: input.decidedAt,
    });
  }
}

/**
 * Application-layer translation from Desktop user intent to the existing
 * durable Task/Confirmation runtime. It never mutates the Kernel reducer or
 * lets Renderer-selected identity, ActionIntent, Run or Step facts cross in.
 */
export class DesktopTaskControlService {
  readonly #runtime: DurableTaskRuntime;
  readonly #tasks: TaskPersistence;
  readonly #conversation: ConversationPersistence;
  readonly #confirmations: DesktopConfirmationDecisionGateway;
  readonly #execution: DesktopTaskExecutionController | undefined;
  readonly #clock: Clock;
  readonly #activeUserId: string;
  readonly #mailboxes = new Map<string, Promise<void>>();

  constructor(input: {
    runtime: DurableTaskRuntime;
    tasks: TaskPersistence;
    conversation: ConversationPersistence;
    confirmations: DesktopConfirmationDecisionGateway;
    clock: Clock;
    activeUserId: string;
    execution?: DesktopTaskExecutionController;
  }) {
    this.#runtime = input.runtime;
    this.#tasks = input.tasks;
    this.#conversation = input.conversation;
    this.#confirmations = input.confirmations;
    this.#clock = input.clock;
    this.#activeUserId = input.activeUserId;
    this.#execution = input.execution;
  }

  execute(input: TaskControlCommand): Promise<DesktopTaskControlResult> {
    const command = TaskControlCommandSchema.parse(input);
    const taskId = fromDesktopId(command.taskId, "task");
    if (taskId === undefined) {
      return Promise.resolve(failure(
        "desktop.task_not_found",
        "Task is unavailable",
      ));
    }
    return this.#enqueue(taskId, () =>
      command.type === "decide_user_confirmation"
        ? this.#decideConfirmation(command, taskId)
        : this.#controlTask(command, taskId));
  }

  async #controlTask(
    command: Exclude<TaskControlCommand, {
      type: "decide_user_confirmation";
    }>,
    taskId: string,
  ): Promise<DesktopTaskControlResult> {
    const existingReceipt = await this.#tasks.findCommandReceipt(
      command.commandId,
    );
    const state = existingReceipt === undefined
      ? await this.#runtime.snapshot(taskId)
      : await this.#stateAtReceipt(existingReceipt);
    if (state === undefined) {
      return failure("desktop.task_not_found", "Task is unavailable");
    }
    if (state.taskId !== taskId) {
      return conflict("Task control commandId belongs to another Task");
    }
    const expectedRevision = existingReceipt?.outcome === "accepted"
      ? existingReceipt.transition.previousRevision
      : existingReceipt?.stateRevision ?? state.revision;
    if (command.expectedTaskRevision !== expectedRevision) {
      return existingReceipt === undefined
        ? failure(
          "desktop.task_stale_revision",
          "Task changed before the command was applied",
          "validation",
        )
        : conflict("Task control commandId was reused with another revision");
    }
    const issuedAt = existingReceipt?.receivedAt ?? this.#clock.now();
    const runtimeCommand = buildRuntimeCommand(command, state, taskId, issuedAt);
    if (!runtimeCommand.ok) return runtimeCommand;
    const digest = sha256CanonicalJson(JsonValueSchema.parse(
      runtimeCommand.value,
    ));
    if (
      existingReceipt !== undefined
      && (
        existingReceipt.taskId !== taskId
        || existingReceipt.commandDigest !== digest
      )
    ) {
      return conflict("Task control commandId was reused with another request");
    }

    if (command.type === "provide_task_input") {
      const persisted = await this.#persistTaskInput(
        command,
        state,
        taskId,
        issuedAt,
      );
      if (!persisted.ok) return persisted;
    }

    const result = await this.#runtime.dispatch(runtimeCommand.value);
    if (!result.accepted) return {
      ok: false,
      error: mapTaskRuntimeError(result.error),
    };
    if (existingReceipt === undefined) {
      if (command.type === "cancel_task") {
        this.#execution?.cancel(taskId);
      } else {
        await this.#execution?.resume(taskId);
      }
    }
    return successReceipt({
      command,
      taskRevision: result.state.revision,
      acceptedAt: result.transition.occurredAt,
      replayed: existingReceipt !== undefined,
    });
  }

  async #decideConfirmation(
    command: Extract<TaskControlCommand, {
      type: "decide_user_confirmation";
    }>,
    taskId: string,
  ): Promise<DesktopTaskControlResult> {
    const confirmationId = fromDesktopId(
      command.confirmationId,
      "confirmation",
    );
    if (confirmationId === undefined) {
      return failure(
        "desktop.confirmation_not_found",
        "Confirmation is unavailable",
        "authorization",
      );
    }
    const [record, decisionOwner, state] = await Promise.all([
      this.#tasks.loadUserConfirmation(confirmationId),
      this.#tasks.findUserConfirmationByDecisionId(command.commandId),
      this.#runtime.snapshot(taskId),
    ]);
    if (record === undefined || state === undefined) {
      return failure(
        "desktop.confirmation_not_found",
        "Confirmation is unavailable",
        "authorization",
      );
    }
    if (
      decisionOwner !== undefined
      && decisionOwner.request.confirmationId !== confirmationId
    ) {
      return conflict("Confirmation commandId belongs to another decision");
    }
    if (record.request.scope.taskId !== taskId) {
      return failure(
        "desktop.confirmation_task_mismatch",
        "Confirmation belongs to another Task",
        "authorization",
      );
    }
    const requestDigest = sha256CanonicalJson(
      JsonValueSchema.parse(record.request),
    );
    if (requestDigest !== command.requestDigest) {
      return failure(
        "desktop.confirmation_digest_conflict",
        "Confirmation request changed",
        "authorization",
      );
    }
    if (record.decision !== undefined) {
      if (record.decision.decision !== command.decision) {
        return failure(
          "desktop.confirmation_duplicate_decision",
          "Confirmation already has another decision",
          "authorization",
        );
      }
      return successReceipt({
        command,
        taskRevision: state.revision,
        acceptedAt: record.decision.decidedAt,
        replayed: true,
      });
    }
    if (
      record.request.expiresAt !== undefined
      && Date.parse(record.request.expiresAt) <= Date.parse(this.#clock.now())
    ) {
      return failure(
        "desktop.confirmation_expired",
        "Confirmation has expired",
        "authorization",
      );
    }
    if (state.revision !== command.expectedTaskRevision) {
      return failure(
        "desktop.task_stale_revision",
        "Task changed before the decision was applied",
        "validation",
      );
    }
    if (!matchesWaitingConfirmation(state, record)) {
      return failure(
        "desktop.task_invalid_state",
        "Task is no longer waiting for this confirmation",
        "validation",
      );
    }
    const decidedAt = this.#clock.now();
    const decided = await this.#confirmations.decide({
      record,
      decisionId: command.commandId,
      decision: command.decision,
      decidedByUserId: this.#activeUserId,
      decidedAt,
    });
    if (!decided.accepted) {
      return {
        ok: false,
        error: mapConfirmationError(decided.error),
      };
    }
    const replayed = "replayed" in decided && decided.replayed;
    if (!replayed && command.decision === "confirmed") {
      void this.#execution?.resume(taskId).catch(() => undefined);
    }
    return successReceipt({
      command,
      taskRevision: decided.state.revision,
      acceptedAt: decidedAt,
      replayed,
    });
  }

  async #persistTaskInput(
    command: Extract<TaskControlCommand, {
      type: "provide_task_input";
    }>,
    state: TaskRunState,
    taskId: string,
    createdAt: string,
  ): Promise<DesktopTaskControlResult | { ok: true }> {
    if (state.sessionId === undefined) {
      return failure(
        "desktop.task_invalid_state",
        "Task input requires a durable Session",
      );
    }
    const message = {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user" as const,
      content: [{ type: "text" as const, text: command.input }],
    };
    const prepared = await this.#conversation.prepareMessage({
      messageId: command.commandId,
      sessionId: state.sessionId,
      taskId,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      message,
      createdAt,
    });
    if (!prepared.ok) return {
      ok: false,
      error: desktopFoundationError(
        prepared.error.code.includes("conflict")
          ? "desktop.command_idempotency_conflict"
          : "desktop.task_input_persistence_failed",
        "Task input could not be persisted",
        prepared.error.category,
      ),
    };
    const appended = await this.#conversation.appendPreparedMessage(
      command.commandId,
      createdAt,
    );
    return appended.ok
      ? { ok: true }
      : {
        ok: false,
        error: desktopFoundationError(
          appended.error.code.includes("conflict")
            ? "desktop.command_idempotency_conflict"
            : "desktop.task_input_persistence_failed",
          "Task input could not be persisted",
          appended.error.category,
        ),
      };
  }

  async #stateAtReceipt(
    receipt: NonNullable<Awaited<ReturnType<TaskPersistence["findCommandReceipt"]>>>,
  ): Promise<TaskRunState | undefined> {
    const revision = receipt.outcome === "accepted"
      ? receipt.transition.previousRevision
      : receipt.stateRevision;
    return (await this.#tasks.loadCheckpointAtRevision(
      receipt.taskId,
      revision,
    ))?.state;
  }

  #enqueue<T>(taskId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#mailboxes.get(taskId) ?? Promise.resolve();
    const result = previous.then(operation);
    const settled = result.then(() => undefined, () => undefined);
    this.#mailboxes.set(taskId, settled);
    void settled.finally(() => {
      if (this.#mailboxes.get(taskId) === settled) {
        this.#mailboxes.delete(taskId);
      }
    });
    return result;
  }
}

function buildRuntimeCommand(
  command: Exclude<TaskControlCommand, {
    type: "decide_user_confirmation";
  }>,
  state: TaskRunState,
  taskId: string,
  issuedAt: string,
): RuntimeCommandBuildResult {
  if (command.type === "cancel_task") {
    return {
      ok: true,
      value: {
        commandId: command.commandId,
        taskId,
        type: "cancel_task",
        issuedAt,
        ...(command.reasonSummary === undefined
          ? {}
          : { reason: command.reasonSummary }),
      },
    };
  }
  if (command.type === "retry_task") {
    const previousRun = state.runs.at(-1);
    if (
      previousRun === undefined
      || !["failed", "cancelled", "timed_out"].includes(state.status)
    ) {
      return buildFailure(
        "desktop.task_invalid_state",
        "Only a failed, cancelled, or timed-out Task can be retried",
      );
    }
    return {
      ok: true,
      value: {
        commandId: command.commandId,
        taskId,
        type: "retry_run",
        issuedAt,
        failedRunId: previousRun.runId,
        newRunId: stableUuid(command.commandId, "retry-run"),
      },
    };
  }
  const run = state.runs.find((candidate) =>
    candidate.runId === state.activeRunId);
  const step = run?.steps.find((candidate) =>
    candidate.stepId === run.activeStepId);
  const expectedReason = command.type === "provide_task_input"
    ? "user_input"
    : "external_dependency";
  if (
    state.status !== "waiting"
    || run?.status !== "waiting"
    || step?.status !== "waiting"
    || step.wait?.reason !== expectedReason
  ) {
    return buildFailure(
      "desktop.task_invalid_state",
      command.type === "provide_task_input"
        ? "Task is not waiting for user input"
        : "Task cannot be continued from its current state",
    );
  }
  return {
    ok: true,
    value: {
      commandId: command.commandId,
      taskId,
      type: "resume_step",
      issuedAt,
      runId: run.runId,
      stepId: step.stepId,
    },
  };
}

function buildFailure(
  code: string,
  message: string,
): RuntimeCommandBuildResult {
  return {
    ok: false,
    error: desktopFoundationError(code, message, "validation"),
  };
}

function matchesWaitingConfirmation(
  state: TaskRunState,
  record: PersistedUserConfirmation,
): boolean {
  const run = state.runs.find((candidate) =>
    candidate.runId === state.activeRunId);
  const step = run?.steps.find((candidate) =>
    candidate.stepId === run.activeStepId);
  return state.status === "waiting"
    && run?.status === "waiting"
    && step?.status === "waiting"
    && step.wait?.reason === "user_confirmation"
    && step.wait.context.confirmationId === record.request.confirmationId
    && (
      record.request.runId === undefined
      || record.request.runId === run.runId
    )
    && (
      record.request.stepId === undefined
      || record.request.stepId === step.stepId
    )
    && (
      record.request.actionId === undefined
      || record.request.actionId === step.action.actionId
    );
}

function successReceipt(input: {
  command: TaskControlCommand;
  taskRevision: number;
  acceptedAt: string;
  replayed: boolean;
}): DesktopTaskControlResult {
  return {
    ok: true,
    value: TaskControlReceiptSchema.parse({
      commandId: input.command.commandId,
      taskId: input.command.taskId,
      commandType: input.command.type,
      status: input.replayed ? "replayed" : "accepted",
      taskRevision: input.taskRevision,
      acceptedAt: input.acceptedAt,
    }),
  };
}

function mapTaskRuntimeError(error: RuntimeError): RuntimeError {
  if (error.code.includes("idempotency_conflict")) {
    return desktopFoundationError(
      "desktop.command_idempotency_conflict",
      "Task control commandId was reused with another request",
      "validation",
    );
  }
  if (error.code.includes("revision_conflict")) {
    return desktopFoundationError(
      "desktop.task_stale_revision",
      "Task changed before the command was applied",
      "validation",
    );
  }
  return desktopFoundationError(
    "desktop.task_invalid_state",
    "Task cannot accept this command in its current state",
    error.category,
  );
}

function mapConfirmationError(error: RuntimeError): RuntimeError {
  if (error.code.includes("already_decided")) {
    return desktopFoundationError(
      "desktop.confirmation_duplicate_decision",
      "Confirmation already has another decision",
      "authorization",
    );
  }
  if (error.code.includes("not_found")) {
    return desktopFoundationError(
      "desktop.confirmation_not_found",
      "Confirmation is unavailable",
      "authorization",
    );
  }
  return desktopFoundationError(
    "desktop.confirmation_permission_denied",
    "Confirmation could not be applied",
    error.category,
  );
}

function failure(
  code: string,
  message: string,
  category: RuntimeError["category"] = "validation",
): DesktopTaskControlResult {
  return { ok: false, error: desktopFoundationError(code, message, category) };
}

function conflict(message: string): DesktopTaskControlResult {
  return failure(
    "desktop.command_idempotency_conflict",
    message,
    "validation",
  );
}

function stableUuid(commandId: string, label: string): string {
  const bytes = createHash("sha256")
    .update(`${commandId}:${label}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fromDesktopId(value: string, namespace: string): string | undefined {
  const prefix = `${namespace}:`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : undefined;
}
