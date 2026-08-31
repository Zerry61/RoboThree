import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CONTRACT_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  ModelRequestSchema,
  TaskCapabilityLockSchema,
  type CapabilitySource,
  type JsonObject,
  type TaskInitialization,
  type TaskRuntimeSelection,
} from "@robothree/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  AgentLoopCoordinator,
  CodeOwnedApplicationLocaleSource,
  DynamicRequestFactsMaterializer,
  DurableAgentConversationWriter,
  DurableTaskRuntime,
  DurableEnterpriseModelProvider,
  FakeAgentToolCallExecutor,
  FakeClock,
  FakeIdGenerator,
  InMemoryConversationPersistence,
  InMemoryModelInvocationLinkPersistence,
  InMemoryProviderUsageProjectionPersistence,
  InMemoryPromptCacheContextPersistence,
  ModelStreamResumeUnavailableError,
  PersistentSessionScopeDigestProvider,
  SqliteConversationPersistence,
  SqliteProviderUsageProjectionPersistence,
  SqliteModelInvocationLinkPersistence,
  SqlitePromptCacheContextPersistence,
  SqliteTaskPersistence,
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
  createModelRequestV1Alpha2,
  mainDynamicRequestFactsSubject,
  sha256CanonicalJson,
} from "../src/index.js";
import type {
  EnterpriseModelAccepted,
  EnterpriseModelEvent,
  EnterpriseModelGatewayClient,
  EnterpriseModelGatewayOperation,
  EnterpriseModelStatus,
  CompactionModelInvocationLinkPersistence,
  ModelInvocationLinkPersistence,
  ModelProviderInvocation,
  ProviderUsageProjectionPersistence,
  SessionScopeDigestProvider,
} from "../src/index.js";
import {
  conversationAt,
  conversationIds,
  conversationMessage,
  initialSessionHead,
  requestCompactionInput,
} from "./conversation-persistence.fixtures.js";

