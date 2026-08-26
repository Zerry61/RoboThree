import type { TaskResourceEntitlementSnapshotV1 } from "../application/task-resource-entitlement.js";

export type TaskResourceEntitlementLoadInput = Readonly<{
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
  ): Promise<TaskResourceEntitlementSnapshotV1>;
}
