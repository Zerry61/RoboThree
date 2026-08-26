import { describe, expect, it } from "vitest";

import type { OutboxRecord, TaskCommand, TaskInitialization } from "@robothree/contracts";

import {
  DurableTaskRuntime,
  FakeClock,
  FakeEventPublisher,
  FakeIdGenerator,
  FakeRandomSource,
  InMemoryTaskPersistence,
  OutboxDispatcher,
  replayTaskEvents,
} from "../src/index.js";
import type {
  AcceptedCommandCommit,
  CreateTaskInput,
  PersistedTask,
  PersistenceWriteResult,
  RecordOutboxAttemptInput,
  TaskPersistence,
} from "../src/index.js";
import {
  firstAcceptedCommit,
  initialPersistedTask,
  secondAcceptedCommit,
} from "./task-persistence.fixtures.js";

const entityId = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;

const ids = {
  task: entityId(2001),
  agent: entityId(2002),
  run1: entityId(2003),
  run2: entityId(2004),
  step1: entityId(2005),
  step2: entityId(2006),
  action1: entityId(2007),
  action2: entityId(2008),
  plan: entityId(2009),
  planRevision: entityId(2010),
  command1: entityId(2011),
  command2: entityId(2012),
  command3: entityId(2013),
  command4: entityId(2014),
};

const at = {
  created: "2026-07-20T15:00:00.000Z",
  run: "2026-07-20T15:01:00.000Z",
  step: "2026-07-20T15:02:00.000Z",
  complete: "2026-07-20T15:03:00.000Z",
  published: "2026-07-20T15:04:00.000Z",
};

