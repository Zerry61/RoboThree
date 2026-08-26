import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const mainEntry = resolve("apps/desktop/src/main/index.ts");
const preloadBundle = resolve("apps/desktop/dist/preload/index.cjs");

describe("Electron sandboxed Preload bundle", () => {
  it("uses the dedicated CommonJS bundle from the production Main entry", async () => {
    const [main, bundle] = await Promise.all([
      readFile(mainEntry, "utf8"),
      readFile(preloadBundle, "utf8"),
    ]);

    expect(main).toContain('new URL("../preload/index.cjs", import.meta.url)');
    expect(bundle).toContain('require("electron")');
    expect(bundle).not.toMatch(/^\s*import\s/u);
    expect(bundle).not.toMatch(/^\s*export\s/u);
    expect(bundle).toContain("exposeInMainWorld");
    expect(bundle).toContain("robothreeDesktop");
  });
});
