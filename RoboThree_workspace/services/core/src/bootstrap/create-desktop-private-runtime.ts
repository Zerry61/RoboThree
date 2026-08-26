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
import { DesktopConversationProjectionService } from "../application/desktop-conversation-projection-service.js";
import { DesktopEphemeralEventBus } from "../application/desktop-ephemeral-event-bus.js";
import { DesktopSessionService } from "../application/desktop-session-service.js";
import { DesktopTaskProjectionService } from "../application/desktop-task-projection-service.js";
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
import { DurableTaskRuntime } from "../application/durable-task-runtime.js";
import { EffectCoordinator } from "../application/effect-coordinator.js";
import { ModelEligibilityEvaluator } from "../application/model-eligibility-evaluator.js";
import { FixedTaskAuthorizationModePolicyProvider } from
  "../application/fixed-task-authorization-mode-policy.js";
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
import { isDocumentToolCapabilityId } from "../application/document-tool-context.js";
import { RegistryBuilder } from "../registry/registry-builder.js";
import { RuntimeAdapterHandles } from "../registry/runtime-adapter-handles.js";
import type { AgentLoopStarter } from "../ports/agent-loop-starter.js";
import type { Clock } from "../ports/clock.js";
import type { WorkspaceGrantPersistence } from "../ports/desktop-foundation-persistence.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { TaskPersistence } from "../ports/task-persistence.js";

