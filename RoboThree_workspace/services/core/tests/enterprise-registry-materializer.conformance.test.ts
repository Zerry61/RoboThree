import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EnterpriseResourceDescriptor } from "@robothree/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  ConfigurationActivationCoordinator,
  createAgentDefinitionRevision,
  EnterpriseRegistryMaterializer,
  FakeClock,
  InMemoryEnterpriseConfigurationPersistence,
  LocalExecutableEnterpriseCapabilityEvaluator,
  PersistenceEnterpriseRuntimeRegistrySource,
  SqliteEnterpriseConfigurationPersistence,
  type ActivatedEnterpriseConfiguration,
  type EnterpriseConfigurationPersistence,
  type EnterpriseIdentityScope,
  type EnterpriseRuntimeSessionVerifier,
} from "../src/index.js";
import {
  createEnterpriseConfigurationFixture,
  enterpriseScope,
  otherEnterpriseScope,
} from "./enterprise-configuration.fixtures.js";

const temporaryDirectories: string[] = [];
const openPersistences: EnterpriseConfigurationPersistence[] = [];

afterEach(async () => {
  for (const persistence of openPersistences.splice(0)) {
    await persistence.stop();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const persistenceVariants: readonly [
  string,
  () => EnterpriseConfigurationPersistence,
][] = [
  [
    "InMemory",
    () => new InMemoryEnterpriseConfigurationPersistence({
      clock: new FakeClock("2026-07-27T00:00:00.000Z"),
    }),
  ],
  [
    "SQLite",
    () => {
      const directory = mkdtempSync(
        join(tmpdir(), "robothree-enterprise-registry-"),
      );
      temporaryDirectories.push(directory);
      return new SqliteEnterpriseConfigurationPersistence({
        databasePath: join(directory, "enterprise-configuration.sqlite"),
        clock: new FakeClock("2026-07-27T00:00:00.000Z"),
      });
    },
  ],
];

describe.each(persistenceVariants)(
  "CGF-1.3A Enterprise Registry Materializer %s Conformance",
  (_name, createPersistence) => {
    it("builds one deterministic frozen Registry from the exact Storage Active generation", async () => {
      const persistence = await startPersistence(createPersistence());
      const fixture = runtimeFixture();
      await activate(persistence, fixture);
      const session = new FakeEnterpriseRuntimeSessionVerifier();
      const materializer = createMaterializer(persistence, session);

      const first = await materializer.materialize(enterpriseScope);
      const second = await materializer.materialize(enterpriseScope);

      expect(session.calls).toEqual([
        { scope: enterpriseScope, permission: "configuration.read" },
        { scope: enterpriseScope, permission: "configuration.read" },
      ]);
      expect(first.generation).toEqual(second.generation);
      expect(first.registrySnapshot.registryRevision).toBe(
        second.registrySnapshot.registryRevision,
      );
      expect(first.registeredCapabilityIds).toEqual([
        "model.local",
        "model.remote",
        "tool.local",
        "tool.remote",
      ]);
      expect(first.packages.map((item) => `${item.kind}:${item.packageId}`))
        .toEqual(["agent:agent.runtime", "skill:skill.runtime"]);
      expect(first.knowledge).toEqual([{
        knowledgeId: "knowledge.local",
        revision: digest(10),
        digest: digest(11),
        available: true,
        locallyExecutable: true,
      }]);
      expect(first.locallyExecutableCapabilityIds).toEqual([
        "model.local",
        "tool.local",
      ]);
      expect(first.availableDependencyIds).toEqual([
        "agent.runtime",
        "knowledge.local",
        "model.local",
        "model.remote",
        "skill.runtime",
        "tool.local",
        "tool.remote",
      ]);
      expect(first.locallyExecutableDependencyIds).toEqual([
        "knowledge.local",
        "model.local",
        "tool.local",
      ]);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.registrySnapshot)).toBe(true);
      expect(Object.isFrozen(
        first.registrySnapshot.infrastructureResources.adapterDescriptors,
      )).toBe(true);
      expect(JSON.stringify(
        first.registrySnapshot.agentVisibleCapabilities,
      )).not.toContain("gatewayEndpoint");
      expect(JSON.stringify(
        first.registrySnapshot.agentVisibleCapabilities,
      )).not.toContain("credential");

      const boundaries = new Map(
        first.registrySnapshot.infrastructureResources.adapterDescriptors
          .map((descriptor) => [
            descriptor.implementationRef,
            descriptor.runtimeBoundary,
          ]),
      );
      expect(boundaries.get("core:model.local")).toBe("in_process");
      expect(boundaries.get("local:tool.local")).toBe("child_process");
      expect([...boundaries.values()].filter((value) => value === "remote"))
        .toHaveLength(2);

      expect((await persistence.loadStatusEventsAfter(
        enterpriseScope,
        0,
      ))).toHaveLength(1);
      expect((await persistence.loadActive(enterpriseScope))
        ?.configuration.identity.candidateKey).toBe(
        first.generation.candidateKey,
      );
    });

    it("narrows disabled, revoked-by-permission and credential-unavailable resources", async () => {
      const persistence = await startPersistence(createPersistence());
      const fixture = createEnterpriseConfigurationFixture({
        marker: "narrow",
        models: [
          descriptor("model", "model.allowed", 20, {
            endpoint: "core:model.allowed",
            permissions: ["model.use"],
          }),
          descriptor("model", "model.disabled", 21, {
            enabled: false,
            permissions: ["model.use"],
          }),
        ],
        tools: [
          descriptor("tool", "tool.no-credential", 22, {
            credentialAvailable: false,
            permissions: ["tool.use"],
          }),
          descriptor("tool", "tool.permission-missing", 23, {
            permissions: ["tool.admin"],
          }),
        ],
        knowledge: [
          descriptor("knowledge", "knowledge.unavailable", 24, {
            unavailableReason: "provider unavailable",
            permissions: ["knowledge.use"],
          }),
        ],
        fixedPermissions: [
          "configuration.read",
          "model.use",
          "tool.use",
          "knowledge.use",
        ],
      });
      await activate(persistence, fixture);

      const result = await createMaterializer(
        persistence,
        new FakeEnterpriseRuntimeSessionVerifier(),
      ).materialize(enterpriseScope);

      expect(result.registeredCapabilityIds).toEqual(["model.allowed"]);
      expect(result.knowledge).toMatchObject([{
        knowledgeId: "knowledge.unavailable",
        available: false,
        locallyExecutable: false,
      }]);
      expect(result.availableDependencyIds).not.toContain(
        "knowledge.unavailable",
      );
      expect(result.registrySnapshot.infrastructureResources.capabilityBindings)
        .toHaveLength(1);
    });

    it("fails closed before Registry construction when the enterprise session is invalid", async () => {
      const persistence = await startPersistence(createPersistence());
      const fixture = runtimeFixture();
      await activate(persistence, fixture);
      const session = new FakeEnterpriseRuntimeSessionVerifier();
      session.reject = true;

      await expect(createMaterializer(persistence, session)
        .materialize(enterpriseScope)).rejects.toMatchObject({
        code: "enterprise_registry.session_invalid",
      });
    });

    it("fails closed when no exact Storage Active generation exists", async () => {
      const persistence = await startPersistence(createPersistence());

      await expect(createMaterializer(
        persistence,
        new FakeEnterpriseRuntimeSessionVerifier(),
      ).materialize(enterpriseScope)).rejects.toMatchObject({
        code: "enterprise_registry.active_generation_missing",
      });
    });
  },
);

describe("CGF-1.3A Enterprise Registry failure and offline decisions", () => {
  it("rebuilds the same Registry after the enterprise SQLite file is closed and reopened", async () => {
    const directory = mkdtempSync(
      join(tmpdir(), "robothree-enterprise-registry-reopen-"),
    );
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "enterprise-configuration.sqlite");
    const firstPersistence = await startPersistence(
      new SqliteEnterpriseConfigurationPersistence({
        databasePath,
        clock: new FakeClock("2026-07-27T00:00:00.000Z"),
      }),
    );
    await activate(firstPersistence, runtimeFixture());
    const before = await createMaterializer(
      firstPersistence,
      new FakeEnterpriseRuntimeSessionVerifier(),
    ).materialize(enterpriseScope);
    await firstPersistence.stop();
    forgetPersistence(firstPersistence);

    const reopened = await startPersistence(
      new SqliteEnterpriseConfigurationPersistence({
        databasePath,
        clock: new FakeClock("2026-07-27T00:02:00.000Z"),
      }),
    );
    const after = await createMaterializer(
      reopened,
      new FakeEnterpriseRuntimeSessionVerifier(),
    ).materialize(enterpriseScope);

    expect(after.generation).toEqual(before.generation);
    expect(after.storageActivatedAt).toBe(before.storageActivatedAt);
    expect(after.registrySnapshot.registryRevision).toBe(
      before.registrySnapshot.registryRevision,
    );
  });

  it("rejects scope drift before accepting a persisted generation", async () => {
    const active = await activatedFixture();
    const source = {
      async loadStorageActive(): Promise<ActivatedEnterpriseConfiguration> {
        return {
          ...active,
          configuration: {
            ...active.configuration,
            identity: {
              ...active.configuration.identity,
              scope: otherEnterpriseScope,
            },
          },
        };
      },
    };

    await expect(new EnterpriseRegistryMaterializer({
      source,
      sessionVerifier: new FakeEnterpriseRuntimeSessionVerifier(),
      compatibility,
    }).materialize(enterpriseScope)).rejects.toMatchObject({
      code: "enterprise_registry.scope_mismatch",
    });
  });

  it("rejects materialization digest or byte drift in a persisted generation", async () => {
    const active = await activatedFixture();
    const source = {
      async loadStorageActive(): Promise<ActivatedEnterpriseConfiguration> {
        return {
          ...active,
          configuration: {
            ...active.configuration,
            materializationDigest: digest(30),
            materializedBytes: active.configuration.materializedBytes + 1,
          },
        };
      },
    };

    await expect(new EnterpriseRegistryMaterializer({
      source,
      sessionVerifier: new FakeEnterpriseRuntimeSessionVerifier(),
      compatibility,
    }).materialize(enterpriseScope)).rejects.toMatchObject({
      code: "enterprise_registry.integrity_mismatch",
    });
  });

  it("fails closed on descriptor kind/id drift instead of inventing a binding", async () => {
    const persistence = await startPersistence(
      new InMemoryEnterpriseConfigurationPersistence({
        clock: new FakeClock("2026-07-27T00:00:00.000Z"),
      }),
    );
    const fixture = createEnterpriseConfigurationFixture({
      marker: "bad-id",
      models: [
        descriptor("model", "tool.wrong-partition", 31, {
          endpoint: "core:bad-id",
          permissions: ["model.use"],
        }),
      ],
      fixedPermissions: ["configuration.read", "model.use"],
    });
    await activate(persistence, fixture);

    await expect(createMaterializer(
      persistence,
      new FakeEnterpriseRuntimeSessionVerifier(),
    ).materialize(enterpriseScope)).rejects.toMatchObject({
      code: "enterprise_registry.registry_invalid",
      details: { cause: "descriptor_kind_id_mismatch" },
    });
  });

  it("rejects duplicate resource IDs even when every duplicate is disabled", async () => {
    const persistence = await startPersistence(
      new InMemoryEnterpriseConfigurationPersistence({
        clock: new FakeClock("2026-07-27T00:00:00.000Z"),
      }),
    );
    const duplicate = descriptor("tool", "tool.duplicate", 32, {
      enabled: false,
    });
    const fixture = createEnterpriseConfigurationFixture({
      marker: "duplicate",
      models: [],
      tools: [
        duplicate,
        { ...duplicate, revision: digest(34), digest: digest(35) },
      ],
      fixedPermissions: ["configuration.read"],
    });
    await activate(persistence, fixture);

    await expect(createMaterializer(
      persistence,
      new FakeEnterpriseRuntimeSessionVerifier(),
    ).materialize(enterpriseScope)).rejects.toMatchObject({
      code: "enterprise_registry.registry_invalid",
      details: { cause: "duplicate_resource_id" },
    });
  });

  it("reports all five LocalExecutable checks without model or binding fallback", async () => {
    const persistence = await startPersistence(
      new InMemoryEnterpriseConfigurationPersistence({
        clock: new FakeClock("2026-07-27T00:00:00.000Z"),
      }),
    );
    const fixture = runtimeFixture();
    await activate(persistence, fixture);
    const materialization = await createMaterializer(
      persistence,
      new FakeEnterpriseRuntimeSessionVerifier(),
    ).materialize(enterpriseScope);
    const evaluator = new LocalExecutableEnterpriseCapabilityEvaluator();
    const agent = fixture.materialized.packages.find(
      (item) => item.reference.kind === "agent",
    )!.reference;
    const agentDefinition = localAgentDefinition(fixture, materialization);

    expect(evaluator.evaluate({
      materialization,
      runtimeActiveGeneration: materialization.generation,
      package: agent,
      agentDefinition,
    })).toEqual({
      executable: true,
      checks: {
        generationRuntimeActive: true,
        packageSealed: true,
        packageDigestValid: true,
        requiredDependenciesAvailable: true,
        referencedCapabilitiesUsable: true,
      },
      failures: [],
    });

    const unsafeMaterialization = {
      ...materialization,
      packages: materialization.packages.map((item) =>
        item.kind === "agent"
          ? { ...item, sealed: false, digestValid: false }
          : item),
    };
    const unsafeAgentDefinition = createAgentDefinitionRevision({
      schemaVersion: "v1alpha1",
      agentDefinitionId: "agent.runtime",
      name: "Unsafe enterprise Agent",
      identity: "Enterprise Agent",
      goal: "Exercise failure-closed dependency checks.",
      instructions: "Use only the locked enterprise capabilities.",
      defaultModelId: "model.remote",
      allowModelOverride: false,
      skillReferences: [{
        id: "skill.missing",
        revision: contractDigest(digest(41)),
        contentDigest: contractDigest(digest(42)),
        materializedRef: "enterprise-package:skill.missing",
      }],
      toolReferences: [],
      knowledgeReferences: [],
      requiredModelCapabilities: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        supportsToolCalling: false,
        supportsStreaming: true,
      },
      createdAt: "2026-07-27T00:00:00.000Z",
    });
    expect(evaluator.evaluate({
      materialization: unsafeMaterialization,
      runtimeActiveGeneration: {
        ...materialization.generation,
        materializationDigest: digest(40),
      },
      package: agent,
      agentDefinition: unsafeAgentDefinition,
    })).toEqual({
      executable: false,
      checks: {
        generationRuntimeActive: false,
        packageSealed: false,
        packageDigestValid: false,
        requiredDependenciesAvailable: false,
        referencedCapabilitiesUsable: false,
      },
      failures: [
        "generation_not_runtime_active",
        "package_not_sealed",
        "package_digest_invalid",
        "required_dependency_unavailable",
        "referenced_capability_unusable",
      ],
    });
  });

  it("fails closed when an Agent Definition revision drifts", async () => {
    const persistence = await startPersistence(
      new InMemoryEnterpriseConfigurationPersistence({
        clock: new FakeClock("2026-07-27T00:00:00.000Z"),
      }),
    );
    const fixture = runtimeFixture();
    await activate(persistence, fixture);
    const materialization = await createMaterializer(
      persistence,
      new FakeEnterpriseRuntimeSessionVerifier(),
    ).materialize(enterpriseScope);
    const agentPackage = fixture.materialized.packages.find(
      (item) => item.reference.kind === "agent",
    )!.reference;
    const valid = localAgentDefinition(fixture, materialization);

    expect(new LocalExecutableEnterpriseCapabilityEvaluator().evaluate({
      materialization,
      runtimeActiveGeneration: materialization.generation,
      package: agentPackage,
      agentDefinition: {
        ...valid,
        revision: contractDigest(digest(43)),
        digest: contractDigest(digest(43)),
      },
    })).toMatchObject({
      executable: false,
      checks: {
        requiredDependenciesAvailable: false,
        referencedCapabilitiesUsable: false,
      },
      failures: [
        "agent_definition_invalid",
        "required_dependency_unavailable",
        "referenced_capability_unusable",
      ],
    });
  });
});

