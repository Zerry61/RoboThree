import {
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
} from "@robothree/contracts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { beforeEach, describe, expect, it } from "vitest";

import {
  CompactedContextViewBuilder,
  CompactionCoordinator,
  FakeClock,
  FakeCompactionSummarizer,
  FakeIdGenerator,
  InMemoryConversationPersistence,
  SqliteConversationPersistence,
  sha256CanonicalJson,
  type CompactionExecutionBindingSeed,
} from "../src/index.js";
import {
  conversationAt,
  conversationIds,
  conversationMessage,
  competingCommitCompactionInput,
  commitCompactionInput,
  initialSessionHead,
  requestCompactionInput,
} from "./conversation-persistence.fixtures.js";

const ids = [
  "019f7c00-0000-7000-8000-000000000001",
  "019f7c00-0000-7000-8000-000000000002",
  "019f7c00-0000-7000-8000-000000000003",
  "019f7c00-0000-7000-8000-000000000004",
  "019f7c00-0000-7000-8000-000000000005",
  "019f7c00-0000-7000-8000-000000000006",
  "019f7c00-0000-7000-8000-000000000007",
  "019f7c00-0000-7000-8000-000000000008",
  "019f7c00-0000-7000-8000-000000000009",
  "019f7c00-0000-7000-8000-000000000010",
  "019f7c00-0000-7000-8000-000000000011",
  "019f7c00-0000-7000-8000-000000000012",
];

const executionBinding: CompactionExecutionBindingSeed = {
  taskId: "019f7c00-0000-7000-8000-000000000060",
  runtimeSelectionId: "019f7c00-0000-7000-8000-000000000061",
  runtimeSelectionDigest: `sha256:${"1".repeat(64)}`,
  modelLockId: "019f7c00-0000-7000-8000-000000000062",
  modelCapabilityId: "model.fake-summarizer",
  modelLockDigest: `sha256:${"2".repeat(64)}`,
  registryRevision: `sha256:${"3".repeat(64)}`,
  adapterDescriptorId: "adapter.model.fake-summarizer",
  adapterDescriptorRevision: `sha256:${"4".repeat(64)}`,
  externalTargetDigest: `sha256:${"5".repeat(64)}`,
  summarizerPromptRevision: `sha256:${"6".repeat(64)}`,
};

