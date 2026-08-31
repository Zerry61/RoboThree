import process from "node:process";
import { writeFileSync } from "node:fs";

import { CONTRACT_VERSION } from "../../../../packages/contracts/dist/index.js";
import {
  AgentResourceDecisionPlanner,
  BuiltInGeneralAgentSource,
  CapabilityResolver,
  FakeAgentLoopStarter,
  FakeClock,
  FixedTaskAuthorizationModePolicyProvider,
  InMemoryReasoningProfileSource,
  ReasoningModeLockPlanner,
  R2D3DurableAcceptancePlanner,
  RegistryBuilder,
  SqliteConversationPersistence,
  SqliteDesktopFoundationPersistence,
  SqliteSubmitTurnPersistence,
  SqliteTaskPersistence,
  SubmitTurnCoordinator,
  TaskCapabilityLockService,
  TaskLockedReasoningProfileSubjectResolver,
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
  createModelDefinition,
  createTaskResourceEntitlementSnapshotV1,
} from "../../dist/index.js";

const [commandName, databasePath, windowName = "none", timeSeed = fixedAt()] =
  process.argv.slice(2);
const sessionId = uuid(1);
const desktopSessionId = `session:${sessionId}`;
const submitTurnCommandId = uuid(10);
const subjectBindingDigest = digest("1");
const clock = new FakeClock(timeSeed);
const ids = deterministicIds(100);
const authorityCounts = authorityCounter();
const loop = new FakeAgentLoopStarter();
const diagnostics = {
  sqliteHandles: new Set(),
  credentialResolutions: new Set(),
  dnsLookups: new Set(),
  sockets: new Set(),
  tlsHandshakes: new Set(),
  httpBodies: new Set(),
  invocationLinks: new Set(),
  capabilityLocks: new Set(),
  agentResolutionLeases: new Set(),
  entitlementSnapshotLeases: new Set(),
  timeoutSchedulers: new Set(),
  providerRequests: new Set(),
  contextMaterializers: new Set(),
  compactionJobs: new Set(),
  usageProjections: new Set(),
  lateCallbacks: new Set(),
};

const persistenceFault = commandName === "prepare"
  ? barrierFault([
      ["accepted_after_commit", "submit_turn.accepted.after_commit"],
      ["message_appended_after_commit", "submit_turn.message_appended.after_commit"],
      ["task_committed_after_commit", "submit_turn.task_committed.after_commit"],
      ["completed_after_commit", "submit_turn.completed.after_commit"],
    ])
  : noFault;
const coordinatorFault = commandName === "prepare"
  ? barrierFault([
      ["task_bundle_after_commit", "submit_turn.coordinator.after_task_bundle"],
    ])
  : noFault;

const conversation = new SqliteConversationPersistence({ databasePath, clock });
const foundation = new SqliteDesktopFoundationPersistence({ databasePath, clock });
const tasks = new SqliteTaskPersistence({ databasePath, clock });
const coordination = new SqliteSubmitTurnPersistence({
  databasePath,
  clock,
  faultInjector: persistenceFault,
});
for (const item of [conversation, foundation, tasks, coordination]) {
  diagnostics.sqliteHandles.add(item);
}

