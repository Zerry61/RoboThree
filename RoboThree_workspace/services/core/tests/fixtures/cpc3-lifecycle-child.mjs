import process from "node:process";

import {
  CONTRACT_VERSION,
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
} from "../../../../packages/contracts/dist/index.js";
import {
  ConservativeTokenEstimator,
  ContextBudgetPolicy,
  ContextPipeline,
  FakeClock,
  FakeCompactionSummarizer,
  PLATFORM_PROMPT_V1_REVISION,
  RegistryBuilder,
  SqliteConversationPersistence,
  SqliteTaskPersistence,
  TaskInstructionBundleMaterializer,
  TaskLockedInstructionRuntimeResolver,
  TurnSnapshotBuilder,
  calculateToolCallBatchDigest,
  createAdapterDescriptor,
  createAgentDefinitionRevision,
  createCapabilityBinding,
  createCapabilityDefinition,
  createInitialPersistedTask,
  createTaskRuntimeSelection,
  sha256CanonicalJson,
  TOOL_CALL_BATCH_SCHEMA_VERSION,
  CompactionCoordinator,
} from "../../dist/index.js";

const [command, databasePath, windowName] = process.argv.slice(2);
const at = "2026-08-26T10:00:00.000Z";
const sessionId = uuid(1);
const taskId = uuid(2);
const submitTurnCommandId = uuid(3);
const userMessageId = uuid(4);
const diagnostics = {
  sqliteHandles: new Set(),
  agentLoopRuns: new Set(),
  mailboxes: new Set(),
  abortControllers: new Set(),
  scheduledTimers: new Set(),
  providerStreams: new Set(),
  toolExecutions: new Set(),
  compactionJobs: new Set(),
  pendingDeliveryRecords: new Set(),
  fixtureServers: new Set(),
  diagnosticSubscriptions: new Set(),
};

const clock = new FakeClock(at);
const tasks = new SqliteTaskPersistence({ databasePath, clock });
const conversation = new SqliteConversationPersistence({ databasePath, clock });
diagnostics.sqliteHandles.add(tasks);
diagnostics.sqliteHandles.add(conversation);

try {
  await tasks.start();
  await conversation.start();
  await seedTaskBundle();
  await seedConversation();
  if (command === "prepare") await prepareWindow();
  else if (command === "recover") await recoverWindow();
  else throw new Error(`cpc3_child_command_invalid:${String(command)}`);
} finally {
  await conversation.stop().catch(() => undefined);
  diagnostics.sqliteHandles.delete(conversation);
  await tasks.stop().catch(() => undefined);
  diagnostics.sqliteHandles.delete(tasks);
}

async function prepareWindow() {
  const bundle = await requireBundle();
  if (windowName === "task_bundle_loaded") await barrier(windowName, bundle, undefined);
  const runtime = await materialize(bundle);
  if (windowName === "instruction_bundle_materialized") await barrier(windowName, bundle, runtime);
  const finalized = await buildRequest(bundle, runtime, false);
  if (windowName === "model_request_finalized") {
    await barrier(windowName, bundle, runtime, finalized);
  }
  if (windowName === "tool_result_committed") {
    await appendDurableToolResult();
    await barrier(windowName, bundle, runtime, finalized);
  }
  if (windowName === "compaction_committed") {
    await commitCompaction(bundle);
    await barrier(windowName, bundle, runtime, finalized);
  }
  if (windowName === "assistant_committed") {
    await appendTerminalAssistant();
    await barrier(windowName, bundle, runtime, finalized);
  }
  throw new Error(`cpc3_window_invalid:${String(windowName)}`);
}

