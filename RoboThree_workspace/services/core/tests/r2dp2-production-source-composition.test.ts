import { describe, expect, it } from "vitest";

import {
  BUILT_IN_GENERAL_AGENT_REVISION,
  BuiltInGeneralAgentSource,
  LocalDesktopR2DResourceLeaseRegistry,
  LocalDesktopR2DSubjectBindingAuthority,
  LocalDesktopR2DSubjectProofRegistry,
  LocalDesktopTaskResourceEntitlementSource,
  PersonalModelProviderProfileRegistry,
  R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED,
  calculateCredentialBindingDigest,
  createLocalDesktopR2DProductionComposition,
  createPersonalModelDefinition,
  createPersonalModelHead,
  createPersonalModelOwnerNamespace,
  createPersonalModelPreference,
  createPersonalModelStatusFact,
  deriveLocalDesktopSubjectAuthority,
} from "../src/index.js";
import type { LocalDesktopR2DProductionError } from "../src/index.js";
import type { PersonalModelPersistence } from
  "../src/ports/personal-model-persistence.js";
import type { PersonalCredentialStore } from
  "../src/ports/personal-credential-store.js";

const at = "2026-08-28T00:00:00.000Z";
const runtimeDigest = digest("1");
const clientDigest = digest("2");

describe("R2D-P.2 production source and composition", () => {
  it("keeps production consumption disabled and fails closed when enabled incomplete", () => {
    expect(R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED).toBe(false);
    expect(createLocalDesktopR2DProductionComposition({ enabled: false })).toEqual({
      enabled: false,
    });
    expect(() => createLocalDesktopR2DProductionComposition({ enabled: true }))
      .toThrowError("selection.production_graph_incomplete");
  });

  it("constructs one complete but explicitly test-enabled production graph", () => {
    const fixture = localFixture();
    const composition = createLocalDesktopR2DProductionComposition({
      enabled: true,
      dependencies: {
        clock: { now: () => at },
        ids: { next: () => uuid(30) },
        sessionBindingVerifier: {
          async verifyExact() {
            return {
              verifiedRuntimeSubjectBindingDigest: runtimeDigest,
              acceptedClientBindingDigest: clientDigest,
            };
          },
        },
        persistence: fixture.persistence,
        credentials: fixture.credentials,
        async captureBaseRegistrySnapshot() { return emptyRegistry(); },
        async captureWorkspacePermissions() {
          return {
            schemaVersion: "v1",
            factsDigest: digest("5"),
            models: [], skills: [], tools: [], knowledge: [],
          };
        },
        async prepareToolLocks() { return []; },
        toolPolicy: { async resolveExact() { throw new Error("not invoked"); } },
        reasoningPlanner: { async plan() { throw new Error("not invoked"); } } as never,
        authorizationPolicies: {
          async loadSnapshot() { throw new Error("not invoked"); },
        },
      },
    });
    expect(composition.enabled).toBe(true);
    if (!composition.enabled) return;
    expect(composition.planner).toBeDefined();
    expect(composition.authority).toBeDefined();
    expect(composition.entitlements).toBeDefined();
  });

  it("uses a one-shot subject proof and projects an exact local entitlement", async () => {
    const fixture = localFixture();
    const proofs = new LocalDesktopR2DSubjectProofRegistry();
    const leases = new LocalDesktopR2DResourceLeaseRegistry();
    const ids = [uuid(10)];
    const subject = new LocalDesktopR2DSubjectBindingAuthority({
      clock: { now: () => at },
      ids: { next: () => ids.shift()! },
      verifier: {
        async verifyExact() {
          return {
            verifiedRuntimeSubjectBindingDigest: runtimeDigest,
            acceptedClientBindingDigest: clientDigest,
          };
        },
      },
      proofs,
    });
    const binding = await subject.capture({
      desktopSessionId: uuid(1),
      internalSessionId: uuid(2),
    });
    const source = new LocalDesktopTaskResourceEntitlementSource({
      clock: { now: () => at },
      persistence: fixture.persistence,
      credentials: fixture.credentials,
      proofs,
      leases,
      builtInAgent: new BuiltInGeneralAgentSource(),
      async captureBaseRegistrySnapshot() {
        return emptyRegistry();
      },
    });
    const input = {
      ...binding,
      requestedAgentRef: {
        agentDefinitionId: "agent.general",
        revision: BUILT_IN_GENERAL_AGENT_REVISION,
        digest: BUILT_IN_GENERAL_AGENT_REVISION,
      },
    };
    const snapshot = await source.loadExact(input);
    expect(snapshot).toMatchObject({
      schemaVersion: "v2",
      subjectBindingDigest: runtimeDigest,
      authorityKind: "local_desktop_owner",
      models: [{ modelId: fixture.definition.personalModelId, stableOrdinal: 0 }],
      skills: [],
      tools: [],
      knowledge: [],
      identityEvidence: {
        localAuthorityReady: true,
        enterpriseIdentityReady: false,
        testIdentityUsed: false,
      },
    });
    expect(leases.get(binding.acceptanceLeaseId).registry.models[0]?.capabilities.contextWindow)
      .toEqual({ state: "unknown" });
    await expect(source.loadExact(input)).rejects.toMatchObject({
      code: "selection.subject_binding_invalid",
    });
  });

  it("fails closed when a captured head changes before return", async () => {
    const fixture = localFixture({ driftHead: true });
    const proofs = new LocalDesktopR2DSubjectProofRegistry();
    const binding = await new LocalDesktopR2DSubjectBindingAuthority({
      clock: { now: () => at },
      ids: { next: () => uuid(11) },
      verifier: {
        async verifyExact() {
          return {
            verifiedRuntimeSubjectBindingDigest: runtimeDigest,
            acceptedClientBindingDigest: clientDigest,
          };
        },
      },
      proofs,
    }).capture({ desktopSessionId: uuid(3), internalSessionId: uuid(4) });
    const source = new LocalDesktopTaskResourceEntitlementSource({
      clock: { now: () => at },
      persistence: fixture.persistence,
      credentials: fixture.credentials,
      proofs,
      leases: new LocalDesktopR2DResourceLeaseRegistry(),
      builtInAgent: new BuiltInGeneralAgentSource(),
      async captureBaseRegistrySnapshot() { return emptyRegistry(); },
    });
    await expect(source.loadExact({
      ...binding,
      requestedAgentRef: {
        agentDefinitionId: "agent.general",
        revision: BUILT_IN_GENERAL_AGENT_REVISION,
        digest: BUILT_IN_GENERAL_AGENT_REVISION,
      },
    })).rejects.toEqual(expect.objectContaining<Partial<LocalDesktopR2DProductionError>>({
      code: "selection.entitlement_stale",
    }));
  });
});

