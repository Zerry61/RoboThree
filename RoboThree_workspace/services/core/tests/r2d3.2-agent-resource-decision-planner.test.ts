import { describe, expect, it } from "vitest";

import {
  AgentResourceDecisionPlanner,
  AgentResourceDecisionPlannerError,
  BuiltInGeneralAgentSource,
  createAgentDefinitionRevisionV1Alpha2,
  createTaskResourceEntitlementSnapshotV1,
} from "../src/index.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const taskId = "019f7447-a784-77b2-a716-000000000001";
const modelA = { modelId: "model.alpha", revision: digest("a"), digest: digest("a") };
const modelB = { modelId: "model.beta", revision: digest("b"), digest: digest("b") };
const skill = { skillId: "skill.review", revision: digest("c"), contentDigest: digest("d") };
const tool = { capabilityId: "tool.document.read", capabilityRevision: digest("e") };
const knowledge = {
  knowledgeId: "knowledge.product",
  revision: digest("f"),
  contentDigest: digest("1"),
};

function fixture() {
  const entitlement = createTaskResourceEntitlementSnapshotV1({
    schemaVersion: "v1",
    subjectBindingDigest: digest("2"),
    authorityKind: "runtime_active_enterprise_identity",
    authorityRevision: digest("3"),
    observedAt: "2026-08-26T08:00:00.000Z",
    models: [
      { ...modelB, stableOrdinal: 10 },
      { ...modelA, stableOrdinal: 20 },
    ],
    skills: [{ ...skill, stableOrdinal: 10 }],
    tools: [{ ...tool, stableOrdinal: 10 }],
    knowledge: [{ ...knowledge, stableOrdinal: 10 }],
    identityEvidence: { testIdentityUsed: true, productionIdentityReady: false },
  });
  const agent = new BuiltInGeneralAgentSource().loadDefault();
  return {
    taskId,
    exactAgent: agent,
    exactEntitlementSnapshot: entitlement,
    acceptedSelectionRequest: {
      requestedModelId: "model.alpha",
      selectedSkillRefs: [skill],
      selectedKnowledgeRefs: [knowledge],
    },
    registrySnapshot: {
      schemaVersion: "v1" as const,
      registryRevision: digest("4"),
      models: [
        { ref: modelA, capabilities: modelCapabilities(), available: true },
        { ref: modelB, capabilities: modelCapabilities(), available: true },
      ],
      skills: [{ ref: skill, available: true, materialAvailable: true }],
      tools: [{ ref: tool, available: true }],
      knowledge: [{ ref: knowledge, available: true, materialAvailable: true }],
      knowledgeProviderReady: true,
    },
    workspaceAndAuthorizationFacts: {
      schemaVersion: "v1" as const,
      factsDigest: digest("5"),
      models: [modelA, modelB],
      skills: [skill],
      tools: [tool],
      knowledge: [knowledge],
    },
    taskToolCandidates: {
      registryRevision: digest("4"),
      authorityFactsDigest: digest("6"),
      candidates: [{ ...tool, stableOrdinal: 10 }],
    },
  };
}

function modelCapabilities(overrides: Partial<{
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  contextWindow: number;
}> = {}) {
  return {
    inputModalities: ["text"] as const,
    outputModalities: ["text"] as const,
    supportsToolCalling: overrides.supportsToolCalling ?? true,
    supportsStreaming: overrides.supportsStreaming ?? true,
    contextWindow: overrides.contextWindow ?? 16_384,
  };
}

function expectCode(run: () => unknown, code: string) {
  try {
    run();
    throw new Error("expected planner error");
  } catch (error) {
    expect(error).toBeInstanceOf(AgentResourceDecisionPlannerError);
    expect((error as AgentResourceDecisionPlannerError).code).toBe(code);
  }
}

