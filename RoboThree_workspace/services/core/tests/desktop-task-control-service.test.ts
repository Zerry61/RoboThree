import {
  CONTRACT_VERSION,
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  UserConfirmationRequestSchema,
} from "@robothree/contracts";
import type {
  PersistedUserConfirmation,
  RuntimeError,
} from "@robothree/contracts";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  CoordinatorDesktopConfirmationDecisionGateway,
  DesktopTaskControlService,
  DurableTaskRuntime,
  FakeClock,
  InMemoryConversationPersistence,
  InMemoryTaskPersistence,
  SystemIdGenerator,
  UserConfirmationCoordinator,
  createConfirmationRequest,
  projectUserConfirmationForDesktop,
  sha256CanonicalJson,
} from "../src/index.js";

const at = "2026-07-27T12:00:00.000Z";
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const activeUserId = "00000000-0000-4000-8000-000000000001";

describe("DCF-2B Desktop Task Control", () => {
  it("cancels once, replays the exact command and rejects commandId drift", async () => {
    const harness = await createHarness();
    try {
      const waiting = await runningTask(harness, "external_dependency");
      const commandId = randomUUID();
      const command = {
        ...commandMeta(commandId),
        type: "cancel_task" as const,
        taskId: desktopId("task", harness.taskId),
        expectedTaskRevision: waiting.revision,
        reasonSummary: "Cancelled by the user.",
      };
      await expect(harness.service.execute(command)).resolves.toMatchObject({
        ok: true,
        value: { status: "accepted", taskRevision: waiting.revision + 1 },
      });
      expect(harness.execution.cancel).toHaveBeenCalledWith(harness.taskId);
      await expect(harness.service.execute(command)).resolves.toMatchObject({
        ok: true,
        value: { status: "replayed" },
      });
      expect(harness.execution.cancel).toHaveBeenCalledTimes(1);
      await expect(harness.service.execute({
        ...command,
        reasonSummary: "A different request.",
      })).resolves.toMatchObject({
        ok: false,
        error: { code: "desktop.command_idempotency_conflict" },
      });
    } finally {
      await harness.cleanup();
    }
  });

  it("retries into a new Run and continues only external-dependency waits", async () => {
    const harness = await createHarness();
    try {
      const running = await runningTask(harness, "external_dependency");
      const cancelled = await harness.runtime.dispatch({
        commandId: randomUUID(),
        taskId: harness.taskId,
        type: "cancel_task",
        issuedAt: at,
      });
      if (!cancelled.accepted) throw new Error(cancelled.error.message);
      const retry = await harness.service.execute({
        ...commandMeta(),
        type: "retry_task",
        taskId: desktopId("task", harness.taskId),
        expectedTaskRevision: cancelled.state.revision,
      });
      expect(retry).toMatchObject({
        ok: true,
        value: { status: "accepted", taskRevision: cancelled.state.revision + 1 },
      });
      const retried = await harness.runtime.snapshot(harness.taskId);
      expect(retried).toMatchObject({
        status: "running",
        runs: [
          { status: "cancelled", attempt: 1 },
          { status: "running", attempt: 2 },
        ],
      });
      expect(retried?.runs[1]?.retryOfRunId).toBe(running.runs[0]?.runId);
      expect(harness.execution.resume).toHaveBeenCalledWith(harness.taskId);
    } finally {
      await harness.cleanup();
    }

    const continueHarness = await createHarness();
    try {
      const waiting = await runningTask(
        continueHarness,
        "external_dependency",
      );
      await expect(continueHarness.service.execute({
        ...commandMeta(),
        type: "continue_task",
        taskId: desktopId("task", continueHarness.taskId),
        expectedTaskRevision: waiting.revision,
      })).resolves.toMatchObject({
        ok: true,
        value: { status: "accepted" },
      });
      expect(await continueHarness.runtime.snapshot(
        continueHarness.taskId,
      )).toMatchObject({ status: "running" });
    } finally {
      await continueHarness.cleanup();
    }
  });

  it("persists bounded user input before resuming the exact waiting Step", async () => {
    const harness = await createHarness();
    try {
      const waiting = await runningTask(harness, "user_input");
      const commandId = randomUUID();
      await expect(harness.service.execute({
        ...commandMeta(commandId),
        type: "provide_task_input",
        taskId: desktopId("task", harness.taskId),
        expectedTaskRevision: waiting.revision,
        input: "Use the finance workspace for the next step.",
      })).resolves.toMatchObject({
        ok: true,
        value: { status: "accepted" },
      });
      expect(await harness.conversation.loadMessageById(commandId))
        .toMatchObject({
          envelope: { taskId: harness.taskId },
          message: {
            role: "user",
            content: [{
              type: "text",
              text: "Use the finance workspace for the next step.",
            }],
          },
        });
      expect(await harness.runtime.snapshot(harness.taskId))
        .toMatchObject({ status: "running" });
    } finally {
      await harness.cleanup();
    }
  });

  it("binds a confirmation to Task/Step/Action/request digest and rechecks before confirm", async () => {
    const recheck = vi.fn(async () => undefined);
    const harness = await createHarness(recheck);
    try {
      await runningTask(harness);
      const request = await requestConfirmation(harness);
      const state = await harness.runtime.snapshot(harness.taskId);
      if (state === undefined) throw new Error("Task is unavailable");
      const projection = projectUserConfirmationForDesktop(
        { request },
        harness.clock.now(),
      );
      expect(projection).toMatchObject({
        status: "pending",
        taskId: desktopId("task", harness.taskId),
      });
      expect(JSON.stringify(projection)).not.toContain("actionDigest");
      const command = {
        ...commandMeta(),
        type: "decide_user_confirmation" as const,
        taskId: desktopId("task", harness.taskId),
        expectedTaskRevision: state.revision,
        confirmationId: projection.confirmationId,
        requestDigest: projection.requestDigest,
        decision: "confirmed" as const,
      };
      await expect(harness.service.execute(command)).resolves.toMatchObject({
        ok: true,
        value: { status: "accepted" },
      });
      expect(recheck).toHaveBeenCalledTimes(1);
      expect(await harness.persistence.loadUserConfirmation(
        request.confirmationId,
      )).toMatchObject({
        decision: {
          decision: "confirmed",
          decidedByUserId: activeUserId,
        },
      });
      await expect(harness.service.execute(command)).resolves.toMatchObject({
        ok: true,
        value: { status: "replayed" },
      });
      expect(recheck).toHaveBeenCalledTimes(1);
      await expect(harness.service.execute({
        ...command,
        decision: "rejected",
      })).resolves.toMatchObject({
        ok: false,
        error: { code: "desktop.confirmation_duplicate_decision" },
      });
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects expired and mismatched confirmation decisions without changing Task revision", async () => {
    const harness = await createHarness();
    try {
      await runningTask(harness);
      const request = await requestConfirmation(
        harness,
        "2026-07-27T12:01:00.000Z",
      );
      const waiting = await harness.runtime.snapshot(harness.taskId);
      if (waiting === undefined) throw new Error("Task is unavailable");
      harness.clock.set("2026-07-27T12:02:00.000Z");
      const projection = projectUserConfirmationForDesktop(
        { request },
        harness.clock.now(),
      );
      expect(projection.status).toBe("expired");
      await expect(harness.service.execute({
        ...commandMeta(),
        type: "decide_user_confirmation",
        taskId: desktopId("task", harness.taskId),
        expectedTaskRevision: waiting.revision,
        confirmationId: projection.confirmationId,
        requestDigest: projection.requestDigest,
        decision: "confirmed",
      })).resolves.toMatchObject({
        ok: false,
        error: { code: "desktop.confirmation_expired" },
      });
      expect((await harness.runtime.snapshot(harness.taskId))?.revision)
        .toBe(waiting.revision);
      expect((await harness.persistence.loadUserConfirmation(
        request.confirmationId,
      ))?.decision).toBeUndefined();
    } finally {
      await harness.cleanup();
    }
  });
});

async function createHarness(
  revalidateConfirmed: (
    record: PersistedUserConfirmation,
  ) => Promise<RuntimeError | undefined> = async () => undefined,
) {
  const clock = new FakeClock(at);
  const ids = new SystemIdGenerator();
  const persistence = new InMemoryTaskPersistence(clock);
  const conversation = new InMemoryConversationPersistence({ clock });
  await persistence.start();
  await conversation.start();
  const sessionId = randomUUID();
  await conversation.createSession({
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    sessionId,
    messageSequence: 0,
    sessionEventSequence: 0,
    contextRevision: 0,
    createdAt: at,
    updatedAt: at,
  });
  const runtime = new DurableTaskRuntime({
    persistence,
    idGenerator: ids,
  });
  const confirmations = new UserConfirmationCoordinator({
    runtime,
    persistence,
    clock,
    idGenerator: ids,
  });
  const execution = {
    cancel: vi.fn(),
    resume: vi.fn(async () => undefined),
  };
  const taskId = randomUUID();
  const service = new DesktopTaskControlService({
    runtime,
    tasks: persistence,
    conversation,
    confirmations: new CoordinatorDesktopConfirmationDecisionGateway({
      coordinator: confirmations,
      revalidateConfirmed,
    }),
    execution,
    clock,
    activeUserId,
  });
  const created = await runtime.createTask({
    taskId,
    sessionId,
    agentDefinition: {
      agentDefinitionId: randomUUID(),
      version: "1.0.0",
    },
    goal: "Exercise Desktop Task Control",
    createdAt: at,
  });
  if (!created.ok) throw new Error(created.error.message);
  return {
    clock,
    ids,
    persistence,
    conversation,
    runtime,
    confirmations,
    execution,
    service,
    taskId,
    sessionId,
    async cleanup() {
      await conversation.stop();
      await persistence.stop();
    },
  };
}

async function runningTask(
  harness: Awaited<ReturnType<typeof createHarness>>,
  waitReason?: "user_input" | "external_dependency",
) {
  const runId = randomUUID();
  const stepId = randomUUID();
  const actionId = randomUUID();
  for (const command of [
    {
      commandId: randomUUID(),
      taskId: harness.taskId,
      type: "start_run" as const,
      issuedAt: at,
      runId,
    },
    {
      commandId: randomUUID(),
      taskId: harness.taskId,
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
        actionId,
        kind: "tool.invoke",
        payload: {},
      },
    },
  ]) {
    const result = await harness.runtime.dispatch(command);
    if (!result.accepted) throw new Error(result.error.message);
  }
  if (waitReason !== undefined) {
    const waiting = await harness.runtime.dispatch({
      commandId: randomUUID(),
      taskId: harness.taskId,
      type: "wait_step",
      issuedAt: at,
      runId,
      stepId,
      reason: waitReason,
      context: {},
    });
    if (!waiting.accepted) throw new Error(waiting.error.message);
    return waiting.state;
  }
  const state = await harness.runtime.snapshot(harness.taskId);
  if (state === undefined) throw new Error("Task is unavailable");
  return state;
}

