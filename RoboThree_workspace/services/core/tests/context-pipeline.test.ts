import {
  CONVERSATION_SCHEMA_VERSION,
  CONTEXT_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  type ConversationMessage,
  type ProviderNeutralMessage,
  type TaskCapabilityLock,
  type TurnContextSnapshot,
} from "@robothree/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  ConservativeTokenEstimator,
  ContextBudgetExceededError,
  ContextBudgetPolicy,
  ContextPipeline,
  FakeClock,
  InMemoryConversationPersistence,
  InMemoryTaskPersistence,
  PerformanceHarness,
  TurnSnapshotBuilder,
  calculateModelRequestDigest,
  sha256CanonicalJson,
} from "../src/index.js";
import type {
  ContextPipelineInput,
  MaterializedInstructionSource,
  SelectedSkillContext,
  ToolCallBatchEvidence,
  ToolSchemaCandidate,
} from "../src/index.js";
import {
  capabilityDigest,
  capabilityLock,
} from "./capability.fixtures.js";
import {
  seedTurnFixture,
  turnAt,
  turnIds,
} from "./turn-snapshot.fixtures.js";

const entityId = (value: number) =>
  `019f7c20-0000-7000-8000-${String(value).padStart(12, "0")}`;
const model = {
  capabilityId: "model.fake",
  capabilityRevision: capabilityDigest("f"),
};
const defaultPipeline = () => new ContextPipeline({
  budgetPolicy: new ContextBudgetPolicy(),
  estimator: new ConservativeTokenEstimator(),
});
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

describe("KAF-5.2 Context budget boundaries", () => {
  it("classifies threshold and available-input N-1/N/N+1 exactly", () => {
    const policy = new ContextBudgetPolicy();
    const budget = policy.decision();
    expect(budget).toMatchObject({
      modelContextWindow: 8_192,
      reservedOutputTokens: 1_024,
      safetyMarginTokens: 512,
      availableInputTokens: 6_656,
      compactionThresholdTokens: 5_324,
      maxPreviewBytes: 4_096,
    });
    expect(policy.classify(budget.compactionThresholdTokens - 1)).toBe("within_threshold");
    expect(policy.classify(budget.compactionThresholdTokens)).toBe("within_threshold");
    expect(policy.classify(budget.compactionThresholdTokens + 1)).toBe("reduction_required");
    expect(policy.classify(budget.availableInputTokens - 1)).toBe("reduction_required");
    expect(policy.classify(budget.availableInputTokens)).toBe("reduction_required");
    expect(policy.classify(budget.availableInputTokens + 1)).toBe("exceeds_available_input");
  });

  it("injects an active Summary once as low-authority derived context before the raw tail", () => {
    const fixture = snapshotFixture([userMessage(1, "raw tail")]);
    const compactionId = entityId(900);
    const compactionJobId = entityId(901);
    const summary = "The user chose the blue deployment target.";
    const snapshot = {
      ...fixture.snapshot,
      conversation: {
        ...fixture.snapshot.conversation,
        messageSequence: 3,
        contextRevision: 1,
        activeCompactionId: compactionId,
        messageStartSequence: 3,
        messageEndSequence: 3,
      },
      projection: fixture.snapshot.projection.map((item) => item.type === "conversation_message"
        ? { ...item, messageSequence: 3 }
        : item),
    };
    const messages = fixture.messages.map((record) => ({
      ...record,
      envelope: { ...record.envelope, sequence: 3 },
    }));
    const sourceDigest = sha256CanonicalJson(JsonValueSchema.parse({
      conversation: snapshot.conversation,
      tasks: snapshot.tasks,
      projection: snapshot.projection,
    }));
    const result = defaultPipeline().run({
      phase: "pre_call",
      requestId: entityId(902),
      snapshot: { ...snapshot, sourceDigest },
      conversationMessages: messages,
      compactionSummary: {
        snapshotId: snapshot.snapshotId,
        contextRevision: 1,
        summaryDigest: sha256CanonicalJson(JsonValueSchema.parse(summary)),
        record: {
          schemaVersion: "v1alpha1",
          compactionId,
          compactionJobId,
          sessionId: snapshot.sessionId,
          sourceStartSequence: 1,
          sourceEndSequence: 2,
          sourceDigest: capabilityDigest("1"),
          baseContextRevision: 0,
          summary,
          summarySchemaVersion: "v1alpha1",
          summarizerModelRef: "model.fake",
          summarizerPromptRevision: capabilityDigest("2"),
          estimatedTokensBefore: 100,
          estimatedTokensAfter: 20,
          createdAt: turnAt.snapshot,
        },
      },
      model,
    });
    expect(result.request.messages).toHaveLength(2);
    expect(result.request.messages[0]).toMatchObject({ role: "user" });
    expect(result.request.messages[0]!.content[0]!.text).toContain("derived and non-authoritative");
    expect(result.request.messages[1]!.content[0]!.text).toContain("raw tail");
    expect(result.receipt.includedSegments.filter((segment) =>
      segment.sourceKind === "compaction_summary")).toHaveLength(1);
    expect(result.receipt.compactionSummaryEvidence).toEqual({
      compactionId,
      sourceStartSequence: 1,
      sourceEndSequence: 2,
      sourceDigest: capabilityDigest("1"),
      summaryDigest: sha256CanonicalJson(JsonValueSchema.parse(summary)),
      contextRevision: 1,
    });
    expect(JSON.stringify(result.receipt)).not.toContain(summary);
    expect(fixture.messages).toHaveLength(1);
  });

  for (const size of [4_095, 4_096, 4_097]) {
    it(`bounds a Tool Result at preview limit case ${size}`, () => {
      const fixture = snapshotFixture([
        userMessage(1, "start"),
        toolMessage(2, "x".repeat(size)),
      ]);
      const result = new ContextPipeline({
        budgetPolicy: new ContextBudgetPolicy({
          modelContextWindow: 20_000,
          reservedOutputTokens: 1_024,
          safetyMarginTokens: 512,
          compactionThresholdRatio: 1,
          maxPreviewBytes: 4_096,
        }),
        estimator: new ConservativeTokenEstimator(),
      }).run({
        phase: "mid_turn",
        requestId: entityId(100 + size),
        snapshot: fixture.snapshot,
        conversationMessages: fixture.messages,
        model,
      });
      expect(result.request.artifacts[0]).toMatchObject({
        originalBytes: size,
        previewBytes: Math.min(size, 4_096),
        truncated: size > 4_096,
      });
      const tool = result.request.messages.find((message) => message.role === "tool");
      expect(tool?.role === "tool"
        ? new TextEncoder().encode(tool.content[0]?.text ?? "").byteLength
        : -1).toBe(Math.min(size, 4_096));
    });
  }
});