const CORE_VERSION = "0.0.0-r2d.3.2";
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
  demoMode?: "dcf2c";
}): DesktopPrivateRuntime {
  const demoMode = input.demoMode === "dcf2c";
  const activeUserId = "00000000-0000-4000-8000-000000000001";
  const clock = new SystemClock();
  const ids = new SystemIdGenerator();
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
  const workspaceSelections = new EphemeralWorkspaceSelectionStore({
    clock,
    ids,
  });
  const runtime = runtimeFixture(demoMode);
  const catalog = new InMemoryTrustedRuntimeCatalog()
    .registerAgent(runtime.agent, demoMode)
    .registerModel(runtime.model);
  if (runtime.legacyAgent !== undefined) catalog.registerAgent(runtime.legacyAgent);
  const cpcInstructionRuntimeEnabled = CPC_INSTRUCTION_RUNTIME_DEFAULT_ENABLED;
  const selectionContexts = new FrozenRuntimeSelectionContextProvider({
    registryRevision: runtime.registry.registryRevision,
    platformPromptRevision: platformPromptRevisionForNewTask(
      cpcInstructionRuntimeEnabled,
    ),
    liveModels: [{
      modelId: runtime.model.modelId,
      userAllowed: true,
      enabled: true,
      credentialAvailable: true,
      callable: true,
    }],
    capabilityAvailability: runtimeCapabilityAvailability(runtime),
  });
  const lockService = new TaskCapabilityLockService({
    resolver: new CapabilityResolver(RegistrySnapshotSchema.parse(runtime.registry)),
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
  const documentToolService = documentBackend === undefined
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
          handles: new RuntimeAdapterHandles([documentBackend]),
          clock,
          hydrateAction: (hydration) => hydrateDesktopDocumentToolAction({
            action: hydration.action,
            workspaces: foundation,
          }),
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
        buildDesktopDocumentToolExecution({
          call,
          signal,
          taskRuntime,
          tasks,
          workspaces: foundation,
          clock,
          ids,
          activeUserId,
          pendingXlsxOverwriteConfirmations,
        }),
    });
  const desktopModelProvider = new DesktopDocumentScriptedModelProvider({
    adapterDescriptorId: "adapter.model.desktop-scripted",
    adapterDescriptorRevision: runtime.descriptor.revision,
  });
  const runtimeAdapterHandles = new RuntimeAdapterHandles([desktopModelProvider]);
  const toolCallBatches = new ToolCallBatchCoordinator({
    conversation,
    tasks,
    tools: loopTools,
    clock,
  });
  const loop = new AgentLoopCoordinator({
    model: desktopModelProvider,
    tools: loopTools,
    conversation: conversationWriter,
    batches: toolCallBatches,
  });
  const contextBudgetPolicy = new ContextBudgetPolicy({
    modelContextWindow: runtime.model.capabilities.contextWindow,
    reservedOutputTokens: 1_024,
    safetyMarginTokens: 512,
    compactionThresholdRatio: 0.8,
    maxPreviewBytes: 4_096,
  });
  const contextTokenEstimator = new ConservativeTokenEstimator();
  const normalLoopStarter = new DurableAgentLoopStarter({
    clock,
    ids,
    conversation,
    tasks,
    agents: catalog,
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
      }),
      enabled: cpcInstructionRuntimeEnabled,
    }),
    loop,
    taskRuntime,
    coordination,
    ephemeralEvents,
    adapterHandles: runtimeAdapterHandles,
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
      registryRevision: runtime.registry.registryRevision,
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
    RegistrySnapshotSchema.parse(runtime.registry),
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
  const toolCatalog = new ToolCatalogQueryService({
    registries: registrySnapshots,
    contexts: selectionContexts,
    cursors: catalogCursors,
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
  });
  const server = new CorePrivateHttpServer({
    authorizationToken: input.authorizationToken,
    facade,
    ephemeralEvents,
  });
  const persistence = [conversation, foundation, tasks, coordination] as const;
  let started = false;

  return Object.freeze({
    facade,
    server,
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
        await recovery.recoverOnce();
        recovery.start();
        await server.start();
        started = true;
        runtimeStatus = "ready";
      } catch (error) {
        runtimeStatus = "failed";
        recovery.stop();
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
      recovery.stop();
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

async function buildDesktopDocumentToolExecution(input: {
  call: AssistantToolCall;
  signal: AbortSignal;
  taskRuntime: DurableTaskRuntime;
  tasks: TaskPersistence;
  workspaces: WorkspaceGrantPersistence;
  clock: Clock;
  ids: IdGenerator;
  activeUserId: string;
  pendingXlsxOverwriteConfirmations: Map<string, XlsxOverwriteConfirmationMaterial>;
}) {
  const { call } = input;
  if (!isDocumentToolCapabilityId(call.capabilityId)) {
    throw new Error(`Desktop runtime only binds Document Tool calls, got ${call.capabilityId}`);
  }
  const selection = await input.tasks.loadTaskRuntimeSelection(call.taskId);
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

function runtimeFixture(demoMode: boolean) {
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
    trustedSources: demoMode ? [source] : [source, DOCUMENT_TOOL_SOURCE],
  })
    .registerCapability(capability)
    .registerAdapterDescriptor(descriptor)
    .registerBinding(binding);
  if (tool !== undefined) {
    registryBuilder
      .registerCapability(tool.definition)
      .registerAdapterDescriptor(tool.descriptor)
      .registerBinding(tool.binding);
  }
  if (!demoMode) registerDocumentToolRecords(registryBuilder);
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
  // R2D-3.2 isolates the scripted fixture identity. The legacy v1 route remains
  // readable until the separately gated R2D-3.3 atomic acceptance cutover.
  const legacyAgent = demoMode ? undefined : createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: "agent.general",
    name: "RoboThree General",
    identity: "RoboThree enterprise desktop agent",
    goal: "Complete the user's selected local task",
    instructions: "Use only the exact capabilities locked for this Task. For workspace documents, use Document Tools only when the Task has an active workspace grant and the model provides an exact tool call.",
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
  });
  return { registry, model, agent, legacyAgent, descriptor, tool };
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
  return Object.fromEntries(DOCUMENT_TOOL_REGISTRY_RECORDS.bindings.map((binding) => [
    binding.capability.capabilityId,
    {
      capabilityId: binding.capability.capabilityId,
      bindingId: binding.bindingId,
      adapterDescriptorId: DOCUMENT_TOOL_REGISTRY_RECORDS.descriptor.adapterDescriptorId,
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
