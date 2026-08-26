import {
  TaskCommandSchema,
  TaskInitializationSchema,
  TaskRunStateSchema,
  TaskTransitionSchema,
} from "@robothree/contracts";
import type {
  Observation,
  RunState,
  RuntimeError,
  StepState,
  TaskCommand,
  TaskInitialization,
  TaskRunState,
  TaskStatus,
  TaskTransition,
} from "@robothree/contracts";

export type TaskCommandAccepted = {
  accepted: true;
  state: TaskRunState;
  transition: TaskTransition;
};

export type TaskCommandRejected = {
  accepted: false;
  state: TaskRunState;
  error: RuntimeError;
};

export type TaskCommandResult = TaskCommandAccepted | TaskCommandRejected;

export function createTaskRunState(input: TaskInitialization): TaskRunState {
  const initialization = TaskInitializationSchema.parse(input);
  if (
    initialization.deadlineAt !== undefined
    && compareTimestamps(initialization.deadlineAt, initialization.createdAt) <= 0
  ) {
    throw new Error("Task deadline must be later than createdAt");
  }

  return immutableState({
    ...initialization,
    status: "created",
    revision: 0,
    runs: [],
    updatedAt: initialization.createdAt,
  });
}

export function reduceTaskState(current: TaskRunState, input: TaskCommand): TaskCommandResult {
  const state = TaskRunStateSchema.parse(current);
  const command = TaskCommandSchema.parse(input);

  try {
    requireCondition(command.taskId === state.taskId, "runtime.task_mismatch", "Command targets another task", {
      actualTaskId: command.taskId,
      expectedTaskId: state.taskId,
    });
    requireCondition(
      compareTimestamps(command.issuedAt, state.updatedAt) >= 0,
      "runtime.non_monotonic_command_time",
      "Command issuedAt cannot be earlier than the current state",
      { issuedAt: command.issuedAt, stateUpdatedAt: state.updatedAt },
    );

    const deadline = activeDeadline(state);
    if (isNonTerminalTask(state.status) && deadline !== undefined && compareTimestamps(command.issuedAt, deadline) >= 0) {
      return state.status === "created"
        ? terminateTaskWithoutRun(state, command, "timed_out", deadlineError(deadline), "deadline_expired")
        : expireActiveTask(state, command, deadline);
    }
    if (command.type === "expire_deadline") {
      return reject(
        state,
        "runtime.deadline_not_reached",
        deadline === undefined ? "Task has no active deadline" : "Active deadline has not been reached",
        { deadlineAt: deadline, issuedAt: command.issuedAt },
      );
    }

    switch (command.type) {
      case "start_run":
        return startRun(state, command);
      case "retry_run":
        return retryRun(state, command);
      case "start_step":
        return startStep(state, command);
      case "wait_step":
        return waitStep(state, command);
      case "resume_step":
        return resumeStep(state, command);
      case "record_observation":
        return recordObservation(state, command);
      case "complete_run":
        return completeRun(state, command);
      case "fail_run":
        return failRun(state, command);
      case "cancel_task":
        return cancelTask(state, command);
    }
  } catch (error) {
    if (error instanceof TransitionRejection) {
      return { accepted: false, state: immutableState(state), error: error.runtimeError };
    }
    throw error;
  }
}

function startRun(
  state: TaskRunState,
  command: Extract<TaskCommand, { type: "start_run" }>,
): TaskCommandAccepted {
  requireCondition(state.status === "created", "runtime.invalid_transition", "Only a created task can start its first run", {
    commandType: command.type,
    taskStatus: state.status,
  });
  requireUniqueId(state, command.runId, "runId");
  requireFutureDeadline(command.deadlineAt, command.issuedAt, "Run");

  const run: RunState = {
    runId: command.runId,
    attempt: 1,
    status: "running",
    steps: [],
    startedAt: command.issuedAt,
    updatedAt: command.issuedAt,
    ...(command.deadlineAt === undefined ? {} : { deadlineAt: command.deadlineAt }),
  };

  return commit(
    state,
    command,
    {
      ...state,
      status: "running",
      activeRunId: run.runId,
      runs: [run],
    },
    { runId: run.runId },
  );
}

