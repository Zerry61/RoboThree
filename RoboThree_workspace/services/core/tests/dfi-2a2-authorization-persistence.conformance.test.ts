import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CONTRACT_VERSION,
  JsonValueSchema,
  TaskCapabilityLockSchema,
} from "@robothree/contracts";
import type { TaskCapabilityLock } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  FakeClock,
  InMemoryTaskPersistence,
  LegacyTaskAuthorizationSelectionMaterializer,
  MVP_TASK_AUTHORIZATION_MODE_POLICY,
  RegistryBuilder,
  SqliteTaskPersistence,
  TaskAuthorizationSelectionService,
  createAdapterDescriptor,
  createAgentDefinitionRevision,
  createCapabilityBinding,
  createCapabilityDefinition,
  createInitialPersistedTask,
  createTaskRuntimeSelection,
  sha256CanonicalJson,
} from "../src/index.js";
import type {
  AuthorizationAwareSubmitTurnTaskBundle,
  SubmitTurnTaskBundle,
  TaskAuthorizationPersistenceRecord,
  TaskPersistence,
} from "../src/index.js";

const at = "2026-08-18T03:00:00.000Z";
const taskId = uuid(1);
const sessionId = uuid(2);
const commandId = uuid(3);
const messageId = uuid(4);
const runtimeSelectionId = uuid(5);
const checkpointId = uuid(6);
const lockId = uuid(7);
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;

describe.each(["memory", "sqlite"] as const)(
  "DFI-2A.2 %s persistence conformance",
  (kind) => {
    it("atomically commits, replays and reloads all authorization identities", async () => {
      const harness = await createHarness(kind);
      try {
        const fixture = createFixture("smart_confirm");
        const first = await harness.persistence
          .commitAuthorizationAwareSubmitTurnTaskBundle(fixture.awareBundle);
        expect(first).toMatchObject({
          ok: true,
          replayed: false,
          value: {
            selection: { source: "user_selected", resolvedMode: "smart_confirm" },
          },
        });
        expect(await harness.persistence
          .commitAuthorizationAwareSubmitTurnTaskBundle(fixture.awareBundle))
          .toMatchObject({ ok: true, replayed: true });
        const loaded = await harness.persistence
          .loadAuthorizationAwareSubmitTurnTaskBundle(commandId);
        expect(loaded?.runtimeSelection).toEqual(fixture.bundle.runtimeSelection);
        expect(loaded?.selection.authorizationSelectionDigest)
          .toBe(fixture.record.selection.authorizationSelectionDigest);
        expect(loaded?.executionIdentity.executionSelectionDigest)
          .toBe(fixture.record.executionIdentity.executionSelectionDigest);
        const snapshot = await harness.persistence
          .loadTaskAuthorizationMaterializationSnapshot();
        expect(snapshot.runtimeSelections).toEqual([fixture.bundle.runtimeSelection]);
        expect(snapshot.runtimeSelections[0]).toHaveProperty("agent");
        expect(snapshot.existingAuthorizationRecords).toHaveLength(1);
      } finally {
        await harness.cleanup();
      }
    });

    it("distinguishes authorization conflict from base bundle conflict", async () => {
      const harness = await createHarness(kind);
      try {
        const smart = createFixture("smart_confirm");
        const taskScoped = createFixture("task_scoped");
        expect(await harness.persistence
          .commitAuthorizationAwareSubmitTurnTaskBundle(smart.awareBundle))
          .toMatchObject({ ok: true });
        expect(await harness.persistence
          .commitAuthorizationAwareSubmitTurnTaskBundle(taskScoped.awareBundle))
          .toMatchObject({
            ok: false,
            error: { code: "persistence.authorization_selection_conflict" },
          });
        expect(await harness.persistence
          .commitAuthorizationAwareSubmitTurnTaskBundle({
            ...smart.awareBundle,
            userMessageId: uuid(99),
          })).toMatchObject({
            ok: false,
            error: { code: "persistence.submit_turn_bundle_conflict" },
          });
      } finally {
        await harness.cleanup();
      }
    });

    it("materializes deterministic legacy facts atomically and replays", async () => {
      const harness = await createHarness(kind);
      try {
        const fixture = createFixture("smart_confirm");
        expect(await harness.persistence.commitSubmitTurnTaskBundle(fixture.bundle))
          .toMatchObject({ ok: true });
        const before = await harness.persistence
          .loadTaskAuthorizationMaterializationSnapshot();
        expect(before.runtimeSelections).toEqual([fixture.bundle.runtimeSelection]);
        expect(before.existingAuthorizationRecords).toEqual([]);
        const materializer = new LegacyTaskAuthorizationSelectionMaterializer(
          harness.persistence,
        );
        const first = await materializer.materialize(
          MVP_TASK_AUTHORIZATION_MODE_POLICY,
        );
        expect(first).toMatchObject({
          ok: true,
          replayed: false,
          value: { existingCount: 0, insertedCount: 1, totalRuntimeSelectionCount: 1 },
        });
        expect(await harness.persistence.loadTaskAuthorizationSelection(taskId))
          .toMatchObject({
            requestedMode: "smart_confirm",
            resolvedMode: "smart_confirm",
            source: "legacy_default",
            createdAt: fixture.bundle.runtimeSelection.createdAt,
          });
        expect(await materializer.materialize(MVP_TASK_AUTHORIZATION_MODE_POLICY))
          .toMatchObject({
            ok: true,
            replayed: true,
            value: { existingCount: 1, insertedCount: 0 },
          });
      } finally {
        await harness.cleanup();
      }
    });

    it("rejects incomplete materialization without a partial row", async () => {
      const harness = await createHarness(kind);
      try {
        const fixture = createFixture("smart_confirm");
        expect(await harness.persistence.commitSubmitTurnTaskBundle(fixture.bundle))
          .toMatchObject({ ok: true });
        const snapshot = await harness.persistence
          .loadTaskAuthorizationMaterializationSnapshot();
        expect(await harness.persistence.commitTaskAuthorizationMaterialization({
          expectedCoverageDigest: snapshot.coverageDigest,
          records: [],
        })).toMatchObject({
          ok: false,
          error: { code: "persistence.authorization_materialization_incomplete" },
        });
        expect(await harness.persistence.loadTaskAuthorizationSelection(taskId))
          .toBeUndefined();
      } finally {
        await harness.cleanup();
      }
    });
  },
);

