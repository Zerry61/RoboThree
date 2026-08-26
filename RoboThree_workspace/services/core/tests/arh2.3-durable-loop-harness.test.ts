import {
  CONTRACT_VERSION,
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  type AssistantToolCall,
  type ConversationMessage,
  type ModelRequest,
  type ModelStreamEvent,
  type ProviderNeutralMessage,
  type TaskCapabilityLock,
  type ToolAuthorizationContext,
  type ToolExecutionRequest,
} from "@robothree/contracts";
import { fork, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AgentLoopCoordinator,
  AuthorizationEvaluator,
  CapabilityResolver,
  CompactionCoordinator,
  ConservativeTokenEstimator,
  ContextBudgetPolicy,
  ContextPipeline,
  ContextPreparationCoordinator,
  DurableAgentConversationWriter,
  DurableAgentLoopStarter,
  DurableTaskRuntime,
  EffectCoordinator,
  FakeClock,
  FakeCompactionSummarizer,
  FakeIdGenerator,
  FakeScheduler,
  InMemoryTrustedRuntimeCatalog,
  RegistryBuilder,
  RuntimeAdapterHandles,
  RuntimeAdmissionController,
  SqliteConversationPersistence,
  SqliteTaskPersistence,
  TaskCapabilityLockService,
  ToolCallBatchCoordinator,
  ToolEffectExecutor,
  ToolExecutionAgentBridge,
  ToolExecutionService,
  TurnSnapshotBuilder,
  UserConfirmationCoordinator,
  createAdapterDescriptor,
  createAgentDefinitionRevision,
  createCapabilityBinding,
  createCapabilityDefinition,
  createInitialPersistedTask,
  createModelDefinition,
  createReasoningModeLock,
  createTaskAuthorizationModePolicySnapshot,
  createTaskRuntimeSelection,
  createTaskRuntimeSelectionV1Alpha2,
  sha256CanonicalJson,
  TaskAuthorizationSelectionService,
  type CompactionExecutionBindingSeed,
  type ModelProvider,
  type ModelProviderInvocation,
  type ToolExecutionBackend,
} from "../src/index.js";
import type { ReadableModelRequest } from
  "@robothree/contracts/model-protocol/v1alpha2";

const at = "2026-08-13T03:00:00.000Z";
const sessionId = uuid(1);
const taskId = uuid(2);
const runId = uuid(3);
const agentId = "agent.arh23.loop";
const executionBinding: CompactionExecutionBindingSeed = {
  taskId,
  runtimeSelectionId: uuid(5),
  runtimeSelectionDigest: digest("1"),
  modelLockId: uuid(6),
  modelCapabilityId: "model.arh23-loop",
  modelLockDigest: digest("2"),
  registryRevision: digest("3"),
  adapterDescriptorId: "adapter.model.arh23-loop",
  adapterDescriptorRevision: digest("4"),
  externalTargetDigest: digest("5"),
  summarizerPromptRevision: digest("6"),
};
const modelChildScript = fileURLToPath(new URL("./fixtures/arh23-loop-model-child.mjs", import.meta.url));
const toolChildScript = fileURLToPath(new URL("./fixtures/arh23-loop-tool-child.mjs", import.meta.url));

