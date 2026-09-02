import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import type {
  LockedSkillInstructionMaterial,
  LockedSkillInstructionResolver,
  LockedSkillRevision,
} from "../ports/locked-skill-instruction-resolver.js";
import { calculateInstructionContentDigest } from "./instruction-bundle-domain.js";

export type InstalledSkillRuntimeManifest = Readonly<{
  skillId: string;
  revision: string;
  contentDigest: string;
}>;

type Material = InstalledSkillRuntimeManifest & Readonly<{
  skillFile: string;
  registryPriority: number;
}>;

export class InstalledSkillRuntimeSource implements LockedSkillInstructionResolver {
  readonly #materials = new Map<string, Material>();

  constructor(input: Readonly<{ installedRoot?: string }>) {
    if (input.installedRoot !== undefined) {
      this.#scan(input.installedRoot);
      this.#scanDrafts(dirname(input.installedRoot));
      this.#scanLocalCandidates(dirname(input.installedRoot));
      this.#scanAdminTests(dirname(input.installedRoot));
    }
  }

  manifests(): readonly InstalledSkillRuntimeManifest[] {
    const currentBySkillId = new Map<string, Material>();
    for (const material of this.#materials.values()) {
      const current = currentBySkillId.get(material.skillId);
      if (current === undefined
        || material.registryPriority > current.registryPriority
        || (material.registryPriority === current.registryPriority
          && material.revision.localeCompare(current.revision) > 0)) {
        currentBySkillId.set(material.skillId, material);
      }
    }
    return [...currentBySkillId.values()]
      .sort((left, right) => left.skillId.localeCompare(right.skillId)
        || left.revision.localeCompare(right.revision))
      .map(({ skillFile: _skillFile, registryPriority: _registryPriority, ...manifest }) =>
        Object.freeze(manifest));
  }

  async loadExact(reference: LockedSkillRevision): Promise<LockedSkillInstructionMaterial | undefined> {
    const material = this.#materials.get(key(reference.id, reference.revision));
    if (material === undefined || material.contentDigest !== reference.contentDigest) return undefined;
    try {
      const file = realpathSync(material.skillFile);
      if (file !== material.skillFile || !lstatSync(file).isFile()) return undefined;
      const mainBody = normalizedSkillBody(readFileSync(file));
      const sourceContentDigest = calculateInstructionContentDigest(mainBody);
      if (sourceContentDigest !== material.contentDigest) return undefined;
      return Object.freeze({
        skillId: material.skillId,
        revision: material.revision,
        sourceContentDigest,
        mainBody,
        mainBodyDigest: calculateInstructionContentDigest(mainBody),
      });
    } catch {
      return undefined;
    }
  }

