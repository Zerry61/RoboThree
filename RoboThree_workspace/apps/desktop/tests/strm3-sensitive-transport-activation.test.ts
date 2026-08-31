import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PersonalCredentialTransportProductionController } from
  "../src/main/personal-credential-transport-controller.js";
import { PersonalCredentialTransportPreloadReceiver } from
  "../src/preload/personal-credential-transport-receiver.js";
import {
  STRM3_SENSITIVE_TRANSPORT_ACTIVATION,
  STRM3_SENSITIVE_TRANSPORT_ACTIVATION_MATERIAL,
  isExactSensitiveTransportActivationDescriptor,
} from "../src/shared/sensitive-transport-activation.js";

describe("STRM-3 code-owned sensitive transport activation", () => {
  it("binds its revision to the exact content-free material", () => {
    const digest = `sha256:${createHash("sha256")
      .update("robothree.strm3-sensitive-transport-activation.v1\n")
      .update(JSON.stringify(STRM3_SENSITIVE_TRANSPORT_ACTIVATION_MATERIAL))
      .digest("hex")}`;
    expect(STRM3_SENSITIVE_TRANSPORT_ACTIVATION.activationRevision).toBe(digest);
    expect(isExactSensitiveTransportActivationDescriptor(
      STRM3_SENSITIVE_TRANSPORT_ACTIVATION,
    )).toBe(true);
    expect(Object.isFrozen(STRM3_SENSITIVE_TRANSPORT_ACTIVATION)).toBe(true);
  });

  it("rejects unknown, duplicate and drifted activation material", () => {
    for (const value of [
      { ...STRM3_SENSITIVE_TRANSPORT_ACTIVATION, activationState: "disabled" },
      { ...STRM3_SENSITIVE_TRANSPORT_ACTIVATION, unexpected: true },
      { ...STRM3_SENSITIVE_TRANSPORT_ACTIVATION, runtimeFallbackEnabled: true },
      { ...STRM3_SENSITIVE_TRANSPORT_ACTIVATION, activationRevision: `sha256:${"0".repeat(64)}` },
    ]) {
      expect(isExactSensitiveTransportActivationDescriptor(value)).toBe(false);
    }
  });

  it("reports production transport ready only for the exact activation", () => {
    const controller = new PersonalCredentialTransportProductionController({
      foundationEnabled: true,
      productionActivation: STRM3_SENSITIVE_TRANSPORT_ACTIVATION,
      createMessageChannel: () => {
        throw new Error("not_used");
      },
    });
    const receiver = new PersonalCredentialTransportPreloadReceiver({
      foundationEnabled: true,
      productionActivation: STRM3_SENSITIVE_TRANSPORT_ACTIVATION,
      subscribe: () => () => undefined,
    });
    receiver.start();
    expect(controller.snapshot()).toMatchObject({
      foundationEnabled: true,
      productionSensitiveTransportReady: true,
      transportBlockerClosed: true,
      productionFeatureEnabled: false,
      productionBusinessHandlerReady: false,
    });
    expect(receiver.snapshot()).toMatchObject({
      foundationEnabled: true,
      productionSensitiveTransportReady: true,
      transportBlockerClosed: true,
      productionFeatureEnabled: false,
    });
    controller.close();
    receiver.close();
  });

  it("keeps the product surface read-only and Renderer outside activation authority", async () => {
    const [main, preload, shared, renderer] = await Promise.all([
      readFile(resolve("apps/desktop/src/main/index.ts"), "utf8"),
      readFile(resolve("apps/desktop/src/preload/index.ts"), "utf8"),
      readFile(resolve(
        "apps/desktop/src/shared/sensitive-transport-activation.ts",
      ), "utf8"),
      readTree(resolve("apps/desktop/src/renderer")),
    ]);
    expect(main).toContain("STRM3_SENSITIVE_TRANSPORT_ACTIVATION");
    expect(preload).toContain("STRM3_SENSITIVE_TRANSPORT_ACTIVATION");
    expect(shared).not.toMatch(/process\.env|process\.argv|localStorage/gu);
    expect(renderer).not.toContain("sensitive-transport-activation");
    expect(preload).not.toContain("submitMutationSecret:");
    expect(preload).not.toContain("revealPersonalModel:");
  });
});

async function readTree(directory: string): Promise<string> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => entry.isDirectory()
    ? readTree(resolve(directory, entry.name))
    : /\.(?:ts|vue)$/u.test(entry.name)
      ? readFile(resolve(directory, entry.name), "utf8")
      : ""))).join("\n");
}
