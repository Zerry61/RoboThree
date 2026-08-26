import {
  AgentDefinitionRevisionV1Alpha2MaterialSchema,
  AgentDefinitionRevisionV1Alpha2Schema,
  AgentKnowledgeRestrictionV1Alpha2Schema,
  AgentModelRestrictionV1Alpha2Schema,
  AgentSkillRestrictionV1Alpha2Schema,
  AgentToolRestrictionV1Alpha2Schema,
} from "@robothree/contracts/runtime-selection/agent-definition/v1alpha2";
import { describe, expect, it } from "vitest";

const digest = (value: string) => `sha256:${value.repeat(64)}`;

function exactRestrictions() {
  return {
    modelRestriction: {
      mode: "allowlist" as const,
      references: [{ modelId: "model.enterprise", revision: digest("1"), digest: digest("1") }],
    },
    skillRestriction: {
      mode: "allowlist" as const,
      references: [{ skillId: "skill.review", revision: digest("2"), contentDigest: digest("3") }],
    },
    toolRestriction: {
      mode: "allowlist" as const,
      references: [{ capabilityId: "tool.document.read", capabilityRevision: digest("4") }],
    },
    knowledgeRestriction: {
      mode: "allowlist" as const,
      references: [{
        knowledgeId: "knowledge.product",
        revision: digest("5"),
        contentDigest: digest("6"),
      }],
    },
  };
}

function material() {
  return {
    schemaVersion: "v1alpha2" as const,
    agentDefinitionId: "agent.reviewer",
    managementClass: "managed" as const,
    name: "Reviewer",
    identity: "A review assistant",
    goal: "Review authorized material",
    instructions: "Use only explicitly selected resources.",
    ...exactRestrictions(),
    requiredModelCapabilities: {
      inputModalities: ["text" as const],
      outputModalities: ["text" as const],
      supportsToolCalling: true,
      supportsStreaming: true,
    },
    createdAt: "2026-08-26T00:00:00.000Z",
  };
}

