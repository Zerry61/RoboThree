import {
  ActionSchema,
  CONTRACT_VERSION,
  JsonObjectSchema,
  JsonValueSchema,
  PersistenceSchemaVersion,
  UserConfirmationDecisionSchema,
} from "@robothree/contracts";
import type {
  Action,
  AuthorizationDecision,
  EffectAttempt,
  RuntimeError,
  TaskCapabilityLock,
  ToolAuthorizationContext,
  ToolRiskFactKind,
  UserConfirmationRequest,
} from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type { CapabilityAvailability } from "../registry/capability-resolver.js";
import {
  buildConfirmationScope,
  createConfirmationRequest,
  createAuthorizationDecision,
  createToolRiskFacts,
  createToolRiskFactsForKinds,
} from "./authorization-evaluator.js";
import type { AuthorizationEvaluator } from "./authorization-evaluator.js";
import type { EffectCoordinator } from "./effect-coordinator.js";
import type { RuntimeAdmissionController } from "./runtime-admission-controller.js";
import type { TaskCapabilityLockService } from "./task-capability-lock-service.js";
import type { UserConfirmationCoordinator } from "./user-confirmation-coordinator.js";

export type ToolExecutionAuthorizationInput = {
  context: ToolAuthorizationContext;
  currentContext?: () => Promise<ToolAuthorizationContext>;
};

export type ToolExecutionInput = {
  taskId: string;
  runId: string;
  stepId: string;
  registryRevision: string;
  capabilityId: string;
  action: Action;
  idempotencyKey: string;
  authorization: ToolExecutionAuthorizationInput;
  availability?: CapabilityAvailability;
  deadlineAt?: string;
  signal?: AbortSignal;
  riskFactKinds?: readonly ToolRiskFactKind[];
  onEffectPrepared?: (attempt: EffectAttempt) => Promise<void>;
};

export type ToolExecutionWaiting = {
  status: "waiting_user_confirmation";
  request: UserConfirmationRequest;
};

export type ToolExecutionDenied = {
  status: "denied";
  decision: Extract<AuthorizationDecision, { outcome: "denied" }>;
  error: RuntimeError;
};

export class ToolExecutionService {
  readonly #lockService: TaskCapabilityLockService;
  readonly #effects: EffectCoordinator;
  readonly #authorization: AuthorizationEvaluator;
  readonly #confirmations: UserConfirmationCoordinator;
  readonly #persistence: TaskPersistence;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #admission: RuntimeAdmissionController;
  readonly #defaultAuthorization: ToolExecutionAuthorizationInput | undefined;

  public constructor(input: {
    lockService: TaskCapabilityLockService;
    effects: EffectCoordinator;
    authorization: AuthorizationEvaluator;
    confirmations: UserConfirmationCoordinator;
    persistence: TaskPersistence;
    clock: Clock;
    idGenerator: IdGenerator;
    admission: RuntimeAdmissionController;
    defaultAuthorization?: ToolExecutionAuthorizationInput;
  }) {
    this.#lockService = input.lockService;
    this.#effects = input.effects;
    this.#authorization = input.authorization;
    this.#confirmations = input.confirmations;
    this.#persistence = input.persistence;
    this.#clock = input.clock;
    this.#idGenerator = input.idGenerator;
    this.#admission = input.admission;
    this.#defaultAuthorization = input.defaultAuthorization;
  }

