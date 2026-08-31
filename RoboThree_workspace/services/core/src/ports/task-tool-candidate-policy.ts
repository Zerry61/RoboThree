import type {
  EntitledToolRefV1,
  ReadableTaskResourceEntitlementSnapshot,
} from "../application/task-resource-entitlement.js";
import type { ReadableAgentDefinitionRevision } from
  "../application/agent-definition-v1alpha2.js";

export type TaskToolCandidatePolicyInput = Readonly<{
  exactAgent: ReadableAgentDefinitionRevision;
  selectedSkillRefs: readonly Readonly<{
    skillId: string;
    revision: string;
    contentDigest: string;
  }>[];
  entitlementSnapshot: ReadableTaskResourceEntitlementSnapshot;
  registryRevision: string;
  workspaceAndAuthorizationFactsDigest: string;
}>;

export type TaskToolCandidatePolicyResult = Readonly<{
  registryRevision: string;
  authorityFactsDigest: string;
  candidates: readonly EntitledToolRefV1[];
}>;

export interface TaskToolCandidatePolicy {
  resolveExact(
    input: TaskToolCandidatePolicyInput,
  ): Promise<TaskToolCandidatePolicyResult>;
}
