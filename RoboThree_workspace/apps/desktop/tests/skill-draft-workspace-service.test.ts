import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { CorePrivateClient } from "../src/main/core-private-client.js";
import { SkillDraftWorkspaceService } from
  "../src/main/skill-draft-workspace-service.js";

const roots: string[] = [];
const FIRST = `sha256:${"a".repeat(64)}`;
const SECOND = `sha256:${"b".repeat(64)}`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("RSL-2 Skill draft workspace", () => {
  it("creates an exact private WorkspaceGrant, syncs Central, and persists refresh identity", async () => {
    const privateRootPath = await mkdtemp(join(tmpdir(), "robothree-rsl2-main-"));
    roots.push(privateRootPath);
    const syncs: Array<Record<string, unknown>> = [];
    const seedMarkdownAtSync: string[] = [];
    const client = ({
      async registerWorkspaceSelection() {
        return { ok: true as const, value: { selectionHandle: "selection-handle-0000000001" } };
      },
      async createWorkspaceGrant() {
        return { ok: true as const, value: {
          workspaceGrantId: "workspace:11111111-1111-4111-8111-111111111111",
          displayName: "Research Skill",
          rootDisplayPath: "private",
          accessMode: "read_write" as const,
          status: "active" as const,
          createdAt: "2026-09-01T00:00:00.000Z",
        } };
      },
      async discardWorkspaceSelection() {
        return { ok: true as const, value: { discarded: true as const } };
      },
      async revokeWorkspaceGrant() {
        throw new Error("not expected");
      },
      async listWorkspaceGrantAuthorities() {
        return { ok: true as const, value: [] };
      },
      async syncSkillDraftV1Alpha1(input: Record<string, unknown>) {
        syncs.push(input);
        if (syncs.length === 1) {
          const draftsRoot = join(privateRootPath, "skills", "drafts");
          const { readdir } = await import("node:fs/promises");
          const [draftId] = await readdir(draftsRoot);
          seedMarkdownAtSync.push(await readFile(join(draftsRoot, draftId!, "SKILL.md"), "utf8"));
        }
        const commandId = String(input.commandId);
        const correlationId = String(input.correlationId);
        const material = input.material as { skillId: string };
        return { ok: true as const, value: {
          contractVersion: "skill-lifecycle.v1alpha1" as const,
          commandId,
          correlationId,
          skillId: material.skillId,
          currentRevision: syncs.length === 1 ? FIRST : SECOND,
          state: syncs.length === 1 ? "draft_created" as const : "draft_refreshed" as const,
        } };
      },
    } as unknown as CorePrivateClient);
    const service = new SkillDraftWorkspaceService({ privateRootPath });
    const receipt = await service.create({
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "create_skill_draft_workspace",
      commandId: "11111111-1111-4111-8111-111111111111",
      correlationId: "22222222-2222-4222-8222-222222222222",
      displayTitle: "Research Skill",
      displayDescription: "Reads research files",
      primaryFunction: "Summarize authorized source files",
    }, { client, clientInstanceId: "33333333-3333-4333-8333-333333333333" });

    expect(receipt.state).toBe("draft_created");
    expect(receipt.currentRevision).toBe(FIRST);
    expect(receipt.workspaceGrantId).toBe("workspace:11111111-1111-4111-8111-111111111111");
    expect(seedMarkdownAtSync[0]).toContain("description: Reads research files");
    expect(seedMarkdownAtSync[0]).toContain("Summarize authorized source files");
    await expect(readFile(join(
      privateRootPath, "skills", "drafts", receipt.draftId, "SKILL.md"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });

    await writeFile(join(privateRootPath, "skills", "drafts", receipt.draftId, "SKILL.md"),
      "---\nname: revised-skill\ndescription: revised\n---\nrevised body\n");
    const refreshed = await service.refresh({
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "refresh_skill_draft",
      commandId: "44444444-4444-4444-8444-444444444444",
      correlationId: "55555555-5555-4555-8555-555555555555",
      skillId: receipt.skillId,
      expectedDraftRevision: FIRST,
    }, { client });

    expect(refreshed.state).toBe("draft_refreshed");
    expect(refreshed.currentRevision).toBe(SECOND);
    expect(syncs[1]).toMatchObject({
      workspaceGrantId: receipt.workspaceGrantId,
      skillId: receipt.skillId,
      expectedDraftRevision: FIRST,
      material: { technicalName: "revised-skill" },
    });
  });
});
