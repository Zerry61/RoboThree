import { JsonValueSchema, type JsonValue } from "@robothree/contracts";

import type { TokenEstimator } from "../../ports/token-estimator.js";

export class ConservativeTokenEstimator implements TokenEstimator {
  readonly #encoder = new TextEncoder();

  estimate(value: JsonValue): number {
    const parsed = JsonValueSchema.parse(value);
    return this.#encoder.encode(JSON.stringify(parsed)).byteLength;
  }
}
