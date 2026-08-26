import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  InMemoryConversationPersistence,
  SqliteConversationPersistence,
} from "../src/index.js";
import type { ConversationPersistence } from "../src/index.js";
import {
  commitCompactionInput,
  conversationAt,
  conversationIds,
  conversationMessage,
  initialSessionHead,
  requestCompactionInput,
} from "./conversation-persistence.fixtures.js";

const ids = {
  client: "019f8a00-0000-7000-8000-000000000001",
  modelRequest: "019f8a00-0000-7000-8000-000000000002",
  confirmation: "019f8a00-0000-7000-8000-000000000003",
  invocation: "019f8a00-0000-7000-8000-000000000004",
};
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;

for (const variant of ["memory", "sqlite"] as const) {
  describe(`ARH-2.2 Compaction Model invocation link (${variant})`, () => {
    it("is idempotent, conflict-safe, and commits with the Compaction record", async () => {
      const fixture = await create(variant);
      try {
        await seed(fixture.persistence);
        const prepared = await fixture.persistence.prepare({
          compactionJobId: conversationIds.job,
          clientRequestId: ids.client,
          modelRequestId: ids.modelRequest,
          modelRequestDigest: digest("1"),
          executionBindingDigest: requestCompactionInput().executionBinding.bindingDigest,
          confirmationId: ids.confirmation,
          scopeDigest: digest("2"),
          dataScopeDigest: digest("3"),
          createdAt: conversationAt.requested,
        });
        expect(prepared.ok && prepared.replayed).toBe(false);
        const replay = await fixture.persistence.prepare({
          compactionJobId: conversationIds.job,
          clientRequestId: ids.client,
          modelRequestId: ids.modelRequest,
          modelRequestDigest: digest("1"),
          executionBindingDigest: requestCompactionInput().executionBinding.bindingDigest,
          confirmationId: ids.confirmation,
          scopeDigest: digest("2"),
          dataScopeDigest: digest("3"),
          createdAt: conversationAt.requested,
        });
        expect(replay.ok && replay.replayed).toBe(true);
        const conflict = await fixture.persistence.prepare({
          compactionJobId: conversationIds.job,
          clientRequestId: ids.client,
          modelRequestId: ids.modelRequest,
          modelRequestDigest: digest("4"),
          executionBindingDigest: requestCompactionInput().executionBinding.bindingDigest,
          confirmationId: ids.confirmation,
          scopeDigest: digest("2"),
          dataScopeDigest: digest("3"),
          createdAt: conversationAt.requested,
        });
        expect(conflict).toMatchObject({ ok: false, error: { code: "compaction_model_invocation_link.conflict" } });
        if (!prepared.ok) throw new Error("fixture prepare failed");
        const accepted = await fixture.persistence.recordAccepted({
          compactionJobId: conversationIds.job,
          expectedRecordDigest: prepared.value.recordDigest,
          invocationId: ids.invocation,
          statusRevision: 0,
          acceptedAt: conversationAt.requested,
        });
        if (!accepted.ok) throw new Error("fixture accept failed");
        const progressed = await fixture.persistence.recordStreamProgress({
          compactionJobId: conversationIds.job,
          expectedRecordDigest: accepted.value.recordDigest,
          statusRevision: 1,
          outputStartedAt: conversationAt.committed,
          updatedAt: conversationAt.committed,
        });
        if (!progressed.ok) throw new Error("fixture progress failed");
        const committed = await fixture.persistence.commitCompaction({
          ...commitCompactionInput(),
          summaryInvocationCommit: {
            compactionJobId: conversationIds.job,
            clientRequestId: ids.client,
            expectedRecordDigest: progressed.value.recordDigest,
            summaryCommittedAt: conversationAt.committed,
          },
        });
        expect(committed.ok).toBe(true);
        expect((await fixture.persistence.loadByCompactionJobId(conversationIds.job))?.summaryCommittedAt)
          .toBe(conversationAt.committed);
      } finally {
        await fixture.cleanup();
      }
    });

    it("rolls back the whole second transaction on link identity drift", async () => {
      const fixture = await create(variant);
      try {
        await seed(fixture.persistence);
        const failed = await fixture.persistence.commitCompaction({
          ...commitCompactionInput(),
          summaryInvocationCommit: {
            compactionJobId: conversationIds.job,
            clientRequestId: ids.client,
            expectedRecordDigest: digest("9"),
            summaryCommittedAt: conversationAt.committed,
          },
        });
        expect(failed.ok).toBe(false);
        expect(await fixture.persistence.loadCompactionRecord(conversationIds.compaction)).toBeUndefined();
        expect((await fixture.persistence.loadSession(conversationIds.session))?.contextRevision).toBe(0);
      } finally {
        await fixture.cleanup();
      }
    });
  });
}

async function seed(persistence: ConversationPersistence): Promise<void> {
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
  const requested = await persistence.requestCompaction(requestCompactionInput());
  if (!requested.ok) throw new Error(requested.error.message);
}

async function create(variant: "memory" | "sqlite"): Promise<{
  persistence: ConversationPersistence;
  cleanup: () => Promise<void>;
}> {
  if (variant === "memory") {
    const persistence = new InMemoryConversationPersistence({
      clock: new FakeClock(conversationAt.created),
    });
    await persistence.start();
    return { persistence, cleanup: () => persistence.stop() };
  }
  const directory = await mkdtemp(join(tmpdir(), "robothree-arh22-link-"));
  const persistence = new SqliteConversationPersistence({
    databasePath: join(directory, "conversation.sqlite"),
    clock: new FakeClock(conversationAt.created),
  });
  await persistence.start();
  return {
    persistence,
    cleanup: async () => {
      await persistence.stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