class FakeEnterpriseRuntimeSessionVerifier
implements EnterpriseRuntimeSessionVerifier {
  readonly calls: {
    scope: EnterpriseIdentityScope;
    permission: string;
  }[] = [];
  reject = false;

  async assertCurrentSession(
    scope: EnterpriseIdentityScope,
    permission: string,
  ): Promise<void> {
    this.calls.push({ scope, permission });
    if (this.reject) throw new Error("enterprise session unavailable");
  }
}

const compatibility = {
  desktopVersion: "0.0.0",
  coreVersion: "0.0.0",
  supportsContractVersion: (version: string) => version === "v1alpha1",
  isDesktopCompatible: () => true,
  isCoreCompatible: () => true,
};

function createMaterializer(
  persistence: EnterpriseConfigurationPersistence,
  sessionVerifier: EnterpriseRuntimeSessionVerifier,
): EnterpriseRegistryMaterializer {
  return new EnterpriseRegistryMaterializer({
    source: new PersistenceEnterpriseRuntimeRegistrySource(persistence),
    sessionVerifier,
    compatibility,
  });
}

async function startPersistence<T extends EnterpriseConfigurationPersistence>(
  persistence: T,
): Promise<T> {
  await persistence.start();
  openPersistences.push(persistence);
  return persistence;
}

