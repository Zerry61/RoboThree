import type {
  ReasoningModeLockProfileRef,
  ReasoningModeLockStrategyRef,
  ReasoningProfileSubject,
} from "@robothree/contracts/reasoning-mode/v1alpha1";

import type {
  ProviderReasoningAuthority,
  ProviderReasoningFamily,
  ProviderReasoningMapping,
} from "../application/provider-reasoning-mapping-domain.js";

export type ProviderReasoningMappingQuery = Readonly<{
  authority: ProviderReasoningAuthority;
  providerFamily: ProviderReasoningFamily;
  exactSubject: ReasoningProfileSubject;
  profileRef: ReasoningModeLockProfileRef;
  strategyRef: ReasoningModeLockStrategyRef;
}>;

export interface ProviderReasoningMappingSource {
  loadExact(query: ProviderReasoningMappingQuery): Promise<readonly ProviderReasoningMapping[]>;
}
