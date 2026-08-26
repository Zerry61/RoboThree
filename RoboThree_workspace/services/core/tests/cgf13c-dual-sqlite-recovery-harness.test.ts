import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CONTRACT_VERSION,
  JsonValueSchema,
  PersistenceSchemaVersion,
  type TaskCapabilityLock,
  type TaskCheckpoint,
  type TaskHead,
} from "@robothree/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  ConfigurationActivationCoordinator,
  EnterpriseGenerationReferenceAnalyzer,
  EnterpriseRegistryMaterializer,
  EnterpriseTaskGenerationRecoveryCoordinator,
  FakeClock,
  PersistenceEnterpriseRuntimeRegistrySource,
  SqliteEnterpriseConfigurationPersistence,
  SqliteRuntimeActivationPersistence,
  SqliteTaskPersistence,
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
  createTaskRunState,
  createTaskRuntimeSelection,
  sha256CanonicalJson,
  type EnterpriseConfigurationPersistence,
  type EnterpriseRuntimeSessionVerifier,
  type PersistedTask,
  type RuntimeActivationPersistence,
  type RuntimeActivationTarget,
  type RuntimeActiveGeneration,
  type TaskPersistence,
} from "../src/index.js";
import {
  createEnterpriseConfigurationFixture,
  enterpriseScope,
} from "./enterprise-configuration.fixtures.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("CGF-1.3C dual SQLite recovery Harness", () => {
  it("recovers new and old Tasks without cross-database transactions or generation drift", async () => {
    const directory = mkdtempSync(join(tmpdir(), "robothree-cgf13c-"));
    directories.push(directory);
    const enterprisePath = join(
      directory,
      "enterprise-configuration.sqlite",
    );
    const taskPath = join(directory, "robothree.sqlite");
    const clock = new FakeClock("2026-07-27T08:00:00.000Z");

    let enterprise = new SqliteEnterpriseConfigurationPersistence({
      databasePath: enterprisePath,
      clock,
    });
    let activation = new SqliteRuntimeActivationPersistence({
      databasePath: enterprisePath,
      clock,
    });
    let tasks = new SqliteTaskPersistence({ databasePath: taskPath, clock });
    await enterprise.start();
    await activation.start();
    await tasks.start();

    const first = await activateAndTarget(enterprise, "one");
    const firstRuntime = await complete(
      activation,
      "attempt.cgf13c.one",
      first,
    );
    const oldTaskId = "019f7447-a784-77b2-a716-000000013301";
    await seedEnterpriseTask(tasks, oldTaskId, first, 1);

    const second = await activateAndTarget(
      enterprise,
      "two",
      first.snapshotRevision,
    );
    await complete(
      activation,
      "attempt.cgf13c.two",
      second,
      firstRuntime,
    );
    const newTaskId = "019f7447-a784-77b2-a716-000000013302";
    await seedEnterpriseTask(tasks, newTaskId, second, 2);
    const oldSelectionDigest = (await tasks.loadTaskRuntimeSelection(
      oldTaskId,
    ))?.selectionDigest;

    // There is intentionally no ATTACH and no transaction spanning these two
    // files. Close/reopen proves that recovery joins durable facts only.
    await tasks.stop();
    await activation.stop();
    await enterprise.stop();
    enterprise = new SqliteEnterpriseConfigurationPersistence({
      databasePath: enterprisePath,
      clock,
    });
    activation = new SqliteRuntimeActivationPersistence({
      databasePath: enterprisePath,
      clock,
    });
    tasks = new SqliteTaskPersistence({ databasePath: taskPath, clock });
    await enterprise.start();
    await activation.start();
    await tasks.start();

    try {
      const coordinator = new EnterpriseTaskGenerationRecoveryCoordinator({
        configurationPersistence: enterprise,
        runtimeActivationPersistence: activation,
        taskPersistence: tasks,
      });
      const recovered = await coordinator.recover({
        scope: enterpriseScope,
        enterpriseSessionValid: true,
      });
      expect(recovered.runtimeActiveCandidateKey).toBe(second.candidateKey);
      expect(recovered.decisions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          taskId: oldTaskId,
          status: "locked_previous_generation",
          candidateKey: first.candidateKey,
          registryRevision: first.registryRevision,
        }),
        expect.objectContaining({
          taskId: newTaskId,
          status: "current_generation",
          candidateKey: second.candidateKey,
          registryRevision: second.registryRevision,
        }),
      ]));
      expect((await tasks.loadTaskRuntimeSelection(oldTaskId))
        ?.selectionDigest).toBe(oldSelectionDigest);

      const analyzer = new EnterpriseGenerationReferenceAnalyzer({
        configurationPersistence: enterprise,
        runtimeActivationPersistence: activation,
        taskPersistence: tasks,
      });
      const oldBlock = await analyzer.analyze({
        scope: enterpriseScope,
        candidateKey: first.candidateKey,
      });
      expect(oldBlock).toMatchObject({
        referenced: true,
        safeToDelete: false,
      });
      expect(oldBlock.references.map((reference) => reference.kind))
        .toEqual(expect.arrayContaining([
          "storage_previous",
          "non_terminal_task_selection",
          "recovering_task",
          "task_capability_lock",
        ]));
      expect(await analyzer.analyze({
        scope: enterpriseScope,
        candidateKey: second.candidateKey,
      })).toMatchObject({
        referenced: true,
        safeToDelete: false,
        references: expect.arrayContaining([
          expect.objectContaining({ kind: "storage_active" }),
          expect.objectContaining({ kind: "runtime_active" }),
        ]),
      });

      const sessionInvalid = await coordinator.recover({
        scope: enterpriseScope,
        enterpriseSessionValid: false,
      });
      expect(sessionInvalid.decisions).toHaveLength(2);
      expect(sessionInvalid.decisions.every((decision) =>
        decision.status === "waiting_enterprise_session")).toBe(true);
    } finally {
      await tasks.stop();
      await activation.stop();
      await enterprise.stop();
    }
  });
});

