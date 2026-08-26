import {
  CONTRACT_VERSION,
  JsonObjectSchema,
  type PersistedUserConfirmation,
  type RuntimeError,
  type TaskRunState,
  type ToolAuthorizationContext,
} from "@robothree/contracts";

import type {
  AgentLoopStarter,
  AgentLoopStartResult,
} from "../ports/agent-loop-starter.js";
import type { Clock } from "../ports/clock.js";
import type { ConversationPersistence } from "../ports/conversation-persistence.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { SubmitTurnPersistence } from "../ports/submit-turn-persistence.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import type {
  DesktopConfirmationDecisionGateway,
  DesktopTaskExecutionController,
} from "./desktop-task-control-service.js";
import type { DurableAgentConversationWriter } from "./durable-agent-conversation-writer.js";
import type {
  DurableTaskCommandResult,
  DurableTaskRuntime,
} from "./durable-task-runtime.js";
import type {
  ToolExecutionInput,
  ToolExecutionService,
} from "./tool-execution-service.js";

const DEMO_TOOL_ID = "tool.echo";
const DEMO_RESULT_TEXT =
  "DCF-2C Demo Echo 已执行完成，重启恢复和用户确认链路验证通过。";

/**
 * Explicitly demo-only runner used by `pnpm run demo:dcf2c`.
 *
 * It deliberately bypasses model planning while reusing the production
 * Task/Confirmation/Effect/Tool persistence path. The runner is never
 * registered by the normal Desktop bootstrap.
 */
