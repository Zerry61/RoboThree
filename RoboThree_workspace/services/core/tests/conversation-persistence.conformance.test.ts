import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  InMemoryConversationPersistence,
  SqliteConversationPersistence,
  createCompactionExecutionBinding,
} from "../src/index.js";
import type { ConversationPersistence } from "../src/index.js";
import {
  commitCompactionInput,
  competingCommitCompactionInput,
  conversationAt,
  conversationIds,
  conversationMessage,
  failedCompactionInput,
  initialSessionHead,
  requestCompactionInput,
  staleCompactionInput,
} from "./conversation-persistence.fixtures.js";

type Harness = {
  persistence: ConversationPersistence;
  cleanup(): Promise<void>;
};

const variants: readonly {
  name: string;
  create(): Promise<Harness>;
}[] = [
  {
    name: "InMemoryConversationPersistence",
    async create() {
      const persistence = new InMemoryConversationPersistence({
        clock: new FakeClock(conversationAt.created),
      });
      await persistence.start();
      return { persistence, cleanup: () => persistence.stop() };
    },
  },
  {
    name: "SqliteConversationPersistence",
    async create() {
      const directory = await mkdtemp(join(tmpdir(), "robothree-kaf50-conversation-"));
      const persistence = new SqliteConversationPersistence({
        databasePath: join(directory, "robothree.sqlite"),
        clock: new FakeClock(conversationAt.created),
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
    it("creates SessionHead idempotently and appends immutable message envelopes by CAS", async () => {
      await withHarness(variant, async (persistence) => {
        expect(await persistence.createSession(initialSessionHead())).toMatchObject({
          ok: true,
          replayed: false,
        });
        expect(await persistence.createSession(initialSessionHead())).toMatchObject({
          ok: true,
          replayed: true,
        });
        expect(await persistence.appendMessage({
          expectedMessageSequence: 0,
          message: conversationMessage(1),
          updatedAt: conversationAt.message1,
        })).toMatchObject({ ok: true, replayed: false });
        expect(await persistence.appendMessage({
          expectedMessageSequence: 0,
          message: conversationMessage(2),
          updatedAt: conversationAt.message2,
        })).toMatchObject({
          ok: false,
          error: { code: "persistence.message_sequence_conflict" },
        });
        expect((await persistence.loadSession(conversationIds.session))?.messageSequence).toBe(1);
        expect(await persistence.loadMessageRange(conversationIds.session, 1, 10))
          .toEqual([conversationMessage(1)]);
      });
    });

    it("rechecks source and base state, persists T1 atomically, and replays the exact receipt", async () => {
      await withHarness(variant, async (persistence) => {
        await seedTwoMessages(persistence);
        const request = requestCompactionInput();
        expect(await persistence.requestCompaction(request)).toMatchObject({
          ok: true,
          replayed: false,
          value: { status: "pending" },
        });
        expect(await persistence.requestCompaction(request)).toMatchObject({
          ok: true,
          replayed: true,
        });
        expect(await persistence.findSessionCommandReceipt(conversationIds.requestCommand))
          .toEqual(request.receipt);
        expect(await persistence.loadCompactionExecutionBinding(conversationIds.job))
          .toEqual(request.executionBinding);
        expect((await persistence.loadSession(conversationIds.session))?.sessionEventSequence).toBe(1);
        expect(await persistence.loadSessionEventsAfter(conversationIds.session, 0))
          .toEqual([request.event]);
      });
    });

    it("rejects execution binding drift without changing the durable Job", async () => {
      await withHarness(variant, async (persistence) => {
        await seedTwoMessages(persistence);
        const request = requestCompactionInput();
        expect(await persistence.requestCompaction(request)).toMatchObject({ ok: true });
        const drifted = requestCompactionInput();
        const { bindingDigest: _bindingDigest, ...bindingMaterial } = request.executionBinding;
        drifted.executionBinding = createCompactionExecutionBinding({
          ...bindingMaterial,
          externalTargetDigest: `sha256:${"9".repeat(64)}`,
        });
        expect(await persistence.requestCompaction(drifted)).toMatchObject({
          ok: false,
          error: { code: "persistence.compaction_execution_binding_conflict" },
        });
        expect(await persistence.loadCompactionExecutionBinding(conversationIds.job))
          .toEqual(request.executionBinding);
        expect(await persistence.listPendingCompactionJobs()).toHaveLength(1);
      });
    });

    it("returns a typed conflict for commandId reuse with another digest", async () => {
      await withHarness(variant, async (persistence) => {
        await seedTwoMessages(persistence);
        await persistence.requestCompaction(requestCompactionInput());
        const conflict = requestCompactionInput({
          issuedAt: "2026-07-23T08:03:30.000Z",
        });
        expect(await persistence.requestCompaction(conflict)).toMatchObject({
          ok: false,
          error: { code: "persistence.session_command_idempotency_conflict" },
        });
      });
    });

    it("allows only one pending job per Session under competing requests", async () => {
      await withHarness(variant, async (persistence) => {
        await seedTwoMessages(persistence);
        const first = requestCompactionInput();
        const second = requestCompactionInput({
          commandId: "019f7b00-0000-7000-8000-000000000101",
          jobId: conversationIds.secondJob,
          compactionId: conversationIds.secondCompaction,
          eventId: "019f7b00-0000-7000-8000-000000000102",
          outboxId: "019f7b00-0000-7000-8000-000000000103",
        });
        const results = await Promise.all([
          persistence.requestCompaction(first),
          persistence.requestCompaction(second),
        ]);
        expect(results.filter((result) => result.ok)).toHaveLength(1);
        expect(results.filter((result) => !result.ok)).toMatchObject([{
          error: { code: "persistence.pending_compaction_exists" },
        }]);
        expect(await persistence.listPendingCompactionJobs()).toHaveLength(1);
      });
    });

    it("rejects stale source digest without partial Job/Event/Receipt writes", async () => {
      await withHarness(variant, async (persistence) => {
        await seedTwoMessages(persistence);
        const request = requestCompactionInput({
          sourceMessages: [conversationMessage(1)],
          sourceEndSequence: 2,
        });
        expect(await persistence.requestCompaction(request)).toMatchObject({
          ok: false,
          error: { code: "persistence.compaction_source_changed" },
        });
        expect(await persistence.listPendingCompactionJobs()).toEqual([]);
        expect(await persistence.loadSessionEventsAfter(conversationIds.session, 0)).toEqual([]);
        expect(await persistence.findSessionCommandReceipt(request.command.commandId)).toBeUndefined();
      });
    });

    it("keeps an appended raw tail while committing the locked prefix in T2", async () => {
      await withHarness(variant, async (persistence) => {
        await seedTwoMessages(persistence);
        await persistence.requestCompaction(requestCompactionInput());
        await persistence.appendMessage({
          expectedMessageSequence: 2,
          message: conversationMessage(3),
          updatedAt: conversationAt.message3,
        });
        const commit = commitCompactionInput();
        expect(await persistence.commitCompaction(commit)).toMatchObject({
          ok: true,
          replayed: false,
        });
        expect(await persistence.commitCompaction(commit)).toMatchObject({
          ok: true,
          replayed: true,
        });
        expect(await persistence.loadCompactionRecord(conversationIds.compaction))
          .toEqual(commit.command.record);
        expect(await persistence.loadCompactionJob(conversationIds.job)).toMatchObject({
          status: "completed",
          commitCommandId: conversationIds.commitCommand,
        });
        expect(await persistence.loadSession(conversationIds.session)).toMatchObject({
          messageSequence: 3,
          sessionEventSequence: 2,
          contextRevision: 1,
          activeCompactionId: conversationIds.compaction,
        });
        expect(await persistence.loadMessageRange(conversationIds.session, 3, 3))
          .toEqual([conversationMessage(3)]);
      });
    });

    it("accepts only the first competing result and classifies the other as stale", async () => {
      await withHarness(variant, async (persistence) => {
        await seedTwoMessages(persistence);
        await persistence.requestCompaction(requestCompactionInput());
        expect(await persistence.commitCompaction(commitCompactionInput())).toMatchObject({
          ok: true,
          replayed: false,
        });
        expect(await persistence.commitCompaction(competingCommitCompactionInput())).toMatchObject({
          ok: false,
          error: { code: "persistence.compaction_stale" },
        });
        expect(await persistence.loadCompactionRecord(conversationIds.compaction))
          .toEqual(commitCompactionInput().command.record);
      });
    });

    it("fails closed when the locked record source is changed before T2", async () => {
      await withHarness(variant, async (persistence) => {
        await seedTwoMessages(persistence);
        await persistence.requestCompaction(requestCompactionInput());
        const commit = commitCompactionInput();
        commit.command.record.sourceDigest = `sha256:${"f".repeat(64)}`;
        expect(await persistence.commitCompaction(commit)).toMatchObject({
          ok: false,
          error: { code: "persistence.integrity_violation" },
        });
        expect(await persistence.loadCompactionRecord(conversationIds.compaction)).toBeUndefined();
        expect(await persistence.loadCompactionJob(conversationIds.job)).toMatchObject({
          status: "pending",
        });
      });
    });

    it("terminates a stale pending job without changing contextRevision or activeCompactionId", async () => {
      await withHarness(variant, async (persistence) => {
        await seedTwoMessages(persistence);
        await persistence.requestCompaction(requestCompactionInput());
        const terminal = staleCompactionInput();
        expect(await persistence.terminateCompaction(terminal)).toMatchObject({
          ok: true,
          replayed: false,
          value: { status: "stale" },
        });
        expect(await persistence.terminateCompaction(terminal)).toMatchObject({
          ok: true,
          replayed: true,
        });
        const head = await persistence.loadSession(conversationIds.session);
        expect(head).toMatchObject({
          contextRevision: 0,
          sessionEventSequence: 2,
        });
        expect(head).not.toHaveProperty("activeCompactionId");
        expect(await persistence.listPendingCompactionJobs()).toEqual([]);
      });
    });

    it("persists an explicit failed terminal transaction idempotently", async () => {
      await withHarness(variant, async (persistence) => {
        await seedTwoMessages(persistence);
        await persistence.requestCompaction(requestCompactionInput());
        const terminal = failedCompactionInput();
        expect(await persistence.terminateCompaction(terminal)).toMatchObject({
          ok: true,
          replayed: false,
          value: {
            status: "failed",
            failureReason: "summary_generation_failed",
          },
        });
        expect(await persistence.terminateCompaction(terminal)).toMatchObject({
          ok: true,
          replayed: true,
        });
      });
    });
  });
}

async function seedTwoMessages(persistence: ConversationPersistence): Promise<void> {
  await persistence.createSession(initialSessionHead());
  await persistence.appendMessage({
    expectedMessageSequence: 0,
    message: conversationMessage(1),
    updatedAt: conversationAt.message1,
  });
  await persistence.appendMessage({
    expectedMessageSequence: 1,
    message: conversationMessage(2),
    updatedAt: conversationAt.message2,
  });
}

async function withHarness(
  variant: (typeof variants)[number],
  operation: (persistence: ConversationPersistence) => Promise<void>,
): Promise<void> {
  const harness = await variant.create();
  try {
    await operation(harness.persistence);
  } finally {
    await harness.cleanup();
  }
}
