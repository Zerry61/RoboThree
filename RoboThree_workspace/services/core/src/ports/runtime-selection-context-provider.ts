import type { RequiredModelCapabilities } from "@robothree/contracts";

import type { ModelLiveEligibility } from "../application/model-eligibility-evaluator.js";
import type { CapabilityAvailability } from "../registry/capability-resolver.js";

export type RuntimeSelectionContext = Readonly<{
  registryRevision: string;
  platformPromptRevision: string;
  enterpriseConfigRevision?: string;
  liveModels: readonly ModelLiveEligibility[];
  capabilityAvailability?: Readonly<Record<string, CapabilityAvailability>>;
  inputRequirements?: Partial<RequiredModelCapabilities>;
}>;

export interface RuntimeSelectionContextProvider {
  resolve(
    registryRevision?: string,
  ): Promise<RuntimeSelectionContext | undefined>;
}
