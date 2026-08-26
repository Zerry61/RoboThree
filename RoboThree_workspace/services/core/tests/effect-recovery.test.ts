import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { EffectRecoveryMode, TaskCommand, TaskInitialization } from "@robothree/contracts";

import {
  DurableTaskRuntime,
  EffectCoordinator,
  FakeClock,
  FakeEffectExecutor,
  FakeIdGenerator,
  InMemoryTaskPersistence,
  SqliteTaskPersistence,
  TaskRecoveryCoordinator,
} from "../src/index.js";
import type {
  AcceptedCommandCommit,
  CreateTaskInput,
  EffectCrashPoint,
  EffectOnlyCommit,
  PersistedTask,
  PersistenceWriteResult,
  RecordOutboxAttemptInput,
  TaskPersistence,
} from "../src/index.js";

const entityId = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;

const entity = {
  task: entityId(4001),
  agent: entityId(4002),
  run: entityId(4003),
  step: entityId(4004),
  action: entityId(4005),
  plan: entityId(4006),
  planRevision: entityId(4007),
  startRunCommand: entityId(4008),
  startStepCommand: entityId(4009),
  result: entityId(4010),
};

const at = {
  created: "2026-07-20T19:00:00.000Z",
  run: "2026-07-20T19:01:00.000Z",
  step: "2026-07-20T19:02:00.000Z",
  effect: "2026-07-20T19:03:00.000Z",
};

