import { createHash, randomUUID } from "node:crypto";
import {
  chmod, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { inflateRawSync } from "node:zlib";
import {
  InstallSkillReleaseCommandSchema,
  GetSkillQuerySchema,
  ListSkillsQuerySchema,
  QuerySkillOperationSchema,
  UninstallSkillReleaseCommandSchema,
  SkillLifecycleMutationReceiptSchema,
  SkillOperationSchema,
  SkillDetailSchema,
  SkillPageSchema,
  type InstallSkillReleaseCommand,
  type GetSkillQuery,
  type ListSkillsQuery,
  type QuerySkillOperation,
  type UninstallSkillReleaseCommand,
  type SkillLifecycleMutationReceipt,
  type SkillOperation,
  type SkillDetail,
  type SkillPage,
} from "@robothree/contracts/skill-lifecycle/v1alpha1";

import type { CorePrivateClient } from "./core-private-client.js";

type InstallationClient = Pick<CorePrivateClient,
  "createWorkspaceGrant" | "discardWorkspaceSelection" | "registerWorkspaceSelection"
  | "revokeWorkspaceGrant" | "stageSkillReleaseV1Alpha1"
  | "checkSkillInstallationUseV1Alpha1" | "stageAdminSkillDraftTestV1Alpha1">;
type AdminTestCleanupClient = Pick<CorePrivateClient, "queryAdminSkillDraftTestV1Alpha1">;

type OperationState = Readonly<{
  contractVersion: "skill-lifecycle.v1alpha1";
  operationId: string;
  correlationId: string;
  operationKind: "install" | "uninstall";
  state: "succeeded" | "failed";
  skillId: string;
  targetRevision: string;
  safeReason?: string;
  updatedAt: string;
}>;

export class SkillInstallationService {
  readonly #skillsRoot: string;
  readonly #onInstalled: (() => Promise<void>) | undefined;

  constructor(input: Readonly<{
    privateRootPath: string;
    onInstalled?: () => Promise<void>;
  }>) {
    this.#skillsRoot = join(input.privateRootPath, "skills");
    this.#onInstalled = input.onInstalled;
  }

  async install(command: InstallSkillReleaseCommand, input: Readonly<{
    client: InstallationClient;
    clientInstanceId: string;
  }>): Promise<SkillLifecycleMutationReceipt> {
    const parsed = InstallSkillReleaseCommandSchema.parse(command);
    const operationId = randomUUID();
    const stage = join(this.#skillsRoot, ".staging", operationId);
    const target = join(this.#skillsRoot, "installed", parsed.skillId, parsed.releaseRevision);
    const operationPath = this.#operationPath(operationId);
    await mkdir(stage, { recursive: true, mode: 0o700 });
    let grantId: string | undefined;
    try {
      const existing = await readInstallationManifest(target);
      if (existing !== undefined) {
        if (existing.skillId !== parsed.skillId
          || existing.releaseRevision !== parsed.releaseRevision
          || existing.packageDigest !== parsed.packageDigest) {
          throw new Error("skilllifecycle.installation_conflict");
        }
        await persistOperation(operationPath, succeededOperation(parsed, operationId));
        await this.#onInstalled?.();
        return installReceipt(parsed, operationId);
      }
      grantId = await createStagingGrant(input.client, {
        root: stage,
        clientInstanceId: input.clientInstanceId,
        correlationId: parsed.correlationId,
      });
      const staged = await input.client.stageSkillReleaseV1Alpha1({
        workspaceGrantId: grantId,
        skillId: parsed.skillId,
        releaseRevision: parsed.releaseRevision,
        packageDigest: parsed.packageDigest,
      });
      if (!staged.ok) throw staged.error;
      const packagePath = join(stage, "package.zip");
      const packageBytes = await readFile(packagePath);
      const packageDigest = sha256(packageBytes);
      if (packageDigest !== parsed.packageDigest
        || staged.value.packageDigest !== parsed.packageDigest) {
        throw new Error("skilllifecycle.package_invalid");
      }
      const contentRoot = join(stage, "content");
      await mkdir(contentRoot, { mode: 0o700 });
      await extractCanonicalZip(packageBytes, contentRoot);
      const manifest = {
        format: "robothree.skill-installation.v1",
        skillId: parsed.skillId,
        releaseRevision: parsed.releaseRevision,
        packageDigest: parsed.packageDigest,
        manifestDigest: staged.value.manifestDigest,
        installedAt: new Date().toISOString(),
        technicalName: staged.value.technicalName,
        displayTitle: staged.value.displayTitle,
        displayDescription: staged.value.displayDescription,
        semanticVersion: staged.value.semanticVersion,
        sourceKind: staged.value.sourceKind,
        publishedAt: staged.value.publishedAt,
      } as const;
      await writeFile(join(contentRoot, ".robothree-installation.json"), JSON.stringify(manifest), {
        encoding: "utf8", flag: "wx", mode: 0o600,
      });
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await rename(contentRoot, target);
      await syncDirectory(dirname(target));
      await persistOperation(operationPath, succeededOperation(parsed, operationId));
      await this.#onInstalled?.();
      return installReceipt(parsed, operationId);
    } catch (error) {
      await persistOperation(operationPath, {
        contractVersion: "skill-lifecycle.v1alpha1",
        operationId,
        correlationId: parsed.correlationId,
        operationKind: "install",
        state: "failed",
        skillId: parsed.skillId,
        targetRevision: parsed.releaseRevision,
        safeReason: safeReason(error),
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
      throw error;
    } finally {
      if (grantId !== undefined) {
        await input.client.revokeWorkspaceGrant({
          contractVersion: "v1alpha1",
          type: "revoke_workspace_grant",
          commandId: randomUUID(),
          correlationId: parsed.correlationId,
          clientInstanceId: input.clientInstanceId,
          workspaceGrantId: grantId,
        }).catch(() => undefined);
      }
      await rm(stage, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async query(query: QuerySkillOperation): Promise<SkillOperation> {
    const parsed = QuerySkillOperationSchema.parse(query);
    const value: unknown = JSON.parse(await readFile(this.#operationPath(parsed.operationId), "utf8"));
    return SkillOperationSchema.parse(value);
  }

  async prepareAdminDraftTest(input: Readonly<{
    operationId: string; correlationId: string; skillId: string; draftRevision: string;
    packageDigest: string; manifestDigest: string; skillMarkdownDigest: string;
    client: InstallationClient; clientInstanceId: string;
  }>): Promise<"ready" | "materialized"> {
    const target = join(this.#skillsRoot, ".tests", input.skillId, input.draftRevision);
    const marker = join(target, ".robothree-admin-test.json");
    try {
      const state = parseAdminTestManifest(JSON.parse(await readFile(marker, "utf8")));
      if (state.operationId !== input.operationId || state.skillId !== input.skillId
        || state.draftRevision !== input.draftRevision
        || state.packageDigest !== input.packageDigest
        || state.skillMarkdownDigest !== input.skillMarkdownDigest) {
        throw new Error("skilllifecycle.revision_conflict");
      }
      return "ready";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const stage = join(this.#skillsRoot, ".staging", `${input.operationId}.admin-test`);
    await mkdir(stage, { recursive: true, mode: 0o700 });
    let grantId: string | undefined;
    let materialized = false;
    try {
      grantId = await createStagingGrant(input.client, { root: stage,
        clientInstanceId: input.clientInstanceId, correlationId: input.correlationId });
      const staged = await input.client.stageAdminSkillDraftTestV1Alpha1({
        workspaceGrantId: grantId, operationId: input.operationId,
        packageDigest: input.packageDigest, manifestDigest: input.manifestDigest,
      });
      if (!staged.ok) throw staged.error;
      const bytes = await readFile(join(stage, "package.zip"));
      if (sha256(bytes) !== input.packageDigest) throw new Error("skilllifecycle.package_invalid");
      const contentRoot = join(stage, "content");
      await mkdir(contentRoot, { mode: 0o700 });
      await extractCanonicalZip(bytes, contentRoot);
      const skillMarkdownDigest = sha256(await readFile(join(contentRoot, "SKILL.md")));
      if (skillMarkdownDigest !== input.skillMarkdownDigest) {
        throw new Error("skilllifecycle.package_invalid");
      }
      await writeFile(join(contentRoot, ".robothree-admin-test.json"), JSON.stringify({
        format: "robothree.admin-skill-test-material.v1", operationId: input.operationId,
        skillId: input.skillId, draftRevision: input.draftRevision,
        packageDigest: input.packageDigest, manifestDigest: input.manifestDigest,
        skillMarkdownDigest: input.skillMarkdownDigest,
      }), { encoding: "utf8", flag: "wx", mode: 0o600 });
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await rename(contentRoot, target);
      await syncDirectory(dirname(target));
      materialized = true;
    } finally {
      if (grantId !== undefined) {
        await input.client.revokeWorkspaceGrant({ contractVersion: "v1alpha1",
          type: "revoke_workspace_grant", commandId: randomUUID(),
          correlationId: input.correlationId, clientInstanceId: input.clientInstanceId,
          workspaceGrantId: grantId }).catch(() => undefined);
      }
      await rm(stage, { recursive: true, force: true }).catch(() => undefined);
    }
    if (!materialized) throw new Error("skilllifecycle.service_unavailable");
    await this.#onInstalled?.();
    return "materialized";
  }

  async cleanupFinishedAdminDraftTests(client: AdminTestCleanupClient): Promise<boolean> {
    const root = join(this.#skillsRoot, ".tests");
    let changed = false;
    for (const skillId of await safeReadDirectories(root)) {
      for (const revision of await safeReadDirectories(join(root, skillId))) {
        const candidate = join(root, skillId, revision);
        try {
          const state = parseAdminTestManifest(JSON.parse(
            await readFile(join(candidate, ".robothree-admin-test.json"), "utf8")));
          const operation = await client.queryAdminSkillDraftTestV1Alpha1(state.operationId);
          if (!operation.ok || !["succeeded", "failed"].includes(operation.value.state)) continue;
          const exactRoot = await realpath(root);
          const exactCandidate = await realpath(candidate);
          requireContained(exactRoot, exactCandidate);
          await rm(exactCandidate, { recursive: true, force: false });
          changed = true;
        } catch {
          continue;
        }
      }
    }
    if (changed) await this.#onInstalled?.();
    return changed;
  }

  async uninstall(command: UninstallSkillReleaseCommand, input: Readonly<{
    client: InstallationClient;
  }>): Promise<SkillLifecycleMutationReceipt> {
    const parsed = UninstallSkillReleaseCommandSchema.parse(command);
    const operationId = randomUUID();
    const operationPath = this.#operationPath(operationId);
    const target = join(this.#skillsRoot, "installed", parsed.skillId, parsed.releaseRevision);
    const trash = join(this.#skillsRoot, ".staging", `${operationId}.uninstall`);
    try {
      const manifestBytes = await readFile(join(target, ".robothree-installation.json"));
      const manifest = parseInstalledManifest(JSON.parse(manifestBytes.toString("utf8")));
      if (manifest.skillId !== parsed.skillId
        || manifest.releaseRevision !== parsed.releaseRevision) {
        throw new Error("skilllifecycle.installation_conflict");
      }
      if (sha256(manifestBytes) !== parsed.expectedInstallationRevision) {
        throw new Error("skilllifecycle.revision_conflict");
      }
      const usage = await input.client.checkSkillInstallationUseV1Alpha1({
        skillId: parsed.skillId,
        releaseRevision: parsed.releaseRevision,
      });
      if (!usage.ok) throw usage.error;
      if (usage.value.inUse) throw new Error("skilllifecycle.active_task_lock");
      const exactTarget = await realpath(target);
      const exactInstalledRoot = await realpath(join(this.#skillsRoot, "installed"));
      requireContained(exactInstalledRoot, exactTarget);
      await mkdir(dirname(trash), { recursive: true, mode: 0o700 });
      await rename(exactTarget, trash);
      await syncDirectory(dirname(exactTarget));
      await rm(trash, { recursive: true, force: false });
      await persistOperation(operationPath, {
        contractVersion: "skill-lifecycle.v1alpha1",
        operationId,
        correlationId: parsed.correlationId,
        operationKind: "uninstall",
        state: "succeeded",
        skillId: parsed.skillId,
        targetRevision: parsed.releaseRevision,
        updatedAt: new Date().toISOString(),
      });
      await this.#onInstalled?.();
      return SkillLifecycleMutationReceiptSchema.parse({
        contractVersion: "skill-lifecycle.v1alpha1",
        commandId: parsed.commandId,
        correlationId: parsed.correlationId,
        skillId: parsed.skillId,
        currentRevision: parsed.releaseRevision,
        state: "uninstall_accepted",
        operationId,
      });
    } catch (error) {
      await persistOperation(operationPath, {
        contractVersion: "skill-lifecycle.v1alpha1",
        operationId,
        correlationId: parsed.correlationId,
        operationKind: "uninstall",
        state: "failed",
        skillId: parsed.skillId,
        targetRevision: parsed.releaseRevision,
        safeReason: safeReason(error),
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
      throw error;
    }
  }

  async annotateMarketplace(page: SkillPage): Promise<SkillPage> {
    if (page.scope !== "marketplace") return page;
    const installed = await this.#installedManifests();
    const revisions = new Map(installed.map(({ manifest, revision }) => [
      `${manifest.skillId}\0${manifest.releaseRevision}`, revision,
    ]));
    return SkillPageSchema.parse({
      ...page,
      items: page.items.map((item) => {
        const installationRevision = revisions.get(`${item.skillId}\0${item.revision}`);
        return installationRevision === undefined
          ? { ...item, installed: false }
          : { ...item, installed: true, installationRevision };
      }),
    });
  }

  async listInstalled(query: ListSkillsQuery): Promise<SkillPage> {
    const parsed = ListSkillsQuerySchema.parse(query);
    if (parsed.scope !== "installed") throw new Error("skilllifecycle.invalid_request");
    const manifests = await this.#installedManifests();
    const items = manifests.slice(0, parsed.limit).map(({ manifest, revision }) => ({
      skillId: manifest.skillId,
      revision: manifest.releaseRevision,
      technicalName: manifest.technicalName,
      displayTitle: manifest.displayTitle,
      displayDescription: manifest.displayDescription,
      sourceKind: manifest.sourceKind,
      availability: "available" as const,
      creatorDisplayName: manifest.sourceKind === "admin_upload" ? "企业管理员" : "企业用户",
      semanticVersion: manifest.semanticVersion,
      installed: true,
      installationRevision: revision,
      updatedAt: manifest.installedAt,
    }));
    return SkillPageSchema.parse({
      contractVersion: "skill-lifecycle.v1alpha1",
      queryRevision: sha256(Buffer.from(JSON.stringify(items))),
      scope: "installed",
      items,
    });
  }

  async getInstalled(query: GetSkillQuery): Promise<SkillDetail> {
    const parsed = GetSkillQuerySchema.parse(query);
    const candidate = (await this.#installedManifests()).find(({ manifest }) =>
      manifest.skillId === parsed.skillId
      && (parsed.revision === undefined || manifest.releaseRevision === parsed.revision)
      && (parsed.sourceKind === undefined || manifest.sourceKind === parsed.sourceKind));
    if (candidate === undefined) throw new Error("skilllifecycle.not_found");
    const markdown = await readFile(join(candidate.root, "SKILL.md"), "utf8");
    return SkillDetailSchema.parse({
      skillId: candidate.manifest.skillId,
      revision: candidate.manifest.releaseRevision,
      technicalName: candidate.manifest.technicalName,
      displayTitle: candidate.manifest.displayTitle,
      displayDescription: candidate.manifest.displayDescription,
      sourceKind: candidate.manifest.sourceKind,
      availability: "available",
      creatorDisplayName: candidate.manifest.sourceKind === "admin_upload"
        ? "企业管理员" : "企业用户",
      semanticVersion: candidate.manifest.semanticVersion,
      installed: true,
      installationRevision: candidate.revision,
      updatedAt: candidate.manifest.installedAt,
      safeMarkdown: markdown,
    });
  }

  async #installedManifests(): Promise<Array<Readonly<{
    root: string;
    manifest: InstalledManifest;
    revision: string;
  }>>> {
    const root = join(this.#skillsRoot, "installed");
    const results: Array<Readonly<{ root: string; manifest: InstalledManifest; revision: string }>> = [];
    let skillIds: string[];
    try { skillIds = await readdir(root); } catch { return results; }
    for (const skillId of skillIds.sort()) {
      let revisions: string[];
      try { revisions = await readdir(join(root, skillId)); } catch { continue; }
      for (const releaseRevision of revisions.sort()) {
        const installationRoot = join(root, skillId, releaseRevision);
        try {
          const bytes = await readFile(join(installationRoot, ".robothree-installation.json"));
          const manifest = parseInstalledManifest(JSON.parse(bytes.toString("utf8")));
          if (manifest.skillId !== skillId || manifest.releaseRevision !== releaseRevision) continue;
          results.push({ root: installationRoot, manifest, revision: sha256(bytes) });
        } catch { continue; }
      }
    }
    return results;
  }

  #operationPath(operationId: string): string {
    return join(this.#skillsRoot, ".state", "operations", `${operationId}.json`);
  }
}

type InstalledManifest = Readonly<{
  format: "robothree.skill-installation.v1";
  skillId: string;
  releaseRevision: string;
  packageDigest: string;
  manifestDigest: string;
  installedAt: string;
  technicalName: string;
  displayTitle: string;
  displayDescription: string;
  semanticVersion: string;
  sourceKind: "personal_creator" | "admin_upload";
  publishedAt: string;
}>; 

function parseAdminTestManifest(value: unknown): Readonly<{
  operationId: string; skillId: string; draftRevision: string;
  packageDigest: string; manifestDigest: string; skillMarkdownDigest: string;
}> {
  if (typeof value !== "object" || value === null) {
    throw new Error("skilllifecycle.installation_state_invalid");
  }
  const record = value as Record<string, unknown>;
  if (record.format !== "robothree.admin-skill-test-material.v1") {
    throw new Error("skilllifecycle.installation_state_invalid");
  }
  for (const field of ["operationId", "skillId", "draftRevision", "packageDigest",
    "manifestDigest", "skillMarkdownDigest"] as const) {
    if (typeof record[field] !== "string") {
      throw new Error("skilllifecycle.installation_state_invalid");
    }
  }
  return record as {
    operationId: string; skillId: string; draftRevision: string;
    packageDigest: string; manifestDigest: string; skillMarkdownDigest: string;
  };
}

function parseInstalledManifest(value: unknown): InstalledManifest {
  if (typeof value !== "object" || value === null
    || Object.keys(value).length !== 12
    || !("format" in value) || value.format !== "robothree.skill-installation.v1"
    || !("skillId" in value) || typeof value.skillId !== "string"
    || !("releaseRevision" in value) || typeof value.releaseRevision !== "string"
    || !("packageDigest" in value) || typeof value.packageDigest !== "string"
    || !("manifestDigest" in value) || typeof value.manifestDigest !== "string"
    || !("installedAt" in value) || typeof value.installedAt !== "string"
    || !("technicalName" in value) || typeof value.technicalName !== "string"
    || !("displayTitle" in value) || typeof value.displayTitle !== "string"
    || !("displayDescription" in value) || typeof value.displayDescription !== "string"
    || !("semanticVersion" in value) || typeof value.semanticVersion !== "string"
    || !("sourceKind" in value)
    || (value.sourceKind !== "personal_creator" && value.sourceKind !== "admin_upload")
    || !("publishedAt" in value) || typeof value.publishedAt !== "string") {
    throw new Error("skilllifecycle.installation_state_invalid");
  }
  return value as InstalledManifest;
}

function requireContained(root: string, candidate: string): void {
  const relativePath = relative(root, candidate);
  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error("skilllifecycle.installation_conflict");
  }
}

async function createStagingGrant(client: InstallationClient, input: Readonly<{
  root: string; clientInstanceId: string; correlationId: string;
}>): Promise<string> {
  const selection = await client.registerWorkspaceSelection({
    selectedPath: await realpath(input.root),
    clientInstanceId: input.clientInstanceId,
    correlationId: input.correlationId,
  });
  if (!selection.ok) throw new Error("skilllifecycle.service_unavailable");
  try {
    const created = await client.createWorkspaceGrant({
      contractVersion: "v1alpha1",
      type: "create_workspace_grant",
      commandId: randomUUID(),
      correlationId: input.correlationId,
      clientInstanceId: input.clientInstanceId,
      selectionHandle: selection.value.selectionHandle,
      displayName: "技能安装暂存区",
      accessMode: "read_write",
    });
    if (!created.ok) throw new Error("skilllifecycle.service_unavailable");
    return created.value.workspaceGrantId;
  } finally {
    await client.discardWorkspaceSelection(selection.value.selectionHandle).catch(() => undefined);
  }
}

async function safeReadDirectories(root: string): Promise<string[]> {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

async function extractCanonicalZip(bytes: Uint8Array, root: string): Promise<void> {
  const entries = readCentralDirectory(bytes);
  const seen = new Set<string>();
  for (const entry of entries) {
    const normalized = normalizeEntryPath(entry.name);
    const folded = normalized.toLocaleLowerCase("en-US");
    if (seen.has(folded)) throw new Error("skilllifecycle.package_invalid");
    seen.add(folded);
    const content = extractEntry(bytes, entry);
    if (crc32(content) !== entry.crc32) throw new Error("skilllifecycle.package_invalid");
    const target = resolve(root, ...normalized.split("/"));
    if (!target.startsWith(`${resolve(root)}${sep}`)) throw new Error("skilllifecycle.package_invalid");
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, content, { flag: "wx", mode: 0o600 });
    await chmod(target, 0o600);
  }
  if (!seen.has("skill.md")) throw new Error("skilllifecycle.package_invalid");
}

type ZipEntry = Readonly<{
  name: string; method: number; crc32: number; compressedSize: number;
  uncompressedSize: number; localOffset: number;
}>;

function readCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = Buffer.from(bytes);
  let eocd = -1;
  for (let offset = view.length - 22; offset >= Math.max(0, view.length - 65_557); offset--) {
    if (view.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0 || view.readUInt16LE(eocd + 4) !== 0 || view.readUInt16LE(eocd + 6) !== 0) {
    throw new Error("skilllifecycle.package_invalid");
  }
  const count = view.readUInt16LE(eocd + 10);
  const size = view.readUInt32LE(eocd + 12);
  let cursor = view.readUInt32LE(eocd + 16);
  if (count < 1 || count > 4096 || cursor + size > eocd) {
    throw new Error("skilllifecycle.package_invalid");
  }
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > view.length || view.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("skilllifecycle.package_invalid");
    }
    const flags = view.readUInt16LE(cursor + 8);
    const method = view.readUInt16LE(cursor + 10);
    const nameLength = view.readUInt16LE(cursor + 28);
    const extraLength = view.readUInt16LE(cursor + 30);
    const commentLength = view.readUInt16LE(cursor + 32);
    if ((flags & 1) !== 0 || ![0, 8].includes(method)) {
      throw new Error("skilllifecycle.package_invalid");
    }
    entries.push({
      name: view.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"),
      method,
      crc32: view.readUInt32LE(cursor + 16),
      compressedSize: view.readUInt32LE(cursor + 20),
      uncompressedSize: view.readUInt32LE(cursor + 24),
      localOffset: view.readUInt32LE(cursor + 42),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function extractEntry(bytes: Uint8Array, entry: ZipEntry): Buffer {
  const view = Buffer.from(bytes);
  const offset = entry.localOffset;
  if (offset + 30 > view.length || view.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error("skilllifecycle.package_invalid");
  }
  const start = offset + 30 + view.readUInt16LE(offset + 26) + view.readUInt16LE(offset + 28);
  const end = start + entry.compressedSize;
  if (end > view.length || entry.uncompressedSize > 32 * 1024 * 1024) {
    throw new Error("skilllifecycle.package_invalid");
  }
  const compressed = view.subarray(start, end);
  const content = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, {
    maxOutputLength: entry.uncompressedSize,
  });
  if (content.byteLength !== entry.uncompressedSize) throw new Error("skilllifecycle.package_invalid");
  return content;
}

function normalizeEntryPath(value: string): string {
  if (value === "" || value.startsWith("/") || value.startsWith("\\")
    || /^[A-Za-z]:/u.test(value) || value.includes("\\") || value.includes("\0")) {
    throw new Error("skilllifecycle.package_invalid");
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error("skilllifecycle.package_invalid");
  }
  return segments.join("/");
}

async function readInstallationManifest(root: string): Promise<{
  skillId: string; releaseRevision: string; packageDigest: string;
} | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(join(root, ".robothree-installation.json"), "utf8"));
    if (typeof value !== "object" || value === null || !("skillId" in value)
      || !("releaseRevision" in value) || !("packageDigest" in value)
      || typeof value.skillId !== "string" || typeof value.releaseRevision !== "string"
      || typeof value.packageDigest !== "string") return undefined;
    return {
      skillId: value.skillId,
      releaseRevision: value.releaseRevision,
      packageDigest: value.packageDigest,
    };
  } catch {
    return undefined;
  }
}

function installReceipt(command: InstallSkillReleaseCommand, operationId: string) {
  return SkillLifecycleMutationReceiptSchema.parse({
    contractVersion: "skill-lifecycle.v1alpha1",
    commandId: command.commandId,
    correlationId: command.correlationId,
    skillId: command.skillId,
    currentRevision: command.releaseRevision,
    state: "install_accepted",
    operationId,
  });
}

function succeededOperation(command: InstallSkillReleaseCommand, operationId: string): OperationState {
  return {
    contractVersion: "skill-lifecycle.v1alpha1",
    operationId,
    correlationId: command.correlationId,
    operationKind: "install",
    state: "succeeded",
    skillId: command.skillId,
    targetRevision: command.releaseRevision,
    updatedAt: new Date().toISOString(),
  };
}

async function persistOperation(path: string, value: OperationState): Promise<void> {
  const parsed = SkillOperationSchema.parse(value);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(parsed), { encoding: "utf8", flag: "wx", mode: 0o600 });
  await rename(temporary, path);
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function safeReason(error: unknown): string {
  return error instanceof Error && error.message === "skilllifecycle.installation_conflict"
    ? "已安装版本与请求不一致。" : "技能安装失败，未保留半安装目录。";
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
