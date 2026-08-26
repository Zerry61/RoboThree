import type { JsonValue } from "@robothree/contracts";

export interface TokenEstimator {
  estimate(value: JsonValue): number;
}
