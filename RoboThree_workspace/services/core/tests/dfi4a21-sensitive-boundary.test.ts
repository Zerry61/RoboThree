import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const productionFiles = [
  "apps/desktop/src/main/personal-credential-broker-client.ts",
  "apps/desktop/src/main/personal-credential-reveal-delivery.ts",
  "services/core/src/adapters/credential/personal-credential-broker-server.ts",
  "services/core/src/adapters/credential/macos-keychain-personal-credential-store.ts",
  "services/core/src/adapters/credential/personal-credential-helper-protocol.ts",
  "services/core/src/adapters/credential/personal-credential-helper-trust.ts",
  "services/core/src/adapters/credential/personal-model-credential-broker-handler.ts",
  "services/core/src/application/personal-model-credential-coordinator.ts",
  "services/core/src/application/personal-model-credential-reveal-service.ts",
  "services/core/src/application/personal-model-operation-gate.ts",
  "services/core/native/macos/robothree-personal-credential-helper.m",
];

describe("DFI-4A.2.1 sensitive boundary", () => {
  it("keeps private Contract unreachable from root, Preload and Renderer", async () => {
    const [rootIndex, preload, renderer] = await Promise.all([
      readFile(resolve("packages/contracts/src/index.ts"), "utf8"),
      readTree("apps/desktop/src/preload"),
      readTree("apps/desktop/src/renderer"),
    ]);
    const privateSpecifier = "@robothree/contracts/desktop-private/personal-credential-broker-v1";
    expect(rootIndex).not.toContain("desktop-private");
    expect(preload).not.toContain(privateSpecifier);
    expect(renderer).not.toContain(privateSpecifier);
  });

  it("keeps Secret out of string encodings, diagnostics and helper arguments", async () => {
    const source = (await Promise.all(productionFiles.map(async (file) =>
      readFile(resolve(file), "utf8")))).join("\n");
    for (const forbidden of [
      'secret.toString(',
      'secretBase64',
      'secretHex',
      'console.log',
      'console.error',
      'process.env.SECRET',
      'process.env.API_KEY',
      '/usr/bin/security -w',
    ]) expect(source).not.toContain(forbidden);
    const helper = await readFile(
      resolve("services/core/native/macos/robothree-personal-credential-helper.m"),
      "utf8",
    );
    for (const forbidden of [
      "enterpriseId", "userId", "deviceId", "personalModelId",
      "canonicalEndpoint", "providerModelId", "displayName",
    ]) expect(helper).not.toContain(forbidden);
  });

  it("scans four evidence channels for raw/Base64/URL/hex markers and proves negatives fail", () => {
    const canary = randomBytes(32);
    const variants = [
      canary.toString("utf8"),
      canary.toString("base64"),
      encodeURIComponent(canary.toString("base64")),
      canary.toString("hex"),
      "sk-test-shape-never-a-real-key",
    ];
    const channels = [
      "parent_stdout", "diagnostic_stderr", "evidence_json", "test_trace",
    ] as const;
    const safeEvidence = JSON.stringify({
      status: "PASS",
      typedCode: "credential_store_unavailable",
      attemptCount: 1,
      resourceCount: 0,
    });
    for (const channel of channels) {
      expect(scan(safeEvidence, variants), channel).toBe(0);
      for (const variant of variants) {
        expect(scan(`prefix:${variant}:suffix`, variants), `${channel}:${variant.length}`)
          .toBeGreaterThan(0);
      }
    }
    canary.fill(0);
  });
});

function scan(value: string, variants: readonly string[]): number {
  return variants.filter((variant) => variant.length > 0 && value.includes(variant)).length;
}

async function readTree(root: string): Promise<string> {
  const { readdir } = await import("node:fs/promises");
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(resolve(directory), { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(?:ts|vue)$/u.test(entry.name)) files.push(await readFile(path, "utf8"));
    }
  }
  await visit(root);
  return files.join("\n");
}