describe("DurableTaskRuntime", () => {
  it("commits accepted commands and replays the original result without changing the current snapshot", async () => {
    await withPersistence(async (persistence) => {
      const runtime = runtimeWithIds(persistence, 7);
      expect(await runtime.createTask(initialization())).toMatchObject({ ok: true, replayed: false, state: { revision: 0 } });
      const first = startRun();
      expect(await runtime.dispatch(first)).toMatchObject({ accepted: true, state: { revision: 1 } });
      expect(await runtime.dispatch(completeRun())).toMatchObject({
        accepted: true,
        state: { revision: 2, status: "completed" },
      });

      const replayed = await runtime.dispatch(first);
      expect(replayed).toMatchObject({ accepted: true, state: { revision: 1, status: "running" } });
      expect(await runtime.snapshot(ids.task)).toMatchObject({ revision: 2, status: "completed" });
      expect(await persistence.loadEventsAfter(ids.task, 0)).toHaveLength(2);
    });
  });

  it("rejects commandId reuse with different canonical payload", async () => {
    await withPersistence(async (persistence) => {
      const runtime = runtimeWithIds(persistence, 4);
      await runtime.createTask(initialization());
      await runtime.dispatch(startRun());
      const conflict = await runtime.dispatch({ ...startRun(), runId: ids.run2 });
      expect(conflict).toMatchObject({
        accepted: false,
        state: { revision: 1 },
        error: { code: "persistence.idempotency_conflict" },
      });
      expect(await persistence.loadEventsAfter(ids.task, 0)).toHaveLength(1);
    });
  });

  it("persists and replays reducer rejections without advancing revision", async () => {
    await withPersistence(async (persistence) => {
      const runtime = runtimeWithIds(persistence, 4);
      await runtime.createTask(initialization());
      const illegal = completeRun();
      const first = await runtime.dispatch(illegal);
      await runtime.dispatch({ ...startRun(), issuedAt: at.published });
      const replayed = await runtime.dispatch(illegal);
      expect(first).toMatchObject({ accepted: false, state: { revision: 0 }, error: { code: "runtime.stale_run" } });
      expect(replayed).toEqual(first);
      expect(await persistence.findCommandReceipt(ids.command2)).toMatchObject({ outcome: "rejected", stateRevision: 0 });
      expect(await runtime.snapshot(ids.task)).toMatchObject({ revision: 1, status: "running" });
      expect(await persistence.loadEventsAfter(ids.task, 0)).toHaveLength(1);
    });
  });

  it("serializes concurrent commands per task and durably records the rejected loser", async () => {
    await withPersistence(async (persistence) => {
      const runtime = runtimeWithIds(persistence, 7);
      await runtime.createTask(initialization());
      await runtime.dispatch(startRun());
      const [first, second] = await Promise.all([
        runtime.dispatch(startStep(ids.command2, ids.step1, ids.action1)),
        runtime.dispatch(startStep(ids.command3, ids.step2, ids.action2)),
      ]);
      expect(first).toMatchObject({ accepted: true, state: { revision: 2 } });
      expect(second).toMatchObject({ accepted: false, error: { code: "runtime.active_step_exists" } });
      expect(await persistence.findCommandReceipt(ids.command3)).toMatchObject({ outcome: "rejected", stateRevision: 2 });
      expect(await runtime.snapshot(ids.task)).toMatchObject({ revision: 2 });
    });
  });

  it("does not replace the cached snapshot when the atomic persistence commit fails", async () => {
    const delegate = new InMemoryTaskPersistence(new FakeClock(at.created));
    await delegate.start();
    try {
      const persistence = new FailingAcceptedCommitPersistence(delegate);
      const runtime = runtimeWithIds(persistence, 7);
      await runtime.createTask(initialization());
      persistence.failNextAcceptedCommit = true;
      const failed = await runtime.dispatch(startRun());
      expect(failed).toMatchObject({ accepted: false, state: { revision: 0 }, error: { code: "persistence.injected_failure" } });
      expect(await runtime.snapshot(ids.task)).toMatchObject({ revision: 0, status: "created" });
      expect(await delegate.loadEventsAfter(ids.task, 0)).toEqual([]);
      expect(await delegate.listPendingOutbox(10)).toEqual([]);

      expect(await runtime.dispatch(startRun())).toMatchObject({ accepted: true, state: { revision: 1 } });
    } finally {
      await delegate.stop();
    }
  });

  it("restores the committed snapshot after constructing a new runtime", async () => {
    await withPersistence(async (persistence) => {
      const first = runtimeWithIds(persistence, 4);
      await first.createTask(initialization());
      await first.dispatch(startRun());

      const restarted = new DurableTaskRuntime({ persistence, idGenerator: new FakeIdGenerator([]) });
      expect(await restarted.snapshot(ids.task)).toEqual(await first.snapshot(ids.task));
    });
  });

  it("keeps the in-process snapshot cache explicitly bounded across many completed task loads", async () => {
    await withPersistence(async (persistence) => {
      const runtime = new DurableTaskRuntime({
        persistence,
        idGenerator: new FakeIdGenerator(
          Array.from({ length: 5 }, (_, index) => entityId(2300 + index)),
        ),
        maxCachedSnapshots: 2,
      });
      for (let index = 0; index < 5; index += 1) {
        const taskId = entityId(2400 + index);
        await runtime.createTask({
          ...initialization(),
          taskId,
          goal: `bounded-cache-${index}`,
        });
      }
      expect(runtime.stats()).toEqual({
        cachedSnapshots: 2,
        activeMailboxes: 0,
        maxCachedSnapshots: 2,
      });
      runtime.clearCachedSnapshots();
      expect(runtime.stats().cachedSnapshots).toBe(0);
    });
  });

  it("preserves KAF-1 retry semantics while durably creating a new Run", async () => {
    await withPersistence(async (persistence) => {
      const runtime = runtimeWithIds(persistence, 10);
      await runtime.createTask(initialization());
      await runtime.dispatch(startRun());
      expect(await runtime.dispatch({
        commandId: ids.command2,
        taskId: ids.task,
        type: "fail_run",
        issuedAt: at.step,
        runId: ids.run1,
        error: { code: "provider.failed", category: "provider", message: "Provider failed", retryable: true },
      })).toMatchObject({ accepted: true, state: { revision: 2, status: "failed" } });
      const retried = await runtime.dispatch({
        commandId: ids.command3,
        taskId: ids.task,
        type: "retry_run",
        issuedAt: at.complete,
        failedRunId: ids.run1,
        newRunId: ids.run2,
      });
      expect(retried).toMatchObject({
        accepted: true,
        state: {
          revision: 3,
          status: "running",
          runs: [
            { runId: ids.run1, status: "failed", attempt: 1 },
            { runId: ids.run2, status: "running", attempt: 2, retryOfRunId: ids.run1 },
          ],
        },
      });
    });
  });

  it("preserves KAF-1 cancellation convergence in the durable pipeline", async () => {
    await withPersistence(async (persistence) => {
      const runtime = runtimeWithIds(persistence, 7);
      await runtime.createTask(initialization());
      await runtime.dispatch(startRun());
      const cancelled = await runtime.dispatch({
        commandId: ids.command2,
        taskId: ids.task,
        type: "cancel_task",
        issuedAt: at.step,
        reason: "User cancelled",
      });
      expect(cancelled).toMatchObject({
        accepted: true,
        state: { revision: 2, status: "cancelled", runs: [{ status: "cancelled" }] },
      });
    });
  });

  it("preserves equality deadline expiry as an accepted durable transition", async () => {
    await withPersistence(async (persistence) => {
      const runtime = runtimeWithIds(persistence, 4);
      await runtime.createTask({ ...initialization(), deadlineAt: at.run });
      const expired = await runtime.dispatch(startRun());
      expect(expired).toMatchObject({
        accepted: true,
        transition: { cause: "deadline_expired" },
        state: { revision: 1, status: "timed_out", runs: [] },
      });
    });
  });

  it("replays a contiguous event tail from an older checkpoint and fails closed on gaps", () => {
    const initial = initialPersistedTask();
    const first = firstAcceptedCommit();
    const second = secondAcceptedCommit();
    const persisted = { head: second.head, checkpoint: initial.checkpoint };
    expect(replayTaskEvents(persisted, [first.event, second.event])).toEqual(second.checkpoint.state);
    expect(() => replayTaskEvents(persisted, [second.event])).toThrow("sequence is not contiguous");
    expect(() => replayTaskEvents({
      ...persisted,
      checkpoint: { ...persisted.checkpoint, stateDigest: `sha256:${"0".repeat(64)}` },
    }, [first.event, second.event])).toThrow("checkpoint digest mismatch");
  });
});

