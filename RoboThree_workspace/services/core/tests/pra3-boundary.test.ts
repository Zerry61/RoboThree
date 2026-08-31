import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PRA-3 production boundary", () => {
  it("keeps the admitted installer out of production bootstrap and downstream UI", async () => {
    const root = resolve(import.meta.dirname, "../../..");
    const bootstrap = await readFile(
      resolve(root, "services/core/src/bootstrap/create-desktop-private-runtime.ts"),
      "utf8",
    );
    const desktop = await readFile(
      resolve(root, "apps/desktop/src/renderer/adapters/workbench-adapter.ts"),
      "utf8",
    );
    expect(bootstrap).not.toMatch(
      /OPENAI_GPT_5_2_PRODUCTION_ADMITTED_POLICY|createProviderReleaseInstallerBoundary/u,
    );
    expect(desktop).not.toMatch(
      /ProviderReleaseAdmissionPolicy|production_admitted_materialized|reasoning_effort/u,
    );
  });
});