describe("R2D-2 Agent Definition v1alpha2 Contract", () => {
  it("parses all four unrestricted restrictions without references", () => {
    const parsed = AgentDefinitionRevisionV1Alpha2MaterialSchema.parse({
      ...material(),
      modelRestriction: { mode: "unrestricted" },
      skillRestriction: { mode: "unrestricted" },
      toolRestriction: { mode: "unrestricted" },
      knowledgeRestriction: { mode: "unrestricted" },
    });
    expect(parsed.modelRestriction).toEqual({ mode: "unrestricted" });
  });

  it("roundtrips all four non-empty exact allowlists", () => {
    expect(AgentDefinitionRevisionV1Alpha2MaterialSchema.parse(material()))
      .toEqual(material());
  });

  it("preserves empty allowlists instead of widening them to unrestricted", () => {
    const parsed = AgentDefinitionRevisionV1Alpha2MaterialSchema.parse({
      ...material(),
      modelRestriction: { mode: "allowlist", references: [] },
      skillRestriction: { mode: "allowlist", references: [] },
      toolRestriction: { mode: "allowlist", references: [] },
      knowledgeRestriction: { mode: "allowlist", references: [] },
    });
    for (const restriction of [
      parsed.modelRestriction,
      parsed.skillRestriction,
      parsed.toolRestriction,
      parsed.knowledgeRestriction,
    ]) expect(restriction).toEqual({ mode: "allowlist", references: [] });
  });

  it("rejects references on unrestricted and missing references on allowlist", () => {
    for (const schema of [
      AgentModelRestrictionV1Alpha2Schema,
      AgentSkillRestrictionV1Alpha2Schema,
      AgentToolRestrictionV1Alpha2Schema,
      AgentKnowledgeRestrictionV1Alpha2Schema,
    ]) {
      expect(() => schema.parse({ mode: "unrestricted", references: [] })).toThrow();
      expect(() => schema.parse({ mode: "allowlist" })).toThrow();
    }
  });

  it("rejects missing, null, boolean and legacy restriction representations", () => {
    for (const invalid of [undefined, null, true, false, "", { enabled: true }, { restricted: false }]) {
      expect(() => AgentModelRestrictionV1Alpha2Schema.parse(invalid)).toThrow();
    }
  });

  it("rejects duplicate IDs for every resource family", () => {
    const restrictions = exactRestrictions();
    for (const [schema, restriction] of [
      [AgentModelRestrictionV1Alpha2Schema, restrictions.modelRestriction],
      [AgentSkillRestrictionV1Alpha2Schema, restrictions.skillRestriction],
      [AgentToolRestrictionV1Alpha2Schema, restrictions.toolRestriction],
      [AgentKnowledgeRestrictionV1Alpha2Schema, restrictions.knowledgeRestriction],
    ] as const) {
      const reference = restriction.references[0];
      expect(() => schema.parse({ mode: "allowlist", references: [reference, reference] })).toThrow(
        "restriction IDs must be unique",
      );
    }
  });

  it("rejects model revision drift and wrong capability kinds", () => {
    expect(() => AgentModelRestrictionV1Alpha2Schema.parse({
      mode: "allowlist",
      references: [{ modelId: "model.enterprise", revision: digest("1"), digest: digest("2") }],
    })).toThrow("revision and digest");
    expect(() => AgentModelRestrictionV1Alpha2Schema.parse({
      mode: "allowlist",
      references: [{ modelId: "tool.wrong", revision: digest("1"), digest: digest("1") }],
    })).toThrow();
    expect(() => AgentToolRestrictionV1Alpha2Schema.parse({
      mode: "allowlist",
      references: [{ capabilityId: "model.wrong", capabilityRevision: digest("1") }],
    })).toThrow();
  });

  it("rejects runtime-only or provider-private fields in portable references", () => {
    const restrictions = exactRestrictions();
    expect(() => AgentSkillRestrictionV1Alpha2Schema.parse({
      mode: "allowlist",
      references: [{ ...restrictions.skillRestriction.references[0], materializedRef: "file:/tmp/x" }],
    })).toThrow();
    expect(() => AgentKnowledgeRestrictionV1Alpha2Schema.parse({
      mode: "allowlist",
      references: [{ ...restrictions.knowledgeRestriction.references[0], materializedRef: "index:/tmp/x" }],
    })).toThrow();
    expect(() => AgentToolRestrictionV1Alpha2Schema.parse({
      mode: "allowlist",
      references: [{ ...restrictions.toolRestriction.references[0], credentialRef: "secret:key" }],
    })).toThrow();
  });

  it("enforces resource bounds", () => {
    const model = exactRestrictions().modelRestriction.references[0];
    const tool = exactRestrictions().toolRestriction.references[0];
    expect(() => AgentModelRestrictionV1Alpha2Schema.parse({
      mode: "allowlist",
      references: Array.from({ length: 65 }, (_, index) => ({
        ...model,
        modelId: `model.bound-${index}`,
      })),
    })).toThrow();
    expect(() => AgentToolRestrictionV1Alpha2Schema.parse({
      mode: "allowlist",
      references: Array.from({ length: 129 }, (_, index) => ({
        ...tool,
        capabilityId: `tool.bound-${index}`,
      })),
    })).toThrow();
  });

  it("rejects legacy, owner, endpoint and inactive draft fields", () => {
    for (const forbidden of [
      { defaultModelId: "model.default" },
      { allowModelOverride: true },
      { owner: "user:1" },
      { entitlement: {} },
      { endpoint: "https://provider.invalid" },
      { inactiveSelections: [] },
    ]) expect(() => AgentDefinitionRevisionV1Alpha2MaterialSchema.parse({
      ...material(),
      ...forbidden,
    })).toThrow();
  });

  it("requires exact record revision and digest identity", () => {
    expect(AgentDefinitionRevisionV1Alpha2Schema.parse({
      ...material(),
      revision: digest("a"),
      digest: digest("a"),
    })).toBeDefined();
    expect(() => AgentDefinitionRevisionV1Alpha2Schema.parse({
      ...material(),
      revision: digest("a"),
      digest: digest("b"),
    })).toThrow("revision and digest");
  });

  it("preserves authored reference order without sorting", () => {
    const first = { modelId: "model.first", revision: digest("1"), digest: digest("1") };
    const second = { modelId: "model.second", revision: digest("2"), digest: digest("2") };
    const parsed = AgentModelRestrictionV1Alpha2Schema.parse({
      mode: "allowlist",
      references: [second, first],
    });
    expect(parsed.references.map((reference) => reference.modelId))
      .toEqual(["model.second", "model.first"]);
  });
});
