import type { EffectAttempt } from "@robothree/contracts";

import type {
  EffectExecutionResult,
  EffectExecutor,
  EffectQueryResult,
} from "../../ports/effect-executor.js";

export class FakeEffectExecutor implements EffectExecutor {
  readonly executorCapability: string;
  readonly executeCalls: EffectAttempt[] = [];
  readonly queryCalls: EffectAttempt[] = [];
  uniqueExecutions = 0;
  readonly #resultsByKey = new Map<string, EffectExecutionResult>();
  readonly #queuedResults: EffectExecutionResult[] = [];
  #queryUnknown = false;

  constructor(executorCapability = "fake.effect") {
    this.executorCapability = executorCapability;
  }

  enqueueResult(result: EffectExecutionResult): void {
    this.#queuedResults.push(structuredClone(result));
  }

  returnUnknownFromQuery(value = true): void {
    this.#queryUnknown = value;
  }

  async execute(attempt: EffectAttempt, _signal?: AbortSignal): Promise<EffectExecutionResult> {
    this.executeCalls.push(structuredClone(attempt));
    const existing = this.#resultsByKey.get(attempt.idempotencyKey);
    if (existing !== undefined) {
      return structuredClone(existing);
    }
    const result = this.#queuedResults.shift();
    if (result === undefined) {
      throw new Error("FakeEffectExecutor has no queued result");
    }
    this.uniqueExecutions += 1;
    this.#resultsByKey.set(attempt.idempotencyKey, structuredClone(result));
    return structuredClone(result);
  }

  async query(attempt: EffectAttempt): Promise<EffectQueryResult> {
    this.queryCalls.push(structuredClone(attempt));
    if (this.#queryUnknown) {
      return { outcome: "unknown" };
    }
    const result = this.#resultsByKey.get(attempt.idempotencyKey);
    return result === undefined ? { outcome: "not_found" } : structuredClone(result);
  }
}