async function recoverWindow() {
  const bundle = await requireBundle();
  const messages = await conversation.loadMessageRange(sessionId, 1, Number.MAX_SAFE_INTEGER);
  const terminal = messages.some((message) =>
    message.envelope.taskId === taskId && message.message.role === "assistant"
      && message.message.toolCalls.length === 0);
  let runtime;
  let finalized;
  let materializeCount = 0;
  let contextCount = 0;
  if (!terminal) {
    runtime = await materialize(bundle);
    materializeCount += 1;
    if (windowName !== "tool_result_committed") {
      finalized = await buildRequest(
        bundle,
        runtime,
        windowName === "compaction_committed",
      );
      contextCount += 1;
    }
  }
  const toolBatch = await conversation.loadToolCallBatch(uuid(40));
  const compactionJobs = await conversation.listPendingCompactionJobs();
  const session = await conversation.loadSession(sessionId);
  await closeBeforeEvidence();
  process.send?.({
    type: "result",
    result: {
      window: windowName,
      processId: process.pid,
      taskInstructionBindingDigest: runtime?.bundle.binding.bindingDigest,
      instructionBundleDigest: runtime?.bundle.descriptor.instructionBundleDigest,
      systemMessageDigest: runtime?.bundle.message.sourceDigest,
      modelRequestDigest: finalized?.request.requestDigest,
      receiptModelRequestDigest: finalized?.receipt.modelRequestDigest,
      materializeCount,
      contextCount,
      providerResolveCount: 0,
      upstreamRequestCount: 0,
      toolBatchCommitted: toolBatch !== undefined,
      activeCompaction: session?.activeCompactionId !== undefined,
      pendingCompactionCount: compactionJobs.length,
      terminalReplay: terminal,
      resourceCounts: resourceCounts(),
      testIdentityUsed: true,
      productionCpcActivationEnabled: false,
    },
  });
}

async function seedTaskBundle() {
  if (await tasks.loadSubmitTurnTaskBundle(submitTurnCommandId) !== undefined) return;
  const fixture = runtimeFixture();
  const task = createInitialPersistedTask({
    taskId,
    sessionId,
    agentDefinition: {
      agentDefinitionId: fixture.agent.agentDefinitionId,
      version: fixture.agent.revision,
    },
    goal: "CPC-3 exact lifecycle closure",
    createdAt: at,
  }, uuid(5));
  const committed = await tasks.commitSubmitTurnTaskBundle({
    submitTurnCommandId,
    userMessageId,
    task,
    capabilityLocks: [fixture.modelLock],
    runtimeSelection: fixture.selection,
    committedAt: at,
  });
  if (!committed.ok) throw new Error(committed.error.code);
}

async function seedConversation() {
  if (await conversation.loadSession(sessionId) !== undefined) return;
  await requireOk(conversation.createSession({
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    sessionId,
    messageSequence: 0,
    sessionEventSequence: 0,
    contextRevision: 0,
    createdAt: at,
    updatedAt: at,
  }));
  const providerMessage = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "user",
    content: [{ type: "text", text: "controlled lifecycle request" }],
  };
  await requireOk(conversation.appendMessage({
    expectedMessageSequence: 0,
    message: conversationMessage(userMessageId, 1, providerMessage),
    updatedAt: at,
  }));
}

async function requireBundle() {
  const bundle = await tasks.loadSubmitTurnTaskBundle(submitTurnCommandId);
  if (bundle === undefined) throw new Error("cpc3_task_bundle_missing");
  return bundle;
}

async function materialize(bundle) {
  const fixture = runtimeFixture();
  return new TaskLockedInstructionRuntimeResolver({
    enabled: true,
    materializer: new TaskInstructionBundleMaterializer({
      tokenEstimator: new ConservativeTokenEstimator(),
      budgetPolicy: policy(),
    }),
  }).resolve({
    runtimeSelection: bundle.runtimeSelection,
    submitTurnBundleDigest: bundle.binding.bundleDigest,
    agent: fixture.agent,
  });
}

