import type { AgentDefinitionRevisionV1Alpha2 } from "@robothree/contracts/runtime-selection/agent-definition/v1alpha2";

import type {
  EntitledToolRefV1,
  TaskResourceEntitlementSnapshotV1,
} from "../application/task-resource-entitlement.js";

export type TaskToolCandidatePolicyInput = Readonly<{
  exactAgent: AgentDefinitionRevisionV1Alpha2;
  selectedSkillRefs: readonly Readonly<{
    skillId: string;
    revision: string;
    contentDigest: string;
  }>[];
  entitlementSnapshot: TaskResourceEntitlementSnapshotV1;
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