const id = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const digest = (value: string) => `sha256:${value.repeat(64)}` as const;
const now = "2026-08-03T06:00:00.000Z";
const source: CapabilitySource = {
  trust: "official",
  packageId: "robothree.official.cgf2c1-provider-tests",
  packageRevision: digest("a"),
};
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("DurableEnterpriseModelProvider", () => {
  it("rejects reasoning requests before durable link or Gateway dispatch", async () => {
    const fixture = modelFixture();
    const gateway = new VersionCapturingGateway();
    const links = new InMemoryModelInvocationLinkPersistence();
    await links.start();
    const provider = createProvider(fixture, gateway, links);
    const { schemaVersion: _schemaVersion, requestDigest: _requestDigest, ...material }
      = fixture.request;
    const request = createModelRequestV1Alpha2({
      ...material,
      schemaVersion: "v1alpha2",
      reasoning: {
        mode: "default_passthrough",
        reasoningModeLockId: id(9398),
        reasoningModeLockDigest: digest("9"),
      },
    });

    await expect(provider.stream(
      request,
      new AbortController().signal,
      { ...fixture.invocation, modelRequest: request },
    )[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: "reasoning_protocol_unavailable",
    });
    expect(gateway.contractVersion).toBeUndefined();
    expect(await links.listIncomplete(10)).toEqual([]);
  });

  it("prepares an opaque v1alpha2 Session context before Gateway accept", async () => {
    const fixture = modelFixture();
    const gateway = new VersionCapturingGateway();
    const links = new InMemoryModelInvocationLinkPersistence();
    const contexts = new InMemoryPromptCacheContextPersistence();
    await links.start();
    await contexts.start();
    const sessionScopes = new PersistentSessionScopeDigestProvider({
      persistence: contexts,
      ids: new FakeIdGenerator([id(9390)]),
      namespaceKeyFactory: () => "A".repeat(43),
    });
    const provider = createProvider(fixture, gateway, links, undefined, undefined, sessionScopes);

    await collect(provider, fixture);

    expect(gateway.contractVersion).toBe("v1alpha2");
    expect(gateway.acceptDocument).toMatchObject({
      contractVersion: "v1alpha2",
      cacheContext: { sessionScopeDigest: expect.stringMatching(/^[a-f0-9]{64}$/u) },
      cacheContextDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(JSON.stringify(gateway.acceptDocument)).not.toContain(fixture.invocation.sessionId);
    expect(await contexts.loadContext("assistant_message", String(gateway.acceptDocument.clientRequestId)))
      .toMatchObject({ gatewayContractVersion: "v1alpha2" });
  });

  it("recovers C1 after the durable link but before cache-context creation", async () => {
    const fixture = modelFixture();
    const gateway = new VersionCapturingGateway();
    const links = new InMemoryModelInvocationLinkPersistence();
    const contexts = new InMemoryPromptCacheContextPersistence();
    await links.start();
    await contexts.start();
    const durableScopes = new PersistentSessionScopeDigestProvider({
      persistence: contexts,
      ids: new FakeIdGenerator([id(9380)]),
      namespaceKeyFactory: () => "A".repeat(43),
    });
    let fail = true;
    const sessionScopes: SessionScopeDigestProvider = {
      load: (...input) => durableScopes.load(...input),
      resolve: async (input) => {
        if (fail) {
          fail = false;
          throw new Error("C1 crash after link");
        }
        return durableScopes.resolve(input);
      },
    };
    const provider = createProvider(fixture, gateway, links, undefined, undefined, sessionScopes);

    await expect(collect(provider, fixture)).rejects.toThrow("C1 crash after link");
    expect(await links.loadRound(fixture.invocation.taskId, fixture.invocation.runId, 1))
      .not.toHaveProperty("invocationId");
    await expect(collect(provider, fixture)).resolves.toHaveLength(3);
    expect(gateway.contractVersion).toBe("v1alpha2");
  });

  it("recovers C2 by replaying the same cache context before Gateway accept", async () => {
    const fixture = modelFixture();
    const gateway = new VersionCapturingGateway(1);
    const links = new InMemoryModelInvocationLinkPersistence();
    const contexts = new InMemoryPromptCacheContextPersistence();
    await links.start();
    await contexts.start();
    const sessionScopes = new PersistentSessionScopeDigestProvider({
      persistence: contexts,
      ids: new FakeIdGenerator([id(9370)]),
      namespaceKeyFactory: () => "A".repeat(43),
    });
    const provider = createProvider(fixture, gateway, links, undefined, undefined, sessionScopes);

    await expect(collect(provider, fixture)).rejects.toThrow("C2 before Gateway accept");
    const first = await contexts.loadContext(
      "assistant_message",
      stableClientRequestId(fixture.invocation.taskId, fixture.invocation.runId, 1),
    );
    await expect(collect(provider, fixture)).resolves.toHaveLength(3);
    const second = await contexts.loadContext(
      "assistant_message",
      stableClientRequestId(fixture.invocation.taskId, fixture.invocation.runId, 1),
    );
    expect(second).toEqual(first);
  });

  it("recovers C1/C2 through SQLite close and reopen without changing Session scope", async () => {
    const fixture = modelFixture();
    const directory = await mkdtemp(join(tmpdir(), "robothree-arh321-c1-c2-"));
    directories.push(directory);
    const databasePath = join(directory, "core.sqlite");
    await createTask(databasePath, fixture.invocation.taskId);

    let links = new SqliteModelInvocationLinkPersistence({
      databasePath,
      clock: new FakeClock(now),
    });
    let contexts = new SqlitePromptCacheContextPersistence({
      databasePath,
      clock: new FakeClock(now),
    });
    await links.start();
    await contexts.start();
    let failC1 = true;
    const durableScopes = new PersistentSessionScopeDigestProvider({
      persistence: contexts,
      ids: new FakeIdGenerator([id(9350)]),
      namespaceKeyFactory: () => "A".repeat(43),
    });
    const c1Scopes: SessionScopeDigestProvider = {
      load: (...input) => durableScopes.load(...input),
      resolve: async (input) => {
        if (failC1) {
          failC1 = false;
          throw new Error("C1 process boundary");
        }
        return durableScopes.resolve(input);
      },
    };
    await expect(collect(
      createProvider(fixture, new VersionCapturingGateway(), links, undefined, undefined, c1Scopes),
      fixture,
    )).rejects.toThrow("C1 process boundary");
    await links.stop();
    await contexts.stop();

    links = new SqliteModelInvocationLinkPersistence({
      databasePath,
      clock: new FakeClock(now),
    });
    contexts = new SqlitePromptCacheContextPersistence({
      databasePath,
      clock: new FakeClock(now),
    });
    await links.start();
    await contexts.start();
    const c2Gateway = new VersionCapturingGateway(1);
    const reopenedScopes = new PersistentSessionScopeDigestProvider({
      persistence: contexts,
      ids: new FakeIdGenerator([id(9351)]),
      namespaceKeyFactory: () => "B".repeat(43),
    });
    const provider = createProvider(
      fixture,
      c2Gateway,
      links,
      undefined,
      undefined,
      reopenedScopes,
    );
    await expect(collect(provider, fixture)).rejects.toThrow("C2 before Gateway accept");
    const beforeRestart = await contexts.loadContext(
      "assistant_message",
      stableClientRequestId(fixture.invocation.taskId, fixture.invocation.runId, 1),
    );
    await links.stop();
    await contexts.stop();

    links = new SqliteModelInvocationLinkPersistence({
      databasePath,
      clock: new FakeClock(now),
    });
    contexts = new SqlitePromptCacheContextPersistence({
      databasePath,
      clock: new FakeClock(now),
    });
    await links.start();
    await contexts.start();
    const finalGateway = new VersionCapturingGateway();
    const finalProvider = createProvider(
      fixture,
      finalGateway,
      links,
      undefined,
      undefined,
      new PersistentSessionScopeDigestProvider({
        persistence: contexts,
        ids: new FakeIdGenerator([id(9352)]),
        namespaceKeyFactory: () => "C".repeat(43),
      }),
    );
    await expect(collect(finalProvider, fixture)).resolves.toHaveLength(3);
    expect(await contexts.loadContext(
      "assistant_message",
      stableClientRequestId(fixture.invocation.taskId, fixture.invocation.runId, 1),
    )).toEqual(beforeRestart);
    await links.stop();
    await contexts.stop();
  });

  it("coordinates L1/L2/L3 and maps the exact text/tool/usage terminal stream", async () => {
    const fixture = modelFixture();
    const gateway = new FakeGateway(fixture.toolArgumentsDigest);
    const links = new InMemoryModelInvocationLinkPersistence();
    await links.start();
    const provider = createProvider(fixture, gateway, links);

    const output = [];
    for await (const event of provider.stream(
      fixture.request,
      new AbortController().signal,
      fixture.invocation,
    )) output.push(event);

    expect(output.map((event) => event.type)).toEqual([
      "started",
      "text_delta",
      "tool_call",
      "usage",
      "completed",
    ]);
    expect(output[2]).toMatchObject({
      type: "tool_call",
      call: {
        toolCallId: id(9410),
        taskId: fixture.invocation.taskId,
        capabilityId: "tool.echo",
        arguments: { value: "hello" },
      },
    });
    expect(output.at(-1)).toEqual({ type: "completed", finishReason: "tool_calls" });
    const beforeCommit = await links.loadRound(
      fixture.invocation.taskId,
      fixture.invocation.runId,
      1,
    );
    expect(beforeCommit).toMatchObject({
      invocationId: id(9409),
      outputStartedAt: now,
    });
    expect(beforeCommit?.messageCommittedAt).toBeUndefined();
    await provider.messageCommitted(fixture.invocation, now);
    expect(await links.listIncomplete(10)).toHaveLength(0);
    expect(gateway.acceptCount).toBe(1);
  });

  it("projects the durable Usage event once and rebuilds the Session aggregate", async () => {
    const fixture = modelFixture();
    const gateway = new FakeGateway(fixture.toolArgumentsDigest);
    const links = new InMemoryModelInvocationLinkPersistence();
    const usageProjections = new InMemoryProviderUsageProjectionPersistence();
    await links.start();
    await usageProjections.start();
    const provider = createProvider(fixture, gateway, links, usageProjections);

    await collect(provider, fixture);
    const records = await usageProjections.listBySession(fixture.invocation.sessionId);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      invocationKind: "assistant_message",
      usageAuthority: "central_enterprise",
      inputTokens: 4,
      outputTokens: 5,
    });

    const replay = await usageProjections.record({
      invocationKind: records[0]!.invocationKind,
      invocationLinkId: records[0]!.invocationLinkId,
      sessionId: records[0]!.sessionId,
      usageAuthority: records[0]!.usageAuthority,
      authorityInvocationId: records[0]!.authorityInvocationId,
      usageEventId: records[0]!.usageEventId,
      usageEventDigest: records[0]!.usageEventDigest,
      inputTokens: records[0]!.inputTokens,
      outputTokens: records[0]!.outputTokens,
      usageRecordedAt: records[0]!.usageRecordedAt,
    });
    expect(replay).toMatchObject({ ok: true, replayed: true });
    expect(await usageProjections.listBySession(fixture.invocation.sessionId)).toHaveLength(1);
  });

  it("projects Compaction Usage under the same Session without inventing an Assistant Message", async () => {
    const fixture = modelFixture();
    const gateway = new OneRoundTextGateway();
    const links = new InMemoryModelInvocationLinkPersistence();
    const compactionLinks = new InMemoryConversationPersistence({ clock: new FakeClock(now) });
    const usageProjections = new InMemoryProviderUsageProjectionPersistence();
    const contexts = new InMemoryPromptCacheContextPersistence();
    await links.start();
    await compactionLinks.start();
    await usageProjections.start();
    await contexts.start();
    const { assistantMessageId: _assistantMessageId, ...base } = fixture.invocation;
    const invocation: Extract<ModelProviderInvocation, { purpose: "compaction_summary" }> = {
      ...base,
      purpose: "compaction_summary",
      compactionJobId: id(9470),
      executionBindingDigest: digest("7"),
    };
    const provider = createProvider(
      fixture,
      gateway,
      links,
      usageProjections,
      compactionLinks,
      new PersistentSessionScopeDigestProvider({
        persistence: contexts,
        ids: new FakeIdGenerator([id(9360)]),
        namespaceKeyFactory: () => "A".repeat(43),
      }),
    );

    const output = [];
    for await (const event of provider.stream(
      fixture.request,
      new AbortController().signal,
      invocation,
    )) output.push(event);

    expect(output.map((event) => event.type)).toEqual([
      "started",
      "text_delta",
      "usage",
      "completed",
    ]);
    expect(await usageProjections.listBySession(invocation.sessionId)).toMatchObject([{
      invocationKind: "compaction_summary",
      invocationLinkId: invocation.compactionJobId,
      sessionId: invocation.sessionId,
      inputTokens: 3,
      outputTokens: 2,
    }]);
    expect(await links.listIncomplete(10)).toEqual([]);
    expect(await contexts.loadContext("compaction_summary", invocation.compactionJobId))
      .toMatchObject({ gatewayContractVersion: "v1alpha2" });
    await compactionLinks.stop();
  });

  it.each(["before_projection", "after_projection_before_cursor"] as const)(
    "recovers Assistant Usage after SQLite restart at %s",
    async (failurePoint) => {
      const fixture = modelFixture();
      const gateway = new CursorAwareUsageGateway();
      const directory = await mkdtemp(join(tmpdir(), "robothree-arh332-assistant-usage-"));
      directories.push(directory);
      const databasePath = join(directory, "core.sqlite");
      await createTask(databasePath, fixture.invocation.taskId);
      await createConversationSession(databasePath, fixture.invocation.sessionId);
      const links = new SqliteModelInvocationLinkPersistence({
        databasePath,
        clock: new FakeClock(now),
      });
      const usage = new SqliteProviderUsageProjectionPersistence({
        databasePath,
        clock: new FakeClock(now),
      });
      await links.start();
      await usage.start();
      const firstProvider = createProvider(
        fixture,
        gateway,
        failurePoint === "after_projection_before_cursor"
          ? new FailOnceAssistantUsageCursorPersistence(links)
          : links,
        failurePoint === "before_projection"
          ? new FailOnceUsageProjectionPersistence(usage)
          : usage,
      );

      await expect(collect(firstProvider, fixture)).rejects.toThrow("fixture crash");
      expect((await links.loadRound(
        fixture.invocation.taskId,
        fixture.invocation.runId,
        fixture.invocation.round,
      ))?.durableCursor).toBe("opaque-cursor-1");
      expect(await usage.listBySession(fixture.invocation.sessionId)).toHaveLength(
        failurePoint === "before_projection" ? 0 : 1,
      );
      await usage.stop();
      await links.stop();

      const reopenedLinks = new SqliteModelInvocationLinkPersistence({
        databasePath,
        clock: new FakeClock(now),
      });
      const reopenedUsage = new SqliteProviderUsageProjectionPersistence({
        databasePath,
        clock: new FakeClock(now),
      });
      await reopenedLinks.start();
      await reopenedUsage.start();
      const recovered = await collect(
        createProvider(fixture, gateway, reopenedLinks, reopenedUsage),
        fixture,
      );

      expect(recovered.map((event) => event.type)).toEqual(["started", "usage", "completed"]);
      expect(await reopenedUsage.listBySession(fixture.invocation.sessionId)).toHaveLength(1);
      expect((await reopenedLinks.loadRound(
        fixture.invocation.taskId,
        fixture.invocation.runId,
        fixture.invocation.round,
      ))?.durableCursor).toBe("opaque-cursor-3");
      expect(gateway.acceptCount).toBe(1);
      await reopenedUsage.stop();
      await reopenedLinks.stop();
    },
  );

  it.each(["before_projection", "after_projection_before_cursor"] as const)(
    "reconciles terminal Assistant Usage after SQLite restart at %s",
    async (failurePoint) => {
      const fixture = modelFixture();
      const gateway = new CursorAwareUsageGateway({ terminalStatus: "completed" });
      const directory = await mkdtemp(join(tmpdir(), "robothree-arh332-repair2-assistant-"));
      directories.push(directory);
      const databasePath = join(directory, "core.sqlite");
      await createTask(databasePath, fixture.invocation.taskId);
      await createConversationSession(databasePath, fixture.invocation.sessionId);
      let links = new SqliteModelInvocationLinkPersistence({
        databasePath,
        clock: new FakeClock(now),
      });
      let usage = new SqliteProviderUsageProjectionPersistence({
        databasePath,
        clock: new FakeClock(now),
      });
      await links.start();
      await usage.start();

      await expect(collect(createProvider(
        fixture,
        gateway,
        failurePoint === "after_projection_before_cursor"
          ? new FailOnceAssistantUsageCursorPersistence(links)
          : links,
        failurePoint === "before_projection"
          ? new FailOnceUsageProjectionPersistence(usage)
          : usage,
      ), fixture)).rejects.toThrow("fixture crash");
      expect((await links.loadRound(
        fixture.invocation.taskId,
        fixture.invocation.runId,
        fixture.invocation.round,
      ))?.durableCursor).toBe("opaque-cursor-1");
      expect(await usage.listBySession(fixture.invocation.sessionId)).toHaveLength(
        failurePoint === "before_projection" ? 0 : 1,
      );
      await usage.stop();
      await links.stop();

      links = new SqliteModelInvocationLinkPersistence({ databasePath, clock: new FakeClock(now) });
      usage = new SqliteProviderUsageProjectionPersistence({ databasePath, clock: new FakeClock(now) });
      await links.start();
      await usage.start();
      await expect(collect(createProvider(fixture, gateway, links, usage), fixture)).rejects
        .toMatchObject({ code: "model_stream_resume_unavailable" });

      expect(await usage.listBySession(fixture.invocation.sessionId)).toHaveLength(1);
      expect((await links.loadRound(
        fixture.invocation.taskId,
        fixture.invocation.runId,
        fixture.invocation.round,
      ))?.durableCursor).toBe("opaque-cursor-3");
      expect(gateway.acceptCount).toBe(1);
      if (failurePoint === "after_projection_before_cursor") {
        await writeArh333StatusFirstEvidence("assistant");
      }
      await usage.stop();
      await links.stop();
    },
  );

  it.each(["before_projection", "after_projection_before_cursor"] as const)(
    "reconciles terminal Compaction Usage after SQLite restart at %s",
    async (failurePoint) => {
      const fixture = modelFixture();
      const gateway = new CursorAwareUsageGateway({ terminalStatus: "completed" });
      const directory = await mkdtemp(join(tmpdir(), "robothree-arh332-repair2-compaction-"));
      directories.push(directory);
      const databasePath = join(directory, "core.sqlite");
      await seedCompactionConversation(databasePath);
      const links = new InMemoryModelInvocationLinkPersistence();
      await links.start();
      let compactionLinks = new SqliteConversationPersistence({
        databasePath,
        clock: new FakeClock(now),
      });
      let usage = new SqliteProviderUsageProjectionPersistence({
        databasePath,
        clock: new FakeClock(now),
      });
      await compactionLinks.start();
      await usage.start();
      const invocation = sqliteCompactionInvocation(fixture);

      await expect(collectInvocation(createProvider(
        fixture,
        gateway,
        links,
        failurePoint === "before_projection"
          ? new FailOnceUsageProjectionPersistence(usage)
          : usage,
        failurePoint === "after_projection_before_cursor"
          ? new FailOnceCompactionUsageCursorPersistence(compactionLinks)
          : compactionLinks,
      ), fixture.request, invocation)).rejects.toThrow("fixture crash");
      expect((await compactionLinks.loadByCompactionJobId(invocation.compactionJobId))?.durableCursor)
        .toBe("opaque-cursor-1");
      expect(await usage.listBySession(invocation.sessionId)).toHaveLength(
        failurePoint === "before_projection" ? 0 : 1,
      );
      await usage.stop();
      await compactionLinks.stop();

      compactionLinks = new SqliteConversationPersistence({
        databasePath,
        clock: new FakeClock(now),
      });
      usage = new SqliteProviderUsageProjectionPersistence({
        databasePath,
        clock: new FakeClock(now),
      });
      await compactionLinks.start();
      await usage.start();
      await expect(collectInvocation(
        createProvider(fixture, gateway, links, usage, compactionLinks),
        fixture.request,
        invocation,
      )).rejects.toMatchObject({ code: "model_stream_resume_unavailable" });

      expect(await usage.listBySession(invocation.sessionId)).toHaveLength(1);
      expect((await compactionLinks.loadByCompactionJobId(invocation.compactionJobId))?.durableCursor)
        .toBe("opaque-cursor-3");
      expect(gateway.acceptCount).toBe(1);
      if (failurePoint === "after_projection_before_cursor") {
        await writeArh333StatusFirstEvidence("compaction");
      }
      await usage.stop();
      await compactionLinks.stop();
      await links.stop();
    },
  );

  it("does not invent Usage while reconciling a terminal invocation without Usage", async () => {
    const fixture = modelFixture();
    const gateway = new CursorAwareUsageGateway({
      terminalStatus: "completed",
      includeUsage: false,
    });
    const links = new InMemoryModelInvocationLinkPersistence();
    const usage = new InMemoryProviderUsageProjectionPersistence();
    await links.start();
    await usage.start();

    await expect(collect(createProvider(fixture, gateway, links, usage), fixture)).rejects
      .toMatchObject({ code: "model_stream_resume_unavailable" });
    expect(await usage.listBySession(fixture.invocation.sessionId)).toEqual([]);
    expect((await links.loadRound(
      fixture.invocation.taskId,
      fixture.invocation.runId,
      fixture.invocation.round,
    ))?.durableCursor).toBe("opaque-cursor-2");
  });

  it.each(["failed", "cancelled", "timed_out", "uncertain"] as const)(
    "reconciles Usage before returning typed %s terminal failure",
    async (terminalStatus) => {
      const fixture = modelFixture();
      const gateway = new CursorAwareUsageGateway({ terminalStatus });
      const links = new InMemoryModelInvocationLinkPersistence();
      const usage = new InMemoryProviderUsageProjectionPersistence();
      await links.start();
      await usage.start();

      const output = await collect(createProvider(fixture, gateway, links, usage), fixture);
      expect(output.map((event) => event.type)).toEqual(["started", "failed"]);
      expect(output[1]).toMatchObject({
        type: "failed",
        error: { code: `model_gateway.${terminalStatus}` },
      });
      expect(await usage.listBySession(fixture.invocation.sessionId)).toHaveLength(1);
      expect((await links.loadRound(
        fixture.invocation.taskId,
        fixture.invocation.runId,
        fixture.invocation.round,
      ))?.durableCursor).toBe("opaque-cursor-3");
    },
  );

  it("fails closed when terminal reconciliation receives another invocation identity", async () => {
    const fixture = modelFixture();
    const gateway = new CursorAwareUsageGateway({
      terminalStatus: "completed",
      eventInvocationId: id(9998),
    });
    const links = new InMemoryModelInvocationLinkPersistence();
    await links.start();

    await expect(collect(createProvider(fixture, gateway, links), fixture)).rejects
      .toThrow("Enterprise Model event belongs to another invocation");
  });

  it("fails closed when terminal reconciliation cannot reach the status cursor", async () => {
    const fixture = modelFixture();
    const gateway = new CursorAwareUsageGateway({
      terminalStatus: "completed",
      omitTerminalEvent: true,
    });
    const links = new InMemoryModelInvocationLinkPersistence();
    await links.start();

    await expect(collect(createProvider(fixture, gateway, links), fixture)).rejects
      .toThrow("durable reconciliation did not reach the terminal cursor");
  });

  it("rejects Usage digest drift while replaying a terminal invocation", async () => {
    const fixture = modelFixture();
    const gateway = new CursorAwareUsageGateway({ terminalStatus: "completed" });
    const links = new InMemoryModelInvocationLinkPersistence();
    const usage = new InMemoryProviderUsageProjectionPersistence();
    await links.start();
    await usage.start();

    await expect(collect(createProvider(
      fixture,
      gateway,
      new FailOnceAssistantUsageCursorPersistence(links),
      usage,
    ), fixture)).rejects.toThrow("fixture crash");
    gateway.setUsageEventDigest("f".repeat(64));
    await expect(collect(createProvider(fixture, gateway, links, usage), fixture)).rejects
      .toThrow("usage_projection.conflict");
    expect(await usage.listBySession(fixture.invocation.sessionId)).toHaveLength(1);
  });

  it.each(["before_projection", "after_projection_before_cursor"] as const)(
    "recovers Compaction Usage without duplication at %s",
    async (failurePoint) => {
      const fixture = modelFixture();
      const gateway = new CursorAwareUsageGateway();
      const links = new InMemoryModelInvocationLinkPersistence();
      const compactionLinks = new InMemoryConversationPersistence({ clock: new FakeClock(now) });
      const usage = new InMemoryProviderUsageProjectionPersistence();
      await links.start();
      await compactionLinks.start();
      await usage.start();
      const invocation = compactionInvocation(fixture);
      const firstProvider = createProvider(
        fixture,
        gateway,
        links,
        failurePoint === "before_projection"
          ? new FailOnceUsageProjectionPersistence(usage)
          : usage,
        failurePoint === "after_projection_before_cursor"
          ? new FailOnceCompactionUsageCursorPersistence(compactionLinks)
          : compactionLinks,
      );

      await expect(collectInvocation(firstProvider, fixture.request, invocation))
        .rejects.toThrow("fixture crash");
      expect((await compactionLinks.loadByCompactionJobId(invocation.compactionJobId))?.durableCursor)
        .toBe("opaque-cursor-1");
      expect(await usage.listBySession(invocation.sessionId)).toHaveLength(
        failurePoint === "before_projection" ? 0 : 1,
      );
      await usage.stop();
      await compactionLinks.stop();
      await links.stop();
      await links.start();
      await compactionLinks.start();
      await usage.start();

      const recovered = await collectInvocation(
        createProvider(fixture, gateway, links, usage, compactionLinks),
        fixture.request,
        invocation,
      );
      expect(recovered.map((event) => event.type)).toEqual(["started", "usage", "completed"]);
      expect(await usage.listBySession(invocation.sessionId)).toHaveLength(1);
      expect((await compactionLinks.loadByCompactionJobId(invocation.compactionJobId))?.durableCursor)
        .toBe("opaque-cursor-3");
      expect(gateway.acceptCount).toBe(1);
      await usage.stop();
      await compactionLinks.stop();
      await links.stop();
    },
  );

  it("does not create a second invocation after output continuity is lost", async () => {
    const fixture = modelFixture();
    const gateway = new FakeGateway(fixture.toolArgumentsDigest, true);
    const links = new InMemoryModelInvocationLinkPersistence();
    await links.start();
    const provider = createProvider(fixture, gateway, links);

    await expect(collect(provider, fixture)).rejects.toBeInstanceOf(
      ModelStreamResumeUnavailableError,
    );
    await expect(collect(provider, fixture)).rejects.toBeInstanceOf(
      ModelStreamResumeUnavailableError,
    );
    expect(gateway.acceptCount).toBe(1);
    expect(await links.listIncomplete(10)).toHaveLength(1);
  });

  it("keeps an accepted invocation recoverable when the stream ends before output starts", async () => {
    const fixture = modelFixture();
    const gateway = new NoOutputGateway();
    const links = new InMemoryModelInvocationLinkPersistence();
    await links.start();
    const provider = createProvider(fixture, gateway, links);

    const first = collect(provider, fixture);
    await expect(first).rejects.toMatchObject({
      code: "model_stream_resume_unavailable",
      outputStarted: false,
    });
    const second = collect(provider, fixture);
    await expect(second).rejects.toMatchObject({
      code: "model_stream_resume_unavailable",
      outputStarted: false,
    });
    expect(gateway.acceptCount).toBe(1);
    expect((await links.listIncomplete(10))[0]?.outputStartedAt).toBeUndefined();
  });

  it("runs the Headless provider chain through Agent Loop and durable Assistant Message", async () => {
    const fixture = modelFixture();
    const gateway = new OneRoundTextGateway();
    const links = new InMemoryModelInvocationLinkPersistence();
    const conversation = new InMemoryConversationPersistence({ clock: new FakeClock(now) });
    await links.start();
    await conversation.start();
    const session = initialSessionHead();
    await conversation.createSession(session);
    const provider = createProvider(fixture, gateway, links);
    const loop = new AgentLoopCoordinator({
      model: provider,
      tools: new FakeAgentToolCallExecutor(),
      conversation: new DurableAgentConversationWriter({
        persistence: conversation,
        clock: new FakeClock(now),
        idGenerator: new FakeIdGenerator([id(9499)]),
      }),
    });

    const result = await loop.run({
      sessionId: session.sessionId,
      taskId: fixture.invocation.taskId,
      runId: fixture.invocation.runId,
      buildRequest: () => fixture.request,
      buildInvocation: () => fixture.invocation,
      createAssistantMessageId: () => fixture.invocation.assistantMessageId,
      now: () => now,
    });

    expect(result).toMatchObject({ status: "completed", text: "headless-complete" });
    expect(gateway.acceptCount).toBe(1);
    expect(await conversation.loadMessageRange(session.sessionId, 1, 1)).toMatchObject([{
      envelope: {
        messageId: fixture.invocation.assistantMessageId,
        taskId: fixture.invocation.taskId,
      },
      message: {
        role: "assistant",
        content: [{ type: "text", text: "headless-complete" }],
      },
    }]);
    expect(await links.listIncomplete(10)).toHaveLength(0);
    await conversation.stop();
  });

  it("persists and reloads exact Dynamic Request Facts before a restarted invocation", async () => {
    const fixture = modelFixture();
    const gateway = new OneRoundTextGateway();
    const links = new InMemoryModelInvocationLinkPersistence();
    await links.start();
    const subject = mainDynamicRequestFactsSubject({
      taskId: fixture.invocation.taskId,
      runId: fixture.invocation.runId,
      round: fixture.invocation.round,
    });
    const facts = new DynamicRequestFactsMaterializer({
      clock: new FakeClock(now),
      locale: new CodeOwnedApplicationLocaleSource(),
      timezone: {
        requireCurrent: () => ({ timezone: "Asia/Shanghai", sourceRevision: digest("8") }),
      },
    }).materialize(subject);
    const invocation = {
      ...fixture.invocation,
      dynamicContext: {
        facts,
        contextAssemblyReceiptDigest: digest("9"),
      },
    };
    await collectInvocation(
      createProvider(fixture, gateway, links),
      fixture.request,
      invocation,
    );
    const restarted = createProvider(fixture, gateway, links);
    expect(await restarted.loadDynamicRequestFacts(subject)).toEqual(facts);
    expect(await links.loadRound(subject.taskId, subject.runId, subject.round))
      .toMatchObject({
        schemaVersion: "v2",
        providerRequestDeadlineAt: fixture.invocation.deadlineAt,
        dynamicRequestFacts: facts,
        contextAssemblyReceiptDigest: digest("9"),
      });
  });

  it("does not commit a completed Assistant Message when the enterprise stream is incomplete", async () => {
    const fixture = modelFixture();
    const gateway = new FakeGateway(fixture.toolArgumentsDigest, true);
    const links = new InMemoryModelInvocationLinkPersistence();
    const conversation = new InMemoryConversationPersistence({ clock: new FakeClock(now) });
    await links.start();
    await conversation.start();
    const session = initialSessionHead();
    await conversation.createSession(session);
    const loop = new AgentLoopCoordinator({
      model: createProvider(fixture, gateway, links),
      tools: new FakeAgentToolCallExecutor(),
      conversation: new DurableAgentConversationWriter({
        persistence: conversation,
        clock: new FakeClock(now),
        idGenerator: new FakeIdGenerator([id(9498)]),
      }),
    });

    const run = loop.run({
      sessionId: session.sessionId,
      taskId: fixture.invocation.taskId,
      runId: fixture.invocation.runId,
      buildRequest: () => fixture.request,
      buildInvocation: () => fixture.invocation,
      createAssistantMessageId: () => fixture.invocation.assistantMessageId,
      now: () => now,
    });

    await expect(run).rejects.toBeInstanceOf(ModelStreamResumeUnavailableError);
    expect(await conversation.loadMessageRange(session.sessionId, 1, 10)).toEqual([]);
    await conversation.stop();
  });
});

