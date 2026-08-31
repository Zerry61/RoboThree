import type { TaskCapabilityLock } from "@robothree/contracts";
import type { AgentModelRestrictionRefV1Alpha2 } from
  "@robothree/contracts/runtime-selection/agent-definition/v1alpha2";

import type {
  AgentResourceDecisionV1,
} from "../application/task-resource-entitlement.js";
export type TaskLockedPersonalOwnerIdentity = Readonly<{
  ownerIdentity: Readonly<{
    ownerScopeNamespaceRevision: number;
    ownerScopeDigest: string;
  }>;
}>;
import type {
  AgentResourceRegistrySnapshotV1,
  ExactResourcePermissionsV1,
} from "../application/agent-resource-decision-planner.js";
import type { ReadableAgentDefinitionRevision } from
  "../application/agent-definition-v1alpha2.js";

export type R2D3AcceptedSubjectBindings = Readonly<{
  acceptanceLeaseId: string;
  verifiedRuntimeSubjectBindingDigest: string;
  acceptedClientBindingDigest: string;
}>;

export interface R2D3AcceptanceAuthority {
  loadExactAgent(agentId: string): Promise<ReadableAgentDefinitionRevision | undefined>;
  captureSubjectBindings(input: Readonly<{
    desktopSessionId: string;
    internalSessionId: string;
  }>): Promise<R2D3AcceptedSubjectBindings>;
  captureRegistrySnapshot(input: Readonly<{
    acceptanceLeaseId: string;
  }>): Promise<AgentResourceRegistrySnapshotV1>;
  captureWorkspaceAndAuthorizationFacts(input: Readonly<{
    acceptanceLeaseId: string;
    workspaceGrantId?: string;
  }>): Promise<ExactResourcePermissionsV1>;
  loadExactUserModelPreference(input: Readonly<{
    acceptanceLeaseId: string;
  }>): Promise<AgentModelRestrictionRefV1Alpha2 | undefined>;
  loadPersonalOwnerAuthority?(input: Readonly<{
    acceptanceLeaseId: string;
  }>): Promise<TaskLockedPersonalOwnerIdentity | undefined>;
  prepareExactCapabilityLocks(input: Readonly<{
    acceptanceLeaseId: string;
    taskId: string;
    decision: AgentResourceDecisionV1;
    registrySnapshot: AgentResourceRegistrySnapshotV1;
    orderedLockIds: readonly string[];
    lockedAt: string;
  }>): Promise<readonly TaskCapabilityLock[]>;
  releaseAcceptanceLease?(input: Readonly<{
    acceptanceLeaseId: string;
  }>): void | Promise<void>;
}
