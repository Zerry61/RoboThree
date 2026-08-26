import { describe, expect, it } from "vitest";

import type { TaskCommand, TaskInitialization } from "@robothree/contracts";

import {
  InMemoryTaskRuntime,
  createTaskRunState,
} from "../src/index.js";
import type { TaskCommandAccepted, TaskCommandResult } from "../src/index.js";

const at = {
  created: "2026-07-20T12:00:00.000Z",
  run: "2026-07-20T12:01:00.000Z",
  step: "2026-07-20T12:02:00.000Z",
  wait: "2026-07-20T12:03:00.000Z",
  resume: "2026-07-20T12:04:00.000Z",
  observation: "2026-07-20T12:05:00.000Z",
  complete: "2026-07-20T12:06:00.000Z",
  retry: "2026-07-20T12:07:00.000Z",
};

const id = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;

const entity = {
  task: id(1),
  session: id(2),
  agent: id(3),
  run1: id(4),
  run2: id(5),
  step1: id(6),
  step2: id(7),
  action1: id(8),
  action2: id(9),
  observation1: id(10),
  plan: id(11),
  planRevision: id(12),
};

let commandSequence = 100;

describe("InMemoryTaskRuntime", () => {
  it("executes a deterministic Action to Observation run", async () => {
    const runtime = createRuntime();
    await accept(runtime.dispatch(startRun()));
    await accept(runtime.dispatch(startStep()));
    const observed = await accept(runtime.dispatch(successObservation()));

    expect(observed.state.status).toBe("running");
    expect(observed.state.runs[0]?.steps[0]?.status).toBe("succeeded");
    expect(observed.state.runs[0]?.activeStepId).toBeUndefined();

    const completed = await accept(runtime.dispatch(command("complete_run", at.complete, { runId: entity.run1 })));
    expect(completed.state.status).toBe("completed");
    expect(completed.state.runs[0]?.status).toBe("succeeded");
    expect(completed.state.revision).toBe(4);
  });

  it("models interrupt and resume as explicit waiting transitions", async () => {
    const runtime = createRuntime();
    await accept(runtime.dispatch(startRun()));
    await accept(runtime.dispatch(startStep()));

    const waiting = await accept(runtime.dispatch(command("wait_step", at.wait, {
      runId: entity.run1,
      stepId: entity.step1,
      reason: "user_input",
      context: { question: "Continue?" },
    })));
    expect(waiting.state.status).toBe("waiting");
    expect(waiting.state.runs[0]?.status).toBe("waiting");
    expect(waiting.state.runs[0]?.steps[0]?.wait?.reason).toBe("user_input");

    const resumed = await accept(runtime.dispatch(command("resume_step", at.resume, {
      runId: entity.run1,
      stepId: entity.step1,
    })));
    expect(resumed.state.status).toBe("running");
    expect(resumed.state.runs[0]?.steps[0]?.wait).toBeUndefined();
  });

  it("rejects illegal transitions without changing state revision", async () => {
    const runtime = createRuntime();
    await accept(runtime.dispatch(startRun()));
    await accept(runtime.dispatch(startStep()));
    const before = runtime.snapshot;

    const result = await runtime.dispatch(command("complete_run", at.wait, { runId: entity.run1 }));
    expect(result.accepted).toBe(false);
    expect(rejected(result).error.code).toBe("runtime.active_step_exists");
    expect(runtime.snapshot.revision).toBe(before.revision);
    expect(runtime.snapshot).toEqual(before);
  });

  it("always retries into a new Run and rejects observations from the old Run", async () => {
    const runtime = createRuntime();
    await accept(runtime.dispatch(startRun()));
    await accept(runtime.dispatch(startStep()));
    const failed = await accept(runtime.dispatch(failedObservation()));
    const oldRun = failed.state.runs[0];

    const retried = await accept(runtime.dispatch(command("retry_run", at.retry, {
      failedRunId: entity.run1,
      newRunId: entity.run2,
    })));
    expect(retried.state.status).toBe("running");
    expect(retried.state.runs).toHaveLength(2);
    expect(retried.state.runs[0]).toEqual(oldRun);
    expect(retried.state.runs[1]).toMatchObject({
      runId: entity.run2,
      attempt: 2,
      retryOfRunId: entity.run1,
      status: "running",
    });

    const revision = retried.state.revision;
    const stale = await runtime.dispatch(successObservation({ issuedAt: at.retry, runId: entity.run1 }));
    expect(stale.accepted).toBe(false);
    expect(rejected(stale).error.code).toBe("runtime.stale_run");
    expect(runtime.snapshot.revision).toBe(revision);
    expect(runtime.snapshot.runs[1]?.status).toBe("running");
  });

  it("does not retry after the overall Task deadline", async () => {
    const runtime = createRuntime({ deadlineAt: at.complete });
    await accept(runtime.dispatch(startRun()));
    await accept(runtime.dispatch(startStep()));
    await accept(runtime.dispatch(failedObservation()));

    const result = await runtime.dispatch(command("retry_run", at.retry, {
      failedRunId: entity.run1,
      newRunId: entity.run2,
    }));
    expect(result.accepted).toBe(false);
    expect(rejected(result).error.code).toBe("runtime.task_deadline_exceeded");
    expect(runtime.snapshot.status).toBe("failed");
    expect(runtime.snapshot.runs).toHaveLength(1);
  });

  it("rejects timeout and cancellation categories on fail_run", async () => {
    const runtime = createRuntime();
    await accept(runtime.dispatch(startRun()));

    const result = await runtime.dispatch(command("fail_run", at.step, {
      runId: entity.run1,
      error: {
        code: "runtime.deadline_exceeded",
        category: "timeout",
        message: "Deadline reached",
        retryable: true,
      },
    }));
    expect(result.accepted).toBe(false);
    expect(rejected(result).error.code).toBe("runtime.failure_category_mismatch");
    expect(runtime.snapshot.status).toBe("running");
  });

  it("converges Task, Run, and active Step on cancellation", async () => {
    const runtime = createRuntime();
    await accept(runtime.dispatch(startRun()));
    await accept(runtime.dispatch(startStep()));

    const cancelled = await accept(runtime.dispatch(command("cancel_task", at.wait, { reason: "User stopped task" })));
    expect(cancelled.state.status).toBe("cancelled");
    expect(cancelled.state.runs[0]?.status).toBe("cancelled");
    expect(cancelled.state.runs[0]?.steps[0]?.status).toBe("cancelled");
    expect(cancelled.state.terminalError?.category).toBe("cancelled");
  });

  it("uses the earliest effective deadline and expires on equality", async () => {
    const runtime = createRuntime({ deadlineAt: "2026-07-20T12:10:00.000Z" });
    await accept(runtime.dispatch(startRun({ deadlineAt: "2026-07-20T12:08:00.000Z" })));
    await accept(runtime.dispatch(startStep({ deadlineAt: at.wait })));

    const expired = await accept(runtime.dispatch(command("expire_deadline", at.wait, {})));
    expect(expired.transition.cause).toBe("deadline_expired");
    expect(expired.state.status).toBe("timed_out");
    expect(expired.state.runs[0]?.status).toBe("timed_out");
    expect(expired.state.runs[0]?.steps[0]?.status).toBe("timed_out");
    expect(expired.state.terminalError).toMatchObject({
      code: "runtime.deadline_exceeded",
      category: "timeout",
      details: { deadlineAt: at.wait },
    });
  });

  it("times out a not-yet-started Task instead of starting after its deadline", async () => {
    const runtime = createRuntime({ deadlineAt: at.run });

    const expired = await accept(runtime.dispatch(startRun()));
    expect(expired.transition.cause).toBe("deadline_expired");
    expect(expired.state.status).toBe("timed_out");
    expect(expired.state.runs).toEqual([]);
    expect(expired.state.activeRunId).toBeUndefined();
  });

  it("can cancel a created Task without inventing a Run", async () => {
    const runtime = createRuntime();

    const cancelled = await accept(runtime.dispatch(command("cancel_task", at.run, { reason: "No longer needed" })));
    expect(cancelled.state.status).toBe("cancelled");
    expect(cancelled.state.runs).toEqual([]);
    expect(cancelled.state.terminalError?.category).toBe("cancelled");
  });

  it("serializes concurrent commands so only one active Step is created", async () => {
    const runtime = createRuntime();
    await accept(runtime.dispatch(startRun()));

    const first = runtime.dispatch(startStep());
    const second = runtime.dispatch(startStep({
      actionId: entity.action2,
      stepId: entity.step2,
    }));
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.accepted).toBe(true);
    expect(secondResult.accepted).toBe(false);
    expect(rejected(secondResult).error.code).toBe("runtime.active_step_exists");
    expect(runtime.snapshot.runs[0]?.steps).toHaveLength(1);
    expect(runtime.snapshot.runs[0]?.activeStepId).toBe(entity.step1);
    expect(runtime.snapshot.revision).toBe(2);
  });

  it("freezes snapshots exposed to callers", () => {
    const runtime = createRuntime();
    const mutableView = runtime.snapshot as unknown as { status: string };

    expect(() => {
      mutableView.status = "completed";
    }).toThrow();
    expect(runtime.snapshot.status).toBe("created");
  });
});