function localFixture(options: { driftHead?: boolean } = {}) {
  const namespace = createPersonalModelOwnerNamespace({
    namespaceRevision: 1,
    namespaceKey: new Uint8Array(32).fill(9),
    createdAt: at,
  });
  const authority = deriveLocalDesktopSubjectAuthority(namespace);
  const profile = new PersonalModelProviderProfileRegistry().resolve("custom");
  const credentialRef = `pmcr1.${"A".repeat(43)}`;
  const operationId = uuid(20);
  const credentialBindingDigest = calculateCredentialBindingDigest({
    credentialRef,
    createdByOperationId: operationId,
    credentialRevision: 1,
  });
  const definition = createPersonalModelDefinition({
    ownerIdentity: {
      ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
      ownerScopeDigest: authority.ownerScopeDigest,
    },
    personalModelId: "model.personal.local-openai",
    providerKind: "custom",
    providerProfileRevision: profile.profileRevision,
    protocol: "openai_compatible",
    endpoint: "https://api.openai.com/v1",
    providerModelId: "gpt-5.2-2025-12-11",
    displayName: "Local OpenAI",
    capabilities: ["text", "streaming", "tool_calling"],
    credentialRef,
    credentialRevision: 1,
    credentialBindingDigest,
    createdAt: at,
  });
  const head = createPersonalModelHead({
    ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
    ownerScopeDigest: authority.ownerScopeDigest,
    personalModelId: definition.personalModelId,
    currentConfigurationRevision: definition.configurationRevision,
    currentExecutionDefinitionDigest: definition.executionDefinitionDigest,
    headRevision: 1,
    selectionState: "active",
    updatedAt: at,
  });
  const status = createPersonalModelStatusFact({
    ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
    ownerScopeDigest: authority.ownerScopeDigest,
    personalModelId: definition.personalModelId,
    configurationRevision: definition.configurationRevision,
    executionDefinitionDigest: definition.executionDefinitionDigest,
    statusRevision: 1,
    status: "available",
    statusOrigin: "initialized",
    updatedAt: at,
  });
  const preference = createPersonalModelPreference({
    ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
    ownerScopeDigest: authority.ownerScopeDigest,
    modelSource: "personal",
    modelId: definition.personalModelId,
    configurationRevision: definition.configurationRevision,
    preferenceRevision: 1,
    updatedAt: at,
  });
  let headReads = 0;
  const persistence = {
    async loadActiveOwnerNamespace() { return cloneNamespace(namespace); },
    async listActiveHeads() {
      return { ok: true, replayed: false, value: {
        heads: [head], queryRevision: digest("3"),
      } };
    },
    async loadDefinition() { return definition; },
    async loadStatus() { return status; },
    async loadPreference() { return preference; },
    async loadHead() {
      headReads += 1;
      return options.driftHead && headReads === 1
        ? { ...head, recordDigest: digest("f") }
        : head;
    },
  } as unknown as PersonalModelPersistence;
  const credentials = {
    async inspect() {
      return {
        state: "present" as const,
        credentialRef,
        createdByOperationId: operationId,
        credentialRevision: 1,
        credentialBindingDigest,
      };
    },
  } as unknown as PersonalCredentialStore;
  return { namespace, authority, definition, head, status, persistence, credentials };
}

function emptyRegistry() {
  return {
    schemaVersion: "v1" as const,
    registryRevision: digest("4"),
    models: [], skills: [], tools: [], knowledge: [], knowledgeProviderReady: false,
  };
}

function cloneNamespace<T extends { namespaceKey: Uint8Array }>(namespace: T): T {
  return { ...namespace, namespaceKey: Uint8Array.from(namespace.namespaceKey) };
}

function digest(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function uuid(value: number): string {
  return `019f7447-a784-77b2-a716-${value.toString().padStart(12, "0")}`;
}
