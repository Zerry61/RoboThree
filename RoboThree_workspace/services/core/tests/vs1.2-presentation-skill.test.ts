import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  BUILT_IN_PRESENTATION_AGENT_ID,
  BuiltInPresentationAgentSource,
} from "../src/application/built-in-presentation-agent-source.js";
import {
  projectEnterpriseProviderToolName,
} from "../src/application/enterprise-model-request-converter.js";
import {
  PRESENTATION_PLANNING_SKILL_ID,
  TrustedLocalSkillInstructionResolver,
  loadPresentationPlanningSkillManifest,
} from "../src/application/trusted-local-skill-instruction-resolver.js";

const temporaryDirectories: string[] = [];
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("VS1.2 presentation Agent and trusted local Skill", () => {
  it("loads the exact real SKILL.md through a portable locked reference", async () => {
    const manifest = loadPresentationPlanningSkillManifest();
    const resolver = new TrustedLocalSkillInstructionResolver({ manifest });

    await expect(resolver.loadExact({
      id: manifest.skillId,
      revision: manifest.revision,
      contentDigest: manifest.contentDigest,
    })).resolves.toMatchObject({
      skillId: PRESENTATION_PLANNING_SKILL_ID,
      revision: manifest.revision,
      sourceContentDigest: manifest.contentDigest,
      mainBody: expect.stringContaining("# 演示文稿规划"),
    });
  });

  it("fails closed when the exact Skill bytes drift after selection", async () => {
    const trustedRoot = await copySkillFixture();
    const manifest = loadPresentationPlanningSkillManifest(trustedRoot);
    const resolver = new TrustedLocalSkillInstructionResolver({ trustedRoot, manifest });
    await writeFile(manifest.materializedRef, "# 已漂移\n", "utf8");

    await expect(resolver.loadExact({
      id: manifest.skillId,
      revision: manifest.revision,
      contentDigest: manifest.contentDigest,
    })).resolves.toBeUndefined();
  });

  it("rejects a materialized Skill path outside the trusted root", async () => {
    const trustedRoot = await copySkillFixture();
    const outside = join(await mkdtemp(join(tmpdir(), "robothree-vs12-outside-")), "SKILL.md");
    temporaryDirectories.push(resolve(outside, ".."));
    await writeFile(outside, "# outside\n", "utf8");
    const manifest = loadPresentationPlanningSkillManifest(trustedRoot);

    expect(() => new TrustedLocalSkillInstructionResolver({
      trustedRoot,
      manifest: { ...manifest, materializedRef: outside },
    })).toThrow("trusted_skill_path_invalid");
  });

  it("freezes the presentation Agent to one Model, Skill and exact read/write Tools", () => {
    const source = new BuiltInPresentationAgentSource({
      model: {
        modelId: "model.internal-trial",
        revision: digest("1"),
        digest: digest("1"),
      },
      skill: {
        skillId: PRESENTATION_PLANNING_SKILL_ID,
        revision: digest("2"),
        contentDigest: digest("3"),
      },
      tools: [
        { capabilityId: "tool.document.docx.read", capabilityRevision: digest("4") },
        { capabilityId: "tool.document.pptx.write", capabilityRevision: digest("5") },
      ],
      minimumContextWindow: 8_192,
    }).loadDefault();

    expect(source).toMatchObject({
      agentDefinitionId: BUILT_IN_PRESENTATION_AGENT_ID,
      managementClass: "system_builtin",
      modelRestriction: { mode: "allowlist", references: [{
        modelId: "model.internal-trial",
      }] },
      skillRestriction: { mode: "allowlist", references: [{
        skillId: PRESENTATION_PLANNING_SKILL_ID,
      }] },
      toolRestriction: { mode: "allowlist", references: [
        { capabilityId: "tool.document.docx.read" },
        { capabilityId: "tool.document.pptx.write" },
      ] },
      requiredModelCapabilities: {
        supportsToolCalling: true,
        supportsStreaming: true,
        minimumContextWindow: 8_192,
      },
    });
  });

  it("uses a deterministic provider-safe Tool name instead of the display label", () => {
    const name = projectEnterpriseProviderToolName("tool.document.pptx.write");
    expect(name).toMatch(/^[A-Za-z0-9_-]{1,64}$/u);
    expect(name).not.toBe("PPTX Write");
    expect(projectEnterpriseProviderToolName("tool.document.pptx.write")).toBe(name);
    expect(projectEnterpriseProviderToolName("tool.document.pptx-write")).not.toBe(name);
  });
});

async function copySkillFixture(): Promise<string> {
  const trustedRoot = await mkdtemp(join(tmpdir(), "robothree-vs12-skill-"));
  temporaryDirectories.push(trustedRoot);
  const directory = join(trustedRoot, "presentation-planning");
  await mkdir(directory);
  const source = await readFile(resolve(
    process.cwd(),
    "services/core/resources/skills/presentation-planning/SKILL.md",
  ));
  await writeFile(join(directory, "SKILL.md"), source);
  return trustedRoot;
}
