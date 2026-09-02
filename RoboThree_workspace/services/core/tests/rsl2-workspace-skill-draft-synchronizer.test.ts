import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import type { HttpSkillLifecycleClient } from
  "../src/adapters/http/http-skill-lifecycle-client.js";
import { WorkspaceSkillDraftSynchronizer } from
  "../src/application/workspace-skill-draft-synchronizer.js";
import type { WorkspaceGrantService } from
  "../src/application/workspace-grant-service.js";

const DIGEST = `sha256:${"a".repeat(64)}`;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("RSL-2 Workspace Skill draft synchronization", () => {
  it("packages only the exact read-write WorkspaceGrant root into a deterministic tar.gz", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-rsl2-draft-"));
    roots.push(root);
    await mkdir(join(root, "references"));
    await writeFile(join(root, "SKILL.md"), "---\nname: sample-skill\ndescription: sample\n---\nbody\n");
    await writeFile(join(root, "references", "guide.md"), "guide");
    let upload: Parameters<HttpSkillLifecycleClient["syncDraft"]>[0] | undefined;
    const lifecycle = {
      async syncDraft(input: Parameters<HttpSkillLifecycleClient["syncDraft"]>[0]) {
        upload = input;
        return {
          contractVersion: "skill-lifecycle.v1alpha1" as const,
          commandId: input.commandId,
          correlationId: input.correlationId,
          skillId: input.material.skillId,
          currentRevision: DIGEST,
          state: "draft_created" as const,
        };
      },
    } as unknown as HttpSkillLifecycleClient;
    const workspaces = {
      async listPrivateAuthorities() {
        return [{
          workspaceGrantId: "workspace:11111111-1111-4111-8111-111111111111",
          displayName: "draft",
          rootDisplayPath: "private",
          rootRealPath: root,
          accessMode: "read_write" as const,
          status: "active" as const,
          createdAt: "2026-09-01T00:00:00.000Z",
        }];
      },
    } as unknown as WorkspaceGrantService;
    const synchronizer = new WorkspaceSkillDraftSynchronizer({ workspaces, lifecycle });

    const result = await synchronizer.sync({
      commandId: "11111111-1111-4111-8111-111111111111",
      correlationId: "22222222-2222-4222-8222-222222222222",
      workspaceGrantId: "workspace:11111111-1111-4111-8111-111111111111",
      skillId: "skill.personal.sample",
      material: {
        skillId: "skill.personal.sample",
        technicalName: "sample-skill",
        displayTitle: "Sample",
        displayDescription: "Sample skill",
        primaryFunction: "Do sample work",
      },
    });

    expect(result.state).toBe("draft_created");
    expect(upload).toBeDefined();
    expect(upload?.archiveDigest).toBe(`sha256:${createHash("sha256")
      .update(upload!.archiveBytes).digest("hex")}`);
    expect(readTarPaths(gunzipSync(upload!.archiveBytes))).toEqual([
      "skill/SKILL.md",
      "skill/references/guide.md",
    ]);
  });

  it("fails closed for a symlink inside the draft root", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-rsl2-draft-"));
    roots.push(root);
    const outside = join(root, "outside.txt");
    await writeFile(outside, "outside");
    await writeFile(join(root, "SKILL.md"), "body");
    await symlink(outside, join(root, "link.txt"));
    const workspaces = {
      async listPrivateAuthorities() {
        return [{ workspaceGrantId: "workspace:grant", rootRealPath: root,
          accessMode: "read_write", status: "active" }];
      },
    } as unknown as WorkspaceGrantService;
    const lifecycle = ({
      syncDraft: async () => Promise.reject(new Error("must not upload")),
    } as unknown as HttpSkillLifecycleClient);

    await expect(new WorkspaceSkillDraftSynchronizer({ workspaces, lifecycle }).sync({
      commandId: "11111111-1111-4111-8111-111111111111",
      correlationId: "22222222-2222-4222-8222-222222222222",
      workspaceGrantId: "workspace:grant",
      skillId: "skill.personal.sample",
      material: {
        skillId: "skill.personal.sample", technicalName: "sample-skill",
        displayTitle: "Sample", displayDescription: "Sample", primaryFunction: "Sample",
      },
    })).rejects.toThrow("skilllifecycle.package_invalid");
    expect(await readFile(outside, "utf8")).toBe("outside");
  });
});

function readTarPaths(tar: Uint8Array): string[] {
  const paths: string[] = [];
  let offset = 0;
  while (offset + 512 <= tar.byteLength) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = text(header.subarray(0, 100));
    const prefix = text(header.subarray(345, 500));
    paths.push(prefix === "" ? name : `${prefix}/${name}`);
    const size = Number.parseInt(text(header.subarray(124, 136)), 8);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return paths;
}

function text(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  return Buffer.from(end < 0 ? bytes : bytes.subarray(0, end)).toString("utf8").trim();
}