export class Dcf2cDemoAgentRunner
implements
  AgentLoopStarter,
  DesktopConfirmationDecisionGateway,
  DesktopTaskExecutionController {
  readonly #runtime: DurableTaskRuntime;
  readonly #tasks: TaskPersistence;
  readonly #conversation: ConversationPersistence;
  readonly #writer: DurableAgentConversationWriter;
  readonly #coordination: SubmitTurnPersistence;
  readonly #tools: ToolExecutionService;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #registryRevision: string;
  readonly #activeUserId: string;
  readonly #active = new Map<string, AbortController>();
  readonly #mailboxes = new Map<string, Promise<void>>();

  constructor(input: {
    runtime: DurableTaskRuntime;
    tasks: TaskPersistence;
    conversation: ConversationPersistence;
    writer: DurableAgentConversationWriter;
    coordination: SubmitTurnPersistence;
    tools: ToolExecutionService;
    clock: Clock;
    ids: IdGenerator;
    registryRevision: string;
    activeUserId: string;
  }) {
    this.#runtime = input.runtime;
    this.#tasks = input.tasks;
    this.#conversation = input.conversation;
    this.#writer = input.writer;
    this.#coordination = input.coordination;
    this.#tools = input.tools;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#registryRevision = input.registryRevision;
    this.#activeUserId = input.activeUserId;
  }

  start(input: Parameters<AgentLoopStarter["start"]>[0]): Promise<AgentLoopStartResult> {
    return this.#enqueue(input.taskId, async () => {
      const bundle = await this.#tasks.loadSubmitTurnTaskBundle(
        input.submitTurnCommandId,
      );
      if (
        bundle === undefined
        || bundle.task.head.taskId !== input.taskId
        || bundle.runtimeSelection.runtimeSelectionId !== input.runtimeSelectionId
        || bundle.binding.userMessageId !== input.userMessageId
        || bundle.task.checkpoint.state.sessionId !== input.sessionId
        || !bundle.runtimeSelection.toolLocks.some((lock) =>
          lock.capabilityId === DEMO_TOOL_ID)
      ) {
        throw new Error("DCF-2C Demo Task bundle is unavailable or mismatched");
      }
      const state = await this.#ensureActiveDemoStep(input.taskId);
      if (state.status === "waiting") return { replayed: true };
      if (state.status === "completed") return { replayed: true };
      const execution = this.#executionFromState(state);
      const abort = new AbortController();
      this.#active.set(input.taskId, abort);
      try {
        const outcome = await this.#tools.execute({
          ...execution,
          signal: abort.signal,
        });
        if (
          "status" in outcome
          && outcome.status === "waiting_user_confirmation"
        ) {
          return { replayed: false };
        }
        if (
          "status" in outcome
          && (outcome.status === "denied" || outcome.status === "not_admitted")
        ) {
          throw new Error(`${outcome.error.code}: ${outcome.error.message}`);
        }
        await this.#finish(input.taskId, false);
        return { replayed: false };
      } finally {
        if (this.#active.get(input.taskId) === abort) {
          this.#active.delete(input.taskId);
        }
      }
    });
  }

  async decide(input: Readonly<{
    record: PersistedUserConfirmation;
    decisionId: string;
    decision: "confirmed" | "rejected";
    decidedByUserId: string;
    decidedAt: string;
  }>): Promise<DurableTaskCommandResult | {
    accepted: true;
    replayed: boolean;
    state: TaskRunState;
  }> {
    const taskId = input.record.request.scope.taskId;
    return this.#enqueue(taskId, async () => {
      try {
        const state = await this.#runtime.snapshot(taskId);
        if (state === undefined) return failure(
          "persistence.task_not_found",
          "DCF-2C Demo Task is unavailable",
        );
        const outcome = await this.#tools.submitDecision({
          execution: this.#executionFromState(state),
          confirmationId: input.record.request.confirmationId,
          decisionId: input.decisionId,
          decision: input.decision,
          decidedByUserId: input.decidedByUserId,
          decidedAt: input.decidedAt,
        });
        if ("status" in outcome && outcome.status === "denied") {
          return { accepted: false, error: outcome.error };
        }
        await this.#finish(taskId, input.decision === "rejected");
        const completed = await this.#runtime.snapshot(taskId);
        return completed === undefined
          ? failure(
            "persistence.task_not_found",
            "DCF-2C Demo Task disappeared after execution",
          )
          : { accepted: true, replayed: false, state: completed };
      } catch (error) {
        return failure(
          "dcf2c.demo_execution_failed",
          error instanceof Error ? error.message : "DCF-2C Demo execution failed",
        );
      }
    });
  }

  cancel(taskId: string): void {
    this.#active.get(taskId)?.abort();
  }

  async resume(taskId: string): Promise<void> {
    const [binding, selection, task] = await Promise.all([
      this.#tasks.loadSubmitTurnBindingByTaskId(taskId),
      this.#tasks.loadTaskRuntimeSelection(taskId),
      this.#tasks.loadTask(taskId),
    ]);
    if (
      binding === undefined
      || selection === undefined
      || task?.checkpoint.state.sessionId === undefined
    ) {
      throw new Error("DCF-2C Demo continuation facts are unavailable");
    }
    await this.start({
      submitTurnCommandId: binding.submitTurnCommandId,
      taskId,
      runtimeSelectionId: selection.runtimeSelectionId,
      sessionId: task.checkpoint.state.sessionId,
      userMessageId: binding.userMessageId,
    });
  }

  async #ensureActiveDemoStep(taskId: string): Promise<TaskRunState> {
    let state = await this.#runtime.snapshot(taskId);
    if (state === undefined) throw new Error("DCF-2C Demo Task is unavailable");
    if (state.status === "completed" || state.status === "waiting") return state;
    if (state.status === "created") {
      const started = await this.#runtime.dispatch({
        commandId: this.#ids.next(),
        taskId,
        type: "start_run",
        issuedAt: this.#clock.now(),
        runId: this.#ids.next(),
      });
      if (!started.accepted) throw new Error(started.error.message);
      state = started.state;
    }
    if (state.status !== "running" || state.activeRunId === undefined) {
      throw new Error(`DCF-2C Demo cannot start from ${state.status}`);
    }
    const run = state.runs.find((candidate) =>
      candidate.runId === state.activeRunId);
    if (run === undefined) throw new Error("DCF-2C Demo active Run is unavailable");
    if (run.activeStepId !== undefined) return state;
    if (run.steps.length > 0) {
      throw new Error("DCF-2C Demo Run cannot create a second Tool Step");
    }
    const started = await this.#runtime.dispatch({
      commandId: this.#ids.next(),
      taskId,
      type: "start_step",
      issuedAt: this.#clock.now(),
      runId: run.runId,
      stepId: this.#ids.next(),
      planRevision: {
        executionPlanId: this.#ids.next(),
        planRevisionId: this.#ids.next(),
        revision: 1,
      },
      action: {
        actionId: this.#ids.next(),
        kind: DEMO_TOOL_ID,
        payload: JsonObjectSchema.parse({
          message: "DCF-2C controlled local Process Echo demo",
        }),
      },
    });
    if (!started.accepted) throw new Error(started.error.message);
    return started.state;
  }

  #executionFromState(state: TaskRunState): ToolExecutionInput {
    if (state.activeRunId === undefined) {
      throw new Error("DCF-2C Demo Task has no active Run");
    }
    const run = state.runs.find((candidate) =>
      candidate.runId === state.activeRunId);
    const step = run?.steps.find((candidate) =>
      candidate.stepId === run.activeStepId);
    if (run === undefined || step === undefined) {
      throw new Error("DCF-2C Demo active Tool Step is unavailable");
    }
    return {
      taskId: state.taskId,
      runId: run.runId,
      stepId: step.stepId,
      registryRevision: this.#registryRevision,
      capabilityId: DEMO_TOOL_ID,
      action: step.action,
      idempotencyKey: `dcf2c-demo:${state.taskId}:${step.action.actionId}`,
      authorization: {
        context: authorizationContext(this.#activeUserId),
        currentContext: async () => authorizationContext(this.#activeUserId),
      },
    };
  }

  async #finish(taskId: string, rejected: boolean): Promise<void> {
    let state = await this.#runtime.snapshot(taskId);
    if (state === undefined) throw new Error("DCF-2C Demo Task is unavailable");
    if (state.status !== "completed") {
      if (state.status !== "running" || state.activeRunId === undefined) {
        throw new Error(`DCF-2C Demo cannot finish from ${state.status}`);
      }
      const completed = await this.#runtime.dispatch({
        commandId: this.#ids.next(),
        taskId,
        type: "complete_run",
        issuedAt: this.#clock.now(),
        runId: state.activeRunId,
      });
      if (!completed.accepted) throw new Error(completed.error.message);
      state = completed.state;
    }
    if (state.sessionId === undefined) {
      throw new Error("DCF-2C Demo Task has no Session");
    }
    const existing = await loadMessage(
      this.#conversation,
      state.sessionId,
      taskId,
    );
    const message = existing ?? await this.#writer.appendAssistant({
      messageId: taskId,
      sessionId: state.sessionId,
      taskId,
      text: rejected
        ? "你已拒绝 DCF-2C Demo Echo，本次 Tool 未执行。"
        : DEMO_RESULT_TEXT,
      toolCalls: [],
    });
    if (message === undefined) {
      throw new Error("DCF-2C Demo final Assistant Message was not created");
    }
    const binding = await this.#tasks.loadSubmitTurnBindingByTaskId(taskId);
    if (binding === undefined) {
      throw new Error("DCF-2C Demo SubmitTurn binding is unavailable");
    }
    const record = await this.#coordination.loadRecord(
      binding.submitTurnCommandId,
    );
    if (record === undefined) {
      throw new Error("DCF-2C Demo SubmitTurn record is unavailable");
    }
    const delivery = await this.#coordination.appendDelivery({
      schemaVersion: "v1alpha1",
      deliveryId: message.envelope.messageId,
      submitTurnCommandId: binding.submitTurnCommandId,
      type: "message.committed",
      sessionId: record.desktopSessionId,
      taskId: `task:${taskId}`,
      messageId: `message:${message.envelope.messageId}`,
      messageRevision: message.envelope.sequence,
      messageStatus: "completed",
      createdAt: message.envelope.createdAt,
    });
    if (!delivery.ok) {
      throw new Error(`${delivery.error.code}: ${delivery.error.message}`);
    }
  }

  async #enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#mailboxes.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => next);
    this.#mailboxes.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.#mailboxes.get(key) === tail) this.#mailboxes.delete(key);
    }
  }
}