try {
  await conversation.start();
  await foundation.start();
  await tasks.start();
  await coordination.start();
  if (commandName === "prepare" || commandName === "run") await seedSession();
  const runtime = runtimeFixture();
  const capabilityLocks = new TaskCapabilityLockService({
    resolver: new CapabilityResolver(runtime.registry),
    persistence: tasks,
    clock,
    idGenerator: ids,
  });
  const entitlement = createTaskResourceEntitlementSnapshotV1({
    schemaVersion: "v1",
    subjectBindingDigest,
    authorityKind: "runtime_active_enterprise_identity",
    authorityRevision: digest("2"),
    observedAt: timeSeed,
    models: [{ ...runtime.modelRef, stableOrdinal: 10 }],
    skills: [],
    tools: [],
    knowledge: [],
    identityEvidence: { testIdentityUsed: true, productionIdentityReady: false },
  });
  const planner = new R2D3DurableAcceptancePlanner({
    clock,
    ids,
    builtInAgent: new BuiltInGeneralAgentSource(),
    decisionPlanner: new AgentResourceDecisionPlanner(),
    authorizationPolicies: new FixedTaskAuthorizationModePolicyProvider(),
    reasoningPlanner: new ReasoningModeLockPlanner({
      profiles: new InMemoryReasoningProfileSource([]),
      subjects: new TaskLockedReasoningProfileSubjectResolver(),
    }),
    entitlements: {
      async loadExact() {
        authorityCounts.entitlement += 1;
        diagnostics.entitlementSnapshotLeases.add("entitlement");
        try {
          return globalThis.structuredClone(entitlement);
        } finally {
          diagnostics.entitlementSnapshotLeases.delete("entitlement");
        }
      },
    },
    toolPolicy: {
      async resolveExact(input) {
        authorityCounts.toolPolicy += 1;
        return {
          registryRevision: input.registryRevision,
          authorityFactsDigest: digest("3"),
          candidates: [],
        };
      },
    },
    authority: authority(runtime, capabilityLocks),
  });
  const coordinator = new SubmitTurnCoordinator({
    clock,
    ids,
    conversation,
    sessions: foundation,
    tasks,
    selection: {},
    selectionContexts: {},
    coordination,
    loopStarter: loop,
    r2dCoreDeltaEnabled: true,
    r2d3AcceptancePlanner: planner,
    faultInjector: coordinatorFault,
  });

  if (commandName === "prepare") {
    await coordinator.submitV1Alpha3(command());
    throw new Error(`r2d4_barrier_not_reached:${windowName}`);
  }
  if (commandName === "recover") {
    const result = await coordinator.resume(submitTurnCommandId);
    if (!result.ok) throw new Error(result.error.code);
    const loopCountBeforeReplay = loop.startedCount();
    const replay = await coordinator.submitV1Alpha3(command());
    if (!replay.ok) throw new Error(replay.error.code);
    await emitResult("recovered", loop.startedCount() - loopCountBeforeReplay);
  } else if (commandName === "run") {
    const result = await coordinator.submitV1Alpha3(command());
    if (!result.ok) throw new Error(result.error.code);
    await emitResult("completed");
  } else {
    throw new Error(`r2d4_child_command_invalid:${String(commandName)}`);
  }
} finally {
  await close(conversation);
  await close(foundation);
  await close(tasks);
  await close(coordination);
}

async function seedSession() {
  if (await conversation.loadSession(sessionId) === undefined) {
    const created = await conversation.createSession({
      schemaVersion: "v1alpha1",
      sessionId,
      messageSequence: 0,
      sessionEventSequence: 0,
      contextRevision: 0,
      createdAt: timeSeed,
      updatedAt: timeSeed,
    });
    if (!created.ok) throw new Error(created.error.code);
  }
  if (await foundation.loadDesktopSession(desktopSessionId) !== undefined) return;
  const prepared = await foundation.prepareDesktopSessionCreation({
    commandId: uuid(2),
    requestDigest: digest("8"),
    internalSessionId: sessionId,
    desktopSessionId,
    preparedAt: timeSeed,
  });
  if (!prepared.ok) throw new Error(prepared.error.code);
  const committed = await foundation.commitDesktopSessionCreation({
    record: {
      internalSessionId: sessionId,
      summary: {
        sessionId: desktopSessionId,
        revision: 0,
        title: "R2D-4 controlled session",
        tombstoned: false,
        createdAt: timeSeed,
        updatedAt: timeSeed,
      },
    },
    commandId: uuid(2),
    requestDigest: digest("8"),
    committedAt: timeSeed,
  });
  if (!committed.ok) throw new Error(committed.error.code);
}