async function buildRequest(bundle, runtime, compacted) {
  if (runtime.mode !== "cpc_v1") throw new Error("cpc3_runtime_not_cpc");
  const snapshot = await new TurnSnapshotBuilder({
    conversationPersistence: conversation,
    taskPersistence: tasks,
  }).build({
    snapshotId: compacted ? uuid(61) : uuid(60),
    sessionId,
    createdAt: at,
    ...(compacted ? { fromMessageSequence: 2 } : {}),
  });
  const messages = snapshot.conversation.messageStartSequence === undefined
    ? []
    : await conversation.loadMessageRange(
      sessionId,
      snapshot.conversation.messageStartSequence,
      snapshot.conversation.messageEndSequence,
    );
  let compactionSummary;
  if (snapshot.conversation.activeCompactionId !== undefined) {
    const record = await conversation.loadCompactionRecord(snapshot.conversation.activeCompactionId);
    if (record === undefined) throw new Error("cpc3_compaction_record_missing");
    compactionSummary = {
      snapshotId: snapshot.snapshotId,
      contextRevision: snapshot.conversation.contextRevision,
      summaryDigest: sha256CanonicalJson(JsonValueSchema.parse(record.summary)),
      record,
    };
  }
  return new ContextPipeline({
    budgetPolicy: policy(),
    estimator: new ConservativeTokenEstimator(),
  }).run({
    phase: compacted ? "mid_turn" : "pre_call",
    requestId: compacted ? uuid(71) : uuid(70),
    snapshot,
    conversationMessages: messages,
    ...(compactionSummary === undefined ? {} : { compactionSummary }),
    model: {
      capabilityId: bundle.runtimeSelection.resolvedModelLock.capabilityId,
      capabilityRevision: digest("1"),
    },
    lockedInstructionBundle: {
      schemaVersion: "v1",
      snapshotId: snapshot.snapshotId,
      binding: runtime.bundle.binding,
      descriptor: runtime.bundle.descriptor,
      message: runtime.bundle.message,
      estimatedInputTokens: runtime.bundle.estimatedInputTokens,
      availableInputTokens: runtime.bundle.availableInputTokens,
      budgetPolicyDigest: runtime.bundle.budgetPolicyDigest,
    },
  });
}

async function appendDurableToolResult() {
  if (await conversation.loadToolCallBatch(uuid(40)) !== undefined) return;
  const call = {
    toolCallId: uuid(41),
    taskId,
    actionId: uuid(42),
    capabilityId: "tool.cpc3-controlled",
    arguments: { value: "sentinel" },
  };
  const assistant = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "assistant",
    content: [{ type: "text", text: "controlled tool dispatch" }],
    toolCalls: [call],
  };
  const assistantMessage = conversationMessage(uuid(43), 2, assistant, taskId);
  const batch = {
    schemaVersion: TOOL_CALL_BATCH_SCHEMA_VERSION,
    batchId: uuid(40),
    sessionId,
    taskId,
    runId: uuid(44),
    assistantMessageId: assistantMessage.envelope.messageId,
    assistantMessageSequence: 2,
    assistantMessageDigest: assistantMessage.envelope.messageDigest,
    batchDigest: calculateToolCallBatchDigest({
      sessionId,
      taskId,
      runId: uuid(44),
      assistantMessageId: assistantMessage.envelope.messageId,
      assistantMessageSequence: 2,
      assistantMessageDigest: assistantMessage.envelope.messageDigest,
      toolCalls: [call],
    }),
    callCount: 1,
    createdAt: at,
  };
  const ready = {
    schemaVersion: TOOL_CALL_BATCH_SCHEMA_VERSION,
    batchId: batch.batchId,
    toolCallId: call.toolCallId,
    actionId: call.actionId,
    ordinal: 0,
    disposition: "ready_to_dispatch",
    revision: 0,
    updatedAt: at,
  };
  await requireOk(conversation.appendAssistantToolCallBatch({
    expectedMessageSequence: 1,
    message: assistantMessage,
    batch,
    dispositions: [ready],
    updatedAt: at,
  }));
  const linked = { ...ready, disposition: "effect_linked", revision: 1, effectAttemptId: uuid(45) };
  await requireOk(conversation.transitionToolCallDisposition({
    batchId: batch.batchId,
    toolCallId: call.toolCallId,
    expectedRevision: 0,
    next: linked,
  }));
  const observation = {
    observationId: uuid(46),
    actionId: call.actionId,
    observedAt: at,
    outcome: "failed",
    error: { code: "tool.controlled_failure", category: "validation", retryable: false },
  };
  const tool = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "tool",
    toolCallId: call.toolCallId,
    taskId,
    actionId: call.actionId,
    observationId: observation.observationId,
    outcome: "failed",
    resultDigest: sha256CanonicalJson(JsonValueSchema.parse(observation)),
    content: [{ type: "text", text: "payload claims success but structured outcome is failed" }],
  };
  const toolMessage = conversationMessage(uuid(47), 3, tool, taskId);
  await requireOk(conversation.appendToolResultAndCompleteDisposition({
    expectedMessageSequence: 2,
    expectedDispositionRevision: 1,
    batchId: batch.batchId,
    toolCallId: call.toolCallId,
    message: toolMessage,
    completedDisposition: {
      ...linked,
      disposition: "result_committed",
      revision: 2,
      resultMessageId: toolMessage.envelope.messageId,
      resultDigest: tool.resultDigest,
    },
    updatedAt: at,
  }));
}

