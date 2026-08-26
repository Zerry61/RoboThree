import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  STRM0_CHANNELS,
  STRM0_MARKERS,
  assertStrm0LeakageScannerNegativeCoverage,
  scanStrm0Leakage,
  strm0SemanticDigest,
} from "./strm0-evidence.mjs";

describe("STRM-0 route A decision evidence", () => {
  it("scans four channels for five marker classes and four encodings", () => {
    expect(STRM0_CHANNELS).toHaveLength(4);
    expect(Object.keys(STRM0_MARKERS)).toHaveLength(5);
    expect(assertStrm0LeakageScannerNegativeCoverage()).toBe(80);
  });

  it("returns exact zero counts for clean evidence", () => {
    const result = scanStrm0Leakage(Object.fromEntries(
      STRM0_CHANNELS.map((channel) => [channel, "safe typed evidence only"]),
    ));
    expect(result.totalMatchCount).toBe(0);
    expect(Object.values(result.channelMatchCounts)).toEqual([0, 0, 0, 0]);
  });

  it("keeps the semantic digest canonical", () => {
    expect(strm0SemanticDigest({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(strm0SemanticDigest({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it("keeps the Spike outside production Main, Preload and Renderer", async () => {
    const production = await readTrees([
      "apps/desktop/src/main",
      "apps/desktop/src/preload",
      "apps/desktop/src/renderer",
    ]);
    expect(production).not.toContain("strm0.route-a.v1");
    expect(production).not.toContain("robothree:strm0:");
  });

  it("does not use forbidden Secret fallback paths in the Electron fixtures", async () => {
    const source = await readTrees([
      "scripts/run-strm0-route-a-electron.mjs",
      "scripts/strm0-route-a-preload.cjs",
    ]);
    for (const forbidden of [
      "toString(\"base64\")",
      "toString(\"hex\")",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "clipboard",
      "fetch(",
      "ipcMain.handle",
      "contextBridge.exposeInMainWorld",
    ]) expect(source).not.toContain(forbidden);
  });
});

async function readTrees(paths) {
  const { readdir, stat } = await import("node:fs/promises");
  const values = [];
  async function read(path) {
    const info = await stat(resolve(path));
    if (info.isFile()) {
      values.push(await readFile(resolve(path), "utf8"));
      return;
    }
    for (const entry of await readdir(resolve(path), { withFileTypes: true })) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) await read(child);
      else if (/\.(?:ts|vue|mjs|cjs)$/u.test(entry.name)) {
        values.push(await readFile(child, "utf8"));
      }
    }
  }
  for (const path of paths) await read(path);
  return values.join("\n");
}