describe("R2D-3.2 AgentResourceDecisionPlanner", () => {
  const planner = new AgentResourceDecisionPlanner();

  it("selects an exact explicit Model without fallback", () => {
    const decision = planner.plan(fixture());
    expect(decision.modelSelectionSource).toBe("explicit");
    expect(decision.requestedModelId).toBe("model.alpha");
    expect(decision.resolvedModelRef).toEqual(modelA);
  });

  it("rejects an ineligible explicit Model instead of falling back", () => {
    const input = fixture();
    expectCode(() => planner.plan({
      ...input,
      acceptedSelectionRequest: {
        ...input.acceptedSelectionRequest,
        requestedModelId: "model.missing",
      },
    }), "selection.model_rejected");
  });

  it("uses an exact eligible user preference when no explicit Model exists", () => {
    const input = fixture();
    const decision = planner.plan({
      ...input,
      acceptedSelectionRequest: {
        selectedSkillRefs: [],
        selectedKnowledgeRefs: [],
      },
      exactUserModelPreference: modelA,
      taskToolCandidates: { ...input.taskToolCandidates, candidates: [] },
    });
    expect(decision.modelSelectionSource).toBe("user_preference");
    expect(decision.resolvedModelRef).toEqual(modelA);
    expect(decision.requestedModelId).toBeUndefined();
  });

  it("ignores a stale preference and uses entitlement stable ordinal", () => {
    const input = fixture();
    const decision = planner.plan({
      ...input,
      acceptedSelectionRequest: { selectedSkillRefs: [], selectedKnowledgeRefs: [] },
      exactUserModelPreference: { ...modelA, revision: digest("7"), digest: digest("7") },
      taskToolCandidates: { ...input.taskToolCandidates, candidates: [] },
    });
    expect(decision.modelSelectionSource).toBe("stable_fallback");
    expect(decision.resolvedModelRef).toEqual(modelB);
  });

  it("uses entitlement ordinal rather than Registry or allowlist order", () => {
    const input = fixture();
    const restricted = createAgentDefinitionRevisionV1Alpha2({
      ...withoutIdentity(input.exactAgent),
      modelRestriction: { mode: "allowlist", references: [modelA, modelB] },
    });
    const decision = planner.plan({
      ...input,
      exactAgent: restricted,
      acceptedSelectionRequest: { selectedSkillRefs: [], selectedKnowledgeRefs: [] },
      registrySnapshot: {
        ...input.registrySnapshot,
        models: [...input.registrySnapshot.models].reverse(),
      },
      taskToolCandidates: { ...input.taskToolCandidates, candidates: [] },
    });
    expect(decision.resolvedModelRef).toEqual(modelB);
  });

  it("rejects an empty Model allowlist", () => {
    const input = fixture();
    const restricted = createAgentDefinitionRevisionV1Alpha2({
      ...withoutIdentity(input.exactAgent),
      modelRestriction: { mode: "allowlist", references: [] },
    });
    expectCode(() => planner.plan({
      ...input,
      exactAgent: restricted,
      acceptedSelectionRequest: { selectedSkillRefs: [], selectedKnowledgeRefs: [] },
      taskToolCandidates: { ...input.taskToolCandidates, candidates: [] },
    }), "selection.model_unavailable");
  });

  it("requires Tool Calling only when exact Tool candidates are nonempty", () => {
    const input = fixture();
    const noToolCalling = {
      ...input.registrySnapshot,
      models: input.registrySnapshot.models.map((entry) => ({
        ...entry,
        capabilities: modelCapabilities({ supportsToolCalling: false }),
      })),
    };
    expectCode(() => planner.plan({ ...input, registrySnapshot: noToolCalling }),
      "selection.model_rejected");
    expect(planner.plan({
      ...input,
      registrySnapshot: noToolCalling,
      acceptedSelectionRequest: { selectedSkillRefs: [], selectedKnowledgeRefs: [] },
      taskToolCandidates: { ...input.taskToolCandidates, candidates: [] },
    }).resolvedModelRef).toEqual(modelB);
  });

  it("does not auto-select Skill or Knowledge for unrestricted Agent", () => {
    const input = fixture();
    const decision = planner.plan({
      ...input,
      acceptedSelectionRequest: { requestedModelId: "model.alpha", selectedSkillRefs: [], selectedKnowledgeRefs: [] },
    });
    expect(decision.activeSkillRefs).toEqual([]);
    expect(decision.knowledgeRefs).toEqual([]);
  });

  it("rejects Skill revision drift", () => {
    const input = fixture();
    expectCode(() => planner.plan({
      ...input,
      acceptedSelectionRequest: {
        ...input.acceptedSelectionRequest,
        selectedSkillRefs: [{ ...skill, revision: digest("8") }],
      },
    }), "selection.skill_rejected");
  });

  it("classifies Registry exact revision drift as unavailable", () => {
    const input = fixture();
    expectCode(() => planner.plan({
      ...input,
      registrySnapshot: {
        ...input.registrySnapshot,
        models: input.registrySnapshot.models.map((entry) => entry.ref.modelId === "model.alpha"
          ? { ...entry, ref: { ...entry.ref, revision: digest("8"), digest: digest("8") } }
          : entry),
      },
    }), "selection.registry_unavailable");
  });

  it("fails closed when selected Knowledge has no ready provider", () => {
    const input = fixture();
    expectCode(() => planner.plan({
      ...input,
      registrySnapshot: { ...input.registrySnapshot, knowledgeProviderReady: false },
    }), "selection.knowledge_unavailable");
  });

  it("rejects Tool policy Registry drift", () => {
    const input = fixture();
    expectCode(() => planner.plan({
      ...input,
      taskToolCandidates: { ...input.taskToolCandidates, registryRevision: digest("9") },
    }), "selection.tool_policy_unavailable");
  });

  it("rejects Tool candidates that are not in exact permission intersection", () => {
    const input = fixture();
    expectCode(() => planner.plan({
      ...input,
      workspaceAndAuthorizationFacts: {
        ...input.workspaceAndAuthorizationFacts,
        tools: [],
      },
    }), "selection.tool_policy_unavailable");
  });

  it("honors empty Skill, Tool and Knowledge allowlists as explicit disablement", () => {
    const input = fixture();
    const restricted = createAgentDefinitionRevisionV1Alpha2({
      ...withoutIdentity(input.exactAgent),
      skillRestriction: { mode: "allowlist", references: [] },
      toolRestriction: { mode: "allowlist", references: [] },
      knowledgeRestriction: { mode: "allowlist", references: [] },
    });
    const decision = planner.plan({
      ...input,
      exactAgent: restricted,
      acceptedSelectionRequest: {
        requestedModelId: "model.alpha",
        selectedSkillRefs: [],
        selectedKnowledgeRefs: [],
      },
    });
    expect(decision.activeSkillRefs).toEqual([]);
    expect(decision.toolCandidateRefs).toEqual([]);
    expect(decision.knowledgeRefs).toEqual([]);
  });

  it("rejects entitlement digest drift before planning", () => {
    const input = fixture();
    expectCode(() => planner.plan({
      ...input,
      exactEntitlementSnapshot: {
        ...input.exactEntitlementSnapshot,
        snapshotDigest: digest("0"),
      },
    }), "selection.entitlement_invalid");
  });

  it("is deterministic and does not mutate its inputs", () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const digests = Array.from({ length: 10 }, () => planner.plan(input).decisionDigest);
    expect(new Set(digests).size).toBe(1);
    expect(JSON.stringify(input)).toBe(before);
  });
});

function withoutIdentity(agent: ReturnType<BuiltInGeneralAgentSource["loadDefault"]>) {
  const { revision: _revision, digest: _digest, ...material } = agent;
  return material;
}
