import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import {
  GetSkillQuerySchema,
  ListSkillsQuerySchema,
  SkillDetailSchema,
  SkillPageSchema,
  type GetSkillQuery,
  type ListSkillsQuery,
  type SkillDetail,
  type SkillPage,
} from "@robothree/contracts/skill-lifecycle/v1alpha1";

import type { CorePrivateClient } from "./core-private-client.js";

type DiscoveryClient = Pick<CorePrivateClient, "listWorkspaceGrantAuthorities">;
type Candidate = Readonly<{
  skillId: string;
  revision: string;
  technicalName: string;
  displayTitle: string;
  displayDescription: string;
  sourceKind: "local_user_directory" | "local_workspace_directory";
  sourceRoot: string;
  safeMarkdown: string;
  updatedAt: string;
}>;

export class SkillLocalDiscoveryService {
  readonly #privateRoot: string;
  readonly #skillsRoot: string;
  readonly #statePath: string;
  readonly #onChanged: (() => Promise<void>) | undefined;

  constructor(input: Readonly<{ privateRootPath: string; onChanged?: () => Promise<void> }>) {
    this.#privateRoot = input.privateRootPath;
    this.#skillsRoot = join(input.privateRootPath, "skills");
    this.#statePath = join(this.#skillsRoot, ".state", "local-candidates.json");
    this.#onChanged = input.onChanged;
  }

  async list(query: ListSkillsQuery, client: DiscoveryClient): Promise<SkillPage> {
    const parsed = ListSkillsQuerySchema.parse(query);
    if (parsed.scope !== "local") throw new Error("skilllifecycle.invalid_request");
    const candidates = await this.#discover(client);
    return SkillPageSchema.parse({
      contractVersion: "skill-lifecycle.v1alpha1",
      queryRevision: digest(JSON.stringify(candidates.map(({ sourceRoot: _root,
        safeMarkdown: _markdown, ...item }) => item))),
      scope: "local",
      items: candidates.slice(0, parsed.limit).map((candidate) => summary(candidate, candidates)),
    });
  }

  async get(query: GetSkillQuery, client: DiscoveryClient): Promise<SkillDetail> {
    const parsed = GetSkillQuerySchema.parse(query);
    const candidates = await this.#discover(client);
    const candidate = candidates.find((item) => item.skillId === parsed.skillId
      && (parsed.revision === undefined || item.revision === parsed.revision)
      && (parsed.sourceKind === undefined || item.sourceKind === parsed.sourceKind));
    if (candidate === undefined) {
      if (parsed.revision !== undefined
        && candidates.some((item) => item.skillId === parsed.skillId)) {
        throw new Error("skilllifecycle.local_source_changed");
      }
      throw new Error("skilllifecycle.not_found");
    }
    return SkillDetailSchema.parse({
      ...summary(candidate, candidates),
      safeMarkdown: candidate.safeMarkdown,
    });
  }

