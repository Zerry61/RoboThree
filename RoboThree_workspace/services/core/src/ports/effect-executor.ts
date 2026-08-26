import type { EffectAttempt, JsonValue, Observation, RuntimeError } from "@robothree/contracts";

export type EffectExecutionResult =
  | { outcome: "succeeded"; resultRef: string; output: JsonValue; observation?: Observation }
  | { outcome: "failed"; error: RuntimeError; observation?: Observation }
  | { outcome: "cancelled" | "timed_out"; error: RuntimeError; observation: Observation };

export type EffectQueryResult = EffectExecutionResult | { outcome: "not_found" } | { outcome: "unknown" };

export interface EffectExecutor {
  readonly executorCapability: string;
  execute(attempt: EffectAttempt, signal?: AbortSignal): Promise<EffectExecutionResult>;
  query(attempt: EffectAttempt): Promise<EffectQueryResult>;
}
