import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { RuntimeErrorSchema } from "../common/runtime-error.js";
import { TimestampSchema } from "../common/time.js";
import { ActionSchema, ObservationSchema } from "./action.js";
import { AgentDefinitionRefSchema, ExecutionPlanRevisionRefSchema } from "./definition.js";
import { JsonObjectSchema } from "./json.js";

export const SessionStatusSchema = z.enum(["active", "archived"]);

export const SessionSchema = z.object({
  sessionId: EntityIdSchema,
  status: SessionStatusSchema,
  createdAt: TimestampSchema,
  archivedAt: TimestampSchema.optional(),
}).superRefine((session, context) => {
  if ((session.status === "archived") !== (session.archivedAt !== undefined)) {
    context.addIssue({ code: "custom", message: "archived session requires archivedAt" });
  }
});

export const TaskStatusSchema = z.enum([
  "created",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
]);

export const RunStatusSchema = z.enum([
  "running",
  "waiting",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
]);

export const StepStatusSchema = z.enum([
  "running",
  "waiting",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "user_rejected",
]);

export const WaitReasonSchema = z.enum([
  "user_confirmation",
  "user_input",
  "external_dependency",
]);

export const WaitStateSchema = z.object({
  reason: WaitReasonSchema,
  since: TimestampSchema,
  context: JsonObjectSchema.default({}),
});

export const StepStateSchema = z.object({
  stepId: EntityIdSchema,
  sequence: z.number().int().positive(),
  status: StepStatusSchema,
  planRevision: ExecutionPlanRevisionRefSchema,
  action: ActionSchema,
  observation: ObservationSchema.optional(),
  wait: WaitStateSchema.optional(),
  terminalError: RuntimeErrorSchema.optional(),
  startedAt: TimestampSchema,
  updatedAt: TimestampSchema,
  endedAt: TimestampSchema.optional(),
  deadlineAt: TimestampSchema.optional(),
});

export const RunStateSchema = z.object({
  runId: EntityIdSchema,
  attempt: z.number().int().positive(),
  retryOfRunId: EntityIdSchema.optional(),
  status: RunStatusSchema,
  activeStepId: EntityIdSchema.optional(),
  steps: z.array(StepStateSchema),
  terminalError: RuntimeErrorSchema.optional(),
  startedAt: TimestampSchema,
  updatedAt: TimestampSchema,
  endedAt: TimestampSchema.optional(),
  deadlineAt: TimestampSchema.optional(),
});

const TaskRunStateShapeSchema = z.object({
  taskId: EntityIdSchema,
  sessionId: EntityIdSchema.optional(),
  agentDefinition: AgentDefinitionRefSchema,
  goal: z.string().min(1),
  status: TaskStatusSchema,
  revision: z.number().int().nonnegative(),
  activeRunId: EntityIdSchema.optional(),
  runs: z.array(RunStateSchema),
  terminalError: RuntimeErrorSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  endedAt: TimestampSchema.optional(),
  deadlineAt: TimestampSchema.optional(),
});

export const TaskInitializationSchema = z.object({
  taskId: EntityIdSchema,
  sessionId: EntityIdSchema.optional(),
  agentDefinition: AgentDefinitionRefSchema,
  goal: z.string().min(1),
  createdAt: TimestampSchema,
  deadlineAt: TimestampSchema.optional(),
});

