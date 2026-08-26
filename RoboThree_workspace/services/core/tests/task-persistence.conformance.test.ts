import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { JsonObjectSchema, PersistenceSchemaVersion } from "@robothree/contracts";
import type { EffectAttempt, RejectedCommandReceipt, TaskEvent } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  FakeClock,
  InMemoryTaskPersistence,
  SqliteTaskPersistence,
} from "../src/index.js";
import type { EffectOnlyCommit, TaskPersistence } from "../src/index.js";
import {
  firstAcceptedCommit,
  initialPersistedTask,
  persistenceAt,
  persistenceIds,
  secondAcceptedCommit,
} from "./task-persistence.fixtures.js";
import { capabilityIds, capabilityLock } from "./capability.fixtures.js";

type Harness = {
  persistence: TaskPersistence;
  cleanup(): Promise<void>;
};

const variants: readonly {
  name: string;
  create(): Promise<Harness>;
}[] = [
  {
    name: "InMemoryTaskPersistence",
    async create() {
      const persistence = new InMemoryTaskPersistence(new FakeClock(persistenceAt.command));
      await persistence.start();
      return { persistence, cleanup: () => persistence.stop() };
    },
  },
  {
    name: "SqliteTaskPersistence",
    async create() {
      const directory = await mkdtemp(join(tmpdir(), "robothree-kaf21-conformance-"));
      const persistence = new SqliteTaskPersistence({
        databasePath: join(directory, "robothree.sqlite"),
        clock: new FakeClock(persistenceAt.command),
      });
      await persistence.start();
      return {
        persistence,
        async cleanup() {
          await persistence.stop();
          await rm(directory, { recursive: true, force: true });
        },
      };
    },
  },
];