  public async execute(input: ToolExecutionInput) {
    const authorization = input.authorization ?? this.#defaultAuthorization;
    if (authorization === undefined) {
      throw new Error("ToolExecutionService requires an explicit authorization context");
    }
    input = { ...input, authorization };
    const action = ActionSchema.parse(input.action);
    const locked = await this.#lockService.resolveAndLock({
      taskId: input.taskId,
      registryRevision: input.registryRevision,
      capabilityId: input.capabilityId,
      ...(input.availability === undefined ? {} : { availability: input.availability }),
    });
    if (locked.route.definition.kind !== "tool") {
      throw new Error(`capability ${input.capabilityId} is not a tool`);
    }
    const descriptor = locked.route.adapterDescriptor;
    if (descriptor.adapterKind !== "tool_execution_backend") {
      throw new Error(`capability ${input.capabilityId} is not bound to a ToolExecutionBackend`);
    }

    const initial = await this.#evaluate(input, action, locked.lock, input.authorization.context);
    if (initial.decision.outcome === "denied") {
      const auditError = await this.#auditAuthorization(
        input,
        action,
        locked.lock,
        input.authorization.context,
        initial.decision,
      );
      if (auditError !== undefined) {
        return { status: "denied" as const, decision: initial.decision, error: auditError };
      }
      return denied(initial.decision);
    }
    if (initial.decision.outcome === "user_confirmation_required") {
      const waiting = await this.#confirmations.request(initial.decision.request);
      if (!waiting.accepted) {
        return { status: "denied" as const, decision: deniedDecisionFromError(waiting.error), error: waiting.error };
      }
      return { status: "waiting_user_confirmation" as const, request: initial.decision.request };
    }

    const beforePrepare = await this.#evaluateCurrent(input, action, locked.lock);
    if (beforePrepare.decision.outcome !== "allowed") {
      const denial = beforePrepare.decision.outcome === "denied"
        ? beforePrepare.decision
        : deniedDecisionFromCode("authorization.confirmation_invalidated_before_prepare");
      const auditError = await this.#auditAuthorization(
        input,
        action,
        locked.lock,
        beforePrepare.context,
        denial,
      );
      if (auditError !== undefined) {
        return { status: "denied" as const, decision: denial, error: auditError };
      }
      return denied(denial);
    }
    const allowedAuditError = await this.#auditAuthorization(
      input,
      action,
      locked.lock,
      beforePrepare.context,
      beforePrepare.decision,
    );
    if (allowedAuditError !== undefined) {
      return auditFailure(allowedAuditError);
    }

    const effectIntent = {
      taskId: input.taskId,
      runId: input.runId,
      stepId: input.stepId,
      actionId: action.actionId,
      idempotencyKey: input.idempotencyKey,
      executorCapability: descriptor.adapterDescriptorId,
      recoveryMode: descriptor.effectRecoveryMode,
      requestRef: locked.lock.lockId,
      metadata: JsonObjectSchema.parse({
        capabilityId: input.capabilityId,
        bindingId: locked.route.binding.bindingId,
        adapterDescriptorId: descriptor.adapterDescriptorId,
        action,
        authorizationDecisionDigest: beforePrepare.decision.decisionDigest,
        ...(initial.confirmation?.request.confirmationId === undefined
          ? {}
          : { confirmationId: initial.confirmation.request.confirmationId }),
        ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt }),
      }),
    };
    const dispatch = async () => {
      const prepared = await this.#effects.prepare(effectIntent);
      if (!prepared.ok) return prepared;
      await input.onEffectPrepared?.(prepared.attempt);
      return this.#effects.prepareAndDispatch(effectIntent, input.signal, async () => {
      const preDispatch = await this.#evaluateCurrent(input, action, locked.lock);
      return preDispatch.decision.outcome === "allowed"
        ? undefined
        : authorizationError("authorization.invalidated_before_dispatch", "Authorization became invalid before Tool dispatch");
      });
    };
    const admitted = await this.#admission.run({
      requestId: `tool:${sha256CanonicalJson(JsonValueSchema.parse({
        taskId: input.taskId,
        actionId: action.actionId,
        idempotencyKey: input.idempotencyKey,
      }))}`,
      kind: "tool",
      resourceId: `${descriptor.adapterDescriptorId}@${descriptor.revision}`,
      ...(descriptor.maxConcurrency === undefined ? {} : { resourceLimit: descriptor.maxConcurrency }),
      ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    }, dispatch);
    return admitted.ok
      ? admitted.value
      : { status: "not_admitted" as const, error: admitted.error };
  }

  public async submitDecision(input: {
    execution: ToolExecutionInput;
    confirmationId: string;
    decisionId?: string;
    decision: "confirmed" | "rejected";
    decidedByUserId: string;
    decidedAt?: string;
  }) {
    const record = await this.#persistence.loadUserConfirmation(input.confirmationId);
    if (record === undefined) {
      return { status: "denied" as const, error: authorizationError("authorization.confirmation_not_found", "confirmation request does not exist") };
    }
    if (record.request.scope.taskId !== input.execution.taskId) {
      return { status: "denied" as const, error: authorizationError("authorization.confirmation_task_mismatch", "confirmation belongs to another task") };
    }
    if (input.decidedByUserId !== input.execution.authorization.context.subject.userId) {
      return { status: "denied" as const, error: authorizationError("authorization.confirmation_user_mismatch", "confirmation must be decided by the active user") };
    }
    const decisionId = input.decisionId ?? this.#idGenerator.next();
    const decidedAt = input.decidedAt ?? this.#clock.now();
    if (input.decision === "confirmed") {
      const action = ActionSchema.parse(input.execution.action);
      const locked = await this.#lockService.resolveAndLock({
        taskId: input.execution.taskId,
        registryRevision: input.execution.registryRevision,
        capabilityId: input.execution.capabilityId,
        ...(input.execution.availability === undefined ? {} : { availability: input.execution.availability }),
      });
      if (locked.lock.definitionSnapshot.kind !== "tool") {
        return { status: "denied" as const, error: authorizationError("authorization.tool_lock_mismatch", "locked capability is not a Tool") };
      }
      const currentContext = input.execution.authorization.currentContext === undefined
        ? input.execution.authorization.context
        : await input.execution.authorization.currentContext();
      const riskFacts = toolRiskFactsForExecution(input.execution, locked.lock);
      const base = {
        taskId: input.execution.taskId,
        runId: input.execution.runId,
        stepId: input.execution.stepId,
        action,
        lock: locked.lock,
        riskFacts,
        context: currentContext,
      };
      const scope = buildConfirmationScope(base);
      const decision = UserConfirmationDecisionSchema.parse({
        schemaVersion: CONTRACT_VERSION,
        decisionId,
        confirmationId: record.request.confirmationId,
        scopeDigest: record.request.scopeDigest,
        decision: "confirmed",
        decidedByUserId: input.decidedByUserId,
        decidedAt,
      });
      const reevaluated = this.#authorization.evaluate({
        ...base,
        confirmationRequest: record.request,
        persistedConfirmation: { request: record.request, decision },
      });
      if (scope === undefined || reevaluated.outcome !== "allowed") {
        const denial = reevaluated.outcome === "denied"
          ? reevaluated
          : deniedDecisionFromCode("authorization.confirmation_invalidated_before_resume");
        const auditError = await this.#auditAuthorization(
          input.execution,
          action,
          locked.lock,
          currentContext,
          denial,
        );
        if (auditError !== undefined) {
          return { status: "denied" as const, decision: denial, error: auditError };
        }
        return denied(denial);
      }
    }
    const decided = await this.#confirmations.decide({
      confirmationId: input.confirmationId,
      decisionId,
      decision: input.decision,
      decidedByUserId: input.decidedByUserId,
      decidedAt,
    });
    if (!decided.accepted) {
      return { status: "denied" as const, error: decided.error };
    }
    if (input.decision === "rejected") {
      return { status: "user_rejected" as const, state: decided.state };
    }
    return this.execute(input.execution);
  }

  async #evaluateCurrent(
    input: ToolExecutionInput,
    action: Action,
    lock: TaskCapabilityLock,
  ): Promise<{ decision: AuthorizationDecision; context: ToolAuthorizationContext }> {
    const current = input.authorization.currentContext === undefined
      ? input.authorization.context
      : await input.authorization.currentContext();
    return { decision: (await this.#evaluate(input, action, lock, current)).decision, context: current };
  }

  async #evaluate(
    input: ToolExecutionInput,
    action: Action,
    lock: TaskCapabilityLock,
    context: ToolAuthorizationContext,
  ): Promise<{ decision: AuthorizationDecision; confirmation?: Awaited<ReturnType<TaskPersistence["findUserConfirmationByScopeDigest"]>> }> {
    if (lock.definitionSnapshot.kind !== "tool") {
      return { decision: deniedDecisionFromCode("authorization.tool_lock_mismatch") };
    }
    const riskFacts = toolRiskFactsForExecution(input, lock);
    const base = {
      taskId: input.taskId,
      runId: input.runId,
      stepId: input.stepId,
      action,
      lock,
      riskFacts,
      context,
    };
    const scope = buildConfirmationScope(base);
    const candidate = scope === undefined
      ? undefined
      : createConfirmationRequest({
        confirmationId: this.#idGenerator.next(),
        scope,
        runId: input.runId,
        stepId: input.stepId,
        actionId: action.actionId,
        requestedAt: this.#clock.now(),
      });
    const persisted = candidate === undefined
      ? undefined
      : await this.#persistence.findUserConfirmationByScopeDigest(candidate.scopeDigest);
    const request = persisted?.request ?? candidate;
    return {
      decision: this.#authorization.evaluate({
        ...base,
        ...(request === undefined ? {} : { confirmationRequest: request }),
        ...(persisted === undefined ? {} : { persistedConfirmation: persisted }),
      }),
      ...(persisted === undefined ? {} : { confirmation: persisted }),
    };
  }

  async #auditAuthorization(
    input: ToolExecutionInput,
    action: Action,
    lock: TaskCapabilityLock,
    context: ToolAuthorizationContext,
    decision: Extract<AuthorizationDecision, { outcome: "allowed" | "denied" }>,
  ): Promise<RuntimeError | undefined> {
    if (lock.definitionSnapshot.kind !== "tool") {
      return authorizationError("authorization.tool_lock_mismatch", "Authorization audit requires a Tool lock");
    }
    const riskFacts = toolRiskFactsForExecution(input, lock);
    const payload = JsonObjectSchema.parse({
      decision,
      subjectUserId: context.subject.userId,
      activeConfigRevision: context.subject.activeConfigRevision,
      lockId: lock.lockId,
      capabilityId: lock.definitionSnapshot.capabilityId,
      toolCapabilityRevision: lock.definitionSnapshot.revision,
      bindingId: lock.bindingSnapshot.bindingId,
      bindingRevision: lock.bindingSnapshot.revision,
      adapterDescriptorId: lock.adapterDescriptorSnapshot.adapterDescriptorId,
      adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
      availabilityRevision: context.availability.revision,
      riskFactsDigest: riskFacts.factsDigest,
      actionDigest: sha256CanonicalJson(JsonValueSchema.parse(action)),
      authorizationContextDigest: sha256CanonicalJson(JsonValueSchema.parse(context)),
    });
    let lastError: RuntimeError | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const persisted = await this.#persistence.loadTask(input.taskId);
      if (persisted === undefined) {
        return {
          code: "persistence.task_not_found",
          category: "persistence",
          message: "task does not exist while persisting Authorization audit",
          retryable: false,
        };
      }
      const event = {
        schemaVersion: PersistenceSchemaVersion,
        eventId: this.#idGenerator.next(),
        taskId: input.taskId,
        sequence: persisted.head.lastEventSequence + 1,
        type: decision.outcome === "allowed" ? "authorization.allowed" as const : "authorization.denied" as const,
        occurredAt: this.#clock.now(),
        causationId: action.actionId,
        correlationId: input.taskId,
        runId: input.runId,
        stepId: input.stepId,
        payload,
      };
      const committed = await this.#persistence.commitAuthorizationAudit({
        expectedEventSequence: persisted.head.lastEventSequence,
        event,
        outbox: [{
          schemaVersion: PersistenceSchemaVersion,
          outboxId: this.#idGenerator.next(),
          eventId: event.eventId,
          taskId: input.taskId,
          destination: "runtime.events",
          payload: JsonObjectSchema.parse({ event }),
          attemptCount: 0,
          createdAt: event.occurredAt,
        }],
      });
      if (committed.ok) {
        return undefined;
      }
      lastError = committed.error;
      if (lastError.code !== "persistence.sequence_conflict") {
        return lastError;
      }
    }
    return lastError;
  }
}

