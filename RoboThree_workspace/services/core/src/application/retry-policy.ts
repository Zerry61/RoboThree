import type { RuntimeError } from "@robothree/contracts";

export const DEFAULT_RETRY_POLICY = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 2_000,
  jitterRatio: 0.2,
  capDelayMs: 30_000,
});

export type RetryDecision =
  | { retry: true; delayMs: number; nextAttempt: number }
  | { retry: false; reason: "non_retryable" | "max_attempts" | "deadline" };

export class RetryPolicy {
  readonly #maxAttempts: number;
  readonly #baseDelayMs: number;
  readonly #jitterRatio: number;
  readonly #capDelayMs: number;

  public constructor(input: {
    maxAttempts?: number;
    baseDelayMs?: number;
    jitterRatio?: number;
    capDelayMs?: number;
  } = {}) {
    this.#maxAttempts = positiveInteger(input.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts, "maxAttempts");
    this.#baseDelayMs = nonNegative(input.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs, "baseDelayMs");
    this.#jitterRatio = ratio(input.jitterRatio ?? DEFAULT_RETRY_POLICY.jitterRatio);
    this.#capDelayMs = nonNegative(input.capDelayMs ?? DEFAULT_RETRY_POLICY.capDelayMs, "capDelayMs");
  }

  public get maxAttempts(): number {
    return this.#maxAttempts;
  }

  public decide(input: {
    error: RuntimeError;
    attempt: number;
    random: number;
    now: string;
    deadlineAt?: string;
    retryAfterMs?: number;
  }): RetryDecision {
    positiveInteger(input.attempt, "attempt");
    requireRandom(input.random);
    if (!isRetryableError(input.error)) {
      return { retry: false, reason: "non_retryable" };
    }
    if (input.attempt >= this.#maxAttempts) {
      return { retry: false, reason: "max_attempts" };
    }
    const delayMs = this.backoffDelay(input);
    if (input.deadlineAt !== undefined
      && Date.parse(input.now) + delayMs >= Date.parse(input.deadlineAt)) {
      return { retry: false, reason: "deadline" };
    }
    return { retry: true, delayMs, nextAttempt: input.attempt + 1 };
  }

  public backoffDelay(input: {
    attempt: number;
    random: number;
    retryAfterMs?: number;
  }): number {
    positiveInteger(input.attempt, "attempt");
    requireRandom(input.random);
    const exponential = this.#baseDelayMs * 2 ** (input.attempt - 1);
    const jittered = exponential * (1 + ((input.random * 2) - 1) * this.#jitterRatio);
    const retryAfter = input.retryAfterMs === undefined
      ? 0
      : nonNegative(input.retryAfterMs, "retryAfterMs");
    return Math.round(Math.min(this.#capDelayMs, Math.max(retryAfter, jittered)));
  }
}

export function isRetryableError(error: RuntimeError): boolean {
  if (!error.retryable || error.code === "effect.result_uncertain") {
    return false;
  }
  if (error.category === "rate_limit") {
    return true;
  }
  if (error.category === "provider") {
    const httpStatus = error.details?.httpStatus;
    return error.code.includes("5xx")
      || /(?:^|[._-])5\d\d(?:$|[._-])/u.test(error.code)
      || (typeof httpStatus === "number" && Number.isInteger(httpStatus) && httpStatus >= 500 && httpStatus <= 599)
      || error.code.includes("network")
      || error.code.includes("stream")
      || error.code.includes("temporarily_unavailable");
  }
  return error.code === "publisher.delivery_failed";
}

export function addMilliseconds(timestamp: string, delayMs: number): string {
  return new Date(Date.parse(timestamp) + nonNegative(delayMs, "delayMs")).toISOString();
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
  return value;
}

function ratio(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("jitterRatio must be between 0 and 1");
  }
  return value;
}

function requireRandom(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("random must be in [0, 1)");
  }
}