describe("OutboxDispatcher", () => {
  it("records failed attempts and publishes pending records at least once", async () => {
    await withPersistence(async (persistence) => {
      const runtime = runtimeWithIds(persistence, 4);
      await runtime.createTask(initialization());
      await runtime.dispatch(startRun());
      const publisher = new FakeEventPublisher();
      const clock = new FakeClock(at.published);
      const dispatcher = new OutboxDispatcher({
        persistence,
        publisher,
        clock,
        random: new FakeRandomSource([0.5]),
      });

      publisher.failNext();
      expect(await dispatcher.drain()).toMatchObject({ selected: 1, published: 0, failed: 1 });
      expect(await persistence.listPendingOutbox(10)).toMatchObject([{
        attemptCount: 1,
        nextAttemptAt: "2026-07-20T15:04:02.000Z",
      }]);
      expect(await dispatcher.drain()).toEqual({ selected: 0, published: 0, failed: 0, errors: [] });

      clock.set("2026-07-20T15:05:00.000Z");
      expect(await dispatcher.drain()).toEqual({ selected: 1, published: 1, failed: 0, errors: [] });
      expect(publisher.published).toHaveLength(1);
      expect(await persistence.listPendingOutbox(10)).toEqual([]);
      expect(await dispatcher.drain()).toEqual({ selected: 0, published: 0, failed: 0, errors: [] });
    });
  });

  it("redelivers the same stable IDs when publish succeeds but acknowledgement fails", async () => {
    const delegate = new InMemoryTaskPersistence(new FakeClock(at.created));
    await delegate.start();
    try {
      const persistence = new FailingAcceptedCommitPersistence(delegate);
      const runtime = runtimeWithIds(persistence, 4);
      await runtime.createTask(initialization());
      await runtime.dispatch(startRun());
      const publisher = new FakeEventPublisher();
      const dispatcher = new OutboxDispatcher({
        persistence,
        publisher,
        clock: new FakeClock(at.published),
      });

      persistence.failNextPublishedAcknowledgement = true;
      expect(await dispatcher.drain()).toMatchObject({ selected: 1, published: 0, failed: 1 });
      expect(await delegate.listPendingOutbox(10)).toHaveLength(1);
      expect(await dispatcher.drain()).toMatchObject({ selected: 1, published: 1, failed: 0 });
      expect(publisher.published).toHaveLength(2);
      expect(new Set(publisher.published.map((record) => record.outboxId))).toHaveLength(1);
      expect(new Set(publisher.published.map((record) => record.eventId))).toHaveLength(1);
      expect(await delegate.listPendingOutbox(10)).toEqual([]);
    } finally {
      await delegate.stop();
    }
  });

  it("keeps pending Outbox work untouched when a drain is already cancelled", async () => {
    await withPersistence(async (persistence) => {
      const runtime = runtimeWithIds(persistence, 4);
      await runtime.createTask(initialization());
      await runtime.dispatch(startRun());
      const controller = new AbortController();
      controller.abort();
      const dispatcher = new OutboxDispatcher({
        persistence,
        publisher: new FakeEventPublisher(),
        clock: new FakeClock(at.published),
        maxBatch: 1,
      });
      expect(await dispatcher.drain(100, controller.signal)).toEqual({
        selected: 0,
        published: 0,
        failed: 0,
        errors: [],
      });
      expect(await persistence.listPendingOutbox(10)).toHaveLength(1);
    });
  });

  it("caps every Outbox drain to the configured batch size", async () => {
    await withPersistence(async (persistence) => {
      const runtime = runtimeWithIds(persistence, 7);
      await runtime.createTask(initialization());
      await runtime.dispatch(startRun());
      await runtime.dispatch(completeRun());
      const publisher = new FakeEventPublisher();
      const dispatcher = new OutboxDispatcher({
        persistence,
        publisher,
        clock: new FakeClock(at.published),
        maxBatch: 1,
        random: new FakeRandomSource([0.5]),
      });
      expect(await dispatcher.drain(100)).toMatchObject({ selected: 1, published: 1 });
      expect(await persistence.listPendingOutbox(10)).toHaveLength(1);
      expect(await dispatcher.drain(100)).toMatchObject({ selected: 1, published: 1 });
      expect(await persistence.listPendingOutbox(10)).toEqual([]);
      expect(publisher.published).toHaveLength(2);
    });
  });

  it("recovers an Outbox backlog in bounded batches without an unbounded drain loop", async () => {
    await withPersistence(async (persistence) => {
      const runtime = runtimeWithIds(persistence, 7);
      await runtime.createTask(initialization());
      await runtime.dispatch(startRun());
      await runtime.dispatch(completeRun());
      const publisher = new FakeEventPublisher();
      const dispatcher = new OutboxDispatcher({
        persistence,
        publisher,
        clock: new FakeClock(at.published),
        maxBatch: 1,
      });
      await expect(dispatcher.drainBacklog({ maxBatches: 1 })).resolves.toMatchObject({
        batches: 1,
        selected: 1,
        published: 1,
        reachedBatchLimit: true,
      });
      expect(await persistence.listPendingOutbox(10)).toHaveLength(1);
      await expect(dispatcher.drainBacklog({ maxBatches: 3 })).resolves.toMatchObject({
        batches: 2,
        selected: 1,
        published: 1,
        reachedBatchLimit: false,
      });
      expect(await persistence.listPendingOutbox(10)).toEqual([]);
    });
  });

  it("shares one bounded in-flight drain and aborts it before lifecycle stop completes", async () => {
    await withPersistence(async (persistence) => {
      const runtime = runtimeWithIds(persistence, 4);
      await runtime.createTask(initialization());
      await runtime.dispatch(startRun());
      const publisher = new BlockingEventPublisher();
      const dispatcher = new OutboxDispatcher({
        persistence,
        publisher,
        clock: new FakeClock(at.published),
        maxBatch: 1,
        random: new FakeRandomSource([0.5]),
      });

      const first = dispatcher.drain();
      const second = dispatcher.drain();
      expect(second).toBe(first);
      await Promise.resolve();
      expect(publisher.calls).toBe(1);
      await dispatcher.stop();
      await expect(first).resolves.toMatchObject({ selected: 1, published: 0, failed: 1 });
      expect(await dispatcher.health()).toMatchObject({ status: "unavailable" });
      await expect(dispatcher.drain()).resolves.toEqual({
        selected: 0,
        published: 0,
        failed: 0,
        errors: [],
      });
      expect(await persistence.listPendingOutbox(10)).toMatchObject([{
        attemptCount: 1,
        nextAttemptAt: "2026-07-20T15:04:02.000Z",
      }]);

      await dispatcher.start();
      expect(await dispatcher.health()).toMatchObject({ status: "ready" });
    });
  });
});

