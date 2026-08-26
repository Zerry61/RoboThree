import { describe, expect, it } from "vitest";

import {
  FakeClock,
  FakeScheduler,
  LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
  LocalPersonalInvocationTimeoutFactSchema,
  LocalPersonalProviderTimeoutController,
  createLocalPersonalInvocationTimeoutFact,
  createModelInvocationTimeoutMaterial,
  classifyOpenAiCompatibleProgressFrame,
  assertOpenAiCompatibleStreamTerminal,
  validateLocalPersonalInvocationTimeoutFact,
  LocalPersonalModelProviderError,
  resolveLocalPersonalProviderFailure,
} from "../src/index.js";

const at = "2026-08-25T02:00:00.000Z";
const invocationId = "019f7447-a784-77b2-a716-000000000991";

describe("DFI-4A.3.1 repair.2 timeout policy", () => {
  it("freezes the single production policy and creates a 15 minute deadline", () => {
    expect(LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1).toMatchObject({
      connectTimeoutMs: 30_000,
      firstProgressTimeoutMs: 90_000,
      streamIdleTimeoutMs: 300_000,
      minimumOverallTimeoutMs: 120_000,
      defaultOverallTimeoutMs: 900_000,
      maximumOverallTimeoutMs: 1_800_000,
    });
    const timeout = createModelInvocationTimeoutMaterial({
      policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      invocationStartedAt: at,
    });
    expect(timeout).toMatchObject({
      selectedOverallTimeoutMs: 900_000,
      effectiveDeadlineSource: "policy_overall",
      invocationDeadlineAt: "2026-08-25T02:15:00.000Z",
    });
  });

  it("takes an earlier outer deadline without restarting the overall window", () => {
    const timeout = createModelInvocationTimeoutMaterial({
      policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      invocationStartedAt: at,
      outerDeadlineAt: "2026-08-25T02:04:00.000Z",
    });
    expect(timeout).toMatchObject({
      effectiveDeadlineSource: "outer_deadline",
      policyDeadlineAt: "2026-08-25T02:15:00.000Z",
      invocationDeadlineAt: "2026-08-25T02:04:00.000Z",
    });
  });

  it("detects durable timeout fact tampering and deadline drift", () => {
    const timeout = createModelInvocationTimeoutMaterial({
      policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      invocationStartedAt: at,
    });
    const fact = createLocalPersonalInvocationTimeoutFact({
      authorityInvocationId: invocationId,
      timeout,
      policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
    });
    expect(validateLocalPersonalInvocationTimeoutFact(
      fact,
      LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
    )).toEqual(fact);
    expect(() => LocalPersonalInvocationTimeoutFactSchema.parse({
      ...fact,
      invocationDeadlineAt: "2026-08-25T02:16:00.000Z",
    })).toThrow();
  });

  it("classifies recognized progress without letting empty frames or usage null renew timers", () => {
    expect(classifyOpenAiCompatibleProgressFrame(JSON.stringify({
      choices: [{ delta: { role: "assistant", content: "" } }],
      usage: null,
    }))).toBe(true);
    expect(classifyOpenAiCompatibleProgressFrame(JSON.stringify({
      choices: [{ delta: { reasoning_content: "thinking" } }],
      usage: null,
    }))).toBe(true);
    expect(classifyOpenAiCompatibleProgressFrame(JSON.stringify({
      choices: [{ delta: { content: "answer" } }],
      usage: null,
    }))).toBe(true);
    expect(classifyOpenAiCompatibleProgressFrame(JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop" }],
    }))).toBe(true);
    expect(classifyOpenAiCompatibleProgressFrame(JSON.stringify({
      choices: [],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }))).toBe(true);
    expect(classifyOpenAiCompatibleProgressFrame(JSON.stringify({ usage: null }))).toBe(false);
    expect(classifyOpenAiCompatibleProgressFrame("{}")).toBe(false);
    expect(() => classifyOpenAiCompatibleProgressFrame("not-json"))
      .toThrow("personal_model.sse_json_invalid");
  });

  it("keeps clean EOF without DONE on the protocol path instead of timeout or network", () => {
    expect(() => assertOpenAiCompatibleStreamTerminal({
      httpComplete: true,
      responseAborted: false,
      done: false,
      finishReason: "stop",
      trailingText: "",
    })).toThrow("personal_model.stream_terminal_missing");
    expect(() => assertOpenAiCompatibleStreamTerminal({
      httpComplete: false,
      responseAborted: true,
      done: false,
      trailingText: "",
    })).toThrow("personal_model.network_failure");
  });

  it("fires connect and first-progress timeouts at their exact phase boundaries", () => {
    const connect = fixture();
    connect.controller.startConnect();
    connect.scheduler.advanceBy(29_999);
    expect(connect.controller.terminationCause).toBeUndefined();
    connect.scheduler.advanceBy(1);
    expect(connect.controller.terminationCause?.code).toBe("personal_model.connect_timeout");
    expect(connect.controller.snapshot().activeTimerCount).toBe(0);

    const first = fixture();
    first.controller.startConnect();
    first.controller.connected();
    first.scheduler.advanceBy(89_999);
    expect(first.controller.terminationCause).toBeUndefined();
    first.scheduler.advanceBy(1);
    expect(first.controller.terminationCause?.code)
      .toBe("personal_model.first_response_timeout");
  });

  it("resets idle only on recognized progress and retains the first locked cause", () => {
    const value = fixture();
    value.controller.startConnect();
    value.controller.connected();
    value.controller.progress();
    value.scheduler.advanceBy(299_999);
    value.controller.progress();
    value.scheduler.advanceBy(300_000);
    expect(value.controller.terminationCause?.code)
      .toBe("personal_model.stream_idle_timeout");
    value.scheduler.advanceBy(900_000);
    expect(value.controller.terminationCause?.code)
      .toBe("personal_model.stream_idle_timeout");
  });

  it("keeps overall absolute and clears every timer on dispose", () => {
    const value = fixture();
    value.controller.startConnect();
    value.controller.connected();
    value.controller.progress();
    value.scheduler.advanceBy(299_999);
    value.controller.progress();
    value.scheduler.advanceBy(299_999);
    value.controller.progress();
    value.scheduler.advanceBy(299_999);
    value.controller.progress();
    value.scheduler.advanceBy(2);
    expect(value.controller.terminationCause).toBeUndefined();
    value.scheduler.advanceBy(1);
    expect(value.controller.terminationCause?.code)
      .toBe("personal_model.invocation_deadline_exceeded");

    const disposed = fixture();
    disposed.controller.startConnect();
    disposed.controller.connected();
    disposed.controller.progress();
    disposed.controller.dispose();
    expect(disposed.controller.snapshot().activeTimerCount).toBe(0);
    expect(disposed.scheduler.pendingCount()).toBe(0);

    const terminal = fixture();
    terminal.controller.startConnect();
    terminal.controller.connected();
    terminal.controller.progress();
    terminal.controller.terminal();
    expect(terminal.controller.snapshot().activeTimerCount).toBe(0);
    expect(terminal.scheduler.pendingCount()).toBe(0);
  });

  it("locks explicit cancellation before late timeout callbacks", () => {
    const value = fixture();
    const parent = new AbortController();
    value.controller.bind(parent.signal);
    value.controller.startConnect();
    parent.abort();
    value.scheduler.advanceBy(900_000);
    expect(value.controller.terminationCause).toMatchObject({
      code: "personal_model.cancelled",
      kind: "cancelled",
    });
  });

  it("keeps a locked local timeout ahead of a late socket reset", () => {
    const locked = new LocalPersonalModelProviderError(
      "personal_model.stream_idle_timeout",
      "deadline",
      true,
    );
    expect(resolveLocalPersonalProviderFailure(
      Object.assign(new Error("socket reset"), { code: "ECONNRESET" }),
      new AbortController().signal,
      locked,
    )).toBe(locked);
    expect(resolveLocalPersonalProviderFailure(
      Object.assign(new Error("socket reset"), { code: "ECONNRESET" }),
      new AbortController().signal,
      undefined,
    )).toMatchObject({ code: "personal_model.network_failure", kind: "network" });
  });
});

function fixture() {
  const scheduler = new FakeScheduler();
  return {
    scheduler,
    controller: new LocalPersonalProviderTimeoutController({
      policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
      clock: new FakeClock(at),
      scheduler,
      invocationDeadlineAt: "2026-08-25T02:15:00.000Z",
    }),
  };
}
