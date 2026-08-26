import {
  JsonObjectSchema,
  MODEL_PROTOCOL_VERSION,
  type ModelRequest,
  type ModelStreamEvent,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  AgentLoopCoordinator,
  DurableAgentConversationWriter,
  FakeClock,
  FakeIdGenerator,
  FakeAgentToolCallExecutor,
  InMemoryConversationPersistence,
  ScriptedModelProvider,
  sha256CanonicalJson,
} from "../src/index.js";
import { initialSessionHead } from "./conversation-persistence.fixtures.js";

const call = {
  toolCallId: "019f7d00-0000-7000-8000-000000000001",
  taskId: "019f7d00-0000-7000-8000-000000000002",
  actionId: "019f7d00-0000-7000-8000-000000000003",
  capabilityId: "tool.echo",
  arguments: { value: "hello" },
};

describe("AgentLoopCoordinator", () => {
  it("runs model to tool observation to next model and produces a stable timeline", async () => {
    const model = new ScriptedModelProvider([
      [
        { type: "started" },
        { type: "tool_call", call },
        { type: "completed", finishReason: "tool_calls" },
      ],
      [
        { type: "started" },
        { type: "text_delta", delta: "done" },
        { type: "completed", finishReason: "stop" },
      ],
    ]);
    const tools = new FakeAgentToolCallExecutor();
    const loop = new AgentLoopCoordinator({ model, tools });

    const result = await loop.run({
      buildRequest: (round, prior) => request(round, prior.length),
    });

    expect(result).toMatchObject({
      status: "completed",
      rounds: 2,
      text: "done",
    });
    expect(tools.calls).toEqual([call]);
    expect(model.requests).toHaveLength(2);
    expect(result.timeline.map((event) => event.type)).toEqual([
      "model_requested",
      "tool_requested",
      "tool_observed",
      "model_requested",
      "model_text",
      "completed",
    ]);

    const digests = [result.timelineDigest];
    for (let replay = 1; replay < 5; replay += 1) {
      const repeated = await new AgentLoopCoordinator({
        model: new ScriptedModelProvider([
          [
            { type: "started" },
            { type: "tool_call", call },
            { type: "completed", finishReason: "tool_calls" },
          ],
          [
            { type: "started" },
            { type: "text_delta", delta: "done" },
            { type: "completed", finishReason: "stop" },
          ],
        ]),
        tools: new FakeAgentToolCallExecutor(),
      }).run({ buildRequest: (round, prior) => request(round, prior.length) });
      digests.push(repeated.timelineDigest);
    }
    expect(new Set(digests).size).toBe(1);
  });

  it("fails closed at the configured tool loop limit", async () => {
    const model = new ScriptedModelProvider([[
      { type: "started" },
      { type: "tool_call", call },
      { type: "completed", finishReason: "tool_calls" },
    ]]);
    const result = await new AgentLoopCoordinator({
      model,
      tools: new FakeAgentToolCallExecutor(),
      maxToolCalls: 0,
    }).run({ buildRequest: () => request(1, 0) });
    expect(result).toMatchObject({
      status: "failed",
      error: { code: "agent.tool_loop_limit" },
    });
  });

  it("uses the exact per-Task Model Provider instead of the bootstrap default", async () => {
    const bootstrap = new ScriptedModelProvider([[
      { type: "started" },
      { type: "text_delta", delta: "wrong" },
      { type: "completed", finishReason: "stop" },
    ]]);
    const locked = new ScriptedModelProvider([[
      { type: "started" },
      { type: "text_delta", delta: "locked" },
      { type: "completed", finishReason: "stop" },
    ]]);
    const result = await new AgentLoopCoordinator({
      model: bootstrap,
      tools: new FakeAgentToolCallExecutor(),
    }).run({
      model: locked,
      buildRequest: () => request(1, 0),
    });

    expect(result).toMatchObject({ status: "completed", text: "locked" });
    expect(bootstrap.requests).toHaveLength(0);
    expect(locked.requests).toHaveLength(1);
  });

  it("propagates cancellation before dispatching a model request", async () => {
    const controller = new AbortController();
    controller.abort();
    const model = new ScriptedModelProvider([[
      { type: "started" },
      { type: "completed", finishReason: "stop" },
    ]]);
    const result = await new AgentLoopCoordinator({
      model,
      tools: new FakeAgentToolCallExecutor(),
    }).run({ buildRequest: () => request(1, 0), signal: controller.signal });
    expect(result).toMatchObject({ status: "cancelled", rounds: 0 });
    expect(model.requests).toHaveLength(0);
  });

  it("keeps a fixed 50-round Tool loop bounded and completes on the next model turn", async () => {
    const toolScripts = Array.from({ length: 50 }, () => [
      { type: "started" as const },
      { type: "tool_call" as const, call },
      { type: "completed" as const, finishReason: "tool_calls" },
    ]);
    const digests: string[] = [];
    for (let replay = 0; replay < 5; replay += 1) {
      const model = new ScriptedModelProvider([
        ...toolScripts,
        [
          { type: "started" },
          { type: "text_delta", delta: "bounded" },
          { type: "completed", finishReason: "stop" },
        ],
      ]);
      const result = await new AgentLoopCoordinator({
        model,
        tools: new FakeAgentToolCallExecutor(),
        maxModelRounds: 51,
        maxToolCalls: 50,
      }).run({ buildRequest: (round, prior) => request(round, prior.length) });
      expect(result).toMatchObject({
        status: "completed",
        rounds: 51,
        text: "bounded",
      });
      digests.push(result.timelineDigest);
    }
    expect(new Set(digests).size).toBe(1);
  });

  it("repeats the model-stream-to-completion chain 5 times with one timeline digest", async () => {
    const digests: string[] = [];
    for (let replay = 0; replay < 5; replay += 1) {
      const result = await new AgentLoopCoordinator({
        model: new ScriptedModelProvider([[
          { type: "started" },
          { type: "text_delta", delta: "complete" },
          { type: "completed", finishReason: "stop" },
        ]]),
        tools: new FakeAgentToolCallExecutor(),
      }).run({ buildRequest: () => request(1, 0) });
      expect(result).toMatchObject({ status: "completed", text: "complete" });
      digests.push(result.timelineDigest);
    }
    expect(new Set(digests).size).toBe(1);
  });

  it("fails closed when the legacy message writer is asked to persist Tool Calls without a batch", async () => {
    const persistence = new InMemoryConversationPersistence({
      clock: new FakeClock("2026-07-23T11:30:00.000Z"),
    });
    await persistence.start();
    const head = initialSessionHead();
    await persistence.createSession(head);
    const writer = new DurableAgentConversationWriter({
      persistence,
      clock: new FakeClock("2026-07-23T11:30:00.000Z"),
      idGenerator: new FakeIdGenerator([
        "019f7d00-0000-7000-8000-000000000020",
        "019f7d00-0000-7000-8000-000000000021",
      ]),
    });
    await expect(new AgentLoopCoordinator({
      model: new ScriptedModelProvider([[
        { type: "started" },
        { type: "tool_call", call },
        { type: "completed", finishReason: "tool_calls" },
      ]]),
      tools: new FakeAgentToolCallExecutor(),
      conversation: writer,
    }).run({
      sessionId: head.sessionId,
      buildRequest: () => request(1, 0),
    })).rejects.toThrow("ToolCallBatchCoordinator");
    expect((await persistence.loadSession(head.sessionId))?.messageSequence).toBe(0);
    await persistence.stop();
  });

  it("turns an expired Tool deadline into a typed terminal loop failure", async () => {
    const result = await new AgentLoopCoordinator({
      model: new ScriptedModelProvider([[
        { type: "started" },
        { type: "tool_call", call },
        { type: "completed", finishReason: "tool_calls" },
      ]]),
      tools: {
        execute: async () => {
          throw new Error("admission.deadline_expired: request deadline already elapsed");
        },
      },
    }).run({ buildRequest: () => request(1, 0) });
    expect(result).toMatchObject({
      status: "failed",
      error: {
        code: "agent.tool_execution_failed",
        message: expect.stringContaining("deadline_expired"),
      },
    });
  });

  it("fails closed on malformed Provider ordering without committing a completed message", async () => {
    const deltas: string[] = [];
    const result = await new AgentLoopCoordinator({
      model: rawProvider([
        { type: "started" },
        { type: "text_delta", delta: "transient" },
        { type: "completed", finishReason: "stop" },
        { type: "text_delta", delta: "late" },
      ]),
      tools: new FakeAgentToolCallExecutor(),
    }).run({
      buildRequest: () => request(1, 0),
      onTextDelta: ({ delta }) => deltas.push(delta),
    });

    expect(result).toMatchObject({
      status: "failed",
      error: { code: "agent.model_stream_protocol_invalid" },
    });
    expect(result.timeline.map((event) => event.type)).toEqual([
      "model_requested",
      "failed",
    ]);
    expect(deltas).toEqual(["transient"]);
  });

  it("maps a missing terminal and an unexpected Provider exception to typed failures", async () => {
    const incomplete = await new AgentLoopCoordinator({
      model: rawProvider([
        { type: "started" },
        { type: "text_delta", delta: "partial" },
      ]),
      tools: new FakeAgentToolCallExecutor(),
    }).run({ buildRequest: () => request(1, 0) });
    expect(incomplete).toMatchObject({
      status: "failed",
      error: { code: "agent.model_stream_incomplete", retryable: false },
    });

    const failed = await new AgentLoopCoordinator({
      model: {
        adapterKind: "model_provider",
        adapterDescriptorId: "adapter.model.throwing",
        adapterDescriptorRevision: `sha256:${"e".repeat(64)}`,
        stream: async function* () {
          yield { type: "started" } as const;
          throw new Error("provider-internal-secret-must-not-propagate");
        },
      },
      tools: new FakeAgentToolCallExecutor(),
    }).run({ buildRequest: () => request(1, 0) });
    expect(failed).toMatchObject({
      status: "failed",
      error: {
        code: "agent.model_provider_failed",
        retryable: true,
        message: expect.not.stringContaining("secret"),
      },
    });
  });

});

function rawProvider(events: readonly ModelStreamEvent[]) {
  return {
    adapterKind: "model_provider" as const,
    adapterDescriptorId: "adapter.model.raw-test",
    adapterDescriptorRevision: `sha256:${"f".repeat(64)}`,
    stream: async function* () {
      for (const event of events) yield event;
    },
  };
}

function request(round: number, toolResultCount: number): ModelRequest {
  const material = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    requestId: `019f7d00-0000-7000-8000-${String(100 + round).padStart(12, "0")}`,
    snapshotId: "019f7d00-0000-7000-8000-000000000010",
    contextSourceDigest: `sha256:${(toolResultCount % 10).toString().repeat(64)}`,
    model: {
      capabilityId: "model.fake",
      capabilityRevision: `sha256:${"a".repeat(64)}`,
    },
    messages: [{
      schemaVersion: MODEL_PROTOCOL_VERSION,
      role: "user" as const,
      content: [{ type: "text" as const, text: "run" }],
    }],
    tools: [],
    artifacts: [],
    maxOutputTokens: 1_024,
  };
  return {
    ...material,
    requestDigest: sha256CanonicalJson(JsonObjectSchema.parse(material)),
  };
}