describe("KAF-5.2 deterministic assembly and source authorization", () => {
  it("assembles Static/Dynamic segments, selected Skill context, and one exact locked Tool", async () => {
    const fixture = await persistedFixture();
    const instruction = instructionSource(fixture.snapshot.snapshotId);
    const skill = skillSource(fixture.snapshot.snapshotId, "skill.valid");
    const candidate = toolCandidate(fixture.snapshot.snapshotId, fixture.lock);
    const input: ContextPipelineInput = {
      phase: "pre_call",
      requestId: entityId(200),
      snapshot: fixture.snapshot,
      conversationMessages: fixture.messages,
      model,
      instructions: [instruction],
      selectedSkills: [skill],
      toolCandidates: [candidate],
    };
    const outputs = Array.from({ length: 10 }, () => defaultPipeline().run(input));
    expect(outputs.every((output) =>
      JSON.stringify(output) === JSON.stringify(outputs[0]))).toBe(true);
    expect(outputs[0]?.request.tools).toEqual([
      expect.objectContaining({
        taskId: turnIds.task1,
        lockId: fixture.lock.lockId,
        capabilityId: "tool.echo",
      }),
    ]);
    expect(outputs[0]?.request.messages.slice(0, 2).map((message) => message.role))
      .toEqual(["system", "system"]);
    expect(outputs[0]?.receipt.includedSegments.map((segment) => segment.segmentKind))
      .toContain("static");
    expect(calculateModelRequestDigest(outputs[0]!.request))
      .toBe(outputs[0]?.request.requestDigest);
    expect(outputs[0]?.receipt.modelRequestDigest).toBe(outputs[0]?.request.requestDigest);
  });

  it("includes only selected, authorized, digest-valid Skill material from this Snapshot", () => {
    const fixture = snapshotFixture([userMessage(1, "hello")]);
    const valid = skillSource(fixture.snapshot.snapshotId, "skill.valid");
    const result = defaultPipeline().run({
      phase: "pre_call",
      requestId: entityId(201),
      snapshot: fixture.snapshot,
      conversationMessages: fixture.messages,
      model,
      selectedSkills: [
        valid,
        { ...skillSource(fixture.snapshot.snapshotId, "skill.not-selected"), selected: false },
        { ...skillSource(fixture.snapshot.snapshotId, "skill.denied"), authorized: false },
        { ...skillSource(entityId(999), "skill.other-snapshot") },
        { ...skillSource(fixture.snapshot.snapshotId, "skill.bad-digest"), content: "changed" },
      ],
    });
    const systemMessages = result.request.messages.filter((message) => message.role === "system");
    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0]).toMatchObject({ sourceId: "skill.valid" });
    expect(result.receipt.excludedSources.map((entry) => entry.reason)).toEqual([
      "source_digest_mismatch",
      "not_authorized",
      "not_selected",
      "snapshot_mismatch",
    ]);
  });

  it("excludes Tool schemas that lack selection, authorization, registration, compatibility, or Snapshot proof", async () => {
    const fixture = await persistedFixture();
    const base = toolCandidate(fixture.snapshot.snapshotId, fixture.lock);
    const cases: readonly [string, ToolSchemaCandidate, string][] = [
      ["selection", { ...base, selected: false }, "not_selected"],
      ["authorization", {
        ...base,
        authorization: { ...base.authorization, outcome: "denied" },
      }, "not_authorized"],
      ["snapshot", { ...base, snapshotId: entityId(998) }, "snapshot_mismatch"],
      ["compatibility", {
        ...base,
        registration: { ...base.registration, versionCompatible: false },
      }, "version_incompatible"],
      ["registration", {
        ...base,
        registration: { ...base.registration, capabilityRevision: capabilityDigest("0") },
      }, "not_registered"],
      ["digest", { ...base, lockDigest: capabilityDigest("1") }, "source_digest_mismatch"],
    ];
    for (const [name, candidate, reason] of cases) {
      const result = defaultPipeline().run({
        phase: "pre_call",
        requestId: entityId(300 + name.length),
        snapshot: fixture.snapshot,
        conversationMessages: fixture.messages,
        model,
        toolCandidates: [candidate],
      });
      expect(result.request.tools, name).toEqual([]);
      expect(result.receipt.excludedSources, name).toContainEqual(
        expect.objectContaining({ reason }),
      );
    }
  });

  it("fails Snapshot-bound Tool injection closed when materialized lock revisions drift", async () => {
    const fixture = await persistedFixture();
    const forgedLock = structuredClone(fixture.lock);
    forgedLock.definitionSnapshot.name = "Forged without a new revision";
    const forgedDigest = sha256CanonicalJson(JsonValueSchema.parse(forgedLock));
    const snapshot = structuredClone(fixture.snapshot);
    const task = snapshot.tasks.find((source) => source.taskId === forgedLock.taskId)!;
    const source = task.capabilityLocks.find((entry) => entry.lockId === forgedLock.lockId)!;
    source.lockDigest = forgedDigest;
    const result = defaultPipeline().run({
      phase: "pre_call",
      requestId: entityId(400),
      snapshot,
      conversationMessages: fixture.messages,
      model,
      toolCandidates: [{
        ...toolCandidate(snapshot.snapshotId, forgedLock),
        lockDigest: forgedDigest,
      }],
    });
    expect(result.request.tools).toEqual([]);
    expect(result.receipt.excludedSources).toContainEqual(
      expect.objectContaining({ reason: "revision_mismatch" }),
    );
  });

  it("excludes a valid capability record when the current Snapshot did not lock it", async () => {
    const fixture = await persistedFixture();
    const snapshot = structuredClone(fixture.snapshot);
    snapshot.tasks.find((source) => source.taskId === fixture.lock.taskId)!.capabilityLocks = [];
    const result = defaultPipeline().run({
      phase: "pre_call",
      requestId: entityId(401),
      snapshot,
      conversationMessages: fixture.messages,
      model,
      toolCandidates: [toolCandidate(snapshot.snapshotId, fixture.lock)],
    });
    expect(result.request.tools).toEqual([]);
    expect(result.receipt.excludedSources).toContainEqual(
      expect.objectContaining({ reason: "snapshot_mismatch" }),
    );
  });
});