function authority(runtime, capabilityLocks) {
  return {
    async loadExactAgent() {
      authorityCounts.exactAgent += 1;
      diagnostics.agentResolutionLeases.add("agent");
      diagnostics.agentResolutionLeases.delete("agent");
      return undefined;
    },
    async captureSubjectBindings() {
      authorityCounts.subject += 1;
      return {
        acceptanceLeaseId: uuid(901),
        verifiedRuntimeSubjectBindingDigest: subjectBindingDigest,
        acceptedClientBindingDigest: digest("4"),
      };
    },
    async captureRegistrySnapshot() {
      authorityCounts.registry += 1;
      return {
        schemaVersion: "v1",
        registryRevision: runtime.registry.registryRevision,
        models: [{
          ref: runtime.modelRef,
          capabilities: runtime.model.capabilities,
          available: true,
        }],
        skills: [],
        tools: [],
        knowledge: [],
        knowledgeProviderReady: false,
      };
    },
    async captureWorkspaceAndAuthorizationFacts() {
      authorityCounts.workspaceAuthorization += 1;
      return {
        schemaVersion: "v1",
        factsDigest: digest("5"),
        models: [runtime.modelRef],
        skills: [],
        tools: [],
        knowledge: [],
      };
    },
    async loadExactUserModelPreference() {
      authorityCounts.preference += 1;
      return runtime.modelRef;
    },
    async prepareExactCapabilityLocks(input) {
      authorityCounts.capabilityLocks += 1;
      return [capabilityLocks.prepare({
        taskId: input.taskId,
        registryRevision: input.registrySnapshot.registryRevision,
        capabilityId: input.decision.resolvedModelRef.modelId,
        lockId: input.orderedLockIds[0],
        lockedAt: input.lockedAt,
      }).lock];
    },
  };
}

async function emitResult(outcome, replayLoopStartDelta = 0) {
  const envelope = await coordination.loadR2D3Envelope(submitTurnCommandId);
  const bundle = await tasks.loadR2D3SubmitTurnTaskBundle(submitTurnCommandId);
  if (envelope === undefined || bundle === undefined) {
    throw new Error("r2d4_exact_durable_material_missing");
  }
  const plan = envelope.acceptedPlan;
  const messages = await conversation.loadMessageRange(sessionId, 1, Number.MAX_SAFE_INTEGER);
  const deliveries = await coordination.listDeliveriesAfter(0, 10);
  const resourceCounts = await terminalResourceCounts();
  process.send?.({
    type: "result",
    result: {
      outcome,
      window: windowName,
      processId: process.pid,
      coordinationStatus: envelope.record.status,
      acceptedPlanDigest: plan.planDigest,
      entitlementSnapshotDigest: plan.resourceEntitlementSnapshotDigest,
      agentResourceDecisionDigest: plan.agentResourceDecision.decisionDigest,
      runtimeSelectionDigest: plan.runtimeSelection.selectionDigest,
      reasoningModeLockId: plan.runtimeSelection.reasoningModeLock.reasoningModeLockId,
      reasoningModeLockDigest: plan.runtimeSelection.reasoningModeLock.lockDigest,
      taskInstructionBindingDigest: plan.taskInstructionBinding.bindingDigest,
      desktopDefaultModelProjection: plan.runtimeSelection.resolvedModelLock.capabilityId,
      timeFacts: {
        acceptedAt: plan.acceptedAt,
        createdAt: plan.runtimeSelection.createdAt,
        lockedAt: plan.capabilityLocks[0].lockedAt,
        observedAt: timeSeed,
        committedAt: plan.submitTurnBinding.committedAt,
      },
      authorityCounts,
      loopStartedCount: loop.startedCount(),
      replayLoopStartDelta,
      messageCount: messages.length,
      deliveryCount: deliveries.length,
      resourceCounts,
      testIdentityUsed: true,
      productionR2dGateEnabled: false,
      productionCpcActivationEnabled: false,
      productionEnterpriseEntitlementReady: false,
    },
  });
}

async function terminalResourceCounts() {
  const pendingCoordination = (await coordination.listRecoverable(100)).length;
  await close(conversation);
  await close(foundation);
  await close(tasks);
  await close(coordination);
  return {
    openSqliteHandles: diagnostics.sqliteHandles.size,
    preparedInvocationLinks: diagnostics.invocationLinks.size,
    pendingCoordination,
    activeCapabilityLocks: diagnostics.capabilityLocks.size,
    activeAgentResolutionLeases: diagnostics.agentResolutionLeases.size,
    activeEntitlementSnapshotLeases: diagnostics.entitlementSnapshotLeases.size,
    activeTimeoutSchedulers: diagnostics.timeoutSchedulers.size,
    activeProviderRequests: diagnostics.providerRequests.size,
    activeContextMaterializers: diagnostics.contextMaterializers.size,
    activeCompactionJobs: diagnostics.compactionJobs.size,
    lateCallbacks: diagnostics.lateCallbacks.size,
  };
}

