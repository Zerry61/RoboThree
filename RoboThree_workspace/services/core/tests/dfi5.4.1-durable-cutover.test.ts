import {
  CONTRACT_VERSION,
  JsonValueSchema,
  TaskSubmitTurnBindingSchema,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import { SubmitTurnRecordV1Alpha5Schema } from
  "@robothree/contracts/submit-turn-coordination/v1alpha5";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DFI541_MAX_CORE_DEFAULT_ENABLED,
  DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT,
  Dfi541ExactSubjectProviderReleaseAdmissionResolver,
  ExactSubjectBoundProviderReleaseMaterializer,
  assertDfi541ProductionDecisionsRemainDisabled,
  createDfi541MaxCoreComposition,
  createDfi541TaskBundleEnvelopeV1,
  createDfi541CoordinationEnvelopeV1,
  createDurableDfi541AcceptancePlanV1,
  createReasoningModeLockV1Alpha2,
  createTaskRuntimeSelectionV1Alpha4,
  deriveTaskInstructionBindingV1FromValidatedSelectionV1Alpha4,
  sha256CanonicalJson,
  validateDfi541TaskBundleEnvelopeV1,
  validateDurableDfi541AcceptancePlanV1,
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
  createInitialPersistedTask,
  createTaskAuthorizationModePolicySnapshot,
  FakeClock,
  InMemoryTaskPersistence,
  InMemorySubmitTurnPersistence,
  SqliteTaskPersistence,
  SqliteSubmitTurnPersistence,
  TaskAuthorizationSelectionService,
} from "../src/index.js";

