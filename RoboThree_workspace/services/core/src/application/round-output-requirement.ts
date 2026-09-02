import { JsonValueSchema } from "@robothree/contracts";

import type { TokenEstimator } from "../ports/token-estimator.js";
import type { ExactModelCapabilityProfile } from
  "./exact-model-capability-profile.js";

export const WORKSPACE_TEXT_WRITE_CAPABILITY_ID =
  "tool.workspace.file.write_text";

const ORDINARY_DESIRED_OUTPUT_TOKENS = 8_192;
const MINIMUM_WTE_GROWTH_HEADROOM_TOKENS = 1_024;
const WTE_GROWTH_HEADROOM_RATIO = 0.25;

export type WorkspaceTextReplacementMaterial = Readonly<{
  kind: "workspace_text_full_replacement";
  capabilityId: typeof WORKSPACE_TEXT_WRITE_CAPABILITY_ID;
  relativePath: string;
  expectedPreviousSha256: string;
  currentExactContent: string;
}>;

export type RoundOutputMaterial =
  | Readonly<{ kind: "ordinary" }>
  | WorkspaceTextReplacementMaterial;

export type RoundOutputRequirement = Readonly<{
  materialKind: RoundOutputMaterial["kind"];
  requiredOutputTokens: number;
  reservedOutputTokens: number;
  lockedMaxOutputTokens: number;
  baseReplacementTokens?: number;
  growthHeadroomTokens?: number;
}>;

export class RoundOutputRequirementError extends Error {
  public readonly code = "workspace.file.output_capacity_insufficient";
  public readonly requiredOutputTokens: number;
  public readonly lockedMaxOutputTokens: number;

  public constructor(input: Readonly<{
    requiredOutputTokens: number;
    lockedMaxOutputTokens: number;
  }>) {
    super("The locked Model cannot emit the complete workspace text replacement");
    this.name = "RoundOutputRequirementError";
    this.requiredOutputTokens = input.requiredOutputTokens;
    this.lockedMaxOutputTokens = input.lockedMaxOutputTokens;
  }
}

export class RoundOutputRequirementResolver {
  readonly #estimator: TokenEstimator;

  public constructor(input: Readonly<{ estimator: TokenEstimator }>) {
    this.#estimator = input.estimator;
  }

  public resolve(input: Readonly<{
    profile: ExactModelCapabilityProfile;
    material?: RoundOutputMaterial;
  }>): RoundOutputRequirement {
    const material = input.material ?? { kind: "ordinary" as const };
    if (material.kind === "ordinary") {
      const requiredOutputTokens = Math.min(
        ORDINARY_DESIRED_OUTPUT_TOKENS,
        input.profile.maxOutputTokens,
      );
      return Object.freeze({
        materialKind: material.kind,
        requiredOutputTokens,
        reservedOutputTokens: requiredOutputTokens,
        lockedMaxOutputTokens: input.profile.maxOutputTokens,
      });
    }
    if (material.capabilityId !== WORKSPACE_TEXT_WRITE_CAPABILITY_ID) {
      throw new Error("Workspace text replacement requires the exact WTE capability");
    }
    const envelope = JsonValueSchema.parse({
      type: "tool_call",
      name: WORKSPACE_TEXT_WRITE_CAPABILITY_ID,
      arguments: {
        relativePath: material.relativePath,
        options: {
          mode: "replace_existing",
          expectedPreviousSha256: material.expectedPreviousSha256,
        },
        content: material.currentExactContent,
      },
    });
    const baseReplacementTokens = hasSafetyMargin(this.#estimator)
      ? this.#estimator.estimateWithSafetyMargin(envelope)
      : this.#estimator.estimate(envelope);
    const growthHeadroomTokens = Math.max(
      MINIMUM_WTE_GROWTH_HEADROOM_TOKENS,
      Math.ceil(baseReplacementTokens * WTE_GROWTH_HEADROOM_RATIO),
    );
    const requiredOutputTokens = baseReplacementTokens + growthHeadroomTokens;
    if (requiredOutputTokens > input.profile.maxOutputTokens) {
      throw new RoundOutputRequirementError({
        requiredOutputTokens,
        lockedMaxOutputTokens: input.profile.maxOutputTokens,
      });
    }
    return Object.freeze({
      materialKind: material.kind,
      requiredOutputTokens,
      reservedOutputTokens: requiredOutputTokens,
      lockedMaxOutputTokens: input.profile.maxOutputTokens,
      baseReplacementTokens,
      growthHeadroomTokens,
    });
  }
}

function hasSafetyMargin(estimator: TokenEstimator): estimator is TokenEstimator & Readonly<{
  estimateWithSafetyMargin(value: Parameters<TokenEstimator["estimate"]>[0]): number;
}> {
  return "estimateWithSafetyMargin" in estimator
    && typeof estimator.estimateWithSafetyMargin === "function";
}

export const RoundOutputRequirementConstants = Object.freeze({
  ordinaryDesiredOutputTokens: ORDINARY_DESIRED_OUTPUT_TOKENS,
  minimumWteGrowthHeadroomTokens: MINIMUM_WTE_GROWTH_HEADROOM_TOKENS,
  wteGrowthHeadroomRatio: WTE_GROWTH_HEADROOM_RATIO,
});
