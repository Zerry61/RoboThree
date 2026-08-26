import {
  MODEL_PROTOCOL_VERSION,
  JsonObjectSchema,
} from "@robothree/contracts";
import type { ModelProvider } from "../src/index.js";
import type { ModelStreamProtocolError } from "../src/index.js";
import {
  FakeModelProvider,
  sha256CanonicalJson,
  validateModelStream,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

const requestMaterial = {
  schemaVersion: MODEL_PROTOCOL_VERSION,
  requestId: "019f7447-a784-77b2-a716-ce42b07e4818",
  snapshotId: "019f7447-a784-77b2-a716-ce42b07e4819",
  contextSourceDigest: `sha256:${"a".repeat(64)}`,
  model: {
    capabilityId: "model.fake",
    capabilityRevision: `sha256:${"b".repeat(64)}`,
  },
  messages: [{
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "user" as const,
    content: [{ type: "text" as const, text: "hello" }],
  }],
  tools: [],
  artifacts: [],
  maxOutputTokens: 1_024,
};
const request = {
  ...requestMaterial,
  requestDigest: sha256CanonicalJson(JsonObjectSchema.parse(requestMaterial)),
};

async function collect(provider: ModelProvider, signal: AbortSignal) {
  const events = [];
  for await (const event of provider.stream(request, signal)) {
    events.push(event);
  }
  return events;
}

describe("ModelProvider conformance skeleton", () => {
  it("emits a schema-valid ordered stream", async () => {
    const provider = new FakeModelProvider({
      events: [
        { type: "started" },
        { type: "text_delta", delta: "hello" },
        { type: "completed", finishReason: "stop" },
      ],
    });

    await expect(collect(provider, new AbortController().signal)).resolves.toEqual([
      { type: "started" },
      { type: "text_delta", delta: "hello" },
      { type: "completed", finishReason: "stop" },
    ]);
  });

  it("stops emitting after cancellation", async () => {
    const controller = new AbortController();
    const provider = new FakeModelProvider({
      events: [
        { type: "started" },
        { type: "text_delta", delta: "should-not-arrive" },
        { type: "completed", finishReason: "stop" },
      ],
    });
    controller.abort();

    await expect(collect(provider, controller.signal)).resolves.toEqual([]);
  });

  it("supports one typed failed terminal event", async () => {
    const provider = new FakeModelProvider({
      events: [
        { type: "started" },
        {
          type: "failed",
          error: {
            code: "model.fake_failure",
            category: "provider",
            message: "Fake provider failed",
            retryable: false,
          },
        },
      ],
    });
    await expect(collect(provider, new AbortController().signal)).resolves.toMatchObject([
      { type: "started" },
      { type: "failed", error: { code: "model.fake_failure" } },
    ]);
  });

  it("rejects scripts that violate start and terminal ordering", () => {
    expect(() => new FakeModelProvider({
      events: [{ type: "completed", finishReason: "stop" }],
    })).toThrow("start");
    expect(() => new FakeModelProvider({
      events: [{ type: "started" }, { type: "text_delta", delta: "unterminated" }],
    })).toThrow("end");
    expect(() => new FakeModelProvider({
      events: [
        { type: "started" },
        { type: "started" },
        { type: "completed", finishReason: "stop" },
      ],
    })).toThrow("more than once");
    expect(() => new FakeModelProvider({
      events: [
        { type: "started" },
        { type: "completed", finishReason: "stop" },
        { type: "text_delta", delta: "late" },
      ],
    })).toThrow("after");
  });

  it("rejects blank text, duplicate Tool identity, and repeated or regressed usage", () => {
    expect(() => new FakeModelProvider({
      events: [
        { type: "started" },
        { type: "text_delta", delta: "   " },
        { type: "completed", finishReason: "stop" },
      ],
    })).toThrow("blank");
    const toolCall = {
      toolCallId: "019f7d00-0000-7000-8000-000000000001",
      taskId: "019f7d00-0000-7000-8000-000000000002",
      actionId: "019f7d00-0000-7000-8000-000000000003",
      capabilityId: "tool.echo",
      arguments: { value: "one" },
    };
    expect(() => new FakeModelProvider({
      events: [
        { type: "started" },
        { type: "tool_call", call: toolCall },
        { type: "tool_call", call: toolCall },
        { type: "completed", finishReason: "tool_calls" },
      ],
    })).toThrow("repeated");
    expect(() => new FakeModelProvider({
      events: [
        { type: "started" },
        { type: "usage", inputTokens: 8, outputTokens: 4 },
        { type: "usage", inputTokens: 8, outputTokens: 4 },
        { type: "completed", finishReason: "stop" },
      ],
    })).toThrow("more than once");
    expect(() => new FakeModelProvider({
      events: [
        { type: "started" },
        { type: "usage", inputTokens: 8, outputTokens: 4 },
        { type: "usage", inputTokens: 7, outputTokens: 4 },
        { type: "completed", finishReason: "stop" },
      ],
    })).toThrow("regressed");
  });

  it("isolates late events after cancellation", async () => {
    const controller = new AbortController();
    const received: string[] = [];
    async function* lateProvider() {
      yield { type: "started" };
      yield { type: "text_delta", delta: "accepted" };
      controller.abort();
      yield { type: "text_delta", delta: "late" };
      yield { type: "completed", finishReason: "stop" };
    }
    for await (const event of validateModelStream(lateProvider(), controller.signal)) {
      if (event.type === "text_delta") received.push(event.delta);
    }
    expect(received).toEqual(["accepted"]);
  });

  it("uses typed Core-internal protocol errors without changing the public Contract", async () => {
    async function* invalidStream() {
      yield { type: "text_delta", delta: "missing-start" };
    }
    const collectInvalid = async () => {
      for await (const _event of validateModelStream(
        invalidStream(),
        new AbortController().signal,
      )) {
        // No event can pass the guard before started.
      }
    };
    await expect(collectInvalid()).rejects.toMatchObject<ModelStreamProtocolError>({
      code: "model_stream.started_missing",
    });
  });

  it("rejects a ModelRequest whose canonical digest was changed", async () => {
    const provider = new FakeModelProvider({
      events: [{ type: "started" }, { type: "completed", finishReason: "stop" }],
    });
    await expect(collect(provider, new AbortController().signal)).resolves.toHaveLength(2);
    const changed = {
      ...request,
      maxOutputTokens: request.maxOutputTokens + 1,
    };
    const events = async () => {
      const collected = [];
      for await (const event of provider.stream(changed, new AbortController().signal)) {
        collected.push(event);
      }
      return collected;
    };
    await expect(events()).rejects.toThrow("digest");
  });
});
