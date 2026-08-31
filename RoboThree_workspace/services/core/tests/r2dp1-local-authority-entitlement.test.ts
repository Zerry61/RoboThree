import { createHmac } from "node:crypto";

import { canonicalJsonStringify } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  AgentResourceDecisionPlanner,
  BuiltInGeneralAgentSource,
  LOCAL_DESKTOP_OWNER_HMAC_DOMAIN,
  LOCAL_DESKTOP_SUBJECT_SCOPE,
  LocalDesktopSubjectAuthorityError,
  TaskResourceEntitlementSnapshotV2Schema,
  TaskResourceSubjectAuthorityV1Schema,
  createPersonalModelOwnerNamespace,
  createTaskResourceEntitlementSnapshotV2,
  deriveLocalDesktopSubjectAuthority,
  hasValidTaskResourceEntitlementSnapshotV2,
  parseAndNormalizeTaskResourceEntitlementSnapshot,
  parseReadableTaskResourceEntitlementSnapshot,
  validateLocalDesktopSubjectAuthority,
} from "../src/index.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}`;

function namespace(marker = 7) {
  return createPersonalModelOwnerNamespace({
    namespaceRevision: 1,
    namespaceKey: new Uint8Array(32).fill(marker),
    createdAt: "2026-08-27T00:00:00.000Z",
  });
}

function entitlement() {
  const authority = deriveLocalDesktopSubjectAuthority(namespace());
  return createTaskResourceEntitlementSnapshotV2({
    schemaVersion: "v2",
    subjectBindingDigest: authority.ownerScopeDigest,
    authorityKind: "local_desktop_owner",
    authorityRevision: authority.authorityRevision,
    observedAt: "2026-08-27T00:00:00.000Z",
    models: [{
      modelId: "model.personal.openai",
      revision: digest("1"),
      digest: digest("1"),
      stableOrdinal: 10,
    }],
    skills: [],
    tools: [],
    knowledge: [],
    identityEvidence: {
      localAuthorityReady: true,
      enterpriseIdentityReady: false,
      testIdentityUsed: false,
    },
  });
}

describe("LDA-1 Local Desktop Subject Authority", () => {
  it("derives the exact independent HMAC authority and leaves the caller key intact", () => {
    const source = namespace();
    const before = Uint8Array.from(source.namespaceKey);
    const authority = deriveLocalDesktopSubjectAuthority(source);
    const canonical = canonicalJsonStringify({
      schemaVersion: "v1",
      scope: LOCAL_DESKTOP_SUBJECT_SCOPE,
    });
    const expected = `sha256:${createHmac("sha256", before)
      .update(LOCAL_DESKTOP_OWNER_HMAC_DOMAIN, "utf8")
      .update(canonical, "utf8")
      .digest("hex")}`;
    expect(authority).toMatchObject({
      authorityKind: "local_desktop_owner",
      ownerScopeNamespaceRevision: 1,
      ownerScopeDigest: expected,
      identityEvidence: {
        productionLocalAuthorityReady: true,
        productionEnterpriseIdentityReady: false,
        testIdentityUsed: false,
      },
    });
    expect(source.namespaceKey).toEqual(before);
  });

  it("is deterministic per namespace and changes for a different namespace key", () => {
    const first = deriveLocalDesktopSubjectAuthority(namespace(7));
    expect(deriveLocalDesktopSubjectAuthority(namespace(7))).toEqual(first);
    expect(deriveLocalDesktopSubjectAuthority(namespace(8)).ownerScopeDigest)
      .not.toBe(first.ownerScopeDigest);
  });

  it("fails closed on authority drift", () => {
    const source = namespace();
    const authority = deriveLocalDesktopSubjectAuthority(source);
    expect(() => validateLocalDesktopSubjectAuthority(source, {
      ...authority,
      ownerScopeDigest: digest("f"),
    })).toThrow(LocalDesktopSubjectAuthorityError);
  });

  it("keeps local, enterprise and test-only authority branches mutually exclusive", () => {
    expect(TaskResourceSubjectAuthorityV1Schema.parse(
      deriveLocalDesktopSubjectAuthority(namespace()),
    ).authorityKind).toBe("local_desktop_owner");
    expect(() => TaskResourceSubjectAuthorityV1Schema.parse({
      schemaVersion: "v1",
      authorityKind: "runtime_active_enterprise_identity",
      subjectBindingDigest: digest("1"),
      authorityRevision: digest("2"),
      identityEvidence: {
        productionLocalAuthorityReady: true,
        productionEnterpriseIdentityReady: true,
        testIdentityUsed: false,
      },
    })).toThrow();
  });
});