function authorizationContext(userId: string): ToolAuthorizationContext {
  return {
    schemaVersion: CONTRACT_VERSION,
    subject: {
      schemaVersion: CONTRACT_VERSION,
      userId,
      activeConfigRevision: "dcf2c-demo-config-v1",
      canUseTools: true,
      assignedToolCapabilityIds: [DEMO_TOOL_ID],
      grants: [],
    },
    resourceAccesses: [],
    availability: {
      enabled: true,
      healthy: true,
      credentialAvailable: true,
      revision: "dcf2c-demo-health-v1",
    },
  };
}

async function loadMessage(
  persistence: ConversationPersistence,
  sessionId: string,
  taskId: string,
) {
  const head = await persistence.loadSession(sessionId);
  if (head === undefined || head.messageSequence === 0) return undefined;
  const messages = await persistence.loadMessageRange(
    sessionId,
    1,
    head.messageSequence,
  );
  return messages.find((message) =>
    message.envelope.messageId === taskId
    && message.envelope.taskId === taskId
    && message.message.role === "assistant");
}

function failure(code: string, message: string): DurableTaskCommandResult {
  const error: RuntimeError = {
    code,
    category: code.startsWith("persistence.") ? "persistence" : "internal",
    message,
    retryable: false,
  };
  return { accepted: false, error };
}
