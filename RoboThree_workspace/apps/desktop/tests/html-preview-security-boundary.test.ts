import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const renderer = resolve("apps/desktop/src/renderer/legacy/LegacyWorkbench.ts");
const main = resolve("apps/desktop/src/main/index.ts");
const sandbox = resolve("apps/desktop/src/main/html-preview-sandbox.ts");

describe("APV-1C HTML preview static security boundary", () => {
  it("renders HTML previews only in a sandboxed frame", async () => {
    const source = await readFile(renderer, "utf8");

    expect(source).toContain('h("iframe"');
    expect(source).toContain('sandbox: ""');
    expect(source).toContain('referrerpolicy: "no-referrer"');
    expect(source).toContain("current.result.previewUrl");
    for (const forbidden of [
      "innerHTML",
      "v-html",
      "document.write",
      "eval(",
      "new Function",
      "ipcRenderer",
      "node:fs",
      "fetch(",
      "openPath",
      "shell.open",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("denies popups, downloads and permission prompts in the Desktop window", async () => {
    const source = await readFile(main, "utf8");

    expect(source).toContain("setWindowOpenHandler(() => ({ action: \"deny\" }))");
    expect(source).toContain("setPermissionRequestHandler");
    expect(source).toContain("callback(false)");
    expect(source).toContain("will-download");
    expect(source).toContain("event.preventDefault()");
  });

  it("keeps the local HTML server on 127.0.0.1 with deny-by-default CSP", async () => {
    const source = await readFile(sandbox, "utf8");

    expect(source).toContain('server.listen(0, "127.0.0.1"');
    for (const directive of [
      "default-src 'none'",
      "script-src 'none'",
      "object-src 'none'",
      "connect-src 'none'",
      "img-src 'none'",
      "style-src 'none'",
    ]) {
      expect(source).toContain(directive);
    }
    expect(source).toContain("Content-Security-Policy");
    expect(source).toContain("Cross-Origin-Resource-Policy");
    expect(source).not.toContain("0.0.0.0");
    expect(source).not.toContain("localhost");
  });
});
