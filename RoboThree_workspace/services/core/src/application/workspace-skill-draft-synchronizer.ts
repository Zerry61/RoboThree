import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";
import type { SkillLifecycleMutationReceipt } from
  "@robothree/contracts/skill-lifecycle/v1alpha1";
import { SkillDraftMaterialSchema, SkillLifecycleMutationReceiptSchema } from
  "@robothree/contracts/skill-lifecycle/v1alpha1";
import type { z } from "zod";

import type { HttpSkillLifecycleClient } from
  "../adapters/http/http-skill-lifecycle-client.js";
import type { WorkspaceGrantService } from "./workspace-grant-service.js";

const MAX_FILE_COUNT = 4096;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

type SkillDraftMaterial = z.infer<typeof SkillDraftMaterialSchema>;

export class WorkspaceSkillDraftSynchronizer {
  constructor(private readonly input: Readonly<{
    workspaces: WorkspaceGrantService;
    lifecycle: HttpSkillLifecycleClient;
  }>) {}

  async sync(input: Readonly<{
    commandId: string;
    correlationId: string;
    workspaceGrantId: string;
    skillId: string;
    expectedDraftRevision?: string;
    material: SkillDraftMaterial;
  }>): Promise<SkillLifecycleMutationReceipt> {
    const grant = (await this.input.workspaces.listPrivateAuthorities()).find((candidate) =>
      candidate.workspaceGrantId === input.workspaceGrantId
      && candidate.status === "active"
      && candidate.accessMode === "read_write");
    if (grant === undefined) throw new Error("skilllifecycle.not_found");
    const root = await realpath(grant.rootRealPath);
    const material = SkillDraftMaterialSchema.parse(input.material);
    if (material.skillId !== input.skillId) throw new Error("skilllifecycle.invalid_request");
    const archiveBytes = await archiveDraftRoot(root);
    const archiveDigest = `sha256:${createHash("sha256").update(archiveBytes).digest("hex")}`;
    return SkillLifecycleMutationReceiptSchema.parse(await this.input.lifecycle.syncDraft({
      commandId: input.commandId,
      correlationId: input.correlationId,
      material,
      ...(input.expectedDraftRevision === undefined
        ? {} : { expectedDraftRevision: input.expectedDraftRevision }),
      archiveBytes,
      archiveDigest,
    }));
  }

}

async function archiveDraftRoot(root: string): Promise<Uint8Array> {
  const files: Array<Readonly<{ path: string; bytes: Uint8Array }>> = [];
  await collect(root, root, files);
  if (files.length < 1 || files.length > MAX_FILE_COUNT
    || files.every((file) => file.path !== "SKILL.md")) {
    throw new Error("skilllifecycle.package_invalid");
  }
  files.sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
  const blocks: Buffer[] = [];
  for (const file of files) {
    const archivePath = `skill/${file.path}`;
    const header = tarHeader(archivePath, file.bytes.byteLength);
    blocks.push(header, Buffer.from(file.bytes));
    const padding = (512 - (file.bytes.byteLength % 512)) % 512;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 9 });
}

async function collect(root: string, directory: string,
  output: Array<Readonly<{ path: string; bytes: Uint8Array }>>): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    if (entry.name === "." || entry.name === ".." || entry.name.includes("\0")) {
      throw new Error("skilllifecycle.package_invalid");
    }
    const absolute = resolve(directory, entry.name);
    const rel = relative(root, absolute).split(sep).join("/");
    if (rel === "" || rel.startsWith("../") || rel.includes("/../")) {
      throw new Error("skilllifecycle.package_invalid");
    }
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error("skilllifecycle.package_invalid");
    if (stat.isDirectory()) {
      await collect(root, absolute, output);
      continue;
    }
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < 0 || stat.size > MAX_FILE_BYTES) {
      throw new Error("skilllifecycle.package_invalid");
    }
    const currentTotal = output.reduce((sum, file) => sum + file.bytes.byteLength, 0);
    if (output.length >= MAX_FILE_COUNT || currentTotal + stat.size > MAX_TOTAL_BYTES) {
      throw new Error("skilllifecycle.package_too_large");
    }
    const bytes = await readFile(absolute);
    const after = await lstat(absolute);
    if (!after.isFile() || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs
      || after.ino !== stat.ino || after.nlink !== 1) {
      throw new Error("skilllifecycle.local_source_changed");
    }
    output.push(Object.freeze({ path: rel, bytes }));
  }
}

function tarHeader(path: string, size: number): Buffer {
  const encoded = Buffer.from(path, "utf8");
  let name = path;
  let prefix = "";
  if (encoded.byteLength > 100) {
    const slash = path.lastIndexOf("/");
    if (slash < 1) throw new Error("skilllifecycle.package_invalid");
    prefix = path.slice(0, slash);
    name = path.slice(slash + 1);
  }
  if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) {
    throw new Error("skilllifecycle.package_invalid");
  }
  const header = Buffer.alloc(512);
  writeText(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o600);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeText(header, 257, 6, "ustar");
  header[262] = 0;
  writeText(header, 263, 2, "00");
  writeText(header, 345, 155, prefix);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const value = checksum.toString(8).padStart(6, "0");
  header.write(value, 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function writeText(target: Buffer, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength > length) throw new Error("skilllifecycle.package_invalid");
  bytes.copy(target, offset);
}

function writeOctal(target: Buffer, offset: number, length: number, value: number): void {
  const text = value.toString(8).padStart(length - 1, "0");
  if (text.length >= length) throw new Error("skilllifecycle.package_too_large");
  target.write(text, offset, length - 1, "ascii");
  target[offset + length - 1] = 0;
}