class FakeGateway implements EnterpriseModelGatewayClient {
  public acceptCount = 0;
  readonly #argumentsDigest: string;
  readonly #interruptAfterText: boolean;
  #requestDigest = "";
  #clientRequestId = "";

  constructor(argumentsDigest: string, interruptAfterText = false) {
    this.#argumentsDigest = argumentsDigest;
    this.#interruptAfterText = interruptAfterText;
  }

  begin(): EnterpriseModelGatewayOperation {
    const argumentsDigest = this.#argumentsDigest;
    const interruptAfterText = this.#interruptAfterText;
    const accept = async (document: JsonObject): Promise<EnterpriseModelAccepted> => {
      this.acceptCount += 1;
      this.#requestDigest = String(document.requestDigest);
      this.#clientRequestId = String(document.clientRequestId);
      return {
        invocationId: id(9409),
        clientRequestId: this.#clientRequestId,
        requestDigest: this.#requestDigest,
        statusRevision: 0,
        lastDurableEventSequence: 1,
        durableCursor: "opaque-cursor-1",
        createdAt: now,
      };
    };
    const status = async (): Promise<EnterpriseModelStatus> => ({
      invocationId: id(9409),
      clientRequestId: this.#clientRequestId,
      requestDigest: this.#requestDigest,
      status: "running",
      statusRevision: 1,
      lastDurableEventSequence: 2,
      durableCursor: "opaque-cursor-2",
    });
    return {
      scope: {
        enterpriseId: "enterprise-one",
        userId: "user-one",
        deviceId: "device-one",
        clientInstanceId: "client-one",
      },
      accept,
      status,
      cancel: status,
      async *events(): AsyncIterable<EnterpriseModelEvent> {
        yield ephemeral(1, "started");
        yield ephemeral(2, "text_delta", { delta: "hello" });
        if (interruptAfterText) return;
        yield ephemeral(3, "tool_call", { call: {
          toolCallId: id(9410),
          name: "tool.echo",
          arguments: { value: "hello" },
          argumentsDigest,
        } });
        yield durable(2, "usage_recorded", { inputTokens: 4, outputTokens: 5 });
        yield durable(3, "completed", { status: "completed", statusRevision: 2 });
      },
    };
  }
}

