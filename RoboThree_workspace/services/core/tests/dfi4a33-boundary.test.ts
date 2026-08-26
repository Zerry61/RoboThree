import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const workspace = join(import.meta.dirname, "../../..");

describe("DFI-4A.3.3 architecture boundary", () => {
  it("keeps migration 24 immutable while allowing additive timeout migration 25", async () => {
    const source = await readFile(join(
      workspace,
      "services/core/src/adapters/sqlite/migrations.ts",
    ), "utf8");
    expect(source).toContain("id: 24");
    expect(source).toMatch(/id:\s*25\b/u);
  });

  it("keeps local Personal runtime out of Preload and Renderer", async () => {
    for (const root of [
      "apps/desktop/src/preload",
      "apps/desktop/src/renderer",
    ]) {
      const sources = await readTree(join(workspace, root));
      expect(sources.join("\n")).not.toMatch(
        /DurableLocalPersonalModelProvider|TaskLockedModelProviderResolver|local-personal-model-invocation/u,
      );
    }
  });

  it("does not expose the private invocation persistence through Desktop Contracts", async () => {
    const sources = await readTree(join(workspace, "packages/contracts/src/desktop-local"));
    expect(sources.join("\n")).not.toMatch(
      /LocalPersonalModelInvocation|ProviderUsageFact|credentialRef/u,
    );
  });

  it("keeps the durable provider free of Secret serialization and logging", async () => {
    const source = await readFile(join(
      workspace,
      "services/core/src/application/durable-local-personal-model-provider.ts",
    ), "utf8");
    expect(source).not.toMatch(/secret\.toString|secretBase64|console\.(?:log|error)|JSON\.stringify\(.*secret/iu);
  });

  it("uses one Task-locked resolver for main and compaction purposes", async () => {
    const source = await readFile(join(
      workspace,
      "services/core/src/application/durable-agent-loop-starter.ts",
    ), "utf8");
    expect(source).toContain('purpose: "assistant_message"');
    expect(source).toContain('purpose: "compaction_summary"');
    expect(source).not.toContain("#adapterHandles");
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
