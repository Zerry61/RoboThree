import {
  CONTRACT_VERSION,
  CONVERSATION_SCHEMA_VERSION,
  JsonObjectSchema,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  PersistenceSchemaVersion,
  type AssistantToolCall,
  type EffectAttempt,
  type ModelRequest,
  type PersistedUserConfirmation,
  type ProviderNeutralMessage,
  type UserConfirmationRequest,
} from "@robothree/contracts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AgentLoopCoordinator,
  AgentToolRecoveryCoordinator,
  DurableAgentConversationWriter,
  DurableTaskRuntime,
  FakeClock,
  InMemoryConversationPersistence,
  InMemoryTaskPersistence,
  ScriptedModelProvider,
  SqliteConversationPersistence,
  SystemIdGenerator,
  ToolCallBatchCoordinator,
  sha256CanonicalJson,
  type AgentToolCallExecutionHooks,
  type AgentToolCallExecutionResult,
  type AgentToolCallExecutor,
} from "../src/index.js";

const id = (value: number) => `019fa000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const at = "2026-08-02T14:00:00.000Z";
const ids = {
  session: id(1),
  task: id(2),
  agent: id(3),
  run: id(4),
  retryRun: id(5),
  startRun: id(6),
  cancel: id(7),
  retry: id(8),
  assistant: id(9),
  finalAssistant: id(10),
  confirmation: id(11),
  user: id(12),
  step: id(13),
};

type ToolMessage = Extract<ProviderNeutralMessage, { role: "tool" }>;

describe("ADR17-I2 ToolCallBatchCoordinator", () => {
  it("dispatches one ordered batch serially and admits the next Model turn only after one-to-one Results", async () => {
    const harness = await createHarness();
    try {
      const calls = toolCalls(3);
      const commit = await harness.batches.appendAssistantBatch({
        messageId: ids.assistant,
        sessionId: ids.session,
        taskId: ids.task,
        runId: ids.run,
        text: "Use three tools in order.",
        toolCalls: calls,
      });
      const result = await harness.batches.dispatchBatch(commit.batch.batchId);
      expect(result).toMatchObject({ status: "completed" });
      expect(harness.tools.calls.map((call) => call.actionId))
        .toEqual(calls.map((call) => call.actionId));
      expect(harness.tools.maxActive).toBe(1);
      expect(await harness.conversation.listToolCallDispositions(commit.batch.batchId))
        .toEqual(expect.arrayContaining(calls.map((call, ordinal) => expect.objectContaining({
          toolCallId: call.toolCallId,
          ordinal,
          disposition: "result_committed",
          effectAttemptId: call.actionId,
        }))));
      expect((await harness.conversation.loadSession(ids.session))?.messageSequence).toBe(4);
    } finally {
      await harness.cleanup();
    }
  });

  it("persists the exact confirmation point, blocks later calls, and resumes in original order after allow", async () => {
    const calls = toolCalls(3);
    const tools = new ScriptedBatchExecutor({ waitingActionId: calls[1]!.actionId });
    const harness = await createHarness(tools);
    try {
      const commit = await harness.batches.appendAssistantBatch({
        messageId: ids.assistant,
        sessionId: ids.session,
        taskId: ids.task,
        runId: ids.run,
        text: "The middle call requires confirmation.",
        toolCalls: calls,
      });
      const waiting = await harness.batches.dispatchBatch(commit.batch.batchId);
      expect(waiting).toMatchObject({
        status: "waiting_user_confirmation",
        call: { actionId: calls[1]!.actionId },
        confirmationId: ids.confirmation,
      });
      expect(tools.calls.map((call) => call.actionId)).toEqual([
        calls[0]!.actionId,
        calls[1]!.actionId,
      ]);
      expect((await harness.conversation.listToolCallDispositions(commit.batch.batchId))
        .map((record) => record.disposition)).toEqual([
        "result_committed",
        "waiting_user_confirmation",
        "blocked_by_prior_confirmation",
      ]);

      installConfirmation(harness.tasks, calls[1]!, "confirmed");
      tools.resolveWaiting();
      const resumed = await harness.batches.dispatchBatch(commit.batch.batchId);
      expect(resumed).toMatchObject({ status: "completed" });
      expect(tools.calls.map((call) => call.actionId)).toEqual([
        calls[0]!.actionId,
        calls[1]!.actionId,
        calls[1]!.actionId,
        calls[2]!.actionId,
      ]);
      expect((await harness.conversation.listToolCallDispositions(commit.batch.batchId))
        .every((record) => record.disposition === "result_committed")).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  it("converges a rejected confirmation and all later unlinked calls without Backend execution", async () => {
    const calls = toolCalls(2);
    const tools = new ScriptedBatchExecutor({ waitingActionId: calls[0]!.actionId });
    const harness = await createHarness(tools);
    try {
      const commit = await harness.batches.appendAssistantBatch({
        messageId: ids.assistant,
        sessionId: ids.session,
        taskId: ids.task,
        runId: ids.run,
        text: "Confirm before dispatch.",
        toolCalls: calls,
      });
      expect(await harness.batches.dispatchBatch(commit.batch.batchId))
        .toMatchObject({ status: "waiting_user_confirmation" });
      installConfirmation(harness.tasks, calls[0]!, "rejected");
      const rejected = await harness.batches.dispatchBatch(commit.batch.batchId);
      expect(rejected).toMatchObject({
        status: "denied",
        error: { code: "authorization.user_rejected" },
      });
      expect(tools.calls).toHaveLength(1);
      expect((await harness.conversation.listToolCallDispositions(commit.batch.batchId))
        .map((record) => record.disposition)).toEqual([
        "denied_before_dispatch",
        "denied_before_dispatch",
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("turns cancellation before dispatch into explicit dispositions and creates no Effect hook", async () => {
    const harness = await createHarness();
    try {
      const calls = toolCalls(3);
      const commit = await harness.batches.appendAssistantBatch({
        messageId: ids.assistant,
        sessionId: ids.session,
        taskId: ids.task,
        runId: ids.run,
        text: "Cancel safely.",
        toolCalls: calls,
      });
      const abort = new AbortController();
      abort.abort();
      expect(await harness.batches.dispatchBatch(commit.batch.batchId, abort.signal))
        .toMatchObject({ status: "cancelled" });
      expect(harness.tools.calls).toEqual([]);
      expect(harness.tools.effectHooks).toEqual([]);
      expect((await harness.conversation.listToolCallDispositions(commit.batch.batchId))
        .every((record) => record.disposition === "cancelled_before_dispatch")).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  it("keeps the in-flight Effect linked when cancellation arrives and never dispatches later calls", async () => {
    const calls = toolCalls(3);
    const abort = new AbortController();
    const tools = new ScriptedBatchExecutor({
      afterEffectLink(call) {
        if (call.actionId === calls[0]!.actionId) abort.abort();
      },
    });
    const harness = await createHarness(tools);
    try {
      const commit = await harness.batches.appendAssistantBatch({
        messageId: ids.assistant,
        sessionId: ids.session,
        taskId: ids.task,
        runId: ids.run,
        text: "Cancel while the first Tool Effect is in flight.",
        toolCalls: calls,
      });
      expect(await harness.batches.dispatchBatch(commit.batch.batchId, abort.signal))
        .toMatchObject({ status: "cancelled" });
      expect(tools.calls.map((call) => call.actionId)).toEqual([calls[0]!.actionId]);
      expect(await harness.conversation.listToolCallDispositions(commit.batch.batchId))
        .toEqual([
          expect.objectContaining({
            actionId: calls[0]!.actionId,
            disposition: "effect_linked",
            effectAttemptId: calls[0]!.actionId,
          }),
          expect.objectContaining({
            actionId: calls[1]!.actionId,
            disposition: "cancelled_before_dispatch",
          }),
          expect.objectContaining({
            actionId: calls[2]!.actionId,
            disposition: "cancelled_before_dispatch",
          }),
        ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("keeps an Effect-linked call recoverable after a crash and never changes its Effect identity", async () => {
    const calls = toolCalls(1);
    const tools = new ScriptedBatchExecutor({ crashAfterLinkActionId: calls[0]!.actionId });
    const harness = await createHarness(tools);
    try {
      const commit = await harness.batches.appendAssistantBatch({
        messageId: ids.assistant,
        sessionId: ids.session,
        taskId: ids.task,
        runId: ids.run,
        text: "Recover the same effect.",
        toolCalls: calls,
      });
      expect(await harness.batches.dispatchBatch(commit.batch.batchId)).toMatchObject({
        status: "failed",
        error: { message: "simulated crash after Effect link" },
      });
      expect(await harness.conversation.loadToolCallDisposition(
        commit.batch.batchId,
        calls[0]!.toolCallId,
      )).toMatchObject({
        disposition: "effect_linked",
        effectAttemptId: calls[0]!.actionId,
      });
      tools.clearCrash();
      expect(await harness.batches.dispatchBatch(commit.batch.batchId))
        .toMatchObject({ status: "completed" });
      expect(new Set(tools.effectHooks)).toEqual(new Set([calls[0]!.actionId]));
    } finally {
      await harness.cleanup();
    }
  });

  it("reconciles an Effect committed before disposition linkage without creating a second execution", async () => {
    const calls = toolCalls(1);
    const tools = new ScriptedBatchExecutor();
    const harness = await createHarness(tools);
    try {
      const effect = effectAttempt(calls[0]!);
      const originalList = harness.tasks.listEffectAttemptsByTask.bind(harness.tasks);
      harness.tasks.listEffectAttemptsByTask = async (taskId) => taskId === ids.task
        ? [effect]
        : originalList(taskId);
      tools.seedResult(calls[0]!, effect.effectAttemptId);
      const commit = await harness.batches.appendAssistantBatch({
        messageId: ids.assistant,
        sessionId: ids.session,
        taskId: ids.task,
        runId: ids.run,
        text: "Reconcile Transaction B.",
        toolCalls: calls,
      });
      expect(await harness.batches.dispatchBatch(commit.batch.batchId))
        .toMatchObject({ status: "completed" });
      expect(tools.calls).toEqual([]);
      expect(await harness.conversation.loadToolCallDisposition(
        commit.batch.batchId,
        calls[0]!.toolCallId,
      )).toMatchObject({
        disposition: "result_committed",
        effectAttemptId: effect.effectAttemptId,
      });
    } finally {
      await harness.cleanup();
    }
  });

  it("recovers a committed Assistant batch that crashed before its first Tool dispatch", async () => {
    const harness = await createHarness();
    try {
      const calls = toolCalls(2);
      const commit = await harness.batches.appendAssistantBatch({
        messageId: ids.assistant,
        sessionId: ids.session,
        taskId: ids.task,
        runId: ids.run,
        text: "Recover Transaction A before Transaction B begins.",
        toolCalls: calls,
      });
      expect(harness.tools.calls).toEqual([]);
      const recovery = new AgentToolRecoveryCoordinator({ batches: harness.batches });
      expect(await recovery.recover({ taskId: ids.task, runId: ids.run }))
        .toEqual([expect.objectContaining({ status: "completed" })]);
      expect(harness.tools.calls.map((call) => call.actionId))
        .toEqual(calls.map((call) => call.actionId));
      expect((await harness.conversation.listToolCallDispositions(commit.batch.batchId))
        .every((record) => record.disposition === "result_committed")).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  it("does not dispatch an old Run batch after Retry creates a new active Run", async () => {
    const harness = await createHarness();
    try {
      const calls = toolCalls(2);
      const commit = await harness.batches.appendAssistantBatch({
        messageId: ids.assistant,
        sessionId: ids.session,
        taskId: ids.task,
        runId: ids.run,
        text: "This belongs only to the first Run.",
        toolCalls: calls,
      });
      await accepted(harness.runtime.dispatch({
        commandId: ids.cancel,
        taskId: ids.task,
        type: "cancel_task",
        issuedAt: at,
        reason: "retry isolation",
      }));
      await accepted(harness.runtime.dispatch({
        commandId: ids.retry,
        taskId: ids.task,
        type: "retry_run",
        issuedAt: at,
        failedRunId: ids.run,
        newRunId: ids.retryRun,
      }));
      expect(await harness.batches.dispatchBatch(commit.batch.batchId))
        .toMatchObject({ status: "cancelled" });
      expect(harness.tools.calls).toEqual([]);
      expect((await harness.conversation.listToolCallDispositions(commit.batch.batchId))
        .every((record) => record.disposition === "cancelled_before_dispatch")).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  it("integrates the durable batch with AgentLoopCoordinator and sends only complete Tool history forward", async () => {
    const harness = await createHarness();
    try {
      const calls = toolCalls(2);
      const model = new ScriptedModelProvider([
        [
          { type: "started" },
          ...calls.map((call) => ({ type: "tool_call" as const, call })),
          { type: "completed", finishReason: "tool_calls" },
        ],
        [
          { type: "started" },
          { type: "text_delta", delta: "complete" },
          { type: "completed", finishReason: "stop" },
        ],
      ]);
      const loop = new AgentLoopCoordinator({
        model,
        tools: harness.tools,
        conversation: new DurableAgentConversationWriter({
          persistence: harness.conversation,
          clock: harness.clock,
          idGenerator: new SystemIdGenerator(),
        }),
        batches: harness.batches,
      });
      const result = await loop.run({
        sessionId: ids.session,
        taskId: ids.task,
        runId: ids.run,
        createAssistantMessageId: (round) => round === 1
          ? ids.assistant
          : ids.finalAssistant,
        buildRequest: (round, prior) => modelRequest(round, prior),
      });
      expect(result).toMatchObject({ status: "completed", text: "complete", rounds: 2 });
      expect(model.requests).toHaveLength(2);
      expect((model.requests[1]?.messages ?? []).filter((message) => message.role === "tool"))
        .toHaveLength(2);
      const messages = await harness.conversation.loadMessageRange(ids.session, 1, 4);
      const assistantCalls = messages.flatMap((message) => message.message.role === "assistant"
        ? message.message.toolCalls
        : []);
      const results = messages.flatMap((message) => message.message.role === "tool"
        ? [message.message]
        : []);
      expect(assistantCalls.map((call) => call.toolCallId).sort())
        .toEqual(results.map((tool) => tool.toolCallId).sort());
    } finally {
      await harness.cleanup();
    }
  });

  it("recovers only the exact Task/Run batch after SQLite close/reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-adr17-i2-"));
    const databasePath = join(directory, "robothree.sqlite");
    const clock = new FakeClock(at);
    const tasks = new InMemoryTaskPersistence(clock);
    await tasks.start();
    const runtime = new DurableTaskRuntime({
      persistence: tasks,
      idGenerator: new SystemIdGenerator(),
    });
    const created = await runtime.createTask({
      taskId: ids.task,
      sessionId: ids.session,
      agentDefinition: { agentDefinitionId: ids.agent, version: "1.0.0" },
      goal: "recover exact ADR17-I2 SQLite batch",
      createdAt: at,
    });
    if (!created.ok) throw new Error(created.error.code);
    await accepted(runtime.dispatch({
      commandId: ids.startRun,
      taskId: ids.task,
      type: "start_run",
      issuedAt: at,
      runId: ids.run,
    }));
    const calls = toolCalls(1);
    const tools = new ScriptedBatchExecutor({ crashAfterLinkActionId: calls[0]!.actionId });
    let batchId: string;
    try {
      const first = new SqliteConversationPersistence({ databasePath, clock });
      await first.start();
      await first.createSession({
        schemaVersion: CONVERSATION_SCHEMA_VERSION,
        sessionId: ids.session,
        messageSequence: 0,
        sessionEventSequence: 0,
        contextRevision: 0,
        createdAt: at,
        updatedAt: at,
      });
      const firstBatches = new ToolCallBatchCoordinator({
        conversation: first,
        tasks,
        tools,
        clock,
      });
      const commit = await firstBatches.appendAssistantBatch({
        messageId: ids.assistant,
        sessionId: ids.session,
        taskId: ids.task,
        runId: ids.run,
        text: "Recover after reopen.",
        toolCalls: calls,
      });
      batchId = commit.batch.batchId;
      expect(await firstBatches.dispatchBatch(batchId)).toMatchObject({ status: "failed" });
      await first.stop();

      tools.clearCrash();
      const reopened = new SqliteConversationPersistence({ databasePath, clock });
      await reopened.start();
      const batches = new ToolCallBatchCoordinator({
        conversation: reopened,
        tasks,
        tools,
        clock,
      });
      const recovery = new AgentToolRecoveryCoordinator({
        batches,
      });
      const callsBeforeConcurrentRecovery = tools.calls.length;
      const [firstRecovery, secondRecovery] = await Promise.all([
        recovery.recover({ taskId: ids.task, runId: ids.run }),
        recovery.recover({ taskId: ids.task, runId: ids.run }),
      ]);
      expect(firstRecovery).toEqual([expect.objectContaining({ status: "completed" })]);
      expect(secondRecovery).toEqual([expect.objectContaining({ status: "completed" })]);
      expect(tools.calls).toHaveLength(callsBeforeConcurrentRecovery + 1);
      expect(await reopened.loadToolCallDisposition(batchId, calls[0]!.toolCallId))
        .toMatchObject({ disposition: "result_committed" });
      await reopened.stop();
    } finally {
      await tasks.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

class ScriptedBatchExecutor implements AgentToolCallExecutor {
  readonly calls: AssistantToolCall[] = [];
  readonly effectHooks: string[] = [];
  maxActive = 0;
  #active = 0;
  #waitingActionId: string | undefined;
  #waitingResolved = false;
  #crashAfterLinkActionId: string | undefined;
  readonly #afterEffectLink: ((call: AssistantToolCall) => void) | undefined;
  readonly #results = new Map<string, ToolMessage>();

  constructor(input: {
    waitingActionId?: string;
    crashAfterLinkActionId?: string;
    afterEffectLink?: (call: AssistantToolCall) => void;
  } = {}) {
    this.#waitingActionId = input.waitingActionId;
    this.#crashAfterLinkActionId = input.crashAfterLinkActionId;
    this.#afterEffectLink = input.afterEffectLink;
  }

  resolveWaiting(): void {
    this.#waitingResolved = true;
  }

  clearCrash(): void {
    this.#crashAfterLinkActionId = undefined;
  }

  seedResult(call: AssistantToolCall, effectAttemptId: string): void {
    this.#results.set(effectAttemptId, toolResult(call));
  }

  async execute(
    call: AssistantToolCall,
    signal: AbortSignal,
    hooks?: AgentToolCallExecutionHooks,
  ): Promise<AgentToolCallExecutionResult> {
    if (signal.aborted) throw signal.reason ?? new Error("cancelled");
    this.calls.push(structuredClone(call));
    if (call.actionId === this.#waitingActionId && !this.#waitingResolved) {
      return { status: "waiting_user_confirmation", request: confirmationRequest(call) };
    }
    this.#active += 1;
    this.maxActive = Math.max(this.maxActive, this.#active);
    try {
      await Promise.resolve();
      await hooks?.onEffectPrepared(call.actionId);
      this.effectHooks.push(call.actionId);
      this.#afterEffectLink?.(call);
      if (signal.aborted) throw signal.reason ?? new Error("cancelled");
      if (call.actionId === this.#crashAfterLinkActionId) {
        throw new Error("simulated crash after Effect link");
      }
      const result = toolResult(call);
      this.#results.set(call.actionId, result);
      return result;
    } finally {
      this.#active -= 1;
    }
  }

  async loadResult(
    call: AssistantToolCall,
    effectAttemptId: string,
  ): Promise<ToolMessage | undefined> {
    const result = this.#results.get(effectAttemptId);
    return result?.toolCallId === call.toolCallId ? structuredClone(result) : undefined;
  }
}

async function createHarness(tools = new ScriptedBatchExecutor()) {
  const clock = new FakeClock(at);
  const tasks = new InMemoryTaskPersistence(clock);
  const conversation = new InMemoryConversationPersistence({ clock });
  await tasks.start();
  await conversation.start();
  const runtime = new DurableTaskRuntime({
    persistence: tasks,
    idGenerator: new SystemIdGenerator(),
  });
  const created = await runtime.createTask({
    taskId: ids.task,
    sessionId: ids.session,
    agentDefinition: { agentDefinitionId: ids.agent, version: "1.0.0" },
    goal: "verify ADR17-I2 batch coordination",
    createdAt: at,
  });
  if (!created.ok) throw new Error(created.error.code);
  await accepted(runtime.dispatch({
    commandId: ids.startRun,
    taskId: ids.task,
    type: "start_run",
    issuedAt: at,
    runId: ids.run,
  }));
  await conversation.createSession({
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    sessionId: ids.session,
    messageSequence: 0,
    sessionEventSequence: 0,
    contextRevision: 0,
    createdAt: at,
    updatedAt: at,
  });
  return {
    clock,
    tasks,
    conversation,
    runtime,
    tools,
    batches: new ToolCallBatchCoordinator({ conversation, tasks, tools, clock }),
    async cleanup() {
      await conversation.stop();
      await tasks.stop();
    },
  };
}

function toolCalls(count: number): readonly AssistantToolCall[] {
  return Array.from({ length: count }, (_, index) => ({
    toolCallId: id(100 + index * 2),
    taskId: ids.task,
    actionId: id(101 + index * 2),
    capabilityId: "tool.echo",
    arguments: { ordinal: index },
  }));
}

function toolResult(call: AssistantToolCall): ToolMessage {
  return {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "tool",
    toolCallId: call.toolCallId,
    taskId: call.taskId,
    actionId: call.actionId,
    observationId: call.toolCallId,
    outcome: "succeeded",
    resultDigest: sha256CanonicalJson(JsonValueSchema.parse({
      actionId: call.actionId,
      output: call.arguments,
    })),
    content: [{ type: "text", text: JSON.stringify(call.arguments) }],
  };
}

function confirmationRequest(call: AssistantToolCall): UserConfirmationRequest {
  return {
    schemaVersion: CONTRACT_VERSION,
    confirmationId: ids.confirmation,
    runId: ids.run,
    stepId: ids.step,
    actionId: call.actionId,
    scope: {
      schemaVersion: CONTRACT_VERSION,
      type: "single_action",
      taskId: call.taskId,
      runId: ids.run,
      stepId: ids.step,
      actionId: call.actionId,
      actionDigest: digest("a"),
      toolCapabilityRevision: digest("b"),
      bindingRevision: digest("c"),
      adapterDescriptorRevision: digest("d"),
    },
    scopeDigest: digest("e"),
    displaySummary: "Confirm this exact Tool Action",
    requestedAt: at,
  };
}

function installConfirmation(
  tasks: InMemoryTaskPersistence,
  call: AssistantToolCall,
  decision: "confirmed" | "rejected",
): void {
  const original = tasks.loadUserConfirmation.bind(tasks);
  const request = confirmationRequest(call);
  const record: PersistedUserConfirmation = {
    request,
    decision: {
      schemaVersion: CONTRACT_VERSION,
      decisionId: id(decision === "confirmed" ? 300 : 301),
      confirmationId: request.confirmationId,
      scopeDigest: request.scopeDigest,
      decision,
      decidedByUserId: ids.user,
      decidedAt: at,
    },
  };
  tasks.loadUserConfirmation = async (confirmationId) => confirmationId === ids.confirmation
    ? structuredClone(record)
    : original(confirmationId);
}

function effectAttempt(call: AssistantToolCall): EffectAttempt {
  return {
    schemaVersion: PersistenceSchemaVersion,
    effectAttemptId: id(400),
    taskId: ids.task,
    runId: ids.run,
    stepId: ids.step,
    actionId: call.actionId,
    idempotencyKey: `test:${call.actionId}`,
    executorCapability: "adapter.tool.echo",
    recoveryMode: "idempotent_retry",
    status: "succeeded",
    metadata: {},
    resultDigest: digest("f"),
    createdAt: at,
    updatedAt: at,
  };
}

function modelRequest(
  round: number,
  prior: readonly ToolMessage[],
): ModelRequest {
  const material = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    requestId: id(500 + round),
    snapshotId: id(510),
    contextSourceDigest: digest(String(round)),
    model: {
      capabilityId: "model.fake",
      capabilityRevision: digest("9"),
    },
    messages: [
      {
        schemaVersion: MODEL_PROTOCOL_VERSION,
        role: "user" as const,
        content: [{ type: "text" as const, text: "run" }],
      },
      ...prior,
    ],
    tools: [],
    artifacts: prior.map((result) => {
      const bytes = Buffer.byteLength(
        result.content.map((part) => part.text).join(""),
        "utf8",
      );
      return {
        type: "tool_result" as const,
        toolCallId: result.toolCallId,
        taskId: result.taskId,
        actionId: result.actionId,
        observationId: result.observationId,
        resultDigest: result.resultDigest,
        originalBytes: bytes,
        previewBytes: bytes,
        truncated: false,
      };
    }),
    maxOutputTokens: 1_024,
  };
  return {
    ...material,
    requestDigest: sha256CanonicalJson(JsonObjectSchema.parse(material)),
  };
}

function digest(character: string): string {
  return `sha256:${character.repeat(64).slice(0, 64)}`;
}

async function accepted(
  operation: ReturnType<DurableTaskRuntime["dispatch"]>,
): Promise<void> {
  const result = await operation;
  if (!result.accepted) throw new Error(result.error.code);
}
