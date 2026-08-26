import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CONTEXT_SCHEMA_VERSION,
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  type ConversationMessage,
  type ModelStreamEvent,
  type ProviderNeutralMessage,
  type TaskInitialization,
  type TurnContextSnapshot,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  CodeOwnedApplicationLocaleSource,
  ConservativeTokenEstimator,
  ContextBudgetPolicy,
  ContextPipeline,
  DynamicRequestFactsMaterializer,
  DynamicRequestFactsRuntime,
  DynamicRequestFactsV1Schema,
  FakeClock,
  FakeIdGenerator,
  InMemoryConversationPersistence,
  InMemoryModelInvocationLinkPersistence,
  PLATFORM_PROMPT_V1_REVISION,
  RequestScopedSystemMessageMaterializer,
  RuntimeOperatingSystemTimezoneSource,
  SqliteModelInvocationLinkPersistence,
  SqliteTaskPersistence,
  TaskInstructionBundleMaterializer,
  TaskLockedInstructionRuntimeResolver,
  calculateDynamicRequestFactsDigest,
  createAgentDefinitionRevision,
  createTaskRuntimeSelection,
  dynamicRequestFactsEvidence,
  mainDynamicRequestFactsSubject,
  sha256CanonicalJson,
  type DynamicRequestFactsSubject,
  type DynamicRequestFactsV1,
  type ModelProvider,
  type PrepareModelInvocationLinkInput,
  type TaskLockedInstructionRuntimeMaterial,
} from "../src/index.js";

