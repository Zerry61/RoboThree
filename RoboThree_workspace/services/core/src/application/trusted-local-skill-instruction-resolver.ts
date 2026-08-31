import {
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { JsonValueSchema } from "@robothree/contracts";

import type { LockedSkillRevision } from
  "../ports/locked-skill-instruction-resolver.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import { calculateInstructionContentDigest } from "./instruction-bundle-domain.js";

export const PRESENTATION_PLANNING_SKILL_ID =
  "skill.presentation-planning" as const;

const PRESENTATION_SKILL_REVISION_DOMAIN =
  "robothree.trusted-local-skill-revision.v1" as const;
const DEFAULT_SKILL_ROOT = fileURLToPath(
  new URL("../../resources/skills", import.meta.url),
);

export type TrustedLocalSkillManifest = Readonly<{
  skillId: typeof PRESENTATION_PLANNING_SKILL_ID;
  revision: string;
  contentDigest: string;
  materializedRef: string;
}>;

export function loadPresentationPlanningSkillManifest(
  trustedRoot = DEFAULT_SKILL_ROOT,
): TrustedLocalSkillManifest {
  const root = realpathSync(trustedRoot);
  const file = realpathSync(resolve(root, "presentation-planning", "SKILL.md"));
  requireWithinRoot(root, file);
  if (!lstatSync(file).isFile()) throw new Error("trusted_skill_material_unavailable");
  const content = normalizedSkillBody(readFileSync(file));
  const contentDigest = calculateInstructionContentDigest(content);
  const revision = sha256CanonicalJson(JsonValueSchema.parse({
    domain: PRESENTATION_SKILL_REVISION_DOMAIN,
    skillId: PRESENTATION_PLANNING_SKILL_ID,
    contentDigest,
  }));
  return Object.freeze({
    skillId: PRESENTATION_PLANNING_SKILL_ID,
    revision,
    contentDigest,
    materializedRef: file,
  });
}

export class TrustedLocalSkillInstructionResolver {
  readonly #root: string;
  readonly #manifest: TrustedLocalSkillManifest;

  constructor(input: Readonly<{
    trustedRoot?: string;
    manifest?: TrustedLocalSkillManifest;
  }> = {}) {
    this.#root = realpathSync(input.trustedRoot ?? DEFAULT_SKILL_ROOT);
    this.#manifest = input.manifest
      ?? loadPresentationPlanningSkillManifest(this.#root);
    requireWithinRoot(this.#root, this.#manifest.materializedRef);
  }

  async loadExact(reference: LockedSkillRevision) {
    if (reference.id !== this.#manifest.skillId
      || reference.revision !== this.#manifest.revision
      || reference.contentDigest !== this.#manifest.contentDigest
      || ("materializedRef" in reference
        && reference.materializedRef !== this.#manifest.materializedRef)) {
      return undefined;
    }
    let file: string;
    try {
      file = realpathSync(this.#manifest.materializedRef);
      requireWithinRoot(this.#root, file);
      if (!lstatSync(file).isFile()) return undefined;
    } catch {
      return undefined;
    }
    const mainBody = normalizedSkillBody(readFileSync(file));
    const sourceContentDigest = calculateInstructionContentDigest(mainBody);
    if (sourceContentDigest !== this.#manifest.contentDigest) return undefined;
    return Object.freeze({
      skillId: this.#manifest.skillId,
      revision: this.#manifest.revision,
      sourceContentDigest,
      mainBody,
      mainBodyDigest: calculateInstructionContentDigest(mainBody),
    });
  }
}

function normalizedSkillBody(bytes: Buffer): string {
  const decoded = bytes.toString("utf8");
  if (decoded.includes("\uFFFD") || decoded.charCodeAt(0) === 0xfeff) {
    throw new Error("trusted_skill_material_invalid");
  }
  const normalized = decoded.replace(/\r\n?/gu, "\n").replace(/\n+$/u, "");
  if (normalized.length === 0 || Buffer.byteLength(normalized, "utf8") > 128 * 1024) {
    throw new Error("trusted_skill_material_invalid");
  }
  return normalized;
}

function requireWithinRoot(root: string, candidate: string): void {
  const path = relative(root, candidate);
  if (path === "" || path === ".." || path.startsWith(`..${sep}`)) {
    throw new Error("trusted_skill_path_invalid");
  }
}