function retryRun(
  state: TaskRunState,
  command: Extract<TaskCommand, { type: "retry_run" }>,
): TaskCommandAccepted {
  requireCondition(
    state.status === "failed" || state.status === "cancelled" || state.status === "timed_out",
    "runtime.invalid_transition",
    "Only a failed, cancelled, or timed-out task can be retried",
    { commandType: command.type, taskStatus: state.status },
  );
  const previousRun = state.runs.at(-1);
  requireCondition(
    previousRun !== undefined && previousRun.runId === command.failedRunId,
    "runtime.retry_target_mismatch",
    "Retry must target the latest terminal run",
    { failedRunId: command.failedRunId, latestRunId: previousRun?.runId },
  );
  requireCondition(
    previousRun.status === "failed" || previousRun.status === "cancelled" || previousRun.status === "timed_out",
    "runtime.invalid_transition",
    "Retry target must be a retryable terminal run",
    { runStatus: previousRun.status },
  );
  requireCondition(
    state.deadlineAt === undefined || compareTimestamps(command.issuedAt, state.deadlineAt) < 0,
    "runtime.task_deadline_exceeded",
    "Task deadline prevents retry",
    { deadlineAt: state.deadlineAt, issuedAt: command.issuedAt },
  );
  requireUniqueId(state, command.newRunId, "runId");
  requireFutureDeadline(command.deadlineAt, command.issuedAt, "Run");

  const run: RunState = {
    runId: command.newRunId,
    attempt: previousRun.attempt + 1,
    retryOfRunId: previousRun.runId,
    status: "running",
    steps: [],
    startedAt: command.issuedAt,
    updatedAt: command.issuedAt,
    ...(command.deadlineAt === undefined ? {} : { deadlineAt: command.deadlineAt }),
  };
  const next = { ...state, status: "running" as const, activeRunId: run.runId, runs: [...state.runs, run] };
  delete next.terminalError;
  delete next.endedAt;

  return commit(state, command, next, { runId: run.runId });
}

function startStep(
  state: TaskRunState,
  command: Extract<TaskCommand, { type: "start_step" }>,
): TaskCommandAccepted {
  const run = requireActiveRun(state, command.runId, "running");
  requireCondition(run.activeStepId === undefined, "runtime.active_step_exists", "Run already has an active step", {
    activeStepId: run.activeStepId,
  });
  requireUniqueId(state, command.stepId, "stepId");
  requireUniqueActionId(state, command.action.actionId);
  requireFutureDeadline(command.deadlineAt, command.issuedAt, "Step");

  const step: StepState = {
    stepId: command.stepId,
    sequence: run.steps.length + 1,
    status: "running",
    planRevision: command.planRevision,
    action: command.action,
    startedAt: command.issuedAt,
    updatedAt: command.issuedAt,
    ...(command.deadlineAt === undefined ? {} : { deadlineAt: command.deadlineAt }),
  };
  const nextRun: RunState = {
    ...run,
    activeStepId: step.stepId,
    steps: [...run.steps, step],
    updatedAt: command.issuedAt,
  };

  return commit(state, command, replaceRun(state, nextRun), { runId: run.runId, stepId: step.stepId });
}

function waitStep(
  state: TaskRunState,
  command: Extract<TaskCommand, { type: "wait_step" }>,
): TaskCommandAccepted {
  const run = requireActiveRun(state, command.runId, "running");
  const step = requireActiveStep(run, command.stepId, "running");
  const nextStep: StepState = {
    ...step,
    status: "waiting",
    wait: { reason: command.reason, since: command.issuedAt, context: command.context },
    updatedAt: command.issuedAt,
  };
  const nextRun: RunState = {
    ...run,
    status: "waiting",
    steps: replaceStep(run, nextStep),
    updatedAt: command.issuedAt,
  };

  return commit(
    state,
    command,
    { ...replaceRun(state, nextRun), status: "waiting" },
    { runId: run.runId, stepId: step.stepId },
  );
}

function resumeStep(
  state: TaskRunState,
  command: Extract<TaskCommand, { type: "resume_step" }>,
): TaskCommandAccepted {
  const run = requireActiveRun(state, command.runId, "waiting");
  const step = requireActiveStep(run, command.stepId, "waiting");
  const nextStep: StepState = { ...step, status: "running", updatedAt: command.issuedAt };
  delete nextStep.wait;
  const nextRun: RunState = {
    ...run,
    status: "running",
    steps: replaceStep(run, nextStep),
    updatedAt: command.issuedAt,
  };

  return commit(
    state,
    command,
    { ...replaceRun(state, nextRun), status: "running" },
    { runId: run.runId, stepId: step.stepId },
  );
}

