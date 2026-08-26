import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { R2D_DYNAMIC_REQUEST_FACTS_DEFAULT_ENABLED } from "../src/index.js";

const root = process.cwd();

describe("R2D-1 activation and architecture boundary", () => {
  it("keeps production activation disabled and out of bootstrap composition", async () => {
    expect(R2D_DYNAMIC_REQUEST_FACTS_DEFAULT_ENABLED).toBe(false);
    const bootstrap = await readFile(resolve(
      root,
      "services/core/src/bootstrap/create-desktop-private-runtime.ts",
    ), "utf8");
    expect(bootstrap).not.toMatch(
      /DynamicRequestFactsRuntime|DynamicRequestFactsMaterializer|dynamicRequestFactsRuntime/u,
    );
  });

  it("keeps Dynamic Request Facts inside Core and out of public consumers", async () => {
    const forbiddenRoots = [
      "packages/contracts/src",
      "apps/desktop/src",
      "apps/admin-console/src",
      "services/central-service/src/main",
    ];
    const matches: string[] = [];
    for (const directory of forbiddenRoots) {
      for (const file of await sourceFiles(resolve(root, directory))) {
        const source = await readFile(file, "utf8");
        if (/DynamicRequestFacts|dynamic-request-facts|request-scoped-system-message/u.test(source)) {
          matches.push(relative(root, file));
        }
      }
    }
    expect(matches).toEqual([]);
  });

  it("does not add migration 27, dependencies, or a production configuration input", async () => {
    const migrations = await readFile(resolve(
      root,
      "services/core/src/adapters/sqlite/migrations.ts",
    ), "utf8");
    const ids = [...migrations.matchAll(/\bid:\s*(\d+),/gu)]
      .map((match) => Number(match[1]));
    expect(Math.max(...ids)).toBe(26);
    expect(migrations).not.toMatch(/\bid:\s*27,/u);

    const corePackage = JSON.parse(await readFile(resolve(
      root,
      "services/core/package.json",
    ), "utf8")) as { dependencies: Record<string, string> };
    expect(Object.keys(corePackage.dependencies).sort()).toEqual([
      "@robothree/contracts",
      "@robothree/document-worker",
      "zod",
    ]);

    const productionCore = await sourceFiles(resolve(root, "services/core/src"));
    const forbiddenConfigurationReferences: string[] = [];
    for (const file of productionCore) {
      const source = await readFile(file, "utf8");
      if (/R2D_DYNAMIC_REQUEST_FACTS_(?:ENABLED|LOCALE|TIMEZONE)_ENV/u.test(source)) {
        forbiddenConfigurationReferences.push(relative(root, file));
      }
    }
    expect(forbiddenConfigurationReferences).toEqual([]);
  });

  it("uses explicit v2 dispatch without widening historical root Contracts", async () => {
    for (const [file, version] of [
      ["services/core/src/ports/model-invocation-link-persistence.ts", "v2"],
      ["services/core/src/ports/compaction-model-invocation-link-persistence.ts", "v2"],
      ["services/core/src/application/local-personal-model-invocation.ts", "v1alpha2"],
    ] as const) {
      const source = await readFile(resolve(root, file), "utf8");
      expect(source).toContain(`schemaVersion === "${version}"`);
      expect(source).toMatch(/schema version is unsupported/u);
      expect(source).not.toMatch(/catch[^}]*Legacy/u);
    }
    const contractsRoot = await readFile(resolve(
      root,
      "packages/contracts/src/index.ts",
    ), "utf8");
    expect(contractsRoot).not.toMatch(/DynamicRequestFacts|ModelInvocationLinkV2/u);
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.isFile() && /\.(?:ts|java)$/u.test(path)) files.push(path);
  }
  return files.sort();
}
