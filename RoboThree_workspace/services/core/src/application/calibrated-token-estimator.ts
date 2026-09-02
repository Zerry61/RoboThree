import { JsonValueSchema, type JsonValue } from "@robothree/contracts";

import type { TokenEstimator } from "../ports/token-estimator.js";

export type TokenEstimatorErrorEnvelope = Readonly<{
  profileRevision: "robothree.token-estimator.heuristic.v1";
  relativeSafetyMargin: 0.2;
  absoluteSafetyMarginTokens: 32;
}>;

/**
 * Dependency-free production estimator for provider-neutral JSON requests.
 *
 * It deliberately exposes a validated error envelope instead of claiming that
 * every provider tokenizer is byte-identical or that every individual request
 * is overestimated. Admission adds the frozen envelope before comparing a
 * request with an exact Model capability.
 */
export class CalibratedTokenEstimator implements TokenEstimator {
  public readonly errorEnvelope: TokenEstimatorErrorEnvelope = Object.freeze({
    profileRevision: "robothree.token-estimator.heuristic.v1",
    relativeSafetyMargin: 0.2,
    absoluteSafetyMarginTokens: 32,
  });

  public estimate(value: JsonValue): number {
    const serialized = JSON.stringify(JsonValueSchema.parse(value));
    let asciiRun = 0;
    let estimated = 0;
    const flushAscii = () => {
      if (asciiRun === 0) return;
      estimated += Math.ceil(asciiRun / 4);
      asciiRun = 0;
    };
    for (const character of serialized) {
      const codePoint = character.codePointAt(0)!;
      if (codePoint <= 0x7f) {
        asciiRun += 1;
        continue;
      }
      flushAscii();
      estimated += isCjk(codePoint) ? 1 : Math.ceil(Buffer.byteLength(character, "utf8") / 2);
    }
    flushAscii();
    return Math.max(1, estimated);
  }

  public estimateWithSafetyMargin(value: JsonValue): number {
    const estimate = this.estimate(value);
    return Math.ceil(
      estimate * (1 + this.errorEnvelope.relativeSafetyMargin),
    ) + this.errorEnvelope.absoluteSafetyMarginTokens;
  }

  public isWithinValidatedEnvelope(input: Readonly<{
    estimatedTokens: number;
    observedTokens: number;
  }>): boolean {
    validateCount(input.estimatedTokens, "estimatedTokens");
    validateCount(input.observedTokens, "observedTokens");
    const upperBound = Math.ceil(
      input.estimatedTokens * (1 + this.errorEnvelope.relativeSafetyMargin),
    ) + this.errorEnvelope.absoluteSafetyMarginTokens;
    return input.observedTokens <= upperBound;
  }
}

function isCjk(codePoint: number): boolean {
  return (codePoint >= 0x3400 && codePoint <= 0x9fff)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0x20000 && codePoint <= 0x2fa1f);
}

function validateCount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
}
