import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { InstalledSkillRuntimeSource } from
  "../src/application/installed-skill-runtime-source.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("RSL-2 installed Skill runtime source", () => {
  it("materializes an exact installed revision and rejects digest drift", async () => {
    const root = mkdtempSync(join(tmpdir(), "robothree-installed-skill-"));
    roots.push(root);
    const skillId = "skill.enterprise.research-helper";
    const revision = `sha256:${"a".repeat(64)}`;
    const exactRoot = join(root, skillId, revision);
    mkdirSync(exactRoot, { recursive: true });
    writeFileSync(join(exactRoot, "SKILL.md"),
      "---\nname: research-helper\ndescription: Research helper\n---\nRead sources first.\n");
    writeFileSync(join(exactRoot, ".robothree-installation.json"), JSON.stringify({
      format: "robothree.skill-installation.v1",
      skillId,
      releaseRevision: revision,
      packageDigest: `sha256:${"b".repeat(64)}`,
    }));

    const source = new InstalledSkillRuntimeSource({ installedRoot: root });
    expect(source.manifests()).toHaveLength(1);
    const manifest = source.manifests()[0]!;
    const material = await source.loadExact({
      id: skillId,
      revision,
      contentDigest: manifest.contentDigest,
    });
    expect(material?.mainBody).toContain("Read sources first.");
    await expect(source.loadExact({
      id: skillId,
      revision,
      contentDigest: `sha256:${"c".repeat(64)}`,
    })).resolves.toBeUndefined();
  });

  it("loads an exact creator draft revision from Main-owned private state", async () => {
    const skillsRoot = mkdtempSync(join(tmpdir(), "robothree-draft-skill-"));
    roots.push(skillsRoot);
    const installedRoot = join(skillsRoot, "installed");
    const draftId = "11111111-1111-4111-8111-111111111111";
    const skillId = `skill.personal.${draftId}`;
    const revision = `sha256:${"d".repeat(64)}`;
    mkdirSync(installedRoot, { recursive: true });
    mkdirSync(join(skillsRoot, "drafts", draftId), { recursive: true });
    mkdirSync(join(skillsRoot, ".state", "drafts"), { recursive: true });
    writeFileSync(join(skillsRoot, "drafts", draftId, "SKILL.md"),
      "---\nname: personal-test\ndescription: Personal test\n---\nFollow the draft rule.\n");
    writeFileSync(join(skillsRoot, ".state", "drafts", `${draftId}.json`), JSON.stringify({
      format: "robothree.skill-draft-state.v1",
      draftId,
      skillId,
      workspaceGrantId: "workspace:11111111-1111-4111-8111-111111111111",
      displayName: "Personal test",
      currentRevision: revision,
      material: {
        skillId,
        technicalName: "personal-test",
        displayTitle: "Personal test",
        displayDescription: "Personal test",
        primaryFunction: "Follow the draft rule.",
      },
    }));

    const source = new InstalledSkillRuntimeSource({ installedRoot });
    const manifest = source.manifests().find((candidate) => candidate.skillId === skillId)!;
    expect(manifest.revision).toBe(revision);
    await expect(source.loadExact({
      id: skillId,
      revision,
      contentDigest: manifest.contentDigest,
    })).resolves.toMatchObject({ mainBody: expect.stringContaining("Follow the draft rule.") });
  });

  it("projects one current revision per Skill while retaining an older draft for exact recovery", async () => {
    const skillsRoot = mkdtempSync(join(tmpdir(), "robothree-released-skill-"));
    roots.push(skillsRoot);
    const installedRoot = join(skillsRoot, "installed");
    const draftId = "22222222-2222-4222-8222-222222222222";
    const skillId = `skill.personal.${draftId}`;
    const draftRevision = `sha256:${"2".repeat(64)}`;
    const releaseRevision = `sha256:${"3".repeat(64)}`;
    mkdirSync(installedRoot, { recursive: true });
    mkdirSync(join(skillsRoot, "drafts", draftId), { recursive: true });
    mkdirSync(join(skillsRoot, ".state", "drafts"), { recursive: true });
    writeFileSync(join(skillsRoot, "drafts", draftId, "SKILL.md"),
      "---\nname: released-skill\ndescription: Draft\n---\nUse the draft rule.\n");
    writeFileSync(join(skillsRoot, ".state", "drafts", `${draftId}.json`), JSON.stringify({
      format: "robothree.skill-draft-state.v1", draftId, skillId,
      workspaceGrantId: "workspace:22222222-2222-4222-8222-222222222222",
      displayName: "Released skill", currentRevision: draftRevision,
      material: { skillId, technicalName: "released-skill", displayTitle: "Released skill",
        displayDescription: "Draft", primaryFunction: "Use the draft rule." },
    }));
    const draftOnly = new InstalledSkillRuntimeSource({ installedRoot });
    const draftManifest = draftOnly.manifests()[0]!;

    const releaseRoot = join(installedRoot, skillId, releaseRevision);
    mkdirSync(releaseRoot, { recursive: true });
    writeFileSync(join(releaseRoot, "SKILL.md"),
      "---\nname: released-skill\ndescription: Released\n---\nUse the released rule.\n");
    writeFileSync(join(releaseRoot, ".robothree-installation.json"), JSON.stringify({
      format: "robothree.skill-installation.v1", skillId,
      releaseRevision, packageDigest: `sha256:${"4".repeat(64)}`,
    }));

    const combined = new InstalledSkillRuntimeSource({ installedRoot });
    expect(combined.manifests()).toHaveLength(1);
    expect(combined.manifests()[0]?.revision).toBe(releaseRevision);
    await expect(combined.loadExact({ id: skillId, revision: draftRevision,
      contentDigest: draftManifest.contentDigest })).resolves.toMatchObject({
      mainBody: expect.stringContaining("Use the draft rule."),
    });
    const releaseManifest = combined.manifests()[0]!;
    await expect(combined.loadExact({ id: skillId, revision: releaseRevision,
      contentDigest: releaseManifest.contentDigest })).resolves.toMatchObject({
      mainBody: expect.stringContaining("Use the released rule."),
    });
  });

  it("consumes Main's exact local-candidate index and rejects later source drift", async () => {
    const skillsRoot = mkdtempSync(join(tmpdir(), "robothree-local-runtime-"));
    roots.push(skillsRoot);
    const installedRoot = join(skillsRoot, "installed");
    const sourceRoot = join(skillsRoot, "local", "local-helper");
    mkdirSync(installedRoot, { recursive: true });
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(join(skillsRoot, ".state"), { recursive: true });
    const markdown = "---\nname: local-helper\ndescription: Local helper\n---\nUse local facts.\n";
    writeFileSync(join(sourceRoot, "SKILL.md"), markdown);
    const normalized = markdown.replace(/\n+$/u, "");
    const revision = `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
    const skillId = "skill.local.11111111111111111111111111111111";
    writeFileSync(join(skillsRoot, ".state", "local-candidates.json"), JSON.stringify({
      format: "robothree.local-skill-candidates.v1",
      candidates: [{ skillId, revision, sourceRoot }],
    }));
    const source = new InstalledSkillRuntimeSource({ installedRoot });
    const manifest = source.manifests().find((candidate) => candidate.skillId === skillId)!;
    expect(await source.loadExact({ id: skillId, revision,
      contentDigest: manifest.contentDigest })).toBeDefined();
    writeFileSync(join(sourceRoot, "SKILL.md"), `${markdown}changed\n`);
    await expect(source.loadExact({ id: skillId, revision,
      contentDigest: manifest.contentDigest })).resolves.toBeUndefined();
  });

  it("materializes only exact Main-owned Admin test material without exposing an installation", async () => {
    const skillsRoot = mkdtempSync(join(tmpdir(), "robothree-admin-test-skill-"));
    roots.push(skillsRoot);
    const installedRoot = join(skillsRoot, "installed");
    const skillId = "skill.enterprise.admin-test";
    const revision = `sha256:${"e".repeat(64)}`;
    const testRoot = join(skillsRoot, ".tests", skillId, revision);
    mkdirSync(installedRoot, { recursive: true });
    mkdirSync(testRoot, { recursive: true });
    const markdown = Buffer.from(
      "---\nname: admin-test\ndescription: Admin test\n---\nUse the tested rule.\n");
    writeFileSync(join(testRoot, "SKILL.md"), markdown);
    writeFileSync(join(testRoot, ".robothree-admin-test.json"), JSON.stringify({
      format: "robothree.admin-skill-test-material.v1",
      operationId: "11111111-1111-4111-8111-111111111111",
      skillId, draftRevision: revision,
      packageDigest: `sha256:${"f".repeat(64)}`,
      manifestDigest: `sha256:${"1".repeat(64)}`,
      skillMarkdownDigest: `sha256:${createHash("sha256").update(markdown).digest("hex")}`,
    }));

    const source = new InstalledSkillRuntimeSource({ installedRoot });
    const manifest = source.manifests().find((candidate) => candidate.skillId === skillId)!;
    expect(manifest.revision).toBe(revision);
    await expect(source.loadExact({ id: skillId, revision,
      contentDigest: manifest.contentDigest })).resolves.toMatchObject({
      mainBody: expect.stringContaining("Use the tested rule."),
    });
  });
});
