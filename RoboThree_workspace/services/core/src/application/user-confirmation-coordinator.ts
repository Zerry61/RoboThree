import {
  CONTRACT_VERSION,
  JsonValueSchema,
  JsonObjectSchema,
  UserConfirmationDecisionSchema,
  UserConfirmationRequestSchema,
  canonicalJsonStringify,
} from "@robothree/contracts";
import type {
  RuntimeError,
  UserConfirmationDecision,
  UserConfirmationRequest,
} from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import type { DurableTaskCommandResult, DurableTaskRuntime } from "./durable-task-runtime.js";

export type UserConfirmationCoordinationResult = DurableTaskCommandResult | {
  accepted: true;
  replayed: true;
  state: NonNullable<Awaited<ReturnType<DurableTaskRuntime["snapshot"]>>>;
};

export class UserConfirmationCoordinator {
  readonly #runtime: DurableTaskRuntime;
  readonly #persistence: TaskPersistence;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(input: {
    runtime: DurableTaskRuntime;
    persistence: TaskPersistence;
    clock: Clock;
    idGenerator: IdGenerator;
  }) {
    this.#runtime = input.runtime;
    this.#persistence = input.persistence;
    this.#clock = input.clock;
    this.#idGenerator = input.idGenerator;
  }

  public async request(input: UserConfirmationRequest): Promise<UserConfirmationCoordinationResult> {
    const request = UserConfirmationRequestSchema.parse(input);
    const existing = await this.#persistence.findUserConfirmationByScopeDigest(request.scopeDigest);
    if (existing !== undefined) {
      if (existing.request.confirmationId !== request.confirmationId || !sameRequest(existing.request, request)) {
        return failure("authorization.confirmation_scope_conflict", "confirmation scope already has another request");
      }
      const state = await this.#runtime.snapshot(request.scope.taskId);
      return state === undefined
        ? failure("persistence.task_not_found", "task does not exist")
        : { accepted: true, replayed: true, state };
    }
    const executionRef = confirmationExecutionRef(request);
    if (executionRef === undefined) {
      return failure(
        "authorization.external_confirmation_requires_active_step",
        "External confirmation request must bind an active Task Step",
      );
    }
    const requested = await this.#runtime.dispatchWithUserConfirmationTransition({
      commandId: this.#idGenerator.next(),
      taskId: request.scope.taskId,
      type: "wait_step",
      issuedAt: request.requestedAt,
      runId: executionRef.runId,
      stepId: executionRef.stepId,
      reason: "user_confirmation",
      context: JsonObjectSchema.parse({
        confirmationId: request.confirmationId,
        scopeDigest: request.scopeDigest,
      }),
    }, { type: "request", request });
    if (requested.accepted) {
      return requested;
    }
    const concurrent = await this.#persistence.findUserConfirmationByScopeDigest(request.scopeDigest);
    if (concurrent === undefined) {
      return requested;
    }
    if (concurrent.request.confirmationId !== request.confirmationId || !sameRequest(concurrent.request, request)) {
      return failure("authorization.confirmation_scope_conflict", "confirmation scope already has another request");
    }
    const state = await this.#runtime.snapshot(request.scope.taskId);
    return state === undefined
      ? failure("persistence.task_not_found", "task does not exist")
      : { accepted: true, replayed: true, state };
  }

  public async decide(input: {
    confirmationId: string;
    decisionId?: string;
    decision: "confirmed" | "rejected";
    decidedByUserId: string;
    decidedAt?: string;
  }): Promise<UserConfirmationCoordinationResult> {
    const record = await this.#persistence.loadUserConfirmation(input.confirmationId);
    if (record === undefined) {
      return failure("authorization.confirmation_not_found", "confirmation request does not exist");
    }
    if (record.decision !== undefined) {
      const state = await this.#runtime.snapshot(record.request.scope.taskId);
      if (record.decision.decision !== input.decision || record.decision.decidedByUserId !== input.decidedByUserId) {
        return failure("authorization.confirmation_already_decided", "confirmation already has another decision", state);
      }
      return state === undefined
        ? failure("persistence.task_not_found", "task does not exist")
        : { accepted: true, replayed: true, state };
    }
    const scope = record.request.scope;
    const executionRef = confirmationExecutionRef(record.request);
    if (executionRef === undefined) {
      return failure(
        "authorization.external_confirmation_requires_active_step",
        "External confirmation must bind an active Task Step",
      );
    }
    const decidedAt = input.decidedAt ?? this.#clock.now();
    const decision: UserConfirmationDecision = UserConfirmationDecisionSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      decisionId: input.decisionId ?? this.#idGenerator.next(),
      confirmationId: record.request.confirmationId,
      scopeDigest: record.request.scopeDigest,
      decision: input.decision,
      decidedByUserId: input.decidedByUserId,
      decidedAt,
    });
    const command = input.decision === "confirmed"
      ? {
        commandId: this.#idGenerator.next(),
        taskId: scope.taskId,
        type: "resume_step" as const,
        issuedAt: decidedAt,
        runId: executionRef.runId,
        stepId: executionRef.stepId,
      }
      : {
        commandId: this.#idGenerator.next(),
        taskId: scope.taskId,
        type: "record_observation" as const,
        issuedAt: decidedAt,
        runId: executionRef.runId,
        stepId: executionRef.stepId,
        observation: {
          observationId: this.#idGenerator.next(),
          actionId: executionRef.actionId,
          observedAt: decidedAt,
          outcome: "user_rejected" as const,
          error: {
            code: "authorization.user_rejected",
            category: "authorization" as const,
            message: rejectionMessage(scope.type),
            retryable: false,
            details: { confirmationId: record.request.confirmationId },
          },
        },
      };
    const decided = await this.#runtime.dispatchWithUserConfirmationTransition(command, {
      type: "decision",
      request: record.request,
      decision,
    });
    if (decided.accepted) {
      return decided;
    }
    const concurrent = await this.#persistence.loadUserConfirmation(input.confirmationId);
    if (concurrent?.decision === undefined) {
      return decided;
    }
    const state = await this.#runtime.snapshot(record.request.scope.taskId);
    if (
      concurrent.decision.decision !== input.decision
      || concurrent.decision.decidedByUserId !== input.decidedByUserId
    ) {
      return failure("authorization.confirmation_already_decided", "confirmation already has another decision", state);
    }
    return state === undefined
      ? failure("persistence.task_not_found", "task does not exist")
      : { accepted: true, replayed: true, state };
  }
}

