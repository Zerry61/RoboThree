import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CompactionCoordinator,
  FakeClock,
  FakeIdGenerator,
  InMemoryConversationPersistence,
  type CompactionExecutionBindingSeed,
  type CompactionSummarizer,
} from "../src/index.js";
import {
  conversationAt,
  conversationIds,
  conversationMessage,
  initialSessionHead,
} from "./conversation-persistence.fixtures.js";

const childScript = fileURLToPath(new URL("./fixtures/arh23-controlled-provider-child.mjs", import.meta.url));
const children = new Set<ChildProcess>();
const executionBinding: CompactionExecutionBindingSeed = {
  taskId: "019f8d10-0000-7000-8000-000000000001",
  runtimeSelectionId: "019f8d10-0000-7000-8000-000000000002",
  runtimeSelectionDigest: `sha256:${"1".repeat(64)}`,
  modelLockId: "019f8d10-0000-7000-8000-000000000003",
  modelCapabilityId: "model.arh23-process-provider",
  modelLockDigest: `sha256:${"2".repeat(64)}`,
  registryRevision: `sha256:${"3".repeat(64)}`,
  adapterDescriptorId: "adapter.model.arh23-process-provider",
  adapterDescriptorRevision: `sha256:${"4".repeat(64)}`,
  externalTargetDigest: `sha256:${"5".repeat(64)}`,
  summarizerPromptRevision: `sha256:${"6".repeat(64)}`,
};

describe("ARH-2.3 controlled Provider recovery modes", () => {
  let persistence: InMemoryConversationPersistence;

  beforeEach(async () => {
    persistence = new InMemoryConversationPersistence({ clock: new FakeClock(conversationAt.created) });
    await persistence.start();
    await persistence.createSession(initialSessionHead());
    await persistence.appendMessage({
      expectedMessageSequence: 0,
      message: conversationMessage(1),
      updatedAt: conversationAt.message1,
    });
    await persistence.appendMessage({
      expectedMessageSequence: 1,
      message: conversationMessage(2),
      updatedAt: conversationAt.message2,
    });
  });

  afterEach(async () => {
    await persistence.stop();
    for (const child of children) child.kill("SIGTERM");
    children.clear();
  });

  it("W3 resumes the same pending Job after accepted_without_output", async () => {
    const provider = await ProcessCompactionSummarizer.start("accepted_without_output");
    const coordinator = createCoordinator(provider);
    await expect(coordinator.compact({
      sessionId: conversationIds.session,
      sourceStartSequence: 1,
      sourceEndSequence: 2,
      executionBinding,
    })).rejects.toMatchObject({
      code: "model_stream_resume_unavailable",
      outputStarted: false,
    });
    const [pending] = await persistence.listPendingCompactionJobs();
    expect(pending).toBeDefined();
    const recovered = await coordinator.recoverSessionPending(conversationIds.session);
    expect(recovered).toMatchObject({
      status: "completed",
      record: { compactionJobId: pending?.compactionJobId },
    });
    expect(provider.callCount).toBe(2);
  });

  for (const mode of ["partial_output_unreplayable", "full_output_unreplayable"] as const) {
    it(`W4 fails closed for ${mode}`, async () => {
      const provider = await ProcessCompactionSummarizer.start(mode);
      const result = await createCoordinator(provider).compact({
        sessionId: conversationIds.session,
        sourceStartSequence: 1,
        sourceEndSequence: 2,
        executionBinding,
      });
      expect(result).toMatchObject({
        status: "failed",
        job: { failureReason: "recovery_exhausted" },
      });
      expect(provider.callCount).toBe(1);
    });
  }

  function createCoordinator(summarizer: CompactionSummarizer) {
    return new CompactionCoordinator({
      persistence,
      summarizer,
      clock: new FakeClock(conversationAt.committed),
      idGenerator: new FakeIdGenerator(ids()),
    });
  }
});

class ProcessCompactionSummarizer implements CompactionSummarizer {
  public callCount = 0;
  readonly #child: ChildProcess;
  #requestId = 0;

  private constructor(child: ChildProcess) {
    this.#child = child;
  }

  static async start(mode: string): Promise<ProcessCompactionSummarizer> {
    const child = fork(childScript, [mode], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: { PATH: process.env.PATH },
    });
    children.add(child);
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.on("message", (message: unknown) => {
        if (isRecord(message) && message.type === "ready") resolve();
      });
    });
    return new ProcessCompactionSummarizer(child);
  }

  async summarize() {
    this.callCount += 1;
    this.#requestId += 1;
    const requestId = String(this.#requestId);
    const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Controlled Provider timed out")), 5_000);
      const listener = (message: unknown) => {
        if (!isRecord(message) || message.type !== "response" || message.requestId !== requestId) return;
        clearTimeout(timeout);
        this.#child.off("message", listener);
        resolve(message);
      };
      this.#child.on("message", listener);
      this.#child.send({ type: "summarize", requestId });
    });
    if (isRecord(response.error)) {
      throw Object.assign(new Error("Controlled Provider stream unavailable"), response.error);
    }
    if (!isRecord(response.summary)) throw new Error("Controlled Provider returned no summary");
    return response.summary as Awaited<ReturnType<CompactionSummarizer["summarize"]>>;
  }
}

function ids(): readonly string[] {
  return Array.from({ length: 40 }, (_, index) =>
    `019f8d10-0000-7000-8001-${String(index + 100).padStart(12, "0")}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
