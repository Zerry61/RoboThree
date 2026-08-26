import { describe, expect, it } from "vitest";

import {
  CONTRACT_VERSION,
  type AgentDefinitionRevision,
  type RegistrySnapshot,
} from "@robothree/contracts";

import {
  CatalogQueryError,
  FrozenRegistrySnapshotProvider,
  FrozenRuntimeSelectionContextProvider,
  HmacCatalogCursorCodec,
  InMemoryTrustedRuntimeCatalog,
  ModelEligibilityEvaluator,
  RegistryBuilder,
  RobotCatalogQueryService,
  ToolCatalogQueryService,
  createAdapterDescriptor,
  createAgentDefinitionRevision,
  createCapabilityBinding,
  createCapabilityDefinition,
  createModelDefinition,
} from "../src/index.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const createdAt = "2026-08-24T00:00:00.000Z";
const metadata = {
  contractVersion: "v1alpha2" as const,
  queryId: "019f7447-a784-77b2-a716-000000003a11",
  correlationId: "019f7447-a784-77b2-a716-000000003a12",
  clientInstanceId: "019f7447-a784-77b2-a716-000000003a13",
};
const source = {
  trust: "official" as const,
  packageId: "robothree.official.catalog-fixture",
  packageRevision: digest("a"),
};

function registryFixture(): Readonly<{
  snapshot: RegistrySnapshot;
  tool: ReturnType<typeof createCapabilityDefinition> & { kind: "tool" };
  bindingId: string;
  adapterDescriptorId: string;
}> {
  const tool = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "tool.catalog_fixture",
    kind: "tool",
    name: "Catalog fixture tool",
    description: "A safe cross-consumer Tool fixture.",
    source,
    tool: {
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      readOnlyHint: true,
      risk: {
        schemaVersion: CONTRACT_VERSION,
        sourceRevision: "catalog-fixture.v1",
        staticFacts: ["routine_file"],
      },
    },
  });
  if (tool.kind !== "tool") throw new Error("fixture requires a Tool definition");
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.tool.catalog-fixture",
    adapterKind: "tool_execution_backend",
    source,
    implementationRef: "core:catalog-fixture",
    runtimeBoundary: "in_process",
    protocol: { name: "robothree-tool", version: "v1alpha1" },
    effectRecoveryMode: "idempotent_retry",
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.tool.catalog-fixture",
    capability: {
      capabilityId: tool.capabilityId,
      capabilityRevision: tool.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "tool_execution_backend",
    source,
  });
  const snapshot = new RegistryBuilder({ trustedSources: [source] })
    .registerCapability(tool)
    .registerBinding(binding)
    .registerAdapterDescriptor(descriptor)
    .finalize();
  return {
    snapshot,
    tool,
    bindingId: binding.bindingId,
    adapterDescriptorId: descriptor.adapterDescriptorId,
  };
}

function modelFixture() {
  return createModelDefinition({
    schemaVersion: "v1alpha1",
    modelId: "model.catalog_fixture",
    name: "Catalog model",
    source: "official",
    capability: {
      capabilityId: "model.catalog_fixture",
      capabilityRevision: digest("c"),
    },
    capabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: true,
      supportsStreaming: true,
      contextWindow: 32_768,
    },
    createdAt,
  });
}

function agentFixture(
  id: string,
  name: string,
  toolRevision: string,
): AgentDefinitionRevision {
  return createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: id,
    name,
    identity: "Safe catalog identity",
    goal: "Help the user with a bounded catalog task.",
    instructions: "SENSITIVE_SYSTEM_PROMPT_MUST_NOT_ENTER_CATALOG",
    defaultModelId: "model.catalog_fixture",
    allowModelOverride: false,
    skillReferences: [],
    toolReferences: [{
      capabilityId: "tool.catalog_fixture",
      capabilityRevision: toolRevision as `sha256:${string}`,
    }],
    knowledgeReferences: [],
    requiredModelCapabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: true,
      supportsStreaming: true,
    },
    createdAt,
  });
}

