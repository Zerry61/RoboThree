import {
  createAgentDefinitionRevision,
  createAgentDefinitionRevisionV1Alpha2,
  hasValidAgentDefinitionRevisionV1Alpha2,
  ReadableAgentDefinitionInterpreter,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
const interpreter = new ReadableAgentDefinitionInterpreter();

function legacyAgent(allowModelOverride: boolean, withReferences = true) {
  return createAgentDefinitionRevision({
    schemaVersion: "v1alpha1",
    agentDefinitionId: "agent.legacy",
    name: "Legacy",
    identity: "Legacy assistant",
    goal: "Complete authorized work",
    instructions: "Use exact resources.",
    defaultModelId: "model.legacy",
    allowModelOverride,
    skillReferences: withReferences ? [{
      id: "skill.legacy",
      revision: digest("1"),
      contentDigest: digest("2"),
      materializedRef: "private-skill-handle-canary",
    }] : [],
    toolReferences: withReferences ? [{
      capabilityId: "tool.legacy",
      capabilityRevision: digest("3"),
    }] : [],
    knowledgeReferences: withReferences ? [{
      id: "knowledge.legacy",
      revision: digest("4"),
      contentDigest: digest("5"),
      materializedRef: "private-knowledge-handle-canary",
    }] : [],
    requiredModelCapabilities: {
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsToolCalling: true,
      supportsStreaming: true,
    },
    createdAt: "2026-08-26T00:00:00.000Z",
  });
}

function v2Material() {
  return {
    schemaVersion: "v1alpha2" as const,
    agentDefinitionId: "agent.v2",
    managementClass: "managed" as const,
    name: "V2",
    identity: "V2 assistant",
    goal: "Complete authorized work",
    instructions: "Use exact resources.",
    modelRestriction: { mode: "unrestricted" as const },
    skillRestriction: { mode: "allowlist" as const, references: [] },
    toolRestriction: { mode: "allowlist" as const, references: [] },
    knowledgeRestriction: { mode: "allowlist" as const, references: [] },
    requiredModelCapabilities: {
      inputModalities: ["text" as const],
      outputModalities: ["text" as const],
      supportsToolCalling: true,
      supportsStreaming: true,
    },
    createdAt: "2026-08-26T00:00:00.000Z",
  };
}

describe("R2D-2 Agent Definition canonical domain and interpreter", () => {
  it("creates and load-time revalidates a deterministic v1alpha2 revision", () => {
    const first = createAgentDefinitionRevisionV1Alpha2(v2Material());
    const second = createAgentDefinitionRevisionV1Alpha2(v2Material());
    expect(first).toEqual(second);
    expect(first.revision).toBe(first.digest);
    expect(hasValidAgentDefinitionRevisionV1Alpha2(first)).toBe(true);
  });

  it("changes v2 digest when mode or authored order changes", () => {
    const first = { modelId: "model.first", revision: digest("1"), digest: digest("1") };
    const second = { modelId: "model.second", revision: digest("2"), digest: digest("2") };
    const unrestricted = createAgentDefinitionRevisionV1Alpha2(v2Material());
    const ordered = createAgentDefinitionRevisionV1Alpha2({
      ...v2Material(),
      modelRestriction: { mode: "allowlist", references: [first, second] },
    });
    const reversed = createAgentDefinitionRevisionV1Alpha2({
      ...v2Material(),
      modelRestriction: { mode: "allowlist", references: [second, first] },
    });
    expect(new Set([unrestricted.digest, ordered.digest, reversed.digest]).size).toBe(3);
  });

  it("detects record material drift after strict parse", () => {
    const record = createAgentDefinitionRevisionV1Alpha2(v2Material());
    const drifted = { ...record, name: "Changed" };
    expect(hasValidAgentDefinitionRevisionV1Alpha2(drifted)).toBe(false);
    expect(() => interpreter.interpret(drifted)).toThrow(
      "selection.agent_definition_digest_mismatch",
    );
  });

  it("maps legacy override=true to unrestricted without reading a Model revision", () => {
    const interpreted = interpreter.interpret(legacyAgent(true));
    expect(interpreted.sourceSchemaVersion).toBe("v1alpha1");
    expect(interpreted.managementClass).toBe("managed");
    expect(interpreted.modelRestriction).toEqual({ mode: "unrestricted" });
  });

  it("keeps legacy override=false as an honest single Model ID without fake hashes", () => {
    const interpreted = interpreter.interpret(legacyAgent(false));
    expect(interpreted.modelRestriction).toEqual({
      mode: "single_model_id",
      modelId: "model.legacy",
    });
    expect(JSON.stringify(interpreted.modelRestriction)).not.toContain("digest");
    expect(JSON.stringify(interpreted.modelRestriction)).not.toContain("revision");
  });

  it("explicitly projects legacy Skill and Knowledge fields without materializedRef", () => {
    const interpreted = interpreter.interpret(legacyAgent(false));
    expect(interpreted.skillRestriction).toEqual({
      mode: "allowlist",
      references: [{
        skillId: "skill.legacy",
        revision: digest("1"),
        contentDigest: digest("2"),
      }],
    });
    expect(interpreted.knowledgeRestriction).toEqual({
      mode: "allowlist",
      references: [{
        knowledgeId: "knowledge.legacy",
        revision: digest("4"),
        contentDigest: digest("5"),
      }],
    });
    expect(JSON.stringify(interpreted)).not.toContain("private-skill-handle-canary");
    expect(JSON.stringify(interpreted)).not.toContain("private-knowledge-handle-canary");
    expect(JSON.stringify(interpreted)).not.toContain("materializedRef");
  });

  it("does not use object spread when projecting legacy portable references", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) => readFile(
      new URL("../src/application/agent-definition-v1alpha2.ts", import.meta.url),
      "utf8",
    ));
    const projection = source.slice(
      source.indexOf("function interpretV1Alpha1"),
      source.indexOf("function interpretV1Alpha2"),
    );
    expect(projection).not.toMatch(/\.\.\.reference/u);
    expect(projection).toContain("skillId: reference.id");
    expect(projection).toContain("knowledgeId: reference.id");
  });

  it("preserves legacy empty Skill, Tool and Knowledge as empty allowlists", () => {
    const interpreted = interpreter.interpret(legacyAgent(false, false));
    expect(interpreted.skillRestriction).toEqual({ mode: "allowlist", references: [] });
    expect(interpreted.toolRestriction).toEqual({ mode: "allowlist", references: [] });
    expect(interpreted.knowledgeRestriction).toEqual({ mode: "allowlist", references: [] });
  });

  it("interprets a validated v1alpha2 record without reading current state", () => {
    const record = createAgentDefinitionRevisionV1Alpha2({
      ...v2Material(),
      managementClass: "system_builtin",
    });
    expect(interpreter.interpret(record)).toEqual({
      sourceSchemaVersion: "v1alpha2",
      exactAgentRef: {
        agentDefinitionId: record.agentDefinitionId,
        revision: record.revision,
        digest: record.digest,
      },
      managementClass: "system_builtin",
      modelRestriction: record.modelRestriction,
      skillRestriction: record.skillRestriction,
      toolRestriction: record.toolRestriction,
      knowledgeRestriction: record.knowledgeRestriction,
    });
  });

  it("rejects unknown versions and invalid v2 without legacy fallback", () => {
    expect(() => interpreter.interpret({ schemaVersion: "v9" })).toThrow(
      "selection.agent_definition_version_unsupported",
    );
    const invalidV2 = {
      ...legacyAgent(true),
      schemaVersion: "v1alpha2",
    };
    expect(() => interpreter.interpret(invalidV2)).toThrow(
      "selection.agent_definition_invalid",
    );
  });
});
