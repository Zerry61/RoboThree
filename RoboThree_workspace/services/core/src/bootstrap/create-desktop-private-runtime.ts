import {
  CONTRACT_VERSION,
  ActionSchema,
  JsonObjectSchema,
  RegistrySnapshotSchema,
  type Action,
  type AssistantToolCall,
  type JsonObject,
  type ToolRiskFactKind,
  type ToolAuthorizationContext,
} from "@robothree/contracts";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve, win32 } from "node:path";
import {
  PPTX_WRITE_CAPABILITY_ID,
  TEXT_FILE_WRITE_CAPABILITY_ID,
  TEXT_FILE_WRITE_LIMITS_REVISION,
  computePptxWriteRequestDigest,
  computeXlsxOverwriteRequestDigest,
  normalizePptxWriteOptions,
  normalizeXlsxWriteOptions,
} from "@robothree/document-worker";

import { FakeAgentToolCallExecutor } from "../adapters/fake/fake-agent-tool-call-executor.js";
import { ConservativeTokenEstimator } from "../adapters/fake/conservative-token-estimator.js";
import { DesktopDocumentScriptedModelProvider } from "../adapters/fake/desktop-document-scripted-model-provider.js";
import { createScriptedDesktopAgentFixture } from "../adapters/fake/scripted-desktop-agent-fixture.js";
import { DocumentWorkerToolBackend } from "../adapters/document-worker/document-worker-tool-backend.js";
import { CorePrivateHttpServer } from "../adapters/http/core-private-http-server.js";
import { HttpEnterpriseModelGatewayClient } from
  "../adapters/http/http-enterprise-model-gateway-client.js";
import { InternalTrialEnterpriseAccessTokenProvider } from
  "../adapters/environment/internal-trial-enterprise-access-token-provider.js";
import { InternalTrialAgentLifecycleAccessToken } from
  "../adapters/environment/internal-trial-agent-lifecycle-access-token.js";
import { HttpAgentLifecycleClient } from
  "../adapters/http/http-agent-lifecycle-client.js";
import { FrozenRegistrySnapshotProvider } from
  "../adapters/memory/frozen-registry-snapshot-provider.js";
import { EphemeralWorkspaceSelectionStore } from "../adapters/memory/ephemeral-workspace-selection-store.js";
import { FrozenRuntimeSelectionContextProvider } from "../adapters/memory/frozen-runtime-selection-context-provider.js";
import { InMemoryTrustedRuntimeCatalog } from "../adapters/memory/in-memory-trusted-runtime-catalog.js";
import { HmacCatalogCursorCodec } from "../adapters/node/hmac-catalog-cursor-codec.js";
import { NodeWorkspacePathResolver } from "../adapters/node/node-workspace-path-resolver.js";
import { NodeWorkspaceDirectoryReader } from "../adapters/node/node-workspace-directory-reader.js";
import { HmacWorkspaceBrowserProofCodec } from "../adapters/node/hmac-workspace-browser-proof-codec.js";
import { ProcessEchoToolBackend } from "../adapters/process-echo/process-echo-tool-backend.js";
import { SqliteConversationPersistence } from "../adapters/sqlite/sqlite-conversation-persistence.js";
import { SqliteDesktopFoundationPersistence } from "../adapters/sqlite/sqlite-desktop-foundation-persistence.js";
import { SqliteSubmitTurnPersistence } from "../adapters/sqlite/sqlite-submit-turn-persistence.js";
import { SqliteTaskPersistence } from "../adapters/sqlite/sqlite-task-persistence.js";
import { SqliteModelInvocationLinkPersistence } from
  "../adapters/sqlite/sqlite-model-invocation-link-persistence.js";
import { SqliteProviderUsageProjectionPersistence } from
  "../adapters/sqlite/sqlite-provider-usage-projection-persistence.js";
import { SqlitePromptCacheContextPersistence } from
  "../adapters/sqlite/sqlite-prompt-cache-context-persistence.js";
import { SqlitePersonalModelPersistence } from
  "../adapters/sqlite/sqlite-personal-model-persistence.js";
import { SqliteLocalPersonalModelInvocationPersistence } from
  "../adapters/sqlite/sqlite-local-personal-model-invocation-persistence.js";
import { SqliteDesktopReasoningModePreferencePersistence } from
  "../adapters/sqlite/sqlite-desktop-reasoning-mode-preference-persistence.js";
import { MacOsKeychainPersonalCredentialStore } from
  "../adapters/credential/macos-keychain-personal-credential-store.js";
import { createPersonalModelCredentialBrokerHandler } from
  "../adapters/credential/personal-model-credential-broker-handler.js";
import type { PersonalCredentialBrokerHandler } from
  "../adapters/credential/personal-credential-broker-server.js";
import { TaskBackedPersonalModelUsageGuard } from
  "../adapters/personal-model-task-usage-guard.js";
import type { PersonalCredentialHelperDescriptor } from
  "../adapters/credential/personal-credential-helper-trust.js";
import { InMemoryReasoningProfileSource } from
  "../adapters/memory/in-memory-reasoning-profile-source.js";
import { SystemClock } from "../adapters/system-clock.js";
import { SystemIdGenerator } from "../adapters/system-id-generator.js";
import { SystemScheduler } from "../adapters/system-scheduler.js";
import { ToolEffectExecutor } from "../adapters/tool/tool-effect-executor.js";
import { AgentLoopCoordinator } from "../application/agent-loop-coordinator.js";
import { AuthorizationEvaluator } from "../application/authorization-evaluator.js";
import { ContextBudgetPolicy } from "../application/context-budget-policy.js";
import { ContextPipeline } from "../application/context-pipeline.js";
import { TaskInstructionBundleMaterializer } from
  "../application/instruction-bundle-compiler.js";
import { DesktopApplicationFacade } from "../application/desktop-application-facade.js";
import { InternalTrialAgentLifecycleSource } from
  "../application/internal-trial-agent-lifecycle-source.js";
import { ProductionPersonalModelManagementAuthoritySource } from
  "../application/personal-model-management-authority.js";
import { PersonalModelManagementReadService } from
  "../application/personal-model-management-read-service.js";
import { PersonalModelManagementCommandService } from
  "../application/personal-model-management-command-service.js";
import {
  PersonalModelCredentialCoordinator,
  PersonalModelCredentialRecoveryCoordinator,
} from "../application/personal-model-credential-coordinator.js";
import {
  PersonalModelCredentialRevealService,
  PersonalModelRevealAttemptRegistry,
} from "../application/personal-model-credential-reveal-service.js";
import { InMemoryPersonalModelOperationGate } from
  "../application/personal-model-operation-gate.js";
import { DesktopConversationProjectionService } from "../application/desktop-conversation-projection-service.js";
import { DesktopEphemeralEventBus } from "../application/desktop-ephemeral-event-bus.js";
import { DesktopSessionService } from "../application/desktop-session-service.js";
import { DesktopTaskProjectionService } from "../application/desktop-task-projection-service.js";
import { TaskReasoningModeProjectionService } from
  "../application/task-reasoning-mode-projection-service.js";
import { ReasoningModePreviewService } from
  "../application/reasoning-mode-preview-service.js";
import { ReasoningModePreferenceService } from
  "../application/reasoning-mode-preference-service.js";
import {
  LocalDesktopReasoningModeOwnerAuthorityProvider,
  LocalPersonalEffectiveReasoningModelResolver,
} from "../application/local-desktop-reasoning-runtime.js";
import {
  RobotCatalogQueryService,
  ToolCatalogQueryService,
} from "../application/catalog-query-service.js";
import {
  CoordinatorDesktopConfirmationDecisionGateway,
  DesktopTaskControlService,
} from "../application/desktop-task-control-service.js";
import { Dcf2cDemoAgentRunner } from "../application/dcf2c-demo-agent-runner.js";
import { DurableAgentConversationWriter } from "../application/durable-agent-conversation-writer.js";
import { ToolCallBatchCoordinator } from "../application/tool-call-batch-coordinator.js";
import { ToolExecutionAgentBridge } from "../application/tool-execution-agent-bridge.js";
import { DurableAgentLoopStarter } from "../application/durable-agent-loop-starter.js";
import { ActiveAgentLoopStartupRecoveryCoordinator } from
  "../application/active-agent-loop-startup-recovery.js";
import { DurableEnterpriseModelProvider } from
  "../application/durable-enterprise-model-provider.js";
import { PersistentSessionScopeDigestProvider } from
  "../application/session-scope-digest-provider.js";
import { TaskLockedReasoningProviderMapper } from
  "../application/task-locked-reasoning-provider-mapper.js";
import { ReleasePinnedReasoningMappingRegistry } from
  "../application/release-pinned-reasoning-mapping-registry.js";
import { createEnterpriseReasoningTimeoutPolicyIdentity } from
  "../application/enterprise-reasoning-mapping.js";
import { FailClosedModelProvider } from
  "../application/fail-closed-model-provider.js";
import { DurableTaskRuntime } from "../application/durable-task-runtime.js";
import { EffectCoordinator } from "../application/effect-coordinator.js";
import { ModelEligibilityEvaluator } from "../application/model-eligibility-evaluator.js";
import { FixedTaskAuthorizationModePolicyProvider } from
  "../application/fixed-task-authorization-mode-policy.js";
import { R2D3_CORE_DELTA_DEFAULT_ENABLED } from
  "../application/r2d3-durable-acceptance-planner.js";
import {
  R2DP3_DESKTOP_V1ALPHA4_DEFAULT_ENABLED,
  assertR2DP3ProductionReleaseDecision,
} from "../application/desktop-v1alpha4-cutover.js";
import { DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_ENABLED } from
  "../application/dfi543a-local-personal-production-graph.js";
import {
  LocalPersonalAdmittedReasoningProfileSource,
  LocalPersonalDfi541AdmissionInputSource,
  TaskPinnedReasoningReleaseResolver,
} from "../application/dfi543a-local-personal-release.js";
import { Dfi543LocalPersonalSubmitTurnHandler } from
  "../application/dfi543a-local-personal-submit-turn-handler.js";
import { Dfi541ExactSubjectProviderReleaseAdmissionResolver } from
  "../application/dfi541-provider-release-admission.js";
import { ExactSubjectBoundProviderReleaseMaterializer } from
  "../application/exact-subject-provider-release-materializer.js";
import { ReasoningModeLockPlanner } from
  "../application/reasoning-mode-lock-planner.js";
import { ReasoningModeLockPlannerV1Alpha2 } from
  "../application/reasoning-mode-lock-planner-v1alpha2.js";
import { TaskLockedReasoningProfileSubjectResolver } from
  "../application/reasoning-mode-lock-planner.js";
import { createLocalDesktopR2DProductionComposition } from
  "../application/local-desktop-r2d-production.js";
import { PersonalModelRuntimeRegistry } from
  "../application/personal-model-runtime-registry.js";
import { BuiltInGeneralAgentSource } from
  "../application/built-in-general-agent-source.js";
import {
  BuiltInPresentationAgentSource,
  createPresentationAgentCatalogProjection,
} from "../application/built-in-presentation-agent-source.js";
import {
  TrustedLocalSkillInstructionResolver,
  loadPresentationPlanningSkillManifest,
} from "../application/trusted-local-skill-instruction-resolver.js";
import { CompositeModelProviderResolver } from
  "../application/composite-personal-model-runtime.js";
import { LocalDesktopPersonalModelExecutionAuthorityProvider } from
  "../application/personal-model-execution-authority.js";