describe("ARH-2.3 durable 50-round automatic Compaction harness", () => {
  it("drives the same 50-round automatic Compaction path through DurableAgentLoopStarter", async () => {
    const report = await runDurableStarterSeed();
    expect(report).toMatchObject({
      rounds: 51,
      toolCallCount: 50,
      taskStatus: "completed",
      pendingCompactionCount: 0,
      recoverableEffectCount: 0,
      modelPurposes: expect.arrayContaining(["assistant_message", "compaction_summary"]),
      replayedWithoutProviderResolution: true,
    });
    expect(report.compactionCount).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("drives main, Tool continuation and Compaction through one v1alpha2 Reasoning lock", async () => {
    const report = await runDurableStarterSeed(true);
    expect(report).toMatchObject({
      rounds: 51,
      toolCallCount: 50,
      taskStatus: "completed",
      pendingCompactionCount: 0,
      modelPurposes: expect.arrayContaining(["assistant_message", "compaction_summary"]),
      requestInvocationDigestMismatchCount: 0,
    });
    expect(new Set(report.requestSchemaVersions)).toEqual(new Set(["v1alpha2"]));
    expect(new Set(report.reasoningModeLockIds).size).toBe(1);
  }, 30_000);

  it("runs 50 ordered Tool batches, triggers first and rolling Compaction, and stays bounded", async () => {
    const reports = [];
    for (let replay = 0; replay < 3; replay += 1) reports.push(await runSemanticSeed());

    expect(reports.every((report) => report.rounds === 51)).toBe(true);
    expect(reports.every((report) => report.toolCallCount === 50)).toBe(true);
    expect(reports.every((report) => report.compactionCount >= 2)).toBe(true);
    expect(reports.every((report) => report.openDispositionCount === 0)).toBe(true);
    expect(reports.every((report) => report.pendingCompactionCount === 0)).toBe(true);
    expect(reports.every((report) => report.modelProcessClosed)).toBe(true);
    expect(reports.every((report) => report.toolProcessClosed)).toBe(true);
    expect(new Set(reports.map((report) => report.timelineDigest)).size).toBe(1);
    expect(new Set(reports.map((report) => report.semanticViewDigest)).size).toBe(1);
    await writeArh333LoopEvidence(reports[0]!);
  }, 30_000);
});

async function writeArh333LoopEvidence(report: Awaited<ReturnType<typeof runSemanticSeed>>) {
  const outputPath = process.env.ROBOTHREE_ARH333_LOOP_EVIDENCE_PATH;
  if (outputPath === undefined) return;
  if (report.compactionCount < 2
    || !report.modelProcessClosed
    || !report.toolProcessClosed
    || report.pendingCompactionCount !== 0
    || report.openDispositionCount !== 0) {
    throw new Error("ARH-3.3.3 loop evidence is incomplete");
  }
  await writeFile(outputPath, JSON.stringify({
    schemaVersion: "v1alpha1",
    mainTerminalCount: 1,
    initialCompactionCommittedCount: 1,
    rollingCompactionCommittedCount: report.compactionCount - 1,
    toolCallCount: report.toolCallCount,
    timelineDigest: report.timelineDigest,
    semanticViewDigest: report.semanticViewDigest,
    pendingCompactionCount: report.pendingCompactionCount,
    openDispositionCount: report.openDispositionCount,
    childProcessCount: 0,
  }), "utf8");
}

async function runDurableStarterSeed(reasoning = false) {
  const directory = await mkdtemp(join(tmpdir(), "robothree-arh23-starter-"));
  const databasePath = join(directory, "robothree.sqlite");
  const clock = new FakeClock(at);
  const ids = new FakeIdGenerator(generatedIds(30_000, 4_000));
  const tasks = new SqliteTaskPersistence({ databasePath, clock });
  const conversation = new SqliteConversationPersistence({ databasePath, clock });
  const fixture = starterRuntimeFixture(reasoning);
  const toolBackend = await ProcessLoopToolBackend.start(fixture.toolDescriptor.revision);
  const model = await ProcessLoopModel.start(fixture.modelDescriptor.revision);
  try {
    await tasks.start();
    await conversation.start();
    const task = createInitialPersistedTask({
      taskId,
      sessionId,
      agentDefinition: {
        agentDefinitionId: fixture.agent.agentDefinitionId,
        version: fixture.agent.revision,
      },
      goal: "ARH-2.3 production Starter 50-round loop",
      createdAt: at,
    }, uuid(29_999));
    const baseBundle = {
      submitTurnCommandId: uuid(29_990),
      userMessageId: uuid(100),
      task,
      capabilityLocks: fixture.locks,
      runtimeSelection: fixture.selection,
      committedAt: at,
    };
    const committed = fixture.selection.schemaVersion === "v1alpha2"
      ? await tasks.commitReasoningAwareSubmitTurnTaskBundle({
        ...baseBundle,
        ...authorizationFacts(fixture.selection),
      })
      : await tasks.commitSubmitTurnTaskBundle(baseBundle);
    if (!committed.ok) throw new Error(committed.error.code);
    await conversation.createSession({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      sessionId,
      messageSequence: 0,
      sessionEventSequence: 0,
      contextRevision: 0,
      createdAt: at,
      updatedAt: at,
    });
    await conversation.appendMessage({
      expectedMessageSequence: 0,
      message: userMessage(),
      updatedAt: at,
    });
    const runtime = new DurableTaskRuntime({ persistence: tasks, idGenerator: ids });
    const locks = new TaskCapabilityLockService({
      resolver: new CapabilityResolver(fixture.registry),
      persistence: tasks,
      clock,
      idGenerator: ids,
    });
    const confirmations = new UserConfirmationCoordinator({
      runtime,
      persistence: tasks,
      clock,
      idGenerator: ids,
    });
    const toolHandles = new RuntimeAdapterHandles([toolBackend]);
    const toolService = new ToolExecutionService({
      lockService: locks,
      effects: new EffectCoordinator({
        runtime,
        persistence: tasks,
        clock,
        idGenerator: ids,
        executors: [new ToolEffectExecutor({
          adapterDescriptorId: fixture.toolDescriptor.adapterDescriptorId,
          persistence: tasks,
          handles: toolHandles,
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
        scheduler: new FakeScheduler(),
      }),
    });
    const toolBridge = new ToolExecutionAgentBridge({
      service: toolService,
      persistence: tasks,
      buildExecution: async (call, signal) => {
        const step = await ensureHarnessToolStep(runtime, ids, call);
        return {
          taskId,
          runId: step.runId,
          stepId: step.stepId,
          registryRevision: fixture.registry.registryRevision,
          capabilityId: call.capabilityId,
          action: {
            actionId: call.actionId,
            kind: call.capabilityId,
            payload: call.arguments,
          },
          idempotencyKey: `arh23:${call.toolCallId}`,
          authorization: { context: harnessToolAuthorization() },
          signal,
        };
      },
    });
    const batches = new ToolCallBatchCoordinator({ conversation, tasks, tools: toolBridge, clock });
    const loop = new AgentLoopCoordinator({
      model,
      tools: toolBridge,
      conversation: new DurableAgentConversationWriter({
        persistence: conversation,
        clock,
        idGenerator: ids,
      }),
      batches,
      maxModelRounds: 51,
      maxToolCalls: 50,
    });
    const modelPurposes: string[] = [];
    const starter = new DurableAgentLoopStarter({
      clock,
      ids,
      conversation,
      tasks,
      agents: new InMemoryTrustedRuntimeCatalog()
        .registerAgent(fixture.agent)
        .registerModel(fixture.model),
      snapshots: new TurnSnapshotBuilder({
        conversationPersistence: conversation,
        taskPersistence: tasks,
      }),
      context: new ContextPipeline({
        budgetPolicy: new ContextBudgetPolicy({
          modelContextWindow: 16_384,
          reservedOutputTokens: 2_048,
          safetyMarginTokens: 1_024,
          compactionThresholdRatio: 0.8,
          maxPreviewBytes: 512,
        }),
        estimator: new ConservativeTokenEstimator(),
      }),
      loop,
      taskRuntime: runtime,
      modelProviderResolver: {
        async resolve(input) {
          modelPurposes.push(input.purpose);
          return {
            provider: model,
            authority: "central_enterprise",
            externalTarget: input.modelLock.adapterDescriptorSnapshot.implementationRef,
            exactLockDigest: sha256CanonicalJson(JsonValueSchema.parse(input.modelLock)),
          };
        },
      },
    });
    await starter.start({
      submitTurnCommandId: uuid(29_990),
      taskId,
      runtimeSelectionId: fixture.selection.runtimeSelectionId,
      sessionId,
      userMessageId: uuid(100),
    });
    const resolverCallCountBeforeReplay = modelPurposes.length;
    const replay = await starter.start({
      submitTurnCommandId: uuid(29_990),
      taskId,
      runtimeSelectionId: fixture.selection.runtimeSelectionId,
      sessionId,
      userMessageId: uuid(100),
    });
    const state = await runtime.snapshot(taskId);
    return {
      rounds: model.mainRounds,
      toolCallCount: toolBackend.calls.length,
      compactionCount: model.summaryCalls,
      taskStatus: state?.status,
      pendingCompactionCount: (await conversation.listPendingCompactionJobs()).length,
      recoverableEffectCount: (await tasks.listRecoverableEffectAttempts()).length,
      modelPurposes,
      requestSchemaVersions: model.requestSchemaVersions,
      reasoningModeLockIds: model.reasoningModeLockIds,
      requestInvocationDigestMismatchCount: model.requestInvocationDigestMismatchCount,
      replayedWithoutProviderResolution:
        replay.replayed && modelPurposes.length === resolverCallCountBeforeReplay,
    };
  } finally {
    await model.stop();
    await toolBackend.stop();
    await conversation.stop().catch(() => undefined);
    await tasks.stop().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
}

async function runSemanticSeed() {
  const directory = await mkdtemp(join(tmpdir(), "robothree-arh23-loop-"));
  const databasePath = join(directory, "robothree.sqlite");
  const clock = new FakeClock(at);
  const taskIds = new FakeIdGenerator(generatedIds(10_000, 2_000));
  const compactionIds = new FakeIdGenerator(generatedIds(20_000, 2_000));
  const tasks = new SqliteTaskPersistence({ databasePath, clock });
  const conversation = new SqliteConversationPersistence({ databasePath, clock });
  const tools = await HarnessToolExecutor.start();
  const model = await ProcessLoopModel.start();
  let report;
  try {
    await tasks.start();
    await conversation.start();
    const runtime = new DurableTaskRuntime({ persistence: tasks, idGenerator: taskIds });
    const created = await runtime.createTask({
      taskId,
      sessionId,
      agentDefinition: { agentDefinitionId: agentId, version: "1.0.0" },
      goal: "ARH-2.3 semantic 50-round durable loop",
      createdAt: at,
    });
    if (!created.ok) throw new Error(created.error.code);
    await requireAccepted(runtime.dispatch({
      commandId: uuid(10),
      taskId,
      type: "start_run",
      issuedAt: at,
      runId,
    }));
    await conversation.createSession({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      sessionId,
      messageSequence: 0,
      sessionEventSequence: 0,
      contextRevision: 0,
      createdAt: at,
      updatedAt: at,
    });
    await conversation.appendMessage({
      expectedMessageSequence: 0,
      message: userMessage(),
      updatedAt: at,
    });
    await conversation.appendMessage({
      expectedMessageSequence: 1,
      message: assistantSeedMessage(),
      updatedAt: at,
    });

    const batches = new ToolCallBatchCoordinator({ conversation, tasks, tools, clock });
    const pipeline = new ContextPipeline({
      budgetPolicy: new ContextBudgetPolicy({
        modelContextWindow: 16_384,
        reservedOutputTokens: 2_048,
        safetyMarginTokens: 1_024,
        compactionThresholdRatio: 0.8,
        maxPreviewBytes: 512,
      }),
      estimator: new ConservativeTokenEstimator(),
    });
    const preparation = new ContextPreparationCoordinator({
      conversation,
      snapshots: new TurnSnapshotBuilder({
        conversationPersistence: conversation,
        taskPersistence: tasks,
      }),
      context: pipeline,
    });
    const compactions = new CompactionCoordinator({
      persistence: conversation,
      summarizer: new FakeCompactionSummarizer({
        summary: "Prior durable Tool work completed in exact order.",
        summarySchemaVersion: "v1alpha1",
        summarizerModelRef: executionBinding.modelCapabilityId,
        summarizerPromptRevision: executionBinding.summarizerPromptRevision,
        estimatedTokensBefore: 3_000,
        estimatedTokensAfter: 64,
      }),
      clock,
      idGenerator: compactionIds,
    });
    const decisions: string[] = [];
    const loop = new AgentLoopCoordinator({
      model,
      tools,
      conversation: new DurableAgentConversationWriter({
        persistence: conversation,
        clock,
        idGenerator: taskIds,
      }),
      batches,
      maxModelRounds: 51,
      maxToolCalls: 50,
    });
    const result = await loop.run({
      sessionId,
      taskId,
      runId,
      createAssistantMessageId: (round) => uuid(1_000 + round),
      buildRequest: async (round): Promise<ModelRequest> => {
        const prepared = await preparation.prepare({
          sessionId,
          snapshotId: () => uuid(2_000 + round),
          requestId: () => uuid(3_000 + round),
          createdAt: () => at,
          pipelineInput: (facts) => ({
            phase: round === 1 ? "pre_call" : "mid_turn",
            requestId: facts.requestId,
            snapshot: facts.snapshot,
            conversationMessages: facts.messages,
            ...(facts.compactionSummary === undefined
              ? {}
              : { compactionSummary: facts.compactionSummary }),
            toolCallBatches: facts.toolCallBatches,
            model: {
              capabilityId: executionBinding.modelCapabilityId,
              capabilityRevision: digest("7"),
            },
          }),
          authorizeAndCompact: async (facts) => {
            const pending = (await conversation.listPendingCompactionJobs())
              .find((job) => job.sessionId === sessionId);
            if (pending !== undefined) {
              return (await compactions.recoverSessionPending(sessionId))!;
            }
            return compactions.compact({
              sessionId,
              sourceStartSequence: facts.sourceStartSequence,
              sourceEndSequence: facts.sourceEndSequence,
              executionBinding,
            });
          },
        });
        decisions.push(prepared.receipt.decision);
        return prepared.request;
      },
      onModelRoundCompleted: async ({ round, toolCalls }) => {
        const call = toolCalls[0];
        if (call === undefined) return;
        await requireAccepted(runtime.dispatch({
          commandId: uuid(6_000 + round),
          taskId,
          type: "start_step",
          issuedAt: at,
          runId,
          stepId: uuid(7_000 + round),
          planRevision: {
            executionPlanId: uuid(8_000),
            planRevisionId: uuid(8_001),
            revision: 1,
          },
          action: {
            actionId: call.actionId,
            kind: call.capabilityId,
            payload: call.arguments,
          },
        }));
        await requireAccepted(runtime.dispatch({
          commandId: uuid(9_000 + round),
          taskId,
          type: "record_observation",
          issuedAt: at,
          runId,
          stepId: uuid(7_000 + round),
          observation: {
            observationId: call.toolCallId,
            actionId: call.actionId,
            observedAt: at,
            outcome: "succeeded",
            output: call.arguments,
          },
        }));
      },
    });
    expect(result).toMatchObject({ status: "completed", rounds: 51, text: "bounded-complete" });
    const head = await conversation.loadSession(sessionId);
    const recoverableBatches = await conversation.listRecoverableToolCallBatches();
    const pending = await conversation.listPendingCompactionJobs();
    const messages = await conversation.loadMessageRange(sessionId, 1, Number.MAX_SAFE_INTEGER);
    const active = head?.activeCompactionId === undefined
      ? undefined
      : await conversation.loadCompactionRecord(head.activeCompactionId);
    const semanticTimelineDigest = sha256CanonicalJson(JsonValueSchema.parse(
      result.timeline.map((event) => ({
        type: event.type,
        sequence: event.sequence,
        ...("call" in event ? {
          capabilityId: event.call.capabilityId,
          toolCallId: event.call.toolCallId,
          actionId: event.call.actionId,
        } : {}),
        ...("result" in event ? {
          toolCallId: event.result.toolCallId,
          actionId: event.result.actionId,
        } : {}),
        ...("error" in event ? { errorCode: event.error.code } : {}),
      })),
    ));
    const semanticViewDigest = sha256CanonicalJson(JsonValueSchema.parse({
      activeSourceEnd: active?.sourceEndSequence ?? 0,
      summarySchemaVersion: active?.summary.summarySchemaVersion ?? null,
      summarizerModelRef: active?.summary.summarizerModelRef ?? null,
      summarizerPromptRevision: active?.summary.summarizerPromptRevision ?? null,
      rawTail: messages
        .filter((message) => message.envelope.sequence > (active?.sourceEndSequence ?? 0))
        .map((message) => ({
          sequence: message.envelope.sequence,
          role: message.message.role,
          contentTypes: message.message.content.map((block) => block.type),
          ...("toolCalls" in message.message
            ? { toolCallCount: message.message.toolCalls.length }
            : {}),
        })),
    }));
    report = {
      rounds: result.rounds,
      timelineDigest: semanticTimelineDigest,
      semanticViewDigest,
      toolCallCount: tools.calls.length,
      compactionCount: decisions.filter((decision) =>
        decision === "compacted" || decision === "pending_recovered").length,
      openDispositionCount: recoverableBatches.length,
      pendingCompactionCount: pending.length,
      modelProcessClosed: false,
      toolProcessClosed: false,
    };
  } finally {
    await model.stop();
    await tools.stop();
    await conversation.stop().catch(() => undefined);
    await tasks.stop().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
  return {
    ...report,
    modelProcessClosed: true,
    toolProcessClosed: true,
  };
}

class HarnessToolExecutor {
  readonly calls: AssistantToolCall[] = [];
  readonly #results = new Map<string, Extract<ProviderNeutralMessage, { role: "tool" }>>();
  readonly #child: ChildProcess;
  #requestId = 0;

  private constructor(child: ChildProcess) {
    this.#child = child;
  }

  static async start(): Promise<HarnessToolExecutor> {
    return new HarnessToolExecutor(await startChild(toolChildScript));
  }

  async execute(call: AssistantToolCall, signal: AbortSignal, hooks?: {
    onEffectPrepared(effectAttemptId: string): Promise<void>;
  }) {
    if (signal.aborted) throw new Error("cancelled");
    this.calls.push(structuredClone(call));
    await hooks?.onEffectPrepared(call.actionId);
    this.#requestId += 1;
    const requestId = String(this.#requestId);
    const output = await requestChild(this.#child, {
      type: "execute",
      requestId,
      actionId: call.actionId,
      toolCallId: call.toolCallId,
      arguments: call.arguments,
    }, "tool_result", requestId);
    const observation = {
      observationId: call.toolCallId,
      actionId: call.actionId,
      observedAt: at,
      outcome: "succeeded" as const,
      output,
    };
    const result: Extract<ProviderNeutralMessage, { role: "tool" }> = {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "tool",
      toolCallId: call.toolCallId,
      taskId: call.taskId,
      actionId: call.actionId,
      observationId: call.toolCallId,
      outcome: "succeeded",
      resultDigest: sha256CanonicalJson(JsonValueSchema.parse(observation)),
      content: [{ type: "text", text: JSON.stringify(output) }],
    };
    this.#results.set(call.actionId, result);
    return structuredClone(result);
  }

  async loadResult(call: AssistantToolCall, effectAttemptId: string) {
    const result = this.#results.get(effectAttemptId);
    return result?.toolCallId === call.toolCallId ? structuredClone(result) : undefined;
  }

  async stop(): Promise<void> {
    await stopChild(this.#child);
  }
}

class ProcessLoopModel implements ModelProvider {
  readonly adapterKind = "model_provider" as const;
  readonly adapterDescriptorId = "adapter.model.arh23-process";
  readonly adapterDescriptorRevision: string;
  readonly #child: ChildProcess;
  #round = 0;
  #summaryCalls = 0;
  readonly requestSchemaVersions: string[] = [];
  readonly reasoningModeLockIds: string[] = [];
  requestInvocationDigestMismatchCount = 0;

  private constructor(child: ChildProcess, adapterDescriptorRevision: string) {
    this.#child = child;
    this.adapterDescriptorRevision = adapterDescriptorRevision;
  }

  static async start(adapterDescriptorRevision = digest("8")): Promise<ProcessLoopModel> {
    return new ProcessLoopModel(await startChild(modelChildScript), adapterDescriptorRevision);
  }

  get mainRounds(): number {
    return this.#round;
  }

  get summaryCalls(): number {
    return this.#summaryCalls;
  }

  async *stream(
    request: ReadableModelRequest,
    signal: AbortSignal,
    invocation?: ModelProviderInvocation,
  ): AsyncIterable<ModelStreamEvent> {
    if (signal.aborted) return;
    this.requestSchemaVersions.push(request.schemaVersion);
    if (request.schemaVersion === "v1alpha2") {
      this.reasoningModeLockIds.push(request.reasoning.reasoningModeLockId);
    }
    if (invocation !== undefined && invocation.modelRequest.requestDigest !== request.requestDigest) {
      this.requestInvocationDigestMismatchCount += 1;
    }
    const compactionSummary = invocation?.purpose === "compaction_summary";
    if (compactionSummary) this.#summaryCalls += 1;
    else this.#round += 1;
    const requestId = compactionSummary
      ? `summary-${this.#summaryCalls}`
      : String(this.#round);
    const events = await requestChild(this.#child, {
      type: "stream",
      requestId,
      round: this.#round,
      purpose: invocation?.purpose,
    }, "stream_result", requestId);
    if (!Array.isArray(events)) throw new Error("Controlled Model returned invalid events");
    for (const event of events) yield event as ModelStreamEvent;
  }

  async stop(): Promise<void> {
    await stopChild(this.#child);
  }
}

class ProcessLoopToolBackend implements ToolExecutionBackend {
  readonly adapterKind = "tool_execution_backend" as const;
  readonly adapterDescriptorId = "adapter.tool.arh23-process";
  readonly adapterDescriptorRevision: string;
  readonly calls: ToolExecutionRequest[] = [];
  readonly #child: ChildProcess;
  #requestId = 0;

  private constructor(child: ChildProcess, adapterDescriptorRevision: string) {
    this.#child = child;
    this.adapterDescriptorRevision = adapterDescriptorRevision;
  }

  static async start(adapterDescriptorRevision: string): Promise<ProcessLoopToolBackend> {
    return new ProcessLoopToolBackend(await startChild(toolChildScript), adapterDescriptorRevision);
  }

  async execute(request: ToolExecutionRequest, signal: AbortSignal) {
    if (signal.aborted) throw new Error("cancelled");
    this.calls.push(structuredClone(request));
    this.#requestId += 1;
    const requestId = String(this.#requestId);
    const output = await requestChild(this.#child, {
      type: "execute",
      requestId,
      actionId: request.action.actionId,
      toolCallId: request.action.actionId,
      arguments: request.action.payload,
    }, "tool_result", requestId);
    return {
      observationId: request.effectAttemptId,
      actionId: request.action.actionId,
      observedAt: request.requestedAt,
      outcome: "succeeded" as const,
      output: JsonValueSchema.parse(output),
    };
  }

  async stop(): Promise<void> {
    await stopChild(this.#child);
  }
}

async function ensureHarnessToolStep(
  runtime: DurableTaskRuntime,
  ids: FakeIdGenerator,
  call: AssistantToolCall,
): Promise<{ runId: string; stepId: string }> {
  const state = await runtime.snapshot(call.taskId);
  if (state?.status !== "running" || state.activeRunId === undefined) {
    throw new Error("ARH-2.3 Tool requires one running Task");
  }
  const run = state.runs.find((candidate) => candidate.runId === state.activeRunId);
  if (run === undefined || run.status !== "running" || run.activeStepId !== undefined) {
    throw new Error("ARH-2.3 Tool requires a free active Run");
  }
  const stepId = ids.next();
  const started = await runtime.dispatch({
    commandId: ids.next(),
    taskId: call.taskId,
    type: "start_step",
    issuedAt: at,
    runId: run.runId,
    stepId,
    planRevision: {
      executionPlanId: ids.next(),
      planRevisionId: ids.next(),
      revision: 1,
    },
    action: {
      actionId: call.actionId,
      kind: call.capabilityId,
      payload: call.arguments,
    },
  });
  if (!started.accepted) throw new Error(started.error.code);
  return { runId: run.runId, stepId };
}

function harnessToolAuthorization(): ToolAuthorizationContext {
  return {
    schemaVersion: CONTRACT_VERSION,
    subject: {
      schemaVersion: CONTRACT_VERSION,
      userId: uuid(29_980),
      activeConfigRevision: "arh23",
      canUseTools: true,
      assignedToolCapabilityIds: ["tool.echo"],
      grants: [],
    },
    resourceAccesses: [],
    availability: {
      enabled: true,
      healthy: true,
      credentialAvailable: true,
      revision: "arh23",
    },
  };
}

function starterRuntimeFixture(reasoning = false) {
  const source = {
    trust: "official" as const,
    packageId: "robothree.official.arh23",
    packageRevision: digest("a"),
  };
  const modelDefinition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.arh23-loop",
    kind: "model",
    name: "ARH-2.3 Process Model",
    description: "Controlled process Model for the recovery Harness",
    source,
    model: {
      family: "controlled",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 16_384,
      supportsStreaming: true,
    },
  });
  const toolDefinition = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "tool.echo",
    kind: "tool",
    name: "ARH-2.3 Process Echo",
    description: "Controlled process Tool for the recovery Harness",
    source,
    tool: {
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      readOnlyHint: true,
      risk: {
        schemaVersion: CONTRACT_VERSION,
        sourceRevision: "arh23.echo.v1",
        staticFacts: [],
      },
    },
  });
  const modelDescriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.arh23-process",
    adapterKind: "model_provider",
    source,
    implementationRef: "process:arh23-model",
    runtimeBoundary: "child_process",
    protocol: { name: "arh23-model", version: "v1alpha1" },
  });
  const toolDescriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.tool.arh23-process",
    adapterKind: "tool_execution_backend",
    source,
    implementationRef: "process:arh23-tool",
    runtimeBoundary: "child_process",
    protocol: { name: "arh23-tool", version: "v1alpha1" },
    effectRecoveryMode: "idempotent_retry",
  });
  const modelBinding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.arh23-process",
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
  const toolBinding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.tool.arh23-process",
    capability: {
      capabilityId: toolDefinition.capabilityId,
      capabilityRevision: toolDefinition.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: toolDescriptor.adapterDescriptorId,
      adapterDescriptorRevision: toolDescriptor.revision,
    },
    port: "tool_execution_backend",
    source,
  });
  const registry = new RegistryBuilder({ trustedSources: [source] })
    .registerCapability(modelDefinition)
    .registerCapability(toolDefinition)
    .registerAdapterDescriptor(modelDescriptor)
    .registerAdapterDescriptor(toolDescriptor)
    .registerBinding(modelBinding)
    .registerBinding(toolBinding)
    .finalize();
  const modelLock: TaskCapabilityLock = {
    schemaVersion: CONTRACT_VERSION,
    lockId: uuid(29_970),
    taskId,
    registryRevision: registry.registryRevision,
    definitionSnapshot: modelDefinition,
    bindingSnapshot: modelBinding,
    adapterDescriptorSnapshot: modelDescriptor,
    lockedAt: at,
  };
  const toolLock: TaskCapabilityLock = {
    schemaVersion: CONTRACT_VERSION,
    lockId: uuid(29_971),
    taskId,
    registryRevision: registry.registryRevision,
    definitionSnapshot: toolDefinition,
    bindingSnapshot: toolBinding,
    adapterDescriptorSnapshot: toolDescriptor,
    lockedAt: at,
  };
  const model = createModelDefinition({
    schemaVersion: "v1alpha1",
    modelId: modelDefinition.capabilityId,
    name: "ARH-2.3 Process Model",
    source: "official",
    capability: {
      capabilityId: modelDefinition.capabilityId,
      capabilityRevision: modelDefinition.revision,
    },
    capabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: true,
      supportsStreaming: true,
      contextWindow: 16_384,
    },
    createdAt: at,
  });
  const agent = createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: agentId,
    name: "ARH-2.3 Harness Agent",
    identity: "RoboThree recovery Harness Agent",
    goal: "Complete exactly fifty controlled Tool rounds",
    instructions: "Use only the exact locked Tool.",
    defaultModelId: model.modelId,
    allowModelOverride: false,
    skillReferences: [],
    toolReferences: [{
      capabilityId: toolDefinition.capabilityId,
      capabilityRevision: toolDefinition.revision,
    }],
    knowledgeReferences: [],
    requiredModelCapabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: true,
      supportsStreaming: true,
      minimumContextWindow: 8_192,
    },
    createdAt: at,
  });
  const selectionMaterial = {
    schemaVersion: "v1alpha1",
    runtimeSelectionId: uuid(29_972),
    taskId,
    agent: {
      agentDefinitionId: agent.agentDefinitionId,
      revision: agent.revision,
      digest: agent.digest,
    },
    agentDefaultModelId: model.modelId,
    resolvedModelLock: {
      lockId: modelLock.lockId,
      capabilityId: modelDefinition.capabilityId,
      lockDigest: sha256CanonicalJson(JsonValueSchema.parse(modelLock)),
    },
    activeSkillRevisions: [],
    toolLocks: [{
      lockId: toolLock.lockId,
      capabilityId: toolDefinition.capabilityId,
      lockDigest: sha256CanonicalJson(JsonValueSchema.parse(toolLock)),
    }],
    knowledgeRevisions: [],
    platformPromptRevision: digest("b"),
    registryRevision: registry.registryRevision,
    createdAt: at,
  } as const;
  const selection = reasoning
    ? createTaskRuntimeSelectionV1Alpha2({
      ...selectionMaterial,
      schemaVersion: "v1alpha2",
      reasoningModeLock: createReasoningModeLock({
        schemaVersion: "v1alpha1",
        reasoningModeLockId: uuid(29_973),
        taskId,
        modelLockRef: {
          lockId: selectionMaterial.resolvedModelLock.lockId,
          lockDigest: selectionMaterial.resolvedModelLock.lockDigest,
        },
        lockedAt: at,
        requestedMode: "max",
        observedMaxSupport: "supported",
        observedMaxSupportRevision: digest("c"),
        resolution: "max_applied",
        profileRef: {
          profileId: "reasoning.profile.arh23",
          profileRevision: digest("d"),
          profileDigest: digest("d"),
        },
        strategyRef: {
          strategyId: "reasoning.strategy.arh23-max",
          strategyRevision: digest("e"),
          strategyDigest: digest("f"),
          timeoutPolicyRef: "timeout.policy.arh23-max",
        },
      }),
    })
    : createTaskRuntimeSelection(selectionMaterial);
  return {
    registry,
    agent,
    model,
    selection,
    locks: [modelLock, toolLock],
    modelDescriptor,
    toolDescriptor,
  };
}

