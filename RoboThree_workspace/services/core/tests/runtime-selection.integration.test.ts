import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONTRACT_VERSION } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  CapabilityResolver,
  CompositeModelTaskLockPlanner,
  CompositeTrustedModelCatalog,
  FakeClock,
  FakeIdGenerator,
  InMemoryDesktopFoundationPersistence,
  InMemoryPersonalCredentialStore,
  InMemoryTaskPersistence,
  InMemoryTrustedRuntimeCatalog,
  ModelSelectionIntentResolver,
  ModelEligibilityEvaluator,
  PersonalModelProviderProfileRegistry,
  RegistryBuilder,
  RuntimeCatalogProjectionService,
  RuntimeSelectionService,
  SqliteTaskPersistence,
  TaskCapabilityLockService,
  createAdapterDescriptor,
  createAgentDefinitionRevision,
  createCapabilityBinding,
  createCapabilityDefinition,
  createModelDefinition,
  createPersonalModelDefinition,
  createPersonalModelHead,
  createPersonalModelOwnerNamespace,
  createPersonalModelStatusFact,
  derivePersonalModelOwnerIdentity,
  allocatePersonalCredentialReference,
  calculateCredentialBindingDigest,
} from "../src/index.js";
import type { PersonalModelPersistence, TaskPersistence } from "../src/index.js";
import {
  initialPersistedTask,
  persistenceIds,
} from "./task-persistence.fixtures.js";

const digest = (value: string) => `sha256:${value.repeat(64)}` as const;
const at = "2026-07-26T15:10:00.000Z";
const source = {
  trust: "official" as const,
  packageId: "robothree.official.dcf11b",
  packageRevision: digest("a"),
};

describe("DCF-1.1B ModelEligibilityEvaluator", () => {
  it("uses only explicit permission, availability and capability facts", () => {
    const fixture = runtimeFixture();
    const evaluator = new ModelEligibilityEvaluator();
    expect(evaluator.evaluate({
      agent: fixture.agent,
      model: fixture.model,
      live: live(fixture.model.modelId),
    })).toMatchObject({ eligible: true });
    expect(evaluator.evaluate({
      agent: fixture.agent,
      model: fixture.model,
      live: { ...live(fixture.model.modelId), credentialAvailable: false },
    })).toMatchObject({
      eligible: false,
      reasons: ["model.credential_unavailable"],
    });
  });
});