class ValidSession implements EnterpriseRuntimeSessionVerifier {
  async assertCurrentSession(): Promise<void> {
    // Managed enterprise session fixture.
  }
}

async function activateAndTarget(
  persistence: EnterpriseConfigurationPersistence,
  marker: string,
  expectedActiveRevision?: string,
): Promise<RuntimeActivationTarget> {
  const fixture = createEnterpriseConfigurationFixture({ marker });
  const result = await new ConfigurationActivationCoordinator({
    persistence,
  }).activate({
    scope: enterpriseScope,
    snapshot: fixture.snapshot,
    packages: fixture.packages,
    ...(expectedActiveRevision === undefined
      ? {}
      : { expectedActiveRevision }),
    now: marker === "one"
      ? "2026-07-27T08:01:00.000Z"
      : "2026-07-27T08:02:00.000Z",
  });
  if (!result.ok) throw new Error(result.error.code);
  const materialized = await new EnterpriseRegistryMaterializer({
    source: new PersistenceEnterpriseRuntimeRegistrySource(persistence),
    sessionVerifier: new ValidSession(),
    compatibility: {
      desktopVersion: "0.0.0-cgf.1.3c",
      coreVersion: "0.0.0-cgf.1.3c",
      supportsContractVersion: (version) => version === "v1alpha1",
      isDesktopCompatible: () => true,
      isCoreCompatible: () => true,
    },
  }).materialize(enterpriseScope);
  return {
    ...materialized.generation,
    registryRevision: materialized.registrySnapshot.registryRevision,
  };
}

async function complete(
  persistence: RuntimeActivationPersistence,
  attemptId: string,
  target: RuntimeActivationTarget,
  previous?: RuntimeActiveGeneration,
): Promise<RuntimeActiveGeneration> {
  const begin = await persistence.beginRuntimeActivation({
    activationAttemptId: attemptId,
    scope: enterpriseScope,
    target,
    ...(previous === undefined
      ? {}
      : { expectedPreviousRuntimeActive: previous }),
    requestedAt: "2026-07-27T08:03:00.000Z",
  });
  if (!begin.ok) throw new Error(begin.error.code);
  const advance = {
    activationAttemptId: attemptId,
    scope: enterpriseScope,
    target,
    occurredAt: "2026-07-27T08:04:00.000Z",
  };
  const restart = await persistence.recordRestartDecision(advance);
  if (!restart.ok) throw new Error(restart.error.code);
  const readiness = await persistence.recordInternalReadiness(advance);
  if (!readiness.ok) throw new Error(readiness.error.code);
  const committed = await persistence.commitRuntimeActive(advance);
  if (!committed.ok) throw new Error(committed.error.code);
  return committed.value;
}