  async #discover(client: DiscoveryClient): Promise<readonly Candidate[]> {
    const roots: Array<Readonly<{ root: string; kind: Candidate["sourceKind"] }>> = [];
    await mkdir(join(this.#skillsRoot, "local"), { recursive: true, mode: 0o700 });
    roots.push({ root: await realpath(join(this.#skillsRoot, "local")),
      kind: "local_user_directory" });
    const grants = await client.listWorkspaceGrantAuthorities({
      correlationId: randomUUID(),
    });
    if (grants.ok) {
      const external = grants.value.filter((grant) => grant.status === "active"
        && grant.accessMode === "read_write"
        && grant.rootRealPath !== this.#privateRoot
        && !grant.rootRealPath.startsWith(`${this.#privateRoot}${sep}`));
      // The frozen query has no Workspace identity. Never broaden discovery across
      // several grants; a single external active grant is the only unambiguous case.
      if (external.length === 1) {
        const grant = external[0]!;
        const projectRoot = join(grant.rootRealPath, ".robothree", "skills");
        try {
          roots.push({ root: await realpath(projectRoot), kind: "local_workspace_directory" });
        } catch {
          // Discovery is read-only and never creates a project-local directory.
        }
      }
    }
    const candidates: Candidate[] = [];
    for (const source of roots) candidates.push(...await scanRoot(source.root, source.kind));
    candidates.sort((left, right) => left.technicalName.localeCompare(right.technicalName)
      || left.skillId.localeCompare(right.skillId));
    const runnable = candidates.filter((candidate) => !isConflicting(candidate, candidates));
    const state = JSON.stringify({
      format: "robothree.local-skill-candidates.v1",
      candidates: runnable.map(({ safeMarkdown: _markdown, ...candidate }) => candidate),
    });
    let prior = "";
    try { prior = await readFile(this.#statePath, "utf8"); } catch { /* first discovery */ }
    if (prior !== state) {
      await persist(this.#statePath, state);
      await this.#onChanged?.();
    }
    return candidates;
  }
}

async function scanRoot(root: string, kind: Candidate["sourceKind"]): Promise<Candidate[]> {
  const output: Candidate[] = [];
  for (const entry of (await readdir(root, { withFileTypes: true }))
    .filter((item) => item.isDirectory() && !item.isSymbolicLink())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    try {
      const sourceRoot = await realpath(join(root, entry.name));
      requireContained(root, sourceRoot);
      const skillFile = await realpath(join(sourceRoot, "SKILL.md"));
      requireContained(sourceRoot, skillFile);
      const stat = await lstat(skillFile);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > 128 * 1024) continue;
      const bytes = await readFile(skillFile);
      const after = await lstat(skillFile);
      if (after.ino !== stat.ino || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) continue;
      const markdown = decode(bytes);
      const metadata = frontmatter(markdown);
      const sourceIdentity = `${kind}\0${sourceRoot}`;
      output.push(Object.freeze({
        skillId: `skill.local.${createHash("sha256").update(sourceIdentity).digest("hex").slice(0, 32)}`,
        revision: digest(markdown),
        technicalName: metadata.name,
        displayTitle: metadata.name,
        displayDescription: metadata.description,
        sourceKind: kind,
        sourceRoot,
        safeMarkdown: markdown,
        updatedAt: new Date(stat.mtimeMs).toISOString(),
      }));
    } catch {
      continue;
    }
  }
  return output;
}

function summary(candidate: Candidate, all: readonly Candidate[]) {
  const conflicting = isConflicting(candidate, all);
  return {
    skillId: candidate.skillId,
    revision: candidate.revision,
    technicalName: candidate.technicalName,
    displayTitle: candidate.displayTitle,
    displayDescription: candidate.displayDescription,
    sourceKind: candidate.sourceKind,
    availability: conflicting ? "conflicting" as const : "available" as const,
    installed: false,
    updatedAt: candidate.updatedAt,
  };
}

function isConflicting(candidate: Candidate, all: readonly Candidate[]): boolean {
  return all.some((other) => other.skillId !== candidate.skillId
    && other.technicalName.toLocaleLowerCase("en-US")
      === candidate.technicalName.toLocaleLowerCase("en-US"));
}

function decode(bytes: Buffer): string {
  const value = bytes.toString("utf8");
  if (value.includes("\uFFFD") || value.charCodeAt(0) === 0xfeff) throw new Error("invalid");
  return value.replace(/\r\n?/gu, "\n").replace(/\n+$/u, "");
}

function frontmatter(markdown: string): { name: string; description: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]+)$/u.exec(markdown);
  if (match === null) throw new Error("invalid");
  const lines = match[1]!.split("\n");
  const name = field(lines, "name");
  const description = field(lines, "description");
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(name)
    || name.length < 3 || name.length > 64 || description.length > 500) throw new Error("invalid");
  return { name, description };
}

function field(lines: string[], key: string): string {
  const matches = lines.filter((line) => line.startsWith(`${key}:`));
  if (matches.length !== 1) throw new Error("invalid");
  const value = matches[0]!.slice(key.length + 1).trim();
  if (value.length < 1) throw new Error("invalid");
  return value;
}

async function persist(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, value, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await rename(temp, path);
}

function requireContained(root: string, candidate: string): void {
  const rel = relative(root, candidate);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("invalid");
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