function createRuntime(overrides: Partial<TaskInitialization> = {}): InMemoryTaskRuntime {
  return new InMemoryTaskRuntime(
    createTaskRunState({
      taskId: entity.task,
      sessionId: entity.session,
      agentDefinition: { agentDefinitionId: entity.agent, version: "1.0.0" },
      goal: "Produce a governed artifact",
      createdAt: at.created,
      ...overrides,
    }),
  );
}

function startRun(overrides: Record<string, unknown> = {}): TaskCommand {
  return command("start_run", at.run, { runId: entity.run1, ...overrides });
}

function startStep(overrides: { actionId?: string; deadlineAt?: string; stepId?: string } = {}): TaskCommand {
  return command("start_step", at.step, {
    runId: entity.run1,
    stepId: overrides.stepId ?? entity.step1,
    planRevision: {
      executionPlanId: entity.plan,
      planRevisionId: entity.planRevision,
      revision: 1,
    },
    action: {
      actionId: overrides.actionId ?? entity.action1,
      kind: "model.generate",
      payload: { prompt: "hello" },
    },
    ...(overrides.deadlineAt === undefined ? {} : { deadlineAt: overrides.deadlineAt }),
  });
}

function successObservation(overrides: { issuedAt?: string; runId?: string } = {}): TaskCommand {
  const issuedAt = overrides.issuedAt ?? at.observation;
  return command("record_observation", issuedAt, {
    runId: overrides.runId ?? entity.run1,
    stepId: entity.step1,
    observation: {
      observationId: entity.observation1,
      actionId: entity.action1,
      observedAt: overrides.issuedAt ?? at.observation,
      outcome: "succeeded",
      output: { text: "done" },
    },
  });
}

function failedObservation(): TaskCommand {
  return command("record_observation", at.observation, {
    runId: entity.run1,
    stepId: entity.step1,
    observation: {
      observationId: entity.observation1,
      actionId: entity.action1,
      observedAt: at.observation,
      outcome: "failed",
      error: {
        code: "model.failed",
        category: "provider",
        message: "Provider failed",
        retryable: true,
      },
    },
  });
}

function command(
  type: TaskCommand["type"],
  issuedAt: string,
  payload: Record<string, unknown>,
): TaskCommand {
  commandSequence += 1;
  return {
    commandId: id(commandSequence),
    taskId: entity.task,
    issuedAt,
    type,
    ...payload,
  } as TaskCommand;
}

async function accept(resultPromise: Promise<TaskCommandResult>): Promise<TaskCommandAccepted> {
  const result = await resultPromise;
  if (!result.accepted) {
    throw new Error(`Expected accepted command, received ${result.error.code}`);
  }
  return result;
}

function rejected(result: TaskCommandResult): Exclude<TaskCommandResult, { accepted: true }> {
  if (result.accepted) {
    throw new Error("Expected rejected command");
  }
  return result;
}
