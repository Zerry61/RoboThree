import type { TaskCapabilityLock } from "@robothree/contracts";

import type { TokenEstimator } from "../ports/token-estimator.js";
import { ContextBudgetPolicy } from "./context-budget-policy.js";
import {
  resolveExactModelCapabilityProfile,
  type ExactModelCapabilityProfile,
} from "./exact-model-capability-profile.js";
import {
  RoundOutputRequirementResolver,
  type RoundOutputMaterial,
  type RoundOutputRequirement,
} from "./round-output-requirement.js";

export type TaskContextBudgetResolution = Readonly<{
  profile: ExactModelCapabilityProfile;
  output: RoundOutputRequirement;
  policy: ContextBudgetPolicy;
}>;

export class TaskContextBudgetResolver {
  readonly #outputs: RoundOutputRequirementResolver;

  public constructor(input: Readonly<{ estimator: TokenEstimator }>) {
    this.#outputs = new RoundOutputRequirementResolver(input);
  }

  public resolve(input: Readonly<{
    modelLock: TaskCapabilityLock;
    outputMaterial?: RoundOutputMaterial;
    allowLegacyTaskLock?: boolean;
  }>): TaskContextBudgetResolution {
    const profile = resolveExactModelCapabilityProfile(input.modelLock, {
      allowLegacyTaskLock: input.allowLegacyTaskLock === true,
    });
    const output = this.#outputs.resolve({
      profile,
      ...(input.outputMaterial === undefined
        ? {}
        : { material: input.outputMaterial }),
    });
    const safetyMarginTokens = Math.min(
      16_384,
      Math.max(512, Math.ceil(profile.contextWindowTokens * 0.02)),
    );
    const minimumHeadroomTokens = Math.min(
      32_768,
      Math.max(
        2_048,
        output.reservedOutputTokens * 2,
        Math.ceil(profile.contextWindowTokens * 0.08),
      ),
    );
    return Object.freeze({
      profile,
      output,
      policy: new ContextBudgetPolicy({
        modelContextWindow: profile.contextWindowTokens,
        reservedOutputTokens: output.reservedOutputTokens,
        safetyMarginTokens,
        compactionThresholdRatio: 0.8,
        minimumHeadroomTokens,
        maxPreviewBytes: 4_096,
      }),
    });
  }
}