function forgetPersistence(
  persistence: EnterpriseConfigurationPersistence,
): void {
  const index = openPersistences.indexOf(persistence);
  if (index >= 0) openPersistences.splice(index, 1);
}

async function activate(
  persistence: EnterpriseConfigurationPersistence,
  fixture: ReturnType<typeof createEnterpriseConfigurationFixture>,
): Promise<ActivatedEnterpriseConfiguration> {
  const result = await new ConfigurationActivationCoordinator({
    persistence,
  }).activate({
    scope: fixture.materialized.identity.scope,
    snapshot: fixture.snapshot,
    packages: fixture.packages,
    now: "2026-07-27T00:01:00.000Z",
  });
  if (!result.ok) {
    throw new Error(`fixture activation failed: ${result.error.code}`);
  }
  return result.value;
}

async function activatedFixture(): Promise<ActivatedEnterpriseConfiguration> {
  const persistence = await startPersistence(
    new InMemoryEnterpriseConfigurationPersistence({
      clock: new FakeClock("2026-07-27T00:00:00.000Z"),
    }),
  );
  return activate(persistence, runtimeFixture());
}

function runtimeFixture() {
  return createEnterpriseConfigurationFixture({
    marker: "runtime",
    models: [
      descriptor("model", "model.local", 1, {
        endpoint: "core:model.local",
        capabilities: ["text", "streaming", "context_window:32768"],
        permissions: ["model.use"],
      }),
      descriptor("model", "model.remote", 2, {
        endpoint: "/enterprise/model/invoke",
        capabilities: ["text", "streaming"],
        permissions: ["model.use"],
      }),
    ],
    tools: [
      descriptor("tool", "tool.local", 4, {
        endpoint: "local:tool.local",
        capabilities: [
          "read_only",
          "risk:routine_file",
          "effect:idempotent_retry",
        ],
        permissions: ["tool.use"],
      }),
      descriptor("tool", "tool.remote", 6, {
        endpoint: "/enterprise/tool/invoke",
        capabilities: [
          "risk:external_send",
          "effect:query_then_retry",
        ],
        permissions: ["tool.use"],
      }),
    ],
    knowledge: [
      descriptor("knowledge", "knowledge.local", 10, {
        endpoint: "local:knowledge.local",
        permissions: ["knowledge.use"],
      }),
    ],
    fixedPermissions: [
      "configuration.read",
      "model.use",
      "tool.use",
      "knowledge.use",
    ],
  });
}

