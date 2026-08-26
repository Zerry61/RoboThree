import {
  JsonObjectSchema,
  MODEL_PROTOCOL_VERSION,
  type ModelRequest,
  type ModelStreamEvent,
  type TaskCapabilityLock,
  type TaskRuntimeSelection,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  CodeOwnedApplicationLocaleSource,
  DynamicRequestFactsMaterializer,
  DurableLocalPersonalModelProvider,
  FakeClock,
  InMemoryLocalPersonalModelInvocationPersistence,
  LocalPersonalModelInvocationRecoveryCoordinator,
  ModelStreamResumeUnavailableError,
  PersonalModelProviderProfileRegistry,
  allocatePersonalCredentialReference,
  calculateCredentialBindingDigest,
  compactionDynamicRequestFactsSubject,
  createPersonalModelDefinition,
  createPersonalModelOwnerNamespace,
  createPersonalModelStatusFact,
  createModelInvocationTimeoutMaterial,
  derivePersonalModelOwnerIdentity,
  providerAttemptKey,
  sha256CanonicalJson,
  validateModelStream,
  type LocalPersonalInvocationFaultPoint,
  type LocalPersonalModelStreamTransport,
  type LocalPersonalProviderAttemptTelemetry,
  type ModelProviderInvocation,
  type PersonalModelPersistence,
  LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
} from "../src/index.js";

