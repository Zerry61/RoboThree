import {
  CONTRACT_VERSION,
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
} from "@robothree/contracts";
import type {
  PersistedUserConfirmation,
  RuntimeError,
  TaskCommand,
  TaskRunState,
} from "@robothree/contracts";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CoordinatorDesktopConfirmationDecisionGateway,
  DesktopTaskControlService,
  DurableTaskRuntime,
  FakeClock,
  SqliteConversationPersistence,
  SqliteTaskPersistence,
  SystemIdGenerator,
  UserConfirmationCoordinator,
  createConfirmationRequest,
  projectUserConfirmationForDesktop,
  sha256CanonicalJson,
} from "../src/index.js";

const at = "2026-07-27T12:00:00.000Z";
const activeUserId = "00000000-0000-4000-8000-000000000001";
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe("DCF-2C durable Task recovery matrix", () => {
  it("restores running and waiting_input Tasks, then persists the exact input once", async () => {
    await withRecoveryDatabase(async (databasePath) => {
      const identity = createIdentity();
      const first = await openHarness(databasePath, identity, true);
      const running = await startActiveStep(first);
      expect(running.status).toBe("running");
      await first.close();

      const reopenedRunning = await openHarness(databasePath, identity);
      expect(await reopenedRunning.runtime.snapshot(identity.taskId))
        .toEqual(running);
      const waiting = await waitFor(
        reopenedRunning,
        activeStepIds(running),
        "user_input",
      );
      await reopenedRunning.close();

      const reopenedWaiting = await openHarness(databasePath, identity);
      expect(await reopenedWaiting.runtime.snapshot(identity.taskId))
        .toEqual(waiting);
      const command = {
        ...commandMeta(),
        type: "provide_task_input" as const,
        taskId: desktopId("task", identity.taskId),
        expectedTaskRevision: waiting.revision,
        input: "Continue with the bounded recovery fixture.",
      };
      await expect(reopenedWaiting.service.execute(command)).resolves
        .toMatchObject({
          ok: true,
          value: { status: "accepted" },
        });
      await expect(reopenedWaiting.service.execute(command)).resolves
        .toMatchObject({
          ok: true,
          value: { status: "replayed" },
        });
      expect(await reopenedWaiting.conversation.loadMessageById(
        command.commandId,
      )).toMatchObject({
        envelope: { taskId: identity.taskId },
        message: { role: "user" },
      });
      expect(await reopenedWaiting.runtime.snapshot(identity.taskId))
        .toMatchObject({ status: "running" });
      await reopenedWaiting.close();

      const final = await openHarness(databasePath, identity);
      expect(await final.runtime.snapshot(identity.taskId))
        .toMatchObject({ status: "running" });
      expect(await final.conversation.loadMessageById(command.commandId))
        .toBeDefined();
      await final.close();
    });
  });

  it("restores waiting_user_confirmation and converges a confirmed decision after restart", async () => {
    await withRecoveryDatabase(async (databasePath) => {
      const identity = createIdentity();
      const first = await openHarness(databasePath, identity, true);
      const running = await startActiveStep(first);
      const request = await requestConfirmation(first, running);
      const waiting = await first.runtime.snapshot(identity.taskId);
      expect(waiting).toMatchObject({
        status: "waiting",
        runs: [{
          steps: [{ wait: { reason: "user_confirmation" } }],
        }],
      });
      await first.close();

      const reopened = await openHarness(databasePath, identity);
      const record = await reopened.tasks.loadUserConfirmation(
        request.confirmationId,
      );
      expect(record).toEqual({ request });
      if (record === undefined) throw new Error("confirmation was not restored");
      const projection = projectUserConfirmationForDesktop(
        record,
        reopened.clock.now(),
      );
      const state = await requireSnapshot(reopened);
      const decision = {
        ...commandMeta(),
        type: "decide_user_confirmation" as const,
        taskId: desktopId("task", identity.taskId),
        expectedTaskRevision: state.revision,
        confirmationId: projection.confirmationId,
        requestDigest: projection.requestDigest,
        decision: "confirmed" as const,
      };
      await expect(reopened.service.execute(decision)).resolves.toMatchObject({
        ok: true,
        value: { status: "accepted" },
      });
      expect(await reopened.runtime.snapshot(identity.taskId))
        .toMatchObject({ status: "running" });
      await reopened.close();

      const final = await openHarness(databasePath, identity);
      expect(await final.tasks.loadUserConfirmation(request.confirmationId))
        .toMatchObject({
          decision: {
            decisionId: decision.commandId,
            decision: "confirmed",
            decidedByUserId: activeUserId,
          },
        });
      expect(await final.runtime.snapshot(identity.taskId))
        .toMatchObject({ status: "running" });
      await expect(final.service.execute(decision)).resolves.toMatchObject({
        ok: true,
        value: { status: "replayed" },
      });
      await final.close();
    });
  });

  it("restores a rejected decision without inventing another decision or side effect", async () => {
    await withRecoveryDatabase(async (databasePath) => {
      const identity = createIdentity();
      const first = await openHarness(databasePath, identity, true);
      const running = await startActiveStep(first);
      const request = await requestConfirmation(first, running);
      const record = await first.tasks.loadUserConfirmation(
        request.confirmationId,
      );
      if (record === undefined) throw new Error("confirmation is unavailable");
      const projection = projectUserConfirmationForDesktop(
        record,
        first.clock.now(),
      );
      const waiting = await requireSnapshot(first);
      const decision = {
        ...commandMeta(),
        type: "decide_user_confirmation" as const,
        taskId: desktopId("task", identity.taskId),
        expectedTaskRevision: waiting.revision,
        confirmationId: projection.confirmationId,
        requestDigest: projection.requestDigest,
        decision: "rejected" as const,
      };
      await expect(first.service.execute(decision)).resolves.toMatchObject({
        ok: true,
        value: { status: "accepted" },
      });
      const rejectedState = await requireSnapshot(first);
      expect(rejectedState.runs[0]?.steps[0]).toMatchObject({
        status: "user_rejected",
        observation: { outcome: "user_rejected" },
      });
      await first.close();

      const reopened = await openHarness(databasePath, identity);
      expect(await reopened.runtime.snapshot(identity.taskId))
        .toEqual(rejectedState);
      await expect(reopened.service.execute(decision)).resolves.toMatchObject({
        ok: true,
        value: { status: "replayed" },
      });
      expect(await reopened.tasks.listEffectAttemptsByTask(identity.taskId))
        .toEqual([]);
      await reopened.close();
    });
  });

  it("keeps cancel terminal state and exact command replay across restart", async () => {
    await withRecoveryDatabase(async (databasePath) => {
      const identity = createIdentity();
      const first = await openHarness(databasePath, identity, true);
      const running = await startActiveStep(first);
      const waiting = await waitFor(
        first,
        activeStepIds(running),
        "external_dependency",
      );
      const command = {
        ...commandMeta(),
        type: "cancel_task" as const,
        taskId: desktopId("task", identity.taskId),
        expectedTaskRevision: waiting.revision,
        reasonSummary: "Cancelled during the recovery matrix.",
      };
      await expect(first.service.execute(command)).resolves.toMatchObject({
        ok: true,
        value: { status: "accepted" },
      });
      const cancelled = await requireSnapshot(first);
      expect(cancelled.status).toBe("cancelled");
      await first.close();

      const reopened = await openHarness(databasePath, identity);
      expect(await reopened.runtime.snapshot(identity.taskId))
        .toEqual(cancelled);
      await expect(reopened.service.execute(command)).resolves.toMatchObject({
        ok: true,
        value: { status: "replayed" },
      });
      expect(reopened.execution.cancelCount).toBe(0);
      await reopened.close();
    });
  });

  it("isolates a late Observation from the new retry Run after restart", async () => {
    await withRecoveryDatabase(async (databasePath) => {
      const identity = createIdentity();
      const first = await openHarness(databasePath, identity, true);
      const running = await startActiveStep(first);
      const active = activeStepIds(running);
      const failed = await dispatchAccepted(first.runtime, {
        commandId: randomUUID(),
        taskId: identity.taskId,
        type: "record_observation",
        issuedAt: at,
        runId: active.runId,
        stepId: active.stepId,
        observation: {
          observationId: randomUUID(),
          actionId: active.actionId,
          observedAt: at,
          outcome: "failed",
          error: {
            code: "fixture.retryable",
            category: "provider",
            message: "Synthetic retryable failure",
            retryable: true,
          },
        },
      });
      const retry = {
        ...commandMeta(),
        type: "retry_task" as const,
        taskId: desktopId("task", identity.taskId),
        expectedTaskRevision: failed.revision,
      };
      await expect(first.service.execute(retry)).resolves.toMatchObject({
        ok: true,
        value: { status: "accepted" },
      });
      const retried = await requireSnapshot(first);
      expect(retried.runs).toMatchObject([
        { runId: active.runId, status: "failed", attempt: 1 },
        { status: "running", attempt: 2, retryOfRunId: active.runId },
      ]);
      await first.close();

      const reopened = await openHarness(databasePath, identity);
      const beforeLate = await requireSnapshot(reopened);
      const lateCommandId = randomUUID();
      const late = await reopened.runtime.dispatch({
        commandId: lateCommandId,
        taskId: identity.taskId,
        type: "record_observation",
        issuedAt: at,
        runId: active.runId,
        stepId: active.stepId,
        observation: {
          observationId: randomUUID(),
          actionId: active.actionId,
          observedAt: at,
          outcome: "succeeded",
          output: { recovered: true },
        },
      });
      expect(late).toMatchObject({
        accepted: false,
        error: { code: "runtime.stale_run" },
      });
      expect(await reopened.runtime.snapshot(identity.taskId))
        .toEqual(beforeLate);
      expect(await reopened.tasks.findCommandReceipt(lateCommandId))
        .toMatchObject({
          outcome: "rejected",
          stateRevision: beforeLate.revision,
          error: { code: "runtime.stale_run" },
        });
      expect(await reopened.tasks.loadEventsAfter(identity.taskId, 0))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({
            type: "runtime.command_rejected",
            causationId: lateCommandId,
            runId: active.runId,
            stepId: active.stepId,
            payload: expect.objectContaining({
              rejectionCode: "runtime.stale_run",
              outcome: "succeeded",
            }),
          }),
        ]));
      await reopened.close();
    });
  });
});