describe("KAF-5.3 Context performance guard", () => {
  it("keeps 500 messages, 32 static segments, and 16 locked Tools below 500ms p95", async () => {
    const fixture = snapshotFixture(
      Array.from({ length: 500 }, (_, index) => userMessage(index + 1, "bounded")),
    );
    const snapshot = structuredClone(fixture.snapshot);
    const baseLock = capabilityLock();
    const locks = Array.from({ length: 16 }, (_, index): TaskCapabilityLock => ({
      ...structuredClone(baseLock),
      lockId: entityId(9_000 + index),
      taskId: entityId(9_100 + index),
    }));
    snapshot.tasks = locks.map((lock, index) => ({
      taskId: lock.taskId,
      stateRevision: 0,
      lastEventSequence: 0,
      checkpointId: entityId(9_200 + index),
      stateDigest: capabilityDigest("2"),
      capabilityLocks: [{
        lockId: lock.lockId,
        capabilityId: lock.definitionSnapshot.capabilityId,
        capabilityRevision: lock.definitionSnapshot.revision,
        registryRevision: lock.registryRevision,
        lockDigest: sha256CanonicalJson(JsonValueSchema.parse(lock)),
      }],
    }));
    snapshot.sourceDigest = sha256CanonicalJson(JsonValueSchema.parse({
      conversation: snapshot.conversation,
      tasks: snapshot.tasks,
      projection: snapshot.projection,
    }));
    const instructions = [instructionSource(snapshot.snapshotId)];
    const skills = Array.from({ length: 15 }, (_, index) =>
      skillSource(snapshot.snapshotId, `skill.performance-${index}`));
    const candidates = locks.map((lock) => toolCandidate(snapshot.snapshotId, lock));
    const pipeline = new ContextPipeline({
      budgetPolicy: new ContextBudgetPolicy({
        modelContextWindow: 1_000_000,
        reservedOutputTokens: 1_024,
        safetyMarginTokens: 512,
        compactionThresholdRatio: 1,
        maxPreviewBytes: 4_096,
      }),
      estimator: new ConservativeTokenEstimator(),
    });
    const input: ContextPipelineInput = {
      phase: "pre_call",
      requestId: entityId(9_999),
      snapshot,
      conversationMessages: fixture.messages,
      model,
      instructions,
      selectedSkills: skills,
      toolCandidates: candidates,
    };
    const first = pipeline.run(input);
    expect(first.request.tools).toHaveLength(16);
    expect(first.receipt.includedSegments.filter((segment) =>
      segment.segmentKind === "static")).toHaveLength(32);

    const harness = new PerformanceHarness({
      environment: {
        hardware: "test-host",
        os: "test-os",
        node: process.version,
        pnpm: "11.11.0",
        sqlite: "not-used",
        dataScale: { messages: 500, staticSegments: 32, tools: 16 },
        parameters: { warmup: 5, samples: 20 },
      },
    });
    harness.add({
      name: "context.kaf53.large",
      category: "pure",
      warmupIterations: 5,
      samples: 20,
      iterationsPerSample: 1,
      operation: () => pipeline.run(input),
    });
    const report = await harness.run();
    expect(report.measurements[0]!.p95Ms).toBeLessThan(500);
  });
});

