import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

describe("LDA-1 / R2D-P.1 / PRA-1 boundaries", () => {
  it("keeps later source/materializer unreachable from production bootstrap", async () => {
    const productionCore = await readTree(resolve(root, "services/core/src"));
    const bootstrap = await readTree(resolve(root, "services/core/src/bootstrap"));
    expect(countImplementations(productionCore, "TaskResourceEntitlementSource")).toBe(1);
    expect(bootstrap).not.toMatch(/R2D_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED|OPENAI_GPT_5_2_SNAPSHOT_ADMISSION_CANDIDATE/u);
    expect(productionCore.match(/PRA1_PRODUCTION_SUPPORTED_RELEASE_COUNT\s*=\s*0/gu))
      .toHaveLength(1);
  });

  it("does not leak Core-private authority, entitlement v2 or admission policy", async () => {
    const publicSurface = [
      "packages/contracts/src",
      "apps/desktop/src",
      "apps/admin-console/src",
      "services/central-service/src/main",
    ];
    for (const directory of publicSurface) {
      const source = await readTree(resolve(root, directory));
      expect(source, directory).not.toMatch(
        /LocalDesktopSubjectAuthority|TaskResourceEntitlementSnapshotV2|ProviderReleaseAdmissionPolicy/u,
      );
    }
  });

  it("clears namespace key copies and does not introduce a new mapping directive", async () => {
    const authority = await readFile(resolve(
      root,
      "services/core/src/application/local-desktop-subject-authority.ts",
    ), "utf8");
    expect(authority).toMatch(/finally\s*\{\s*key\.fill\(0\)/su);
    const mapping = await readFile(resolve(
      root,
      "services/core/src/application/provider-reasoning-mapping-domain.ts",
    ), "utf8");
    expect(mapping).not.toMatch(/deepseek|reasoning_max|thinking_enabled/iu);
  });

  it("keeps migration and lockfile baselines unchanged", async () => {
    const migrations = await readFile(resolve(
      root,
      "services/core/src/adapters/sqlite/migrations.ts",
    ), "utf8");
    const ids = [...migrations.matchAll(/\bid:\s*(\d+),/gu)].map((match) => Number(match[1]));
    expect(Math.max(...ids)).toBe(26);
    const lockfile = await readFile(resolve(root, "pnpm-lock.yaml"));
    expect(createHash("sha256").update(lockfile).digest("hex"))
      .toBe("5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31");
  });
});

async function readTree(directory: string): Promise<string> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx|js|mjs|java)$/u.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  return (await Promise.all(files.map(async (file) =>
    `\n// ${relative(root, file)}\n${await readFile(file, "utf8")}`))).join("\n");
}

function countImplementations(source: string, interfaceName: string): number {
  return [...source.matchAll(new RegExp(`implements\\s+${interfaceName}\\b`, "gu"))].length;
}