const id = (value: number) =>
  `019f8d10-0000-7000-8000-${String(value).padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const at = "2026-08-26T08:00:00.000Z";

describe("R2D-1 controlled Dynamic Request Facts", () => {
  it("creates strict, domain-separated facts from controlled Core sources", () => {
    const facts = factsFixture();
    expect(facts).toMatchObject({
      schemaVersion: "v1",
      invocationKind: "main",
      currentTime: at,
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
    });
    const { factsDigest: _factsDigest, ...material } = facts;
    expect(facts.factsDigest).toBe(calculateDynamicRequestFactsDigest(material));
    expect(() => DynamicRequestFactsV1Schema.parse({ ...facts, extra: true })).toThrow();
    expect(() => DynamicRequestFactsV1Schema.parse({ ...facts, currentTime: at.slice(0, -5) + "Z" }))
      .toThrow();
    expect(() => DynamicRequestFactsV1Schema.parse({ ...facts, locale: "not_a_locale" }))
      .toThrow();
    expect(() => DynamicRequestFactsV1Schema.parse({ ...facts, timezone: "+08:00" }))
      .toThrow();
    expect(JSON.stringify(facts)).not.toContain("credential");
    expect(new RuntimeOperatingSystemTimezoneSource().requireCurrent().timezone)
      .toBeTruthy();
  });

  it("reuses durable facts for the same invocation and resamples a new subject", async () => {
    const clock = new FakeClock(at);
    const materializer = materializerFixture(clock);
    const durable: { value?: DynamicRequestFactsV1 } = {};
    const provider = providerFixture(async () => durable.value);
    const runtime = new DynamicRequestFactsRuntime(materializer);
    const subject = mainDynamicRequestFactsSubject({ taskId: id(1), runId: id(2), round: 1 });
    const first = await runtime.resolve({ provider, subject });
    durable.value = first;
    clock.set("2026-08-26T09:00:00.000Z");
    expect(await runtime.resolve({ provider, subject })).toEqual(first);
    const next = await runtime.resolve({
      provider: providerFixture(async () => undefined),
      subject: mainDynamicRequestFactsSubject({ taskId: id(1), runId: id(2), round: 2 }),
    });
    expect(next.currentTime).toBe("2026-08-26T09:00:00.000Z");
    expect(next.factsDigest).not.toBe(first.factsDigest);
  });

  it("fails closed when a Provider cannot recover invocation facts", async () => {
    const runtime = new DynamicRequestFactsRuntime(materializerFixture(new FakeClock(at)));
    await expect(runtime.resolve({
      provider: providerFixture(),
      subject: mainDynamicRequestFactsSubject({ taskId: id(1), runId: id(2), round: 1 }),
    })).rejects.toMatchObject({ code: "context.dynamic_facts_unavailable" });
  });

  it("adds a bounded non-authorizing block to exactly one System Message", async () => {
    const runtime = await cpcRuntime();
    if (runtime.mode !== "cpc_v1") throw new Error("expected CPC runtime");
    const facts = factsFixture();
    const scoped = new RequestScopedSystemMessageMaterializer().materialize({
      stableMessage: runtime.bundle.message,
      stableInstructionBundleDigest: runtime.bundle.descriptor.instructionBundleDigest,
      dynamicRequestFacts: facts,
    });
    expect(scoped.message.content[0]?.text).toContain("不授予任何权限");
    expect(scoped.message.content[0]?.text).toContain(`当前时间：${at}`);
    expect(scoped.message.content[0]?.text).toContain("用户时区：Asia/Shanghai");
    expect(scoped.dynamicRequestFactsEvidence).toEqual(dynamicRequestFactsEvidence(facts));
    expect(runtime.bundle.descriptor.instructionBundleDigest)
      .toBe(runtime.bundle.message.sourceDigest);

    const fixture = snapshotFixture();
    const result = pipeline().run({
      phase: "pre_call",
      requestId: id(30),
      snapshot: fixture.snapshot,
      conversationMessages: fixture.messages,
      model: { capabilityId: "model.r2d", capabilityRevision: digest("5") },
      lockedInstructionBundle: lockedContext(runtime, fixture.snapshot.snapshotId),
      dynamicRequestFacts: facts,
    });
    expect(result.request.messages.filter((message) => message.role === "system"))
      .toHaveLength(1);
    expect(result.receipt.instructionBundleEvidence?.instructionBundleDigest)
      .toBe(runtime.bundle.descriptor.instructionBundleDigest);
    expect(result.receipt.dynamicRequestFactsEvidence).toEqual(
      dynamicRequestFactsEvidence(facts),
    );
    expect(result.receipt.requestScopedSystemMessageDigest)
      .toBe(result.request.messages[0]?.sourceDigest);
    expect(JSON.stringify(result.receipt)).not.toContain("当前时间：");
  });

  it("rejects Dynamic Facts on a legacy instruction path", () => {
    const fixture = snapshotFixture();
    expect(() => pipeline().run({
      phase: "pre_call",
      requestId: id(31),
      snapshot: fixture.snapshot,
      conversationMessages: fixture.messages,
      model: { capabilityId: "model.r2d", capabilityRevision: digest("5") },
      dynamicRequestFacts: factsFixture(),
      instructions: [],
    })).toThrow("require an exact locked instruction bundle");
  });
});

describe("R2D-1 readable Invocation Link v2", () => {
  it("roundtrips exact facts through InMemory and SQLite restart without migration 27", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-r2d1-link-"));
    const databasePath = join(directory, "robothree.sqlite");
    await createTask(databasePath);
    const memory = new InMemoryModelInvocationLinkPersistence();
    await memory.start();
    let sqlite = new SqliteModelInvocationLinkPersistence({
      databasePath,
      clock: new FakeClock(at),
    });
    await sqlite.start();
    try {
      const input = invocationLinkInput();
      for (const persistence of [memory, sqlite]) {
        const prepared = await persistence.prepare(input);
        expect(prepared).toMatchObject({ ok: true, value: { schemaVersion: "v2" } });
        expect(await persistence.prepare({
          ...input,
          contextAssemblyReceiptDigest: digest("f"),
        })).toMatchObject({
          ok: false,
          error: { code: "model_invocation_link.conflict" },
        });
      }
      await sqlite.stop();
      sqlite = new SqliteModelInvocationLinkPersistence({
        databasePath,
        clock: new FakeClock("2026-08-27T08:00:00.000Z"),
      });
      await sqlite.start();
      expect(await sqlite.loadRound(id(1), id(2), 1)).toMatchObject({
        schemaVersion: "v2",
        dynamicRequestFacts: factsFixture(),
        contextAssemblyReceiptDigest: digest("e"),
      });
    } finally {
      await memory.stop();
      await sqlite.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("roundtrips compaction facts and rejects a changed durable winner", async () => {
    const persistence = new InMemoryConversationPersistence({ clock: new FakeClock(at) });
    await persistence.start();
    try {
      const facts = compactionFactsFixture();
      const input = {
        schemaVersion: "v2" as const,
        compactionJobId: id(40),
        clientRequestId: id(41),
        modelRequestId: id(42),
        modelRequestDigest: digest("1"),
        executionBindingDigest: digest("2"),
        confirmationId: id(43),
        scopeDigest: digest("3"),
        dataScopeDigest: digest("4"),
        dynamicRequestFacts: facts,
        contextAssemblyReceiptDigest: digest("5"),
        createdAt: at,
      };
      expect(await persistence.prepare(input)).toMatchObject({
        ok: true,
        value: { schemaVersion: "v2", dynamicRequestFacts: facts },
      });
      const { factsDigest: _factsDigest, ...changedMaterial } = {
        ...facts,
        currentTime: "2026-08-26T09:00:00.000Z",
      };
      const changedFacts = DynamicRequestFactsV1Schema.parse({
        ...changedMaterial,
        factsDigest: calculateDynamicRequestFactsDigest(changedMaterial),
      });
      expect(await persistence.prepare({
        ...input,
        dynamicRequestFacts: changedFacts,
      })).toMatchObject({ ok: false });
    } finally {
      await persistence.stop();
    }
  });
});

function materializerFixture(clock: FakeClock): DynamicRequestFactsMaterializer {
  return new DynamicRequestFactsMaterializer({
    clock,
    locale: new CodeOwnedApplicationLocaleSource(),
    timezone: {
      requireCurrent: () => ({ timezone: "Asia/Shanghai", sourceRevision: digest("8") }),
    },
  });
}

function factsFixture(): DynamicRequestFactsV1 {
  return materializerFixture(new FakeClock(at)).materialize(
    mainDynamicRequestFactsSubject({ taskId: id(1), runId: id(2), round: 1 }),
  );
}

function compactionFactsFixture(): DynamicRequestFactsV1 {
  const main = factsFixture();
  const material = {
    ...main,
    invocationKind: "compaction" as const,
    invocationSubjectId: id(40),
  };
  const { factsDigest: _factsDigest, ...withoutDigest } = material;
  return DynamicRequestFactsV1Schema.parse({
    ...withoutDigest,
    factsDigest: calculateDynamicRequestFactsDigest(withoutDigest),
  });
}

function providerFixture(
  load?: (subject: DynamicRequestFactsSubject) => Promise<DynamicRequestFactsV1 | undefined>,
): ModelProvider {
  return {
    adapterKind: "model_provider",
    adapterDescriptorId: "adapter.r2d.fixture",
    adapterDescriptorRevision: digest("a"),
    async *stream(): AsyncIterable<ModelStreamEvent> {},
    ...(load === undefined ? {} : { loadDynamicRequestFacts: load }),
  };
}

function invocationLinkInput(): PrepareModelInvocationLinkInput {
  return {
    schemaVersion: "v2",
    taskId: id(1),
    runId: id(2),
    stepId: id(3),
    actionId: id(4),
    round: 1,
    runtimeSelectionDigest: digest("1"),
    assistantMessageId: id(5),
    modelRequestId: id(6),
    modelRequestDigest: digest("2"),
    confirmationId: id(7),
    scopeDigest: digest("3"),
    dataScopeDigest: digest("4"),
    clientRequestId: id(8),
    centralAcceptRequestDigest: digest("5"),
    dynamicRequestFacts: factsFixture(),
    contextAssemblyReceiptDigest: digest("e"),
    createdAt: at,
  };
}

function pipeline(): ContextPipeline {
  return new ContextPipeline({
    budgetPolicy: policy(),
    estimator: new ConservativeTokenEstimator(),
  });
}

function policy(): ContextBudgetPolicy {
  return new ContextBudgetPolicy({
    modelContextWindow: 32_768,
    reservedOutputTokens: 4_096,
    safetyMarginTokens: 1_024,
    compactionThresholdRatio: 0.8,
    maxPreviewBytes: 4_096,
  });
}

async function cpcRuntime(): Promise<TaskLockedInstructionRuntimeMaterial> {
  const agent = createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: "agent.r2d-runtime",
    name: "R2D Runtime Agent",
    identity: "负责可信任务",
    goal: "给出可验证结果",
    instructions: "不要伪造成功",
    defaultModelId: "model.r2d",
    allowModelOverride: false,
    skillReferences: [],
    toolReferences: [],
    knowledgeReferences: [],
    requiredModelCapabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: false,
      supportsStreaming: true,
    },
    createdAt: at,
  });
  const selection = createTaskRuntimeSelection({
    schemaVersion: "v1alpha1",
    runtimeSelectionId: id(10),
    taskId: id(1),
    agent: {
      agentDefinitionId: agent.agentDefinitionId,
      revision: agent.revision,
      digest: agent.digest,
    },
    agentDefaultModelId: "model.r2d",
    resolvedModelLock: { lockId: id(11), capabilityId: "model.r2d", lockDigest: digest("1") },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    platformPromptRevision: PLATFORM_PROMPT_V1_REVISION,
    registryRevision: digest("2"),
    createdAt: at,
  });
  return new TaskLockedInstructionRuntimeResolver({
    enabled: true,
    materializer: new TaskInstructionBundleMaterializer({
      tokenEstimator: new ConservativeTokenEstimator(),
      budgetPolicy: policy(),
    }),
  }).resolve({ runtimeSelection: selection, submitTurnBundleDigest: digest("7"), agent });
}

function lockedContext(
  runtime: Extract<TaskLockedInstructionRuntimeMaterial, { mode: "cpc_v1" }>,
  snapshotId: string,
) {
  return {
    schemaVersion: "v1" as const,
    snapshotId,
    binding: runtime.bundle.binding,
    descriptor: runtime.bundle.descriptor,
    message: runtime.bundle.message,
    estimatedInputTokens: runtime.bundle.estimatedInputTokens,
    availableInputTokens: runtime.bundle.availableInputTokens,
    budgetPolicyDigest: runtime.bundle.budgetPolicyDigest,
  };
}

function snapshotFixture(): Readonly<{
  snapshot: TurnContextSnapshot;
  messages: readonly ConversationMessage[];
}> {
  const message: ProviderNeutralMessage = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "user",
    content: [{ type: "text", text: "完成当前任务" }],
  };
  const record: ConversationMessage = {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: id(20),
      sessionId: id(21),
      sequence: 1,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      createdAt: at,
    },
    message,
  };
  const conversation = {
    sessionId: id(21),
    messageSequence: 1,
    contextRevision: 0,
    messageStartSequence: 1,
    messageEndSequence: 1,
    messageDigest: sha256CanonicalJson(JsonValueSchema.parse([record])),
  };
  const tasks = [{
    taskId: id(1),
    stateRevision: 0,
    lastEventSequence: 0,
    checkpointId: id(22),
    stateDigest: digest("a"),
    capabilityLocks: [],
  }];
  const projection = [{
    type: "conversation_message" as const,
    order: 0,
    sessionId: id(21),
    messageId: id(20),
    messageSequence: 1,
    messageDigest: record.envelope.messageDigest,
  }];
  const sourceDigest = sha256CanonicalJson(JsonValueSchema.parse({
    conversation,
    tasks,
    projection,
  }));
  return {
    messages: [record],
    snapshot: {
      schemaVersion: CONTEXT_SCHEMA_VERSION,
      snapshotId: id(23),
      sessionId: id(21),
      conversation,
      tasks,
      projection,
      sourceDigest,
      createdAt: at,
    },
  };
}

async function createTask(databasePath: string): Promise<void> {
  const persistence = new SqliteTaskPersistence({ databasePath, clock: new FakeClock(at) });
  await persistence.start();
  const runtime = new (await import("../src/index.js")).DurableTaskRuntime({
    persistence,
    idGenerator: new FakeIdGenerator([id(50)]),
  });
  const initialization: TaskInitialization = {
    taskId: id(1),
    agentDefinition: { agentDefinitionId: id(51), version: "1.0.0" },
    goal: "R2D-1 Dynamic Request Facts",
    createdAt: at,
  };
  const created = await runtime.createTask(initialization);
  if (!created.ok) throw new Error(created.error.code);
  await persistence.stop();
}