describe("KAF-5.2 full re-budget and reduction", () => {
  it("re-runs the full mid-turn budget after a 128 KiB Tool Result and keeps a bounded reference", () => {
    const before = snapshotFixture([userMessage(1, "run the tool")]);
    const beforeResult = defaultPipeline().run({
      phase: "pre_call",
      requestId: entityId(500),
      snapshot: before.snapshot,
      conversationMessages: before.messages,
      model,
    });
    const after = snapshotFixture([
      userMessage(1, "run the tool"),
      toolMessage(2, "z".repeat(128 * 1_024)),
    ]);
    const afterResult = defaultPipeline().run({
      phase: "mid_turn",
      requestId: entityId(501),
      snapshot: after.snapshot,
      conversationMessages: after.messages,
      model,
    });
    expect(afterResult.receipt.phase).toBe("mid_turn");
    expect(afterResult.receipt.initialEstimatedInputTokens)
      .toBeGreaterThan(beforeResult.receipt.finalEstimatedInputTokens);
    expect(afterResult.receipt.finalEstimatedInputTokens)
      .toBeLessThanOrEqual(afterResult.receipt.availableInputTokens);
    expect(afterResult.request.artifacts[0]).toMatchObject({
      originalBytes: 128 * 1_024,
      previewBytes: 4_096,
      truncated: true,
    });
    expect(afterResult.receipt.reductionApplied).toBe(true);
  });

  it("reduces oldest conversation turns without splitting a Tool call/result pair", () => {
    const messages = [
      userMessage(1, "old ".repeat(1_000)),
      assistantToolCallMessage(2),
      toolMessage(3, "paired result"),
      userMessage(4, "latest user request"),
    ];
    const fixture = snapshotFixture(messages);
    const toolCallBatches: readonly ToolCallBatchEvidence[] = [{
      batch: {
        schemaVersion: "v1alpha1",
        batchId: entityId(620),
        sessionId: fixture.snapshot.sessionId,
        taskId: entityId(601),
        runId: entityId(621),
        assistantMessageId: fixture.messages[1]!.envelope.messageId,
        assistantMessageSequence: 2,
        assistantMessageDigest: fixture.messages[1]!.envelope.messageDigest,
        batchDigest: capabilityDigest("4"),
        callCount: 1,
        createdAt: turnAt.created,
      },
      dispositions: [{
        schemaVersion: "v1alpha1",
        batchId: entityId(620),
        toolCallId: entityId(610),
        actionId: entityId(611),
        ordinal: 0,
        disposition: "result_committed",
        revision: 2,
        effectAttemptId: entityId(622),
        resultMessageId: fixture.messages[2]!.envelope.messageId,
        resultDigest: capabilityDigest("3"),
        updatedAt: turnAt.created,
      }],
    }];
    const result = defaultPipeline().run({
      phase: "mid_turn",
      requestId: entityId(502),
      snapshot: fixture.snapshot,
      conversationMessages: fixture.messages,
      toolCallBatches,
      model,
    });
    expect(result.receipt.reducedSegmentIds).toContain(
      `message:${fixture.messages[0]!.envelope.messageId}`,
    );
    const roles = result.request.messages.map((message) => message.role);
    expect(roles).toEqual(["user"]);
    expect(result.receipt.reducedSegmentIds).toEqual(expect.arrayContaining([
      `message:${fixture.messages[1]!.envelope.messageId}`,
      `message:${fixture.messages[2]!.envelope.messageId}`,
    ]));
    expect(result.receipt.finalEstimatedInputTokens)
      .toBeLessThanOrEqual(result.receipt.availableInputTokens);
  });

  it("fails closed when required static context alone cannot fit the available input budget", () => {
    const fixture = snapshotFixture([userMessage(1, "latest")]);
    expect(() => defaultPipeline().run({
      phase: "pre_call",
      requestId: entityId(503),
      snapshot: fixture.snapshot,
      conversationMessages: fixture.messages,
      model,
      instructions: [{
        ...instructionSource(fixture.snapshot.snapshotId),
        content: "required ".repeat(2_000),
        contentDigest: digestText("required ".repeat(2_000)),
      }],
    })).toThrow(ContextBudgetExceededError);
  });
});

