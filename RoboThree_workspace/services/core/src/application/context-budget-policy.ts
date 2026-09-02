import { JsonValueSchema, type JsonValue } from "@robothree/contracts";

import { sha256CanonicalJson } from "../persistence/digest.js";

export type ContextBudgetPolicyConfig = Readonly<{
  modelContextWindow: number;
  reservedOutputTokens: number;
  safetyMarginTokens: number;
  compactionThresholdRatio: number;
  minimumHeadroomTokens?: number;
  maxPreviewBytes: number;
}>;

export type ContextBudgetState =
  | "within_threshold"
  | "reduction_required"
  | "exceeds_available_input";

export type ContextBudgetDecision = ContextBudgetPolicyConfig & Readonly<{
  availableInputTokens: number;
  compactionThresholdTokens: number;
  policyDigest: string;
}>;

export const KAF52_ALPHA_BUDGET_POLICY: ContextBudgetPolicyConfig = Object.freeze({
  modelContextWindow: 8_192,
  reservedOutputTokens: 1_024,
  safetyMarginTokens: 512,
  compactionThresholdRatio: 0.8,
  maxPreviewBytes: 4_096,
});

export class ContextBudgetPolicy {
  readonly #decision: ContextBudgetDecision;

  constructor(config: ContextBudgetPolicyConfig = KAF52_ALPHA_BUDGET_POLICY) {
    validatePositiveInteger(config.modelContextWindow, "modelContextWindow");
    validatePositiveInteger(config.reservedOutputTokens, "reservedOutputTokens");
    validatePositiveInteger(config.safetyMarginTokens, "safetyMarginTokens");
    if (config.minimumHeadroomTokens !== undefined) {
      validatePositiveInteger(config.minimumHeadroomTokens, "minimumHeadroomTokens");
    }
    validatePositiveInteger(config.maxPreviewBytes, "maxPreviewBytes");
    if (
      !Number.isFinite(config.compactionThresholdRatio)
      || config.compactionThresholdRatio <= 0
      || config.compactionThresholdRatio > 1
    ) {
      throw new Error("compactionThresholdRatio must be greater than 0 and at most 1");
    }
    const availableInputTokens =
      config.modelContextWindow - config.reservedOutputTokens - config.safetyMarginTokens;
    if (availableInputTokens <= 0) {
      throw new Error("Context budget reserves must leave a positive input budget");
    }
    const ratioThresholdTokens = Math.floor(
      availableInputTokens * config.compactionThresholdRatio,
    );
    const compactionThresholdTokens = config.minimumHeadroomTokens === undefined
      ? ratioThresholdTokens
      : Math.min(
        ratioThresholdTokens,
        availableInputTokens - config.minimumHeadroomTokens,
      );
    if (compactionThresholdTokens <= 0) {
      throw new Error("Context budget headroom must leave a positive compaction threshold");
    }
    const material = {
      ...config,
      availableInputTokens,
      compactionThresholdTokens,
    };
    this.#decision = Object.freeze({
      ...material,
      policyDigest: sha256CanonicalJson(JsonValueSchema.parse(material)),
    });
  }

  decision(): ContextBudgetDecision {
    return this.#decision;
  }

  classify(inputTokens: number): ContextBudgetState {
    if (!Number.isSafeInteger(inputTokens) || inputTokens < 0) {
      throw new Error("inputTokens must be a non-negative safe integer");
    }
    if (inputTokens > this.#decision.availableInputTokens) {
      return "exceeds_available_input";
    }
    if (inputTokens > this.#decision.compactionThresholdTokens) {
      return "reduction_required";
    }
    return "within_threshold";
  }
}

function validatePositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive safe integer`);
  }
}

export function budgetDecisionMaterial(decision: ContextBudgetDecision): JsonValue {
  const { policyDigest: _policyDigest, ...material } = decision;
  return JsonValueSchema.parse(material);
}