describe("R2D-P.1 Task Resource Entitlement v2", () => {
  it("creates and validates a strict local-only entitlement snapshot", () => {
    const snapshot = entitlement();
    expect(TaskResourceEntitlementSnapshotV2Schema.parse(snapshot)).toEqual(snapshot);
    expect(hasValidTaskResourceEntitlementSnapshotV2(snapshot)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/namespaceKey|credential|endpoint|secret/iu);
  });

  it("single-dispatches v2 and rejects unknown or corrupt versions without v1 fallback", () => {
    const snapshot = entitlement();
    expect(parseReadableTaskResourceEntitlementSnapshot(snapshot)).toEqual(snapshot);
    expect(() => parseReadableTaskResourceEntitlementSnapshot({
      ...snapshot,
      schemaVersion: "v3",
    })).toThrow("selection.entitlement_version_invalid");
    expect(() => parseReadableTaskResourceEntitlementSnapshot({
      ...snapshot,
      snapshotDigest: digest("9"),
    })).toThrow("selection.entitlement_invalid");
  });

  it("normalizes v2 into the single Planner view", () => {
    const normalized = parseAndNormalizeTaskResourceEntitlementSnapshot(entitlement());
    expect(normalized.authorityKind).toBe("local_desktop_owner");
    expect(normalized.models.map((model) => model.modelId))
      .toEqual(["model.personal.openai"]);
    expect("identityEvidence" in normalized).toBe(false);
  });

  it("rejects non-local flags and unstable ordinal order", () => {
    const snapshot = entitlement();
    expect(() => TaskResourceEntitlementSnapshotV2Schema.parse({
      ...snapshot,
      identityEvidence: {
        localAuthorityReady: true,
        enterpriseIdentityReady: true,
        testIdentityUsed: false,
      },
    })).toThrow();
    expect(() => createTaskResourceEntitlementSnapshotV2({
      ...withoutDigest(snapshot),
      models: [
        { ...snapshot.models[0]!, stableOrdinal: 20 },
        {
          modelId: "model.personal.beta",
          revision: digest("2"),
          digest: digest("2"),
          stableOrdinal: 10,
        },
      ],
    })).toThrow("stable ordinal order");
  });

  it("lets the existing single Planner consume v2 without duplicating intersection logic", () => {
    const snapshot = entitlement();
    const model = snapshot.models[0]!;
    const decision = new AgentResourceDecisionPlanner().plan({
      taskId: "019f7447-a784-77b2-a716-000000000001",
      exactAgent: new BuiltInGeneralAgentSource().loadDefault(),
      exactEntitlementSnapshot: snapshot,
      acceptedSelectionRequest: {
        requestedModelId: model.modelId,
        selectedSkillRefs: [],
        selectedKnowledgeRefs: [],
      },
      registrySnapshot: {
        schemaVersion: "v1",
        registryRevision: digest("3"),
        models: [{
          ref: { modelId: model.modelId, revision: model.revision, digest: model.digest },
          capabilities: {
            inputModalities: ["text"],
            outputModalities: ["text"],
            supportsToolCalling: false,
            supportsStreaming: false,
            contextWindow: 16_384,
          },
          available: true,
        }],
        skills: [],
        tools: [],
        knowledge: [],
        knowledgeProviderReady: false,
      },
      workspaceAndAuthorizationFacts: {
        schemaVersion: "v1",
        factsDigest: digest("4"),
        models: [{ modelId: model.modelId, revision: model.revision, digest: model.digest }],
        skills: [],
        tools: [],
        knowledge: [],
      },
      taskToolCandidates: {
        registryRevision: digest("3"),
        authorityFactsDigest: digest("5"),
        candidates: [],
      },
    });
    expect(decision.entitlementSnapshotDigest).toBe(snapshot.snapshotDigest);
    expect(decision.resolvedModelRef.modelId).toBe(model.modelId);
  });
});

function withoutDigest(snapshot: ReturnType<typeof entitlement>) {
  const { snapshotDigest: _digest, ...material } = snapshot;
  return material;
}