function authorizationFacts(
  selection: Extract<ReturnType<typeof starterRuntimeFixture>["selection"], {
    schemaVersion: "v1alpha2";
  }>,
) {
  const resolved = new TaskAuthorizationSelectionService().resolve({
    taskId,
    runtimeSelection: selection,
    authorization: { kind: "legacy" },
    policySnapshot: createTaskAuthorizationModePolicySnapshot({
      policyId: "policy.arh23.task-scoped",
      supportedModes: ["task_scoped"],
      legacyDefaultMode: "task_scoped",
      createdAt: at,
    }),
    createdAt: at,
  });
  if (!resolved.ok) throw new Error(resolved.error.code);
  return {
    selection: resolved.selection,
    executionIdentity: resolved.executionIdentity,
  };
}

async function startChild(script: string): Promise<ChildProcess> {
  const child = fork(script, [], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { PATH: process.env.PATH },
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Controlled process did not become ready")), 5_000);
    child.once("error", reject);
    child.on("message", (message: unknown) => {
      if (!isRecord(message) || message.type !== "ready") return;
      clearTimeout(timeout);
      resolve();
    });
  });
  return child;
}

async function requestChild(
  child: ChildProcess,
  request: Record<string, unknown>,
  responseType: string,
  requestId: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Controlled process request timed out")), 5_000);
    const listener = (message: unknown) => {
      if (!isRecord(message) || message.type !== responseType || message.requestId !== requestId) return;
      clearTimeout(timeout);
      child.off("message", listener);
      resolve(responseType === "stream_result" ? message.events : message.output);
    };
    child.on("message", listener);
    child.send(request);
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.send({ type: "shutdown" });
  await Promise.race([
    exited,
    new Promise<void>((resolve) => setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 2_000)),
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function userMessage(): ConversationMessage {
  const syntheticCanary = process.env.ROBOTHREE_ARH23_CANARY ?? "semantic-user-canary";
  const message = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "user" as const,
    content: [{
      type: "text" as const,
      text: `Execute the bounded 50-round Tool loop. Synthetic marker: ${syntheticCanary}`,
    }],
  };
  return {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: uuid(100),
      sessionId,
      sequence: 1,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      taskId,
      createdAt: at,
    },
    message,
  };
}

function assistantSeedMessage(): ConversationMessage {
  const message = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "assistant" as const,
    content: [{ type: "text" as const, text: "The bounded loop is ready." }],
    toolCalls: [],
  };
  return {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: uuid(101),
      sessionId,
      sequence: 2,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      createdAt: at,
    },
    message,
  };
}

async function requireAccepted(operation: ReturnType<DurableTaskRuntime["dispatch"]>) {
  const result = await operation;
  if (!result.accepted) throw new Error(result.error.code);
}

function generatedIds(start: number, count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => uuid(start + index));
}

function uuid(value: number): string {
  return `019f8d20-0000-7000-8000-${String(value).padStart(12, "0")}`;
}

function digest(marker: string): `sha256:${string}` {
  return `sha256:${marker.repeat(64)}`;
}
