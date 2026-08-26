import { describe, expect, it } from "vitest";

import {
  AgentResourceDecisionV1Schema,
  R2D3_PRODUCTION_ENTERPRISE_ENTITLEMENT_READY,
  TaskResourceEntitlementSnapshotV1Schema,
  createAgentResourceDecisionV1,
  createTaskResourceEntitlementSnapshotV1,
  hasValidAgentResourceDecisionV1,
  hasValidTaskResourceEntitlementSnapshotV1,
} from "../src/index.js";

const id = (suffix: string) =>
  `019f7447-a784-77b2-a716-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;

function entitlement() {
  return {
    schemaVersion: "v1",
    subjectBindingDigest: digest("0"),
    authorityKind: "runtime_active_enterprise_identity",
    authorityRevision: digest("1"),
    observedAt: "2026-08-26T08:00:00.000Z",
    models: [
      { modelId: "model.first", revision: digest("2"), digest: digest("2"), stableOrdinal: 10 },
      { modelId: "model.second", revision: digest("3"), digest: digest("3"), stableOrdinal: 20 },
    ],
    skills: [{
      skillId: "skill.review",
      revision: digest("4"),
      contentDigest: digest("5"),
      stableOrdinal: 10,
    }],
    tools: [{
      capabilityId: "tool.document.read",
      capabilityRevision: digest("6"),
      stableOrdinal: 10,
    }],
    knowledge: [{
      knowledgeId: "knowledge.product",
      revision: digest("7"),
      contentDigest: digest("8"),
      stableOrdinal: 10,
    }],
    identityEvidence: {
      testIdentityUsed: true,
      productionIdentityReady: false,
    },
  } as const;
}

function decision(source: "explicit" | "user_preference" | "stable_fallback" = "explicit") {
  const snapshot = createTaskResourceEntitlementSnapshotV1(entitlement());
  const model = entitlement().models[0];
  const skill = entitlement().skills[0];
  const tool = entitlement().tools[0];
  const knowledge = entitlement().knowledge[0];
  return {
    schemaVersion: "v1",
    taskId: id("1"),
    agentRef: {
      agentDefinitionId: "agent.general",
      revision: digest("9"),
      digest: digest("9"),
    },
    entitlementSnapshotDigest: snapshot.snapshotDigest,
    registryRevision: digest("a"),
    modelSelectionSource: source,
    ...(source === "explicit" ? { requestedModelId: "model.first" } : {}),
    resolvedModelRef: {
      modelId: model.modelId,
      revision: model.revision,
      digest: model.digest,
    },
    activeSkillRefs: [{
      skillId: skill.skillId,
      revision: skill.revision,
      contentDigest: skill.contentDigest,
    }],
    toolCandidateRefs: [{
      capabilityId: tool.capabilityId,
      capabilityRevision: tool.capabilityRevision,
    }],
    knowledgeRefs: [{
      knowledgeId: knowledge.knowledgeId,
      revision: knowledge.revision,
      contentDigest: knowledge.contentDigest,
    }],
  } as const;
}

describe("R2D-3.1 Task Resource Entitlement Snapshot", () => {
  it("creates and revalidates a strict content-free snapshot", () => {
    const snapshot = createTaskResourceEntitlementSnapshotV1(entitlement());
    expect(TaskResourceEntitlementSnapshotV1Schema.parse(snapshot)).toEqual(snapshot);
    expect(hasValidTaskResourceEntitlementSnapshotV1(snapshot)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/tenant|credential|endpoint|secret/iu);
  });

  it("binds authority, resources, ordinals and identity evidence into the digest", () => {
    const baseline = createTaskResourceEntitlementSnapshotV1(entitlement()).snapshotDigest;
    const variants = [
      { ...entitlement(), authorityRevision: digest("b") },
      { ...entitlement(), models: [{ ...entitlement().models[0], stableOrdinal: 11 }, entitlement().models[1]] },
      { ...entitlement(), tools: [{ ...entitlement().tools[0], capabilityRevision: digest("c") }] },
      { ...entitlement(), identityEvidence: { testIdentityUsed: false, productionIdentityReady: false } },
    ] as const;
    for (const variant of variants) {
      expect(createTaskResourceEntitlementSnapshotV1(variant).snapshotDigest)
        .not.toBe(baseline);
    }
  });

  it("rejects test identity masquerading as production ready", () => {
    expect(() => createTaskResourceEntitlementSnapshotV1({
      ...entitlement(),
      identityEvidence: { testIdentityUsed: true, productionIdentityReady: true },
    })).toThrow("test identity");
  });

  it("rejects duplicate resource IDs", () => {
    expect(() => createTaskResourceEntitlementSnapshotV1({
      ...entitlement(),
      models: [entitlement().models[0], entitlement().models[0]],
    })).toThrow("IDs must be unique");
  });

  it("rejects duplicate ordinals", () => {
    expect(() => createTaskResourceEntitlementSnapshotV1({
      ...entitlement(),
      models: [entitlement().models[0], { ...entitlement().models[1], stableOrdinal: 10 }],
    })).toThrow("ordinals must be unique");
  });

  it("requires stable ordinal order instead of authored allowlist order", () => {
    expect(() => createTaskResourceEntitlementSnapshotV1({
      ...entitlement(),
      models: [...entitlement().models].reverse(),
    })).toThrow("stable ordinal order");
  });

  it("enforces bounded nonnegative ordinals", () => {
    for (const stableOrdinal of [-1, 2_147_483_648]) {
      expect(() => createTaskResourceEntitlementSnapshotV1({
        ...entitlement(),
        models: [{ ...entitlement().models[0], stableOrdinal }],
      })).toThrow();
    }
  });

  it("enforces per-family resource bounds", () => {
    expect(() => createTaskResourceEntitlementSnapshotV1({
      ...entitlement(),
      models: Array.from({ length: 65 }, (_, index) => ({
        ...entitlement().models[0],
        modelId: `model.bound-${index}`,
        stableOrdinal: index,
      })),
    })).toThrow();
  });

  it("rejects exact Model revision drift", () => {
    expect(() => createTaskResourceEntitlementSnapshotV1({
      ...entitlement(),
      models: [{ ...entitlement().models[0], digest: digest("f") }],
    })).toThrow("revision and digest");
  });

  it("rejects raw subject, credential and Endpoint fields", () => {
    for (const forbidden of [
      { rawSubject: "tenant/user/device" },
      { credentialRef: "secret:key" },
      { endpoint: "https://provider.invalid" },
    ]) expect(() => TaskResourceEntitlementSnapshotV1Schema.parse({
      ...createTaskResourceEntitlementSnapshotV1(entitlement()),
      ...forbidden,
    })).toThrow();
  });

  it("detects digest drift without skipping the record", () => {
    const snapshot = createTaskResourceEntitlementSnapshotV1(entitlement());
    expect(hasValidTaskResourceEntitlementSnapshotV1({
      ...snapshot,
      snapshotDigest: digest("f"),
    })).toBe(false);
  });

  it("keeps production enterprise entitlement disabled", () => {
    expect(R2D3_PRODUCTION_ENTERPRISE_ENTITLEMENT_READY).toBe(false);
  });
});

describe("R2D-3.1 Agent Resource Decision", () => {
  it("creates and revalidates an exact final decision", () => {
    const record = createAgentResourceDecisionV1(decision());
    expect(AgentResourceDecisionV1Schema.parse(record)).toEqual(record);
    expect(hasValidAgentResourceDecisionV1(record)).toBe(true);
  });

  it("binds entitlement, Registry and final exact refs into the digest", () => {
    const baseline = createAgentResourceDecisionV1(decision()).decisionDigest;
    for (const variant of [
      { ...decision(), registryRevision: digest("b") },
      { ...decision(), entitlementSnapshotDigest: digest("c") },
      { ...decision(), activeSkillRefs: [] },
    ]) expect(createAgentResourceDecisionV1(variant).decisionDigest).not.toBe(baseline);
  });

  it("requires exact explicit Model selection", () => {
    expect(() => createAgentResourceDecisionV1({
      ...decision(),
      requestedModelId: "model.second",
    })).toThrow("exact requested Model");
    expect(() => createAgentResourceDecisionV1({
      ...decision(),
      requestedModelId: undefined,
    })).toThrow("exact requested Model");
  });

  it("forbids requested Model IDs on preference and fallback", () => {
    for (const source of ["user_preference", "stable_fallback"] as const) {
      expect(createAgentResourceDecisionV1(decision(source))).toBeDefined();
      expect(() => createAgentResourceDecisionV1({
        ...decision(source),
        requestedModelId: "model.first",
      })).toThrow("exact requested Model");
    }
  });

  it("rejects duplicate portable decision refs", () => {
    expect(() => createAgentResourceDecisionV1({
      ...decision(),
      activeSkillRefs: [decision().activeSkillRefs[0], decision().activeSkillRefs[0]],
    })).toThrow("Skill decision refs must be unique");
  });

  it("rejects raw entitlement, owner and Provider-private fields", () => {
    for (const forbidden of [
      { entitlement: entitlement() },
      { owner: "user:1" },
      { credential: "secret" },
      { effort: "max" },
    ]) expect(() => AgentResourceDecisionV1Schema.parse({
      ...createAgentResourceDecisionV1(decision()),
      ...forbidden,
    })).toThrow();
  });

  it("detects Decision digest drift", () => {
    const record = createAgentResourceDecisionV1(decision());
    expect(hasValidAgentResourceDecisionV1({
      ...record,
      decisionDigest: digest("f"),
    })).toBe(false);
  });
});
