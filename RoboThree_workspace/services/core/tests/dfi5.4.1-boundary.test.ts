import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DFI541_MAX_CORE_DEFAULT_ENABLED,
  DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT,
} from "../src/index.js";

const root = resolve(import.meta.dirname, "../../..");

describe("DFI-5.4.1 boundaries", () => {
  it("keeps activation and production subject installation disabled", () => {
    expect(DFI541_MAX_CORE_DEFAULT_ENABLED).toBe(false);
    expect(DFI541_PRODUCTION_INSTALLED_SUBJECT_RELEASE_COUNT).toBe(0);
  });

  it("keeps the later-authorized Renderer consumer isolated from still-gated downstream apps", async () => {
    const source = await readTrees([
      "apps/admin-console/src",
      "services/central-service/src/main",
      "services/document-worker/src",
    ]);
    expect(source).not.toMatch(
      /DFI541|desktop-local\/v1alpha5|submit-turn-coordination\/v1alpha5/u,
    );
  });

  it("does not allow environment, CLI, Main, or Renderer control of the gate", async () => {
    const cutover = await readFile(join(root,
      "services/core/src/application/dfi541-max-core-cutover.ts"), "utf8");
    expect(cutover).not.toMatch(/process\.env|process\.argv|ipc|renderer|preload/iu);
    expect(cutover).toMatch(/DFI541_MAX_CORE_DEFAULT_ENABLED\s*=\s*false/u);
  });

  it("freezes the historical Contract sources byte-for-byte", async () => {
    const expected = new Map([
      ["packages/contracts/src/reasoning-mode/lock.ts",
        "0bd45e4451e024d1265c2d5078b59d10c12ae9b930301b606eb6b41207d892ca"],
      ["packages/contracts/src/runtime-selection/v1alpha3/index.ts",
        "4238164b88d14e54b68b88b703187d65108b545eed665a9805911323043b8571"],
      ["packages/contracts/src/submit-turn-coordination/v1alpha4/index.ts",
        "222737715e5007a9005e21eb89ffed403ab9dff57557a27ebac953a4a53d78c2"],
      ["packages/contracts/src/desktop-local/v1alpha4/control.ts",
        "43410ed72253b66c16fc9a7203539fc3a705aa7ae2d1700d441a55ebdb1129f4"],
      ["packages/contracts/src/desktop-local/v1alpha4/submit-turn.ts",
        "04afa58420b65b3720edd5b63b7671e0bc87d65ad74dfd2f2a7bfebaf30441ec"],
    ]);
    for (const [path, digest] of expected) {
      expect(createHash("sha256").update(await readFile(join(root, path)))
        .digest("hex"), path).toBe(digest);
    }
  });

  it("keeps the DFI-5.3, R2D-P.3, and PRA-3 closure evidence immutable", async () => {
    const expected = new Map([
      ["dfi534", "sha256:bf89b2fda81f2b11cac63ca0ad58f1962bd309b587b48b0e1e19ba2c493c3a08"],
      ["r2dp3", "sha256:7d85a493e311d94c0512e398f67062ad77f1f37c7e6752b059529ad4942678bb"],
      ["pra3", "sha256:ef0fb7a58439ccc60710b9211782010d7b61481e5e3196058cf3c0f44ca21e2b"],
    ]);
    for (const [name, digest] of expected) {
      const evidence = JSON.parse(await readFile(
        join(root, `artifacts/${name}/evidence.json`), "utf8",
      )) as { evidenceDigest?: string };
      expect(evidence.evidenceDigest, name).toBe(digest);
    }
  });
});

async function readTrees(paths: readonly string[]): Promise<string> {
  const values: string[] = [];
  for (const path of paths) await readTree(join(root, path), values);
  return values.join("\n");
}

async function readTree(path: string, values: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) await readTree(target, values);
    else if (/\.(?:ts|tsx|js|mjs|java)$/u.test(entry.name)) {
      values.push(await readFile(target, "utf8"));
    }
  }
}