class OneRoundTextGateway implements EnterpriseModelGatewayClient {
  public acceptCount = 0;
  #requestDigest = "";
  #clientRequestId = "";

  begin(): EnterpriseModelGatewayOperation {
    return {
      scope: {
        enterpriseId: "enterprise-one",
        userId: "user-one",
        deviceId: "device-one",
        clientInstanceId: "client-one",
      },
      accept: async (document: JsonObject): Promise<EnterpriseModelAccepted> => {
        this.acceptCount += 1;
        this.#requestDigest = String(document.requestDigest);
        this.#clientRequestId = String(document.clientRequestId);
        return {
          invocationId: id(9409),
          clientRequestId: this.#clientRequestId,
          requestDigest: this.#requestDigest,
          statusRevision: 0,
          lastDurableEventSequence: 1,
          durableCursor: "opaque-cursor-1",
          createdAt: now,
        };
      },
      status: async (): Promise<EnterpriseModelStatus> => ({
        invocationId: id(9409),
        clientRequestId: this.#clientRequestId,
        requestDigest: this.#requestDigest,
        status: "running",
        statusRevision: 1,
        lastDurableEventSequence: 2,
        durableCursor: "opaque-cursor-2",
      }),
      cancel: async (): Promise<EnterpriseModelStatus> => ({
        invocationId: id(9409),
        clientRequestId: this.#clientRequestId,
        requestDigest: this.#requestDigest,
        status: "cancelled",
        statusRevision: 2,
        lastDurableEventSequence: 3,
        durableCursor: "opaque-cursor-3",
      }),
      events: async function* (): AsyncIterable<EnterpriseModelEvent> {
        yield ephemeral(1, "started");
        yield ephemeral(2, "text_delta", { delta: "headless-complete" });
        yield durable(2, "usage_recorded", { inputTokens: 3, outputTokens: 2 });
        yield durable(3, "completed", { status: "completed", statusRevision: 2 });
      },
    };
  }
}