const at = "2026-08-22T09:00:00.000Z";
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe("DFI-4A.3.3 durable local Personal Model Provider", () => {
  it("persists outputStarted before exposure and atomically commits real Usage", async () => {
    const fixture = providerFixture({
      events: [
        { type: "started" },
        { type: "text_delta", delta: "hello" },
        { type: "usage", inputTokens: 12, outputTokens: 4 },
        { type: "completed", finishReason: "stop" },
      ],
      rawUsage: {
        prompt_tokens: 12,
        completion_tokens: 4,
        total_tokens: 16,
        prompt_tokens_details: { cached_tokens: 3 },
        completion_tokens_details: { reasoning_tokens: 2 },
      },
    });
    const events: ModelStreamEvent[] = [];
    for await (const event of validateModelStream(
      fixture.provider.stream(fixture.request, new AbortController().signal, fixture.invocation),
      new AbortController().signal,
    )) events.push(event);

    expect(events).toEqual([
      { type: "started" },
      { type: "text_delta", delta: "hello" },
      { type: "usage", inputTokens: 12, outputTokens: 4 },
      { type: "completed", finishReason: "stop" },
    ]);
    const link = await fixture.invocations.loadInvocation(linkIdentity(fixture.invocation));
    expect(link).toMatchObject({ status: "terminal", terminalClass: "completed", fencingEpoch: 1 });
    expect(link?.outputStartedAt).toBe(at);
    const usage = await fixture.invocations.load({
      authorityInvocationId: link!.authorityInvocationId,
      providerAttemptKey: providerAttemptKey("local_personal", link!.authorityInvocationId, 1),
    });
    expect(usage).toMatchObject({
      providerInputTokens: 12,
      providerOutputTokens: 4,
      cacheReadInputTokens: 3,
      reasoningOutputTokens: 2,
    });
  });

  it("preserves unknown Usage instead of fabricating zero", async () => {
    const fixture = providerFixture({ events: successEvents() });
    await consume(fixture);
    const link = await fixture.invocations.loadInvocation(linkIdentity(fixture.invocation));
    expect(await fixture.invocations.load({
      authorityInvocationId: link!.authorityInvocationId,
      providerAttemptKey: providerAttemptKey("local_personal", link!.authorityInvocationId, 1),
    })).toBeUndefined();
  });

  it("recovers I1 with the same logical identity", async () => {
    const first = providerFixture({ events: successEvents(), fault: "local_personal.accepted_committed" });
    await expect(consume(first)).rejects.toThrow("local_personal.accepted_committed");
    expect(await first.invocations.listPending(10)).toEqual([
      expect.objectContaining({ status: "accepted", fencingEpoch: 1 }),
    ]);
    await consume({ ...first, provider: first.recreate() });
    expect(await first.invocations.listPending(10)).toEqual([]);
    expect(first.raw.attemptCount).toBe(1);
  });

  it("reuses the durable deadline after restart instead of granting a new 15 minute window", async () => {
    const first = providerFixture({ events: successEvents(), fault: "local_personal.accepted_committed" });
    await expect(consume(first)).rejects.toThrow("local_personal.accepted_committed");
    first.clock.set("2026-08-22T09:14:00.000Z");
    const replacementTimeout = createModelInvocationTimeoutMaterial({
      policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      invocationStartedAt: first.clock.now(),
    });
    await consume({
      ...first,
      provider: first.recreate(),
      invocation: {
        ...first.invocation,
        deadlineAt: replacementTimeout.invocationDeadlineAt,
        timeout: replacementTimeout,
      },
    });
    expect(first.raw.lastInvocation?.deadlineAt).toBe("2026-08-22T09:15:00.000Z");
    expect(first.raw.lastInvocation?.timeout?.invocationStartedAt).toBe(at);
  });

  it("persists and reloads exact Dynamic Request Facts across a Provider restart", async () => {
    const fixture = providerFixture({ events: successEvents() });
    if (fixture.invocation.purpose !== "compaction_summary") {
      throw new Error("expected compaction fixture");
    }
    const subject = compactionDynamicRequestFactsSubject(
      fixture.invocation.compactionJobId,
    );
    const facts = new DynamicRequestFactsMaterializer({
      clock: fixture.clock,
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
    await consume({ ...fixture, invocation });
    const restarted = fixture.recreate();
    expect(await restarted.loadDynamicRequestFacts(subject)).toEqual(facts);
    expect(await fixture.invocations.loadInvocation(linkIdentity(invocation)))
      .toMatchObject({
        schemaVersion: "v1alpha2",
        dynamicRequestFacts: facts,
        contextAssemblyReceiptDigest: digest("9"),
      });
  });

  it("classifies I2 honestly and advances fencing for an at-least-once retry", async () => {
    const first = providerFixture({ events: successEvents(), fault: "local_personal.dispatch_claimed" });
    await expect(consume(first)).rejects.toThrow("local_personal.dispatch_claimed");
    const classification = await new LocalPersonalModelInvocationRecoveryCoordinator({
      persistence: first.invocations,
      clock: first.clock,
      timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
    }).classify();
    expect(classification).toMatchObject({ atLeastOnceRiskCount: 1, recoveryExhaustedCount: 0 });
    await consume({ ...first, provider: first.recreate() });
    const link = await first.invocations.loadInvocation(linkIdentity(first.invocation));
    expect(link).toMatchObject({ status: "terminal", fencingEpoch: 2 });
    expect(first.raw.attemptCount).toBe(1);
  });

  it.each([
    ["I3", "local_personal.output_started_committed"],
    ["I4", "local_personal.terminal_before_commit"],
  ] as const)("fails closed for %s and never reconstructs partial output", async (_name, fault) => {
    const fixture = providerFixture({ events: successEvents(), fault });
    await expect(consume(fixture)).rejects.toBeInstanceOf(ModelStreamResumeUnavailableError);
    expect(await fixture.invocations.loadInvocation(linkIdentity(fixture.invocation)))
      .toMatchObject({ status: "recovery_exhausted", typedErrorCode: "model_stream_resume_unavailable" });
    expect(JSON.stringify(await fixture.invocations.listPending(10))).not.toContain("hello");
    await expect(consume({ ...fixture, provider: fixture.recreate() }))
      .rejects.toBeInstanceOf(ModelStreamResumeUnavailableError);
  });

  it("keeps I5 terminal facts but does not fabricate a missing Assistant body", async () => {
    const fixture = providerFixture({ events: successEvents(), fault: "local_personal.terminal_committed" });
    await expect(consume(fixture)).rejects.toThrow("local_personal.terminal_committed");
    expect(await fixture.invocations.loadInvocation(linkIdentity(fixture.invocation)))
      .toMatchObject({ status: "terminal", terminalClass: "completed" });
    await expect(consume({ ...fixture, provider: fixture.recreate() }))
      .rejects.toBeInstanceOf(ModelStreamResumeUnavailableError);
  });

  it("replays a failed durable terminal as a typed terminal without another Provider call", async () => {
    const fixture = providerFixture({ events: [
      { type: "started" },
      { type: "failed", error: {
        code: "personal_model.authentication_failed",
        category: "authentication",
        message: "safe",
        retryable: false,
      } },
    ] });
    await consume(fixture);
    const replay = fixture.recreate();
    const events: ModelStreamEvent[] = [];
    for await (const event of replay.stream(
      fixture.request,
      new AbortController().signal,
      fixture.invocation,
    )) events.push(event);
    expect(events).toEqual([
      { type: "started" },
      expect.objectContaining({ type: "failed", error: expect.objectContaining({
        code: "personal_model.authentication_failed",
      }) }),
    ]);
    expect(fixture.raw.attemptCount).toBe(1);
  });

  it("bounded startup classification invalidates corrupt ownership without network dispatch", async () => {
    const fixture = providerFixture({ events: successEvents(), fault: "local_personal.accepted_committed" });
    await expect(consume(fixture)).rejects.toThrow();
    const evidence = await new LocalPersonalModelInvocationRecoveryCoordinator({
      persistence: fixture.invocations,
      clock: fixture.clock,
      timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      validate: async () => false,
    }).classify(1);
    expect(evidence).toMatchObject({ scannedCount: 1, hasMore: true, invalidatedCount: 1 });
    expect(fixture.raw.attemptCount).toBe(0);
    expect(await fixture.invocations.listPending(10)).toEqual([]);
    await expect(new LocalPersonalModelInvocationRecoveryCoordinator({
      persistence: fixture.invocations,
      clock: fixture.clock,
      timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
    }).classify(201)).rejects.toThrow("between 1 and 200");
  });

  it("allows only one concurrent recovery owner to advance the fencing CAS", async () => {
    const fixture = providerFixture({ events: successEvents(), fault: "local_personal.dispatch_claimed" });
    await expect(consume(fixture)).rejects.toThrow("local_personal.dispatch_claimed");
    const outcomes = await Promise.allSettled([
      consume({ ...fixture, provider: fixture.recreate() }),
      consume({ ...fixture, provider: fixture.recreate() }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(await fixture.invocations.loadInvocation(linkIdentity(fixture.invocation)))
      .toMatchObject({ status: "terminal", terminalClass: "completed", fencingEpoch: 2 });
    expect(fixture.raw.attemptCount).toBe(1);
  });
});

function providerFixture(input: Readonly<{
  events: readonly ModelStreamEvent[];
  rawUsage?: unknown;
  fault?: LocalPersonalInvocationFaultPoint;
}>) {
  const namespace = createPersonalModelOwnerNamespace({
    namespaceRevision: 1,
    namespaceKey: Buffer.alloc(32, 7),
    createdAt: at,
  });
  const ownerIdentity = derivePersonalModelOwnerIdentity(namespace, {
    enterpriseId: "enterprise.one",
    userId: "user.one",
    deviceId: "device.one",
  });
  const credentialRef = allocatePersonalCredentialReference(Buffer.alloc(32, 8));
  const definition = createPersonalModelDefinition({
    ownerIdentity,
    personalModelId: "model.personal.one",
    providerKind: "custom",
    providerProfileRevision: new PersonalModelProviderProfileRegistry()
      .resolve("custom").profileRevision,
    protocol: "openai_compatible",
    endpoint: "https://personal.example.com/v1",
    providerModelId: "provider-model-one",
    displayName: "Personal One",
    capabilities: ["text", "streaming"],
    credentialRef,
    credentialRevision: 1,
    credentialBindingDigest: calculateCredentialBindingDigest({
      credentialRef,
      createdByOperationId: "019f7447-a784-77b2-a716-000000000001",
      credentialRevision: 1,
    }),
    createdAt: at,
  });
  const status = createPersonalModelStatusFact({
    ownerScopeNamespaceRevision: ownerIdentity.ownerScopeNamespaceRevision,
    ownerScopeDigest: ownerIdentity.ownerScopeDigest,
    personalModelId: definition.personalModelId,
    configurationRevision: definition.configurationRevision,
    executionDefinitionDigest: definition.executionDefinitionDigest,
    statusRevision: 1,
    status: "unverified",
    statusOrigin: "initialized",
    updatedAt: at,
  });
  const personal = {
    async loadStatus() { return status; },
  } as unknown as PersonalModelPersistence;
  const invocations = new InMemoryLocalPersonalModelInvocationPersistence();
  const clock = new FakeClock(at);
  const raw = new ScriptedRawProvider(input.events, input.rawUsage);
  const request = requestFixture(definition.executionDefinitionDigest);
  const invocation = invocationFixture(request, definition.executionDefinitionDigest);
  const create = (fault?: LocalPersonalInvocationFaultPoint) =>
    new DurableLocalPersonalModelProvider({
      raw,
      invocations,
      personal,
      ownerIdentity,
      definition,
      clock,
      timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      ...(fault === undefined ? {} : { faultInjector: (point) => {
        if (point === fault) throw new Error(point);
      } }),
    });
  return {
    provider: create(input.fault),
    recreate: () => create(),
    raw,
    request,
    invocation,
    invocations,
    clock,
  };
}

class ScriptedRawProvider implements LocalPersonalModelStreamTransport {
  readonly adapterDescriptorId = "adapter.model.local-personal-openai-compatible";
  readonly adapterDescriptorRevision = digest("d");
  public attemptCount = 0;
  public lastInvocation: ModelProviderInvocation | undefined;

  public constructor(
    private readonly events: readonly ModelStreamEvent[],
    private readonly rawUsage?: unknown,
  ) {}

  public async *streamWithTelemetry(
    _request: ModelRequest,
    _signal: AbortSignal,
    invocation: ModelProviderInvocation,
    telemetry: LocalPersonalProviderAttemptTelemetry,
  ): AsyncIterable<ModelStreamEvent> {
    this.attemptCount += 1;
    this.lastInvocation = structuredClone(invocation);
    for (const event of this.events) {
      if (event.type === "usage" && this.rawUsage !== undefined) telemetry.onUsage(this.rawUsage);
      if (event.type === "completed") telemetry.onTerminal("success");
      if (event.type === "failed") telemetry.onTerminal(
        event.error.category === "authentication" ? "authentication" : "provider_transient",
      );
      yield event;
    }
  }
}

async function consume(input: Readonly<{
  provider: DurableLocalPersonalModelProvider;
  request: ModelRequest;
  invocation: ModelProviderInvocation;
}>): Promise<void> {
  for await (const _event of input.provider.stream(
    input.request,
    new AbortController().signal,
    input.invocation,
  )) { /* consume */ }
}

function successEvents(): readonly ModelStreamEvent[] {
  return [
    { type: "started" },
    { type: "text_delta", delta: "hello" },
    { type: "completed", finishReason: "stop" },
  ];
}

function requestFixture(revision: `sha256:${string}`): ModelRequest {
  const material = JsonObjectSchema.parse({
    schemaVersion: MODEL_PROTOCOL_VERSION,
    requestId: "019f7447-a784-77b2-a716-000000000101",
    snapshotId: "019f7447-a784-77b2-a716-000000000102",
    contextSourceDigest: digest("a"),
    model: { capabilityId: "model.personal.one", capabilityRevision: revision },
    messages: [{
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user",
      content: [{ type: "text", text: "hello" }],
    }],
    tools: [],
    artifacts: [],
    maxOutputTokens: 128,
  });
  return { ...material, requestDigest: sha256CanonicalJson(material) } as ModelRequest;
}

function invocationFixture(
  request: ModelRequest,
  revision: `sha256:${string}`,
): ModelProviderInvocation {
  const timeout = createModelInvocationTimeoutMaterial({
    policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
    invocationStartedAt: at,
  });
  const modelLock = {
    lockId: "019f7447-a784-77b2-a716-000000000201",
    definitionSnapshot: { capabilityId: "model.personal.one", revision },
    adapterDescriptorSnapshot: {
      adapterDescriptorId: "adapter.model.local-personal-openai-compatible",
      revision: digest("d"),
      implementationRef: "core:local-personal-openai-compatible",
    },
  } as unknown as TaskCapabilityLock;
  const runtimeSelection = {
    runtimeSelectionId: "019f7447-a784-77b2-a716-000000000202",
    selectionDigest: digest("e"),
  } as unknown as TaskRuntimeSelection;
  return {
    purpose: "compaction_summary",
    compactionJobId: "019f7447-a784-77b2-a716-000000000203",
    executionBindingDigest: digest("f"),
    sessionId: "019f7447-a784-77b2-a716-000000000204",
    taskId: "019f7447-a784-77b2-a716-000000000205",
    runId: "019f7447-a784-77b2-a716-000000000206",
    stepId: "019f7447-a784-77b2-a716-000000000207",
    actionId: "019f7447-a784-77b2-a716-000000000208",
    round: 1,
    runtimeSelection,
    modelLock,
    modelRequest: request,
    deadlineAt: timeout.invocationDeadlineAt,
    timeout,
    externalTarget: "core:local-personal-openai-compatible",
    dataCategories: ["user_text"],
    dataScopeDigest: digest("1"),
    admission: {
      type: "user_confirmed",
      confirmationId: "019f7447-a784-77b2-a716-000000000209",
      scopeDigest: digest("1"),
      confirmationDigest: digest("2"),
    },
  };
}

function linkIdentity(invocation: ModelProviderInvocation) {
  return {
    invocationKind: "compaction_summary" as const,
    invocationLinkId: "compactionJobId" in invocation
      ? invocation.compactionJobId
      : invocation.taskId,
  };
}