function initialization(): TaskInitialization {
  return {
    taskId: ids.task,
    agentDefinition: { agentDefinitionId: ids.agent, version: "1.0.0" },
    goal: "Verify the durable command pipeline",
    createdAt: at.created,
  };
}

function startRun(): TaskCommand {
  return {
    commandId: ids.command1,
    taskId: ids.task,
    type: "start_run",
    issuedAt: at.run,
    runId: ids.run1,
  };
}

function completeRun(): TaskCommand {
  return {
    commandId: ids.command2,
    taskId: ids.task,
    type: "complete_run",
    issuedAt: at.complete,
    runId: ids.run1,
  };
}

function startStep(commandId: string, stepId: string, actionId: string): TaskCommand {
  return {
    commandId,
    taskId: ids.task,
    type: "start_step",
    issuedAt: at.step,
    runId: ids.run1,
    stepId,
    planRevision: { executionPlanId: ids.plan, planRevisionId: ids.planRevision, revision: 1 },
    action: { actionId, kind: "model.generate", payload: { prompt: "hello" } },
  };
}

function runtimeWithIds(persistence: TaskPersistence, count: number): DurableTaskRuntime {
  return new DurableTaskRuntime({
    persistence,
    idGenerator: new FakeIdGenerator(
      Array.from({ length: count }, (_, index) => entityId(2100 + index)),
    ),
  });
}

