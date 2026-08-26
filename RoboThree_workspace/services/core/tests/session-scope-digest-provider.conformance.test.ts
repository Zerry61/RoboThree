import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import {
  FakeClock,
  FakeIdGenerator,
  InMemoryPromptCacheContextPersistence,
  PersistentSessionScopeDigestProvider,
  SqlitePromptCacheContextPersistence,
  type PromptCacheContextPersistence,
} from "../src/index.js";

const now = "2026-08-14T08:00:00.000Z";
const id = (value: number) =>
  `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe.each(["memory", "sqlite"] as const)("Session Scope Digest %s", (variant) => {
  it("creates one active namespace and derives a stable opaque digest", async () => {
    const fixture = await open(variant);
    try {
      const first = await fixture.provider.resolve(input(101, 201));
      const second = await fixture.provider.resolve(input(101, 202));
      expect(first.sessionScopeDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(second.sessionScopeDigest).toBe(first.sessionScopeDigest);
      expect(await fixture.persistence.listNamespaces("central_enterprise")).toHaveLength(1);
    } finally { await fixture.stop(); }
  });

  it("separates different Sessions under the same namespace", async () => {
    const fixture = await open(variant);
    try {
      const first = await fixture.provider.resolve(input(111, 211));
      const second = await fixture.provider.resolve(input(112, 212));
      expect(second.sessionScopeDigest).not.toBe(first.sessionScopeDigest);
      expect(second.scopeNamespaceRevision).toBe(first.scopeNamespaceRevision);
    } finally { await fixture.stop(); }
  });

  it("converges concurrent first use to one active namespace per authority", async () => {
    const fixture = await open(variant);
    try {
      const [first, second] = await Promise.all([
        fixture.provider.resolve(input(116, 216)),
        fixture.provider.resolve(input(117, 217)),
      ]);
      expect(first.scopeNamespaceRevision).toBe(second.scopeNamespaceRevision);
      expect(await fixture.persistence.listNamespaces("central_enterprise"))
        .toHaveLength(1);
    } finally { await fixture.stop(); }
  });

  it("uses the same Session proof semantics for assistant and compaction links", async () => {
    const fixture = await open(variant);
    try {
      const assistant = await fixture.provider.resolve(input(121, 221));
      const compaction = await fixture.provider.resolve({
        ...input(121, 222),
        invocationKind: "compaction_summary",
      });
      expect(compaction.sessionScopeDigest).toBe(assistant.sessionScopeDigest);
      expect(compaction.cacheContextDigest).toBe(assistant.cacheContextDigest);
    } finally { await fixture.stop(); }
  });

  it("replays the immutable context and rejects link scope drift", async () => {
    const fixture = await open(variant);
    try {
      const first = await fixture.provider.resolve(input(131, 231));
      await expect(fixture.provider.resolve(input(131, 231))).resolves.toEqual(first);
      await expect(fixture.provider.resolve(input(132, 231))).rejects.toMatchObject({
        code: "prompt_cache.context_conflict",
      });
    } finally { await fixture.stop(); }
  });

  it("allows old context recovery after retirement but blocks new context creation", async () => {
    const fixture = await open(variant);
    try {
      const context = await fixture.provider.resolve(input(141, 241));
      const namespace = await fixture.persistence.loadNamespace(context.scopeNamespaceRevision);
      const retired = await fixture.persistence.retireNamespace(
        context.scopeNamespaceRevision,
        namespace!.recordDigest,
      );
      expect(retired).toMatchObject({ ok: true, value: { status: "retired" } });
      await expect(fixture.provider.load("assistant_message", id(241)))
        .resolves.toEqual(context);
      await expect(fixture.provider.resolve(input(141, 242))).rejects.toMatchObject({
        code: "prompt_cache.namespace_unavailable",
      });
    } finally { await fixture.stop(); }
  });

  it("does not expose the namespace key through an invocation context", async () => {
    const fixture = await open(variant);
    try {
      const context = await fixture.provider.resolve(input(151, 251));
      expect(JSON.stringify(context)).not.toContain("A".repeat(43));
      expect(Object.keys(context)).not.toContain("namespaceKey");
    } finally { await fixture.stop(); }
  });
});

describe("SQLite Session Scope recovery", () => {
  it("survives close and reopen with the exact namespace revision and context", async () => {
    const fixture = await open("sqlite");
    const expected = await fixture.provider.resolve(input(161, 261));
    await fixture.stop();
    const reopened = await reopen(fixture.databasePath!);
    try {
      const actual = await reopened.provider.load("assistant_message", id(261));
      expect(actual).toEqual(expected);
    } finally { await reopened.stop(); }
  });

  it("replays a context committed before a lost response", async () => {
    let fail = true;
    const fixture = await open("sqlite", (point) => {
      if (fail && point === "after_context_commit_before_response") {
        fail = false;
        throw new Error("simulated response loss");
      }
    });
    await expect(fixture.provider.resolve(input(171, 271)))
      .rejects.toThrow("simulated response loss");
    await fixture.stop();
    const reopened = await reopen(fixture.databasePath!);
    try {
      await expect(reopened.provider.resolve(input(171, 271)))
        .resolves.toMatchObject({ invocationLinkId: id(271) });
    } finally { await reopened.stop(); }
  });

  it("replays the single active namespace committed before a lost response", async () => {
    let fail = true;
    const fixture = await open("sqlite", (point) => {
      if (fail && point === "after_namespace_commit_before_response") {
        fail = false;
        throw new Error("simulated namespace response loss");
      }
    });
    await expect(fixture.provider.resolve(input(176, 276)))
      .rejects.toThrow("simulated namespace response loss");
    await fixture.stop();
    const reopened = await reopen(fixture.databasePath!);
    try {
      await expect(reopened.provider.resolve(input(176, 276)))
        .resolves.toMatchObject({ invocationLinkId: id(276) });
      expect(await reopened.persistence.listNamespaces("central_enterprise"))
        .toHaveLength(1);
    } finally { await reopened.stop(); }
  });

  it("recovers an existing context through its retired namespace after close and reopen", async () => {
    const fixture = await open("sqlite");
    const expected = await fixture.provider.resolve(input(177, 277));
    const namespace = await fixture.persistence.loadNamespace(expected.scopeNamespaceRevision);
    await fixture.persistence.retireNamespace(
      expected.scopeNamespaceRevision,
      namespace!.recordDigest,
    );
    await fixture.stop();
    const reopened = await reopen(fixture.databasePath!);
    try {
      await expect(reopened.provider.load("assistant_message", id(277)))
        .resolves.toEqual(expected);
      await expect(reopened.provider.resolve(input(178, 278)))
        .rejects.toMatchObject({ code: "prompt_cache.namespace_unavailable" });
    } finally { await reopened.stop(); }
  });

  it("fails closed when the historical namespace record digest drifts", async () => {
    const fixture = await open("sqlite");
    const context = await fixture.provider.resolve(input(181, 281));
    await fixture.stop();
    const database = new DatabaseSync(fixture.databasePath!);
    database.prepare(`
      UPDATE prompt_cache_scope_namespaces SET record_json = ?
      WHERE namespace_revision = ?
    `).run(JSON.stringify({
      ...(await readNamespace(fixture.databasePath!, context.scopeNamespaceRevision)),
      namespaceKey: "B".repeat(43),
    }), context.scopeNamespaceRevision);
    database.close();
    const reopened = await reopen(fixture.databasePath!);
    try {
      await expect(reopened.provider.load("assistant_message", id(281)))
        .rejects.toThrow("record digest is invalid");
    } finally { await reopened.stop(); }
  });

  it("fails closed when a historical namespace is missing", async () => {
    const fixture = await open("sqlite");
    const context = await fixture.provider.resolve(input(186, 286));
    await fixture.stop();
    const database = new DatabaseSync(fixture.databasePath!);
    database.exec("PRAGMA foreign_keys = OFF");
    database.prepare(`
      DELETE FROM prompt_cache_scope_namespaces WHERE namespace_revision = ?
    `).run(context.scopeNamespaceRevision);
    database.close();
    await expect(reopen(fixture.databasePath!))
      .rejects.toThrow("SQLite foreign_key_check failed");
  });

  it("stores neither raw Session identity nor duplicate Session facts", async () => {
    const fixture = await open("sqlite");
    const sessionId = id(191);
    await fixture.provider.resolve(input(191, 291));
    await fixture.stop();
    const database = new DatabaseSync(fixture.databasePath!);
    const rows = database.prepare(`
      SELECT record_json FROM model_invocation_cache_contexts
      UNION ALL
      SELECT record_json FROM prompt_cache_scope_namespaces
    `).all() as Array<{ record_json: string }>;
    database.close();
    expect(rows.map((row) => row.record_json).join("\n")).not.toContain(sessionId);
  });
});

function input(session: number, link: number) {
  return {
    authority: "central_enterprise" as const,
    sessionId: id(session),
    invocationKind: "assistant_message" as const,
    invocationLinkId: id(link),
    createdAt: now,
  };
}

async function open(
  variant: "memory" | "sqlite",
  faultInjector?: ConstructorParameters<typeof SqlitePromptCacheContextPersistence>[0]["faultInjector"],
) {
  const clock = new FakeClock(now);
  let persistence: PromptCacheContextPersistence;
  let databasePath: string | undefined;
  if (variant === "memory") {
    persistence = new InMemoryPromptCacheContextPersistence();
  } else {
    const directory = await mkdtemp(join(tmpdir(), "robothree-arh321-cache-context-"));
    directories.push(directory);
    databasePath = join(directory, "core.sqlite");
    persistence = new SqlitePromptCacheContextPersistence({
      databasePath,
      clock,
      ...(faultInjector === undefined ? {} : { faultInjector }),
    });
  }
  await persistence.start();
  const provider = new PersistentSessionScopeDigestProvider({
    persistence,
    ids: new FakeIdGenerator([id(900), id(902), id(903), id(904)]),
    namespaceKeyFactory: () => "A".repeat(43),
  });
  return {
    persistence,
    provider,
    databasePath,
    stop: () => persistence.stop(),
  };
}

async function reopen(databasePath: string) {
  const persistence = new SqlitePromptCacheContextPersistence({
    databasePath,
    clock: new FakeClock(now),
  });
  await persistence.start();
  return {
    persistence,
    provider: new PersistentSessionScopeDigestProvider({
      persistence,
      ids: new FakeIdGenerator([id(901)]),
      namespaceKeyFactory: () => "C".repeat(43),
    }),
    stop: () => persistence.stop(),
  };
}

async function readNamespace(databasePath: string, revision: string): Promise<Record<string, unknown>> {
  const database = new DatabaseSync(databasePath);
  const row = database.prepare(`
    SELECT record_json FROM prompt_cache_scope_namespaces WHERE namespace_revision = ?
  `).get(revision) as { record_json: string };
  database.close();
  return JSON.parse(row.record_json) as Record<string, unknown>;
}
