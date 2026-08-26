import { describe, expect, it } from "vitest";

import {
  ConservativeTokenEstimator,
  ContextBudgetPolicy,
  ContextPipeline,
  ContextPreparationAdmissionInterruption,
  ContextPreparationCoordinator,
  FakeClock,
  InMemoryConversationPersistence,
  InMemoryTaskPersistence,
  TurnSnapshotBuilder,
  sha256CanonicalJson,
} from "../src/index.js";
import {
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
} from "@robothree/contracts";

const id = (value: number) => `019f8b00-0000-7000-8000-${String(value).padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;

describe("ARH-2.2 ContextPipeline private assessment", () => {
  it("returns an over-budget candidate without bypassing the formal hard guard", () => {
    const pipeline = new ContextPipeline({
      budgetPolicy: new ContextBudgetPolicy({
        modelContextWindow: 600,
        reservedOutputTokens: 100,
        safetyMarginTokens: 50,
        compactionThresholdRatio: 0.8,
        maxPreviewBytes: 128,
      }),
      estimator: new ConservativeTokenEstimator(),
    });
    const message = {
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user" as const,
      content: [{ type: "text" as const, text: "x".repeat(1_000) }],
    };
    const record = {
      envelope: {
        schemaVersion: "v1alpha1" as const,
        messageId: id(2),
        sessionId: id(1),
        sequence: 1,
        messageSchemaVersion: MODEL_PROTOCOL_VERSION,
        messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
        createdAt: "2026-08-12T00:00:00.000Z",
      },
      message,
    };
    const conversation = {
      sessionId: id(1),
      messageSequence: 1,
      contextRevision: 0,
      messageStartSequence: 1,
      messageEndSequence: 1,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse([record])),
    };
    const projection = [{
      type: "conversation_message" as const,
      order: 0,
      sessionId: id(1),
      messageId: id(2),
      messageSequence: 1,
      messageDigest: record.envelope.messageDigest,
    }];
    const input = {
      phase: "pre_call" as const,
      requestId: id(3),
      snapshot: {
        schemaVersion: "v1alpha1" as const,
        snapshotId: id(4),
        sessionId: id(1),
        conversation,
        tasks: [],
        projection,
        sourceDigest: sha256CanonicalJson(JsonValueSchema.parse({ conversation, tasks: [], projection })),
        createdAt: "2026-08-12T00:00:00.000Z",
      },
      conversationMessages: [record],
      model: { capabilityId: "model.fixture", capabilityRevision: digest("1") },
    };
    const assessed = pipeline.assess(input);
    expect(assessed.exceedsAvailableInput).toBe(true);
    expect(assessed.candidate.receipt.finalEstimatedInputTokens)
      .toBeGreaterThan(assessed.candidate.receipt.availableInputTokens);
    expect(() => pipeline.run(input)).toThrow(/are available/u);
  });

  it.each([
    {
      code: "model.user_confirmation_required" as const,
      decision: "skipped" as const,
      reason: "admission_pending" as const,
    },
    {
      code: "authorization.user_rejected" as const,
      decision: "failed" as const,
      reason: "admission_rejected" as const,
    },
  ])("returns a stable preparation receipt for $code", async ({ code, decision, reason }) => {
    const clock = new FakeClock("2026-08-12T00:00:00.000Z");
    const conversation = new InMemoryConversationPersistence({ clock });
    const tasks = new InMemoryTaskPersistence(clock);
    await conversation.start();
    await tasks.start();
    await conversation.createSession({
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      sessionId: id(10),
      messageSequence: 0,
      sessionEventSequence: 0,
      contextRevision: 0,
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    for (const sequence of [1, 2] as const) {
      await conversation.appendMessage({
        expectedMessageSequence: sequence - 1,
        message: conversationRecord(sequence, "x".repeat(1_000)),
        updatedAt: clock.now(),
      });
    }
    const pipeline = new ContextPipeline({
      budgetPolicy: new ContextBudgetPolicy({
        modelContextWindow: 600,
        reservedOutputTokens: 100,
        safetyMarginTokens: 50,
        compactionThresholdRatio: 0.8,
        maxPreviewBytes: 128,
      }),
      estimator: new ConservativeTokenEstimator(),
    });
    const coordinator = new ContextPreparationCoordinator({
      conversation,
      snapshots: new TurnSnapshotBuilder({
        conversationPersistence: conversation,
        taskPersistence: tasks,
      }),
      context: pipeline,
    });
    const authorizationError = Object.assign(new Error(code), { code });

    const prepared = coordinator.prepare({
      sessionId: id(10),
      snapshotId: () => id(20),
      requestId: () => id(21),
      createdAt: () => clock.now(),
      pipelineInput: (facts) => ({
        phase: "pre_call",
        requestId: facts.requestId,
        snapshot: facts.snapshot,
        conversationMessages: facts.messages,
        toolCallBatches: facts.toolCallBatches,
        model: { capabilityId: "model.fixture", capabilityRevision: digest("2") },
      }),
      authorizeAndCompact: async () => {
        throw authorizationError;
      },
    });

    await expect(prepared).rejects.toMatchObject({
      code,
      receipt: {
        decision,
        reason,
        sourceRangeDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
    });
    await prepared.catch((error: unknown) => {
      expect(error).toBeInstanceOf(ContextPreparationAdmissionInterruption);
      expect((error as ContextPreparationAdmissionInterruption).original).toBe(authorizationError);
    });
    expect(await conversation.listPendingCompactionJobs()).toEqual([]);
  });
});

function conversationRecord(sequence: 1 | 2, text: string) {
  const message = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "user" as const,
    content: [{ type: "text" as const, text }],
  };
  return {
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: id(10 + sequence),
      sessionId: id(10),
      sequence,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      createdAt: `2026-08-12T00:00:0${sequence}.000Z`,
    },
    message,
  };
}