async function commitCompaction(bundle) {
  const session = await conversation.loadSession(sessionId);
  if (session.activeCompactionId !== undefined) return;
  const runtime = runtimeFixture();
  const coordinator = new CompactionCoordinator({
    persistence: conversation,
    summarizer: new FakeCompactionSummarizer({
      summary: "controlled derived summary",
      summarySchemaVersion: "v1alpha1",
      summarizerModelRef: runtime.model.capabilityId,
      summarizerPromptRevision: digest("8"),
      estimatedTokensBefore: 100,
      estimatedTokensAfter: 20,
    }),
    clock,
    idGenerator: { next: (() => {
      let next = 80;
      return () => uuid(next++);
    })() },
  });
  diagnostics.compactionJobs.add("cpc3");
  const result = await coordinator.compact({
    sessionId,
    sourceStartSequence: 1,
    sourceEndSequence: 1,
    executionBinding: {
      taskId,
      runtimeSelectionId: bundle.runtimeSelection.runtimeSelectionId,
      runtimeSelectionDigest: bundle.runtimeSelection.selectionDigest,
      modelLockId: bundle.runtimeSelection.resolvedModelLock.lockId,
      modelCapabilityId: bundle.runtimeSelection.resolvedModelLock.capabilityId,
      modelLockDigest: bundle.runtimeSelection.resolvedModelLock.lockDigest,
      registryRevision: bundle.runtimeSelection.registryRevision,
      adapterDescriptorId: runtime.modelDescriptor.adapterDescriptorId,
      adapterDescriptorRevision: runtime.modelDescriptor.revision,
      externalTargetDigest: digest("9"),
      summarizerPromptRevision: digest("8"),
    },
  });
  diagnostics.compactionJobs.delete("cpc3");
  if (result.status !== "completed") throw new Error("cpc3_compaction_failed");
}

async function appendTerminalAssistant() {
  const messages = await conversation.loadMessageRange(sessionId, 1, Number.MAX_SAFE_INTEGER);
  if (messages.some((message) => message.envelope.taskId === taskId
    && message.message.role === "assistant" && message.message.toolCalls.length === 0)) return;
  const session = await conversation.loadSession(sessionId);
  const assistant = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "assistant",
    content: [{ type: "text", text: "controlled terminal" }],
    toolCalls: [],
  };
  await requireOk(conversation.appendMessage({
    expectedMessageSequence: session.messageSequence,
    message: conversationMessage(uuid(90), session.messageSequence + 1, assistant, taskId),
    updatedAt: at,
  }));
}

async function barrier(name, bundle, runtime, finalized) {
  process.send?.({
    type: "barrier",
    name,
    processId: process.pid,
    taskRuntimeSelectionDigest: bundle.runtimeSelection.selectionDigest,
    taskInstructionBindingDigest: runtime?.mode === "cpc_v1"
      ? runtime.bundle.binding.bindingDigest
      : undefined,
    instructionBundleDigest: runtime?.mode === "cpc_v1"
      ? runtime.bundle.descriptor.instructionBundleDigest
      : undefined,
    modelRequestDigest: finalized?.request.requestDigest,
    resourceCounts: resourceCounts(),
  });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}

async function closeBeforeEvidence() {
  await conversation.stop();
  diagnostics.sqliteHandles.delete(conversation);
  await tasks.stop();
  diagnostics.sqliteHandles.delete(tasks);
}