for (const variant of variants) {
  describe(variant.name, () => {
    it("atomically persists one exact TaskCapabilityLock and replays it idempotently", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        const lock = capabilityLock();
        expect(await persistence.commitTaskCapabilityLock(lock)).toMatchObject({
          ok: true,
          replayed: false,
        });
        expect(await persistence.commitTaskCapabilityLock(lock)).toMatchObject({
          ok: true,
          replayed: true,
        });
        expect(await persistence.loadTaskCapabilityLock(capabilityIds.task, "tool.echo")).toEqual(lock);
        expect(await persistence.listTaskCapabilityLocks(capabilityIds.task)).toEqual([lock]);
      });
    });

    it("loads nonterminal capability references through a bounded indexed query", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        const lock = capabilityLock();
        await persistence.commitTaskCapabilityLock(lock);
        expect(await persistence.listNonTerminalTaskCapabilityLocksByCapabilityId(
          lock.definitionSnapshot.capabilityId,
          10,
        )).toEqual({ locks: [lock], truncated: false });
        expect(await persistence.listNonTerminalTaskCapabilityLocksByCapabilityId(
          "model.missing",
          10,
        )).toEqual({ locks: [], truncated: false });
        await expect(persistence.listNonTerminalTaskCapabilityLocksByCapabilityId(
          lock.definitionSnapshot.capabilityId,
          0,
        )).rejects.toThrow("limit");
      });
    });

    it("rejects silent rebinding without writing a second TaskCapabilityLock", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        const lock = capabilityLock();
        await persistence.commitTaskCapabilityLock(lock);
        const changed = capabilityLock({ lockId: capabilityIds.lock2 }, "adapter.tool.fake.secondary");
        expect(await persistence.commitTaskCapabilityLock(changed)).toMatchObject({
          ok: false,
          error: { code: "persistence.capability_lock_conflict" },
        });
        expect(await persistence.listTaskCapabilityLocks(capabilityIds.task)).toEqual([lock]);
      });
    });

    it("rejects a well-shaped TaskCapabilityLock whose materialized revision drifted", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        const lock = capabilityLock();
        const forged = {
          ...lock,
          definitionSnapshot: { ...lock.definitionSnapshot, description: "drifted after lock" },
        };
        expect(await persistence.commitTaskCapabilityLock(forged)).toMatchObject({
          ok: false,
          error: { code: "persistence.invalid_record" },
        });
        expect(await persistence.listTaskCapabilityLocks(capabilityIds.task)).toEqual([]);
      });
    });

    it("creates revision zero idempotently and detects conflicting initialization", async () => {
      await withHarness(variant, async (persistence) => {
        const initial = initialPersistedTask();
        const created = await persistence.createTask(initial);
        expect(created).toMatchObject({ ok: true, replayed: false });
        const replayed = await persistence.createTask(initial);
        expect(replayed).toMatchObject({ ok: true, replayed: true });
        expect(await persistence.loadTask(persistenceIds.task)).toEqual(initial);
        expect(await persistence.listTasks()).toEqual([initial]);

        const conflict = await persistence.createTask({
          ...initial,
          head: { ...initial.head, initializationDigest: `sha256:${"f".repeat(64)}` },
        });
        expect(conflict).toMatchObject({ ok: false, error: { code: "persistence.initialization_conflict" } });
      });
    });

    it("atomically commits an accepted command and replays the same command", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        const commit = firstAcceptedCommit();
        const result = await persistence.commitAcceptedCommand(commit);
        expect(result).toMatchObject({ ok: true, replayed: false });
        expect((await persistence.loadTask(persistenceIds.task))?.head).toMatchObject({
          stateRevision: 1,
          lastEventSequence: 1,
          latestCheckpointId: persistenceIds.checkpoint1,
        });
        expect(await persistence.findCommandReceipt(persistenceIds.command1)).toEqual(commit.receipt);

        const replayed = await persistence.commitAcceptedCommand(commit);
        expect(replayed).toMatchObject({ ok: true, replayed: true });
        expect(replayed.ok && replayed.value.checkpoint.checkpointId).toBe(persistenceIds.checkpoint1);
      });
    });

    it("rejects command id reuse with another digest", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        await persistence.commitAcceptedCommand(firstAcceptedCommit());
        const result = await persistence.commitAcceptedCommand(firstAcceptedCommit({
          commandDigest: `sha256:${"e".repeat(64)}`,
        }));
        expect(result).toMatchObject({ ok: false, error: { code: "persistence.idempotency_conflict" } });
        expect((await persistence.loadTask(persistenceIds.task))?.head.stateRevision).toBe(1);
      });
    });

    it("rejects event sequence gaps without changing persisted state", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        const result = await persistence.commitAcceptedCommand(firstAcceptedCommit({ eventSequence: 2 }));
        expect(result).toMatchObject({ ok: false, error: { code: "persistence.sequence_conflict" } });
        expect((await persistence.loadTask(persistenceIds.task))?.head).toMatchObject({
          stateRevision: 0,
          lastEventSequence: 0,
        });
        expect(await persistence.findCommandReceipt(persistenceIds.command1)).toBeUndefined();
      });
    });

    it("rejects optimistic revision conflicts without partial writes", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        const result = await persistence.commitAcceptedCommand(secondAcceptedCommit());
        expect(result).toMatchObject({ ok: false, error: { code: "persistence.revision_conflict" } });
        expect((await persistence.loadTask(persistenceIds.task))?.head.stateRevision).toBe(0);
        expect(await persistence.loadCheckpoint(persistenceIds.checkpoint2)).toBeUndefined();
        expect(await persistence.findCommandReceipt(persistenceIds.command2)).toBeUndefined();
      });
    });

    it("rolls back the whole accepted transaction when outbox uniqueness fails", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        const base = firstAcceptedCommit();
        const result = await persistence.commitAcceptedCommand(firstAcceptedCommit({
          outbox: [base.outbox[0]!, base.outbox[0]!],
        }));
        expect(result.ok).toBe(false);
        expect((await persistence.loadTask(persistenceIds.task))?.head.stateRevision).toBe(0);
        expect(await persistence.loadCheckpoint(persistenceIds.checkpoint1)).toBeUndefined();
        expect(await persistence.findCommandReceipt(persistenceIds.command1)).toBeUndefined();
      });
    });

    it("persists rejected command receipts idempotently without changing task revision", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        const receipt: RejectedCommandReceipt = {
          schemaVersion: PersistenceSchemaVersion,
          commandId: persistenceIds.command1,
          taskId: persistenceIds.task,
          commandType: "complete_run",
          commandDigest: `sha256:${"a".repeat(64)}`,
          receivedAt: persistenceAt.command,
          outcome: "rejected",
          stateRevision: 0,
          error: {
            code: "runtime.invalid_transition",
            category: "validation",
            message: "Task has no active run",
            retryable: false,
          },
        };
        expect(await persistence.commitRejectedCommand(receipt)).toMatchObject({ ok: true, replayed: false });
        expect(await persistence.commitRejectedCommand(receipt)).toMatchObject({ ok: true, replayed: true });
        expect((await persistence.loadTask(persistenceIds.task))?.head.stateRevision).toBe(0);
      });
    });

    it("appends a rejected command audit event without changing task state revision", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        const eventId = "019f7447-a784-77b2-a716-000000001013";
        const outboxId = "019f7447-a784-77b2-a716-000000001014";
        const event: TaskEvent = {
          schemaVersion: PersistenceSchemaVersion,
          eventId,
          taskId: persistenceIds.task,
          sequence: 1,
          type: "runtime.command_rejected",
          occurredAt: persistenceAt.command,
          causationId: persistenceIds.command1,
          correlationId: persistenceIds.task,
          payload: JsonObjectSchema.parse({
            commandType: "record_observation",
            rejectionCode: "runtime.stale_run",
            observationDigest: `sha256:${"c".repeat(64)}`,
          }),
        };
        const outbox = [{
          schemaVersion: PersistenceSchemaVersion,
          outboxId,
          eventId,
          taskId: persistenceIds.task,
          destination: "runtime.events",
          payload: JsonObjectSchema.parse({ event }),
          attemptCount: 0,
          createdAt: persistenceAt.command,
        }];

        expect(await persistence.commitRejectedCommandEvent({
          expectedEventSequence: 0,
          event,
          outbox,
        })).toMatchObject({
          ok: true,
          replayed: false,
          value: { type: "runtime.command_rejected" },
        });
        expect((await persistence.loadTask(persistenceIds.task))?.head).toMatchObject({
          stateRevision: 0,
          lastEventSequence: 1,
          latestCheckpointId: persistenceIds.checkpoint0,
        });
        expect(await persistence.loadEventsAfter(persistenceIds.task, 0)).toEqual([event]);
        expect(await persistence.listPendingOutbox(10)).toEqual([
          expect.objectContaining({ outboxId, eventId }),
        ]);
      });
    });

    it("rejects a non-rejection event through the rejected command event port", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        const acceptedEvent = firstAcceptedCommit().event;
        expect(await persistence.commitRejectedCommandEvent({
          expectedEventSequence: 0,
          event: acceptedEvent,
          outbox: [],
        })).toMatchObject({
          ok: false,
          error: { code: "persistence.integrity_violation" },
        });
        expect((await persistence.loadTask(persistenceIds.task))?.head).toMatchObject({
          stateRevision: 0,
          lastEventSequence: 0,
        });
      });
    });

    it("rejects checkpoint digest mismatch before writing", async () => {
      await withHarness(variant, async (persistence) => {
        const initial = initialPersistedTask();
        const result = await persistence.createTask({
          ...initial,
          checkpoint: { ...initial.checkpoint, stateDigest: `sha256:${"0".repeat(64)}` },
        });
        expect(result).toMatchObject({ ok: false, error: { code: "persistence.integrity_violation" } });
        expect(await persistence.loadTask(persistenceIds.task)).toBeUndefined();
      });
    });

    it("fails closed with a structured error for a malformed boundary record", async () => {
      await withHarness(variant, async (persistence) => {
        const initial = initialPersistedTask();
        const result = await persistence.createTask({
          ...initial,
          head: { ...initial.head, taskId: "not-an-entity-id" },
        } as Parameters<TaskPersistence["createTask"]>[0]);
        expect(result).toMatchObject({ ok: false, error: { code: "persistence.invalid_record" } });
        expect(await persistence.loadTask(persistenceIds.task)).toBeUndefined();
      });
    });

    it("lists only non-terminal recovery candidates", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        const candidates = await persistence.listRecoveryCandidates();
        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.head.taskId).toBe(persistenceIds.task);
      });
    });

    it("loads checkpoints by revision and ordered event tails", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        await persistence.commitAcceptedCommand(firstAcceptedCommit());
        await persistence.commitAcceptedCommand(secondAcceptedCommit());

        expect((await persistence.loadCheckpointAtRevision(persistenceIds.task, 0))?.checkpointId)
          .toBe(persistenceIds.checkpoint0);
        expect((await persistence.loadCheckpointAtRevision(persistenceIds.task, 2))?.checkpointId)
          .toBe(persistenceIds.checkpoint2);
        expect((await persistence.loadEventsAfter(persistenceIds.task, 0)).map((event) => event.sequence))
          .toEqual([1, 2]);
        expect((await persistence.loadEventsAfter(persistenceIds.task, 1)).map((event) => event.eventId))
          .toEqual([persistenceIds.event2]);
      });
    });

    it("records failed and successful outbox delivery attempts idempotently", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        await persistence.commitAcceptedCommand(firstAcceptedCommit());
        const [pending] = await persistence.listPendingOutbox(10);
        expect(pending).toMatchObject({ outboxId: persistenceIds.outbox1, attemptCount: 0 });

        const failedAttempt = await persistence.recordOutboxAttempt({
          outboxId: persistenceIds.outbox1,
          expectedAttemptCount: 0,
          nextAttemptAt: persistenceAt.command2,
        });
        expect(failedAttempt).toMatchObject({
          ok: true,
          replayed: false,
          value: { attemptCount: 1, nextAttemptAt: persistenceAt.command2 },
        });
        expect(await persistence.listPendingOutbox(10)).toHaveLength(1);
        expect(await persistence.listPendingOutbox(10, persistenceAt.command)).toEqual([]);
        expect(await persistence.listPendingOutbox(10, persistenceAt.command2)).toHaveLength(1);

        const published = await persistence.recordOutboxAttempt({
          outboxId: persistenceIds.outbox1,
          expectedAttemptCount: 1,
          publishedAt: persistenceAt.command2,
        });
        expect(published).toMatchObject({
          ok: true,
          replayed: false,
          value: { attemptCount: 2, publishedAt: persistenceAt.command2 },
        });
        expect(published.ok && published.value).not.toHaveProperty("nextAttemptAt");
        expect(await persistence.listPendingOutbox(10)).toEqual([]);
        expect(await persistence.recordOutboxAttempt({
          outboxId: persistenceIds.outbox1,
          expectedAttemptCount: 1,
          publishedAt: persistenceAt.command2,
        })).toMatchObject({ ok: true, replayed: true, value: { attemptCount: 2 } });
      });
    });

    it("persists prepared and dispatched Effect transitions with Event and Outbox atomically", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        const prepared = effectCommit();
        expect(await persistence.commitEffectTransition(prepared)).toMatchObject({
          ok: true,
          replayed: false,
          value: { status: "prepared" },
        });
        expect(await persistence.commitEffectTransition(prepared)).toMatchObject({ ok: true, replayed: true });

        const dispatched = effectCommit({
          expectedEventSequence: 1,
          expectedStatus: "prepared",
          status: "dispatched",
          sequence: 2,
          eventId: effectIds.event2,
          outboxId: effectIds.outbox2,
        });
        expect(await persistence.commitEffectTransition(dispatched)).toMatchObject({
          ok: true,
          replayed: false,
          value: { status: "dispatched" },
        });
        expect(await persistence.loadEffectAttempt(effectIds.attempt1)).toMatchObject({ status: "dispatched" });
        expect(await persistence.findEffectAttemptByIdempotencyKey("effect:conformance:1")).toMatchObject({
          effectAttemptId: effectIds.attempt1,
          status: "dispatched",
        });
        expect(await persistence.listRecoverableEffectAttempts()).toMatchObject([{ status: "dispatched" }]);
        expect((await persistence.loadEventsAfter(persistenceIds.task, 0)).map((event) => event.type)).toEqual([
          "runtime.effect_intent_recorded",
          "runtime.effect_dispatched",
        ]);
        expect(await persistence.listPendingOutbox(10)).toHaveLength(2);
        expect((await persistence.loadTask(persistenceIds.task))?.head).toMatchObject({
          stateRevision: 0,
          lastEventSequence: 2,
        });
      });
    });

    it("rejects duplicate Effect keys and terminal Effect-only commits without partial writes", async () => {
      await withHarness(variant, async (persistence) => {
        await expectCreated(persistence);
        await persistence.commitEffectTransition(effectCommit());
        const duplicateKey = effectCommit({
          effectAttemptId: effectIds.attempt2,
          expectedEventSequence: 1,
          sequence: 2,
          eventId: effectIds.event2,
          outboxId: effectIds.outbox2,
        });
        expect(await persistence.commitEffectTransition(duplicateKey)).toMatchObject({
          ok: false,
          error: { code: "persistence.idempotency_conflict" },
        });
        const terminalOnly = effectCommit({
          expectedEventSequence: 1,
          expectedStatus: "prepared",
          status: "succeeded",
          resultRef: effectIds.result,
          sequence: 2,
          eventId: effectIds.event2,
          outboxId: effectIds.outbox2,
        });
        expect(await persistence.commitEffectTransition(terminalOnly)).toMatchObject({
          ok: false,
          error: { code: "persistence.integrity_violation" },
        });
        expect((await persistence.loadTask(persistenceIds.task))?.head.lastEventSequence).toBe(1);
        expect(await persistence.loadEventsAfter(persistenceIds.task, 0)).toHaveLength(1);
        expect(await persistence.listPendingOutbox(10)).toHaveLength(1);
      });
    });
  });
}

