import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CorePrivateClient } from "../src/main/core-private-client.js";
import { SkillLocalDiscoveryService } from "../src/main/skill-local-discovery-service.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0)
  .map((root) => rm(root, { recursive: true, force: true }))));

describe("RSL-2 bounded local Skill discovery", () => {
  it("projects user and active-workspace candidates without exposing paths", async () => {
    const privateRootPath = await mkdtemp(join(tmpdir(), "robothree-local-skill-"));
    const workspace = await mkdtemp(join(tmpdir(), "robothree-local-workspace-"));
    roots.push(privateRootPath, workspace);
    await mkdir(join(privateRootPath, "skills", "local", "user-helper"), { recursive: true });
    await writeFile(join(privateRootPath, "skills", "local", "user-helper", "SKILL.md"),
      "---\nname: user-helper\ndescription: User helper\n---\nUse the user rule.\n");
    await mkdir(join(workspace, ".robothree", "skills", "project-helper"), { recursive: true });
    await writeFile(join(workspace, ".robothree", "skills", "project-helper", "SKILL.md"),
      "---\nname: project-helper\ndescription: Project helper\n---\nUse the project rule.\n");
    const restart = vi.fn(async () => undefined);
    const client = ({
      async listWorkspaceGrantAuthorities() {
        return { ok: true as const, value: [{
          workspaceGrantId: "workspace:11111111-1111-4111-8111-111111111111",
          displayName: "Workspace",
          rootDisplayPath: "Workspace",
          rootRealPath: workspace,
          accessMode: "read_write" as const,
          status: "active" as const,
        }] };
      },
    } as unknown as CorePrivateClient);
    const service = new SkillLocalDiscoveryService({ privateRootPath, onChanged: restart });
    const page = await service.list({
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "list_skills",
      queryId: "22222222-2222-4222-8222-222222222222",
      correlationId: "33333333-3333-4333-8333-333333333333",
      scope: "local",
      limit: 50,
    }, client);
    expect(page.items.map((item) => item.sourceKind)).toEqual([
      "local_workspace_directory", "local_user_directory",
    ]);
    expect(JSON.stringify(page)).not.toContain(workspace);
    expect(JSON.stringify(page)).not.toContain(privateRootPath);
    expect(restart).toHaveBeenCalledOnce();
    await service.list({
      contractVersion: "skill-lifecycle.v1alpha1", kind: "list_skills",
      queryId: "44444444-4444-4444-8444-444444444444",
      correlationId: "55555555-5555-4555-8555-555555555555",
      scope: "local", limit: 50,
    }, client);
    expect(restart).toHaveBeenCalledOnce();
  });
});
