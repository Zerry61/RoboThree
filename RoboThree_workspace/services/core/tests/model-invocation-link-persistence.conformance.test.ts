import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TaskInitialization } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  DurableTaskRuntime,
  FakeClock,
  FakeIdGenerator,
  InMemoryModelInvocationLinkPersistence,
  SqliteModelInvocationLinkPersistence,
  SqliteTaskPersistence,
} from "../src/index.js";
import type {
  ModelInvocationLinkPersistence,
  PrepareModelInvocationLinkInput,
} from "../src/index.js";

const entityId = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const digest = (value: string) => `sha256:${value.repeat(64)}`;
const at = "2026-08-03T03:00:00.000Z";
const taskId = entityId(9201);

const variants: readonly {
  name: string;
  create(): Promise<{
    persistence: ModelInvocationLinkPersistence;
    reopen?(): Promise<ModelInvocationLinkPersistence>;
    cleanup(): Promise<void>;
  }>;
}[] = [
  {
    name: "InMemory",
    async create() {
      const persistence = new InMemoryModelInvocationLinkPersistence();
      await persistence.start();
      return { persistence, cleanup: () => persistence.stop() };
    },
  },
  {
    name: "SQLite",
    async create() {
      const directory = await mkdtemp(join(tmpdir(), "robothree-cgf2c1-link-"));
      const databasePath = join(directory, "robothree.sqlite");
      await createTask(databasePath);
      let current = new SqliteModelInvocationLinkPersistence({
        databasePath,
        clock: new FakeClock(at),
      });
      await current.start();
      return {
        persistence: current,
        async reopen() {
          await current.stop();
          current = new SqliteModelInvocationLinkPersistence({
            databasePath,
            clock: new FakeClock(at),
          });
          await current.start();
          return current;
        },
        async cleanup() {
          await current.stop();
          await rm(directory, { recursive: true, force: true });
        },
      };
    },
  },
];

for (const variant of variants) {
  describe(`${variant.name} ModelInvocationLink`, () => {
    it("converges L1/L2/L3 by digest CAS and exposes only incomplete recovery facts", async () => {
      const storage = await variant.create();
      try {
        let persistence = storage.persistence;
        const prepared = await persistence.prepare(input());
        expect(prepared).toMatchObject({ ok: true, replayed: false });
        if (!prepared.ok) throw new Error(prepared.error.code);
        expect(await persistence.prepare(input())).toMatchObject({ ok: true, replayed: true });
        expect(await persistence.prepare({ ...input(), modelRequestDigest: digest("f") }))
          .toMatchObject({ ok: false, error: { code: "model_invocation_link.conflict" } });

        const accepted = await persistence.recordAccepted({
          clientRequestId: input().clientRequestId,
          expectedRecordDigest: prepared.value.recordDigest,
          invocationId: entityId(9230),
          statusRevision: 0,
          durableCursor: "cursor-0",
          acceptedAt: at,
        });
        expect(accepted).toMatchObject({ ok: true, value: { invocationId: entityId(9230) } });
        if (!accepted.ok) throw new Error(accepted.error.code);
        expect(await persistence.recordStreamProgress({
          clientRequestId: input().clientRequestId,
          expectedRecordDigest: prepared.value.recordDigest,
          statusRevision: 1,
          updatedAt: at,
        })).toMatchObject({ ok: false, error: { code: "model_invocation_link.stale_revision" } });

        const streamed = await persistence.recordStreamProgress({
          clientRequestId: input().clientRequestId,
          expectedRecordDigest: accepted.value.recordDigest,
          statusRevision: 1,
          durableCursor: "opaque:not-parsed",
          outputStartedAt: at,
          updatedAt: at,
        });
        expect(streamed).toMatchObject({ ok: true, value: { outputStartedAt: at } });
        if (!streamed.ok) throw new Error(streamed.error.code);
        expect(await persistence.prepare(input())).toMatchObject({
          ok: true,
          replayed: true,
          value: { outputStartedAt: at },
        });
        expect(await persistence.listIncomplete(10)).toHaveLength(1);

        const committed = await persistence.recordMessageCommitted({
          clientRequestId: input().clientRequestId,
          expectedRecordDigest: streamed.value.recordDigest,
          messageCommittedAt: at,
        });
        expect(committed).toMatchObject({ ok: true, value: { messageCommittedAt: at } });
        expect(await persistence.listIncomplete(10)).toHaveLength(0);

        if (storage.reopen !== undefined) {
          persistence = await storage.reopen();
          expect(await persistence.loadByClientRequestId(input().clientRequestId))
            .toMatchObject({ invocationId: entityId(9230), messageCommittedAt: at });
        }
      } finally {
        await storage.cleanup();
      }
    });
  });
}

function input(): PrepareModelInvocationLinkInput {
  return {
    taskId,
    runId: entityId(9202),
    stepId: entityId(9203),
    actionId: entityId(9204),
    round: 1,
    runtimeSelectionDigest: digest("1"),
    assistantMessageId: entityId(9205),
    modelRequestId: entityId(9206),
    modelRequestDigest: digest("2"),
    confirmationId: entityId(9207),
    scopeDigest: digest("3"),
    dataScopeDigest: digest("4"),
    clientRequestId: entityId(9208),
    centralAcceptRequestDigest: digest("5"),
    createdAt: at,
  };
}

async function createTask(databasePath: string): Promise<void> {
  const clock = new FakeClock(at);
  const persistence = new SqliteTaskPersistence({ databasePath, clock });
  await persistence.start();
  const runtime = new DurableTaskRuntime({
    persistence,
    idGenerator: new FakeIdGenerator([entityId(9210)]),
  });
  const initialization: TaskInitialization = {
    taskId,
    agentDefinition: { agentDefinitionId: entityId(9211), version: "1.0.0" },
    goal: "CGF-2C.1 Model invocation link",
    createdAt: at,
  };
  const created = await runtime.createTask(initialization);
  if (!created.ok) throw new Error(created.error.code);
  await persistence.stop();
}