function recordObservation(
  state: TaskRunState,
  command: Extract<TaskCommand, { type: "record_observation" }>,
): TaskCommandAccepted {
  const run = requireActiveRun(state, command.runId, ["running", "waiting"]);
  const step = requireActiveStep(run, command.stepId, ["running", "waiting"]);
  requireCondition(
    command.observation.actionId === step.action.actionId,
    "runtime.observation_action_mismatch",
    "Observation must reference the active step action",
    { actualActionId: command.observation.actionId, expectedActionId: step.action.actionId },
  );
  requireUniqueObservationId(state, command.observation.observationId);
  requireCondition(
    compareTimestamps(command.observation.observedAt, step.startedAt) >= 0
      && compareTimestamps(command.observation.observedAt, command.issuedAt) <= 0,
    "runtime.invalid_observation_time",
    "Observation time must be between step start and command time",
    { observedAt: command.observation.observedAt, stepStartedAt: step.startedAt, issuedAt: command.issuedAt },
  );

  if (command.observation.outcome === "succeeded" || command.observation.outcome === "user_rejected") {
    const nextStep = terminalStep(
      step,
      command.observation.outcome,
      command.issuedAt,
      command.observation,
      command.observation.outcome === "user_rejected" ? command.observation.error : undefined,
    );
    const nextRun: RunState = {
      ...run,
      status: "running",
      steps: replaceStep(run, nextStep),
      updatedAt: command.issuedAt,
    };
    delete nextRun.activeStepId;

    return commit(
      state,
      command,
      { ...replaceRun(state, nextRun), status: "running" },
      { runId: run.runId, stepId: step.stepId },
    );
  }

  const status = command.observation.outcome;
  const nextStep = terminalStep(step, status, command.issuedAt, command.observation, command.observation.error);
  return terminateFromRun(state, command, run, nextStep, status, command.observation.error);
}

function completeRun(
  state: TaskRunState,
  command: Extract<TaskCommand, { type: "complete_run" }>,
): TaskCommandAccepted {
  const run = requireActiveRun(state, command.runId, "running");
  requireCondition(run.activeStepId === undefined, "runtime.active_step_exists", "Active step must finish before the run", {
    activeStepId: run.activeStepId,
  });
  const nextRun: RunState = {
    ...run,
    status: "succeeded",
    updatedAt: command.issuedAt,
    endedAt: command.issuedAt,
  };
  const next = {
    ...replaceRun(state, nextRun),
    status: "completed" as const,
    endedAt: command.issuedAt,
  };
  delete next.activeRunId;

  return commit(state, command, next, { runId: run.runId });
}

function failRun(
  state: TaskRunState,
  command: Extract<TaskCommand, { type: "fail_run" }>,
): TaskCommandAccepted {
  requireCondition(
    command.error.category !== "cancelled" && command.error.category !== "timeout",
    "runtime.failure_category_mismatch",
    "fail_run cannot carry a cancellation or timeout error",
    { errorCategory: command.error.category },
  );
  const run = requireActiveRun(state, command.runId, ["running", "waiting"]);
  const activeStep = run.activeStepId === undefined
    ? undefined
    : requireActiveStep(run, run.activeStepId, ["running", "waiting"]);
  const nextStep = activeStep === undefined
    ? undefined
    : terminalStep(activeStep, "failed", command.issuedAt, undefined, command.error);

  return terminateFromRun(state, command, run, nextStep, "failed", command.error);
}

function cancelTask(
  state: TaskRunState,
  command: Extract<TaskCommand, { type: "cancel_task" }>,
): TaskCommandAccepted {
  requireCondition(isNonTerminalTask(state.status), "runtime.invalid_transition", "Only a non-terminal task can be cancelled", {
    commandType: command.type,
    taskStatus: state.status,
  });
  const error: RuntimeError = {
    code: "runtime.cancelled",
    category: "cancelled",
    message: command.reason ?? "Task was cancelled",
    retryable: false,
  };
  if (state.status === "created") {
    return terminateTaskWithoutRun(state, command, "cancelled", error);
  }
  const run = requireActiveRun(state, state.activeRunId, ["running", "waiting"]);
  const activeStep = run.activeStepId === undefined
    ? undefined
    : requireActiveStep(run, run.activeStepId, ["running", "waiting"]);
  const nextStep = activeStep === undefined
    ? undefined
    : terminalStep(activeStep, "cancelled", command.issuedAt, undefined, error);

  return terminateFromRun(state, command, run, nextStep, "cancelled", error);
}