describe("DCF-1.1B RuntimeSelectionService", () => {
  it("locks default Model and Tool, persists an immutable selection, and replays it", async () => {
    const harness = await memoryHarness();
    try {
      const result = await harness.service.resolveAndPersist(selectionInput(harness));
      expect(result).toMatchObject({
        ok: true,
        replayed: false,
        value: {
          agentDefaultModelId: "model.default",
          resolvedModelLock: { capabilityId: "model.default" },
          toolLocks: [{ capabilityId: "tool.echo" }],
        },
      });
      expect(await harness.persistence.listTaskCapabilityLocks(persistenceIds.task))
        .toHaveLength(2);
      expect(await harness.service.resolveAndPersist({
        ...selectionInput(harness),
        liveModels: [{ ...live("model.default"), callable: false }],
      })).toMatchObject({ ok: true, replayed: true });
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects forbidden overrides, unavailable defaults, unallowed resources and revision drift", async () => {
    const harness = await memoryHarness();
    try {
      expect(await harness.service.resolveAndPersist({
        ...selectionInput(harness),
        request: {
          ...selectionInput(harness).request,
          requestedModelId: "model.other",
        },
      })).toMatchObject({
        ok: false,
        error: { code: "selection.model_override_forbidden" },
      });
      expect(await harness.service.resolveAndPersist({
        ...selectionInput(harness),
        liveModels: [{ ...live("model.default"), enabled: false }],
      })).toMatchObject({
        ok: false,
        error: { code: "selection.model_ineligible" },
      });
      expect(await harness.service.resolveAndPersist({
        ...selectionInput(harness),
        request: {
          ...selectionInput(harness).request,
          selectedSkillIds: ["skill.not-allowed"],
        },
      })).toMatchObject({
        ok: false,
        error: { code: "selection.skill_not_allowed" },
      });
    } finally {
      await harness.cleanup();
    }
  });

  it("accepts an explicit eligible model override only when the Agent allows it", async () => {
    const harness = await memoryHarness({
      allowModelOverride: true,
      includeOtherModel: true,
    });
    try {
      expect(await harness.service.resolveAndPersist({
        ...selectionInput(harness),
        request: {
          ...selectionInput(harness).request,
          requestedModelId: "model.other",
        },
        liveModels: [live("model.default"), live("model.other")],
      })).toMatchObject({
        ok: true,
        replayed: false,
        value: {
          requestedModelId: "model.other",
          resolvedModelLock: { capabilityId: "model.other" },
        },
      });
    } finally {
      await harness.cleanup();
    }
  });

  it("produces the same selection digest from the same exact facts", async () => {
    const first = await memoryHarness();
    const second = await memoryHarness();
    try {
      const firstResult = await first.service.resolveAndPersist(selectionInput(first));
      const secondResult = await second.service.resolveAndPersist(selectionInput(second));
      expect(firstResult.ok && secondResult.ok).toBe(true);
      if (firstResult.ok && secondResult.ok) {
        expect(secondResult.value.selectionDigest).toBe(firstResult.value.selectionDigest);
      }
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });

  it("fails closed when Memory or SQLite receives a Selection without its exact Locks", async () => {
    const sourceHarness = await memoryHarness();
    try {
      const selected = await sourceHarness.service.resolveAndPersist(selectionInput(sourceHarness));
      expect(selected.ok).toBe(true);
      if (!selected.ok) return;

      const memory = new InMemoryTaskPersistence(new FakeClock(at));
      await memory.start();
      try {
        await memory.createTask(initialPersistedTask());
        expect(await memory.commitTaskRuntimeSelection(selected.value)).toMatchObject({
          ok: false,
          error: { code: "persistence.runtime_selection_reference_missing" },
        });
      } finally {
        await memory.stop();
      }

      const directory = await mkdtemp(join(tmpdir(), "robothree-dcf11b-missing-lock-"));
      const sqlite = new SqliteTaskPersistence({
        databasePath: join(directory, "robothree.sqlite"),
        clock: new FakeClock(at),
      });
      await sqlite.start();
      try {
        await sqlite.createTask(initialPersistedTask());
        expect(await sqlite.commitTaskRuntimeSelection(selected.value)).toMatchObject({
          ok: false,
          error: { code: "persistence.runtime_selection_reference_missing" },
        });
      } finally {
        await sqlite.stop();
        await rm(directory, { recursive: true, force: true });
      }
    } finally {
      await sourceHarness.cleanup();
    }
  });

  it("recovers exact Selection and Locks after SQLite close/reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf11b-"));
    const databasePath = join(directory, "robothree.sqlite");
    const first = await sqliteHarness(databasePath);
    try {
      expect(await first.service.resolveAndPersist(selectionInput(first)))
        .toMatchObject({ ok: true, replayed: false });
      const digestBefore = (await first.persistence.loadTaskRuntimeSelection(
        persistenceIds.task,
      ))?.selectionDigest;
      await first.cleanup();
      const second = await sqliteHarness(databasePath, false);
      try {
        expect(await second.service.resolveAndPersist(selectionInput(second)))
          .toMatchObject({
            ok: true,
            replayed: true,
            value: { selectionDigest: digestBefore },
          });
        expect(await second.persistence.listTaskCapabilityLocks(persistenceIds.task))
          .toHaveLength(2);
      } finally {
        await second.cleanup();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("projects eligible Models without exposing Registry infrastructure", async () => {
    const fixture = runtimeFixture({ includeOtherModel: true });
    const catalog = new InMemoryTrustedRuntimeCatalog()
      .registerAgent(fixture.agent);
    for (const model of fixture.models) catalog.registerModel(model);
    const projections = new RuntimeCatalogProjectionService({
      agents: catalog,
      models: catalog,
      eligibility: new ModelEligibilityEvaluator(),
    });
    const [agent] = await projections.listAgents([
      live("model.default"),
      live("model.other"),
    ]);
    expect(agent).toMatchObject({
      agentId: "agent.general",
      defaultModelId: "model.default",
      runnable: true,
      eligibleModels: [{ modelId: "model.default" }],
    });
    expect(agent?.eligibleModels).toHaveLength(1);
    expect(JSON.stringify(agent)).not.toMatch(/binding|adapterDescriptor|credential|registryRevision|runtimeHandle/u);
  });

  it("prepares one atomic bundle with a personal model lock and enterprise Tool lock", async () => {
    const fixture = runtimeFixture({ allowModelOverride: true, minimumContextWindow: 0 });
    const taskPersistence = new InMemoryTaskPersistence(new FakeClock(at));
    const workspace = new InMemoryDesktopFoundationPersistence({ clock: new FakeClock(at) });
    const credentials = new InMemoryPersonalCredentialStore();
    await taskPersistence.start();
    await workspace.start();
    await credentials.start();
    const personal = personalSelectionFixture();
    const secret = new TextEncoder().encode("test-only-runtime-selection-key");
    try {
      expect(await credentials.store(
        personal.operationId,
        personal.definition.credentialRef,
        secret,
      )).toMatchObject({ ok: true });
      const trusted = new InMemoryTrustedRuntimeCatalog().registerAgent(fixture.agent);
      for (const model of fixture.models) trusted.registerModel(model);
      const locks = new TaskCapabilityLockService({
        resolver: new CapabilityResolver(fixture.registry),
        persistence: taskPersistence,
        clock: new FakeClock(at),
        idGenerator: new FakeIdGenerator([]),
      });
      const personalPersistence = {
        async listActiveHeads() {
          return {
            ok: true as const,
            replayed: false,
            value: { heads: [personal.head], queryRevision: digest("8") },
          };
        },
        async loadHead() { return personal.head; },
        async loadDefinition() { return personal.definition; },
        async loadStatus() { return personal.status; },
        async loadActiveOwnerNamespace() { return personal.namespace; },
      } as unknown as PersonalModelPersistence;
      const service = new RuntimeSelectionService({
        agents: trusted,
        models: trusted,
        tasks: taskPersistence,
        workspaces: workspace,
        locks,
        eligibility: new ModelEligibilityEvaluator(),
        clock: new FakeClock(at),
        ids: new FakeIdGenerator([]),
        compositeCatalog: new CompositeTrustedModelCatalog({
          enterprise: trusted,
          personal: personalPersistence,
          credentials,
        }),
        selectionIntent: new ModelSelectionIntentResolver(),
        modelLockPlanner: new CompositeModelTaskLockPlanner({
          enterprise: locks,
          personal: personalPersistence,
          tasks: taskPersistence,
        }),
      });
      const result = await service.prepareForTaskBundle({
        taskId: persistenceIds.task,
        request: {
          agentId: fixture.agent.agentDefinitionId,
          requestedModelId: personal.definition.personalModelId,
          selectedSkillIds: ["skill.claude"],
          selectedKnowledgeIds: ["knowledge.general"],
        },
        registryRevision: fixture.registry.registryRevision,
        liveModels: [live("model.default")],
        platformPromptRevision: digest("9"),
        runtimeSelectionId: "019f8f00-0000-7000-8000-000000000020",
        capabilityLockIds: [
          "019f8f00-0000-7000-8000-000000000021",
          "019f8f00-0000-7000-8000-000000000022",
        ],
        createdAt: at,
        personalOwnerAuthority: personal.authority,
      });
      expect(result).toMatchObject({
        ok: true,
        value: {
          selection: {
            requestedModelId: personal.definition.personalModelId,
            resolvedModelLock: { capabilityId: personal.definition.personalModelId },
            toolLocks: [{ capabilityId: "tool.echo" }],
          },
        },
      });
      if (result.ok) {
        expect(new Set(result.value.capabilityLocks.map((lock) => lock.registryRevision)))
          .toEqual(new Set([fixture.registry.registryRevision]));
        expect(result.value.capabilityLocks[0]?.bindingSnapshot.configurationRef)
          .toMatch(/^pmcfg1:/u);
      }
    } finally {
      secret.fill(0);
      await credentials.stop();
      await workspace.stop();
      await taskPersistence.stop();
    }
  });
});

async function memoryHarness(options: RuntimeFixtureOptions = {}) {
  const persistence = new InMemoryTaskPersistence({
    clock: new FakeClock(at),
  });
  await persistence.start();
  return createHarness(
    persistence,
    async () => persistence.stop(),
    true,
    runtimeFixture(options),
  );
}

async function sqliteHarness(databasePath: string, seed = true) {
  const persistence = new SqliteTaskPersistence({
    databasePath,
    clock: new FakeClock(at),
  });
  await persistence.start();
  return createHarness(persistence, async () => persistence.stop(), seed, runtimeFixture());
}

async function createHarness(
  persistence: TaskPersistence,
  stop: () => Promise<void>,
  seed: boolean,
  fixture: ReturnType<typeof runtimeFixture>,
) {
  if (seed) expect(await persistence.createTask(initialPersistedTask())).toMatchObject({ ok: true });
  const catalog = new InMemoryTrustedRuntimeCatalog()
    .registerAgent(fixture.agent);
  for (const model of fixture.models) catalog.registerModel(model);
  const workspace = new InMemoryDesktopFoundationPersistence({
    clock: new FakeClock(at),
  });
  await workspace.start();
  const resolver = new CapabilityResolver(fixture.registry);
  const locks = new TaskCapabilityLockService({
    resolver,
    persistence,
    clock: new FakeClock(at),
    idGenerator: new FakeIdGenerator([
      "019f8f00-0000-7000-8000-000000000010",
      "019f8f00-0000-7000-8000-000000000011",
    ]),
  });
  const service = new RuntimeSelectionService({
    agents: catalog,
    models: catalog,
    tasks: persistence,
    workspaces: workspace,
    locks,
    eligibility: new ModelEligibilityEvaluator(),
    clock: new FakeClock(at),
    ids: new FakeIdGenerator(["019f8f00-0000-7000-8000-000000000012"]),
  });
  return {
    fixture,
    persistence,
    service,
    async cleanup(stopWorkspace = true) {
      if (stopWorkspace) await workspace.stop();
      await stop();
    },
  };
}

function selectionInput(harness: Awaited<ReturnType<typeof memoryHarness>>) {
  return {
    taskId: persistenceIds.task,
    request: {
      agentId: "agent.general",
      selectedSkillIds: ["skill.claude"],
      selectedKnowledgeIds: ["knowledge.general"],
    },
    registryRevision: harness.fixture.registry.registryRevision,
    liveModels: [live("model.default")],
    platformPromptRevision: digest("9"),
  };
}

function live(modelId: string) {
  return {
    modelId,
    userAllowed: true,
    enabled: true,
    credentialAvailable: true,
    callable: true,
  };
}

type RuntimeFixtureOptions = {
  allowModelOverride?: boolean;
  includeOtherModel?: boolean;
  minimumContextWindow?: number;
};

function runtimeFixture(options: RuntimeFixtureOptions = {}) {
  const modelCapability = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.default",
    kind: "model",
    name: "Default",
    description: "Trusted default Model",
    source,
    model: {
      family: "fake",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 16_384,
      supportsStreaming: true,
    },
  });
  const toolCapability = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "tool.echo",
    kind: "tool",
    name: "Echo",
    description: "Trusted echo Tool",
    source,
    tool: {
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      readOnlyHint: true,
      risk: {
        schemaVersion: CONTRACT_VERSION,
        sourceRevision: "dcf11b.echo.v1",
        staticFacts: [],
      },
    },
  });
  const otherModelCapability = options.includeOtherModel
    ? createCapabilityDefinition({
      schemaVersion: CONTRACT_VERSION,
      capabilityId: "model.other",
      kind: "model",
      name: "Other",
      description: "Trusted explicit override Model",
      source,
      model: {
        family: "fake",
        inputModalities: ["text"],
        outputModalities: ["text"],
        contextWindow: 16_384,
        supportsStreaming: true,
      },
    })
    : undefined;
  const modelDescriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.fake",
    adapterKind: "model_provider",
    source,
    implementationRef: "core:fake-model",
    runtimeBoundary: "in_process",
    protocol: { name: "fake-model", version: "v1" },
  });
  const toolDescriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.tool.echo",
    adapterKind: "tool_execution_backend",
    source,
    implementationRef: "core:fake-tool",
    runtimeBoundary: "in_process",
    protocol: { name: "fake-tool", version: "v1" },
    effectRecoveryMode: "idempotent_retry",
  });
  const modelBinding = binding("binding.model.default", modelCapability, modelDescriptor, "model_provider");
  const otherModelBinding = otherModelCapability === undefined
    ? undefined
    : binding("binding.model.other", otherModelCapability, modelDescriptor, "model_provider");
  const toolBinding = binding("binding.tool.echo", toolCapability, toolDescriptor, "tool_execution_backend");
  const builder = new RegistryBuilder({ trustedSources: [source] })
    .registerCapability(modelCapability)
    .registerCapability(toolCapability)
    .registerAdapterDescriptor(modelDescriptor)
    .registerAdapterDescriptor(toolDescriptor)
    .registerBinding(modelBinding)
    .registerBinding(toolBinding);
  if (otherModelCapability !== undefined && otherModelBinding !== undefined) {
    builder
      .registerCapability(otherModelCapability)
      .registerBinding(otherModelBinding);
  }
  const registry = builder.finalize();
  const model = createModelDefinition({
    schemaVersion: "v1alpha1",
    modelId: "model.default",
    name: "Default",
    source: "official",
    capability: {
      capabilityId: modelCapability.capabilityId,
      capabilityRevision: modelCapability.revision,
    },
    capabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: true,
      supportsStreaming: true,
      contextWindow: 16_384,
    },
    createdAt: at,
  });
  const otherModel = otherModelCapability === undefined
    ? undefined
    : createModelDefinition({
      schemaVersion: "v1alpha1",
      modelId: "model.other",
      name: "Other",
      source: "official",
      capability: {
        capabilityId: otherModelCapability.capabilityId,
        capabilityRevision: otherModelCapability.revision,
      },
      capabilities: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        supportsToolCalling: true,
        supportsStreaming: true,
        contextWindow: 16_384,
      },
      createdAt: at,
    });
  const agent = createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: "agent.general",
    name: "General",
    identity: "RoboThree Agent",
    goal: "Complete authorized work",
    instructions: "Use the locked capabilities.",
    defaultModelId: model.modelId,
    allowModelOverride: options.allowModelOverride ?? false,
    skillReferences: [{
      id: "skill.claude",
      revision: digest("1"),
      contentDigest: digest("2"),
      materializedRef: "skill://claude/general",
    }],
    toolReferences: [{
      capabilityId: toolCapability.capabilityId,
      capabilityRevision: toolCapability.revision,
    }],
    knowledgeReferences: [{
      id: "knowledge.general",
      revision: digest("3"),
      contentDigest: digest("4"),
      materializedRef: "knowledge://general",
    }],
    requiredModelCapabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: true,
      supportsStreaming: true,
      ...(options.minimumContextWindow === 0
        ? {}
        : { minimumContextWindow: options.minimumContextWindow ?? 8_192 }),
    },
    createdAt: at,
  });
  return {
    agent,
    model,
    models: otherModel === undefined ? [model] : [model, otherModel],
    registry,
  };
}