import { DurableCompositeTaskModelProviderResolver } from
  "../application/task-locked-model-provider-resolution.js";
import { LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1 } from
  "../application/model-invocation-timeout-policy.js";
import { LegacyTaskAuthorizationSelectionMaterializer } from
  "../application/legacy-task-authorization-selection-materializer.js";
import {
  CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED,
  TaskLockedInstructionRuntimeResolver,
  platformPromptRevisionForNewTask,
} from "../application/task-locked-instruction-runtime.js";
import {
  createAgentDefinitionRevision,
  createModelDefinition,
} from "../application/runtime-selection-revisions.js";
import {
  RuntimeCatalogProjectionService,
  RuntimeSelectionService,
} from "../application/runtime-selection-service.js";
import { SubmitTurnCoordinator } from "../application/submit-turn-coordinator.js";
import { SubmitTurnRecoveryCoordinator } from "../application/submit-turn-recovery-coordinator.js";
import { RuntimeAdmissionController } from "../application/runtime-admission-controller.js";
import { TaskCapabilityLockService } from "../application/task-capability-lock-service.js";
import { TurnSnapshotBuilder } from "../application/turn-snapshot-builder.js";
import { ToolExecutionService } from "../application/tool-execution-service.js";
import { deriveWorkspaceTextArtifactProof } from
  "../application/workspace-text-artifact-authority.js";
import { workspaceTextPostconditionToEffectQueryResult } from
  "../application/workspace-text-effect-recovery.js";
import { UserConfirmationCoordinator } from "../application/user-confirmation-coordinator.js";
import { WorkspaceGrantService } from "../application/workspace-grant-service.js";
import { WorkspaceBrowserService } from "../application/workspace-browser-service.js";
import { WorkspaceRevealAuthorityService } from "../application/workspace-reveal-authority-service.js";
import { CapabilityResolver } from "../registry/capability-resolver.js";
import {
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
} from "../registry/capability-revision.js";
import {
  DOCUMENT_TOOL_REGISTRY_RECORDS,
  DOCUMENT_TOOL_SOURCE,
  registerDocumentToolRecords,
} from "../registry/document-tool-registry.js";
import {
  WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR,
  WORKSPACE_TEXT_TOOL_BINDING,
  WORKSPACE_TEXT_TOOL_DEFINITION,
  WORKSPACE_TEXT_TOOL_SOURCE,
  registerWorkspaceTextToolRecords,
} from "../registry/workspace-text-tool-registry.js";
import { isDocumentToolCapabilityId } from "../application/document-tool-context.js";
import { RegistryBuilder } from "../registry/registry-builder.js";
import { RuntimeAdapterHandles } from "../registry/runtime-adapter-handles.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  AgentResourceRegistrySnapshotV1Schema,
  type ExactResourcePermissionsV1,
} from "../application/agent-resource-decision-planner.js";
import { createInternalTrialEnterpriseR2DProductionComposition } from
  "../application/internal-trial-enterprise-r2d-production.js";
import type { AgentLoopStarter } from "../ports/agent-loop-starter.js";
import type { Clock } from "../ports/clock.js";
import type {
  ArtifactLifecyclePersistence,
  ManualArtifactRegistrationPersistence,
  WorkspaceGrantPersistence,
} from "../ports/desktop-foundation-persistence.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import {
  consumeInternalTrialEnterpriseModelDeployment,
  type InternalTrialEnterpriseModelDeployment,
} from
  "./internal-trial-enterprise-model-deployment.js";

const CORE_VERSION = "0.0.0-dfi.4a.4.2";
const FIXTURE_CREATED_AT = "2026-07-26T00:00:00.000Z";
const DOCUMENT_TOOL_LIMITS = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  maxOutputBytes: 256 * 1024,
  maxPageCount: 200,
  maxDecompressionRatio: 100,
});
const digest = (marker: string) => `sha256:${marker.repeat(64)}` as const;
const source = {
  trust: "official" as const,
  packageId: "robothree.official.desktop-alpha",
  packageRevision: digest("a"),
};

export type DesktopPrivateRuntime = Readonly<{
  facade: DesktopApplicationFacade;
  server: CorePrivateHttpServer;
  personalCredentialBrokerHandler: PersonalCredentialBrokerHandler;
  testOnlyIssueWorkspaceSelection?(input: Readonly<{
    selectedPath: string;
    clientInstanceId: string;
    correlationId: string;
  }>): string;
  start(): Promise<void>;
  stop(): Promise<void>;
}>;

type XlsxOverwriteConfirmationMaterial = Readonly<{
  confirmedOldSha256: string;
  requestDigest: string;
}>;

