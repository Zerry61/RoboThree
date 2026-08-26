import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("STRM-2.3 private production boundary closure", () => {
  it("maps Broker rejection to its exact private transport code", async () => {
    const controller = await readFile(resolve(
      "apps/desktop/src/main/personal-credential-transport-controller.ts",
    ), "utf8");
    expect(controller).toContain('case "rejected": return {');
    expect(controller).toContain('code: "personal_credential_transport_rejected"');
  });

  it("marks legacy WebCrypto paths deprecated and keeps production on authorized paths", async () => {
    const [adapter, receiver, preloadEntry, mainEntry] = await Promise.all([
      readFile(resolve(
        "apps/desktop/src/preload/personal-credential-transport.ts",
      ), "utf8"),
      readFile(resolve(
        "apps/desktop/src/preload/personal-credential-transport-receiver.ts",
      ), "utf8"),
      readFile(resolve("apps/desktop/src/preload/index.ts"), "utf8"),
      readFile(resolve("apps/desktop/src/main/index.ts"), "utf8"),
    ]);
    expect(adapter.match(/@deprecated/gu)).toHaveLength(2);
    expect(adapter).toContain("globalThis.crypto.subtle.digest");
    expect(receiver).toContain("sendAuthorizedMutation");
    expect(receiver).toContain("consumeAuthorizedReveal");
    expect(receiver).not.toMatch(/\.sendMutation\(/u);
    expect(receiver).not.toMatch(/\.consumeReveal\(/u);
    expect(preloadEntry).not.toContain("sendMutation(");
    expect(preloadEntry).not.toContain("consumeReveal(");
    expect(mainEntry).toContain("foundationEnabled: false");
    expect(preloadEntry).toContain("foundationEnabled: false");
  });

  it("keeps public Renderer and Desktop Local Contracts outside the private transport", async () => {
    const [rendererBoundary, desktopLocal] = await Promise.all([
      readFile(resolve("scripts/check-boundaries.mjs"), "utf8"),
      readFile(resolve(
        "packages/contracts/src/desktop-local/v1alpha2/index.ts",
      ), "utf8"),
    ]);
    expect(rendererBoundary).toContain("desktop-private");
    expect(desktopLocal).not.toContain("personal_credential_transport_rejected");
    expect(desktopLocal).not.toContain("PersonalCredentialTransport");
  });

  it("does not require SharedArrayBuffer to exist in sandboxed Preload", async () => {
    const [contract, preload] = await Promise.all([
      readFile(resolve(
        "packages/contracts/src/desktop-private/personal-credential-transport-v1/envelope.ts",
      ), "utf8"),
      readFile(resolve(
        "apps/desktop/src/preload/personal-credential-transport.ts",
      ), "utf8"),
    ]);
    expect(contract).toContain('typeof SharedArrayBuffer !== "undefined"');
    expect(preload).toContain('typeof SharedArrayBuffer !== "undefined"');
  });
});
