import {
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  PersistenceSchemaVersion,
  type ConversationMessage,
} from "@robothree/contracts";
import { describe, expect, it, vi } from "vitest";

import { FakeScheduler } from "../src/adapters/fake/fake-scheduler.js";
import { ActiveAgentLoopStartupRecoveryCoordinator } from
  "../src/application/active-agent-loop-startup-recovery.js";
import { buildAgentLoopStartupRecoverySeed } from
  "../src/application/durable-agent-loop-starter.js";
import { sha256CanonicalJson } from "../src/persistence/digest.js";
import type { ToolCallBatchRecord, ToolCallDispositionRecord } from
  "../src/persistence/tool-call-batch.js";
import type { ModelInvocationLink } from
  "../src/ports/model-invocation-link-persistence.js";
import type { PersistedTask, TaskPersistence } from "../src/ports/task-persistence.js";

const ids = {
  task: "019f7d00-0000-7000-8000-000000000101",
  session: "019f7d00-0000-7000-8000-000000000102",
  run: "019f7d00-0000-7000-8000-000000000103",
  step: "019f7d00-0000-7000-8000-000000000104",
  action: "019f7d00-0000-7000-8000-000000000105",
  assistantOne: "019f7d00-0000-7000-8000-000000000106",
  assistantTwo: "019f7d00-0000-7000-8000-000000000107",
  toolCall: "019f7d00-0000-7000-8000-000000000108",
  observation: "019f7d00-0000-7000-8000-000000000109",
  result: "019f7d00-0000-7000-8000-000000000110",
  batch: "019f7d00-0000-7000-8000-000000000111",
  effect: "019f7d00-0000-7000-8000-000000000112",
  invocation: "019f7d00-0000-7000-8000-000000000113",
  request: "019f7d00-0000-7000-8000-000000000114",
  confirmation: "019f7d00-0000-7000-8000-000000000115",
};

describe("VS2.3 active Agent Loop startup recovery", () => {
  it("reconstructs one exact prior Tool Result and the accepted active round", () => {
    const fixture = recoveryFixture();
    const seed = buildAgentLoopStartupRecoverySeed(fixture);

    expect(seed).toMatchObject({
      completedRoundCount: 1,
      activeRound: 2,
      activeAssistantMessageId: ids.assistantTwo,
      runId: ids.run,
      stepId: ids.step,
      actionId: ids.action,
      modelRequestId: ids.request,
    });
    expect(seed.priorToolResults).toEqual([fixture.messages[1]!.message]);
  });

  it("fails closed when the active link or prior durable result drifts", () => {
    const fixture = recoveryFixture();
    expect(() => buildAgentLoopStartupRecoverySeed({
      ...fixture,
      link: { ...fixture.link, outputStartedAt: "2026-08-30T00:00:01.000Z" },
    })).toThrow("link does not match");
    expect(() => buildAgentLoopStartupRecoverySeed({
      ...fixture,
      link: { ...fixture.link, providerRequestDeadlineAt: undefined },
    })).toThrow("link does not match");
    expect(() => buildAgentLoopStartupRecoverySeed({
      ...fixture,
      evidence: [{
        ...fixture.evidence[0]!,
        dispositions: [],
      }],
    })).toThrow("Tool batch is inconsistent");
  });

  it("only schedules running active model steps and keeps candidate order stable", async () => {
    const first = persistedTask("019f7d00-0000-7000-8000-000000000201", "created");
    const second = persistedTask("019f7d00-0000-7000-8000-000000000203", "running");
    const third = persistedTask("019f7d00-0000-7000-8000-000000000202", "running");
    const resumeFromStartup = vi.fn(async () => undefined);
    const coordinator = new ActiveAgentLoopStartupRecoveryCoordinator({
      tasks: {
        listRecoveryCandidates: async () => [second, first, third],
      } as unknown as TaskPersistence,
      starter: { resumeFromStartup, cancel: vi.fn() },
      scheduler: new FakeScheduler(),
    });

    await expect(coordinator.recoverOnce()).resolves.toEqual({
      scanned: 3,
      resumed: 2,
      skipped: 1,
      conflicted: 0,
      safeErrorCodes: [],
    });
    expect(resumeFromStartup.mock.calls.map(([taskId]) => taskId)).toEqual([
      third.head.taskId,
      second.head.taskId,
    ]);
  });
});

