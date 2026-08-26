import process from "node:process";

import {
  CONVERSATION_SCHEMA_VERSION,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
} from "../../../../packages/contracts/dist/index.js";
import {
  CompactedContextViewBuilder,
  CompactionCoordinator,
  FakeClock,
  FakeCompactionSummarizer,
  SqliteConversationPersistence,
  sha256CanonicalJson,
} from "../../dist/index.js";

const [command, databasePath, ownerOrdinal] = process.argv.slice(2);
const sessionId = "019f8d00-0000-7000-8000-000000000001";
const taskId = "019f8d00-0000-7000-8000-000000000002";
const now = "2026-08-13T02:00:00.000Z";
const executionBinding = Object.freeze({
  taskId,
  runtimeSelectionId: uuid(11),
  runtimeSelectionDigest: `sha256:${"1".repeat(64)}`,
  modelLockId: uuid(12),
  modelCapabilityId: "model.arh23-controlled",
  modelLockDigest: `sha256:${"2".repeat(64)}`,
  registryRevision: `sha256:${"3".repeat(64)}`,
  adapterDescriptorId: "adapter.model.arh23-controlled",
  adapterDescriptorRevision: `sha256:${"4".repeat(64)}`,
  externalTargetDigest: `sha256:${"5".repeat(64)}`,
  summarizerPromptRevision: `sha256:${"6".repeat(64)}`,
});
const reasoningExecutionBinding = Object.freeze({
  ...executionBinding,
  reasoningModeLockId: uuid(13),
  reasoningModeLockDigest: `sha256:${"7".repeat(64)}`,
  modelRequestProtocolVersion: "v1alpha2",
});
const selectedExecutionBinding = command.startsWith("dfi5-v2-")
  ? reasoningExecutionBinding
  : executionBinding;

class DeterministicIds {
  #value;
  constructor(start) {
    this.#value = start;
  }
  next() {
    this.#value += 1;
    return uuid(this.#value);
  }
}

const clock = new FakeClock(now);
const ids = new DeterministicIds(
  command === "recover" || command === "recover-gated" || command === "dfi5-v2-recover"
    ? 800 + Number(ownerOrdinal ?? 0) * 100
    : command === "rolling"
      ? 900
      : 700,
);
const persistencePoint = command === "w2" || command === "dfi5-v2-w2"
  ? "request_compaction.after_commit"
  : command === "w5"
    ? "commit_compaction.after_commit"
    : undefined;
const persistence = new SqliteConversationPersistence({
  databasePath,
  clock,
  ...(persistencePoint === undefined
    ? {}
    : {
      faultInjector: (point) => {
        if (point === persistencePoint) barrier(point);
      },
    }),
});

try {
  await persistence.start();
  await seedConversation(persistence);
  if (command === "w1") barrier("compaction.admission_authorized_before_request");
  if (command === "inspect") {
    await reportState(persistence, "inspected");
  } else if (command === "recover-gated") {
    process.send?.({ type: "ready" });
    await waitForRecoveryRelease();
    const recovered = await coordinator(persistence).recoverPending();
    await reportState(persistence, "recovered", {
      recoveryStatuses: recovered.map((entry) => entry.status),
      recoveryErrorCodes: recovered.map((entry) => entry.errorCode ?? null),
    });
  } else if (command === "recover" || command === "dfi5-v2-recover") {
    const recovered = await coordinator(persistence).recoverPending();
    await reportState(persistence, "recovered", {
      recoveryStatuses: recovered.map((entry) => entry.status),
      recoveryErrorCodes: recovered.map((entry) => entry.errorCode ?? null),
    });
  } else if (command === "w7-main") {
    await appendTerminalAssistantOnce(persistence);
    await reportState(persistence, "main_committed");
  } else if (command === "rolling") {
    await appendRawExtension(persistence);
    const result = await coordinator(persistence).compact({
      sessionId,
      sourceStartSequence: 1,
      sourceEndSequence: 4,
      executionBinding,
    });
    await reportState(persistence, "rolling_completed", { resultStatus: result.status });
  } else if (
    command === "compact"
    || command === "dfi5-v2-compact"
    || command === "w2"
    || command === "dfi5-v2-w2"
    || command === "w4"
    || command === "w5"
    || command === "w7"
  ) {
    const result = await coordinator(
      persistence,
      command === "w4" ? "compaction.summary_obtained_before_commit" : undefined,
    ).compact({
      sessionId,
      sourceStartSequence: 1,
      sourceEndSequence: 2,
      executionBinding: selectedExecutionBinding,
    });
    if (command === "w7") barrier("compaction.context_prepared_before_model_invocation");
    await reportState(persistence, "completed", { resultStatus: result.status });
  } else if (command !== "w1") {
    throw new Error(`Unsupported ARH-2.3 child command: ${command}`);
  }
} finally {
  await persistence.stop();
}

function coordinator(store, faultPoint) {
  return new CompactionCoordinator({
    persistence: store,
    summarizer: new FakeCompactionSummarizer({
      summary: "A bounded summary of the immutable conversation prefix.",
      summarySchemaVersion: "v1alpha1",
      summarizerModelRef: "model.arh23-controlled",
      summarizerPromptRevision: executionBinding.summarizerPromptRevision,
      estimatedTokensBefore: 480,
      estimatedTokensAfter: 48,
    }),
    clock,
    idGenerator: ids,
    ...(faultPoint === undefined
      ? {}
      : { faultInjector: (point) => point === faultPoint && barrier(point) }),
  });
}

async function seedConversation(store) {
  if (await store.loadSession(sessionId) !== undefined) return;
  await store.createSession({
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    sessionId,
    messageSequence: 0,
    sessionEventSequence: 0,
    contextRevision: 0,
    createdAt: now,
    updatedAt: now,
  });
  for (const [sequence, role] of [[1, "user"], [2, "assistant"]]) {
    const message = role === "user"
      ? {
        schemaVersion: MODEL_PROTOCOL_VERSION,
        role,
        content: [{ type: "text", text: "semantic-seed-user-request" }],
      }
      : {
        schemaVersion: MODEL_PROTOCOL_VERSION,
        role,
        content: [{ type: "text", text: "semantic-seed-assistant-response" }],
        toolCalls: [],
      };
    await store.appendMessage({
      expectedMessageSequence: sequence - 1,
      message: {
        envelope: {
          schemaVersion: CONVERSATION_SCHEMA_VERSION,
          messageId: uuid(100 + sequence),
          sessionId,
          sequence,
          messageSchemaVersion: MODEL_PROTOCOL_VERSION,
          messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
          createdAt: now,
        },
        message,
      },
      updatedAt: now,
    });
  }
}

async function appendRawExtension(store) {
  const head = await store.loadSession(sessionId);
  if (head.messageSequence >= 4) return;
  for (let sequence = head.messageSequence + 1; sequence <= 4; sequence += 1) {
    const role = sequence % 2 === 1 ? "user" : "assistant";
    const message = role === "user"
      ? {
        schemaVersion: MODEL_PROTOCOL_VERSION,
        role,
        content: [{ type: "text", text: `rolling-extension-${sequence}` }],
      }
      : {
        schemaVersion: MODEL_PROTOCOL_VERSION,
        role,
        content: [{ type: "text", text: `rolling-extension-${sequence}` }],
        toolCalls: [],
      };
    await store.appendMessage({
      expectedMessageSequence: sequence - 1,
      message: {
        envelope: {
          schemaVersion: CONVERSATION_SCHEMA_VERSION,
          messageId: uuid(100 + sequence),
          sessionId,
          sequence,
          messageSchemaVersion: MODEL_PROTOCOL_VERSION,
          messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
          createdAt: now,
        },
        message,
      },
      updatedAt: now,
    });
  }
}

async function appendTerminalAssistantOnce(store) {
  const existing = await store.loadMessageRange(sessionId, 1, Number.MAX_SAFE_INTEGER);
  if (existing.some((entry) => entry.envelope.taskId === taskId)) return;
  const head = await store.loadSession(sessionId);
  const message = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "assistant",
    content: [{ type: "text", text: "semantic-terminal-after-compaction" }],
    toolCalls: [],
  };
  await store.appendMessage({
    expectedMessageSequence: head.messageSequence,
    message: {
      envelope: {
        schemaVersion: CONVERSATION_SCHEMA_VERSION,
        messageId: uuid(501),
        sessionId,
        sequence: head.messageSequence + 1,
        taskId,
        messageSchemaVersion: MODEL_PROTOCOL_VERSION,
        messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
        createdAt: now,
      },
      message,
    },
    updatedAt: now,
  });
}