const id = (suffix: string) => `019f7447-a784-77b2-a716-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const at = "2026-08-28T08:00:00.000Z";

describe("DFI-5.4.1 durable cutover and composition", () => {
  it("keeps every production activation decision disabled", () => {
    expect(DFI541_MAX_CORE_DEFAULT_ENABLED).toBe(false);
    expect(DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT).toBe(0);
    expect(() => assertDfi541ProductionDecisionsRemainDisabled()).not.toThrow();
    expect(createDfi541MaxCoreComposition()).toEqual({
      enabled: false, testOnly: false, graphComplete: false,
      desktopFeatureAdvertised: false, productionReleaseInstalled: false,
    });
  });

  it("fails fast on a production enable attempt or incomplete test graph", () => {
    expect(() => createDfi541MaxCoreComposition({ enabled: true }))
      .toThrow("dfi541.production_activation_forbidden");
    expect(() => createDfi541MaxCoreComposition({ enabled: true, testOnly: true }))
      .toThrow("dfi541.incomplete_graph");
  });

  it("allows only a complete test-only internal graph without advertising Desktop", () => {
    expect(createDfi541MaxCoreComposition({
      enabled: true, testOnly: true,
      graph: {
        entitlementSourceCount: 1, reasoningPlannerCount: 1,
        coordinationPersistenceCount: 1, taskBundlePersistenceCount: 1,
        admittedPolicyCount: 1, conformanceManifestCount: 1,
        releaseInstallerCount: 1, releaseRegistryCount: 1,
        timeoutFactPersistenceCount: 1, preferencePersistenceCount: 1,
      },
    })).toMatchObject({ enabled: true, testOnly: true, graphComplete: true,
      desktopFeatureAdvertised: false, productionReleaseInstalled: false });
  });

  it("turns a missing exact admission input into the only safe unavailable cause", async () => {
    const fixture = selectionFixture();
    const resolver = new Dfi541ExactSubjectProviderReleaseAdmissionResolver({
      loadExact: async () => undefined,
    }, new ExactSubjectBoundProviderReleaseMaterializer());
    await expect(resolver.resolve({
      subject: fixture.subject, modelLock: fixture.modelLock,
      profileId: "reasoning.profile.dfi541", profileRevision: digest("1"),
      profileDigest: digest("1"), strategyId: "reasoning.strategy.dfi541",
      strategyRevision: digest("2"), strategyDigest: digest("2"),
      timeoutPolicyRef: "timeout.policy.local-personal.v1",
    })).resolves.toEqual({
      state: "unavailable", code: "provider_release.policy_unavailable",
    });
  });

  it("creates a deterministic acceptance plan that preserves the original deadline", () => {
    const fixture = selectionFixture();
    const first = createPlan(fixture);
    const second = createPlan(fixture);
    expect(first).toEqual(second);
    expect(first.invocationDeadlineAt).toBe("2026-08-28T08:15:00.000Z");
    expect(validateDurableDfi541AcceptancePlanV1(first)).toEqual(first);
  });

  it("rejects acceptance plan digest tamper", () => {
    const plan = createPlan(selectionFixture());
    expect(() => validateDurableDfi541AcceptancePlanV1({
      ...plan, invocationDeadlineAt: "2026-08-28T08:16:00.000Z",
    })).toThrow("acceptance plan digest is invalid");
  });

  it("binds Task instruction and safe admission evidence in one envelope", () => {
    const fixture = selectionFixture();
    const envelope = createDfi541TaskBundleEnvelopeV1({
      submitTurnBinding: fixture.submitTurnBinding,
      taskInstructionBinding: fixture.instructionBinding,
      admissionEvidence: { state: "not_required" },
    });
    expect(validateDfi541TaskBundleEnvelopeV1(envelope)).toEqual(envelope);
    expect(() => validateDfi541TaskBundleEnvelopeV1({
      ...envelope, envelopeDigest: digest("9"),
    })).toThrow("Task bundle envelope digest is invalid");
  });

  it("commits and replays the whole DFI-5.4.1 bundle with one InMemory swap", async () => {
    const persistence = new InMemoryTaskPersistence(new FakeClock(at));
    await persistence.start();
    try {
      const bundle = atomicBundleFixture();
      const committed = await persistence.commitDfi541SubmitTurnTaskBundle(bundle);
      expect(committed).toMatchObject({ ok: true, replayed: false });
      expect(await persistence.commitDfi541SubmitTurnTaskBundle(bundle))
        .toMatchObject({ ok: true, replayed: true });
      expect(await persistence.loadDfi541SubmitTurnTaskBundle(
        bundle.submitTurnCommandId,
      )).toMatchObject({
        binding: bundle.submitTurnBinding,
        runtimeSelection: { schemaVersion: "v1alpha4" },
        admissionEvidence: { state: "not_required" },
      });
    } finally {
      await persistence.stop();
    }
  });

  it("reopens the exact atomic DFI-5.4.1 bundle from the existing SQLite JSON", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dfi541-"));
    const databasePath = join(directory, "core.sqlite");
    const bundle = atomicBundleFixture();
    const first = new SqliteTaskPersistence({ databasePath, clock: new FakeClock(at) });
    try {
      await first.start();
      expect(await first.commitDfi541SubmitTurnTaskBundle(bundle))
        .toMatchObject({ ok: true, replayed: false });
      await first.stop();
      const second = new SqliteTaskPersistence({ databasePath, clock: new FakeClock(at) });
      try {
        await second.start();
        expect(await second.loadDfi541SubmitTurnTaskBundle(
          bundle.submitTurnCommandId,
        )).toMatchObject({
          binding: bundle.submitTurnBinding,
          runtimeSelection: bundle.runtimeSelection,
          taskInstructionBinding: bundle.taskInstructionBinding,
        });
        expect(await second.loadSubmitTurnBindingByTaskId(
          bundle.task.head.taskId,
        )).toEqual(bundle.submitTurnBinding);
        expect(await second.loadExecutableSubmitTurnTaskBundle(
          bundle.submitTurnCommandId,
        )).toMatchObject({ binding: bundle.submitTurnBinding });
        await expect(second.loadTaskAuthorizationMaterializationSnapshot())
          .resolves.toMatchObject({
            runtimeSelections: [],
            existingAuthorizationRecords: [],
          });
      } finally {
        await second.stop();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("requires and preserves the DFI-5.4.1 accepted envelope in memory", async () => {
    const persistence = new InMemorySubmitTurnPersistence({ clock: new FakeClock(at) });
    await persistence.start();
    try {
      const envelope = coordinationEnvelopeFixture();
      await expect(persistence.prepareAccepted(envelope.record)).resolves.toMatchObject({
        ok: false, error: { code: "submit_turn.invalid_record" },
      });
      await expect(persistence.prepareAcceptedDfi541(envelope)).resolves.toMatchObject({
        ok: true, replayed: false,
      });
      expect(await persistence.loadDfi541Envelope(
        envelope.record.submitTurnCommandId,
      )).toEqual(envelope);
    } finally {
      await persistence.stop();
    }
  });

  it("reopens the exact accepted DFI-5.4.1 envelope from SQLite", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dfi541-coordination-"));
    const databasePath = join(directory, "core.sqlite");
    const envelope = coordinationEnvelopeFixture();
    const first = new SqliteSubmitTurnPersistence({
      databasePath, clock: new FakeClock(at),
    });
    try {
      await first.start();
      expect(await first.prepareAcceptedDfi541(envelope))
        .toMatchObject({ ok: true, replayed: false });
      await first.stop();
      const second = new SqliteSubmitTurnPersistence({
        databasePath, clock: new FakeClock(at),
      });
      try {
        await second.start();
        expect(await second.loadDfi541Envelope(
          envelope.record.submitTurnCommandId,
        )).toEqual(envelope);
        expect(await second.listRecoverable(10)).toEqual([envelope.record]);
      } finally {
        await second.stop();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function coordinationEnvelopeFixture() {
  const bundle = atomicBundleFixture();
  const fixture = selectionFixture();
  const plan = createDurableDfi541AcceptancePlanV1({
    schemaVersion: "v1",
    submitTurnCommandId: bundle.submitTurnCommandId,
    internalTaskId: bundle.task.head.taskId,
    userMessageId: bundle.userMessageId,
    requestDigest: digest("8"),
    runtimeSelection: bundle.runtimeSelection,
    taskInstructionBinding: bundle.taskInstructionBinding,
    admissionEvidence: bundle.admissionEvidence,
    invocationDeadlineAt: "2026-08-28T08:15:00.000Z",
    acceptedAt: at,
  });
  const record = SubmitTurnRecordV1Alpha5Schema.parse({
    schemaVersion: "v1alpha5",
    transportContractVersion: "v1alpha5",
    submitTurnCommandId: bundle.submitTurnCommandId,
    clientTurnId: "client-turn-dfi541",
    desktopSessionId: "session.dfi541",
    internalSessionId: id("15"),
    requestDigest: plan.requestDigest,
    selectionRequest: {
      agentId: "agent.general",
      requestedModelId: fixture.modelLock.definitionSnapshot.capabilityId,
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      authorizationPreference: {
        schemaVersion: "v1alpha1", requestedMode: "task_scoped",
      },
      reasoningPreference: { requestedMode: "default" },
    },
    lockedAgent: fixture.selection.agent,
    registryRevision: fixture.selection.registryRevision,
    platformPromptRevision: fixture.selection.platformPromptRevision,
    plannedSelectionDigest: fixture.selection.selectionDigest,
    authorizationPlan: {
      requestedMode: bundle.selection.requestedMode,
      resolvedMode: bundle.selection.resolvedMode,
      policyRevision: bundle.selection.policyRevision,
      source: bundle.selection.source,
      authorizationSelectionDigest: bundle.selection.authorizationSelectionDigest,
      executionSelectionDigest: bundle.executionIdentity.executionSelectionDigest,
    },
    reasoningPlan: {
      reasoningModeLock: fixture.selection.reasoningModeLock,
      plannedRuntimeSelectionDigest: fixture.selection.selectionDigest,
      admissionEvidence: { state: "not_required" },
    },
    resourcePlan: {
      resourceEntitlementSnapshotDigest:
        fixture.selection.resourceEntitlementSnapshotDigest,
      agentResourceDecisionDigest: fixture.selection.agentResourceDecisionDigest,
      plannedRuntimeSelectionDigest: fixture.selection.selectionDigest,
      authorizationSelectionDigest: bundle.selection.authorizationSelectionDigest,
      executionSelectionDigest: bundle.executionIdentity.executionSelectionDigest,
      plannedTaskBundleDigest: bundle.submitTurnBinding.bundleDigest,
      plannedInstructionBindingDigest: bundle.taskInstructionBinding.bindingDigest,
      modelLockId: fixture.selection.resolvedModelLock.lockId,
      toolLockIds: [],
      reasoningModeLockId: fixture.selection.reasoningModeLock.reasoningModeLockId,
      durableAcceptanceRevision: plan.planDigest,
      acceptanceReceiptIdentity: bundle.submitTurnCommandId,
    },
    capabilityLockIds: [fixture.modelLock.lockId],
    internalUserMessageId: bundle.userMessageId,
    internalTaskId: bundle.task.head.taskId,
    internalRuntimeSelectionId: fixture.selection.runtimeSelectionId,
    initialCheckpointId: bundle.task.checkpoint.checkpointId,
    status: "accepted",
    createdAt: at,
    updatedAt: at,
  });
  return createDfi541CoordinationEnvelopeV1({ record, acceptedPlan: plan });
}

function atomicBundleFixture() {
  const fixture = selectionFixture();
  const task = createInitialPersistedTask({
    taskId: fixture.modelLock.taskId,
    agentDefinition: { agentDefinitionId: id("13"), version: "1.0.0" },
    goal: "prove DFI-5.4.1 atomic durability",
    createdAt: at,
    deadlineAt: "2026-08-28T08:15:00.000Z",
  }, id("12"));
  const authorization = new TaskAuthorizationSelectionService().resolve({
    taskId: fixture.selection.taskId,
    runtimeSelection: fixture.selection,
    authorization: { kind: "legacy" },
    policySnapshot: createTaskAuthorizationModePolicySnapshot({
      policyId: "task-authorization-policy.dfi541.fixture",
      supportedModes: ["task_scoped"],
      legacyDefaultMode: "task_scoped",
      createdAt: at,
    }),
    createdAt: at,
  });
  if (!authorization.ok) throw new Error(authorization.error.code);
  const bindingMaterial = {
    submitTurnCommandId: id("10"),
    userMessageId: id("11"),
    task,
    capabilityLocks: [fixture.modelLock],
    runtimeSelection: fixture.selection,
    committedAt: at,
  };
  const submitTurnBinding = TaskSubmitTurnBindingSchema.parse({
    schemaVersion: "v1alpha1",
    submitTurnCommandId: bindingMaterial.submitTurnCommandId,
    taskId: task.head.taskId,
    userMessageId: bindingMaterial.userMessageId,
    runtimeSelectionId: fixture.selection.runtimeSelectionId,
    bundleDigest: sha256CanonicalJson(JsonValueSchema.parse(bindingMaterial)),
    committedAt: at,
  });
  const taskInstructionBinding =
    deriveTaskInstructionBindingV1FromValidatedSelectionV1Alpha4({
      runtimeSelection: fixture.selection,
      submitTurnBundleDigest: submitTurnBinding.bundleDigest,
    });
  return {
    ...bindingMaterial,
    selection: authorization.selection,
    executionIdentity: authorization.executionIdentity,
    submitTurnBinding,
    taskInstructionBinding,
    admissionEvidence: { state: "not_required" as const },
  };
}

function createPlan(fixture: ReturnType<typeof selectionFixture>) {
  return createDurableDfi541AcceptancePlanV1({
    schemaVersion: "v1", submitTurnCommandId: id("10"),
    internalTaskId: fixture.modelLock.taskId, userMessageId: id("11"),
    requestDigest: digest("8"), runtimeSelection: fixture.selection,
    taskInstructionBinding: fixture.instructionBinding,
    admissionEvidence: { state: "not_required" },
    invocationDeadlineAt: "2026-08-28T08:15:00.000Z", acceptedAt: at,
  });
}

function selectionFixture() {
  const modelLock = createModelLock();
  const modelLockDigest = sha256CanonicalJson(JsonValueSchema.parse(modelLock));
  const reasoningModeLock = createReasoningModeLockV1Alpha2({
    schemaVersion: "v1alpha2", reasoningModeLockId: id("4"),
    taskId: modelLock.taskId,
    modelLockRef: { lockId: modelLock.lockId, lockDigest: modelLockDigest },
    lockedAt: at, requestedMode: "default", resolution: "default_passthrough",
  });
  const selection = createTaskRuntimeSelectionV1Alpha4({
    schemaVersion: "v1alpha4", runtimeSelectionId: id("5"),
    taskId: modelLock.taskId,
    agent: { agentDefinitionId: "agent.general", revision: digest("1"),
      digest: digest("1") },
    agentResourceDecisionDigest: digest("2"),
    resourceEntitlementSnapshotDigest: digest("3"),
    modelSelectionSource: "stable_fallback",
    resolvedModelLock: { lockId: modelLock.lockId,
      capabilityId: modelLock.definitionSnapshot.capabilityId, lockDigest: modelLockDigest },
    activeSkillRevisions: [], toolLocks: [], knowledgeRevisions: [],
    reasoningModeLock, platformPromptRevision: digest("4"),
    registryRevision: modelLock.registryRevision, createdAt: at,
  });
  const bundleDigest = digest("7");
  const instructionBinding = deriveTaskInstructionBindingV1FromValidatedSelectionV1Alpha4({
    runtimeSelection: selection, submitTurnBundleDigest: bundleDigest,
  });
  const submitTurnBinding = TaskSubmitTurnBindingSchema.parse({
    schemaVersion: "v1alpha1", submitTurnCommandId: id("10"),
    taskId: modelLock.taskId, userMessageId: id("11"),
    runtimeSelectionId: selection.runtimeSelectionId,
    bundleDigest, committedAt: at,
  });
  const subject = {
    modelCapabilityId: modelLock.definitionSnapshot.capabilityId,
    modelCapabilityRevision: modelLock.definitionSnapshot.revision,
    adapterDescriptorId: modelLock.adapterDescriptorSnapshot.adapterDescriptorId,
    adapterDescriptorRevision: modelLock.adapterDescriptorSnapshot.revision,
    authority: "central_enterprise" as const,
  };
  return { modelLock, selection, instructionBinding, submitTurnBinding, subject };
}

function createModelLock(): TaskCapabilityLock {
  const source = { trust: "official" as const, packageId: "robothree.official.dfi541",
    packageRevision: digest("8") };
  const descriptor = createAdapterDescriptor({ schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.dfi541", adapterKind: "model_provider",
    source, implementationRef: "core:dfi541-fixture", runtimeBoundary: "in_process",
    protocol: { name: "fixture-model", version: "v1alpha1" } });
  const definition = createCapabilityDefinition({ schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.dfi541", kind: "model", name: "DFI-5.4.1 model",
    description: "Exact model fixture", source,
    model: { family: "fixture", inputModalities: ["text"], outputModalities: ["text"],
      contextWindow: 128_000, supportsStreaming: true } });
  const binding = createCapabilityBinding({ schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.dfi541",
    capability: { capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision },
    adapterDescriptor: { adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision },
    port: "model_provider", source });
  return { schemaVersion: CONTRACT_VERSION, lockId: id("3"), taskId: id("2"),
    registryRevision: digest("a"), definitionSnapshot: definition,
    bindingSnapshot: binding, adapterDescriptorSnapshot: descriptor, lockedAt: at };
}