export function createDesktopPrivateRuntime(input: {
  databasePath: string;
  authorizationToken: string;
  clientInstanceId?: string;
  demoMode?: "dcf2c" | "legacy_test";
  credentialHelperDescriptor?: PersonalCredentialHelperDescriptor;
  sensitiveTransportProductionReady?: boolean;
  environment?: Record<string, string | undefined>;
  dfi543TestHarness?: Readonly<{
    credentialHelperDescriptor: PersonalCredentialHelperDescriptor;
    providerCaPem: string;
    providerPort: number;
  }>;
  vs1TestHarness?: true;
}): DesktopPrivateRuntime {
  assertR2DP3ProductionReleaseDecision();
  const demoMode = input.demoMode === "dcf2c";
  const legacyTestMode = input.demoMode === "legacy_test";
  const fixtureMode = demoMode || legacyTestMode;
  const activeUserId = "00000000-0000-4000-8000-000000000001";
  const clock = new SystemClock();
  const ids = new SystemIdGenerator();
  const environment = input.environment ?? process.env;
  const internalTrialDeployment = fixtureMode ? undefined
    : consumeInternalTrialEnterpriseModelDeployment({ environment });
  const internalTrialTokenProvider = fixtureMode ? undefined
    : InternalTrialEnterpriseAccessTokenProvider.consume({ environment, clock });
  const internalTrialAgentLifecycleToken = fixtureMode ? undefined
    : InternalTrialAgentLifecycleAccessToken.consume({ environment, clock });
  if ((internalTrialDeployment === undefined)
    !== (internalTrialTokenProvider === undefined)) {
    throw new Error("internal_trial_model_runtime_incomplete");
  }
  if (internalTrialAgentLifecycleToken !== undefined
    && internalTrialDeployment === undefined) {
    throw new Error("internal_trial_agent_lifecycle_runtime_incomplete");
  }
  const agentLifecycleSource = new InternalTrialAgentLifecycleSource();
  const agentLifecycleClient = internalTrialAgentLifecycleToken === undefined
    || internalTrialDeployment === undefined
    ? undefined
    : new HttpAgentLifecycleClient({
      baseUrl: internalTrialDeployment.centralBaseUrl,
      token: internalTrialAgentLifecycleToken,
      allowInsecureLoopback: internalTrialDeployment.allowInsecureLoopback,
    });
  const runtimeInstanceId = `runtime.instance-${ids.next()}`;
  const ephemeralEvents = new DesktopEphemeralEventBus({
    clock,
    ids,
    runtimeInstanceId,
  });
  let runtimeStatus: "starting" | "ready" | "stopping" | "failed" = "starting";

  const conversation = new SqliteConversationPersistence({
    databasePath: input.databasePath,
    clock,
  });
  const foundation = new SqliteDesktopFoundationPersistence({
    databasePath: input.databasePath,
    clock,
  });
  const tasks = new SqliteTaskPersistence({
    databasePath: input.databasePath,
    clock,
  });
  const coordination = new SqliteSubmitTurnPersistence({
    databasePath: input.databasePath,
    clock,
  });
  const personalModels = new SqlitePersonalModelPersistence({
    databasePath: input.databasePath,
    clock,
  });
  const personalInvocations = new SqliteLocalPersonalModelInvocationPersistence({
    databasePath: input.databasePath,
    clock,
  });
  const reasoningPreferencePersistence =
    new SqliteDesktopReasoningModePreferencePersistence({
    databasePath: input.databasePath,
    clock,
  });
  const enterpriseInvocationLinks = new SqliteModelInvocationLinkPersistence({
    databasePath: input.databasePath,
    clock,
  });
  const enterpriseUsageProjections = new SqliteProviderUsageProjectionPersistence({
    databasePath: input.databasePath,
    clock,
  });
  const enterprisePromptCacheContexts = new SqlitePromptCacheContextPersistence({
    databasePath: input.databasePath,
    clock,
  });
  const personalCredentials = new MacOsKeychainPersonalCredentialStore({
    ...(input.dfi543TestHarness !== undefined
      ? { descriptor: input.dfi543TestHarness.credentialHelperDescriptor }
      : input.credentialHelperDescriptor === undefined
        ? {}
        : { descriptor: input.credentialHelperDescriptor }),
  });
  const workspaceSelections = new EphemeralWorkspaceSelectionStore({
    clock,
    ids,
  });
  const runtime = runtimeFixture({ demoMode, legacyTestMode });
  const activeRegistry = internalTrialDeployment === undefined
    ? runtime.registry
    : mergeRegistrySnapshots(
      runtime.registry,
      internalTrialDeployment.registrySnapshot,
    );
  const catalog = new InMemoryTrustedRuntimeCatalog();
  const builtInGeneralAgent = new BuiltInGeneralAgentSource().loadDefault();
  const presentationSkill = internalTrialDeployment === undefined
    ? undefined
    : loadPresentationPlanningSkillManifest();
  const presentationToolCapabilityIds = [
    "tool.document.docx.read",
    "tool.document.xlsx.read",
    "tool.document.pdf.extract_text",
    PPTX_WRITE_CAPABILITY_ID,
  ] as const;
  const presentationToolDefinitions = internalTrialDeployment === undefined
    ? []
    : presentationToolCapabilityIds.map((capabilityId) =>
      DOCUMENT_TOOL_REGISTRY_RECORDS.definitions.find(
        (definition) => definition.capabilityId === capabilityId,
      ));
  if (internalTrialDeployment !== undefined
    && (presentationSkill === undefined
      || presentationToolDefinitions.some((definition) => definition === undefined))) {
    throw new Error("internal_trial_presentation_runtime_incomplete");
  }
  const presentationToolRefs = presentationToolDefinitions.map((definition) => ({
    capabilityId: definition!.capabilityId,
    capabilityRevision: definition!.revision,
  }));
  const generalToolRefs = internalTrialDeployment === undefined
    ? presentationToolRefs
    : [...presentationToolRefs, {
      capabilityId: WORKSPACE_TEXT_TOOL_DEFINITION.capabilityId,
      capabilityRevision: WORKSPACE_TEXT_TOOL_DEFINITION.revision,
    }];
  const presentationSkillRef = presentationSkill === undefined
    ? undefined
    : {
      skillId: presentationSkill.skillId,
      revision: presentationSkill.revision,
      contentDigest: presentationSkill.contentDigest,
    };
  const presentationAgent = internalTrialDeployment === undefined
    || presentationToolRefs.length === 0
    || presentationSkillRef === undefined
    ? undefined
    : new BuiltInPresentationAgentSource({
      model: {
        modelId: internalTrialDeployment.capability.capabilityId,
        revision: internalTrialDeployment.capability.revision,
        digest: internalTrialDeployment.capability.revision,
      },
      skill: presentationSkillRef,
      tools: presentationToolRefs,
      minimumContextWindow: 8_192,
    });
  if (fixtureMode) {
    catalog.registerAgent(runtime.agent, true).registerModel(runtime.model);
  } else if (internalTrialDeployment !== undefined) {
    catalog.registerModel(internalTrialDeployment.model);
    if (presentationAgent !== undefined && presentationSkill !== undefined
      && presentationToolRefs.length !== 0) {
      catalog.registerAgent(createPresentationAgentCatalogProjection({
        source: presentationAgent,
        modelId: internalTrialDeployment.model.modelId,
        skill: {
          id: presentationSkill.skillId,
          revision: presentationSkill.revision,
          contentDigest: presentationSkill.contentDigest,
          materializedRef: presentationSkill.materializedRef,
        },
        tools: presentationToolRefs,
      }), true);
    }
  } else {
    // R2D v1alpha2 Agent definitions are consumed by the production acceptance
    // authority and execution repository, not by the frozen legacy Catalog.
  }
  const cpcInstructionRuntimeEnabled = CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED
    || internalTrialDeployment !== undefined;
  const selectionContexts = new FrozenRuntimeSelectionContextProvider({
    registryRevision: activeRegistry.registryRevision,
    platformPromptRevision: platformPromptRevisionForNewTask(
      cpcInstructionRuntimeEnabled,
    ),
    liveModels: fixtureMode || internalTrialDeployment !== undefined ? [{
      modelId: fixtureMode
        ? runtime.model.modelId
        : internalTrialDeployment!.model.modelId,
      userAllowed: true,
      enabled: true,
      credentialAvailable: true,
      callable: true,
    }] : [],
    capabilityAvailability: runtimeCapabilityAvailability(runtime),
  });
  const lockService = new TaskCapabilityLockService({
    resolver: new CapabilityResolver(RegistrySnapshotSchema.parse(activeRegistry)),
    persistence: tasks,
    clock,
    idGenerator: ids,
  });
  const selection = new RuntimeSelectionService({
    agents: catalog,
    models: catalog,
    tasks,
    workspaces: foundation,
    locks: lockService,
    eligibility: new ModelEligibilityEvaluator(),
    clock,
    ids,
  });
  const authorizationPolicies = new FixedTaskAuthorizationModePolicyProvider();
  const legacyAuthorizationMaterializer =
    new LegacyTaskAuthorizationSelectionMaterializer(tasks);
  const conversationWriter = new DurableAgentConversationWriter({
    persistence: conversation,
    clock,
    idGenerator: ids,
  });
  const taskRuntime = new DurableTaskRuntime({
    persistence: tasks,
    idGenerator: ids,
  });
  const confirmations = new UserConfirmationCoordinator({
    runtime: taskRuntime,
    persistence: tasks,
    clock,
    idGenerator: ids,
  });
  const documentBackend = demoMode
    ? undefined
    : new DocumentWorkerToolBackend({
      adapterDescriptorId:
        DOCUMENT_TOOL_REGISTRY_RECORDS.descriptor.adapterDescriptorId,
      adapterDescriptorRevision:
        DOCUMENT_TOOL_REGISTRY_RECORDS.descriptor.revision,
      clock,
    });
  const workspaceTextHandle = documentBackend?.createTextWriteHandle({
    adapterDescriptorId: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
    adapterDescriptorRevision: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.revision,
  });
  const documentWorkerHandles = documentBackend === undefined || workspaceTextHandle === undefined
    ? undefined
    : new RuntimeAdapterHandles([documentBackend, workspaceTextHandle]);
  const documentToolService = documentBackend === undefined
    || documentWorkerHandles === undefined
    ? undefined
    : new ToolExecutionService({
      lockService,
      effects: new EffectCoordinator({
        runtime: taskRuntime,
        persistence: tasks,
        clock,
        idGenerator: ids,
        executors: [new ToolEffectExecutor({
          adapterDescriptorId:
            DOCUMENT_TOOL_REGISTRY_RECORDS.descriptor.adapterDescriptorId,
          persistence: tasks,
          handles: documentWorkerHandles,
          clock,
          hydrateAction: (hydration) => hydrateDesktopDocumentToolAction({
            action: hydration.action,
            workspaces: foundation,
            manualArtifacts: foundation,
          }),
        }), new ToolEffectExecutor({
          adapterDescriptorId: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
          persistence: tasks,
          handles: documentWorkerHandles,
          clock,
          hydrateAction: (hydration) => hydrateWorkspaceTextToolAction({
            action: hydration.action,
            taskId: hydration.attempt.taskId,
            tasks,
            workspaces: foundation,
            artifactLifecycles: foundation,
          }),
          queryResolver: async ({ attempt, action, lock }) => {
            const inspected = await documentBackend.inspectTextWritePostcondition({
              request: {
                lock,
                action,
                effectAttemptId: attempt.effectAttemptId,
                idempotencyKey: attempt.idempotencyKey,
                requestedAt: clock.now(),
              },
              adapterDescriptorId: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.adapterDescriptorId,
              adapterDescriptorRevision: WORKSPACE_TEXT_TOOL_ADAPTER_DESCRIPTOR.revision,
            });
            return workspaceTextPostconditionToEffectQueryResult({
              postcondition: inspected,
              attempt,
              action,
              observedAt: clock.now(),
            });
          },
        })],
      }),
      authorization: new AuthorizationEvaluator(),
      confirmations,
      persistence: tasks,
      clock,
      idGenerator: ids,
      admission: new RuntimeAdmissionController({
        clock,
        scheduler: new SystemScheduler(),
      }),
    });
  const pendingXlsxOverwriteConfirmations =
    new Map<string, XlsxOverwriteConfirmationMaterial>();
  const loopTools = documentToolService === undefined
    ? new FakeAgentToolCallExecutor()
    : new ToolExecutionAgentBridge({
      service: documentToolService,
      persistence: tasks,
      buildExecution: async (call, signal) =>
        call.capabilityId === TEXT_FILE_WRITE_CAPABILITY_ID
          ? buildWorkspaceTextToolExecution({
            call,
            signal,
            taskRuntime,
            tasks,
            workspaces: foundation,
            artifactLifecycles: foundation,
            clock,
            ids,
            activeUserId,
          })
          : buildDesktopDocumentToolExecution({
          call,
          signal,
          taskRuntime,
          tasks,
          workspaces: foundation,
          manualArtifacts: foundation,
          clock,
          ids,
          activeUserId,
          pendingXlsxOverwriteConfirmations,
          }),
    });
  const scriptedModelProvider = new DesktopDocumentScriptedModelProvider({
    adapterDescriptorId: "adapter.model.desktop-scripted",
    adapterDescriptorRevision: runtime.descriptor.revision,
  });
  const reasoningProfiles = fixtureMode
    ? new InMemoryReasoningProfileSource()
    : new LocalPersonalAdmittedReasoningProfileSource({ personal: personalModels });
  const reasoningSubjects = new TaskLockedReasoningProfileSubjectResolver({
    personal: personalModels,
  });
  const enterpriseModelProvider = internalTrialDeployment === undefined
    || internalTrialTokenProvider === undefined
    ? undefined
    : new DurableEnterpriseModelProvider({
      adapterDescriptorId:
        internalTrialDeployment.descriptor.adapterDescriptorId,
      adapterDescriptorRevision: internalTrialDeployment.descriptor.revision,
      gateway: new HttpEnterpriseModelGatewayClient({
        baseUrl: internalTrialDeployment.centralBaseUrl,
        tokenProvider: internalTrialTokenProvider,
        allowInsecureLoopbackForTest:
          internalTrialDeployment.allowInsecureLoopback,
      }),
      links: enterpriseInvocationLinks,
      compactionLinks: conversation,
      usageProjections: enterpriseUsageProjections,
      sessionScopes: new PersistentSessionScopeDigestProvider({
        persistence: enterprisePromptCacheContexts,
        ids,
      }),
      identityScope: internalTrialTokenProvider.identityScope(),
      clock,
      ids,
      reasoning: {
        mapper: new TaskLockedReasoningProviderMapper({
          profiles: reasoningProfiles,
          mappings: new ReleasePinnedReasoningMappingRegistry([]),
        }),
        providerFamily: "enterprise_openai",
        timeoutPolicyIdentity: createEnterpriseReasoningTimeoutPolicyIdentity({
          timeoutPolicyRef: "timeout.enterprise-model.vs1",
          timeoutPolicyRevision: "vs1.default",
          streamIdleTimeoutMillis: 30_000,
        }),
      },
    });
  const defaultModelProvider = fixtureMode
    ? scriptedModelProvider
    : enterpriseModelProvider ?? new FailClosedModelProvider();
  const runtimeAdapterHandles = new RuntimeAdapterHandles(
    fixtureMode
      ? [scriptedModelProvider]
      : enterpriseModelProvider === undefined ? [] : [enterpriseModelProvider],
  );
  const dfiAdmission = new Dfi541ExactSubjectProviderReleaseAdmissionResolver(
    new LocalPersonalDfi541AdmissionInputSource({
      personal: personalModels,
      credentials: personalCredentials,
    }),
    new ExactSubjectBoundProviderReleaseMaterializer(),
  );
  const sessionBindingVerifier = {
    async verifyExact(binding: Readonly<{
      desktopSessionId: string;
      internalSessionId: string;
    }>) {
      const session = await foundation.loadDesktopSession(binding.desktopSessionId);
      if (session === undefined || session.internalSessionId !== binding.internalSessionId
        || session.summary.tombstoned) throw new Error("selection.subject_binding_invalid");
      return {
        verifiedRuntimeSubjectBindingDigest: sha256CanonicalJson(
          JsonObjectSchema.parse({ kind: "local_desktop_owner",
            desktopSessionId: binding.desktopSessionId,
            internalSessionId: binding.internalSessionId }),
        ),
        acceptedClientBindingDigest: sha256CanonicalJson(
          JsonObjectSchema.parse({ kind: "accepted_desktop_client",
            runtimeInstanceId, desktopSessionId: binding.desktopSessionId }),
        ),
      };
    },
  };
  const r2dComposition = fixtureMode
    ? createLocalDesktopR2DProductionComposition({ enabled: false })
    : internalTrialDeployment !== undefined && internalTrialTokenProvider !== undefined
      ? createInternalTrialEnterpriseR2DProductionComposition({
        clock,
        ids,
        sessionBindingVerifier,
        identityScope: internalTrialTokenProvider.identityScope(),
        registry: enterpriseR2DRegistrySnapshot(
          internalTrialDeployment,
          activeRegistry.registryRevision,
          presentationSkillRef,
          generalToolRefs,
        ),
        model: {
          modelId: internalTrialDeployment.capability.capabilityId,
          revision: internalTrialDeployment.capability.revision,
          digest: internalTrialDeployment.capability.revision,
        },
        ...(presentationSkillRef === undefined
          ? {}
          : { skill: presentationSkillRef }),
        tools: generalToolRefs,
        ...(presentationAgent === undefined
          ? {}
          : { presentationAgent }),
        additionalAgents: agentLifecycleSource,
        modelLocks: lockService,
        toolPolicy: {
          async resolveExact(input) {
            return { registryRevision: input.registryRevision,
              authorityFactsDigest: input.workspaceAndAuthorizationFactsDigest,
              candidates: input.exactAgent.agentDefinitionId === "agent.general"
                ? input.entitlementSnapshot.tools
                : input.exactAgent.agentDefinitionId === "agent.presentation"
                  ? input.entitlementSnapshot.tools.filter((tool) =>
                    presentationToolRefs.some((ref) =>
                      ref.capabilityId === tool.capabilityId
                      && ref.capabilityRevision === tool.capabilityRevision))
                  : [] };
          },
        },
        reasoningPlanner: new ReasoningModeLockPlanner({
          profiles: reasoningProfiles,
          subjects: reasoningSubjects,
        }),
        reasoningPlannerV1Alpha2: new ReasoningModeLockPlannerV1Alpha2({
          profiles: reasoningProfiles,
          subjects: reasoningSubjects,
          admission: dfiAdmission,
        }),
      authorizationPolicies,
      enterpriseConfigRevision: internalTrialDeployment.configurationRevision,
      platformPromptRevision: platformPromptRevisionForNewTask(true),
    })
      : createLocalDesktopR2DProductionComposition({
    enabled: DFI543A_LOCAL_PERSONAL_PRODUCTION_GRAPH_ENABLED,
    dependencies: {
      clock,
      ids,
      sessionBindingVerifier,
      persistence: personalModels,
      credentials: personalCredentials,
      async captureBaseRegistrySnapshot() {
        return AgentResourceRegistrySnapshotV1Schema.parse({
          schemaVersion: "v1",
          registryRevision: sha256CanonicalJson(JsonObjectSchema.parse({
            domain: "robothree.dfi543a.local-base-registry.v1",
          })),
          models: [], skills: [], tools: [], knowledge: [],
          knowledgeProviderReady: false,
        });
      },
      async captureWorkspacePermissions() {
        const material = { schemaVersion: "v1" as const,
          models: [], skills: [], tools: [], knowledge: [] };
        return { ...material,
          factsDigest: sha256CanonicalJson(JsonObjectSchema.parse(material)),
        } as ExactResourcePermissionsV1;
      },
      async prepareToolLocks(input) {
        if (input.decision.toolCandidateRefs.length !== 0) {
          throw new Error("selection.tool_policy_unavailable");
        }
        return [];
      },
      toolPolicy: {
        async resolveExact(input) {
          return { registryRevision: input.registryRevision,
            authorityFactsDigest: input.workspaceAndAuthorizationFactsDigest,
            candidates: input.entitlementSnapshot.tools };
        },
      },
      reasoningPlanner: new ReasoningModeLockPlanner({
        profiles: reasoningProfiles, subjects: reasoningSubjects,
      }),
      reasoningPlannerV1Alpha2: new ReasoningModeLockPlannerV1Alpha2({
        profiles: reasoningProfiles, subjects: reasoningSubjects,
        admission: dfiAdmission,
      }),
      authorizationPolicies,
    },
  });
  const taskPinnedReleases = new TaskPinnedReasoningReleaseResolver({
    personal: personalModels,
  });
  const taskModelProviders = fixtureMode ? undefined
    : new DurableCompositeTaskModelProviderResolver({
      enterprise: runtimeAdapterHandles,
      composite: new CompositeModelProviderResolver({
        enterprise: runtimeAdapterHandles,
        personal: personalModels,
        runtime: new PersonalModelRuntimeRegistry(personalModels),
        credentials: personalCredentials,
        clock,
        scheduler: new SystemScheduler(),
        timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
        ...(input.dfi543TestHarness === undefined ? {} : {
          transport: {
            ca: input.dfi543TestHarness.providerCaPem,
            testOnlyAllowLoopback: true,
            testOnlyPortOverride: input.dfi543TestHarness.providerPort,
            lookup: async () => [{ address: "127.0.0.1", family: 4 as const }],
          },
        }),
      }),
      authorities: new LocalDesktopPersonalModelExecutionAuthorityProvider(
        personalModels),
      invocations: personalInvocations,
      personal: personalModels,
      clock,
      timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      tasks,
      reasoningReleases: taskPinnedReleases,
    });
  const toolCallBatches = new ToolCallBatchCoordinator({
    conversation,
    tasks,
    tools: loopTools,
    clock,
  });
  const loop = new AgentLoopCoordinator({
    model: defaultModelProvider,
    tools: loopTools,
    conversation: conversationWriter,
    batches: toolCallBatches,
  });
  const contextBudgetPolicy = new ContextBudgetPolicy({
    modelContextWindow: internalTrialDeployment?.model.capabilities.contextWindow
      ?? runtime.model.capabilities.contextWindow,
    reservedOutputTokens: 1_024,
    safetyMarginTokens: 512,
    compactionThresholdRatio: 0.8,
    maxPreviewBytes: 4_096,
  });
  const contextTokenEstimator = new ConservativeTokenEstimator();
  const executionAgents = fixtureMode
    ? catalog
    : {
      async loadAgentRevision(agentDefinitionId: string, revision: string) {
        if (agentDefinitionId === builtInGeneralAgent.agentDefinitionId
          && revision === builtInGeneralAgent.revision
        ) return structuredClone(builtInGeneralAgent);
        if (presentationAgent !== undefined) {
          const presentation = await presentationAgent.loadExactAgent(
            agentDefinitionId,
            revision,
          );
          if (presentation !== undefined) return presentation;
        }
        return agentLifecycleSource.loadExactAgent(agentDefinitionId, revision);
      },
    };
  const normalLoopStarter = new DurableAgentLoopStarter({
    clock,
    ids,
    conversation,
    tasks,
    agents: executionAgents,
    snapshots: new TurnSnapshotBuilder({
      conversationPersistence: conversation,
      taskPersistence: tasks,
    }),
    context: new ContextPipeline({
      budgetPolicy: contextBudgetPolicy,
      estimator: contextTokenEstimator,
    }),
    instructionRuntimeResolver: new TaskLockedInstructionRuntimeResolver({
      materializer: new TaskInstructionBundleMaterializer({
        tokenEstimator: contextTokenEstimator,
        budgetPolicy: contextBudgetPolicy,
        ...(presentationSkill === undefined ? {} : {
          lockedSkillInstructionResolver: new TrustedLocalSkillInstructionResolver({
            manifest: presentationSkill,
          }),
        }),
      }),
      enabled: cpcInstructionRuntimeEnabled,
    }),
    loop,
    taskRuntime,
    scheduler: new SystemScheduler(),
    coordination,
    ephemeralEvents,
    adapterHandles: runtimeAdapterHandles,
    ...(taskModelProviders === undefined ? {} : {
      modelProviderResolver: taskModelProviders,
      localPersonalTimeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
    }),
    ...(enterpriseModelProvider === undefined ? {} : {
      modelInvocationLinks: enterpriseInvocationLinks,
    }),
  });
  const activeAgentLoopStartupRecovery = enterpriseModelProvider === undefined
    ? undefined
    : new ActiveAgentLoopStartupRecoveryCoordinator({
      tasks,
      starter: normalLoopStarter,
      scheduler: new SystemScheduler(),
    });
  const demoBackend = demoMode && runtime.tool !== undefined
    ? new ProcessEchoToolBackend({
      adapterDescriptorId: runtime.tool.descriptor.adapterDescriptorId,
      adapterDescriptorRevision: runtime.tool.descriptor.revision,
      clock,
    })
    : undefined;
  const demoRunner = demoBackend === undefined
    ? undefined
    : new Dcf2cDemoAgentRunner({
      runtime: taskRuntime,
      tasks,
      conversation,
      writer: conversationWriter,
      coordination,
      tools: new ToolExecutionService({
        lockService,
        effects: new EffectCoordinator({
          runtime: taskRuntime,
          persistence: tasks,
          clock,
          idGenerator: ids,
          executors: [new ToolEffectExecutor({
            adapterDescriptorId:
              runtime.tool!.descriptor.adapterDescriptorId,
            persistence: tasks,
            handles: new RuntimeAdapterHandles([demoBackend]),
            clock,
          })],
        }),
        authorization: new AuthorizationEvaluator(),
        confirmations,
        persistence: tasks,
        clock,
        idGenerator: ids,
        admission: new RuntimeAdmissionController({
          clock,
          scheduler: new SystemScheduler(),
        }),
      }),
      clock,
      ids,
      registryRevision: activeRegistry.registryRevision,
      activeUserId,
  });
  const loopStarter: AgentLoopStarter = demoRunner ?? normalLoopStarter;
  const desktopExecution = demoRunner ?? {
    cancel: (taskId: string) => {
      normalLoopStarter.cancel(taskId);
    },
    resume: async (taskId: string) => {
      const outcomes = await toolCallBatches.recover({ taskId });
      if (outcomes.every((outcome) => outcome.status !== "waiting_user_confirmation")) {
        clearPendingXlsxOverwriteConfirmations(
          pendingXlsxOverwriteConfirmations,
          taskId,
        );
      }
      await normalLoopStarter.resume(taskId);
    },
  };
  const dfi543Handler = r2dComposition.enabled
    ? new Dfi543LocalPersonalSubmitTurnHandler({
      clock, ids, conversation, sessions: foundation, tasks, coordination,
      loopStarter, planner: r2dComposition.planner,
    })
    : undefined;
  const submitTurns = new SubmitTurnCoordinator({
    clock,
    ids,
    conversation,
    sessions: foundation,
    tasks,
    selection,
    selectionContexts,
    coordination,
    loopStarter,
    authorizationPolicies,
    r2dCoreDeltaEnabled: R2D3_CORE_DELTA_DEFAULT_ENABLED,
    dfi541MaxEnabled: dfi543Handler !== undefined,
    ...(dfi543Handler === undefined ? {} : { dfi541SubmitHandler: dfi543Handler }),
  });
  const recovery = new SubmitTurnRecoveryCoordinator({
    coordination,
    submitTurns,
    scheduler: new SystemScheduler(),
  });
  const taskProjections = new DesktopTaskProjectionService({
    tasks,
    metadata: foundation,
    deliveries: coordination,
    artifactLifecycles: foundation,
    workspaces: foundation,
    manualArtifacts: foundation,
    clock,
    projectionStartedAt: clock.now(),
  });
  const taskControl = new DesktopTaskControlService({
    runtime: taskRuntime,
    tasks,
    conversation,
    confirmations: demoRunner ?? new CoordinatorDesktopConfirmationDecisionGateway({
      coordinator: confirmations,
      revalidateConfirmed: async () => undefined,
    }),
    execution: desktopExecution,
    clock,
    activeUserId,
  });
  const workspaceProofs = new HmacWorkspaceBrowserProofCodec();
  const workspaceReader = new NodeWorkspaceDirectoryReader();
  const workspaceBrowser = new WorkspaceBrowserService({
    tasks,
    workspaces: foundation,
    reader: workspaceReader,
    proofs: workspaceProofs,
  });
  const workspaceReveal = new WorkspaceRevealAuthorityService({
    tasks,
    workspaces: foundation,
    reader: workspaceReader,
    proofs: workspaceProofs,
    runtimeInstanceId,
  });
  const registrySnapshots = new FrozenRegistrySnapshotProvider(
    RegistrySnapshotSchema.parse(activeRegistry),
  );
  const catalogCursors = new HmacCatalogCursorCodec();
  const robotCatalog = new RobotCatalogQueryService({
    agents: catalog,
    models: catalog,
    registries: registrySnapshots,
    contexts: selectionContexts,
    eligibility: new ModelEligibilityEvaluator(),
    cursors: catalogCursors,
  });
  const refreshPublishedAgents = agentLifecycleClient === undefined
    || internalTrialDeployment === undefined
    ? undefined
    : async () => {
      const page = await agentLifecycleClient.listPublished();
      agentLifecycleSource.registerPublished(page);
      for (const release of page.items) {
        catalog.registerAgent(agentLifecycleSource.catalogProjection(
          release.agentPackage.agentDefinition,
          internalTrialDeployment.model.modelId,
        ), true);
      }
    };
  const toolCatalog = new ToolCatalogQueryService({
    registries: registrySnapshots,
    contexts: selectionContexts,
    cursors: catalogCursors,
  });
  const reasoningOwnerAuthority = new LocalDesktopReasoningModeOwnerAuthorityProvider({
    personal: personalModels,
    clientInstanceId: input.clientInstanceId
      ?? "00000000-0000-4000-8000-000000000543",
    testIdentityUsed: input.dfi543TestHarness !== undefined,
  });
  const reasoningPreferenceService = new ReasoningModePreferenceService({
    persistence: reasoningPreferencePersistence,
    ownerAuthority: reasoningOwnerAuthority,
    clock,
  });
  const reasoningPreviewService = new ReasoningModePreviewService({
    models: new LocalPersonalEffectiveReasoningModelResolver(personalModels),
    profiles: reasoningProfiles,
    preferences: reasoningPreferencePersistence,
    ownerAuthority: reasoningOwnerAuthority,
    clock,
  });
  const personalModelManagementAuthority =
    new ProductionPersonalModelManagementAuthoritySource({
      persistence: personalModels,
      deploymentMode: "standalone_local",
    });
  const personalModelOperationGate = new InMemoryPersonalModelOperationGate();
  const personalModelUsage = new TaskBackedPersonalModelUsageGuard({
    tasks,
    personal: personalModels,
  });
  const personalModelCredentialCoordinator = new PersonalModelCredentialCoordinator({
    persistence: personalModels,
    credentials: personalCredentials,
    managementAuthority: personalModelManagementAuthority,
    deletionGuard: personalModelUsage,
    credentialUsage: personalModelUsage,
    clock,
    operationGate: personalModelOperationGate,
  });
  const personalModelCredentialRecovery = new PersonalModelCredentialRecoveryCoordinator(
    personalModelCredentialCoordinator,
  );
  const personalModelRevealAttempts = new PersonalModelRevealAttemptRegistry();
  const personalModelCredentialReveal = new PersonalModelCredentialRevealService({
    persistence: personalModels,
    credentials: personalCredentials,
    managementAuthority: personalModelManagementAuthority,
    clock,
    attempts: personalModelRevealAttempts,
    operationGate: personalModelOperationGate,
  });
  const personalModelSensitiveOperationsReady = () =>
    input.sensitiveTransportProductionReady === true
    && personalCredentials.verifiedHelperReady;
  const personalModelCommands = new PersonalModelManagementCommandService({
    coordinator: personalModelCredentialCoordinator,
    persistence: personalModels,
    authority: personalModelManagementAuthority,
    ids,
    clock,
    sensitiveOperationsReady: personalModelSensitiveOperationsReady,
  });
  const personalCredentialBrokerHandler = createPersonalModelCredentialBrokerHandler(
    personalModelCredentialCoordinator,
    personalModelCredentialReveal,
  );
  const personalModelManagement = new PersonalModelManagementReadService({
    persistence: personalModels,
    credentials: personalCredentials,
    authority: personalModelManagementAuthority,
    helperProductionReady: () => personalCredentials.productionReady,
    transportProductionReady: () =>
      input.sensitiveTransportProductionReady === true,
  });
  const facade = new DesktopApplicationFacade({
    clock,
    runtimeInstanceId,
    coreVersion: CORE_VERSION,
    runtimeStatus: () => runtimeStatus,
    workspaceSelections,
    workspaces: new WorkspaceGrantService({
      clock,
      persistence: foundation,
      selectionResolver: workspaceSelections,
      pathResolver: new NodeWorkspacePathResolver(),
    }),
    sessions: new DesktopSessionService({
      clock,
      conversation,
      metadata: foundation,
    }),
    conversations: new DesktopConversationProjectionService({
      conversation,
      metadata: foundation,
      tasks: taskProjections,
    }),
    tasks: taskProjections,
    taskControl,
    catalog: new RuntimeCatalogProjectionService({
      agents: catalog,
      models: catalog,
      eligibility: new ModelEligibilityEvaluator(),
    }),
    selectionContexts,
    submitTurns,
    coordination,
    workspaceBrowser,
    workspaceReveal,
    robotCatalog,
    toolCatalog,
    r2dDesktopV1Alpha4Enabled: R2DP3_DESKTOP_V1ALPHA4_DEFAULT_ENABLED,
    dfi541MaxEnabled: dfi543Handler !== undefined,
    dfi541RuntimeReady: () => personalCredentials.productionReady
      || internalTrialDeployment !== undefined
      || (input.dfi543TestHarness !== undefined
        && personalCredentials.verifiedHelperReady),
    reasoningPreview: reasoningPreviewService,
    reasoningPreferences: reasoningPreferenceService,
    taskReasoning: new TaskReasoningModeProjectionService({ tasks, coordination }),
    personalModelManagement,
    personalModelCommands,
    ...(agentLifecycleClient === undefined ? {} : {
      agentLifecycle: agentLifecycleClient,
      registerLifecycleDraft(detail) {
        agentLifecycleSource.registerDraft(detail);
      },
    }),
    ...(refreshPublishedAgents === undefined ? {} : { refreshPublishedAgents }),
  });
  const server = new CorePrivateHttpServer({
    authorizationToken: input.authorizationToken,
    facade,
    ephemeralEvents,
  });
  const persistence = [conversation, foundation, tasks, coordination,
    personalModels, personalInvocations, reasoningPreferencePersistence,
    enterpriseInvocationLinks, enterpriseUsageProjections,
    enterprisePromptCacheContexts,
    personalCredentials] as const;
  let started = false;

  return Object.freeze({
    facade,
    server,
    personalCredentialBrokerHandler,
    ...(input.vs1TestHarness !== true ? {} : {
      testOnlyIssueWorkspaceSelection(selection: Readonly<{
        selectedPath: string;
        clientInstanceId: string;
        correlationId: string;
      }>) {
        return workspaceSelections.issue(selection);
      },
    }),
    async start() {
      if (started) return;
      runtimeStatus = "starting";
      const startedPersistence: Array<(typeof persistence)[number]> = [];
      try {
        for (const adapter of persistence) {
          await adapter.start();
          startedPersistence.push(adapter);
        }
        const authorizationPolicy = await authorizationPolicies.loadSnapshot();
        const materialized = await legacyAuthorizationMaterializer.materialize(
          authorizationPolicy,
        );
        if (!materialized.ok) {
          throw new Error(
            `Task authorization materialization failed: ${materialized.error.code}`,
          );
        }
        await personalModelCredentialRecovery.recoverOnce();
        await server.start();
        started = true;
        runtimeStatus = "ready";
        void facade.resumeRobotDraftTestsV1Alpha1();
        if (activeAgentLoopStartupRecovery === undefined) {
          recovery.start();
        } else {
          void activeAgentLoopStartupRecovery.recoverOnce().finally(() => {
            if (runtimeStatus === "ready") recovery.start();
          });
        }
      } catch (error) {
        runtimeStatus = "failed";
        activeAgentLoopStartupRecovery?.stop();
        recovery.stop();
        personalModelCredentialReveal.close();
        await server.stop().catch(() => undefined);
        for (const adapter of startedPersistence.reverse()) {
          await adapter.stop().catch(() => undefined);
        }
        await demoBackend?.stop().catch(() => undefined);
        await documentBackend?.stop().catch(() => undefined);
        throw error;
      }
    },
    async stop() {
      if (!started && runtimeStatus !== "failed") return;
      runtimeStatus = "stopping";
      activeAgentLoopStartupRecovery?.stop();
      recovery.stop();
      personalModelCredentialReveal.close();
      ephemeralEvents.clear();
      workspaceSelections.clear();
      await server.stop();
      await demoBackend?.stop();
      await documentBackend?.stop();
      for (const adapter of [...persistence].reverse()) await adapter.stop();
      started = false;
      runtimeStatus = "failed";
    },
  });
}