async function requestConfirmation(
  harness: Awaited<ReturnType<typeof createHarness>>,
  expiresAt?: string,
) {
  const state = await harness.runtime.snapshot(harness.taskId);
  const run = state?.runs.find((candidate) =>
    candidate.runId === state.activeRunId);
  const step = run?.steps.find((candidate) =>
    candidate.stepId === run.activeStepId);
  if (state === undefined || run === undefined || step === undefined) {
    throw new Error("Active action is unavailable");
  }
  const base = createConfirmationRequest({
    confirmationId: randomUUID(),
    scope: {
      schemaVersion: CONTRACT_VERSION,
      type: "single_action",
      taskId: harness.taskId,
      runId: run.runId,
      stepId: step.stepId,
      actionId: step.action.actionId,
      actionDigest: sha256CanonicalJson(JsonValueSchema.parse(step.action)),
      toolCapabilityRevision: digest("a"),
      bindingRevision: digest("b"),
      adapterDescriptorRevision: digest("c"),
    },
    runId: run.runId,
    stepId: step.stepId,
    actionId: step.action.actionId,
    requestedAt: at,
  });
  const request = UserConfirmationRequestSchema.parse({
    ...base,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  });
  const outcome = await harness.confirmations.request(request);
  if (!outcome.accepted) throw new Error(outcome.error.message);
  return request;
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
