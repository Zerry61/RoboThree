import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FakeClock,
  InMemoryConversationPersistence,
  InMemoryProviderUsageProjectionPersistence,
  SqliteConversationPersistence,
  SqliteProviderUsageProjectionPersistence,
  sessionUsageProjection,
} from "../src/index.js";
import { initialSessionHead } from "./conversation-persistence.fixtures.js";

const id = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const now = "2026-08-13T08:00:00.000Z";
const digest = (value: string) => value.repeat(64);
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe.each(["memory", "sqlite"] as const)("Provider Usage Projection %s", (variant) => {
  it("is idempotent, rejects drift and aggregates invocation facts without a second source", async () => {
    const fixture = await open(variant);
    try {
      const first = projection(9801, "assistant_message", 5, 3);
      const second = projection(9802, "compaction_summary", 7, 2);
      await expect(fixture.persistence.record(first))
        .resolves.toMatchObject({ ok: true, replayed: false });
      await expect(fixture.persistence.record(first))
        .resolves.toMatchObject({ ok: true, replayed: true });
      await expect(fixture.persistence.record({ ...first, inputTokens: 6 }))
        .resolves.toMatchObject({ ok: false, error: { code: "usage_projection.conflict" } });
      await expect(fixture.persistence.record(second))
        .resolves.toMatchObject({ ok: true, replayed: false });

      const records = await fixture.persistence.listBySession(first.sessionId);
      expect(records).toHaveLength(2);
      expect(sessionUsageProjection(first.sessionId, records)).toMatchObject({
        invocationCount: 2,
        inputTokens: 12,
        outputTokens: 5,
      });
    } finally {
      await fixture.stop();
    }
  });

  it("rejects event reuse across links", async () => {
    const fixture = await open(variant);
    try {
      const first = projection(9811, "assistant_message", 1, 1);
      await fixture.persistence.record(first);
      await expect(fixture.persistence.record({
        ...projection(9812, "compaction_summary", 1, 1),
        usageEventId: first.usageEventId,
      })).resolves.toMatchObject({
        ok: false,
        error: { code: "usage_projection.conflict" },
      });
    } finally {
      await fixture.stop();
    }
  });

  if (variant === "sqlite") {
    it("survives close and reopen without duplicating a durable projection", async () => {
      const fixture = await open("sqlite");
      const first = projection(9821, "assistant_message", 9, 4);
      await fixture.persistence.record(first);
      await fixture.stop();
      const reopened = new SqliteProviderUsageProjectionPersistence({
        databasePath: fixture.databasePath!,
        clock: new FakeClock(now),
      });
      await reopened.start();
      try {
        await expect(reopened.record(first))
          .resolves.toMatchObject({ ok: true, replayed: true });
        expect(await reopened.listBySession(first.sessionId)).toHaveLength(1);
      } finally {
        await reopened.stop();
      }
    });
  }
});

async function open(variant: "memory" | "sqlite") {
  if (variant === "memory") {
    const conversation = new InMemoryConversationPersistence({ clock: new FakeClock(now) });
    const persistence = new InMemoryProviderUsageProjectionPersistence();
    await conversation.start();
    await conversation.createSession(initialSessionHead());
    await persistence.start();
    return {
      persistence,
      stop: async () => { await persistence.stop(); await conversation.stop(); },
      databasePath: undefined,
    };
  }
  const directory = await mkdtemp(join(tmpdir(), "robothree-arh31-usage-"));
  directories.push(directory);
  const databasePath = join(directory, "robothree.sqlite");
  const conversation = new SqliteConversationPersistence({
    databasePath,
    clock: new FakeClock(now),
  });
  await conversation.start();
  await conversation.createSession(initialSessionHead());
  await conversation.stop();
  const persistence = new SqliteProviderUsageProjectionPersistence({
    databasePath,
    clock: new FakeClock(now),
  });
  await persistence.start();
  return {
    persistence,
    databasePath,
    stop: () => persistence.stop(),
  };
}

function projection(
  value: number,
  invocationKind: "assistant_message" | "compaction_summary",
  inputTokens: number,
  outputTokens: number,
) {
  return {
    invocationKind,
    invocationLinkId: id(value),
    sessionId: initialSessionHead().sessionId,
    usageAuthority: "central_enterprise" as const,
    authorityInvocationId: id(value + 100),
    usageEventId: id(value + 200),
    usageEventDigest: digest(String(value % 10)),
    inputTokens,
    outputTokens,
    usageRecordedAt: now,
  };
}