function context(
  fixture: ReturnType<typeof registryFixture>,
  mode: "available" | "disabled" | "unknown" = "available",
) {
  return new FrozenRuntimeSelectionContextProvider({
    registryRevision: fixture.snapshot.registryRevision,
    platformPromptRevision: digest("d"),
    liveModels: [{
      modelId: "model.catalog_fixture",
      userAllowed: true,
      enabled: true,
      credentialAvailable: true,
      callable: true,
    }],
    ...(mode === "unknown"
      ? {}
      : {
        capabilityAvailability: {
          [fixture.tool.capabilityId]: {
            capabilityId: fixture.tool.capabilityId,
            bindingId: fixture.bindingId,
            adapterDescriptorId: fixture.adapterDescriptorId,
            credentialStatus: "available" as const,
            healthStatus: "healthy" as const,
            ...(mode === "disabled" ? { disabled: true } : {}),
          },
        },
      }),
  });
}

function cursorCodec() {
  return new HmacCatalogCursorCodec(new Uint8Array(32).fill(7));
}

describe("DFI-3A.1 Robot Catalog Query", () => {
  it("projects stable sorted pages, exact restriction semantics, and safe details", async () => {
    const registry = registryFixture();
    const models = new InMemoryTrustedRuntimeCatalog().registerModel(modelFixture());
    const catalog = models
      .registerAgent(agentFixture("agent:zeta", "Zeta robot", registry.tool.revision))
      .registerAgent(agentFixture("agent:alpha", "Alpha robot", registry.tool.revision));
    const service = new RobotCatalogQueryService({
      agents: catalog,
      models: catalog,
      registries: new FrozenRegistrySnapshotProvider(registry.snapshot),
      contexts: context(registry),
      eligibility: new ModelEligibilityEvaluator(),
      cursors: cursorCodec(),
    });

    const first = await service.list({
      ...metadata,
      type: "list_robot_catalog",
      limit: 1,
    });
    expect(first.items.map((item) => item.robotId)).toEqual(["agent:alpha"]);
    expect(first.items[0]?.restrictionSummary).toEqual({
      models: "restricted_nonempty",
      skills: "restricted_empty",
      tools: "restricted_nonempty",
      knowledge: "restricted_empty",
    });
    expect(first.nextCursor).toMatch(/^r3cat1\./u);

    const second = await service.list({
      ...metadata,
      type: "list_robot_catalog",
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(second.items.map((item) => item.robotId)).toEqual(["agent:zeta"]);
    expect(second.queryRevision).toBe(first.queryRevision);
    expect(second.nextCursor).toBeUndefined();

    const detail = await service.get({
      ...metadata,
      type: "get_robot_catalog",
      robotId: "agent:alpha",
    });
    expect(detail.source).toBe("local_trusted");
    expect(detail.defaultModel.availability).toBe("available");
    expect(detail.tools[0]).toMatchObject({
      resourceId: "tool.catalog_fixture",
      revision: registry.tool.revision,
      availability: "available",
    });
    expect(JSON.stringify(detail)).not.toContain("SENSITIVE_SYSTEM_PROMPT");
    expect(JSON.stringify(detail)).not.toContain("implementationRef");
    expect(JSON.stringify(detail)).not.toContain("credentialRef");
  });

  it("rejects stale cursors after the active Robot set changes", async () => {
    const registry = registryFixture();
    const initial = new InMemoryTrustedRuntimeCatalog()
      .registerModel(modelFixture())
      .registerAgent(agentFixture("agent:alpha", "Alpha", registry.tool.revision))
      .registerAgent(agentFixture("agent:zeta", "Zeta", registry.tool.revision));
    const firstService = new RobotCatalogQueryService({
      agents: initial,
      models: initial,
      registries: new FrozenRegistrySnapshotProvider(registry.snapshot),
      contexts: context(registry),
      eligibility: new ModelEligibilityEvaluator(),
      cursors: cursorCodec(),
    });
    const first = await firstService.list({
      ...metadata,
      type: "list_robot_catalog",
      limit: 1,
    });

    const changed = new InMemoryTrustedRuntimeCatalog()
      .registerModel(modelFixture())
      .registerAgent(agentFixture("agent:alpha", "Alpha changed", registry.tool.revision))
      .registerAgent(agentFixture("agent:zeta", "Zeta", registry.tool.revision));
    const changedService = new RobotCatalogQueryService({
      agents: changed,
      models: changed,
      registries: new FrozenRegistrySnapshotProvider(registry.snapshot),
      contexts: context(registry),
      eligibility: new ModelEligibilityEvaluator(),
      cursors: cursorCodec(),
    });
    await expect(changedService.list({
      ...metadata,
      type: "list_robot_catalog",
      limit: 1,
      cursor: first.nextCursor,
    })).rejects.toMatchObject({ code: "catalog.stale_cursor" });
  });

  it("does not invent a Model revision when the referenced Model is missing", async () => {
    const registry = registryFixture();
    const catalog = new InMemoryTrustedRuntimeCatalog()
      .registerAgent(agentFixture("agent:missing-model", "Missing model", registry.tool.revision));
    const service = new RobotCatalogQueryService({
      agents: catalog,
      models: catalog,
      registries: new FrozenRegistrySnapshotProvider(registry.snapshot),
      contexts: context(registry),
      eligibility: new ModelEligibilityEvaluator(),
      cursors: cursorCodec(),
    });
    const detail = await service.get({
      ...metadata,
      type: "get_robot_catalog",
      robotId: "agent:missing-model",
    });
    expect(detail.runnable).toBe(false);
    expect(detail.defaultModel).toEqual({
      resourceId: "model.catalog_fixture",
      displayName: "model.catalog_fixture",
      availability: "unavailable",
      unavailableReason: "catalog.model_unavailable",
    });
  });
});

describe("DFI-3A.1 Tool Catalog Query", () => {
  it("projects exact Tool identity/revision/readOnly/risk and explicit availability", async () => {
    const registry = registryFixture();
    const service = new ToolCatalogQueryService({
      registries: new FrozenRegistrySnapshotProvider(registry.snapshot),
      contexts: context(registry),
      cursors: cursorCodec(),
    });
    const page = await service.list({ ...metadata, type: "list_tool_catalog" });
    expect(page.items).toEqual([expect.objectContaining({
      toolId: "tool.catalog_fixture",
      capabilityRevision: registry.tool.revision,
      registryRevision: registry.snapshot.registryRevision,
      source: "official_package",
      readOnly: true,
      riskSummary: ["routine_file"],
      availability: "available",
    })]);
    const detail = await service.get({
      ...metadata,
      type: "get_tool_catalog",
      toolId: "tool.catalog_fixture",
    });
    expect(detail).toMatchObject({
      inputShape: "structured_object",
      outputShape: "structured_object",
    });
    expect(JSON.stringify(detail)).not.toContain("binding.tool");
    expect(JSON.stringify(detail)).not.toContain("adapter.tool");
    expect(JSON.stringify(detail)).not.toContain("inputSchema");
  });

  it("does not default missing facts to healthy and only narrows explicit denial", async () => {
    const registry = registryFixture();
    const unknown = new ToolCatalogQueryService({
      registries: new FrozenRegistrySnapshotProvider(registry.snapshot),
      contexts: context(registry, "unknown"),
      cursors: cursorCodec(),
    });
    expect((await unknown.list({ ...metadata, type: "list_tool_catalog" })).items[0])
      .toMatchObject({
        availability: "unknown",
        unavailableReason: "catalog.availability_unknown",
      });

    const disabled = new ToolCatalogQueryService({
      registries: new FrozenRegistrySnapshotProvider(registry.snapshot),
      contexts: context(registry, "disabled"),
      cursors: cursorCodec(),
    });
    expect((await disabled.list({ ...metadata, type: "list_tool_catalog" })).items[0])
      .toMatchObject({
        availability: "unavailable",
        unavailableReason: "catalog.disabled",
      });
  });

  it("fails the whole query when the Registry revision is corrupted", async () => {
    const registry = registryFixture();
    const corrupted = structuredClone(registry.snapshot);
    corrupted.agentVisibleCapabilities.tools[0]!.description = "tampered";
    const service = new ToolCatalogQueryService({
      registries: new FrozenRegistrySnapshotProvider(corrupted),
      contexts: context(registry),
      cursors: cursorCodec(),
    });
    await expect(service.list({ ...metadata, type: "list_tool_catalog" }))
      .rejects.toBeInstanceOf(CatalogQueryError);
    await expect(service.list({ ...metadata, type: "list_tool_catalog" }))
      .rejects.toMatchObject({ code: "catalog.integrity_violation" });
  });
});
