import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import type { CorePrivateClient } from "../src/main/core-private-client.js";
import { SkillInstallationService } from "../src/main/skill-installation-service.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("RSL-2 exact Skill installation", () => {
  it("stages through a private WorkspaceGrant and atomically installs a verified canonical ZIP", async () => {
    const privateRootPath = await mkdtemp(join(tmpdir(), "robothree-rsl2-install-"));
    roots.push(privateRootPath);
    const zip = canonicalZip("SKILL.md", Buffer.from(
      "---\nname: installed-skill\ndescription: installed\n---\nbody\n"));
    const packageDigest = sha256(zip);
    const releaseRevision = `sha256:${"b".repeat(64)}`;
    let stagePath = "";
    const client = ({
      async registerWorkspaceSelection(input: { selectedPath: string }) {
        stagePath = input.selectedPath;
        return { ok: true as const, value: { selectionHandle: "selection-handle-0000000001" } };
      },
      async createWorkspaceGrant() {
        return { ok: true as const, value: {
          workspaceGrantId: "workspace:11111111-1111-4111-8111-111111111111",
          displayName: "stage", rootDisplayPath: "private", accessMode: "read_write" as const,
          status: "active" as const, createdAt: "2026-09-01T00:00:00.000Z",
        } };
      },
      async discardWorkspaceSelection() {
        return { ok: true as const, value: { discarded: true as const } };
      },
      async revokeWorkspaceGrant() {
        return { ok: true as const, value: {
          workspaceGrantId: "workspace:11111111-1111-4111-8111-111111111111",
          displayName: "stage", rootDisplayPath: "private", accessMode: "read_write" as const,
          status: "revoked" as const, createdAt: "2026-09-01T00:00:00.000Z",
          revokedAt: "2026-09-01T00:01:00.000Z",
        } };
      },
      async stageSkillReleaseV1Alpha1() {
        await writeFile(join(stagePath, "package.zip"), zip, { flag: "wx" });
        return { ok: true as const, value: {
          packageDigest,
          manifestDigest: `sha256:${"c".repeat(64)}`,
          byteLength: zip.byteLength,
          technicalName: "installed-skill",
          displayTitle: "Installed Skill",
          displayDescription: "Installed description",
          semanticVersion: "1.0.0",
          sourceKind: "admin_upload" as const,
          publishedAt: "2026-09-01T00:00:00.000Z",
        } };
      },
      async checkSkillInstallationUseV1Alpha1() {
        return { ok: true as const, value: { inUse: false } };
      },
    } as unknown as CorePrivateClient);
    const service = new SkillInstallationService({ privateRootPath });
    const receipt = await service.install({
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "install_skill_release",
      commandId: "22222222-2222-4222-8222-222222222222",
      correlationId: "33333333-3333-4333-8333-333333333333",
      skillId: "skill.enterprise.installed-skill",
      releaseRevision,
      packageDigest,
      mode: "install_exact",
    }, { client, clientInstanceId: "44444444-4444-4444-8444-444444444444" });

    expect(receipt.state).toBe("install_accepted");
    expect(await readFile(join(privateRootPath, "skills", "installed",
      "skill.enterprise.installed-skill", releaseRevision, "SKILL.md"), "utf8"))
      .toContain("name: installed-skill");
    const operation = await service.query({
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "query_skill_operation",
      queryId: "55555555-5555-4555-8555-555555555555",
      correlationId: "66666666-6666-4666-8666-666666666666",
      operationId: receipt.operationId!,
    });
    expect(operation.state).toBe("succeeded");
    expect(operation.targetRevision).toBe(releaseRevision);
    const page = await service.listInstalled({
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "list_skills",
      queryId: "77777777-7777-4777-8777-777777777777",
      correlationId: "88888888-8888-4888-8888-888888888888",
      scope: "installed",
      limit: 50,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      skillId: "skill.enterprise.installed-skill",
      installed: true,
      semanticVersion: "1.0.0",
    });
    const marketplace = await service.annotateMarketplace({
      contractVersion: "skill-lifecycle.v1alpha1",
      queryRevision: `sha256:${"f".repeat(64)}`,
      scope: "marketplace",
      items: [{
        skillId: "skill.enterprise.installed-skill",
        revision: releaseRevision,
        technicalName: "installed-skill",
        displayTitle: "Installed Skill",
        displayDescription: "Installed description",
        sourceKind: "admin_upload",
        availability: "available",
        semanticVersion: "1.0.0",
        installed: false,
        updatedAt: "2026-09-01T00:00:00.000Z",
      }],
    });
    expect(marketplace.items[0]).toMatchObject({
      installed: true,
      installationRevision: page.items[0]!.installationRevision,
    });
    const lockedClient = Object.assign(Object.create(Object.getPrototypeOf(client)), client, {
      async checkSkillInstallationUseV1Alpha1() {
        return { ok: true as const, value: { inUse: true } };
      },
    }) as CorePrivateClient;
    await expect(service.uninstall({
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "uninstall_skill_release",
      commandId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      correlationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      skillId: "skill.enterprise.installed-skill",
      releaseRevision,
      expectedInstallationRevision: page.items[0]!.installationRevision!,
    }, { client: lockedClient })).rejects.toThrow("skilllifecycle.active_task_lock");
    expect((await service.listInstalled({
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "list_skills",
      queryId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      correlationId: "12121212-1212-4212-8212-121212121212",
      scope: "installed",
      limit: 50,
    })).items).toHaveLength(1);
    const uninstall = await service.uninstall({
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "uninstall_skill_release",
      commandId: "99999999-9999-4999-8999-999999999999",
      correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      skillId: "skill.enterprise.installed-skill",
      releaseRevision,
      expectedInstallationRevision: page.items[0]!.installationRevision!,
    }, { client });
    expect(uninstall.state).toBe("uninstall_accepted");
    expect((await service.listInstalled({
      contractVersion: "skill-lifecycle.v1alpha1",
      kind: "list_skills",
      queryId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      correlationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      scope: "installed",
      limit: 50,
    })).items).toEqual([]);
  });

  it("materializes an Admin draft test privately and never exposes it as installed", async () => {
    const privateRootPath = await mkdtemp(join(tmpdir(), "robothree-rsl2-admin-test-"));
    roots.push(privateRootPath);
    const markdown = Buffer.from(
      "---\nname: admin-test\ndescription: Admin test\n---\nApply this exact draft.\n");
    const zip = canonicalZip("SKILL.md", markdown);
    const packageDigest = sha256(zip);
    let stagePath = "";
    let restarts = 0;
    const client = ({
      async registerWorkspaceSelection(input: { selectedPath: string }) {
        stagePath = input.selectedPath;
        return { ok: true as const, value: { selectionHandle: "selection-admin-test-0001" } };
      },
      async createWorkspaceGrant() {
        return { ok: true as const, value: {
          workspaceGrantId: "workspace:12121212-1212-4212-8212-121212121212",
          displayName: "stage", rootDisplayPath: "private", accessMode: "read_write" as const,
          status: "active" as const, createdAt: "2026-09-01T00:00:00.000Z",
        } };
      },
      async discardWorkspaceSelection() {
        return { ok: true as const, value: { discarded: true as const } };
      },
      async revokeWorkspaceGrant() {
        return { ok: true as const, value: {
          workspaceGrantId: "workspace:12121212-1212-4212-8212-121212121212",
          displayName: "stage", rootDisplayPath: "private", accessMode: "read_write" as const,
          status: "revoked" as const, createdAt: "2026-09-01T00:00:00.000Z",
          revokedAt: "2026-09-01T00:01:00.000Z",
        } };
      },
      async stageAdminSkillDraftTestV1Alpha1() {
        await writeFile(join(stagePath, "package.zip"), zip, { flag: "wx" });
        return { ok: true as const, value: { packageDigest,
          manifestDigest: `sha256:${"2".repeat(64)}`, byteLength: zip.byteLength } };
      },
    } as unknown as CorePrivateClient);
    const service = new SkillInstallationService({ privateRootPath,
      onInstalled: async () => { restarts += 1; } });
    const material = {
      operationId: "13131313-1313-4313-8313-131313131313",
      correlationId: "14141414-1414-4414-8414-141414141414",
      skillId: "skill.enterprise.admin-test",
      draftRevision: `sha256:${"3".repeat(64)}`,
      packageDigest,
      manifestDigest: `sha256:${"2".repeat(64)}`,
      skillMarkdownDigest: sha256(markdown),
      client,
      clientInstanceId: "15151515-1515-4515-8515-151515151515",
    };

    await expect(service.prepareAdminDraftTest(material)).resolves.toBe("materialized");
    await expect(service.prepareAdminDraftTest(material)).resolves.toBe("ready");
    expect(restarts).toBe(1);
    expect(await readFile(join(privateRootPath, "skills", ".tests", material.skillId,
      material.draftRevision, "SKILL.md"), "utf8")).toContain("Apply this exact draft.");
    const installed = await service.listInstalled({ contractVersion: "skill-lifecycle.v1alpha1",
      kind: "list_skills", queryId: "16161616-1616-4616-8616-161616161616",
      correlationId: material.correlationId, scope: "installed", limit: 50 });
    expect(installed.items).toEqual([]);
  });
});

function canonicalZip(name: string, content: Buffer): Buffer {
  const nameBytes = Buffer.from(name);
  const compressed = deflateRawSync(content, { level: 9 });
  const crc = crc32(content);
  const local = Buffer.alloc(30 + nameBytes.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  nameBytes.copy(local, 30);
  const central = Buffer.alloc(46 + nameBytes.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE((0o100600 << 16) >>> 0, 38);
  nameBytes.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length + compressed.length, 16);
  return Buffer.concat([local, compressed, central, eocd]);
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) !== 0
    ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