function rejectionMessage(scopeType: UserConfirmationRequest["scope"]["type"]): string {
  switch (scopeType) {
    case "single_action":
      return "The user rejected this exact Tool Action";
    case "task_external_scope":
      return "The user rejected this exact external Tool data scope";
    case "task_model_external_scope":
      return "The user rejected this exact Model external data scope";
  }
}

function sameRequest(left: UserConfirmationRequest, right: UserConfirmationRequest): boolean {
  return canonicalJsonStringify(JsonValueSchema.parse(left))
    === canonicalJsonStringify(JsonValueSchema.parse(right));
}

function confirmationExecutionRef(request: UserConfirmationRequest): {
  runId: string;
  stepId: string;
  actionId: string;
} | undefined {
  if (request.scope.type === "single_action") {
    return {
      runId: request.scope.runId,
      stepId: request.scope.stepId,
      actionId: request.scope.actionId,
    };
  }
  return request.runId === undefined || request.stepId === undefined || request.actionId === undefined
    ? undefined
    : { runId: request.runId, stepId: request.stepId, actionId: request.actionId };
}

function failure(code: string, message: string, state?: Awaited<ReturnType<DurableTaskRuntime["snapshot"]>>): DurableTaskCommandResult {
  const error: RuntimeError = {
    code,
    category: code.startsWith("persistence.") ? "persistence" : "authorization",
    message,
    retryable: false,
  };
  return { accepted: false, ...(state === undefined ? {} : { state }), error };
}
