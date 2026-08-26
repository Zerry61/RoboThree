import { describe, expect, it } from "vitest";

import {
  CompositeTrustedModelCatalog,
  InMemoryPersonalCredentialStore,
  ModelSelectionIntentResolver,
  PersonalModelProviderProfileRegistry,
  UnifiedModelSelectionError,
  allocatePersonalCredentialReference,
  calculateCredentialBindingDigest,
  createAgentDefinitionRevision,
  createPersonalModelDefinition,
  createPersonalModelHead,
  createPersonalModelOwnerNamespace,
  createPersonalModelPreference,
  createPersonalModelStatusFact,
  derivePersonalModelOwnerIdentity,
  type PersonalModelPersistence,
  type TrustedModelRepository,
  type UnifiedModelCandidate,
} from "../src/index.js";

const digest = (value: string) => `sha256:${value.repeat(64)}` as const;
const at = "2026-08-22T06:00:00.000Z";

describe("DFI-4A.3.2 unified model selection", () => {
  const resolver = new ModelSelectionIntentResolver();

  it("keeps explicit selection Task-scoped and never turns it into a preference write", () => {
    const result = resolver.resolve({
      agent: agent(true),
      intent: { requestedModelId: "model.personal.one" },
      candidates: [enterprise("model.enterprise.one", 0), personal("model.personal.one", digest("1"))],
    });
    expect(result).toMatchObject({
      selectionSource: "explicit",
      normalizedRequestedModelId: "model.personal.one",
      preferenceMutation: "requires_explicit_safe_command",
    });
  });

  it("uses an exact durable personal preference without claiming a user click", () => {
    const candidate = personal("model.personal.one", digest("1"));
    const result = resolver.resolve({
      agent: agent(true),
      intent: {},
      preference: createPersonalModelPreference({
        ownerScopeNamespaceRevision: 1,
        ownerScopeDigest: digest("a"),
        modelSource: "personal",
        modelId: candidate.modelId,
        configurationRevision: candidate.exactRevision,
        preferenceRevision: 1,
        updatedAt: at,
      }),
      candidates: [candidate],
    });
    expect(result).toMatchObject({
      selectionSource: "user_preference",
      normalizedRequestedModelId: "model.personal.one",
      preferenceMutation: "none",
    });
  });

  it("does not rewrite stale preference and falls through to Agent default", () => {
    const result = resolver.resolve({
      agent: agent(true),
      intent: {},
      preference: createPersonalModelPreference({
        ownerScopeNamespaceRevision: 1,
        ownerScopeDigest: digest("a"),
        modelSource: "personal",
        modelId: "model.personal.one",
        configurationRevision: digest("9"),
        preferenceRevision: 1,
        updatedAt: at,
      }),
      candidates: [
        enterprise("model.enterprise.default", 0),
        personal("model.personal.one", digest("1")),
      ],
    });
    expect(result).toMatchObject({
      selectionSource: "agent_default",
      safeReasonCode: "personal_model.preference_stale",
      preferenceMutation: "none",
    });
  });

  it("preserves Central ordering and never auto-selects the first personal model", () => {
    const first = resolver.resolve({
      agent: agent(true, "model.unavailable.default"),
      intent: {},
      candidates: [
        enterprise("model.enterprise.second", 1),
        enterprise("model.enterprise.first", 0),
      ],
    });
    expect(first).toMatchObject({
      selectionSource: "enterprise_first",
      normalizedRequestedModelId: "model.enterprise.first",
    });
    expect(() => resolver.resolve({
      agent: agent(true, "model.unavailable.default"),
      intent: {},
      candidates: [personal("model.personal.one", digest("1"))],
    })).toThrowError(expect.objectContaining({
      code: "personal_model.explicit_selection_required",
    }));
  });

  it("fails closed for unknown context window when a minimum is required", () => {
    expect(() => resolver.resolve({
      agent: agent(true),
      intent: { requestedModelId: "model.personal.one" },
      candidates: [personal("model.personal.one", digest("1"))],
      inputRequirements: { minimumContextWindow: 8_192 },
    })).toThrowError(expect.objectContaining({ code: "model.context_window_unknown" }));
  });

  it("rejects cross-authority identity ambiguity and forbidden overrides", () => {
    expect(() => resolver.resolve({
      agent: agent(true),
      intent: {},
      candidates: [
        enterprise("model.same", 0),
        personal("model.same", digest("1")),
      ],
    })).toThrow(UnifiedModelSelectionError);
    expect(() => resolver.resolve({
      agent: agent(false),
      intent: { requestedModelId: "model.personal.one" },
      candidates: [personal("model.personal.one", digest("1"))],
    })).toThrowError(expect.objectContaining({ code: "selection.model_override_forbidden" }));
    expect(() => resolver.resolve({
      agent: agent(false),
      intent: { requestedModelId: "model.enterprise.default" },
      candidates: [enterprise("model.enterprise.default", 0)],
    })).toThrowError(expect.objectContaining({ code: "selection.model_override_forbidden" }));
  });

  it("projects only safe personal candidate facts and preserves the status-2 eligibility rule", async () => {
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
    const operationId = "019f7447-a784-77b2-a716-000000000001";
    const credentialRef = allocatePersonalCredentialReference(Buffer.alloc(32, 9));
    const definition = createPersonalModelDefinition({
      ownerIdentity: owner,
      personalModelId: "model.personal.one",
      providerKind: "deepseek",
      providerProfileRevision: new PersonalModelProviderProfileRegistry()
        .resolve("deepseek").profileRevision,
      protocol: "openai_compatible",
      endpoint: "https://private-provider.example.com/v1",
      providerModelId: "private-provider-model",
      displayName: "Personal One",
      capabilities: ["text", "streaming", "vision"],
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
      status: "network_failed",
      statusOrigin: "provider_observation",
      updatedAt: at,
    });
    const personal = {
      async listActiveHeads() {
        return { ok: true as const, replayed: false, value: { heads: [head], queryRevision: digest("c") } };
      },
      async loadDefinition() { return definition; },
      async loadStatus() { return status; },
    } as unknown as PersonalModelPersistence;
    const credentials = new InMemoryPersonalCredentialStore();
    await credentials.start();
    const secret = new TextEncoder().encode("test-only-candidate-key");
    try {
      expect(await credentials.store(operationId, credentialRef, secret)).toMatchObject({ ok: true });
      const catalog = new CompositeTrustedModelCatalog({
        enterprise: {
          async listModels() { return []; },
        } as unknown as TrustedModelRepository,
        personal,
        credentials,
      });
      const [candidate] = await catalog.list({
        ownerAuthority: {
          ownerIdentity: owner,
          authoritySource: "runtime_active_enterprise_identity",
          entitlement: "personal_model.configure",
          entitlementRevision: digest("d"),
          offlineState: "enterprise_temporarily_unavailable",
        },
        liveEnterpriseModels: [],
      });
      expect(candidate).toMatchObject({
        authority: "local_personal",
        modelId: definition.personalModelId,
        selectionState: "eligible",
        capabilityFacts: {
          inputModalities: ["text", "image"],
          outputModalities: ["text"],
          contextWindow: { state: "unknown" },
        },
      });
      const serialized = JSON.stringify(candidate);
      expect(serialized).not.toContain(definition.canonicalEndpoint);
      expect(serialized).not.toContain(definition.providerModelId);
      expect(serialized).not.toContain(definition.credentialRef);
      expect(serialized).not.toContain(owner.ownerScopeDigest);
    } finally {
      secret.fill(0);
      await credentials.stop();
    }
  });
});

function agent(allowModelOverride: boolean, defaultModelId = "model.enterprise.default") {
  return createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: "agent.default",
    name: "Default Agent",
    identity: "assistant",
    goal: "help",
    instructions: "Be useful",
    defaultModelId,
    allowModelOverride,
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
}

function enterprise(modelId: string, enterpriseOrder: number): UnifiedModelCandidate {
  return {
    authority: "central_enterprise",
    modelId,
    displayName: modelId,
    exactRevision: digest("e"),
    capabilityFacts: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: true,
      supportsStreaming: true,
      contextWindow: { state: "known", value: 32_768 },
    },
    selectionState: "eligible",
    enterpriseOrder,
  };
}

function personal(modelId: string, exactRevision: string): UnifiedModelCandidate {
  return {
    authority: "local_personal",
    modelId,
    displayName: modelId,
    exactRevision,
    capabilityFacts: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: true,
      supportsStreaming: true,
      contextWindow: { state: "unknown" },
    },
    selectionState: "eligible",
  };
}