describe("EffectCoordinator crash semantics", () => {
  it("replays the original Effect intent for the same idempotency key and rejects intent drift", async () => {
    await withHarness(async (harness) => {
      const effects = harness.effects();
      const first = await effects.prepare(effectInput("idempotent_retry"));
      const replay = await effects.prepare(effectInput("idempotent_retry"));
      expect(first).toMatchObject({ ok: true, replayed: false });
      expect(replay).toMatchObject({
        ok: true,
        replayed: true,
        attempt: { effectAttemptId: first.ok ? first.attempt.effectAttemptId : "unreachable" },
      });
      expect(await harness.persistence.findEffectAttemptByIdempotencyKey(effectInput("idempotent_retry").idempotencyKey))
        .toMatchObject({ effectAttemptId: first.ok ? first.attempt.effectAttemptId : "unreachable" });
      expect(await harness.persistence.listRecoverableEffectAttempts()).toHaveLength(1);
      expect((await harness.persistence.loadTask(entity.task))?.head.lastEventSequence).toBe(3);

      expect(await effects.prepare({
        ...effectInput("idempotent_retry"),
        metadata: { test: false },
      })).toMatchObject({
        ok: false,
        error: { code: "effect.idempotency_conflict" },
      });
      expect((await harness.persistence.loadTask(entity.task))?.head.lastEventSequence).toBe(3);
    });
  });

  it("converges concurrent prepare calls for one idempotency key to a single Effect intent", async () => {
    await withHarness(async (harness) => {
      const effects = harness.effects();
      const [left, right] = await Promise.all([
        effects.prepare(effectInput("idempotent_retry")),
        effects.prepare(effectInput("idempotent_retry")),
      ]);
      expect(left.ok).toBe(true);
      expect(right.ok).toBe(true);
      expect([left, right].filter((result) => result.ok && !result.replayed)).toHaveLength(1);
      expect(new Set([left, right].flatMap((result) => result.ok ? [result.attempt.effectAttemptId] : []))).toHaveLength(1);
      expect(await harness.persistence.listRecoverableEffectAttempts()).toHaveLength(1);
      expect((await harness.persistence.loadTask(entity.task))?.head.lastEventSequence).toBe(3);
    });
  });

  it("atomically cancels a prepared Effect with its Task before executor dispatch", async () => {
    await withHarness(async (harness) => {
      const prepared = await harness.effects().prepare(effectInput("idempotent_retry"));
      if (!prepared.ok) {
        throw new Error(prepared.error.code);
      }
      expect(await harness.effects().cancelPrepared(prepared.attempt.effectAttemptId, "User stopped task"))
        .toMatchObject({ accepted: true, state: { revision: 3, status: "cancelled" } });
      expect(await harness.persistence.loadEffectAttempt(prepared.attempt.effectAttemptId)).toMatchObject({
        status: "cancelled",
        terminalError: { code: "effect.cancelled_before_dispatch", category: "cancelled" },
      });
      expect(harness.executor.executeCalls).toHaveLength(0);
      expect((await harness.persistence.loadTask(entity.task))?.head).toMatchObject({
        stateRevision: 3,
        lastEventSequence: 5,
      });
      expect(await harness.persistence.listRecoverableEffectAttempts()).toEqual([]);
    });
  });

  it("commits prepared/dispatched/result events and Task observation as a durable success chain", async () => {
    await withHarness(async (harness) => {
      harness.executor.enqueueResult(successResult());
      const result = await harness.effects().prepareAndDispatch(effectInput("idempotent_retry"));
      expect(result).toMatchObject({ accepted: true, state: { revision: 3, status: "running" } });
      expect(await harness.persistence.loadEffectAttempt(harness.effectAttemptId())).toMatchObject({ status: "succeeded" });
      expect((await harness.runtime.snapshot(entity.task))?.runs[0]?.steps[0]).toMatchObject({
        status: "succeeded",
        observation: { outcome: "succeeded" },
      });
      expect((await harness.persistence.loadTask(entity.task))?.head).toMatchObject({
        stateRevision: 3,
        lastEventSequence: 6,
      });
      expect((await harness.persistence.loadEventsAfter(entity.task, 0)).map((event) => event.type)).toEqual([
        "runtime.command_applied",
        "runtime.command_applied",
        "runtime.effect_intent_recorded",
        "runtime.effect_dispatched",
        "runtime.command_applied",
        "runtime.effect_result_recorded",
      ]);
      expect(await harness.persistence.listPendingOutbox(20)).toHaveLength(6);
    });
  });

  it("replays a completed prepare-and-dispatch call without executing the Effect again", async () => {
    await withHarness(async (harness) => {
      harness.executor.enqueueResult(successResult());
      expect(await harness.effects().prepareAndDispatch(effectInput("idempotent_retry")))
        .toMatchObject({ accepted: true });
      expect(await harness.effects().prepareAndDispatch(effectInput("idempotent_retry")))
        .toMatchObject({ ok: true, replayed: true, attempt: { status: "succeeded" } });
      expect(harness.executor.executeCalls).toHaveLength(1);
      expect(harness.executor.uniqueExecutions).toBe(1);
      expect((await harness.persistence.loadTask(entity.task))?.head).toMatchObject({
        stateRevision: 3,
        lastEventSequence: 6,
      });
    });
  });

  it("atomically records an explicit executor failure with the failed Observation", async () => {
    await withHarness(async (harness) => {
      harness.executor.enqueueResult(failureResult());
      expect(await harness.effects().prepareAndDispatch(effectInput("idempotent_retry")))
        .toMatchObject({ accepted: true, state: { revision: 3 } });
      expect(await harness.persistence.loadEffectAttempt(harness.effectAttemptId())).toMatchObject({
        status: "failed",
        terminalError: { code: "effect.fake_failure" },
      });
      expect((await harness.runtime.snapshot(entity.task))?.runs[0]?.steps[0]).toMatchObject({
        status: "failed",
        observation: { outcome: "failed", error: { code: "effect.fake_failure" } },
      });
      expect(await harness.persistence.listRecoverableEffectAttempts()).toEqual([]);
    });
  });

  it("leaves no Effect record when crashing before Intent commit", async () => {
    await withHarness(async (harness) => {
      const effects = harness.effects(crashAt("before_prepare_commit"));
      await expect(effects.prepare(effectInput("idempotent_retry"))).rejects.toThrow("crash:before_prepare_commit");
      expect(await harness.persistence.listRecoverableEffectAttempts()).toEqual([]);
      expect((await harness.persistence.loadTask(entity.task))?.head.lastEventSequence).toBe(2);
      expect(await harness.persistence.listPendingOutbox(20)).toHaveLength(2);
    });
  });

  it("recovers a prepared Intent after crashing before dispatch", async () => {
    await withHarness(async (harness) => {
      harness.executor.enqueueResult(successResult());
      await expect(
        harness.effects(crashAt("after_prepare_commit")).prepareAndDispatch(effectInput("idempotent_retry")),
      ).rejects.toThrow("crash:after_prepare_commit");
      expect(await harness.persistence.listRecoverableEffectAttempts()).toMatchObject([{ status: "prepared" }]);

      const decisions = await harness.recovery().recoverEffects();
      expect(decisions).toMatchObject([{ action: "dispatch_prepared", result: { accepted: true } }]);
      expect(await harness.persistence.loadEffectAttempt(harness.effectAttemptId())).toMatchObject({ status: "succeeded" });
      expect(harness.executor.uniqueExecutions).toBe(1);
    });
  });

  it("retries a dispatched idempotent Effect with the same key after result-loss crash", async () => {
    await withHarness(async (harness) => {
      harness.executor.enqueueResult(successResult());
      await expect(
        harness.effects(crashAt("after_execute_before_result_commit"))
          .prepareAndDispatch(effectInput("idempotent_retry")),
      ).rejects.toThrow("crash:after_execute_before_result_commit");
      expect(await harness.persistence.listRecoverableEffectAttempts()).toMatchObject([{ status: "dispatched" }]);

      expect(await harness.recovery().recoverEffects()).toMatchObject([
        { action: "recover_dispatched", result: { accepted: true } },
      ]);
      expect(harness.executor.executeCalls).toHaveLength(2);
      expect(harness.executor.uniqueExecutions).toBe(1);
      expect(new Set(harness.executor.executeCalls.map((attempt) => attempt.idempotencyKey)).size).toBe(1);
    });
  });

  it("lets a retried prepare-and-dispatch call recover a persisted dispatched Effect", async () => {
    await withHarness(async (harness) => {
      harness.executor.enqueueResult(successResult());
      await expect(
        harness.effects(crashAt("after_execute_before_result_commit"))
          .prepareAndDispatch(effectInput("idempotent_retry")),
      ).rejects.toThrow("crash:after_execute_before_result_commit");

      expect(await harness.effects().prepareAndDispatch(effectInput("idempotent_retry")))
        .toMatchObject({ accepted: true });
      expect(harness.executor.executeCalls).toHaveLength(2);
      expect(harness.executor.uniqueExecutions).toBe(1);
      expect(await harness.persistence.loadEffectAttempt(harness.effectAttemptId())).toMatchObject({ status: "succeeded" });
    });
  });

  it("queries an already executed Effect instead of dispatching it again", async () => {
    await withHarness(async (harness) => {
      harness.executor.enqueueResult(successResult());
      await expect(
        harness.effects(crashAt("after_execute_before_result_commit"))
          .prepareAndDispatch(effectInput("query_then_retry")),
      ).rejects.toThrow("crash:after_execute_before_result_commit");

      await harness.recovery().recoverEffects();
      expect(harness.executor.queryCalls).toHaveLength(1);
      expect(harness.executor.executeCalls).toHaveLength(1);
      expect(await harness.persistence.loadEffectAttempt(harness.effectAttemptId())).toMatchObject({ status: "succeeded" });
    });
  });

  it("queries not-found then safely dispatches an Effect that crashed before executor invocation", async () => {
    await withHarness(async (harness) => {
      harness.executor.enqueueResult(successResult());
      await expect(
        harness.effects(crashAt("after_dispatched_commit"))
          .prepareAndDispatch(effectInput("query_then_retry")),
      ).rejects.toThrow("crash:after_dispatched_commit");
      expect(harness.executor.executeCalls).toHaveLength(0);

      await harness.recovery().recoverEffects();
      expect(harness.executor.queryCalls).toHaveLength(1);
      expect(harness.executor.executeCalls).toHaveLength(1);
      expect(await harness.persistence.loadEffectAttempt(harness.effectAttemptId())).toMatchObject({ status: "succeeded" });
    });
  });

  it("converges an unverifiable dispatched Effect to uncertain plus external-dependency waiting", async () => {
    await withHarness(async (harness) => {
      harness.executor.enqueueResult(successResult());
      await expect(
        harness.effects(crashAt("after_execute_before_result_commit"))
          .prepareAndDispatch(effectInput("manual_reconciliation")),
      ).rejects.toThrow("crash:after_execute_before_result_commit");

      expect(await harness.recovery().recoverEffects()).toMatchObject([
        { action: "recover_dispatched", result: { accepted: true, state: { status: "waiting" } } },
      ]);
      expect(await harness.persistence.loadEffectAttempt(harness.effectAttemptId())).toMatchObject({
        status: "uncertain",
        terminalError: { code: "effect.result_uncertain" },
      });
      expect(await harness.runtime.snapshot(entity.task)).toMatchObject({
        status: "waiting",
        runs: [{ status: "waiting", steps: [{ status: "waiting", wait: { reason: "external_dependency" } }] }],
      });
      expect(harness.executor.executeCalls).toHaveLength(1);

      expect(await harness.recovery().recoverEffects()).toMatchObject([{ action: "await_reconciliation" }]);
      expect(harness.executor.executeCalls).toHaveLength(1);
    });
  });

  it("treats an unknown query result as uncertain and does not retry execution", async () => {
    await withHarness(async (harness) => {
      harness.executor.enqueueResult(successResult());
      await expect(
        harness.effects(crashAt("after_dispatched_commit"))
          .prepareAndDispatch(effectInput("query_then_retry")),
      ).rejects.toThrow("crash:after_dispatched_commit");
      harness.executor.returnUnknownFromQuery();

      expect(await harness.recovery().recoverEffects()).toMatchObject([
        { action: "recover_dispatched", result: { accepted: true, state: { status: "waiting" } } },
      ]);
      expect(harness.executor.queryCalls).toHaveLength(1);
      expect(harness.executor.executeCalls).toHaveLength(0);
      expect(await harness.persistence.loadEffectAttempt(harness.effectAttemptId())).toMatchObject({
        status: "uncertain",
      });
    });
  });

  it("keeps Effect dispatched and Task unchanged when the Result transaction fails, then recovers", async () => {
    const delegate = new InMemoryTaskPersistence(new FakeClock(at.effect));
    await delegate.start();
    try {
      const persistence = new FailingAcceptedCommitPersistence(delegate);
      const harness = await createHarness(persistence);
      harness.executor.enqueueResult(successResult());
      persistence.failNextAcceptedCommit = true;
      const failed = await harness.effects().prepareAndDispatch(effectInput("idempotent_retry"));
      expect(failed).toMatchObject({ accepted: false, error: { code: "persistence.injected_effect_result_failure" } });
      expect(await persistence.loadEffectAttempt(harness.effectAttemptId())).toMatchObject({ status: "dispatched" });
      expect(await harness.runtime.snapshot(entity.task)).toMatchObject({
        revision: 2,
        status: "running",
        runs: [{ steps: [{ status: "running" }] }],
      });
      expect(await persistence.listPendingOutbox(20)).toHaveLength(4);

      await harness.recovery().recoverEffects();
      expect(await persistence.loadEffectAttempt(harness.effectAttemptId())).toMatchObject({ status: "succeeded" });
      expect(harness.executor.uniqueExecutions).toBe(1);
    } finally {
      await delegate.stop();
    }
  });
});