class CursorAwareUsageGateway implements EnterpriseModelGatewayClient {
  public acceptCount = 0;
  #requestDigest = "";
  #clientRequestId = "";
  readonly #terminalStatus: EnterpriseModelStatus["status"];
  readonly #includeUsage: boolean;
  readonly #eventInvocationId: string;
  readonly #omitTerminalEvent: boolean;
  #usageEventDigest = "2".repeat(64);

  constructor(input: Readonly<{
    terminalStatus?: EnterpriseModelStatus["status"];
    includeUsage?: boolean;
    eventInvocationId?: string;
    omitTerminalEvent?: boolean;
  }> = {}) {
    this.#terminalStatus = input.terminalStatus ?? "running";
    this.#includeUsage = input.includeUsage ?? true;
    this.#eventInvocationId = input.eventInvocationId ?? id(9409);
    this.#omitTerminalEvent = input.omitTerminalEvent ?? false;
  }

  setUsageEventDigest(eventDigest: string): void {
    this.#usageEventDigest = eventDigest;
  }

  begin(): EnterpriseModelGatewayOperation {
    const terminalStatus = this.#terminalStatus;
    const includeUsage = this.#includeUsage;
    const eventInvocationId = this.#eventInvocationId;
    const omitTerminalEvent = this.#omitTerminalEvent;
    const usageEventDigest = this.#usageEventDigest;
    const terminalSequence = includeUsage ? 3 : 2;
    return {
      scope: {
        enterpriseId: "enterprise-one",
        userId: "user-one",
        deviceId: "device-one",
        clientInstanceId: "client-one",
      },
      accept: async (document: JsonObject): Promise<EnterpriseModelAccepted> => {
        this.acceptCount += 1;
        this.#requestDigest = String(document.requestDigest);
        this.#clientRequestId = String(document.clientRequestId);
        return {
          invocationId: id(9409),
          clientRequestId: this.#clientRequestId,
          requestDigest: this.#requestDigest,
          statusRevision: 0,
          lastDurableEventSequence: 1,
          durableCursor: "opaque-cursor-1",
          createdAt: now,
        };
      },
      status: async (): Promise<EnterpriseModelStatus> => ({
        invocationId: id(9409),
        clientRequestId: this.#clientRequestId,
        requestDigest: this.#requestDigest,
        status: terminalStatus,
        statusRevision: terminalStatus === "running" ? 1 : 2,
        lastDurableEventSequence: terminalSequence,
        durableCursor: `opaque-cursor-${terminalSequence}`,
      }),
      cancel: async (): Promise<EnterpriseModelStatus> => ({
        invocationId: id(9409),
        clientRequestId: this.#clientRequestId,
        requestDigest: this.#requestDigest,
        status: "cancelled",
        statusRevision: 2,
        lastDurableEventSequence: 3,
        durableCursor: "opaque-cursor-3",
      }),
      events: async function* (input): AsyncIterable<EnterpriseModelEvent> {
        if (
          includeUsage
          && input.durableCursor !== "opaque-cursor-2"
          && input.durableCursor !== "opaque-cursor-3"
        ) {
          yield durable(2, "usage_recorded", {
            invocationId: eventInvocationId,
            eventDigest: usageEventDigest,
            inputTokens: 8,
            outputTokens: 3,
          });
        }
        if (!omitTerminalEvent && input.durableCursor !== `opaque-cursor-${terminalSequence}`) {
          const eventType = terminalStatus === "running" ? "completed" : terminalStatus;
          yield durable(terminalSequence, eventType, {
            invocationId: eventInvocationId,
            status: eventType,
            statusRevision: 2,
          });
        }
      },
    };
  }
}