function localAgentDefinition(
  fixture: ReturnType<typeof runtimeFixture>,
  materialization: Awaited<ReturnType<EnterpriseRegistryMaterializer["materialize"]>>,
) {
  const skill = fixture.materialized.packages.find(
    (item) => item.reference.kind === "skill",
  )!.reference;
  const knowledge = fixture.materialized.snapshot.knowledge[0]!;
  const tool = materialization.registrySnapshot.agentVisibleCapabilities.tools
    .find((definition) => definition.capabilityId === "tool.local")!;
  return createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: "agent.runtime",
    name: "Local enterprise Agent",
    identity: "Enterprise Agent",
    goal: "Exercise only locally executable enterprise capabilities.",
    instructions: "Use only the locked enterprise capabilities.",
    defaultModelId: "model.local",
    allowModelOverride: false,
    skillReferences: [{
      id: skill.packageId,
      revision: contractDigest(skill.revision),
      contentDigest: contractDigest(skill.digest),
      materializedRef: `enterprise-package:${skill.packageId}`,
    }],
    toolReferences: [{
      capabilityId: tool.capabilityId,
      capabilityRevision: tool.revision,
    }],
    knowledgeReferences: [{
      id: knowledge.id,
      revision: contractDigest(knowledge.revision),
      contentDigest: contractDigest(knowledge.digest),
      materializedRef: `enterprise-knowledge:${knowledge.id}`,
    }],
    requiredModelCapabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: true,
      supportsStreaming: true,
      minimumContextWindow: 8_192,
    },
    createdAt: "2026-07-27T00:00:00.000Z",
  });
}

function descriptor(
  kind: EnterpriseResourceDescriptor["kind"],
  id: string,
  seed: number,
  options: {
    endpoint?: string;
    capabilities?: readonly string[];
    credentialAvailable?: boolean;
    unavailableReason?: string;
    enabled?: boolean;
    permissions?: readonly string[];
  } = {},
): EnterpriseResourceDescriptor {
  return {
    kind,
    id,
    revision: digest(seed),
    digest: digest(seed + 1),
    capabilities: [...(options.capabilities ?? [])],
    gatewayEndpoint: options.endpoint ?? `/enterprise/${kind}`,
    credentialAvailable: options.credentialAvailable ?? true,
    ...(options.unavailableReason === undefined
      ? {}
      : { unavailableReason: options.unavailableReason }),
    enabled: options.enabled ?? true,
    fixedPermissions: [...(options.permissions ?? [])],
  };
}

function digest(seed: number): string {
  return (seed % 16).toString(16).repeat(64);
}

function contractDigest(rawDigest: string): `sha256:${string}` {
  return `sha256:${rawDigest}`;
}