function recoveryFixture() {
  const assistantMessage = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "assistant" as const,
    content: [],
    toolCalls: [{
      toolCallId: ids.toolCall,
      taskId: ids.task,
      actionId: ids.action,
      capabilityId: "tool.document.docx.read",
      arguments: { path: "brief.docx" },
    }],
  };
  const resultMessage = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "tool" as const,
    toolCallId: ids.toolCall,
    taskId: ids.task,
    actionId: ids.action,
    observationId: ids.observation,
    outcome: "succeeded" as const,
    resultDigest: digest({ result: "brief" }),
    content: [{ type: "text" as const, text: "brief observation" }],
  };
  const messages: readonly ConversationMessage[] = [{
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: ids.assistantOne,
      sessionId: ids.session,
      sequence: 1,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: digest(assistantMessage),
      taskId: ids.task,
      createdAt: "2026-08-30T00:00:00.000Z",
    },
    message: assistantMessage,
  }, {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: ids.result,
      sessionId: ids.session,
      sequence: 2,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: digest(resultMessage),
      taskId: ids.task,
      createdAt: "2026-08-30T00:00:00.100Z",
    },
    message: resultMessage,
  }];
  const batch: ToolCallBatchRecord = {
    schemaVersion: "v1alpha1",
    batchId: ids.batch,
    sessionId: ids.session,
    taskId: ids.task,
    runId: ids.run,
    assistantMessageId: ids.assistantOne,
    assistantMessageSequence: 1,
    assistantMessageDigest: digest(assistantMessage),
    batchDigest: digest({ batch: ids.batch }),
    callCount: 1,
    createdAt: "2026-08-30T00:00:00.000Z",
  };
  const disposition: ToolCallDispositionRecord = {
    schemaVersion: "v1alpha1",
    batchId: ids.batch,
    toolCallId: ids.toolCall,
    actionId: ids.action,
    ordinal: 0,
    disposition: "result_committed",
    revision: 3,
    effectAttemptId: ids.effect,
    resultMessageId: ids.result,
    resultDigest: resultMessage.resultDigest,
    updatedAt: "2026-08-30T00:00:00.100Z",
  };
  const link: ModelInvocationLink = {
    taskId: ids.task,
    runId: ids.run,
    stepId: ids.step,
    actionId: ids.action,
    round: 2,
    runtimeSelectionDigest: digest({ selection: 1 }),
    assistantMessageId: ids.assistantTwo,
    modelRequestId: ids.request,
    modelRequestDigest: digest({ request: 2 }),
    confirmationId: ids.confirmation,
    scopeDigest: digest({ scope: 1 }),
    dataScopeDigest: digest({ dataScope: 1 }),
    providerRequestDeadlineAt: "2026-08-30T00:05:00.000Z",
    clientRequestId: "019f7d00-0000-7000-8000-000000000116",
    centralAcceptRequestDigest: digest({ accept: 1 }),
    invocationId: ids.invocation,
    statusRevision: 1,
    durableCursor: "cursor-1",
    acceptedAt: "2026-08-30T00:00:00.200Z",
    recordDigest: digest({ record: 1 }),
    createdAt: "2026-08-30T00:00:00.150Z",
    updatedAt: "2026-08-30T00:00:00.200Z",
  };
  return {
    taskId: ids.task,
    runId: ids.run,
    stepId: ids.step,
    actionId: ids.action,
    link,
    messages,
    evidence: [{ batch, dispositions: [disposition] }],
  };
}

function persistedTask(taskId: string, status: "created" | "running"): PersistedTask {
  const at = "2026-08-30T00:00:00.000Z";
  const runId = "019f7d00-0000-7000-8000-000000000301";
  const stepId = "019f7d00-0000-7000-8000-000000000302";
  const actionId = "019f7d00-0000-7000-8000-000000000303";
  const state = {
    taskId,
    sessionId: ids.session,
    agentDefinition: { agentDefinitionId: ids.task, version: "1.0.0" },
    goal: "recover",
    status,
    revision: status === "created" ? 0 : 2,
    ...(status === "created" ? {} : { activeRunId: runId }),
    runs: status === "created" ? [] : [{
      runId,
      attempt: 1,
      status: "running" as const,
      activeStepId: stepId,
      steps: [{
        stepId,
        sequence: 1,
        status: "running" as const,
        planRevision: {
          executionPlanId: ids.run,
          planRevisionId: ids.step,
          revision: 1,
        },
        action: { actionId, kind: "model.generate" as const, payload: {} },
        startedAt: at,
        updatedAt: at,
      }],
      startedAt: at,
      updatedAt: at,
    }],
    createdAt: at,
    updatedAt: at,
  };
  return {
    head: {
      schemaVersion: PersistenceSchemaVersion,
      taskId,
      initializationDigest: digest({ taskId }),
      stateRevision: state.revision,
      lastEventSequence: state.revision,
      latestCheckpointId: ids.confirmation,
      status,
      updatedAt: at,
    },
    checkpoint: {
      schemaVersion: PersistenceSchemaVersion,
      checkpointId: ids.confirmation,
      taskId,
      stateRevision: state.revision,
      lastEventSequence: state.revision,
      state: state as PersistedTask["checkpoint"]["state"],
      stateDigest: digest(state),
      createdAt: at,
    },
  };
}

function digest(value: unknown): `sha256:${string}` {
  return sha256CanonicalJson(JsonValueSchema.parse(value)) as `sha256:${string}`;
}
