import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  DurableTaskRuntime,
  FakeClock,
  FakeIdGenerator,
  InMemoryConversationPersistence,
  InMemoryTaskPersistence,
  SqliteConversationPersistence,
  SqliteTaskPersistence,
  TurnSnapshotBuilder,
  sha256CanonicalJson,
} from "../src/index.js";
import type {
  ConversationPersistence,
  TaskPersistence,
} from "../src/index.js";
import {
  seedTurnFixture,
  turnAt,
  turnIds,
} from "./turn-snapshot.fixtures.js";
import { capabilityLock } from "./capability.fixtures.js";
import {
  commitCompactionInput,
  conversationAt,
  conversationIds,
  conversationMessage,
  initialSessionHead,
  requestCompactionInput,
} from "./conversation-persistence.fixtures.js";

type Harness = {
  conversation: ConversationPersistence;
  tasks: TaskPersistence;
  cleanup(): Promise<void>;
};

const variants: readonly {
  name: string;
  create(): Promise<Harness>;
}[] = [
  {
    name: "InMemory",
    async create() {
      const clock = new FakeClock(turnAt.created);
      const conversation = new InMemoryConversationPersistence({ clock });
      const tasks = new InMemoryTaskPersistence(clock);
      await tasks.start();
      await conversation.start();
      return {
        conversation,
        tasks,
        async cleanup() {
          await conversation.stop();
          await tasks.stop();
        },
      };
    },
  },
  {
    name: "SQLite",
    async create() {
      const directory = await mkdtemp(join(tmpdir(), "robothree-kaf51-turn-"));
      const databasePath = join(directory, "robothree.sqlite");
      const clock = new FakeClock(turnAt.created);
      const tasks = new SqliteTaskPersistence({ databasePath, clock });
      const conversation = new SqliteConversationPersistence({ databasePath, clock });
      await tasks.start();
      await conversation.start();
      return {
        conversation,
        tasks,
        async cleanup() {
          await conversation.stop();
          await tasks.stop();
          await rm(directory, { recursive: true, force: true });
        },
      };
    },
  },
];