async function persistedFixture(): Promise<{
  messages: readonly ConversationMessage[];
  snapshot: TurnContextSnapshot;
  lock: TaskCapabilityLock;
}> {
  const clock = new FakeClock(turnAt.created);
  const conversation = new InMemoryConversationPersistence({ clock });
  const tasks = new InMemoryTaskPersistence(clock);
  await tasks.start();
  await conversation.start();
  cleanups.push(async () => {
    await conversation.stop();
    await tasks.stop();
  });
  const messages = await seedTurnFixture(conversation, tasks);
  const lock = capabilityLock({ taskId: turnIds.task1 });
  const committed = await tasks.commitTaskCapabilityLock(lock);
  if (!committed.ok) throw new Error(committed.error.message);
  const snapshot = await new TurnSnapshotBuilder({
    conversationPersistence: conversation,
    taskPersistence: tasks,
  }).build({
    snapshotId: turnIds.snapshot,
    sessionId: turnIds.session,
    createdAt: turnAt.snapshot,
  });
  return { messages, snapshot, lock: committed.value };
}

function instructionSource(snapshotId: string): MaterializedInstructionSource {
  const content = "Keep answers deterministic.";
  return {
    snapshotId,
    sourceId: "agent.system",
    revision: "agent.system.v1",
    contentDigest: digestText(content),
    content,
    selected: true,
    authorized: true,
  };
}