export const TaskRunStateSchema = TaskRunStateShapeSchema.superRefine((state, context) => {
  const activeTask = state.status === "running" || state.status === "waiting";
  const runIds = new Set<string>();

  if (state.status === "created" && state.runs.length !== 0) {
    context.addIssue({ code: "custom", message: "created task must have no runs" });
  }
  if (
    state.runs.length === 0
    && state.status !== "created"
    && state.status !== "cancelled"
    && state.status !== "timed_out"
  ) {
    context.addIssue({ code: "custom", message: "task without runs can only be created, cancelled, or timed out" });
  }
  if (activeTask !== (state.activeRunId !== undefined)) {
    context.addIssue({ code: "custom", message: "active task must reference exactly one active run" });
  }

  for (const [runIndex, run] of state.runs.entries()) {
    if (runIds.has(run.runId)) {
      context.addIssue({ code: "custom", message: `duplicate runId ${run.runId}` });
    }
    runIds.add(run.runId);
    if (run.attempt !== runIndex + 1) {
      context.addIssue({ code: "custom", message: "run attempts must be contiguous and ordered" });
    }

    const stepIds = new Set<string>();
    const activeRun = run.status === "running" || run.status === "waiting";
    if (!activeRun && run.activeStepId !== undefined) {
      context.addIssue({ code: "custom", message: "terminal run cannot reference an active step" });
    }
    if (run.status === "waiting" && run.activeStepId === undefined) {
      context.addIssue({ code: "custom", message: "waiting run must reference an active step" });
    }
    if (!activeRun && run.endedAt === undefined) {
      context.addIssue({ code: "custom", message: "terminal run requires endedAt" });
    }
    if (runIndex === 0 && run.retryOfRunId !== undefined) {
      context.addIssue({ code: "custom", message: "first run cannot be a retry" });
    }
    if (runIndex > 0 && run.retryOfRunId !== state.runs[runIndex - 1]?.runId) {
      context.addIssue({ code: "custom", message: "every later run must retry the immediately previous run" });
    }
    if (activeRun && (run.endedAt !== undefined || run.terminalError !== undefined)) {
      context.addIssue({ code: "custom", message: "active run cannot contain terminal metadata" });
    }
    if (run.status === "succeeded" && run.terminalError !== undefined) {
      context.addIssue({ code: "custom", message: "succeeded run cannot contain terminalError" });
    }
    if (
      (run.status === "failed" || run.status === "cancelled" || run.status === "timed_out")
      && run.terminalError === undefined
    ) {
      context.addIssue({ code: "custom", message: "unsuccessful terminal run requires terminalError" });
    }
    if (!terminalErrorMatchesStatus(run.status, run.terminalError?.category)) {
      context.addIssue({ code: "custom", message: "run status and terminalError category must agree" });
    }

    for (const [stepIndex, step] of run.steps.entries()) {
      if (stepIds.has(step.stepId)) {
        context.addIssue({ code: "custom", message: `duplicate stepId ${step.stepId}` });
      }
      stepIds.add(step.stepId);
      if (step.sequence !== stepIndex + 1) {
        context.addIssue({ code: "custom", message: "step sequence must be contiguous and ordered" });
      }
      if (step.observation !== undefined && step.observation.actionId !== step.action.actionId) {
        context.addIssue({ code: "custom", message: "observation must reference the step action" });
      }
      if ((step.status === "waiting") !== (step.wait !== undefined)) {
        context.addIssue({ code: "custom", message: "only a waiting step can contain wait state" });
      }
      if (step.status !== "running" && step.status !== "waiting" && step.endedAt === undefined) {
        context.addIssue({ code: "custom", message: "terminal step requires endedAt" });
      }
      if (
        (step.status === "running" || step.status === "waiting")
        && (step.endedAt !== undefined || step.terminalError !== undefined || step.observation !== undefined)
      ) {
        context.addIssue({ code: "custom", message: "active step cannot contain terminal metadata" });
      }
      if (step.status === "succeeded" && step.observation?.outcome !== "succeeded") {
        context.addIssue({ code: "custom", message: "succeeded step requires a succeeded observation" });
      }
      if (step.status === "succeeded" && step.terminalError !== undefined) {
        context.addIssue({ code: "custom", message: "succeeded step cannot contain terminalError" });
      }
      if (
        (step.status === "failed" || step.status === "cancelled" || step.status === "timed_out" || step.status === "user_rejected")
        && step.terminalError === undefined
      ) {
        context.addIssue({ code: "custom", message: "unsuccessful terminal step requires terminalError" });
      }
      if (!terminalErrorMatchesStatus(step.status, step.terminalError?.category)) {
        context.addIssue({ code: "custom", message: "step status and terminalError category must agree" });
      }
      if (step.observation !== undefined && step.observation.outcome !== step.status) {
        context.addIssue({ code: "custom", message: "terminal step status must match its observation outcome" });
      }
    }

    if (run.activeStepId !== undefined) {
      const activeStep = run.steps.find((step) => step.stepId === run.activeStepId);
      if (activeStep === undefined || (activeStep.status !== "running" && activeStep.status !== "waiting")) {
        context.addIssue({ code: "custom", message: "activeStepId must reference a non-terminal step" });
      }
      if (run.status === "waiting" && activeStep?.status !== "waiting") {
        context.addIssue({ code: "custom", message: "waiting run must reference a waiting step" });
      }
      if (run.status === "running" && activeStep?.status !== "running") {
        context.addIssue({ code: "custom", message: "running run must reference a running step" });
      }
    }
  }

  if (state.activeRunId !== undefined) {
    const activeRun = state.runs.find((run) => run.runId === state.activeRunId);
    if (activeRun === undefined || (activeRun.status !== "running" && activeRun.status !== "waiting")) {
      context.addIssue({ code: "custom", message: "activeRunId must reference a non-terminal run" });
    }
    if (state.status === "waiting" && activeRun?.status !== "waiting") {
      context.addIssue({ code: "custom", message: "waiting task must reference a waiting run" });
    }
  }

  if (!activeTask && state.status !== "created") {
    const lastRun = state.runs.at(-1);
    const expectedRunStatus = state.status === "completed"
      ? "succeeded"
      : state.status;
    if (
      (lastRun !== undefined && lastRun.status !== expectedRunStatus)
      || (lastRun === undefined && state.status !== "cancelled" && state.status !== "timed_out")
      || state.endedAt === undefined
    ) {
      context.addIssue({ code: "custom", message: "terminal task must match its latest terminal run" });
    }
  }
  if ((activeTask || state.status === "created") && (state.endedAt !== undefined || state.terminalError !== undefined)) {
    context.addIssue({ code: "custom", message: "non-terminal task cannot contain terminal metadata" });
  }
  if (state.status === "completed" && state.terminalError !== undefined) {
    context.addIssue({ code: "custom", message: "completed task cannot contain terminalError" });
  }
  if (
    (state.status === "failed" || state.status === "cancelled" || state.status === "timed_out")
    && state.terminalError === undefined
  ) {
    context.addIssue({ code: "custom", message: "unsuccessful terminal task requires terminalError" });
  }
  if (!terminalErrorMatchesStatus(state.status, state.terminalError?.category)) {
    context.addIssue({ code: "custom", message: "task status and terminalError category must agree" });
  }
});

function terminalErrorMatchesStatus(status: string, category: string | undefined): boolean {
  if (status === "cancelled") {
    return category === "cancelled";
  }
  if (status === "timed_out") {
    return category === "timeout";
  }
  if (status === "failed") {
    return category !== undefined && category !== "cancelled" && category !== "timeout";
  }
  if (status === "user_rejected") {
    return category === "authorization";
  }
  return category === undefined;
}

export type Session = z.infer<typeof SessionSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type StepStatus = z.infer<typeof StepStatusSchema>;
export type WaitReason = z.infer<typeof WaitReasonSchema>;
export type WaitState = z.infer<typeof WaitStateSchema>;
export type StepState = z.infer<typeof StepStateSchema>;
export type RunState = z.infer<typeof RunStateSchema>;
export type TaskRunState = z.infer<typeof TaskRunStateSchema>;
export type TaskInitialization = z.infer<typeof TaskInitializationSchema>;