function expireActiveTask(state: TaskRunState, command: TaskCommand, deadlineAt: string): TaskCommandAccepted {
  const run = requireActiveRun(state, state.activeRunId, ["running", "waiting"]);
  const error = deadlineError(deadlineAt);
  const activeStep = run.activeStepId === undefined
    ? undefined
    : requireActiveStep(run, run.activeStepId, ["running", "waiting"]);
  const nextStep = activeStep === undefined
    ? undefined
    : terminalStep(activeStep, "timed_out", command.issuedAt, undefined, error);

  return terminateFromRun(state, command, run, nextStep, "timed_out", error, "deadline_expired");
}

function terminateTaskWithoutRun(
  state: TaskRunState,
  command: TaskCommand,
  status: "cancelled" | "timed_out",
  error: RuntimeError,
  cause: TaskTransition["cause"] = "command",
): TaskCommandAccepted {
  return commit(
    state,
    command,
    {
      ...state,
      status,
      terminalError: error,
      endedAt: command.issuedAt,
    },
    { cause },
  );
}

function deadlineError(deadlineAt: string): RuntimeError {
  return {
    code: "runtime.deadline_exceeded",
    category: "timeout",
    message: "Task runtime deadline was reached",
    retryable: true,
    details: { deadlineAt },
  };
}

function terminateFromRun(
  state: TaskRunState,
  command: TaskCommand,
  run: RunState,
  step: StepState | undefined,
  status: "failed" | "cancelled" | "timed_out",
  error: RuntimeError,
  cause: TaskTransition["cause"] = "command",
): TaskCommandAccepted {
  const nextRun: RunState = {
    ...run,
    status,
    steps: step === undefined ? run.steps : replaceStep(run, step),
    terminalError: error,
    updatedAt: command.issuedAt,
    endedAt: command.issuedAt,
  };
  delete nextRun.activeStepId;
  const next = {
    ...replaceRun(state, nextRun),
    status: status satisfies TaskStatus,
    terminalError: error,
    endedAt: command.issuedAt,
  };
  delete next.activeRunId;

  return commit(state, command, next, {
    cause,
    runId: run.runId,
    ...(step === undefined ? {} : { stepId: step.stepId }),
  });
}

function terminalStep(
  step: StepState,
  status: "succeeded" | "failed" | "cancelled" | "timed_out" | "user_rejected",
  endedAt: string,
  observation?: Observation,
  terminalError?: RuntimeError,
): StepState {
  const next: StepState = {
    ...step,
    status,
    updatedAt: endedAt,
    endedAt,
    ...(observation === undefined ? {} : { observation }),
    ...(terminalError === undefined ? {} : { terminalError }),
  };
  delete next.wait;
  return next;
}

function commit(
  previous: TaskRunState,
  command: TaskCommand,
  draft: TaskRunState,
  context: { cause?: TaskTransition["cause"]; runId?: string; stepId?: string } = {},
): TaskCommandAccepted {
  const state = immutableState({
    ...draft,
    revision: previous.revision + 1,
    updatedAt: command.issuedAt,
  });
  const transition = TaskTransitionSchema.parse({
    commandId: command.commandId,
    commandType: command.type,
    cause: context.cause ?? "command",
    previousRevision: previous.revision,
    revision: state.revision,
    occurredAt: command.issuedAt,
    taskStatusBefore: previous.status,
    taskStatusAfter: state.status,
    ...(context.runId === undefined ? {} : { runId: context.runId }),
    ...(context.stepId === undefined ? {} : { stepId: context.stepId }),
  });
  return { accepted: true, state, transition: deepFreeze(transition) };
}

function reject(
  state: TaskRunState,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): TaskCommandRejected {
  return {
    accepted: false,
    state: immutableState(state),
    error: {
      code,
      category: "validation",
      message,
      retryable: false,
      ...(details === undefined ? {} : { details }),
    },
  };
}

function requireActiveRun(
  state: TaskRunState,
  runId: string | undefined,
  expectedStatus: RunState["status"] | readonly RunState["status"][],
): RunState {
  requireCondition(runId !== undefined && state.activeRunId === runId, "runtime.stale_run", "Command does not target the active run", {
    activeRunId: state.activeRunId,
    runId,
  });
  const run = state.runs.find((candidate) => candidate.runId === runId);
  requireCondition(run !== undefined, "runtime.run_not_found", "Active run was not found", { runId });
  requireCondition(includesStatus(expectedStatus, run.status), "runtime.invalid_transition", "Run is not in the required state", {
    expectedStatus,
    runStatus: run.status,
  });
  return run;
}