function barrierFault(entries) {
  const target = entries.find(([name]) => name === windowName)?.[1];
  return (point) => {
    if (point !== target) return;
    const evidence = {
      type: "barrier",
      name: windowName,
      point,
      processId: process.pid,
      authorityCounts: globalThis.structuredClone(authorityCounts),
      upstreamCounts: currentUpstreamCounts(),
    };
    writeFileSync(
      `${databasePath}.${windowName}.barrier.json`,
      JSON.stringify(evidence),
      "utf8",
    );
    process.send?.(evidence);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  };
}

function noFault() {}

function currentUpstreamCounts() {
  return {
    credentialResolve: diagnostics.credentialResolutions.size,
    providerResolve: diagnostics.providerRequests.size,
    dns: diagnostics.dnsLookups.size,
    socket: diagnostics.sockets.size,
    tls: diagnostics.tlsHandshakes.size,
    httpBody: diagnostics.httpBodies.size,
    invocationLink: diagnostics.invocationLinks.size,
    usage: diagnostics.usageProjections.size,
    agentLoop: loop.startedCount(),
    compaction: diagnostics.compactionJobs.size,
  };
}

function runtimeFixture() {
  const source = {
    trust: "official",
    packageId: "robothree.official.r2d4",
    packageRevision: digest("a"),
  };
  const capability = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.r2d4-controlled",
    kind: "model",
    name: "R2D-4 Controlled Model",
    description: "Controlled closure-only model",
    source,
    model: {
      family: "controlled",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 32_768,
      supportsStreaming: true,
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.r2d4-controlled",
    adapterKind: "model_provider",
    source,
    implementationRef: "process:r2d4-controlled",
    runtimeBoundary: "child_process",
    protocol: { name: "r2d4-controlled", version: "v1" },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.r2d4-controlled",
    capability: {
      capabilityId: capability.capabilityId,
      capabilityRevision: capability.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "model_provider",
    source,
  });
  const registry = new RegistryBuilder({ trustedSources: [source] })
    .registerCapability(capability)
    .registerAdapterDescriptor(descriptor)
    .registerBinding(binding)
    .finalize();
  const model = createModelDefinition({
    schemaVersion: "v1alpha1",
    modelId: capability.capabilityId,
    name: capability.name,
    source: "official",
    capability: {
      capabilityId: capability.capabilityId,
      capabilityRevision: capability.revision,
    },
    capabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: false,
      supportsStreaming: true,
      contextWindow: 32_768,
    },
    createdAt: timeSeed,
  });
  return {
    registry,
    model,
    modelRef: {
      modelId: model.modelId,
      revision: model.capability.capabilityRevision,
      digest: model.capability.capabilityRevision,
    },
  };
}

function command() {
  return {
    contractVersion: "v1alpha3",
    commandId: submitTurnCommandId,
    correlationId: uuid(11),
    clientInstanceId: uuid(12),
    type: "submit_turn",
    clientTurnId: "r2d4-client-turn-1",
    sessionId: desktopSessionId,
    userInput: "Run the controlled R2D-4 closure task",
    selectionRequest: {
      agentId: "agent.general",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
      authorizationPreference: {
        schemaVersion: "v1alpha1",
        requestedMode: "task_scoped",
      },
      reasoningPreference: { requestedMode: "default" },
    },
  };
}

async function close(adapter) {
  if (!diagnostics.sqliteHandles.has(adapter)) return;
  await adapter.stop().catch(() => undefined);
  diagnostics.sqliteHandles.delete(adapter);
}

function authorityCounter() {
  return {
    exactAgent: 0,
    subject: 0,
    registry: 0,
    workspaceAuthorization: 0,
    preference: 0,
    capabilityLocks: 0,
    entitlement: 0,
    toolPolicy: 0,
  };
}

function deterministicIds(start) {
  let value = start;
  return { next: () => uuid(value++) };
}

function fixedAt() {
  return "2026-08-26T10:00:00.000Z";
}

function digest(marker) {
  return `sha256:${marker.repeat(64)}`;
}

function uuid(value) {
  return `019f9500-0000-7000-8000-${String(value).padStart(12, "0")}`;
}
