import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  formatDisplayTime,
  shortDisplayId,
} from "../src/renderer/presentation/display-formatting.js";

const presentationSource = resolve(
  "apps/desktop/src/renderer/presentation/display-formatting.ts",
);

describe("Display formatting", () => {
  it("keeps the existing local zh-CN time format", () => {
    expect(formatDisplayTime("2026-07-29T02:50:33.000Z")).toBe("7/29 10:50");
  });

  it("keeps task id shortening to the last eight characters", () => {
    expect(shortDisplayId("task-0123456789abcdef")).toBe("89abcdef");
    expect(shortDisplayId("short")).toBe("short");
  });

  it("keeps formatting source pure and UI/runtime independent", async () => {
    const source = await readFile(presentationSource, "utf8");
    expect(source).not.toMatch(/\bh\s*\(/);
    for (const forbidden of [
      "from \"vue\"",
      "document.",
      "window.",
      "robothreeDesktop",
      "ipcRenderer",
      "contextBridge",
      "Token",
      "Credential",
      "CapabilityLock",
      "authorizationToken",
      "workspaceCredential",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