class NoOutputGateway implements EnterpriseModelGatewayClient {
  public acceptCount = 0;
  #requestDigest = "";
  #clientRequestId = "";

  begin(): EnterpriseModelGatewayOperation {
    return {
      scope: {
        enterpriseId: "enterprise-one",
        userId: "user-one",
        deviceId: "device-one",
        clientInstanceId: "client-one",
      },
      accept: async (document: JsonObject): Promise<EnterpriseModelAccepted> => {
        this.acceptCount += 1;
        this.#requestDigest = String(document.requestDigest);
        this.#clientRequestId = String(document.clientRequestId);
        return {
          invocationId: id(9460),
          clientRequestId: this.#clientRequestId,
          requestDigest: this.#requestDigest,
          statusRevision: 0,
          lastDurableEventSequence: 0,
          durableCursor: "opaque-no-output-1",
          createdAt: now,
        };
      },
      status: async (): Promise<EnterpriseModelStatus> => ({
        invocationId: id(9460),
        clientRequestId: this.#clientRequestId,
        requestDigest: this.#requestDigest,
        status: "running",
        statusRevision: 1,
        lastDurableEventSequence: 0,
        durableCursor: "opaque-no-output-1",
      }),
      cancel: async (): Promise<EnterpriseModelStatus> => ({
        invocationId: id(9460),
        clientRequestId: this.#clientRequestId,
        requestDigest: this.#requestDigest,
        status: "cancelled",
        statusRevision: 2,
        lastDurableEventSequence: 1,
        durableCursor: "opaque-no-output-2",
      }),
      events: async function* (input): AsyncIterable<EnterpriseModelEvent> {
        if ("__never" in input) yield undefined as never;
      },
    };
  }
}

async function collect(
  provider: DurableEnterpriseModelProvider,
  fixture: ReturnType<typeof modelFixture>,
) {
  return collectInvocation(provider, fixture.request, fixture.invocation);
}

async function collectInvocation(
  provider: DurableEnterpriseModelProvider,
  request: ReturnType<typeof modelFixture>["request"],
  invocation: ModelProviderInvocation,
) {
  const output = [];
  for await (const event of provider.stream(
    request,
    new AbortController().signal,
    invocation,
  )) output.push(event);
  return output;
}