async function reportState(store, status, extra = {}) {
  const head = await store.loadSession(sessionId);
  const pending = await store.listPendingCompactionJobs();
  const view = await new CompactedContextViewBuilder(store).build(sessionId);
  const records = head.activeCompactionId === undefined
    ? []
    : [await store.loadCompactionRecord(head.activeCompactionId)];
  const messages = await store.loadMessageRange(sessionId, 1, Number.MAX_SAFE_INTEGER);
  const bindingJobId = pending[0]?.compactionJobId ?? records[0]?.compactionJobId;
  const executionBindingFact = bindingJobId === undefined
    ? undefined
    : await store.loadCompactionExecutionBinding(bindingJobId);
  const semanticDigest = sha256CanonicalJson(JsonValueSchema.parse({
    summary: view.summary ?? null,
    rawTail: view.rawTail.map((entry) => entry.message),
    sourceEvidence: records.filter(Boolean).map((record) => ({
      sourceStartSequence: record.sourceStartSequence,
      sourceEndSequence: record.sourceEndSequence,
      sourceDigest: record.sourceDigest,
      summaryDigest: sha256CanonicalJson(JsonValueSchema.parse(record.summary)),
    })),
  }));
  process.send?.({
    type: "result",
    result: {
      status,
      contextRevision: head.contextRevision,
      pendingCount: pending.length,
      activeCompaction: head.activeCompactionId !== undefined,
      assistantCommitCount: messages.filter((entry) => entry.envelope.taskId === taskId).length,
      processId: process.pid,
      executionBindingSchemaVersion: executionBindingFact?.schemaVersion,
      executionBindingDigest: executionBindingFact?.bindingDigest,
      reasoningModeLockId: executionBindingFact?.reasoningModeLockId,
      reasoningModeLockDigest: executionBindingFact?.reasoningModeLockDigest,
      semanticDigest,
      ...extra,
    },
  });
}

function barrier(point) {
  process.send?.({ type: "barrier", point });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}

function waitForRecoveryRelease() {
  return new Promise((resolve, reject) => {
    const onDisconnect = () => reject(new Error("ARH-2.3 recovery owner disconnected before release"));
    const onMessage = (message) => {
      if (message?.type !== "recover") return;
      process.off("disconnect", onDisconnect);
      process.off("message", onMessage);
      resolve();
    };
    process.once("disconnect", onDisconnect);
    process.on("message", onMessage);
  });
}

function uuid(value) {
  return `019f8d00-0000-7000-8001-${String(value).padStart(12, "0")}`;
}