async function buildWorkspaceTextToolExecution(input: {
  call: AssistantToolCall;
  signal: AbortSignal;
  taskRuntime: DurableTaskRuntime;
  tasks: TaskPersistence;
  workspaces: WorkspaceGrantPersistence;
  artifactLifecycles: ArtifactLifecyclePersistence;
  clock: Clock;
  ids: IdGenerator;
  activeUserId: string;
}) {
  const { call } = input;
  if (call.capabilityId !== TEXT_FILE_WRITE_CAPABILITY_ID) {
    throw new Error("Workspace Text Tool received another capability");
  }
  const selection = await input.tasks.loadReadableTaskRuntimeSelection(call.taskId);
  if (selection?.workspaceGrantId === undefined) {
    throw new Error("Workspace Text Tool requires a locked workspace grant");
  }
  const grant = await input.workspaces.loadWorkspaceGrant(selection.workspaceGrantId);
  if (grant === undefined || grant.status !== "active") {
    throw new Error("Workspace Text Tool workspace grant is unavailable");
  }
  const model = parseWorkspaceTextModelArguments(call.arguments);
  const contentSha256 = `sha256:${createHash("sha256").update(model.content, "utf8").digest("hex")}`;
  const proof = model.mode === "replace_existing"
    ? await deriveWorkspaceTextArtifactProof({
      taskId: call.taskId,
      workspaceGrantId: grant.workspaceGrantId,
      relativePath: model.relativePath,
      expectedPreviousSha256: model.expectedPreviousSha256!,
      tasks: input.tasks,
      artifactLifecycles: input.artifactLifecycles,
    })
    : undefined;
  const payload = JsonObjectSchema.parse({
    workspaceGrantId: grant.workspaceGrantId,
    relativePath: model.relativePath,
    content: model.content,
    contentSha256,
    mode: model.mode,
    ...(model.expectedPreviousSha256 === undefined
      ? {}
      : { expectedPreviousSha256: model.expectedPreviousSha256 }),
    ...(proof === undefined ? {} : { ownedArtifactProofDigest: proof.digest }),
    limitsRevision: TEXT_FILE_WRITE_LIMITS_REVISION,
    limits: DOCUMENT_TOOL_LIMITS,
  });
  const step = await ensureDocumentToolStep({
    taskRuntime: input.taskRuntime,
    clock: input.clock,
    ids: input.ids,
    call,
    modelPayload: JsonObjectSchema.parse(call.arguments),
  });
  const operation = model.mode === "replace_existing" ? "modify" : "create";
  const targetRealPath = resolve(grant.rootRealPath, model.relativePath);
  return {
    taskId: call.taskId,
    runId: step.runId,
    stepId: step.stepId,
    registryRevision: selection.registryRevision,
    capabilityId: call.capabilityId,
    action: { actionId: call.actionId, kind: call.capabilityId, payload },
    idempotencyKey: `workspace-text:${call.taskId}:${call.toolCallId}`,
    riskFactKinds: ["routine_file"] satisfies readonly ToolRiskFactKind[],
    authorization: {
      context: documentToolAuthorizationContext({
        activeUserId: input.activeUserId,
        capabilityId: call.capabilityId,
        workspaceGrantId: grant.workspaceGrantId,
        workspaceRoot: grant.rootRealPath,
        targetRealPath,
        operation,
      }),
      currentContext: async () => {
        const currentGrant = await input.workspaces.loadWorkspaceGrant(grant.workspaceGrantId);
        if (currentGrant === undefined || currentGrant.status !== "active") {
          return unavailableDocumentToolAuthorizationContext({
            activeUserId: input.activeUserId,
            capabilityId: call.capabilityId,
            workspaceGrantId: grant.workspaceGrantId,
            targetRealPath,
            operation,
          });
        }
        if (model.mode === "replace_existing") {
          const currentProof = await deriveWorkspaceTextArtifactProof({
            taskId: call.taskId,
            workspaceGrantId: currentGrant.workspaceGrantId,
            relativePath: model.relativePath,
            expectedPreviousSha256: model.expectedPreviousSha256!,
            tasks: input.tasks,
            artifactLifecycles: input.artifactLifecycles,
          });
          if (currentProof.digest !== proof?.digest) {
            return unavailableDocumentToolAuthorizationContext({
              activeUserId: input.activeUserId,
              capabilityId: call.capabilityId,
              workspaceGrantId: currentGrant.workspaceGrantId,
              targetRealPath: resolve(currentGrant.rootRealPath, model.relativePath),
              operation,
            });
          }
        }
        return documentToolAuthorizationContext({
          activeUserId: input.activeUserId,
          capabilityId: call.capabilityId,
          workspaceGrantId: currentGrant.workspaceGrantId,
          workspaceRoot: currentGrant.rootRealPath,
          targetRealPath: resolve(currentGrant.rootRealPath, model.relativePath),
          operation,
        });
      },
    },
    deadlineAt: new Date(Date.parse(input.clock.now()) + 30_000).toISOString(),
    signal: input.signal,
    modelArguments: call.arguments,
  };
}