  #scan(inputRoot: string): void {
    let root: string;
    try { root = realpathSync(inputRoot); } catch { return; }
    for (const skillId of safeDirectories(root)) {
      const skillRoot = join(root, skillId);
      for (const revision of safeDirectories(skillRoot)) {
        try {
          const exactRoot = realpathSync(join(skillRoot, revision));
          requireWithin(root, exactRoot);
          const manifestFile = realpathSync(join(exactRoot, ".robothree-installation.json"));
          const skillFile = realpathSync(join(exactRoot, "SKILL.md"));
          requireWithin(exactRoot, manifestFile);
          requireWithin(exactRoot, skillFile);
          if (!lstatSync(manifestFile).isFile() || !lstatSync(skillFile).isFile()) continue;
          const manifest = parseManifest(JSON.parse(readFileSync(manifestFile, "utf8")));
          if (manifest.skillId !== skillId || manifest.releaseRevision !== revision) continue;
          const body = normalizedSkillBody(readFileSync(skillFile));
          const contentDigest = calculateInstructionContentDigest(body);
          this.#materials.set(key(skillId, revision), Object.freeze({
            skillId,
            revision,
            contentDigest,
            skillFile,
            registryPriority: 30,
          }));
        } catch {
          continue;
        }
      }
    }
  }

  #scanDrafts(skillsRoot: string): void {
    try { skillsRoot = realpathSync(skillsRoot); } catch { return; }
    const stateRoot = join(skillsRoot, ".state", "drafts");
    for (const name of safeFiles(stateRoot)) {
      if (!name.endsWith(".json")) continue;
      try {
        const stateFile = realpathSync(join(stateRoot, name));
        requireWithin(stateRoot, stateFile);
        const state = parseDraftState(JSON.parse(readFileSync(stateFile, "utf8")));
        const skillFile = realpathSync(join(skillsRoot, "drafts", state.draftId, "SKILL.md"));
        requireWithin(join(skillsRoot, "drafts", state.draftId), skillFile);
        if (!lstatSync(stateFile).isFile() || !lstatSync(skillFile).isFile()) continue;
        const body = normalizedSkillBody(readFileSync(skillFile));
        const contentDigest = calculateInstructionContentDigest(body);
        this.#materials.set(key(state.skillId, state.currentRevision), Object.freeze({
          skillId: state.skillId,
          revision: state.currentRevision,
          contentDigest,
          skillFile,
          registryPriority: 20,
        }));
      } catch {
        continue;
      }
    }
  }

  #scanLocalCandidates(skillsRoot: string): void {
    try {
      skillsRoot = realpathSync(skillsRoot);
      const stateFile = realpathSync(join(skillsRoot, ".state", "local-candidates.json"));
      requireWithin(skillsRoot, stateFile);
      const state = parseLocalCandidateState(JSON.parse(readFileSync(stateFile, "utf8")));
      for (const candidate of state) {
        try {
          const sourceRoot = realpathSync(candidate.sourceRoot);
          const skillFile = realpathSync(join(sourceRoot, "SKILL.md"));
          requireWithin(sourceRoot, skillFile);
          if (!lstatSync(sourceRoot).isDirectory() || !lstatSync(skillFile).isFile()) continue;
          const body = normalizedSkillBody(readFileSync(skillFile));
          const revision = `sha256:${createHash("sha256").update(body).digest("hex")}`;
          if (revision !== candidate.revision) continue;
          const contentDigest = calculateInstructionContentDigest(body);
          this.#materials.set(key(candidate.skillId, candidate.revision), Object.freeze({
            skillId: candidate.skillId,
            revision: candidate.revision,
            contentDigest,
            skillFile,
            registryPriority: 10,
          }));
        } catch {
          continue;
        }
      }
    } catch {
      // Local discovery is optional until Main has produced an exact private index.
    }
  }

  #scanAdminTests(skillsRoot: string): void {
    try { skillsRoot = realpathSync(skillsRoot); } catch { return; }
    const testsRoot = join(skillsRoot, ".tests");
    for (const skillId of safeDirectories(testsRoot)) {
      for (const draftRevision of safeDirectories(join(testsRoot, skillId))) {
        try {
          const root = realpathSync(join(testsRoot, skillId, draftRevision));
          requireWithin(testsRoot, root);
          const stateFile = realpathSync(join(root, ".robothree-admin-test.json"));
          const skillFile = realpathSync(join(root, "SKILL.md"));
          requireWithin(root, stateFile);
          requireWithin(root, skillFile);
          const state = parseAdminTestState(JSON.parse(readFileSync(stateFile, "utf8")));
          if (state.skillId !== skillId || state.draftRevision !== draftRevision) continue;
          const bytes = readFileSync(skillFile);
          if (`sha256:${createHash("sha256").update(bytes).digest("hex")}`
            !== state.skillMarkdownDigest) continue;
          const body = normalizedSkillBody(bytes);
          this.#materials.set(key(skillId, draftRevision), Object.freeze({
            skillId, revision: draftRevision,
            contentDigest: calculateInstructionContentDigest(body), skillFile,
            registryPriority: 40,
          }));
        } catch { continue; }
      }
    }
  }
}

export class CompositeLockedSkillInstructionResolver implements LockedSkillInstructionResolver {
  constructor(private readonly resolvers: readonly LockedSkillInstructionResolver[]) {}

