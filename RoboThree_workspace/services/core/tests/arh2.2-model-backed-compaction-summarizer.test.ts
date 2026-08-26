import type {
  ModelRequest,
  ModelStreamEvent,
  TaskCapabilityLock,
  TaskRuntimeSelection,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  CodeOwnedApplicationLocaleSource,
  ConservativeTokenEstimator,
  DynamicRequestFactsMaterializer,
  DynamicRequestFactsRuntime,
  FakeClock,
  InMemoryConversationPersistence,
  ModelBackedCompactionSummarizer,
  sha256CanonicalJson,
} from "../src/index.js";
import type { ModelProvider, ModelProviderInvocation } from "../src/index.js";
import {
  conversationAt,
  conversationMessage,
  requestCompactionInput,
} from "./conversation-persistence.fixtures.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const id = (value: number) => `019f8c00-0000-7000-8000-${String(value).padStart(12, "0")}`;

describe("ARH-2.2 Model-backed Compaction Summarizer", () => {
  it("persists logical identity before the Provider call and commits only complete reduced output", async () => {
    const links = new InMemoryConversationPersistence({ clock: new FakeClock(conversationAt.created) });
    await links.start();
    const provider = providerWith([event("started"), { type: "text_delta", delta: "short summary" }, {
      type: "completed",
      finishReason: "stop",
    }], async () => {
      expect(await links.loadByCompactionJobId(requestCompactionInput().job.compactionJobId))
        .toBeDefined();
    });
    const summarizer = summarizerFixture(provider, links);
    const summary = await summarizer.summarize(summaryInput(), id(1), new AbortController().signal);

    expect(summary.summary).toBe("short summary");
    expect(summary.estimatedTokensAfter).toBeLessThan(summary.estimatedTokensBefore);
    expect(summary.invocationCommit).toMatchObject({
      compactionJobId: requestCompactionInput().job.compactionJobId,
    });
    expect((await links.loadByCompactionJobId(requestCompactionInput().job.compactionJobId))?.outputStartedAt)
      .toBe(conversationAt.committed);
    await links.stop();
  });

  it.each([
    {
      name: "Tool Call",
      events: [event("started"), {
        type: "tool_call" as const,
        call: {
          toolCallId: id(11),
          taskId: id(12),
          actionId: id(13),
          capabilityId: "tool.forbidden",
          arguments: {},
        },
        }, { type: "completed" as const, finishReason: "tool_calls" }],
    },
    {
      name: "blank final text",
      events: [event("started"), { type: "completed" as const, finishReason: "stop" }],
    },
  ])("fails closed on $name without producing a summary commit", async ({ events }) => {
    const links = new InMemoryConversationPersistence({ clock: new FakeClock(conversationAt.created) });
    await links.start();
    await expect(summarizerFixture(providerWith(events), links).summarize(
      summaryInput(),
      id(2),
      new AbortController().signal,
    )).rejects.toThrow();
    expect((await links.loadByCompactionJobId(requestCompactionInput().job.compactionJobId))?.summaryCommittedAt)
      .toBeUndefined();
    await links.stop();
  });

  it("binds one request-scoped System Message and persists exact v2 Dynamic Request Facts", async () => {
    const links = new InMemoryConversationPersistence({ clock: new FakeClock(conversationAt.created) });
    await links.start();
    let providerInvocation: ModelProviderInvocation | undefined;
    const provider: ModelProvider = {
      adapterKind: "model_provider",
      adapterDescriptorId: "adapter.model.summary.dynamic-facts",
      adapterDescriptorRevision: digest("7"),
      loadDynamicRequestFacts: async () => undefined,
      async *stream(request, _signal, invocation) {
        providerInvocation = invocation;
        const systemMessages = request.messages.filter((message) => message.role === "system");
        expect(systemMessages).toHaveLength(1);
        expect(systemMessages[0]?.content).toEqual([expect.objectContaining({
          type: "text",
          text: expect.stringContaining("不授予任何权限"),
        })]);
        yield event("started");
        yield { type: "text_delta", delta: "short summary" };
        yield { type: "completed", finishReason: "stop" };
      },
    };
    const dynamicRequestFactsRuntime = new DynamicRequestFactsRuntime(
      new DynamicRequestFactsMaterializer({
        clock: new FakeClock(conversationAt.created),
        locale: new CodeOwnedApplicationLocaleSource(),
        timezone: {
          requireCurrent: () => ({
            timezone: "Asia/Shanghai",
            sourceRevision: digest("8"),
          }),
        },
      }),
    );
    const summarizer = summarizerFixture(provider, links, dynamicRequestFactsRuntime);

    await summarizer.summarize(summaryInput(), id(3), new AbortController().signal);

    expect(providerInvocation?.dynamicContext?.facts).toMatchObject({
      invocationKind: "compaction",
      timezone: "Asia/Shanghai",
    });
    const link = await links.loadByCompactionJobId(requestCompactionInput().job.compactionJobId);
    expect(link).toMatchObject({
      schemaVersion: "v2",
      dynamicRequestFacts: providerInvocation?.dynamicContext?.facts,
      contextAssemblyReceiptDigest:
        providerInvocation?.dynamicContext?.contextAssemblyReceiptDigest,
    });
    await links.stop();
  });
});