type Identity = Readonly<{
  taskId: string;
  sessionId: string;
  agentDefinitionId: string;
}>;

type Harness = Awaited<ReturnType<typeof openHarness>>;

function createIdentity(): Identity {
  return {
    taskId: randomUUID(),
    sessionId: randomUUID(),
    agentDefinitionId: randomUUID(),
  };
}

async function openHarness(
  databasePath: string,
  identity: Identity,
  initialize = false,
) {
  const clock = new FakeClock(at);
  const tasks = new SqliteTaskPersistence({ databasePath, clock });
  const conversation = new SqliteConversationPersistence({
    databasePath,
    clock,
  });
  await tasks.start();
  await conversation.start();
  const ids = new SystemIdGenerator();
  const runtime = new DurableTaskRuntime({
    persistence: tasks,
    idGenerator: ids,
  });
  const coordinator = new UserConfirmationCoordinator({
    runtime,
    persistence: tasks,
    clock,
    idGenerator: ids,
  });
  const execution = { cancelCount: 0, resumeCount: 0 };
  const service = new DesktopTaskControlService({
    runtime,
    tasks,
    conversation,
    confirmations: new CoordinatorDesktopConfirmationDecisionGateway({
      coordinator,
      revalidateConfirmed: async (
        _record: PersistedUserConfirmation,
      ): Promise<RuntimeError | undefined> => undefined,
    }),
    execution: {
      cancel: () => {
        execution.cancelCount += 1;
      },
      resume: async () => {
        execution.resumeCount += 1;
      },
    },
    clock,
    activeUserId,
  });
  if (initialize) {
    const session = await conversation.createSession({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      sessionId: identity.sessionId,
      messageSequence: 0,
      sessionEventSequence: 0,
      contextRevision: 0,
      createdAt: at,
      updatedAt: at,
    });
    if (!session.ok) throw new Error(session.error.message);
    const task = await runtime.createTask({
      taskId: identity.taskId,
      sessionId: identity.sessionId,
      agentDefinition: {
        agentDefinitionId: identity.agentDefinitionId,
        version: "1.0.0",
      },
      goal: "Execute the DCF-2C recovery matrix",
      createdAt: at,
    });
    if (!task.ok) throw new Error(task.error.message);
  }
  return {
    clock,
    tasks,
    conversation,
    runtime,
    coordinator,
    service,
    execution,
    identity,
    async close() {
      await conversation.stop();
      await tasks.stop();
    },
  };
}