function personalSelectionFixture() {
  const operationId = "019f7447-a784-77b2-a716-000000000031";
  const namespace = createPersonalModelOwnerNamespace({
    namespaceRevision: 1,
    namespaceKey: Buffer.alloc(32, 7),
    createdAt: at,
  });
  const owner = derivePersonalModelOwnerIdentity(namespace, {
    enterpriseId: "enterprise.one",
    userId: "user.one",
    deviceId: "device.one",
  });
  const credentialRef = allocatePersonalCredentialReference(Buffer.alloc(32, 9));
  const definition = createPersonalModelDefinition({
    ownerIdentity: owner,
    personalModelId: "model.personal.deepseek",
    providerKind: "deepseek",
    providerProfileRevision: new PersonalModelProviderProfileRegistry()
      .resolve("deepseek").profileRevision,
    protocol: "openai_compatible",
    endpoint: "https://api.example.com/v1",
    providerModelId: "deepseek-chat",
    displayName: "Personal DeepSeek",
    capabilities: ["text", "streaming", "tool_calling"],
    credentialRef,
    credentialRevision: 1,
    credentialBindingDigest: calculateCredentialBindingDigest({
      credentialRef,
      createdByOperationId: operationId,
      credentialRevision: 1,
    }),
    createdAt: at,
  });
  const head = createPersonalModelHead({
    ownerScopeNamespaceRevision: owner.ownerScopeNamespaceRevision,
    ownerScopeDigest: owner.ownerScopeDigest,
    personalModelId: definition.personalModelId,
    currentConfigurationRevision: definition.configurationRevision,
    currentExecutionDefinitionDigest: definition.executionDefinitionDigest,
    headRevision: 1,
    selectionState: "active",
    updatedAt: at,
  });
  const status = createPersonalModelStatusFact({
    ownerScopeNamespaceRevision: owner.ownerScopeNamespaceRevision,
    ownerScopeDigest: owner.ownerScopeDigest,
    personalModelId: definition.personalModelId,
    configurationRevision: definition.configurationRevision,
    executionDefinitionDigest: definition.executionDefinitionDigest,
    statusRevision: 1,
    status: "available",
    statusOrigin: "provider_observation",
    updatedAt: at,
  });
  return {
    operationId,
    namespace,
    definition,
    head,
    status,
    authority: {
      ownerIdentity: owner,
      authoritySource: "runtime_active_enterprise_identity" as const,
      entitlement: "personal_model.configure" as const,
      entitlementRevision: digest("7"),
      offlineState: "enterprise_temporarily_unavailable" as const,
    },
  };
}

function binding(
  bindingId: string,
  definition: ReturnType<typeof createCapabilityDefinition>,
  descriptor: ReturnType<typeof createAdapterDescriptor>,
  port: "model_provider" | "tool_execution_backend",
) {
  return createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId,
    capability: {
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port,
    source,
  });
}