function requireActiveStep(
  run: RunState,
  stepId: string,
  expectedStatus: StepState["status"] | readonly StepState["status"][],
): StepState {
  requireCondition(run.activeStepId === stepId, "runtime.stale_step", "Command does not target the active step", {
    activeStepId: run.activeStepId,
    stepId,
  });
  const step = run.steps.find((candidate) => candidate.stepId === stepId);
  requireCondition(step !== undefined, "runtime.step_not_found", "Active step was not found", { stepId });
  requireCondition(includesStatus(expectedStatus, step.status), "runtime.invalid_transition", "Step is not in the required state", {
    expectedStatus,
    stepStatus: step.status,
  });
  return step;
}

function includesStatus<T extends string>(expected: T | readonly T[], actual: T): boolean {
  return Array.isArray(expected) ? expected.includes(actual) : expected === actual;
}

function replaceRun(state: TaskRunState, run: RunState): TaskRunState {
  return { ...state, runs: state.runs.map((candidate) => candidate.runId === run.runId ? run : candidate) };
}

function replaceStep(run: RunState, step: StepState): StepState[] {
  return run.steps.map((candidate) => candidate.stepId === step.stepId ? step : candidate);
}

function requireUniqueId(state: TaskRunState, id: string, kind: "runId" | "stepId"): void {
  const duplicate = kind === "runId"
    ? state.runs.some((run) => run.runId === id)
    : state.runs.some((run) => run.steps.some((step) => step.stepId === id));
  requireCondition(!duplicate, "runtime.duplicate_id", `${kind} must be unique within a task`, { id, kind });
}

function requireUniqueActionId(state: TaskRunState, actionId: string): void {
  const duplicate = state.runs.some((run) => run.steps.some((step) => step.action.actionId === actionId));
  requireCondition(!duplicate, "runtime.duplicate_action_id", "actionId must be unique within a task", { actionId });
}

function requireUniqueObservationId(state: TaskRunState, observationId: string): void {
  const duplicate = state.runs.some((run) =>
    run.steps.some((step) => step.observation?.observationId === observationId));
  requireCondition(!duplicate, "runtime.duplicate_observation_id", "observationId must be unique within a task", {
    observationId,
  });
}

function requireFutureDeadline(deadlineAt: string | undefined, issuedAt: string, subject: string): void {
  requireCondition(
    deadlineAt === undefined || compareTimestamps(deadlineAt, issuedAt) > 0,
    "runtime.invalid_deadline",
    `${subject} deadline must be later than command time`,
    { deadlineAt, issuedAt },
  );
}

function activeDeadline(state: TaskRunState): string | undefined {
  const deadlines = [state.deadlineAt];
  const run = state.activeRunId === undefined
    ? undefined
    : state.runs.find((candidate) => candidate.runId === state.activeRunId);
  deadlines.push(run?.deadlineAt);
  const step = run?.activeStepId === undefined
    ? undefined
    : run.steps.find((candidate) => candidate.stepId === run.activeStepId);
  deadlines.push(step?.deadlineAt);

  return deadlines
    .filter((deadline): deadline is string => deadline !== undefined)
    .sort(compareTimestamps)[0];
}

function compareTimestamps(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

function isActiveTask(status: TaskStatus): status is "running" | "waiting" {
  return status === "running" || status === "waiting";
}

function isNonTerminalTask(status: TaskStatus): status is "created" | "running" | "waiting" {
  return status === "created" || isActiveTask(status);
}

function immutableState(input: unknown): TaskRunState {
  return deepFreeze(TaskRunStateSchema.parse(input));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function requireCondition(
  condition: unknown,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): asserts condition {
  if (!condition) {
    throw new TransitionRejection({
      code,
      category: "validation",
      message,
      retryable: false,
      ...(details === undefined ? {} : { details }),
    });
  }
}

class TransitionRejection extends Error {
  readonly runtimeError: RuntimeError;

  constructor(runtimeError: RuntimeError) {
    super(runtimeError.message);
    this.name = "TransitionRejection";
    this.runtimeError = runtimeError;
  }
}