async function startActiveStep(harness: Harness): Promise<TaskRunState> {
  const runId = randomUUID();
  const stepId = randomUUID();
  for (const command of [
    {
      commandId: randomUUID(),
      taskId: harness.identity.taskId,
      type: "start_run" as const,
      issuedAt: at,
      runId,
    },
    {
      commandId: randomUUID(),
      taskId: harness.identity.taskId,
      type: "start_step" as const,
      issuedAt: at,
      runId,
      stepId,
      planRevision: {
        executionPlanId: randomUUID(),
        planRevisionId: randomUUID(),
        revision: 1,
      },
      action: {
        actionId: randomUUID(),
        kind: "tool.invoke",
        payload: {},
      },
    },
  ]) {
    await dispatchAccepted(harness.runtime, command);
  }
  return requireSnapshot(harness);
}

async function waitFor(
  harness: Harness,
  active: ReturnType<typeof activeStepIds>,
  reason: "user_input" | "external_dependency",
): Promise<TaskRunState> {
  return dispatchAccepted(harness.runtime, {
    commandId: randomUUID(),
    taskId: harness.identity.taskId,
    type: "wait_step",
    issuedAt: at,
    runId: active.runId,
    stepId: active.stepId,
    reason,
    context: {},
  });
}

async function requestConfirmation(
  harness: Harness,
  state: TaskRunState,
) {
  const active = activeStepIds(state);
  const request = createConfirmationRequest({
    confirmationId: randomUUID(),
    scope: {
      schemaVersion: CONTRACT_VERSION,
      type: "single_action",
      taskId: harness.identity.taskId,
      runId: active.runId,
      stepId: active.stepId,
      actionId: active.actionId,
      actionDigest: sha256CanonicalJson(JsonValueSchema.parse(active.action)),
      toolCapabilityRevision: digest("a"),
      bindingRevision: digest("b"),
      adapterDescriptorRevision: digest("c"),
    },
    runId: active.runId,
    stepId: active.stepId,
    actionId: active.actionId,
    requestedAt: at,
  });
  const result = await harness.coordinator.request(request);
  if (!result.accepted) throw new Error(result.error.message);
  return request;
}

