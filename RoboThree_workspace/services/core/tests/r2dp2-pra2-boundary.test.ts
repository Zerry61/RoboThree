import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PRA2_PRODUCTION_SUPPORTED_RELEASE_COUNT,
  R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED,
} from "../src/index.js";

const root = resolve(import.meta.dirname, "../../..");

describe("R2D-P.2 / PRA-2 production boundaries", () => {
  it("keeps historical defaults closed while allowing only the authorized DFI-5.4.3A composition", async () => {
    expect(R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED).toBe(false);
    expect(PRA2_PRODUCTION_SUPPORTED_RELEASE_COUNT).toBe(0);
    const bootstrap = await readTree(resolve(root, "services/core/src/bootstrap"));
    expect(bootstrap.match(/createLocalDesktopR2DProductionComposition/gu))
      .toHaveLength(3);
    expect(bootstrap.match(/new\s+ExactSubjectBoundProviderReleaseMaterializer\b/gu))
      .toHaveLength(1);
  });

  it("has exactly one production entitlement source and no preinstalled subject release", async () => {
    const production = await readTree(resolve(root, "services/core/src"));
    expect(production.match(/implements\s+TaskResourceEntitlementSource\b/gu))
      .toHaveLength(1);
    expect(production.match(/new\s+ExactSubjectBoundProviderReleaseMaterializer\b/gu))
      .toHaveLength(2);
    const bootstrap = await readTree(resolve(root, "services/core/src/bootstrap"));
    expect(bootstrap).not.toMatch(
      /productionAdmitted:\s*true|createProviderReleaseInstallerBoundary/u,
    );
  });

  it("does not leak private identities or activate downstream consumers", async () => {
    for (const directory of [
      "packages/contracts/src",
      "apps/desktop/src",
      "apps/admin-console/src",
      "services/central-service/src/main",
    ]) {
      const source = await readTree(resolve(root, directory));
      expect(source, directory).not.toMatch(
        /ProviderReleaseMaterializationEnvelopeV1|LocalDesktopR2DSubjectBindingProofV1/u,
      );
    }
  });

  it("keeps migration and lockfile unchanged", async () => {
    const migrations = await readFile(resolve(
      root,
      "services/core/src/adapters/sqlite/migrations.ts",
    ), "utf8");
    const ids = [...migrations.matchAll(/\bid:\s*(\d+),/gu)]
      .map((match) => Number(match[1]));
    expect(Math.max(...ids)).toBe(26);
    expect(createHash("sha256").update(
      await readFile(resolve(root, "pnpm-lock.yaml")),
    ).digest("hex")).toBe(
      "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31",
    );
  });
});

async function readTree(directory: string): Promise<string> {
  return (await Promise.all((await files(directory)).map((file) => readFile(file, "utf8"))))
    .join("\n");
}

async function files(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (/\.(?:ts|tsx|js|mjs|java)$/u.test(entry.name)) result.push(path);
  }
  return result.sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
}
