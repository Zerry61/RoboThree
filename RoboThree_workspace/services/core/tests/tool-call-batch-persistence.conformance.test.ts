import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  InMemoryConversationPersistence,
  SqliteConversationPersistence,
  TOOL_CALL_BATCH_SCHEMA_VERSION,
  ToolCallBatchRecordSchema,
  ToolCallDispositionRecordSchema,
  type ConversationPersistence,
  type ConversationPersistenceFaultPoint,
} from "../src/index.js";
import {
  assistantBatchInput,
  batchAt,
  batchIds,
  batchSessionHead,
  effectLinkedDisposition,
  toolResultCompletion,
} from "./tool-call-batch-persistence.fixtures.js";

type Harness = {
  persistence: ConversationPersistence;
  cleanup(): Promise<void>;
};

const variants: readonly {
  name: string;
  create(faultPoint?: ConversationPersistenceFaultPoint): Promise<Harness>;
}[] = [
  {
    name: "InMemoryConversationPersistence",
    async create(faultPoint) {
      const persistence = new InMemoryConversationPersistence({
        clock: new FakeClock(batchAt.created),
        ...(faultPoint === undefined ? {} : {
          faultInjector(point) {
            if (point === faultPoint) throw new Error(`fault:${point}`);
          },
        }),
      });
      await persistence.start();
      return { persistence, cleanup: () => persistence.stop() };
    },
  },
  {
    name: "SqliteConversationPersistence",
    async create(faultPoint) {
      const directory = await mkdtemp(join(tmpdir(), "robothree-adr17-i1-"));
      const persistence = new SqliteConversationPersistence({
        databasePath: join(directory, "robothree.sqlite"),
        clock: new FakeClock(batchAt.created),
        ...(faultPoint === undefined ? {} : {
          faultInjector(point) {
            if (point === faultPoint) throw new Error(`fault:${point}`);
          },
        }),
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

describe("ADR17-I1 internal record schemas", () => {
  it("rejects unknown fields and incomplete disposition-specific identities", () => {
    const input = assistantBatchInput();
    expect(ToolCallBatchRecordSchema.safeParse({ ...input.batch, secret: "not-allowed" }).success)
      .toBe(false);
    expect(ToolCallDispositionRecordSchema.safeParse({
      ...input.dispositions[0],
      disposition: "waiting_user_confirmation",
    }).success).toBe(false);
    expect(ToolCallDispositionRecordSchema.safeParse({
      ...input.dispositions[0],
      disposition: "result_committed",
      revision: 1,
    }).success).toBe(false);
    const resultWithoutEffect = { ...toolResultCompletion().completedDisposition };
    delete resultWithoutEffect.effectAttemptId;
    expect(ToolCallDispositionRecordSchema.safeParse(resultWithoutEffect).success).toBe(false);
  });

  it("keeps the internal schema version independent of public Task/Effect contracts", () => {
    expect(TOOL_CALL_BATCH_SCHEMA_VERSION).toBe("v1alpha1");
  });
});

for (const variant of variants) {
  describe(`${variant.name} ADR17-I1 conformance`, () => {
    it("atomically appends Assistant Message, batch, and ordered initial dispositions", async () => {
      await withHarness(variant, undefined, async (persistence) => {
        await persistence.createSession(batchSessionHead());
        const input = assistantBatchInput();
        expect(await persistence.appendAssistantToolCallBatch(input)).toMatchObject({
          ok: true,
          replayed: false,
        });
        expect(await persistence.loadMessageById(input.message.envelope.messageId))
          .toEqual(input.message);
        expect(await persistence.loadToolCallBatch(input.batch.batchId)).toEqual(input.batch);
        expect(await persistence.listToolCallDispositions(input.batch.batchId))
          .toEqual(input.dispositions);
        expect((await persistence.loadSession(batchIds.session))?.messageSequence).toBe(1);
        expect(await persistence.listRecoverableToolCallBatches()).toEqual([input.batch]);
      });
    });

    it("replays the same canonical batch and rejects identity reuse with drift", async () => {
      await withHarness(variant, undefined, async (persistence) => {
        await persistence.createSession(batchSessionHead());
        const input = assistantBatchInput();
        await persistence.appendAssistantToolCallBatch(input);
        expect(await persistence.appendAssistantToolCallBatch(input)).toMatchObject({
          ok: true,
          replayed: true,
        });
        const drifted = structuredClone(input);
        drifted.batch.runId = "019f9000-0000-7000-8000-000000000099";
        expect(await persistence.appendAssistantToolCallBatch(drifted)).toMatchObject({
          ok: false,
          error: { code: "persistence.tool_call_batch_integrity_violation" },
        });
      });
    });

    it("keeps Transaction A replay idempotent after a disposition has advanced", async () => {
      await withHarness(variant, undefined, async (persistence) => {
        await persistence.createSession(batchSessionHead());
        const input = assistantBatchInput();
        await persistence.appendAssistantToolCallBatch(input);
        await persistence.transitionToolCallDisposition({
          batchId: batchIds.batch,
          toolCallId: batchIds.firstToolCall,
          expectedRevision: 0,
          next: effectLinkedDisposition(),
        });
        const replay = await persistence.appendAssistantToolCallBatch(input);
        expect(replay).toMatchObject({ ok: true, replayed: true });
        if (replay.ok) {
          expect(replay.value.dispositions[0]).toEqual(effectLinkedDisposition());
        }
      });
    });

    it("serializes concurrent identical Transaction A attempts into one durable batch", async () => {
      await withHarness(variant, undefined, async (persistence) => {
        await persistence.createSession(batchSessionHead());
        const [first, second] = await Promise.all([
          persistence.appendAssistantToolCallBatch(assistantBatchInput()),
          persistence.appendAssistantToolCallBatch(assistantBatchInput()),
        ]);
        expect([first, second].filter((result) => result.ok && !result.replayed)).toHaveLength(1);
        expect([first, second].filter((result) => result.ok && result.replayed)).toHaveLength(1);
        expect(await persistence.listToolCallDispositions(batchIds.batch)).toHaveLength(2);
        expect((await persistence.loadSession(batchIds.session))?.messageSequence).toBe(1);
      });
    });

    it("binds the batch digest to ordered Tool Call identities", async () => {
      await withHarness(variant, undefined, async (persistence) => {
        await persistence.createSession(batchSessionHead());
        const input = assistantBatchInput();
        const reversed = structuredClone(input);
        reversed.message.message.toolCalls.reverse();
        expect(await persistence.appendAssistantToolCallBatch(reversed)).toMatchObject({
          ok: false,
          error: { code: "persistence.message_digest_mismatch" },
        });
        expect(await persistence.loadToolCallBatch(batchIds.batch)).toBeUndefined();
      });
    });

    it("uses revision CAS and typed transition rules", async () => {
      await withHarness(variant, undefined, async (persistence) => {
        await persistence.createSession(batchSessionHead());
        await persistence.appendAssistantToolCallBatch(assistantBatchInput());
        const linked = effectLinkedDisposition();
        expect(await persistence.transitionToolCallDisposition({
          batchId: batchIds.batch,
          toolCallId: batchIds.firstToolCall,
          expectedRevision: 0,
          next: linked,
        })).toMatchObject({ ok: true, replayed: false });
        expect(await persistence.transitionToolCallDisposition({
          batchId: batchIds.batch,
          toolCallId: batchIds.firstToolCall,
          expectedRevision: 0,
          next: linked,
        })).toMatchObject({ ok: true, replayed: true });
        expect(await persistence.transitionToolCallDisposition({
          batchId: batchIds.batch,
          toolCallId: batchIds.firstToolCall,
          expectedRevision: 0,
          next: { ...linked, updatedAt: batchAt.completed },
        })).toMatchObject({
          ok: false,
          error: { code: "persistence.tool_call_disposition_revision_conflict" },
        });
      });
    });

    it("commits Tool Result Message and result disposition in one transaction", async () => {
      await withHarness(variant, undefined, async (persistence) => {
        await persistence.createSession(batchSessionHead());
        await persistence.appendAssistantToolCallBatch(assistantBatchInput());
        await persistence.transitionToolCallDisposition({
          batchId: batchIds.batch,
          toolCallId: batchIds.firstToolCall,
          expectedRevision: 0,
          next: effectLinkedDisposition(),
        });
        const completion = toolResultCompletion();
        expect(await persistence.appendToolResultAndCompleteDisposition(completion)).toMatchObject({
          ok: true,
          replayed: false,
        });
        expect(await persistence.appendToolResultAndCompleteDisposition(completion)).toMatchObject({
          ok: true,
          replayed: true,
        });
        expect(await persistence.loadMessageById(batchIds.resultMessage)).toEqual(completion.message);
        expect(await persistence.loadToolCallDisposition(
          batchIds.batch,
          batchIds.firstToolCall,
        )).toEqual(completion.completedDisposition);
        expect((await persistence.loadSession(batchIds.session))?.messageSequence).toBe(2);
      });
    });

    it("rejects a Tool Result completion that changes the linked Effect identity", async () => {
      await withHarness(variant, undefined, async (persistence) => {
        await persistence.createSession(batchSessionHead());
        await persistence.appendAssistantToolCallBatch(assistantBatchInput());
        await persistence.transitionToolCallDisposition({
          batchId: batchIds.batch,
          toolCallId: batchIds.firstToolCall,
          expectedRevision: 0,
          next: effectLinkedDisposition(),
        });
        const drifted = toolResultCompletion();
        drifted.completedDisposition.effectAttemptId =
          "019f9000-0000-7000-8000-000000000099";
        expect(await persistence.appendToolResultAndCompleteDisposition(drifted)).toMatchObject({
          ok: false,
          error: { code: "persistence.tool_call_disposition_transition_invalid" },
        });
        expect(await persistence.loadMessageById(batchIds.resultMessage)).toBeUndefined();
        expect(await persistence.loadToolCallDisposition(
          batchIds.batch,
          batchIds.firstToolCall,
        )).toEqual(effectLinkedDisposition());
      });
    });

    for (const faultPoint of [
      "append_assistant_batch.after_message",
      "append_assistant_batch.after_batch",
    ] as const) {
      it(`rolls back Transaction A at ${faultPoint}`, async () => {
        await withHarness(variant, faultPoint, async (persistence) => {
          await persistence.createSession(batchSessionHead());
          await settleFailure(persistence.appendAssistantToolCallBatch(assistantBatchInput()));
          expect(await persistence.loadMessageById(batchIds.assistantMessage)).toBeUndefined();
          expect(await persistence.loadToolCallBatch(batchIds.batch)).toBeUndefined();
          expect(await persistence.listToolCallDispositions(batchIds.batch)).toEqual([]);
          expect((await persistence.loadSession(batchIds.session))?.messageSequence).toBe(0);
        });
      });
    }

    it("rolls back Transaction C after the Tool Result insert fault", async () => {
      await withHarness(
        variant,
        "append_tool_result.after_message",
        async (persistence) => {
          await persistence.createSession(batchSessionHead());
          await persistence.appendAssistantToolCallBatch(assistantBatchInput());
          await persistence.transitionToolCallDisposition({
            batchId: batchIds.batch,
            toolCallId: batchIds.firstToolCall,
            expectedRevision: 0,
            next: effectLinkedDisposition(),
          });
          await settleFailure(
            persistence.appendToolResultAndCompleteDisposition(toolResultCompletion()),
          );
          expect(await persistence.loadMessageById(batchIds.resultMessage)).toBeUndefined();
          expect(await persistence.loadToolCallDisposition(
            batchIds.batch,
            batchIds.firstToolCall,
          )).toEqual(effectLinkedDisposition());
          expect((await persistence.loadSession(batchIds.session))?.messageSequence).toBe(1);
        },
      );
    });
  });
}

async function withHarness(
  variant: (typeof variants)[number],
  faultPoint: ConversationPersistenceFaultPoint | undefined,
  operation: (persistence: ConversationPersistence) => Promise<void>,
): Promise<void> {
  const harness = await variant.create(faultPoint);
  try {
    await operation(harness.persistence);
  } finally {
    await harness.cleanup();
  }
}

async function settleFailure(operation: Promise<unknown>): Promise<void> {
  try {
    const result = await operation;
    expect(result).toMatchObject({ ok: false });
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
  }
}