async function withPersistence(test: (persistence: InMemoryTaskPersistence) => Promise<void>): Promise<void> {
  const persistence = new InMemoryTaskPersistence(new FakeClock(at.created));
  await persistence.start();
  try {
    await test(persistence);
  } finally {
    await persistence.stop();
  }
}

class BlockingEventPublisher {
  calls = 0;

  publish(_record: OutboxRecord, signal?: AbortSignal): Promise<void> {
    this.calls += 1;
    return new Promise((_, reject) => {
      const abort = () => reject(
        signal?.reason instanceof Error ? signal.reason : new Error("publish aborted"),
      );
      if (signal?.aborted === true) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
}

class FailingAcceptedCommitPersistence implements TaskPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.failing-test";
  failNextAcceptedCommit = false;
  failNextPublishedAcknowledgement = false;

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
  commitEffectTransition(input: Parameters<TaskPersistence["commitEffectTransition"]>[0]) {
    return this.delegate.commitEffectTransition(input);
  }
  commitRejectedCommand(receipt: Parameters<TaskPersistence["commitRejectedCommand"]>[0]) {
    return this.delegate.commitRejectedCommand(receipt);
  }
  listPendingOutbox(limit: number) { return this.delegate.listPendingOutbox(limit); }
  recordOutboxAttempt(input: RecordOutboxAttemptInput) {
    if (this.failNextPublishedAcknowledgement && input.publishedAt !== undefined) {
      this.failNextPublishedAcknowledgement = false;
      return Promise.resolve({
        ok: false as const,
        error: {
          code: "persistence.injected_outbox_ack_failure",
          category: "persistence" as const,
          message: "Injected Outbox acknowledgement failure",
          retryable: true,
        },
      });
    }
    return this.delegate.recordOutboxAttempt(input);
  }
  listRecoveryCandidates() { return this.delegate.listRecoveryCandidates(); }

  commitAcceptedCommand(input: AcceptedCommandCommit): Promise<PersistenceWriteResult<PersistedTask>> {
    if (!this.failNextAcceptedCommit) {
      return this.delegate.commitAcceptedCommand(input);
    }
    this.failNextAcceptedCommit = false;
    return Promise.resolve({
      ok: false,
      error: {
        code: "persistence.injected_failure",
        category: "persistence",
        message: "Injected atomic commit failure",
        retryable: true,
      },
    });
  }
}