describe("CompactionCoordinator", () => {
  let persistence: InMemoryConversationPersistence;

  beforeEach(async () => {
    persistence = new InMemoryConversationPersistence({
      clock: new FakeClock(conversationAt.created),
    });
    await persistence.start();
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
  });

  it("coordinates request, out-of-transaction summary, commit, and raw-tail view", async () => {
    const summarizer = new FakeCompactionSummarizer({
      summary: "A durable compacted summary.",
      summarySchemaVersion: "v1alpha1",
      summarizerModelRef: "model.fake-summarizer",
      summarizerPromptRevision: sha256CanonicalJson(JsonValueSchema.parse({ prompt: 1 })),
      estimatedTokensBefore: 100,
      estimatedTokensAfter: 20,
    });
    const coordinator = new CompactionCoordinator({
      persistence,
      summarizer,
      clock: new FakeClock(conversationAt.committed),
      idGenerator: new FakeIdGenerator(ids),
    });

    const result = await coordinator.compact({
      sessionId: conversationIds.session,
      sourceStartSequence: 1,
      sourceEndSequence: 2,
      executionBinding,
    });

    expect(result).toMatchObject({ status: "completed", replayed: false });
    expect(summarizer.calls).toHaveLength(1);
    expect((await persistence.loadSession(conversationIds.session))?.contextRevision).toBe(1);

    await persistence.appendMessage({
      expectedMessageSequence: 2,
      message: conversationMessage(3),
      updatedAt: conversationAt.message3,
    });
    const view = await new CompactedContextViewBuilder(persistence)
      .build(conversationIds.session);
    expect(view.summary).toBe("A durable compacted summary.");
    expect(view.rawTail.map((message) => message.envelope.sequence)).toEqual([3]);
  });

  it("keeps the pending Job when an accepted summary invocation has not started output", async () => {
    const interruption = Object.assign(
      new Error("accepted without output"),
      { code: "model_stream_resume_unavailable", outputStarted: false },
    );
    const coordinator = new CompactionCoordinator({
      persistence,
      summarizer: {
        summarize: async () => Promise.reject(interruption),
      },
      clock: new FakeClock(conversationAt.committed),
      idGenerator: new FakeIdGenerator(ids),
    });

    await expect(coordinator.compact({
      sessionId: conversationIds.session,
      sourceStartSequence: 1,
      sourceEndSequence: 2,
      executionBinding,
    })).rejects.toBe(interruption);
    expect(await persistence.listPendingCompactionJobs()).toHaveLength(1);
  });

  it("fails a pending job explicitly when summary generation fails", async () => {
    const coordinator = new CompactionCoordinator({
      persistence,
      summarizer: new FakeCompactionSummarizer(new Error("provider unavailable")),
      clock: new FakeClock(conversationAt.committed),
      idGenerator: new FakeIdGenerator(ids),
    });

    await expect(coordinator.compact({
      sessionId: conversationIds.session,
      sourceStartSequence: 1,
      sourceEndSequence: 2,
      executionBinding,
    })).resolves.toMatchObject({
      status: "failed",
      job: { status: "failed", failureReason: "summary_generation_failed" },
    });
    await expect(persistence.listPendingCompactionJobs()).resolves.toEqual([]);
  });

  it("recovers the same pending job after summary acquisition crashes before commit", async () => {
    const summary = {
      summary: "Recovered summary.",
      summarySchemaVersion: "v1alpha1",
      summarizerModelRef: "model.fake-summarizer",
      summarizerPromptRevision: sha256CanonicalJson(JsonValueSchema.parse({ prompt: 1 })),
      estimatedTokensBefore: 100,
      estimatedTokensAfter: 20,
    };
    const crashing = new CompactionCoordinator({
      persistence,
      summarizer: new FakeCompactionSummarizer(summary),
      clock: new FakeClock(conversationAt.committed),
      idGenerator: new FakeIdGenerator(ids),
      faultInjector: () => {
        throw new Error("simulated crash");
      },
    });
    await expect(crashing.compact({
      sessionId: conversationIds.session,
      sourceStartSequence: 1,
      sourceEndSequence: 2,
      executionBinding,
    })).rejects.toThrow("simulated crash");
    await expect(persistence.listPendingCompactionJobs()).resolves.toHaveLength(1);

    const recovered = new CompactionCoordinator({
      persistence,
      summarizer: new FakeCompactionSummarizer(summary),
      clock: new FakeClock(conversationAt.committed),
      idGenerator: new FakeIdGenerator(ids.slice(6)),
    });
    await expect(recovered.recoverPending()).resolves.toMatchObject([
      { status: "completed" },
    ]);
  });

  it("plans rolling summarization as active Summary plus only the new raw extension", async () => {
    const first = await new CompactionCoordinator({
      persistence,
      summarizer: new FakeCompactionSummarizer({
        summary: "Base summary.",
        summarySchemaVersion: "v1alpha1",
        summarizerModelRef: "model.fake-summarizer",
        summarizerPromptRevision: executionBinding.summarizerPromptRevision,
        estimatedTokensBefore: 100,
        estimatedTokensAfter: 20,
      }),
      clock: new FakeClock(conversationAt.committed),
      idGenerator: new FakeIdGenerator(ids),
    }).compact({
      sessionId: conversationIds.session,
      sourceStartSequence: 1,
      sourceEndSequence: 2,
      executionBinding,
    });
    expect(first.status).toBe("completed");
    await persistence.appendMessage({
      expectedMessageSequence: 2,
      message: conversationMessage(3),
      updatedAt: conversationAt.message3,
    });
    await persistence.appendMessage({
      expectedMessageSequence: 3,
      message: coordinatorConversationMessage(4),
      updatedAt: conversationAt.message3,
    });
    const summarizer = new FakeCompactionSummarizer({
      summary: "Rolling summary.",
      summarySchemaVersion: "v1alpha1",
      summarizerModelRef: "model.fake-summarizer",
      summarizerPromptRevision: executionBinding.summarizerPromptRevision,
      estimatedTokensBefore: 120,
      estimatedTokensAfter: 30,
    });
    const rolling = await new CompactionCoordinator({
      persistence,
      summarizer,
      clock: new FakeClock(conversationAt.committed),
      idGenerator: new FakeIdGenerator(raceIds(300)),
    }).compact({
      sessionId: conversationIds.session,
      sourceStartSequence: 1,
      sourceEndSequence: 4,
      executionBinding,
    });
    expect(rolling.status).toBe("completed");
    expect(summarizer.calls).toMatchObject([{
      sourceSequences: [3, 4],
      baseCompactionId: first.status === "completed" ? first.record.compactionId : undefined,
    }]);
    if (rolling.status === "completed") {
      expect(rolling.record).toMatchObject({
        sourceStartSequence: 1,
        sourceEndSequence: 4,
        baseActiveCompactionId: first.status === "completed"
          ? first.record.compactionId
          : undefined,
      });
    }
  });

  it("runs the same coordinator path through SQLite and survives close/reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf53-compaction-"));
    const databasePath = join(directory, "robothree.sqlite");
    const clock = new FakeClock(conversationAt.committed);
    try {
      const sqlite = new SqliteConversationPersistence({ databasePath, clock });
      await sqlite.start();
      await sqlite.createSession(initialSessionHead());
      await sqlite.appendMessage({
        expectedMessageSequence: 0,
        message: conversationMessage(1),
        updatedAt: conversationAt.message1,
      });
      await sqlite.appendMessage({
        expectedMessageSequence: 1,
        message: conversationMessage(2),
        updatedAt: conversationAt.message2,
      });
      const coordinator = new CompactionCoordinator({
        persistence: sqlite,
        summarizer: new FakeCompactionSummarizer({
          summary: "SQLite summary.",
          summarySchemaVersion: "v1alpha1",
          summarizerModelRef: "model.fake-summarizer",
          summarizerPromptRevision: sha256CanonicalJson(JsonValueSchema.parse({ prompt: 1 })),
          estimatedTokensBefore: 100,
          estimatedTokensAfter: 20,
        }),
        clock,
        idGenerator: new FakeIdGenerator(ids),
      });
      const result = await coordinator.compact({
        sessionId: conversationIds.session,
        sourceStartSequence: 1,
        sourceEndSequence: 2,
        executionBinding,
      });
      expect(result.status).toBe("completed");
      await sqlite.stop();

      const reopened = new SqliteConversationPersistence({ databasePath, clock });
      await reopened.start();
      const view = await new CompactedContextViewBuilder(reopened)
        .build(conversationIds.session);
      expect(view.summary).toBe("SQLite summary.");
      expect(view.rawTail).toEqual([]);
      expect(await reopened.loadCompactionExecutionBinding(
        (result.status === "completed" ? result.record.compactionJobId : ""),
      )).toMatchObject({
        taskId: executionBinding.taskId,
        runtimeSelectionDigest: executionBinding.runtimeSelectionDigest,
        modelCapabilityId: executionBinding.modelCapabilityId,
        registryRevision: executionBinding.registryRevision,
      });
      await reopened.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("allows at most one coordinator request winner across 10 races", async () => {
    for (let round = 0; round < 10; round += 1) {
      const store = new InMemoryConversationPersistence({
        clock: new FakeClock(conversationAt.created),
      });
      await store.start();
      await store.createSession(initialSessionHead());
      await store.appendMessage({
        expectedMessageSequence: 0,
        message: conversationMessage(1),
        updatedAt: conversationAt.message1,
      });
      await store.appendMessage({
        expectedMessageSequence: 1,
        message: conversationMessage(2),
        updatedAt: conversationAt.message2,
      });
      const coordinators = [0, 1].map((side) => new CompactionCoordinator({
        persistence: store,
        summarizer: new FakeCompactionSummarizer({
          summary: `race-${round}-${side}`,
          summarySchemaVersion: "v1alpha1",
          summarizerModelRef: "model.fake-summarizer",
          summarizerPromptRevision: sha256CanonicalJson(JsonValueSchema.parse({ prompt: 1 })),
          estimatedTokensBefore: 100,
          estimatedTokensAfter: 20,
        }),
        clock: new FakeClock(conversationAt.committed),
        idGenerator: new FakeIdGenerator(raceIds(side * 100)),
      }));
      const results = await Promise.all(coordinators.map((coordinator) =>
        coordinator.compact({
          sessionId: conversationIds.session,
          sourceStartSequence: 1,
          sourceEndSequence: 2,
          executionBinding,
        })));
      expect(results.filter((result) => result.status === "completed")).toHaveLength(1);
      await store.stop();
    }
  });

  it("allows at most one CAS result winner across 10 recovery races", async () => {
    for (let round = 0; round < 10; round += 1) {
      const store = new InMemoryConversationPersistence({
        clock: new FakeClock(conversationAt.created),
      });
      await store.start();
      await store.createSession(initialSessionHead());
      await store.appendMessage({
        expectedMessageSequence: 0,
        message: conversationMessage(1),
        updatedAt: conversationAt.message1,
      });
      await store.appendMessage({
        expectedMessageSequence: 1,
        message: conversationMessage(2),
        updatedAt: conversationAt.message2,
      });
      expect((await store.requestCompaction(requestCompactionInput())).ok).toBe(true);
      const coordinators = [0, 1].map((side) => new CompactionCoordinator({
        persistence: store,
        summarizer: new FakeCompactionSummarizer({
          summary: `result-race-${round}-${side}`,
          summarySchemaVersion: "v1alpha1",
          summarizerModelRef: "model.fake-summarizer",
          summarizerPromptRevision: sha256CanonicalJson(JsonValueSchema.parse({ prompt: 1 })),
          estimatedTokensBefore: 100,
          estimatedTokensAfter: 20,
        }),
        clock: new FakeClock(conversationAt.committed),
        idGenerator: new FakeIdGenerator(raceIds(side * 100)),
      }));
      const results = (await Promise.all(
        coordinators.map((coordinator) => coordinator.recoverPending()),
      )).flat();
      expect(results.filter((result) => result.status === "completed")).toHaveLength(1);
      expect((await store.loadSession(conversationIds.session))?.contextRevision).toBe(1);
      await store.stop();
    }
  });

  it("rejects an explicitly delayed stale Compaction result without replacing the active view", async () => {
    expect((await persistence.requestCompaction(requestCompactionInput())).ok).toBe(true);
    const committed = await persistence.commitCompaction(commitCompactionInput());
    expect(committed).toMatchObject({ ok: true });
    const activeBefore = await persistence.loadSession(conversationIds.session);

    const delayed = await persistence.commitCompaction(competingCommitCompactionInput());

    expect(delayed).toMatchObject({
      ok: false,
      error: { code: "persistence.compaction_stale" },
    });
    expect(await persistence.loadSession(conversationIds.session)).toEqual(activeBefore);
    expect(await persistence.loadCompactionRecord(conversationIds.compaction))
      .toMatchObject({ summary: commitCompactionInput().command.record.summary });
  });

  it("rebuilds one active Summary plus 500-message SQLite raw tail within 2 seconds", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-kaf53-view-performance-"));
    const databasePath = join(directory, "robothree.sqlite");
    const clock = new FakeClock(conversationAt.committed);
    try {
      const sqlite = new SqliteConversationPersistence({ databasePath, clock });
      await sqlite.start();
      await sqlite.createSession(initialSessionHead());
      for (let sequence = 1; sequence <= 2; sequence += 1) {
        await sqlite.appendMessage({
          expectedMessageSequence: sequence - 1,
          message: largeConversationMessage(sequence),
          updatedAt: conversationAt.message2,
        });
      }
      const compacted = await new CompactionCoordinator({
        persistence: sqlite,
        summarizer: new FakeCompactionSummarizer({
          summary: "Active summary.",
          summarySchemaVersion: "v1alpha1",
          summarizerModelRef: "model.fake-summarizer",
          summarizerPromptRevision: sha256CanonicalJson(JsonValueSchema.parse({ prompt: 1 })),
          estimatedTokensBefore: 100,
          estimatedTokensAfter: 20,
        }),
        clock,
        idGenerator: new FakeIdGenerator(ids),
      }).compact({
        sessionId: conversationIds.session,
        sourceStartSequence: 1,
        sourceEndSequence: 2,
        executionBinding,
      });
      expect(compacted.status).toBe("completed");
      for (let sequence = 3; sequence <= 502; sequence += 1) {
        const appended = await sqlite.appendMessage({
          expectedMessageSequence: sequence - 1,
          message: largeConversationMessage(sequence),
          updatedAt: conversationAt.message3,
        });
        expect(appended.ok).toBe(true);
      }
      await sqlite.stop();

      const reopened = new SqliteConversationPersistence({ databasePath, clock });
      await reopened.start();
      const startedAt = performance.now();
      const view = await new CompactedContextViewBuilder(reopened)
        .build(conversationIds.session);
      const elapsedMs = performance.now() - startedAt;
      expect(view.summary).toBe("Active summary.");
      expect(view.rawTail).toHaveLength(500);
      expect(elapsedMs).toBeLessThan(2_000);
      await reopened.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reopens SQLite 10 times at each of the three named Compaction crash points", async () => {
    const points = [
      "request_compaction.after_commit",
      "compaction.summary_obtained_before_commit",
      "commit_compaction.after_commit",
    ] as const;
    for (const point of points) {
      for (let round = 0; round < 10; round += 1) {
        const directory = await mkdtemp(join(
          tmpdir(),
          `robothree-kaf53-${point.replaceAll(".", "-")}-${round}-`,
        ));
        const databasePath = join(directory, "robothree.sqlite");
        const clock = new FakeClock(conversationAt.committed);
        const first = new SqliteConversationPersistence({
          databasePath,
          clock,
          ...(point === "compaction.summary_obtained_before_commit"
            ? {}
            : {
              faultInjector: (observed) => {
                if (observed === point) throw new Error(`crash:${point}`);
              },
            }),
        });
        try {
          await first.start();
          await first.createSession(initialSessionHead());
          await first.appendMessage({
            expectedMessageSequence: 0,
            message: conversationMessage(1),
            updatedAt: conversationAt.message1,
          });
          await first.appendMessage({
            expectedMessageSequence: 1,
            message: conversationMessage(2),
            updatedAt: conversationAt.message2,
          });
          const coordinator = new CompactionCoordinator({
            persistence: first,
            summarizer: new FakeCompactionSummarizer({
              summary: `crash-recovery-${point}`,
              summarySchemaVersion: "v1alpha1",
              summarizerModelRef: "model.fake-summarizer",
              summarizerPromptRevision: sha256CanonicalJson(
                JsonValueSchema.parse({ prompt: 1 }),
              ),
              estimatedTokensBefore: 100,
              estimatedTokensAfter: 20,
            }),
            clock,
            idGenerator: new FakeIdGenerator(raceIds(0)),
            ...(point === "compaction.summary_obtained_before_commit"
              ? {
                faultInjector: () => {
                  throw new Error(`crash:${point}`);
                },
              }
              : {}),
          });
          const crashed = coordinator.compact({
            sessionId: conversationIds.session,
            sourceStartSequence: 1,
            sourceEndSequence: 2,
            executionBinding,
          });
          if (point === "compaction.summary_obtained_before_commit") {
            await expect(crashed).rejects.toThrow(`crash:${point}`);
          } else {
            await expect(crashed).resolves.toMatchObject({
              status: "rejected",
              errorCode: "persistence.sqlite_write_failed",
            });
          }
          await first.stop();

          const reopened = new SqliteConversationPersistence({ databasePath, clock });
          await reopened.start();
          if (point === "commit_compaction.after_commit") {
            expect(await reopened.listPendingCompactionJobs()).toEqual([]);
            expect((await reopened.loadSession(conversationIds.session))?.contextRevision).toBe(1);
          } else {
            expect(await reopened.listPendingCompactionJobs()).toHaveLength(1);
            const [pending] = await reopened.listPendingCompactionJobs();
            expect(await reopened.loadCompactionExecutionBinding(
              pending!.compactionJobId,
            )).toMatchObject({
              modelCapabilityId: executionBinding.modelCapabilityId,
              registryRevision: executionBinding.registryRevision,
            });
            const recovered = await new CompactionCoordinator({
              persistence: reopened,
              summarizer: new FakeCompactionSummarizer({
                summary: `crash-recovery-${point}`,
                summarySchemaVersion: "v1alpha1",
                summarizerModelRef: "model.fake-summarizer",
                summarizerPromptRevision: sha256CanonicalJson(
                  JsonValueSchema.parse({ prompt: 1 }),
                ),
                estimatedTokensBefore: 100,
                estimatedTokensAfter: 20,
              }),
              clock,
              idGenerator: new FakeIdGenerator(raceIds(100)),
            }).recoverPending();
            expect(recovered).toMatchObject([{ status: "completed" }]);
          }
          await reopened.stop();
        } finally {
          await first.stop();
          await rm(directory, { recursive: true, force: true });
        }
      }
    }
  });
});

function raceIds(offset: number): readonly string[] {
  return Array.from({ length: 20 }, (_, index) =>
    `019f7c00-0000-7000-8001-${String(offset + index + 1).padStart(12, "0")}`);
}

function coordinatorConversationMessage(sequence: number) {
  const message = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "assistant" as const,
    content: [{ type: "text" as const, text: `fixture-message-${sequence}` }],
    toolCalls: [],
  };
  return {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: `019f7c00-0000-7000-8002-${String(sequence).padStart(12, "0")}`,
      sessionId: conversationIds.session,
      sequence,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      createdAt: new Date(Date.parse(conversationAt.created) + sequence * 1_000).toISOString(),
    },
    message,
  };
}

function largeConversationMessage(sequence: number) {
  const message = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "user" as const,
    content: [{ type: "text" as const, text: `message-${sequence}` }],
  };
  return {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: `019f7e00-0000-7000-8000-${String(sequence).padStart(12, "0")}`,
      sessionId: conversationIds.session,
      sequence,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      createdAt: new Date(Date.parse(conversationAt.created) + sequence * 1_000).toISOString(),
    },
    message,
  };
}