function summarizerFixture(
  provider: ModelProvider,
  links: InMemoryConversationPersistence,
  dynamicRequestFactsRuntime?: DynamicRequestFactsRuntime,
) {
  const modelLock = {
    lockId: id(20),
    definitionSnapshot: { capabilityId: "model.summary", revision: digest("1") },
  } as TaskCapabilityLock;
  return new ModelBackedCompactionSummarizer({
    provider,
    modelLock,
    links,
    estimator: new ConservativeTokenEstimator(),
    now: () => conversationAt.committed,
    ...(dynamicRequestFactsRuntime === undefined ? {} : { dynamicRequestFactsRuntime }),
    invocation: async (request): Promise<Extract<ModelProviderInvocation, { purpose: "compaction_summary" }>> => ({
      purpose: "compaction_summary",
      compactionJobId: requestCompactionInput().job.compactionJobId,
      executionBindingDigest: requestCompactionInput().executionBinding.bindingDigest,
      taskId: id(21),
      runId: id(22),
      stepId: id(23),
      actionId: id(24),
      round: 1,
      runtimeSelection: { selectionDigest: digest("2") } as TaskRuntimeSelection,
      modelLock,
      modelRequest: request,
      deadlineAt: "2026-08-12T00:05:00.000Z",
      externalTarget: "local:summary",
      dataCategories: ["user_text"],
      dataScopeDigest: digest("3"),
      admission: {
        type: "user_confirmed",
        confirmationId: id(25),
        scopeDigest: digest("4"),
        confirmationDigest: digest("5"),
      },
    }),
  });
}

function summaryInput() {
  const request = requestCompactionInput();
  return {
    job: request.job,
    rawExtension: [conversationMessage(1), conversationMessage(2)],
    fullSourceRangeEvidence: {
      sourceStartSequence: request.job.sourceStartSequence,
      sourceEndSequence: request.job.sourceEndSequence,
      sourceDigest: request.job.sourceDigest,
    },
  };
}

function providerWith(
  events: readonly ModelStreamEvent[],
  beforeFirstEvent: () => Promise<void> = async () => {},
): ModelProvider {
  return {
    adapterKind: "model_provider",
    adapterDescriptorId: "adapter.model.summary",
    adapterDescriptorRevision: digest("6"),
    async *stream(request: ModelRequest) {
      expect(request.tools).toEqual([]);
      expect(request.requestDigest).toBe(sha256CanonicalJson({
        schemaVersion: request.schemaVersion,
        requestId: request.requestId,
        snapshotId: request.snapshotId,
        contextSourceDigest: request.contextSourceDigest,
        model: request.model,
        messages: request.messages,
        tools: request.tools,
        artifacts: request.artifacts,
        maxOutputTokens: request.maxOutputTokens,
      }));
      await beforeFirstEvent();
      for (const value of events) yield value;
    },
  };
}

const event = (type: "started"): ModelStreamEvent => ({ type });