async function seedEnterpriseTask(
  persistence: TaskPersistence,
  taskId: string,
  target: RuntimeActivationTarget,
  index: number,
): Promise<void> {
  const task = persistedTask(taskId, index);
  const created = await persistence.createTask(task);
  if (!created.ok) throw new Error(created.error.code);
  const lock = modelLock(taskId, target.registryRevision, index);
  const locked = await persistence.commitTaskCapabilityLock(lock);
  if (!locked.ok) throw new Error(locked.error.code);
  const digest = sha256CanonicalJson(JsonValueSchema.parse(lock));
  const selection = createTaskRuntimeSelection({
    schemaVersion: "v1alpha1",
    runtimeSelectionId:
      `019f7447-a784-77b2-a716-${String(13_400 + index).padStart(12, "0")}`,
    taskId,
    agent: {
      agentDefinitionId: "agent.enterprise.general",
      revision: fixedDigest("e"),
      digest: fixedDigest("e"),
    },
    agentDefaultModelId: "model.enterprise.default",
    resolvedModelLock: {
      lockId: lock.lockId,
      capabilityId: "model.enterprise.default",
      lockDigest: digest,
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    enterpriseConfigRevision: `sha256:${target.snapshotRevision}`,
    platformPromptRevision: fixedDigest("f"),
    registryRevision: target.registryRevision,
    createdAt: "2026-07-27T08:05:00.000Z",
  });
  const selected = await persistence.commitTaskRuntimeSelection(selection);
  if (!selected.ok) throw new Error(selected.error.code);
}

function persistedTask(taskId: string, index: number): PersistedTask {
  const createdAt = "2026-07-27T08:05:00.000Z";
  const state = createTaskRunState({
    taskId,
    agentDefinition: {
      agentDefinitionId: "agent.enterprise.general",
      version: "1.0.0",
    },
    goal: `recover enterprise task ${index}`,
    createdAt,
  });
  const checkpoint: TaskCheckpoint = {
    schemaVersion: PersistenceSchemaVersion,
    checkpointId:
      `019f7447-a784-77b2-a716-${String(13_500 + index).padStart(12, "0")}`,
    taskId,
    stateRevision: 0,
    lastEventSequence: 0,
    state,
    stateDigest: sha256CanonicalJson(JsonValueSchema.parse(state)),
    createdAt,
  };
  const head: TaskHead = {
    schemaVersion: PersistenceSchemaVersion,
    taskId,
    initializationDigest: sha256CanonicalJson(JsonValueSchema.parse({
      taskId,
      goal: state.goal,
      agentDefinition: state.agentDefinition,
      createdAt,
    })),
    stateRevision: 0,
    lastEventSequence: 0,
    latestCheckpointId: checkpoint.checkpointId,
    status: state.status,
    updatedAt: state.updatedAt,
  };
  return { head, checkpoint };
}

function modelLock(
  taskId: string,
  registryRevision: string,
  index: number,
): TaskCapabilityLock {
  const source = {
    trust: "enterprise" as const,
    packageId: "robothree.enterprise.cgf13c",
    packageRevision: fixedDigest("a"),
  };
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.enterprise.default",
    kind: "model",
    name: "Enterprise default",
    description: "Locked enterprise recovery model",
    source,
    model: {
      family: "fake",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 16_384,
      supportsStreaming: true,
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.enterprise.fake",
    adapterKind: "model_provider",
    source,
    implementationRef: "central:model.fake",
    runtimeBoundary: "remote",
    protocol: { name: "robothree-model", version: "v1alpha1" },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.enterprise.default",
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
  return {
    schemaVersion: CONTRACT_VERSION,
    lockId:
      `019f7447-a784-77b2-a716-${String(13_600 + index).padStart(12, "0")}`,
    taskId,
    registryRevision,
    definitionSnapshot: definition,
    bindingSnapshot: binding,
    adapterDescriptorSnapshot: descriptor,
    lockedAt: "2026-07-27T08:05:00.000Z",
  };
}

function fixedDigest(value: string): `sha256:${string}` {
  return `sha256:${value.repeat(64)}`;
}