  async loadExact(reference: LockedSkillRevision) {
    for (const resolver of this.resolvers) {
      const material = await resolver.loadExact(reference);
      if (material !== undefined) return material;
    }
    return undefined;
  }
}

function safeDirectories(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name)
      .filter((name) => name !== "." && name !== ".." && !name.includes("\0"))
      .sort();
  } catch {
    return [];
  }
}

function safeFiles(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
      .map((entry) => entry.name)
      .filter((name) => name !== "." && name !== ".." && !name.includes("\0"))
      .sort();
  } catch {
    return [];
  }
}

function parseDraftState(value: unknown): { draftId: string; skillId: string; currentRevision: string } {
  if (typeof value !== "object" || value === null
    || !("format" in value) || value.format !== "robothree.skill-draft-state.v1"
    || !("draftId" in value) || typeof value.draftId !== "string"
    || !("skillId" in value) || typeof value.skillId !== "string"
    || !("currentRevision" in value) || typeof value.currentRevision !== "string") {
    throw new Error("installed_skill_draft_state_invalid");
  }
  return { draftId: value.draftId, skillId: value.skillId, currentRevision: value.currentRevision };
}

function parseLocalCandidateState(value: unknown): ReadonlyArray<{
  skillId: string; revision: string; sourceRoot: string;
}> {
  if (typeof value !== "object" || value === null
    || !("format" in value) || value.format !== "robothree.local-skill-candidates.v1"
    || !("candidates" in value) || !Array.isArray(value.candidates)) {
    throw new Error("installed_skill_local_state_invalid");
  }
  return value.candidates.map((candidate) => {
    if (typeof candidate !== "object" || candidate === null
      || !("skillId" in candidate) || typeof candidate.skillId !== "string"
      || !("revision" in candidate) || typeof candidate.revision !== "string"
      || !("sourceRoot" in candidate) || typeof candidate.sourceRoot !== "string") {
      throw new Error("installed_skill_local_state_invalid");
    }
    return { skillId: candidate.skillId, revision: candidate.revision,
      sourceRoot: candidate.sourceRoot };
  });
}

function parseAdminTestState(value: unknown): Readonly<{
  skillId: string; draftRevision: string; skillMarkdownDigest: string;
}> {
  if (typeof value !== "object" || value === null) {
    throw new Error("installed_skill_admin_test_state_invalid");
  }
  const record = value as Record<string, unknown>;
  if (record.format !== "robothree.admin-skill-test-material.v1"
    || typeof record.skillId !== "string" || typeof record.draftRevision !== "string"
    || typeof record.skillMarkdownDigest !== "string") {
    throw new Error("installed_skill_admin_test_state_invalid");
  }
  return { skillId: record.skillId, draftRevision: record.draftRevision,
    skillMarkdownDigest: record.skillMarkdownDigest };
}

function normalizedSkillBody(bytes: Buffer): string {
  const decoded = bytes.toString("utf8");
  if (decoded.includes("\uFFFD") || decoded.charCodeAt(0) === 0xfeff) {
    throw new Error("installed_skill_material_invalid");
  }
  const normalized = decoded.replace(/\r\n?/gu, "\n").replace(/\n+$/u, "");
  if (normalized.length === 0 || Buffer.byteLength(normalized, "utf8") > 128 * 1024) {
    throw new Error("installed_skill_material_invalid");
  }
  return normalized;
}

function parseManifest(value: unknown): { skillId: string; releaseRevision: string } {
  if (typeof value !== "object" || value === null
    || !("format" in value) || value.format !== "robothree.skill-installation.v1"
    || !("skillId" in value) || typeof value.skillId !== "string"
    || !("releaseRevision" in value) || typeof value.releaseRevision !== "string") {
    throw new Error("installed_skill_manifest_invalid");
  }
  return { skillId: value.skillId, releaseRevision: value.releaseRevision };
}

function requireWithin(root: string, candidate: string): void {
  const path = relative(root, candidate);
  if (path === "" || path === ".." || path.startsWith(`..${sep}`)) {
    throw new Error("installed_skill_path_invalid");
  }
}

function key(skillId: string, revision: string): string {
  return `${skillId}\0${revision}`;
}