function createProvider(
  fixture: ReturnType<typeof modelFixture>,
  gateway: EnterpriseModelGatewayClient,
  links: ModelInvocationLinkPersistence,
  usageProjections?: ProviderUsageProjectionPersistence,
  compactionLinks?: CompactionModelInvocationLinkPersistence,
  sessionScopes?: SessionScopeDigestProvider,
) {
  return new DurableEnterpriseModelProvider({
    adapterDescriptorId: fixture.lock.adapterDescriptorSnapshot.adapterDescriptorId,
    adapterDescriptorRevision: fixture.lock.adapterDescriptorSnapshot.revision,
    gateway,
    links,
    ...(compactionLinks === undefined ? {} : { compactionLinks }),
    ...(usageProjections === undefined ? {} : { usageProjections }),
    ...(sessionScopes === undefined ? {} : { sessionScopes }),
    identityScope: {
      enterpriseId: "enterprise-one",
      userId: "user-one",
      deviceId: "device-one",
      clientInstanceId: "client-one",
    },
    clock: new FakeClock(now),
    ids: new FakeIdGenerator([id(9450), id(9451), id(9452), id(9453)]),
  });
}

class FailOnceUsageProjectionPersistence implements ProviderUsageProjectionPersistence {
  readonly #delegate: ProviderUsageProjectionPersistence;
  #failed = false;

  constructor(delegate: ProviderUsageProjectionPersistence) {
    this.#delegate = delegate;
  }

