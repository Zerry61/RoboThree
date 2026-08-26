import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const workspace = join(import.meta.dirname, "../../..");

describe("EIPC-0 authority semantics boundary", () => {
  it("keeps the production identity-composition blocker explicit", async () => {
    const composition = await readFile(join(
      workspace,
      "services/core/src/bootstrap/create-desktop-private-runtime.ts",
    ), "utf8");
    expect(composition).toContain(
      'const activeUserId = "00000000-0000-4000-8000-000000000001"',
    );
    expect(composition).not.toContain("RuntimeActiveEnterpriseSessionAuthorityProvider");
  });

  it("does not expose enterprise authority composition to Main, Preload or Renderer", async () => {
    for (const root of [
      "apps/desktop/src/main",
      "apps/desktop/src/preload",
      "apps/desktop/src/renderer",
    ]) {
      const sources = await readTree(join(workspace, root));
      expect(sources.join("\n"), root).not.toMatch(
        /enterprise-identity-composition|RuntimeActiveEnterpriseSessionAuthorityProvider/u,
      );
    }
  });

  it("keeps the new provider as a Core-private semantic Port without an implementation", async () => {
    const sources = await readTree(join(workspace, "services/core/src"));
    const combined = sources.join("\n");
    expect(combined.match(/interface RuntimeActiveEnterpriseSessionAuthorityProvider/gu))
      .toHaveLength(1);
    expect(combined).not.toMatch(
      /class\s+\w*RuntimeActiveEnterpriseSessionAuthorityProvider/u,
    );
  });

  it("does not advance the Core migration chain", async () => {
    const migrations = await readFile(join(
      workspace,
      "services/core/src/adapters/sqlite/migrations.ts",
    ), "utf8");
    expect(migrations).toContain("id: 24");
    expect(migrations).toMatch(/id:\s*25\b/u);
  });
});

async function readTree(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await readTree(path));
    else if (/\.(?:ts|vue)$/u.test(entry.name)) result.push(await readFile(path, "utf8"));
  }
  return result;
}
