import type { ReadableTaskResourceEntitlementSnapshot } from "../application/task-resource-entitlement.js";

export type TaskResourceEntitlementLoadInput = Readonly<{
  acceptanceLeaseId: string;
  verifiedRuntimeSubjectBindingDigest: string;
  acceptedClientBindingDigest: string;
  requestedAgentRef: Readonly<{
    agentDefinitionId: string;
    revision: string;
    digest: string;
  }>;
}>;

export interface TaskResourceEntitlementSource {
  loadExact(
    input: TaskResourceEntitlementLoadInput,
  ): Promise<ReadableTaskResourceEntitlementSnapshot>;
}
