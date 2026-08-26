import { describe, expect, it } from "vitest";

import { createSecureWindowOptions } from "../src/main/window-security.js";

describe("createSecureWindowOptions", () => {
  it("keeps Renderer isolated from Node and insecure content", () => {
    const options = createSecureWindowOptions("/trusted/preload.js");

    expect(options.webPreferences).toMatchObject({
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: "/trusted/preload.js",
      sandbox: true,
      webSecurity: true,
    });
  });
});