async function hydrateWorkspaceTextToolAction(input: {
  action: Action;
  taskId: string;
  tasks: TaskPersistence;
  workspaces: WorkspaceGrantPersistence;
  artifactLifecycles: ArtifactLifecyclePersistence;
}): Promise<Action> {
  const action = ActionSchema.parse(input.action);
  if (action.kind !== TEXT_FILE_WRITE_CAPABILITY_ID) return action;
  const payload = JsonObjectSchema.parse(action.payload);
  const allowed = new Set([
    "workspaceGrantId",
    "relativePath",
    "content",
    "contentSha256",
    "mode",
    "expectedPreviousSha256",
    "ownedArtifactProofDigest",
    "limitsRevision",
    "limits",
  ]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) {
    throw new Error("Workspace Text Tool durable Action contains unsupported fields");
  }
  const workspaceGrantId = requireActionString(payload.workspaceGrantId, "workspaceGrantId");
  const relativePath = requireActionString(payload.relativePath, "relativePath");
  const content = requireActionString(payload.content, "content", true);
  const contentSha256 = `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
  if (contentSha256 !== payload.contentSha256) {
    throw new Error("workspace_text.content_digest_mismatch");
  }
  if (payload.limitsRevision !== TEXT_FILE_WRITE_LIMITS_REVISION) {
    throw new Error("workspace_text.limits_revision_mismatch");
  }
  const mode = payload.mode === "replace_existing"
    ? "replace_existing"
    : payload.mode === "create_new"
      ? "create_new"
      : undefined;
  if (mode === undefined) throw new Error("workspace_text.mode_invalid");
  const grant = await input.workspaces.loadWorkspaceGrant(workspaceGrantId);
  if (grant === undefined || grant.status !== "active") {
    throw new Error("Workspace Text Tool workspace grant is unavailable before dispatch");
  }
  if (mode === "replace_existing") {
    const expectedPreviousSha256 = requireActionString(
      payload.expectedPreviousSha256,
      "expectedPreviousSha256",
    );
    const proof = await deriveWorkspaceTextArtifactProof({
      taskId: input.taskId,
      workspaceGrantId,
      relativePath,
      expectedPreviousSha256,
      tasks: input.tasks,
      artifactLifecycles: input.artifactLifecycles,
    });
    if (proof.digest !== payload.ownedArtifactProofDigest) {
      throw new Error("workspace_text.owned_artifact_proof_changed");
    }
  }
  return ActionSchema.parse({
    ...action,
    payload: {
      workspaceRoot: grant.rootRealPath,
      workspaceGrantId,
      relativePath,
      content,
      mode,
      ...(payload.expectedPreviousSha256 === undefined
        ? {}
        : { expectedPreviousSha256: payload.expectedPreviousSha256 }),
      ...(payload.ownedArtifactProofDigest === undefined
        ? {}
        : { ownedArtifactProofDigest: payload.ownedArtifactProofDigest }),
      limitsRevision: payload.limitsRevision,
      limits: payload.limits,
    },
  });
}

function parseWorkspaceTextModelArguments(value: unknown): Readonly<{
  relativePath: string;
  content: string;
  mode: "create_new" | "replace_existing";
  expectedPreviousSha256?: string;
}> {
  const parsed = JsonObjectSchema.parse(value);
  const allowed = new Set(["relativePath", "content", "mode", "expectedPreviousSha256"]);
  const extra = Object.keys(parsed).filter((key) => !allowed.has(key));
  if (extra.length > 0) throw new Error(`Workspace Text Tool unsupported fields: ${extra.join(", ")}`);
  const relativePath = requireActionString(parsed.relativePath, "relativePath")
    .trim().replace(/^\/+/, "").normalize("NFC");
  const content = requireActionString(parsed.content, "content", true);
  const mode = parsed.mode === undefined || parsed.mode === "create_new"
    ? "create_new"
    : parsed.mode === "replace_existing"
      ? "replace_existing"
      : undefined;
  if (mode === undefined) throw new Error("Workspace Text Tool mode is invalid");
  const expectedPreviousSha256 = parsed.expectedPreviousSha256 === undefined
    ? undefined
    : requireActionString(parsed.expectedPreviousSha256, "expectedPreviousSha256");
  if (mode === "create_new" && expectedPreviousSha256 !== undefined) {
    throw new Error("Workspace Text create_new forbids expectedPreviousSha256");
  }
  if (mode === "replace_existing" && !/^sha256:[a-f0-9]{64}$/u.test(expectedPreviousSha256 ?? "")) {
    throw new Error("Workspace Text replace_existing requires exact expectedPreviousSha256");
  }
  return {
    relativePath,
    content,
    mode,
    ...(expectedPreviousSha256 === undefined ? {} : { expectedPreviousSha256 }),
  };
}

function requireActionString(value: unknown, name: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new Error(`Workspace Text Tool ${name} must be a string`);
  }
  return value;
}

async function buildDesktopDocumentToolExecution(input: {
  call: AssistantToolCall;
  signal: AbortSignal;
  taskRuntime: DurableTaskRuntime;
  tasks: TaskPersistence;
  workspaces: WorkspaceGrantPersistence;
  manualArtifacts: ManualArtifactRegistrationPersistence;
  clock: Clock;
  ids: IdGenerator;
  activeUserId: string;
  pendingXlsxOverwriteConfirmations: Map<string, XlsxOverwriteConfirmationMaterial>;
}) {
  const { call } = input;
  if (!isDocumentToolCapabilityId(call.capabilityId)) {
    throw new Error(`Desktop runtime only binds Document Tool calls, got ${call.capabilityId}`);
  }
  const selection = await input.tasks.loadReadableTaskRuntimeSelection(call.taskId);
  if (selection === undefined) {
    throw new Error("Document Tool call has no locked runtime selection");
  }
  if (selection.workspaceGrantId === undefined) {
    throw new Error("Document Tool call requires a workspace grant");
  }
  const workspaceGrantId = selection.workspaceGrantId;
  const grant = await input.workspaces.loadWorkspaceGrant(workspaceGrantId);
  if (grant === undefined || grant.status !== "active") {
    throw new Error("Document Tool workspace grant is unavailable");
  }
  const modelArguments = parseDocumentToolModelArguments(call.capabilityId, call.arguments);
  const writeMode = call.capabilityId === "tool.document.xlsx.write"
    ? (modelArguments.mode ?? "create_new")
    : call.capabilityId === PPTX_WRITE_CAPABILITY_ID
      ? "create_new"
    : undefined;
  const targetRealPath = resolve(grant.rootRealPath, modelArguments.relativePath);
  await validateWorkspaceAttachmentIdentity({
    capabilityId: call.capabilityId,
    workspaceGrantId,
    relativePath: modelArguments.relativePath,
    targetRealPath,
    manualArtifacts: input.manualArtifacts,
  });
  const overwriteMaterialKey = writeMode === "overwrite_existing"
    ? xlsxOverwriteConfirmationMaterialKey(call)
    : undefined;
  const cachedOverwriteMaterial = overwriteMaterialKey === undefined
    ? undefined
    : input.pendingXlsxOverwriteConfirmations.get(overwriteMaterialKey);
  const overwriteMaterial = writeMode === "overwrite_existing"
    ? cachedOverwriteMaterial ?? await buildXlsxOverwriteConfirmationMaterial({
      idempotencyKey: `agent-document:${call.taskId}:${call.toolCallId}`,
      workspaceRoot: grant.rootRealPath,
      relativePath: modelArguments.relativePath,
      targetRealPath,
      workbook: modelArguments.workbook,
      options: modelArguments.options,
    })
    : undefined;
  if (
    overwriteMaterialKey !== undefined
    && cachedOverwriteMaterial === undefined
    && overwriteMaterial !== undefined
  ) {
    input.pendingXlsxOverwriteConfirmations.set(
      overwriteMaterialKey,
      overwriteMaterial,
    );
  }
  const payload = JsonObjectSchema.parse({
    workspaceGrantId: grant.workspaceGrantId,
    relativePath: modelArguments.relativePath,
    ...(modelArguments.workbook === undefined ? {} : { workbook: modelArguments.workbook }),
    ...(modelArguments.presentation === undefined ? {} : { presentation: modelArguments.presentation }),
    ...(writeMode === undefined ? {} : { mode: writeMode }),
    ...(call.capabilityId === PPTX_WRITE_CAPABILITY_ID
      ? {
        requestDigest: buildPptxWriteRequestDigest({
          idempotencyKey: `agent-document:${call.taskId}:${call.toolCallId}`,
          relativePath: modelArguments.relativePath,
          presentation: modelArguments.presentation,
          options: modelArguments.options,
        }),
      }
      : {}),
    ...(overwriteMaterial === undefined
      ? {}
      : {
        overwrite: { confirmedOldSha256: overwriteMaterial.confirmedOldSha256 },
        requestDigest: overwriteMaterial.requestDigest,
      }),
    options: modelArguments.options,
    limits: DOCUMENT_TOOL_LIMITS,
  });
  const step = await ensureDocumentToolStep({
    taskRuntime: input.taskRuntime,
    clock: input.clock,
    ids: input.ids,
    call,
    modelPayload: JsonObjectSchema.parse(call.arguments),
  });
  const operation = documentToolFileOperation(call.capabilityId, writeMode);
  const authorization = documentToolAuthorizationContext({
    activeUserId: input.activeUserId,
    capabilityId: call.capabilityId,
    workspaceGrantId: grant.workspaceGrantId,
    workspaceRoot: grant.rootRealPath,
    targetRealPath,
    operation,
  });
  return {
    taskId: call.taskId,
    runId: step.runId,
    stepId: step.stepId,
    registryRevision: selection.registryRevision,
    capabilityId: call.capabilityId,
    action: {
      actionId: call.actionId,
      kind: call.capabilityId,
      payload,
    },
    idempotencyKey: `agent-document:${call.taskId}:${call.toolCallId}`,
    ...(call.capabilityId === "tool.document.xlsx.write" || call.capabilityId === PPTX_WRITE_CAPABILITY_ID
      ? {
        riskFactKinds: writeMode === "overwrite_existing"
          ? ["destructive_file"] satisfies readonly ToolRiskFactKind[]
          : ["routine_file"] satisfies readonly ToolRiskFactKind[],
      }
      : {}),
    authorization: {
      context: authorization,
      currentContext: async () => {
        const currentGrant = await input.workspaces.loadWorkspaceGrant(workspaceGrantId);
        if (currentGrant === undefined || currentGrant.status !== "active") {
          return unavailableDocumentToolAuthorizationContext({
            activeUserId: input.activeUserId,
            capabilityId: call.capabilityId,
            workspaceGrantId: grant.workspaceGrantId,
            targetRealPath,
            operation,
          });
        }
        return documentToolAuthorizationContext({
          activeUserId: input.activeUserId,
          capabilityId: call.capabilityId,
          workspaceGrantId: currentGrant.workspaceGrantId,
          workspaceRoot: currentGrant.rootRealPath,
          targetRealPath: resolve(currentGrant.rootRealPath, modelArguments.relativePath),
          operation,
        });
      },
    },
    deadlineAt: new Date(Date.parse(input.clock.now()) + 30_000).toISOString(),
    signal: input.signal,
    modelArguments: call.arguments,
  };
}

async function hydrateDesktopDocumentToolAction(input: {
  action: Action;
  workspaces: WorkspaceGrantPersistence;
  manualArtifacts: ManualArtifactRegistrationPersistence;
}): Promise<Action> {
  const action = ActionSchema.parse(input.action);
  if (!isDocumentToolCapabilityId(action.kind)) {
    return action;
  }
  const payload = JsonObjectSchema.parse(action.payload);
  if (typeof payload.workspaceGrantId !== "string" || payload.workspaceGrantId.length === 0) {
    throw new Error("Document Tool effect metadata is missing workspaceGrantId");
  }
  const grant = await input.workspaces.loadWorkspaceGrant(payload.workspaceGrantId);
  if (grant === undefined || grant.status !== "active") {
    throw new Error("Document Tool workspace grant is unavailable before dispatch");
  }
  if (typeof payload.relativePath !== "string") {
    throw new Error("Document Tool effect metadata is missing relativePath");
  }
  await validateWorkspaceAttachmentIdentity({
    capabilityId: action.kind,
    workspaceGrantId: payload.workspaceGrantId,
    relativePath: payload.relativePath,
    targetRealPath: resolve(grant.rootRealPath, payload.relativePath),
    manualArtifacts: input.manualArtifacts,
  });
  const hydratedPayload = JsonObjectSchema.parse({
    workspaceRoot: grant.rootRealPath,
    relativePath: payload.relativePath,
    ...(payload.workbook === undefined ? {} : { workbook: payload.workbook }),
    ...(payload.presentation === undefined ? {} : { presentation: payload.presentation }),
    ...(payload.mode === undefined ? {} : { mode: payload.mode }),
    ...(payload.overwrite === undefined ? {} : { overwrite: payload.overwrite }),
    options: payload.options,
    limits: payload.limits,
  });
  return ActionSchema.parse({
    ...action,
    payload: hydratedPayload,
  });
}

const WORKSPACE_SOURCE_READ_CAPABILITY_IDS = new Set([
  "tool.document.docx.read",
  "tool.document.xlsx.read",
  "tool.document.pdf.extract_text",
]);

export async function validateWorkspaceAttachmentIdentity(input: Readonly<{
  capabilityId: string;
  workspaceGrantId: string;
  relativePath: string;
  targetRealPath: string;
  manualArtifacts: ManualArtifactRegistrationPersistence;
}>): Promise<void> {
  if (!WORKSPACE_SOURCE_READ_CAPABILITY_IDS.has(input.capabilityId)) return;
  const registration = await input.manualArtifacts
    .findManualArtifactRegistrationByWorkspacePath({
      workspaceGrantId: input.workspaceGrantId,
      relativePath: input.relativePath,
    });
  // VS2.1's explicit workspace-relative path flow remains valid. VS2.2
  // attachments are registered first and therefore take this exact identity path.
  if (registration === undefined) return;
  try {
    const link = await lstat(input.targetRealPath);
    if (link.isSymbolicLink() || !link.isFile() || link.nlink > 1) {
      throw new Error("not_regular_single_link");
    }
    const bytes = await readFile(input.targetRealPath);
    const fileSha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== registration.byteSize || fileSha256 !== registration.fileSha256) {
      throw new Error("digest_or_size_changed");
    }
  } catch {
    throw new Error(
      "workspace.attachment_identity_changed: Selected attachment changed after registration",
    );
  }
}

async function ensureDocumentToolStep(input: {
  taskRuntime: DurableTaskRuntime;
  clock: Clock;
  ids: IdGenerator;
  call: AssistantToolCall;
  modelPayload: JsonObject;
}): Promise<{ runId: string; stepId: string }> {
  const state = await input.taskRuntime.snapshot(input.call.taskId);
  if (
    state === undefined
    || state.status !== "running"
    || state.activeRunId === undefined
  ) {
    throw new Error("Document Tool call requires a running Task");
  }
  const run = state.runs.find((candidate) => candidate.runId === state.activeRunId);
  if (run === undefined || run.status !== "running") {
    throw new Error("Document Tool call requires an active running Run");
  }
  if (run.activeStepId !== undefined) {
    const active = run.steps.find((candidate) => candidate.stepId === run.activeStepId);
    if (
      active?.action.actionId === input.call.actionId
      && active.action.kind === input.call.capabilityId
      && JSON.stringify(active.action.payload) === JSON.stringify(input.modelPayload)
    ) return { runId: run.runId, stepId: active.stepId };
    throw new Error("Document Tool dispatch requires the Model step to be completed first");
  }
  const stepId = input.ids.next();
  const started = await input.taskRuntime.dispatch({
    commandId: input.ids.next(),
    taskId: input.call.taskId,
    type: "start_step",
    issuedAt: input.clock.now(),
    runId: run.runId,
    stepId,
    planRevision: {
      executionPlanId: input.ids.next(),
      planRevisionId: input.ids.next(),
      revision: 1,
    },
    action: {
      actionId: input.call.actionId,
      kind: input.call.capabilityId,
      payload: input.modelPayload,
    },
  });
  if (!started.accepted) throw new Error(started.error.message);
  return { runId: run.runId, stepId };
}

function parseDocumentToolModelArguments(capabilityId: string, value: unknown): {
  relativePath: string;
  options: JsonObject;
  mode?: "create_new" | "overwrite_existing";
  workbook?: JsonObject;
  presentation?: JsonObject;
} {
  const parsed = JsonObjectSchema.parse(value);
  if (typeof parsed.relativePath !== "string" || parsed.relativePath.trim().length === 0) {
    throw new Error("Document Tool call requires a relativePath argument");
  }
  const relativePath = capabilityId === "tool.document.xlsx.write"
    ? parsed.relativePath.trim()
    : parsed.relativePath.trim().replace(/^\/+/u, "");
  const options = parsed.options === undefined ? {} : JsonObjectSchema.parse(parsed.options);
  if (capabilityId !== "tool.document.xlsx.write" && capabilityId !== PPTX_WRITE_CAPABILITY_ID) {
    return { relativePath, options };
  }
  if (capabilityId === PPTX_WRITE_CAPABILITY_ID) {
    if (parsed.mode !== undefined && parsed.mode !== "create_new") {
      throw new Error("PPTX write mode must be create_new");
    }
    return {
      relativePath,
      options,
      mode: "create_new",
      presentation: JsonObjectSchema.parse(parsed.presentation),
    };
  }
  const mode = parseXlsxWriteMode(parsed.mode);
  return {
    relativePath,
    mode,
    options,
    workbook: JsonObjectSchema.parse(parsed.workbook),
  };
}

function parseXlsxWriteMode(value: unknown): "create_new" | "overwrite_existing" {
  if (value === undefined) return "create_new";
  if (value === "create_new" || value === "overwrite_existing") return value;
  throw new Error("XLSX write mode must be create_new or overwrite_existing");
}

function documentToolAuthorizationContext(input: {
  activeUserId: string;
  capabilityId: string;
  workspaceGrantId: string;
  workspaceRoot: string;
  targetRealPath: string;
  operation: "read" | "create" | "modify";
}): ToolAuthorizationContext {
  const grantId = workspaceGrantEntityId(input.workspaceGrantId);
  return {
    schemaVersion: CONTRACT_VERSION,
    subject: {
      schemaVersion: CONTRACT_VERSION,
      userId: input.activeUserId,
      activeConfigRevision: "desktop-private-dwo2",
      canUseTools: true,
      assignedToolCapabilityIds: [input.capabilityId],
      grants: [{
        schemaVersion: CONTRACT_VERSION,
        grantId,
        kind: "workspace",
        rootRealPath: input.workspaceRoot,
        operations: [input.operation],
      }],
    },
    resourceAccesses: [{
      grantId,
      targetRealPath: input.targetRealPath,
      operation: input.operation,
      protectedResource: false,
    }],
    availability: {
      enabled: true,
      healthy: true,
      credentialAvailable: true,
      revision: "desktop-private-dwo2",
    },
  };
}

function unavailableDocumentToolAuthorizationContext(input: {
  activeUserId: string;
  capabilityId: string;
  workspaceGrantId: string;
  targetRealPath: string;
  operation: "read" | "create" | "modify";
}): ToolAuthorizationContext {
  return {
    schemaVersion: CONTRACT_VERSION,
    subject: {
      schemaVersion: CONTRACT_VERSION,
      userId: input.activeUserId,
      activeConfigRevision: "desktop-private-dwo2",
      canUseTools: true,
      assignedToolCapabilityIds: [input.capabilityId],
      grants: [],
    },
    resourceAccesses: [{
      grantId: workspaceGrantEntityId(input.workspaceGrantId),
      targetRealPath: input.targetRealPath,
      operation: input.operation,
      protectedResource: false,
    }],
    availability: {
      enabled: true,
      healthy: false,
      credentialAvailable: true,
      revision: "desktop-private-dwo2",
    },
  };
}

function documentToolFileOperation(
  capabilityId: string,
  writeMode: "create_new" | "overwrite_existing" | undefined,
): "read" | "create" | "modify" {
  if (capabilityId === PPTX_WRITE_CAPABILITY_ID) return "create";
  if (capabilityId !== "tool.document.xlsx.write") return "read";
  return writeMode === "overwrite_existing" ? "modify" : "create";
}

function buildPptxWriteRequestDigest(input: {
  idempotencyKey: string;
  relativePath: string;
  presentation: JsonObject | undefined;
  options: JsonObject;
}): string {
  if (input.presentation === undefined) {
    throw new Error("PPTX write requires presentation payload");
  }
  const workerOptions = {
    ...input.options,
    mode: "create_new",
    presentation: input.presentation,
  };
  const normalized = normalizePptxWriteOptions(workerOptions, DOCUMENT_TOOL_LIMITS);
  return computePptxWriteRequestDigest(
    input.idempotencyKey,
    input.relativePath,
    normalized.presentation,
  );
}

async function buildXlsxOverwriteConfirmationMaterial(input: {
  idempotencyKey: string;
  workspaceRoot: string;
  relativePath: string;
  targetRealPath: string;
  workbook: JsonObject | undefined;
  options: JsonObject;
}): Promise<{ confirmedOldSha256: string; requestDigest: string }> {
  if (input.workbook === undefined) {
    throw new Error("XLSX overwrite requires workbook payload");
  }
  validateXlsxOverwriteRelativePath(input.relativePath);
  const link = await lstat(input.targetRealPath);
  if (link.isSymbolicLink() || !link.isFile() || link.nlink > 1) {
    throw new Error("XLSX overwrite target must be one regular single-link file");
  }
  const realTarget = await realpath(input.targetRealPath);
  if (!pathWithin(realTarget, input.workspaceRoot)) {
    throw new Error("XLSX overwrite target escapes the workspace");
  }
  const target = await stat(input.targetRealPath);
  if (!target.isFile()) {
    throw new Error("XLSX overwrite target must be an existing file");
  }
  if (target.size > DOCUMENT_TOOL_LIMITS.maxFileBytes) {
    throw new Error("XLSX overwrite target exceeds the Document Tool file limit");
  }
  const bytes = await readFile(input.targetRealPath);
  const confirmedOldSha256 = createHash("sha256").update(bytes).digest("hex");
  const workerOptions = {
    ...input.options,
    workbook: input.workbook,
    mode: "overwrite_existing",
    overwrite: { confirmedOldSha256 },
  };
  const normalized = normalizeXlsxWriteOptions(workerOptions, DOCUMENT_TOOL_LIMITS);
  return {
    confirmedOldSha256,
    requestDigest: computeXlsxOverwriteRequestDigest(
      input.idempotencyKey,
      input.relativePath,
      normalized.workbook,
      confirmedOldSha256,
    ),
  };
}

function xlsxOverwriteConfirmationMaterialKey(call: AssistantToolCall): string {
  return `${call.taskId}:${call.toolCallId}:${call.actionId}`;
}

function clearPendingXlsxOverwriteConfirmations(
  pending: Map<string, XlsxOverwriteConfirmationMaterial>,
  taskId: string,
): void {
  const prefix = `${taskId}:`;
  for (const key of pending.keys()) {
    if (key.startsWith(prefix)) pending.delete(key);
  }
}

function validateXlsxOverwriteRelativePath(relativePath: string): void {
  if (
    relativePath.length === 0 ||
    relativePath.length > 1024 ||
    relativePath.includes("\0") ||
    relativePath.includes("\\") ||
    isAbsolute(relativePath) ||
    win32.isAbsolute(relativePath) ||
    relativePath.startsWith("\\\\") ||
    relativePath.includes("://")
  ) {
    throw new Error("XLSX overwrite target path is invalid");
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error("XLSX overwrite target path is invalid");
  }
}

function pathWithin(target: string, root: string): boolean {
  const normalizedRoot = root === "/" ? "/" : root.replace(/\/+$/u, "");
  return target === normalizedRoot || normalizedRoot === "/" || target.startsWith(`${normalizedRoot}/`);
}

function workspaceGrantEntityId(workspaceGrantId: string): string {
  const prefix = "workspace:";
  return workspaceGrantId.startsWith(prefix)
    ? workspaceGrantId.slice(prefix.length)
    : workspaceGrantId;
}

function runtimeFixture(input: Readonly<{
  demoMode: boolean;
  legacyTestMode: boolean;
}>) {
  const { demoMode, legacyTestMode } = input;
  const fixtureMode = demoMode || legacyTestMode;
  const capability = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.desktop-scripted",
    kind: "model",
    name: "Desktop Scripted Model",
    description: "DCF-1.2 deterministic local Model",
    source,
    model: {
      family: "scripted",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 16_384,
      supportsStreaming: true,
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.desktop-scripted",
    adapterKind: "model_provider",
    source,
    implementationRef: "core:desktop-scripted-model",
    runtimeBoundary: "in_process",
    protocol: { name: "robothree-model", version: "v1alpha1" },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.desktop-scripted",
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
  const tool = demoMode
    ? createDemoToolRecords()
    : undefined;
  const registryBuilder = new RegistryBuilder({
    trustedSources: fixtureMode
      ? [source, DOCUMENT_TOOL_SOURCE, WORKSPACE_TEXT_TOOL_SOURCE]
      : [DOCUMENT_TOOL_SOURCE, WORKSPACE_TEXT_TOOL_SOURCE],
  });
  if (fixtureMode) {
    registryBuilder
      .registerCapability(capability)
      .registerAdapterDescriptor(descriptor)
      .registerBinding(binding);
  }
  if (tool !== undefined) {
    registryBuilder
      .registerCapability(tool.definition)
      .registerAdapterDescriptor(tool.descriptor)
      .registerBinding(tool.binding);
  }
  if (!demoMode) {
    registerDocumentToolRecords(registryBuilder);
    registerWorkspaceTextToolRecords(registryBuilder);
  }
  const registry = registryBuilder.finalize();
  const model = createModelDefinition({
    schemaVersion: "v1alpha1",
    modelId: capability.capabilityId,
    name: demoMode
      ? "DCF-2C Scripted Demo Model"
      : "Desktop Scripted Model",
    source: "official",
    capability: {
      capabilityId: capability.capabilityId,
      capabilityRevision: capability.revision,
    },
    capabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: true,
      supportsStreaming: true,
      contextWindow: 16_384,
    },
    createdAt: FIXTURE_CREATED_AT,
  });
  const toolReferences = tool === undefined
    ? DOCUMENT_TOOL_REGISTRY_RECORDS.definitions.map((definition) => ({
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
    }))
    : [{
      capabilityId: tool.definition.capabilityId,
      capabilityRevision: tool.definition.revision,
    }];
  const agent = demoMode
    ? createAgentDefinitionRevision({
      schemaVersion: "v1alpha1",
      agentDefinitionId: "agent.dcf2c-demo",
      name: "RoboThree DCF-2C Demo Agent",
      identity: "RoboThree isolated DCF-2C recovery demo agent",
      goal: "Validate durable user confirmation and restart recovery",
      instructions: "Execute only the fixed local Process Echo demo action.",
      defaultModelId: model.modelId,
      allowModelOverride: false,
      skillReferences: [],
      toolReferences,
      knowledgeReferences: [],
      requiredModelCapabilities: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        supportsToolCalling: true,
        supportsStreaming: true,
        minimumContextWindow: 8_192,
      },
      createdAt: FIXTURE_CREATED_AT,
    })
    : createScriptedDesktopAgentFixture({
      modelId: model.modelId,
      toolReferences,
    });
  return { registry, model, agent, descriptor, tool };
}

function mergeRegistrySnapshots(
  base: ReturnType<RegistryBuilder["finalize"]>,
  deployment: ReturnType<RegistryBuilder["finalize"]>,
) {
  const definitions = [
    ...base.agentVisibleCapabilities.models,
    ...base.agentVisibleCapabilities.tools,
    ...deployment.agentVisibleCapabilities.models,
    ...deployment.agentVisibleCapabilities.tools,
  ];
  const descriptors = [
    ...base.infrastructureResources.adapterDescriptors,
    ...deployment.infrastructureResources.adapterDescriptors,
  ];
  const bindings = [
    ...base.infrastructureResources.capabilityBindings,
    ...deployment.infrastructureResources.capabilityBindings,
  ];
  const sources = new Map<string, (typeof definitions)[number]["source"]>();
  for (const item of [...definitions, ...descriptors, ...bindings]) {
    sources.set(
      `${item.source.trust}:${item.source.packageId}:${item.source.packageRevision}`,
      item.source,
    );
  }
  const builder = new RegistryBuilder({ trustedSources: [...sources.values()] });
  const parsed = RegistrySnapshotSchema.parse({
    schemaVersion: CONTRACT_VERSION,
    registryRevision: base.registryRevision,
    agentVisibleCapabilities: {
      models: definitions.filter((definition) => definition.kind === "model"),
      tools: definitions.filter((definition) => definition.kind === "tool"),
    },
    infrastructureResources: {
      adapterDescriptors: descriptors,
      capabilityBindings: bindings,
    },
  });
  for (const definition of [
    ...parsed.agentVisibleCapabilities.models,
    ...parsed.agentVisibleCapabilities.tools,
  ]) builder.registerCapability(definition);
  for (const descriptor of parsed.infrastructureResources.adapterDescriptors) {
    builder.registerAdapterDescriptor(descriptor);
  }
  for (const binding of parsed.infrastructureResources.capabilityBindings) {
    builder.registerBinding(binding);
  }
  return builder.finalize();
}

function enterpriseR2DRegistrySnapshot(
  deployment: InternalTrialEnterpriseModelDeployment,
  registryRevision: string,
  skill?: Readonly<{
    skillId: string;
    revision: string;
    contentDigest: string;
  }>,
  tools: readonly Readonly<{
    capabilityId: string;
    capabilityRevision: string;
  }>[] = [],
) {
  return AgentResourceRegistrySnapshotV1Schema.parse({
    schemaVersion: "v1",
    registryRevision,
    models: [{
      ref: {
        modelId: deployment.capability.capabilityId,
        revision: deployment.capability.revision,
        digest: deployment.capability.revision,
      },
      capabilities: {
        inputModalities: deployment.model.capabilities.inputModalities,
        outputModalities: deployment.model.capabilities.outputModalities,
        supportsToolCalling: deployment.model.capabilities.supportsToolCalling,
        supportsStreaming: deployment.model.capabilities.supportsStreaming,
        contextWindow: deployment.model.capabilities.contextWindow,
      },
      available: true,
    }],
    skills: skill === undefined ? [] : [{
      ref: skill,
      available: true,
      materialAvailable: true,
    }],
    tools: tools.map((tool) => ({ ref: tool, available: true })),
    knowledge: [],
    knowledgeProviderReady: false,
  });
}

function runtimeCapabilityAvailability(
  runtime: ReturnType<typeof runtimeFixture>,
) {
  if (runtime.tool !== undefined) {
    return {
      "tool.echo": {
        capabilityId: "tool.echo",
        bindingId: runtime.tool.binding.bindingId,
        adapterDescriptorId: runtime.tool.descriptor.adapterDescriptorId,
        credentialStatus: "available" as const,
        healthStatus: "healthy" as const,
      },
    };
  }
  return Object.fromEntries([
    ...DOCUMENT_TOOL_REGISTRY_RECORDS.bindings,
    WORKSPACE_TEXT_TOOL_BINDING,
  ].map((binding) => [
    binding.capability.capabilityId,
    {
      capabilityId: binding.capability.capabilityId,
      bindingId: binding.bindingId,
      adapterDescriptorId: binding.adapterDescriptor.adapterDescriptorId,
      credentialStatus: "available" as const,
      healthStatus: "healthy" as const,
    },
  ]));
}

function createDemoToolRecords() {
  const definition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "tool.echo",
    kind: "tool",
    name: "DCF-2C Controlled Process Echo",
    description:
      "Returns fixed demo JSON from a trusted local child process.",
    source,
    tool: {
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      readOnlyHint: true,
      risk: {
        schemaVersion: CONTRACT_VERSION,
        sourceRevision: "builtin.dcf2c-process-echo.v1",
        staticFacts: ["local_execution"],
      },
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.tool.dcf2c-process-echo",
    adapterKind: "tool_execution_backend",
    source,
    implementationRef: "core:dcf2c-process-echo",
    runtimeBoundary: "child_process",
    protocol: {
      name: "robothree-process-echo",
      version: "v1alpha1",
    },
    effectRecoveryMode: "idempotent_retry",
    maxConcurrency: 1,
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.tool.dcf2c-process-echo",
    capability: {
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "tool_execution_backend",
    source,
  });
  return { definition, descriptor, binding };
}