  start() { return this.#delegate.start(); }
  stop() { return this.#delegate.stop(); }
  loadByLink(...input: Parameters<ProviderUsageProjectionPersistence["loadByLink"]>) {
    return this.#delegate.loadByLink(...input);
  }
  listBySession(...input: Parameters<ProviderUsageProjectionPersistence["listBySession"]>) {
    return this.#delegate.listBySession(...input);
  }
  record(input: Parameters<ProviderUsageProjectionPersistence["record"]>[0]) {
    if (!this.#failed) {
      this.#failed = true;
      throw new Error("fixture crash before Usage Projection");
    }
    return this.#delegate.record(input);
  }
}

class FailOnceAssistantUsageCursorPersistence implements ModelInvocationLinkPersistence {
  readonly #delegate: ModelInvocationLinkPersistence;
  #failed = false;

  constructor(delegate: ModelInvocationLinkPersistence) {
    this.#delegate = delegate;
  }

  loadByClientRequestId(...input: Parameters<ModelInvocationLinkPersistence["loadByClientRequestId"]>) {
    return this.#delegate.loadByClientRequestId(...input);
  }
  loadRound(...input: Parameters<ModelInvocationLinkPersistence["loadRound"]>) {
    return this.#delegate.loadRound(...input);
  }
  listIncomplete(...input: Parameters<ModelInvocationLinkPersistence["listIncomplete"]>) {
    return this.#delegate.listIncomplete(...input);
  }
  prepare(...input: Parameters<ModelInvocationLinkPersistence["prepare"]>) {
    return this.#delegate.prepare(...input);
  }
  recordAccepted(...input: Parameters<ModelInvocationLinkPersistence["recordAccepted"]>) {
    return this.#delegate.recordAccepted(...input);
  }
  recordMessageCommitted(...input: Parameters<ModelInvocationLinkPersistence["recordMessageCommitted"]>) {
    return this.#delegate.recordMessageCommitted(...input);
  }
  recordStreamProgress(input: Parameters<ModelInvocationLinkPersistence["recordStreamProgress"]>[0]) {
    if (!this.#failed && input.durableCursor === "opaque-cursor-2") {
      this.#failed = true;
      throw new Error("fixture crash after Usage Projection before Assistant cursor");
    }
    return this.#delegate.recordStreamProgress(input);
  }
}

class FailOnceCompactionUsageCursorPersistence
implements CompactionModelInvocationLinkPersistence {
  readonly #delegate: CompactionModelInvocationLinkPersistence;
  #failed = false;

  constructor(delegate: CompactionModelInvocationLinkPersistence) {
    this.#delegate = delegate;
  }

  loadByCompactionJobId(
    ...input: Parameters<CompactionModelInvocationLinkPersistence["loadByCompactionJobId"]>
  ) {
    return this.#delegate.loadByCompactionJobId(...input);
  }
  prepare(...input: Parameters<CompactionModelInvocationLinkPersistence["prepare"]>) {
    return this.#delegate.prepare(...input);
  }
  recordAccepted(...input: Parameters<CompactionModelInvocationLinkPersistence["recordAccepted"]>) {
    return this.#delegate.recordAccepted(...input);
  }
  recordStreamProgress(
    input: Parameters<CompactionModelInvocationLinkPersistence["recordStreamProgress"]>[0],
  ) {
    if (!this.#failed && input.durableCursor === "opaque-cursor-2") {
      this.#failed = true;
      throw new Error("fixture crash after Usage Projection before Compaction cursor");
    }
    return this.#delegate.recordStreamProgress(input);
  }
}

class VersionCapturingGateway implements EnterpriseModelGatewayClient {
  public contractVersion: "v1alpha1" | "v1alpha2" | "v1alpha3" | undefined;
  public acceptDocument: JsonObject = {};
  #clientRequestId = "";
  #requestDigest = "";
  #remainingAcceptFailures: number;

  constructor(acceptFailures = 0) {
    this.#remainingAcceptFailures = acceptFailures;
  }

  begin(
    _scope: Parameters<EnterpriseModelGatewayClient["begin"]>[0],
    contractVersion: "v1alpha1" | "v1alpha2" | "v1alpha3" = "v1alpha1",
  ): EnterpriseModelGatewayOperation {
    this.contractVersion = contractVersion;
    return {
      scope: {
        enterpriseId: "enterprise-one",
        userId: "user-one",
        deviceId: "device-one",
        clientInstanceId: "client-one",
      },
      accept: async (document): Promise<EnterpriseModelAccepted> => {
        this.acceptDocument = document;
        if (this.#remainingAcceptFailures > 0) {
          this.#remainingAcceptFailures -= 1;
          throw new Error("C2 before Gateway accept");
        }
        this.#clientRequestId = String(document.clientRequestId);
        this.#requestDigest = String(document.requestDigest);
        return {
          invocationId: id(9409),
          clientRequestId: this.#clientRequestId,
          requestDigest: this.#requestDigest,
          statusRevision: 0,
          lastDurableEventSequence: 1,
          durableCursor: "opaque-cursor-1",
          createdAt: now,
        };
      },
      status: async (): Promise<EnterpriseModelStatus> => ({
        invocationId: id(9409),
        clientRequestId: this.#clientRequestId,
        requestDigest: this.#requestDigest,
        status: "running",
        statusRevision: 1,
        lastDurableEventSequence: 1,
        durableCursor: "opaque-cursor-1",
      }),
      cancel: async (): Promise<EnterpriseModelStatus> => ({
        invocationId: id(9409),
        clientRequestId: this.#clientRequestId,
        requestDigest: this.#requestDigest,
        status: "cancelled",
        statusRevision: 2,
        lastDurableEventSequence: 2,
        durableCursor: "opaque-cursor-2",
      }),
      events: async function* (): AsyncIterable<EnterpriseModelEvent> {
        yield ephemeral(1, "started");
        yield ephemeral(2, "text_delta", { delta: "cache-context-complete" });
        yield durable(2, "completed", { status: "completed", statusRevision: 2 });
      },
    };
  }
}

function stableClientRequestId(taskId: string, runId: string, round: number): string {
  const value = `${taskId}:${runId}:${round}`;
  const hash = createHash("sha256")
    .update(`enterprise-model-client-request:${value}`, "utf8")
    .digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function createTask(databasePath: string, taskId: string): Promise<void> {
  const persistence = new SqliteTaskPersistence({
    databasePath,
    clock: new FakeClock(now),
  });
  await persistence.start();
  const runtime = new DurableTaskRuntime({
    persistence,
    idGenerator: new FakeIdGenerator([id(9340)]),
  });
  const initialization: TaskInitialization = {
    taskId,
    agentDefinition: { agentDefinitionId: id(9341), version: "1.0.0" },
    goal: "ARH-3.2.1 Prompt Cache context recovery",
    createdAt: now,
  };
  const created = await runtime.createTask(initialization);
  if (!created.ok) throw new Error(created.error.code);
  await persistence.stop();
}

async function createConversationSession(databasePath: string, sessionId: string): Promise<void> {
  const persistence = new SqliteConversationPersistence({
    databasePath,
    clock: new FakeClock(now),
  });
  await persistence.start();
  const created = await persistence.createSession({ ...initialSessionHead(), sessionId });
  if (!created.ok) throw new Error(created.error.code);
  await persistence.stop();
}

function modelFixture() {
  const taskId = id(9401);
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.enterprise",
    kind: "model",
    name: "Enterprise Model",
    description: "CGF-2C.1 durable provider",
    source,
    model: {
      family: "enterprise",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 16_384,
      supportsStreaming: true,
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.enterprise",
    adapterKind: "model_provider",
    source,
    implementationRef: "enterprise:model-gateway",
    runtimeBoundary: "remote",
    protocol: { name: "robothree-enterprise-model", version: "v1alpha1" },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.enterprise",
    capability: { capabilityId: definition.capabilityId, capabilityRevision: definition.revision },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "model_provider",
    source,
  });
  const lock = TaskCapabilityLockSchema.parse({
    schemaVersion: CONTRACT_VERSION,
    lockId: id(9402),
    taskId,
    registryRevision: digest("b"),
    definitionSnapshot: definition,
    bindingSnapshot: binding,
    adapterDescriptorSnapshot: descriptor,
    lockedAt: now,
  });
  const selection = {
    schemaVersion: "v1alpha1",
    runtimeSelectionId: id(9403),
    taskId,
    agent: { agentDefinitionId: "agent.general", revision: digest("c"), digest: digest("c") },
    agentDefaultModelId: definition.capabilityId,
    resolvedModelLock: {
      lockId: lock.lockId,
      capabilityId: definition.capabilityId,
      lockDigest: sha256CanonicalJson(JsonValueSchema.parse(lock)),
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    platformPromptRevision: digest("d"),
    enterpriseConfigRevision: digest("e"),
    registryRevision: lock.registryRevision,
    createdAt: now,
    selectionDigest: digest("f"),
  } as TaskRuntimeSelection;
  const toolSchema = { type: "object", properties: { value: { type: "string" } } } as JsonObject;
  const material = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    requestId: id(9404),
    snapshotId: id(9405),
    contextSourceDigest: digest("1"),
    model: { capabilityId: "model.enterprise", capabilityRevision: definition.revision },
    messages: [{
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user" as const,
      content: [{ type: "text" as const, text: "hello" }],
    }],
    tools: [{
      taskId,
      lockId: id(9406),
      capabilityId: "tool.echo",
      capabilityRevision: digest("2"),
      name: "tool.echo",
      description: "Echo a value",
      inputSchema: toolSchema,
    }],
    artifacts: [],
    maxOutputTokens: 512,
  };
  const request = ModelRequestSchema.parse({
    ...material,
    requestDigest: sha256CanonicalJson(JsonValueSchema.parse(material)),
  });
  const invocation: ModelProviderInvocation = {
    sessionId: id(9400),
    taskId,
    runId: id(9407),
    stepId: id(9408),
    actionId: id(9411),
    round: 1,
    runtimeSelection: selection,
    modelLock: lock,
    modelRequest: request,
    assistantMessageId: id(9412),
    deadlineAt: "2026-08-03T06:05:00.000Z",
    externalTarget: "enterprise:model-gateway",
    dataCategories: ["user_text", "tool_schema"],
    dataScopeDigest: digest("3"),
    admission: {
      type: "user_confirmed",
      confirmationId: id(9413),
      scopeDigest: digest("4"),
      confirmationDigest: digest("5"),
    },
  };
  return {
    lock,
    selection,
    request,
    invocation,
    toolArgumentsDigest: sha256CanonicalJson(JsonValueSchema.parse({ value: "hello" }))
      .slice("sha256:".length),
  };
}

function compactionInvocation(
  fixture: ReturnType<typeof modelFixture>,
): Extract<ModelProviderInvocation, { purpose: "compaction_summary" }> {
  const { assistantMessageId: _assistantMessageId, ...base } = fixture.invocation;
  return {
    ...base,
    purpose: "compaction_summary",
    compactionJobId: id(9470),
    executionBindingDigest: digest("7"),
  };
}

function sqliteCompactionInvocation(
  fixture: ReturnType<typeof modelFixture>,
): Extract<ModelProviderInvocation, { purpose: "compaction_summary" }> {
  const request = requestCompactionInput();
  return {
    ...compactionInvocation(fixture),
    sessionId: conversationIds.session,
    compactionJobId: conversationIds.job,
    executionBindingDigest: request.executionBinding.bindingDigest,
  };
}

async function seedCompactionConversation(databasePath: string): Promise<void> {
  const persistence = new SqliteConversationPersistence({
    databasePath,
    clock: new FakeClock(conversationAt.created),
  });
  await persistence.start();
  const session = await persistence.createSession(initialSessionHead());
  if (!session.ok) throw new Error(session.error.code);
  for (const sequence of [1, 2] as const) {
    const appended = await persistence.appendMessage({
      expectedMessageSequence: sequence - 1,
      message: conversationMessage(sequence),
      updatedAt: sequence === 1 ? conversationAt.message1 : conversationAt.message2,
    });
    if (!appended.ok) throw new Error(appended.error.code);
  }
  const requested = await persistence.requestCompaction(requestCompactionInput());
  if (!requested.ok) throw new Error(requested.error.code);
  await persistence.stop();
}

function ephemeral(
  streamSequence: number,
  eventType: "started" | "text_delta" | "tool_call",
  value: Record<string, unknown> = {},
): EnterpriseModelEvent {
  return {
    eventClass: "ephemeral",
    invocationId: id(9409),
    eventId: id(9500 + streamSequence),
    streamSequence,
    eventType,
    occurredAt: now,
    ...value,
  } as EnterpriseModelEvent;
}

function durable(
  durableSequence: number,
  eventType: "usage_recorded" | "completed" | "failed" | "cancelled" | "timed_out" | "uncertain",
  value: Record<string, unknown>,
): EnterpriseModelEvent {
  return {
    eventClass: "durable",
    invocationId: id(9409),
    eventId: id(9600 + durableSequence),
    durableSequence,
    durableCursor: `opaque-cursor-${durableSequence}`,
    eventDigest: String(durableSequence).repeat(64),
    eventType,
    occurredAt: now,
    ...value,
  } as EnterpriseModelEvent;
}

async function writeArh333StatusFirstEvidence(
  kind: "assistant" | "compaction",
): Promise<void> {
  const outputPath = kind === "assistant"
    ? process.env.ROBOTHREE_ARH333_ASSISTANT_RECONCILIATION_EVIDENCE_PATH
    : process.env.ROBOTHREE_ARH333_COMPACTION_RECONCILIATION_EVIDENCE_PATH;
  if (outputPath === undefined) return;
  await writeFile(outputPath, JSON.stringify({
    schemaVersion: "v1alpha1",
    invocationKind: kind,
    statusFirstReconciliationCount: 1,
    usageProjectionCount: 1,
    durableCursorClass: "monotonic",
    ephemeralReplayCount: 0,
  }), "utf8");
}
