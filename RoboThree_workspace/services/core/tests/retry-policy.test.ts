import type { RuntimeError } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  FakeClock,
  FakeRandomSource,
  FakeScheduler,
  RetryCoordinator,
  RetryPolicy,
  isRetryableError,
} from "../src/index.js";

const at = "2026-07-23T05:00:00.000Z";

describe("RetryPolicy", () => {
  it("applies exponential backoff, deterministic jitter, Retry-After, cap, and max attempts", () => {
    const policy = new RetryPolicy();
    expect(policy.decide({
      error: rateLimit(),
      attempt: 1,
      random: 0,
      now: at,
    })).toEqual({ retry: true, delayMs: 1_600, nextAttempt: 2 });
    expect(policy.decide({
      error: rateLimit(),
      attempt: 2,
      random: 0.5,
      now: at,
    })).toEqual({ retry: true, delayMs: 4_000, nextAttempt: 3 });
    expect(policy.decide({
      error: rateLimit(),
      attempt: 1,
      random: 0.5,
      retryAfterMs: 20_000,
      now: at,
    })).toEqual({ retry: true, delayMs: 20_000, nextAttempt: 2 });
    expect(policy.decide({
      error: rateLimit(),
      attempt: 1,
      random: 0.5,
      retryAfterMs: 60_000,
      now: at,
    })).toEqual({ retry: true, delayMs: 30_000, nextAttempt: 2 });
    expect(policy.decide({
      error: rateLimit(),
      attempt: 3,
      random: 0.5,
      now: at,
    })).toEqual({ retry: false, reason: "max_attempts" });
    expect(policy.backoffDelay({
      attempt: 6,
      random: 0.5,
    })).toBe(30_000);
  });

  it("classifies only explicit transient failures and stops before a deadline", () => {
    expect(isRetryableError(rateLimit())).toBe(true);
    expect(isRetryableError(error("provider.http_5xx", "provider", true))).toBe(true);
    expect(isRetryableError(error("provider.http_503", "provider", true))).toBe(true);
    expect(isRetryableError({
      ...error("provider.http_error", "provider", true),
      details: { httpStatus: 502 },
    })).toBe(true);
    expect(isRetryableError(error("provider.network_error", "provider", true))).toBe(true);
    expect(isRetryableError(error("provider.stream_error", "provider", true))).toBe(true);
    expect(isRetryableError(error("authorization.denied", "authorization", true))).toBe(false);
    expect(isRetryableError(error("authentication.invalid", "authentication", true))).toBe(false);
    expect(isRetryableError(error("effect.result_uncertain", "internal", true))).toBe(false);
    expect(isRetryableError(error("runtime.invalid_contract", "validation", true))).toBe(false);

    expect(new RetryPolicy().decide({
      error: rateLimit(),
      attempt: 1,
      random: 0.5,
      now: at,
      deadlineAt: "2026-07-23T05:00:01.000Z",
    })).toEqual({ retry: false, reason: "deadline" });
  });
});

describe("RetryCoordinator", () => {
  it("makes exactly three deterministic attempts for a safe transient operation", async () => {
    const scheduler = new FakeScheduler();
    const attempts: number[] = [];
    const coordinator = new RetryCoordinator({
      policy: new RetryPolicy(),
      clock: new FakeClock(at),
      random: new FakeRandomSource([0.5, 0.5]),
      scheduler,
    });
    const resultPromise = coordinator.execute({
      operationName: "provider.metadata",
      safety: "idempotent_non_effect",
      operation: async (attempt) => {
        attempts.push(attempt);
        return attempt < 3
          ? { ok: false as const, error: rateLimit() }
          : { ok: true as const, value: "ok" };
      },
    });
    await flush();
    expect(attempts).toEqual([1]);
    scheduler.advanceBy(2_000);
    await flush();
    expect(attempts).toEqual([1, 2]);
    scheduler.advanceBy(4_000);
    await expect(resultPromise).resolves.toEqual({ ok: true, value: "ok" });
    expect(attempts).toEqual([1, 2, 3]);
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("does not retry authorization, user rejection, or uncertain Effect results", async () => {
    for (const failure of [
      error("authorization.denied", "authorization", false),
      error("authorization.user_rejected", "authorization", false),
      error("effect.result_uncertain", "internal", true),
    ]) {
      let calls = 0;
      const coordinator = new RetryCoordinator({
        policy: new RetryPolicy(),
        clock: new FakeClock(at),
        random: new FakeRandomSource([0.5]),
        scheduler: new FakeScheduler(),
      });
      expect(await coordinator.execute({
        operationName: failure.code,
        safety: "pre_effect",
        operation: async () => {
          calls += 1;
          return { ok: false, error: failure };
        },
      })).toEqual({ ok: false, error: failure });
      expect(calls).toBe(1);
    }
  });

  it("cancels a pending backoff without another attempt or Timer leak", async () => {
    const scheduler = new FakeScheduler();
    const controller = new AbortController();
    let calls = 0;
    const coordinator = new RetryCoordinator({
      policy: new RetryPolicy(),
      clock: new FakeClock(at),
      random: new FakeRandomSource([0.5]),
      scheduler,
    });
    const result = coordinator.execute({
      operationName: "provider.cancel",
      safety: "pre_effect",
      signal: controller.signal,
      operation: async () => {
        calls += 1;
        return { ok: false, error: rateLimit() };
      },
    });
    await flush();
    controller.abort();
    await expect(result).resolves.toMatchObject({
      ok: false,
      error: { code: "retry.cancelled" },
    });
    expect(calls).toBe(1);
    expect(scheduler.pendingCount()).toBe(0);
  });
});

function rateLimit(): RuntimeError {
  return error("provider.rate_limited", "rate_limit", true);
}

function error(
  code: string,
  category: RuntimeError["category"],
  retryable: boolean,
): RuntimeError {
  return { code, category, message: code, retryable };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