describe("SQLite Effect recovery", () => {
  it("reopens a dispatched Effect and reconciles it from executor query", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf23-effect-reopen-"));
    const databasePath = join(directory, "robothree.sqlite");
    const clock = new FakeClock(at.effect);
    const executor = new FakeEffectExecutor();
    try {
      const firstPersistence = new SqliteTaskPersistence({ databasePath, clock });
      await firstPersistence.start();
      const firstHarness = await createHarness(firstPersistence, { clock, executor });
      executor.enqueueResult(successResult());
      await expect(
        firstHarness.effects(crashAt("after_execute_before_result_commit"))
          .prepareAndDispatch(effectInput("query_then_retry")),
      ).rejects.toThrow("crash:after_execute_before_result_commit");
      await firstPersistence.stop();

      const secondPersistence = new SqliteTaskPersistence({ databasePath, clock });
      await secondPersistence.start();
      const restarted = await createRecoveryHarness(secondPersistence, clock, executor);
      expect(await restarted.recovery.recoverEffects()).toMatchObject([
        { action: "recover_dispatched", result: { accepted: true } },
      ]);
      expect(await secondPersistence.loadEffectAttempt(firstHarness.effectAttemptId())).toMatchObject({ status: "succeeded" });
      expect(await restarted.runtime.snapshot(entity.task)).toMatchObject({ revision: 3, status: "running" });
      await secondPersistence.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

type Harness = Awaited<ReturnType<typeof createHarness>>;

async function withHarness(test: (harness: Harness) => Promise<void>): Promise<void> {
  const persistence = new InMemoryTaskPersistence(new FakeClock(at.effect));
  await persistence.start();
  try {
    await test(await createHarness(persistence));
  } finally {
    await persistence.stop();
  }
}

async function createHarness(
  persistence: TaskPersistence,
  overrides: { clock?: FakeClock; executor?: FakeEffectExecutor } = {},
) {
  const clock = overrides.clock ?? new FakeClock(at.effect);
  const executor = overrides.executor ?? new FakeEffectExecutor();
  const ids = new FakeIdGenerator(Array.from({ length: 120 }, (_, index) => entityId(5000 + index)));
  const runtime = new DurableTaskRuntime({ persistence, idGenerator: ids });
  const created = await runtime.createTask(initialization());
  if (!created.ok) {
    throw new Error(created.error.code);
  }
  await requireAccepted(runtime.dispatch(startRun()));
  await requireAccepted(runtime.dispatch(startStep()));
  let lastAttemptId: string | undefined;
  const effects = (crashInjector?: (point: EffectCrashPoint) => void) => {
    const coordinator = new EffectCoordinator({
      runtime,
      persistence,
      clock,
      idGenerator: ids,
      executors: [executor],
      ...(crashInjector === undefined ? {} : {
        crashInjector(point, attempt) {
          lastAttemptId = attempt.effectAttemptId;
          crashInjector(point);
        },
      }),
    });
    const originalPrepare = coordinator.prepare.bind(coordinator);
    coordinator.prepare = async (input) => {
      const result = await originalPrepare(input);
      if (result.ok) {
        lastAttemptId = result.attempt.effectAttemptId;
      }
      return result;
    };
    return coordinator;
  };
  const recovery = () => new TaskRecoveryCoordinator({ persistence, effects: effects() });
  return {
    persistence,
    runtime,
    clock,
    executor,
    effects,
    recovery,
    effectAttemptId() {
      if (lastAttemptId !== undefined) {
        return lastAttemptId;
      }
      throw new Error("Effect attempt has not been prepared");
    },
  };
}

async function createRecoveryHarness(
  persistence: TaskPersistence,
  clock: FakeClock,
  executor: FakeEffectExecutor,
) {
  const ids = new FakeIdGenerator(Array.from({ length: 80 }, (_, index) => entityId(7000 + index)));
  const runtime = new DurableTaskRuntime({ persistence, idGenerator: ids });
  const effects = new EffectCoordinator({ runtime, persistence, clock, idGenerator: ids, executors: [executor] });
  return {
    runtime,
    recovery: new TaskRecoveryCoordinator({ persistence, effects }),
  };
}

function initialization(): TaskInitialization {
  return {
    taskId: entity.task,
    agentDefinition: { agentDefinitionId: entity.agent, version: "1.0.0" },
    goal: "Verify effect crash recovery",
    createdAt: at.created,
  };
}

function startRun(): TaskCommand {
  return {
    commandId: entity.startRunCommand,
    taskId: entity.task,
    type: "start_run",
    issuedAt: at.run,
    runId: entity.run,
  };
}

function startStep(): TaskCommand {
  return {
    commandId: entity.startStepCommand,
    taskId: entity.task,
    type: "start_step",
    issuedAt: at.step,
    runId: entity.run,
    stepId: entity.step,
    planRevision: { executionPlanId: entity.plan, planRevisionId: entity.planRevision, revision: 1 },
    action: { actionId: entity.action, kind: "tool.fake.effect", payload: { value: 1 } },
  };
}

function effectInput(recoveryMode: EffectRecoveryMode) {
  return {
    taskId: entity.task,
    runId: entity.run,
    stepId: entity.step,
    actionId: entity.action,
    idempotencyKey: `effect:${entity.task}:${entity.action}`,
    executorCapability: "fake.effect",
    recoveryMode,
    metadata: { test: true },
  } as const;
}

function successResult() {
  return {
    outcome: "succeeded" as const,
    resultRef: entity.result,
    output: { artifactRef: entity.result },
  };
}

function failureResult() {
  return {
    outcome: "failed" as const,
    error: {
      code: "effect.fake_failure",
      category: "provider" as const,
      message: "Fake external system rejected the operation",
      retryable: false,
    },
  };
}

function crashAt(target: EffectCrashPoint) {
  return (point: EffectCrashPoint) => {
    if (point === target) {
      throw new Error(`crash:${point}`);
    }
  };
}

async function requireAccepted(resultPromise: ReturnType<DurableTaskRuntime["dispatch"]>): Promise<void> {
  const result = await resultPromise;
  if (!result.accepted) {
    throw new Error(result.error.code);
  }
}

class FailingAcceptedCommitPersistence implements TaskPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.effect-result-failure";
  failNextAcceptedCommit = false;

  constructor(readonly delegate: TaskPersistence) {}

  start() { return this.delegate.start(); }
  stop() { return this.delegate.stop(); }
  health() { return this.delegate.health(); }
  createTask(input: CreateTaskInput) { return this.delegate.createTask(input); }
  loadTask(taskId: string) { return this.delegate.loadTask(taskId); }
  loadCheckpoint(checkpointId: string) { return this.delegate.loadCheckpoint(checkpointId); }
  loadCheckpointAtRevision(taskId: string, revision: number) {
    return this.delegate.loadCheckpointAtRevision(taskId, revision);
  }
  loadEventsAfter(taskId: string, sequence: number) { return this.delegate.loadEventsAfter(taskId, sequence); }
  findCommandReceipt(commandId: string) { return this.delegate.findCommandReceipt(commandId); }
  commitTaskCapabilityLock(lock: Parameters<TaskPersistence["commitTaskCapabilityLock"]>[0]) {
    return this.delegate.commitTaskCapabilityLock(lock);
  }
  loadTaskCapabilityLock(taskId: string, capabilityId: string) {
    return this.delegate.loadTaskCapabilityLock(taskId, capabilityId);
  }
  listTaskCapabilityLocks(taskId: string) { return this.delegate.listTaskCapabilityLocks(taskId); }
  loadEffectAttempt(effectAttemptId: string) { return this.delegate.loadEffectAttempt(effectAttemptId); }
  findEffectAttemptByIdempotencyKey(idempotencyKey: string) {
    return this.delegate.findEffectAttemptByIdempotencyKey(idempotencyKey);
  }
  listRecoverableEffectAttempts() { return this.delegate.listRecoverableEffectAttempts(); }
  commitEffectTransition(input: EffectOnlyCommit) { return this.delegate.commitEffectTransition(input); }
  commitRejectedCommand(receipt: Parameters<TaskPersistence["commitRejectedCommand"]>[0]) {
    return this.delegate.commitRejectedCommand(receipt);
  }
  listPendingOutbox(limit: number) { return this.delegate.listPendingOutbox(limit); }
  recordOutboxAttempt(input: RecordOutboxAttemptInput) { return this.delegate.recordOutboxAttempt(input); }
  listRecoveryCandidates() { return this.delegate.listRecoveryCandidates(); }

  commitAcceptedCommand(input: AcceptedCommandCommit): Promise<PersistenceWriteResult<PersistedTask>> {
    if (!this.failNextAcceptedCommit) {
      return this.delegate.commitAcceptedCommand(input);
    }
    this.failNextAcceptedCommit = false;
    return Promise.resolve({
      ok: false,
      error: {
        code: "persistence.injected_effect_result_failure",
        category: "persistence",
        message: "Injected Effect result transaction failure",
        retryable: true,
      },
    });
  }
}