function skillSource(snapshotId: string, skillId: string): SelectedSkillContext {
  const content = `Materialized instructions for ${skillId}.`;
  return {
    snapshotId,
    skillId,
    revision: `${skillId}.v1`,
    contentDigest: digestText(content),
    content,
    selected: true,
    authorized: true,
  };
}

function toolCandidate(snapshotId: string, lock: TaskCapabilityLock): ToolSchemaCandidate {
  return {
    snapshotId,
    selected: true,
    authorization: {
      outcome: "allowed",
      decisionDigest: capabilityDigest("d"),
    },
    lockDigest: sha256CanonicalJson(JsonValueSchema.parse(lock)),
    lock,
    registration: {
      registryRevision: lock.registryRevision,
      capabilityRevision: lock.definitionSnapshot.revision,
      bindingRevision: lock.bindingSnapshot.revision,
      adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
      versionCompatible: true,
    },
  };
}

function snapshotFixture(
  messageValues: readonly ProviderNeutralMessage[],
): { messages: readonly ConversationMessage[]; snapshot: TurnContextSnapshot } {
  const sessionId = entityId(600);
  const taskId = entityId(601);
  const messages = messageValues.map((message, index): ConversationMessage => ({
    envelope: {
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      messageId: entityId(700 + index),
      sessionId,
      sequence: index + 1,
      messageSchemaVersion: MODEL_PROTOCOL_VERSION,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
      ...(message.role === "tool" || message.role === "assistant" && message.toolCalls.length > 0
        ? { taskId }
        : {}),
      createdAt: new Date(Date.parse(turnAt.created) + index * 1_000).toISOString(),
    },
    message,
  }));
  const tasks = messageValues.some((message) =>
    message.role === "tool" || message.role === "assistant" && message.toolCalls.length > 0)
    ? [{
      taskId,
      stateRevision: 0,
      lastEventSequence: 0,
      checkpointId: entityId(602),
      stateDigest: capabilityDigest("2"),
      capabilityLocks: [],
    }]
    : [];
  const conversation = {
    sessionId,
    messageSequence: messages.length,
    contextRevision: 0,
    ...(messages.length === 0 ? {} : {
      messageStartSequence: 1,
      messageEndSequence: messages.length,
    }),
    messageDigest: sha256CanonicalJson(JsonValueSchema.parse(messages)),
  };
  const projection = messages.map((message, index) => ({
    type: "conversation_message" as const,
    order: index,
    sessionId,
    messageId: message.envelope.messageId,
    messageSequence: message.envelope.sequence,
    messageDigest: message.envelope.messageDigest,
  }));
  const snapshotMaterial = { conversation, tasks, projection };
  return {
    messages,
    snapshot: {
      schemaVersion: CONTEXT_SCHEMA_VERSION,
      snapshotId: entityId(603),
      sessionId,
      conversation,
      tasks,
      projection,
      sourceDigest: sha256CanonicalJson(JsonValueSchema.parse(snapshotMaterial)),
      createdAt: turnAt.snapshot,
    },
  };
}

function userMessage(sequence: number, text: string): ProviderNeutralMessage {
  return {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "user",
    content: [{ type: "text", text: `${sequence}:${text}` }],
  };
}

function assistantToolCallMessage(_sequence: number): ProviderNeutralMessage {
  return {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "assistant",
    content: [],
    toolCalls: [{
      toolCallId: entityId(610),
      taskId: entityId(601),
      actionId: entityId(611),
      capabilityId: "tool.echo",
      arguments: { text: "hello" },
    }],
  };
}

function toolMessage(_sequence: number, text: string): ProviderNeutralMessage {
  return {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "tool",
    toolCallId: entityId(610),
    taskId: entityId(601),
    actionId: entityId(611),
    observationId: entityId(612),
    outcome: "succeeded",
    resultDigest: capabilityDigest("3"),
    content: [{ type: "text", text }],
  };
}

function digestText(value: string): string {
  return sha256CanonicalJson(JsonValueSchema.parse(value));
}