for (const variant of variants) {
  describe(`${variant.name} TurnSnapshotBuilder`, () => {
    it("projects 3 user turns, 3 assistant turns, one tool exchange, and 2 Tasks deterministically", async () => {
      await withHarness(variant, async ({ conversation, tasks }) => {
        const fixtureMessages = await seedTurnFixture(conversation, tasks);
        expect(fixtureMessages.filter((record) => record.message.role === "user")).toHaveLength(3);
        expect(fixtureMessages.filter((record) => record.message.role === "assistant")).toHaveLength(3);
        expect(fixtureMessages.filter((record) => record.message.role === "tool")).toHaveLength(1);
        expect(await tasks.listTasksBySession(turnIds.session)).toHaveLength(2);
        const builder = new TurnSnapshotBuilder({
          conversationPersistence: conversation,
          taskPersistence: tasks,
        });
        const snapshots = await Promise.all(Array.from({ length: 10 }, () => builder.build({
          snapshotId: turnIds.snapshot,
          sessionId: turnIds.session,
          createdAt: turnAt.snapshot,
        })));
        expect(snapshots.every((snapshot) =>
          JSON.stringify(snapshot) === JSON.stringify(snapshots[0]))).toBe(true);
        expect(snapshots[0]).toMatchObject({
          conversation: {
            messageSequence: 7,
            messageStartSequence: 1,
            messageEndSequence: 7,
          },
          tasks: [
            { taskId: turnIds.task1, stateRevision: 3, lastEventSequence: 3 },
            { taskId: turnIds.task2, stateRevision: 0, lastEventSequence: 0 },
          ],
        });
        expect(snapshots[0]!.projection.map((item) => item.type)).toEqual([
          ...Array.from({ length: 7 }, () => "conversation_message"),
          "task_state",
          "task_event",
          "task_event",
          "task_event",
          "task_state",
        ]);
      });
    });

    it("keeps rich messages append-only and rejects duplicate IDs with different content", async () => {
      await withHarness(variant, async ({ conversation, tasks }) => {
        const messages = await seedTurnFixture(conversation, tasks);
        expect(await conversation.loadMessageRange(turnIds.session, 1, 7)).toEqual(messages);
        const conflicting = structuredClone(messages[0]!);
        conflicting.envelope.sequence = 8;
        conflicting.message.content[0]!.text = "different";
        conflicting.envelope.messageDigest = sha256CanonicalJson(
          JsonValueSchema.parse(conflicting.message),
        );
        expect(await conversation.appendMessage({
          expectedMessageSequence: 7,
          message: conflicting,
          updatedAt: "2026-07-23T10:18:00.000Z",
        })).toMatchObject({
          ok: false,
          error: { code: "persistence.duplicate_message" },
        });
        expect(conversation).not.toHaveProperty("updateMessage");
        expect(conversation).not.toHaveProperty("deleteMessage");
      });
    });

    it("builds a derived snapshot from the active Compaction raw-tail boundary", async () => {
      await withHarness(variant, async ({ conversation, tasks }) => {
        await conversation.createSession(initialSessionHead());
        await conversation.appendMessage({
          expectedMessageSequence: 0,
          message: conversationMessage(1),
          updatedAt: conversationAt.message1,
        });
        await conversation.appendMessage({
          expectedMessageSequence: 1,
          message: conversationMessage(2),
          updatedAt: conversationAt.message2,
        });
        expect(await conversation.requestCompaction(requestCompactionInput()))
          .toMatchObject({ ok: true });
        expect(await conversation.commitCompaction(commitCompactionInput()))
          .toMatchObject({ ok: true });
        await conversation.appendMessage({
          expectedMessageSequence: 2,
          message: conversationMessage(3),
          updatedAt: conversationAt.message3,
        });
        const builder = new TurnSnapshotBuilder({
          conversationPersistence: conversation,
          taskPersistence: tasks,
        });
        const snapshot = await builder.build({
          snapshotId: turnIds.snapshot,
          sessionId: conversationIds.session,
          fromMessageSequence: 3,
          createdAt: turnAt.snapshot,
        });
        expect(snapshot.conversation).toMatchObject({
          messageSequence: 3,
          messageStartSequence: 3,
          messageEndSequence: 3,
          activeCompactionId: conversationIds.compaction,
        });
        expect(snapshot.projection.filter((item) => item.type === "conversation_message"))
          .toHaveLength(1);
      });
    });

    it("fails closed when a message references a Task owned by another Session", async () => {
      await withHarness(variant, async ({ conversation, tasks }) => {
        const runtime = new DurableTaskRuntime({
          persistence: tasks,
          idGenerator: new FakeIdGenerator([
            "019f7c00-0000-7000-8000-000000009001",
          ]),
        });
        await runtime.createTask({
          taskId: turnIds.task1,
          sessionId: turnIds.otherSession,
          agentDefinition: { agentDefinitionId: turnIds.agent, version: "1.0.0" },
          goal: "cross-session fixture",
          createdAt: turnAt.created,
        });
        await conversation.createSession({
          schemaVersion: CONVERSATION_SCHEMA_VERSION,
          sessionId: turnIds.session,
          messageSequence: 0,
          sessionEventSequence: 0,
          contextRevision: 0,
          createdAt: turnAt.created,
          updatedAt: turnAt.created,
        });
        const message = {
          schemaVersion: MODEL_PROTOCOL_VERSION,
          role: "assistant" as const,
          content: [{ type: "text" as const, text: "cross session" }],
          toolCalls: [],
        };
        await conversation.appendMessage({
          expectedMessageSequence: 0,
          updatedAt: turnAt.snapshot,
          message: {
            envelope: {
              schemaVersion: CONVERSATION_SCHEMA_VERSION,
              messageId: "019f7c00-0000-7000-8000-000000009002",
              sessionId: turnIds.session,
              sequence: 1,
              messageSchemaVersion: MODEL_PROTOCOL_VERSION,
              messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
              taskId: turnIds.task1,
              createdAt: turnAt.snapshot,
            },
            message,
          },
        });
        const builder = new TurnSnapshotBuilder({
          conversationPersistence: conversation,
          taskPersistence: tasks,
        });
        await expect(builder.build({
          snapshotId: turnIds.snapshot,
          sessionId: turnIds.session,
          createdAt: turnAt.snapshot,
        })).rejects.toThrow("outside the Session snapshot");
      });
    });
  });
}

it("produces identical projection and source digest in InMemory and SQLite", async () => {
  const [memory, sqlite] = await Promise.all([variants[0]!.create(), variants[1]!.create()]);
  try {
    await seedTurnFixture(memory.conversation, memory.tasks);
    await seedTurnFixture(sqlite.conversation, sqlite.tasks);
    const lock = capabilityLock({ taskId: turnIds.task1 });
    expect(await memory.tasks.commitTaskCapabilityLock(lock)).toMatchObject({ ok: true });
    expect(await sqlite.tasks.commitTaskCapabilityLock(lock)).toMatchObject({ ok: true });
    const input = {
      snapshotId: turnIds.snapshot,
      sessionId: turnIds.session,
      createdAt: turnAt.snapshot,
    };
    const memorySnapshot = await new TurnSnapshotBuilder({
      conversationPersistence: memory.conversation,
      taskPersistence: memory.tasks,
    }).build(input);
    const sqliteSnapshot = await new TurnSnapshotBuilder({
      conversationPersistence: sqlite.conversation,
      taskPersistence: sqlite.tasks,
    }).build(input);
    expect(sqliteSnapshot).toEqual(memorySnapshot);
    expect(memorySnapshot.tasks[0]?.capabilityLocks).toEqual([
      expect.objectContaining({
        lockId: lock.lockId,
        capabilityId: "tool.echo",
        capabilityRevision: lock.definitionSnapshot.revision,
        registryRevision: lock.registryRevision,
      }),
    ]);
  } finally {
    await memory.cleanup();
    await sqlite.cleanup();
  }
});

async function withHarness(
  variant: (typeof variants)[number],
  operation: (harness: Harness) => Promise<void>,
): Promise<void> {
  const harness = await variant.create();
  try {
    await operation(harness);
  } finally {
    await harness.cleanup();
  }
}
