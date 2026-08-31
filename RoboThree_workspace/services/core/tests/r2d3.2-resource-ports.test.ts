import { describe, expect, it } from "vitest";

import {
  BUILT_IN_GENERAL_AGENT_REVISION,
  BuiltInGeneralAgentSource,
  createTaskResourceEntitlementSnapshotV1,
} from "../src/index.js";
import {
  StrictTestTaskResourceEntitlementSource,
  StrictTestTaskToolCandidatePolicy,
} from "./support/r2d3.2-strict-resource-adapters.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}`;

function snapshot() {
  return createTaskResourceEntitlementSnapshotV1({
    schemaVersion: "v1",
    subjectBindingDigest: digest("1"),
    authorityKind: "runtime_active_enterprise_identity",
    authorityRevision: digest("2"),
    observedAt: "2026-08-26T08:00:00.000Z",
    models: [],
    skills: [],
    tools: [{
      capabilityId: "tool.document.read",
      capabilityRevision: digest("3"),
      stableOrdinal: 10,
    }],
    knowledge: [],
    identityEvidence: { testIdentityUsed: true, productionIdentityReady: false },
  });
}

describe("R2D-3.2 strict test-only resource adapters", () => {
  it("loads an exact Entitlement snapshot once", async () => {
    const adapter = new StrictTestTaskResourceEntitlementSource(digest("1"), snapshot());
    const result = await adapter.loadExact({
      acceptanceLeaseId: "019f7447-a784-77b2-a716-0000000000a1",
      verifiedRuntimeSubjectBindingDigest: digest("1"),
      acceptedClientBindingDigest: digest("4"),
      requestedAgentRef: {
        agentDefinitionId: "agent.general",
        revision: BUILT_IN_GENERAL_AGENT_REVISION,
        digest: BUILT_IN_GENERAL_AGENT_REVISION,
      },
    });
    expect(result).toEqual(snapshot());
    expect(adapter.loadCount).toBe(1);
  });

  it("fails closed on subject drift", async () => {
    const adapter = new StrictTestTaskResourceEntitlementSource(digest("1"), snapshot());
    await expect(adapter.loadExact({
      acceptanceLeaseId: "019f7447-a784-77b2-a716-0000000000a2",
      verifiedRuntimeSubjectBindingDigest: digest("5"),
      acceptedClientBindingDigest: digest("4"),
      requestedAgentRef: {
        agentDefinitionId: "agent.general",
        revision: BUILT_IN_GENERAL_AGENT_REVISION,
        digest: BUILT_IN_GENERAL_AGENT_REVISION,
      },
    })).rejects.toThrow("selection.entitlement_subject_drift");
    expect(adapter.loadCount).toBe(1);
  });

  it("resolves exact Tool candidates once", async () => {
    const result = {
      registryRevision: digest("6"),
      authorityFactsDigest: digest("7"),
      candidates: snapshot().tools,
    };
    const adapter = new StrictTestTaskToolCandidatePolicy(result);
    await expect(adapter.resolveExact({
      exactAgent: new BuiltInGeneralAgentSource().loadDefault(),
      selectedSkillRefs: [],
      entitlementSnapshot: snapshot(),
      registryRevision: digest("6"),
      workspaceAndAuthorizationFactsDigest: digest("8"),
    })).resolves.toEqual(result);
    expect(adapter.resolveCount).toBe(1);
  });

  it("fails closed on Tool policy Registry drift", async () => {
    const adapter = new StrictTestTaskToolCandidatePolicy({
      registryRevision: digest("6"),
      authorityFactsDigest: digest("7"),
      candidates: [],
    });
    await expect(adapter.resolveExact({
      exactAgent: new BuiltInGeneralAgentSource().loadDefault(),
      selectedSkillRefs: [],
      entitlementSnapshot: snapshot(),
      registryRevision: digest("9"),
      workspaceAndAuthorizationFactsDigest: digest("8"),
    })).rejects.toThrow("selection.tool_policy_registry_drift");
  });
});