function resourceCounts() {
  return {
    openSqliteHandles: diagnostics.sqliteHandles.size,
    activeAgentLoopRuns: diagnostics.agentLoopRuns.size,
    mailboxes: diagnostics.mailboxes.size,
    abortControllers: diagnostics.abortControllers.size,
    scheduledTimers: diagnostics.scheduledTimers.size,
    providerStreams: diagnostics.providerStreams.size,
    toolExecutions: diagnostics.toolExecutions.size,
    compactionJobs: diagnostics.compactionJobs.size,
    pendingDeliveryRecords: diagnostics.pendingDeliveryRecords.size,
    temporaryFixtureServers: diagnostics.fixtureServers.size,
    diagnosticSubscriptions: diagnostics.diagnosticSubscriptions.size,
  };
}

function runtimeFixture() {
  const source = {
    trust: "official",
    packageId: "robothree.official.cpc3",
    packageRevision: digest("a"),
  };
  const modelDefinition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.cpc3-process",
    kind: "model",
    name: "CPC-3 Controlled Model",
    description: "Controlled model for CPC-3 lifecycle closure",
    source,
    model: {
      family: "controlled",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 32_768,
      supportsStreaming: true,
    },
  });
  const modelDescriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.cpc3-process",
    adapterKind: "model_provider",
    source,
    implementationRef: "process:cpc3-model",
    runtimeBoundary: "child_process",
    protocol: { name: "cpc3-model", version: "v1alpha1" },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.cpc3-process",
    capability: {
      capabilityId: modelDefinition.capabilityId,
      capabilityRevision: modelDefinition.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: modelDescriptor.adapterDescriptorId,
      adapterDescriptorRevision: modelDescriptor.revision,
    },
    port: "model_provider",
    source,
  });
  const registry = new RegistryBuilder({ trustedSources: [source] })
    .registerCapability(modelDefinition)
    .registerAdapterDescriptor(modelDescriptor)
    .registerBinding(binding)
    .finalize();
  const modelLock = {
    schemaVersion: CONTRACT_VERSION,
    lockId: uuid(10),
    taskId,
    registryRevision: registry.registryRevision,
    definitionSnapshot: modelDefinition,
    bindingSnapshot: binding,
    adapterDescriptorSnapshot: modelDescriptor,
    lockedAt: at,
  };
  const agent = createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: "agent.cpc3-process",
    name: "CPC-3 Process Agent",
    identity: "Controlled lifecycle agent",
    goal: "Prove exact CPC restart semantics",
    instructions: "Use only durable Core facts.",
    defaultModelId: modelDefinition.capabilityId,
    allowModelOverride: false,
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
  const selection = createTaskRuntimeSelection({
    schemaVersion: "v1alpha1",
    runtimeSelectionId: uuid(11),
    taskId,
    agent: {
      agentDefinitionId: agent.agentDefinitionId,
      revision: agent.revision,
      digest: agent.digest,
    },
    agentDefaultModelId: modelDefinition.capabilityId,
    resolvedModelLock: {
      lockId: modelLock.lockId,
      capabilityId: modelDefinition.capabilityId,
      lockDigest: sha256CanonicalJson(JsonValueSchema.parse(modelLock)),
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    platformPromptRevision: PLATFORM_PROMPT_V1_REVISION,
    registryRevision: registry.registryRevision,
    createdAt: at,
  });
  return { agent, model: modelDefinition, modelDescriptor, modelLock, selection };
}

function policy() {
  return new ContextBudgetPolicy({
    modelContextWindow: 32_768,
    reservedOutputTokens: 4_096,
    safetyMarginTokens: 1_024,
    compactionThresholdRatio: 0.8,
    maxPreviewBytes: 4_096,
  });
}

function conversationMessage(messageId, sequence, message, messageTaskId) {
  return {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId,
      sessionId,
      sequence,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      ...(messageTaskId === undefined ? {} : { taskId: messageTaskId }),
      createdAt: at,
    },
    message,
  };
}

async function requireOk(promise) {
  const result = await promise;
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function digest(marker) {
  return `sha256:${marker.repeat(64)}`;
}

function uuid(value) {
  return `019f8e00-0000-7000-8001-${String(value).padStart(12, "0")}`;
}