function activeStepIds(state: TaskRunState) {
  const run = state.runs.find((candidate) =>
    candidate.runId === state.activeRunId);
  const step = run?.steps.find((candidate) =>
    candidate.stepId === run.activeStepId);
  if (run === undefined || step === undefined) {
    throw new Error("active Run/Step is unavailable");
  }
  return {
    runId: run.runId,
    stepId: step.stepId,
    actionId: step.action.actionId,
    action: step.action,
  };
}

async function dispatchAccepted(
  runtime: DurableTaskRuntime,
  command: TaskCommand,
): Promise<TaskRunState> {
  const result = await runtime.dispatch(command);
  if (!result.accepted) throw new Error(result.error.message);
  return result.state;
}

async function requireSnapshot(harness: Harness): Promise<TaskRunState> {
  const state = await harness.runtime.snapshot(harness.identity.taskId);
  if (state === undefined) throw new Error("Task is unavailable");
  return state;
}

async function withRecoveryDatabase(
  operation: (databasePath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dcf2c-"));
  try {
    await operation(join(directory, "robothree.sqlite"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function commandMeta(commandId = randomUUID()) {
  return {
    contractVersion: "v1alpha1" as const,
    commandId,
    correlationId: randomUUID(),
    clientInstanceId: randomUUID(),
  };
}

function desktopId(namespace: string, value: string): string {
  return `${namespace}:${value}`;
}