async function withHarness(
  variant: (typeof variants)[number],
  test: (persistence: TaskPersistence) => Promise<void>,
): Promise<void> {
  const harness = await variant.create();
  try {
    await test(harness.persistence);
  } finally {
    await harness.cleanup();
  }
}

async function expectCreated(persistence: TaskPersistence): Promise<void> {
  const result = await persistence.createTask(initialPersistedTask());
  if (!result.ok) {
    throw new Error(`Fixture task creation failed: ${result.error.code}`);
  }
}

const effectIds = {
  attempt1: "019f7447-a784-77b2-a716-000000003001",
  attempt2: "019f7447-a784-77b2-a716-000000003002",
  run: "019f7447-a784-77b2-a716-000000003003",
  step: "019f7447-a784-77b2-a716-000000003004",
  action: "019f7447-a784-77b2-a716-000000003005",
  event1: "019f7447-a784-77b2-a716-000000003006",
  event2: "019f7447-a784-77b2-a716-000000003007",
  outbox1: "019f7447-a784-77b2-a716-000000003008",
  outbox2: "019f7447-a784-77b2-a716-000000003009",
  result: "019f7447-a784-77b2-a716-000000003010",
};

function effectCommit(overrides: {
  effectAttemptId?: string;
  expectedEventSequence?: number;
  expectedStatus?: EffectOnlyCommit["expectedStatus"];
  status?: EffectAttempt["status"];
  resultRef?: string;
  sequence?: number;
  eventId?: string;
  outboxId?: string;
} = {}): EffectOnlyCommit {
  const status = overrides.status ?? "prepared";
  const effectAttemptId = overrides.effectAttemptId ?? effectIds.attempt1;
  const updatedAt = status === "prepared" ? persistenceAt.command : persistenceAt.command2;
  const attempt: EffectAttempt = {
    schemaVersion: PersistenceSchemaVersion,
    effectAttemptId,
    taskId: persistenceIds.task,
    runId: effectIds.run,
    stepId: effectIds.step,
    actionId: effectIds.action,
    idempotencyKey: "effect:conformance:1",
    executorCapability: "fake.effect",
    recoveryMode: "idempotent_retry",
    status,
    ...(overrides.resultRef === undefined ? {} : { resultRef: overrides.resultRef }),
    metadata: {},
    createdAt: persistenceAt.command,
    updatedAt,
  };
  const eventId = overrides.eventId ?? effectIds.event1;
  const sequence = overrides.sequence ?? 1;
  const event: TaskEvent = {
    schemaVersion: PersistenceSchemaVersion,
    eventId,
    taskId: persistenceIds.task,
    sequence,
    type: status === "prepared"
      ? "runtime.effect_intent_recorded"
      : status === "dispatched"
        ? "runtime.effect_dispatched"
        : "runtime.effect_result_recorded",
    occurredAt: updatedAt,
    causationId: effectAttemptId,
    correlationId: persistenceIds.task,
    runId: effectIds.run,
    stepId: effectIds.step,
    payload: JsonObjectSchema.parse({ attempt }),
  };
  return {
    expectedEventSequence: overrides.expectedEventSequence ?? 0,
    ...(overrides.expectedStatus === undefined ? {} : { expectedStatus: overrides.expectedStatus }),
    attempt,
    event,
    outbox: [{
      schemaVersion: PersistenceSchemaVersion,
      outboxId: overrides.outboxId ?? effectIds.outbox1,
      eventId,
      taskId: persistenceIds.task,
      destination: "runtime.events",
      payload: JsonObjectSchema.parse({ event }),
      attemptCount: 0,
      createdAt: updatedAt,
    }],
  };
}
