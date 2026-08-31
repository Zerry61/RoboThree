import { Sha256DigestSchema } from "@robothree/contracts";
import { z } from "zod";

import {
  TaskResourceEntitlementSnapshotV1Schema,
  hasValidTaskResourceEntitlementSnapshotV1,
  parseReadableTaskResourceEntitlementSnapshot,
  parseReadableAgentDefinitionRevision,
  type TaskResourceEntitlementLoadInput,
  type TaskResourceEntitlementSnapshotV1,
  type TaskResourceEntitlementSource,
  type TaskToolCandidatePolicy,
  type TaskToolCandidatePolicyInput,
  type TaskToolCandidatePolicyResult,
} from "../../src/index.js";

const LoadInputSchema = z.object({
  acceptanceLeaseId: z.string().uuid(),
  verifiedRuntimeSubjectBindingDigest: Sha256DigestSchema,
  acceptedClientBindingDigest: Sha256DigestSchema,
  requestedAgentRef: z.object({
    agentDefinitionId: z.string().min(1).max(256),
    revision: Sha256DigestSchema,
    digest: Sha256DigestSchema,
  }).strict().refine((ref) => ref.revision === ref.digest),
}).strict();

export class StrictTestTaskResourceEntitlementSource
implements TaskResourceEntitlementSource {
  loadCount = 0;

  constructor(
    private readonly expectedSubjectDigest: string,
    private readonly snapshot: TaskResourceEntitlementSnapshotV1,
  ) {}

  async loadExact(input: TaskResourceEntitlementLoadInput) {
    this.loadCount += 1;
    const parsed = LoadInputSchema.parse(input);
    if (parsed.verifiedRuntimeSubjectBindingDigest !== this.expectedSubjectDigest) {
      throw new Error("selection.entitlement_subject_drift");
    }
    const snapshot = TaskResourceEntitlementSnapshotV1Schema.parse(this.snapshot);
    if (!hasValidTaskResourceEntitlementSnapshotV1(snapshot)) {
      throw new Error("selection.entitlement_invalid");
    }
    return structuredClone(snapshot);
  }
}

export class StrictTestTaskToolCandidatePolicy implements TaskToolCandidatePolicy {
  resolveCount = 0;

  constructor(private readonly result: TaskToolCandidatePolicyResult) {}

  async resolveExact(input: TaskToolCandidatePolicyInput) {
    this.resolveCount += 1;
    parseReadableAgentDefinitionRevision(input.exactAgent);
    parseReadableTaskResourceEntitlementSnapshot(input.entitlementSnapshot);
    if (input.registryRevision !== this.result.registryRevision) {
      throw new Error("selection.tool_policy_registry_drift");
    }
    Sha256DigestSchema.parse(input.workspaceAndAuthorizationFactsDigest);
    return structuredClone(this.result);
  }
}