function denied(decision: Extract<AuthorizationDecision, { outcome: "denied" }>): ToolExecutionDenied {
  return { status: "denied", decision, error: authorizationError(decision.reasonCode, "Tool execution was denied") };
}

function auditFailure(error: RuntimeError): ToolExecutionDenied {
  return {
    status: "denied",
    decision: deniedDecisionFromCode("authorization.audit_not_persisted"),
    error,
  };
}

function toolRiskFactsForExecution(input: ToolExecutionInput, lock: TaskCapabilityLock) {
  if (lock.definitionSnapshot.kind !== "tool") {
    throw new Error("Tool risk facts require a Tool lock");
  }
  return input.riskFactKinds === undefined
    ? createToolRiskFacts(lock.definitionSnapshot.tool.risk)
    : createToolRiskFactsForKinds(lock.definitionSnapshot.tool.risk, input.riskFactKinds);
}

function authorizationError(code: string, message: string): RuntimeError {
  return { code, category: "authorization", message, retryable: false };
}

function deniedDecisionFromError(error: RuntimeError): Extract<AuthorizationDecision, { outcome: "denied" }> {
  return deniedDecisionFromCode(error.code);
}

function deniedDecisionFromCode(reasonCode: string): Extract<AuthorizationDecision, { outcome: "denied" }> {
  return createAuthorizationDecision({ outcome: "denied", reasonCode }) as Extract<AuthorizationDecision, { outcome: "denied" }>;
}