describe("DFI-2A.2 SQLite recovery and schema", () => {
  it("persists migration 22 and all three digests across close/reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dfi2a2-reopen-"));
    const databasePath = join(directory, "robothree.sqlite");
    const fixture = createFixture("manual_review");
    const first = new SqliteTaskPersistence({ databasePath, clock: new FakeClock(at) });
    await first.start();
    try {
      expect(await first.commitAuthorizationAwareSubmitTurnTaskBundle(fixture.awareBundle))
        .toMatchObject({ ok: true, replayed: false });
    } finally {
      await first.stop();
    }
    const inspection = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(inspection.prepare(
        "SELECT name FROM schema_migrations WHERE migration_id = 22",
      ).get()).toEqual({ name: "dfi_2a_task_authorization_selections" });
      const row = inspection.prepare(`
        SELECT runtime_selection_digest, authorization_selection_digest,
               execution_selection_digest
        FROM task_authorization_selections
      `).get();
      expect(row).toEqual({
        runtime_selection_digest: fixture.bundle.runtimeSelection.selectionDigest,
        authorization_selection_digest:
          fixture.record.selection.authorizationSelectionDigest,
        execution_selection_digest:
          fixture.record.executionIdentity.executionSelectionDigest,
      });
    } finally {
      inspection.close();
    }
    const second = new SqliteTaskPersistence({ databasePath, clock: new FakeClock(at) });
    await second.start();
    try {
      expect(await second.loadAuthorizationAwareSubmitTurnTaskBundle(commandId))
        .toMatchObject({
          selection: {
            authorizationSelectionDigest:
              fixture.record.selection.authorizationSelectionDigest,
          },
          executionIdentity: {
            runtimeSelectionDigest: fixture.bundle.runtimeSelection.selectionDigest,
            executionSelectionDigest:
              fixture.record.executionIdentity.executionSelectionDigest,
          },
        });
    } finally {
      await second.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when an indexed field drifts from record JSON", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dfi2a2-drift-"));
    const databasePath = join(directory, "robothree.sqlite");
    const persistence = new SqliteTaskPersistence({
      databasePath,
      clock: new FakeClock(at),
    });
    await persistence.start();
    const fixture = createFixture("smart_confirm");
    try {
      expect(await persistence
        .commitAuthorizationAwareSubmitTurnTaskBundle(fixture.awareBundle))
        .toMatchObject({ ok: true });
    } finally {
      await persistence.stop();
    }
    const database = new DatabaseSync(databasePath);
    database.prepare(`
      UPDATE task_authorization_selections SET policy_revision = ? WHERE task_id = ?
    `).run(digest("f"), taskId);
    database.close();
    const reopened = new SqliteTaskPersistence({ databasePath, clock: new FakeClock(at) });
    await reopened.start();
    try {
      await expect(reopened.loadTaskAuthorizationSelection(taskId))
        .rejects.toThrow("indexed fields");
    } finally {
      await reopened.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function createHarness(kind: "memory" | "sqlite"): Promise<{
  persistence: TaskPersistence;
  cleanup(): Promise<void>;
}> {
  if (kind === "memory") {
    const persistence = new InMemoryTaskPersistence(new FakeClock(at));
    await persistence.start();
    return { persistence, cleanup: () => persistence.stop() };
  }
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi2a2-"));
  const persistence = new SqliteTaskPersistence({
    databasePath: join(directory, "robothree.sqlite"),
    clock: new FakeClock(at),
  });
  await persistence.start();
  return {
    persistence,
    async cleanup() {
      await persistence.stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

function createFixture(
  requestedMode: "manual_review" | "smart_confirm" | "task_scoped",
): {
  bundle: SubmitTurnTaskBundle;
  record: TaskAuthorizationPersistenceRecord;
  awareBundle: AuthorizationAwareSubmitTurnTaskBundle;
} {
  const source = {
    trust: "official" as const,
    packageId: "robothree.official.dfi2a2",
    packageRevision: digest("a"),
  };
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.dfi2a2",
    kind: "model",
    name: "DFI-2A.2 Model",
    description: "Controlled persistence fixture",
    source,
    model: {
      family: "fake",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 8_192,
      supportsStreaming: true,
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.dfi2a2",
    adapterKind: "model_provider",
    source,
    implementationRef: "core:dfi2a2-fixture",
    runtimeBoundary: "in_process",
    protocol: { name: "fake", version: "v1" },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.dfi2a2",
    capability: {
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "model_provider",
    source,
  });
  const registry = new RegistryBuilder({ trustedSources: [source] })
    .registerCapability(definition)
    .registerAdapterDescriptor(descriptor)
    .registerBinding(binding)
    .finalize();
  const lock: TaskCapabilityLock = TaskCapabilityLockSchema.parse({
    schemaVersion: CONTRACT_VERSION,
    lockId,
    taskId,
    registryRevision: registry.registryRevision,
    definitionSnapshot: definition,
    bindingSnapshot: binding,
    adapterDescriptorSnapshot: descriptor,
    lockedAt: at,
  });
  const agent = createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: "agent.dfi2a2",
    name: "DFI-2A.2 Agent",
    identity: "Persistence fixture",
    goal: "Validate authorization persistence",
    instructions: "Use the exact locked model.",
    defaultModelId: definition.capabilityId,
    allowModelOverride: false,
    skillReferences: [],
    toolReferences: [],
    knowledgeReferences: [],
    requiredModelCapabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: false,
      supportsStreaming: true,
      minimumContextWindow: 4_096,
    },
    createdAt: at,
  });
  const runtimeSelection = createTaskRuntimeSelection({
    schemaVersion: "v1alpha1",
    runtimeSelectionId,
    taskId,
    agent: {
      agentDefinitionId: agent.agentDefinitionId,
      revision: agent.revision,
      digest: agent.digest,
    },
    agentDefaultModelId: definition.capabilityId,
    resolvedModelLock: {
      lockId,
      capabilityId: definition.capabilityId,
      lockDigest: sha256CanonicalJson(JsonValueSchema.parse(lock)),
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    platformPromptRevision: digest("b"),
    registryRevision: registry.registryRevision,
    createdAt: at,
  });
  const task = createInitialPersistedTask({
    taskId,
    sessionId,
    agentDefinition: {
      agentDefinitionId: agent.agentDefinitionId,
      version: agent.revision,
    },
    goal: "Validate authorization persistence",
    createdAt: at,
  }, checkpointId);
  const bundle: SubmitTurnTaskBundle = {
    submitTurnCommandId: commandId,
    userMessageId: messageId,
    task,
    capabilityLocks: [lock],
    runtimeSelection,
    committedAt: at,
  };
  const resolved = new TaskAuthorizationSelectionService().resolve({
    taskId,
    runtimeSelection,
    authorization: {
      kind: "explicit",
      preference: { schemaVersion: "v1alpha1", requestedMode },
    },
    policySnapshot: MVP_TASK_AUTHORIZATION_MODE_POLICY,
    createdAt: at,
  });
  if (!resolved.ok) throw new Error(resolved.error.code);
  const record = {
    selection: resolved.selection,
    executionIdentity: resolved.executionIdentity,
  };
  return { bundle, record, awareBundle: { ...bundle, ...record } };
}

function uuid(value: number): string {
  return `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
}
