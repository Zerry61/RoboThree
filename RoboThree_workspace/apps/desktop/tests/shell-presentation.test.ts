import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  RuntimeStatusProjection,
  WorkspaceGrantProjection,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  presentShellRuntime,
  workspaceOptionLabel,
} from "../src/renderer/presentation/shell-presentation.js";

const presentationSource = resolve(
  "apps/desktop/src/renderer/presentation/shell-presentation.ts",
);

function runtime(
  status: RuntimeStatusProjection["status"],
  pendingRuntimeActivation = false,
): RuntimeStatusProjection {
  return {
    contractVersion: "v1alpha1",
    status,
    runtimeInstanceId: "runtime-1",
    pendingRuntimeActivation,
  };
}

function workspace(
  overrides: Partial<WorkspaceGrantProjection> = {},
): WorkspaceGrantProjection {
  return {
    workspaceGrantId: "workspace-1",
    displayName: "研发目录",
    rootDisplayPath: "/Users/example/project",
    accessMode: "read_write",
    status: "active",
    createdAt: "2026-07-29T02:00:00.000Z",
    ...overrides,
  };
}

describe("Shell presentation", () => {
  it("maps ready Runtime to the existing sidebar and Core pill labels", () => {
    expect(presentShellRuntime(runtime("ready"))).toEqual({
      isReady: true,
      sidebarStatusLabel: "Local Core 已就绪",
      corePillLabel: "就绪",
      enterpriseConfigPillLabel: "本地基线",
    });
  });

  it("maps non-ready Runtime states to the existing connecting labels", () => {
    expect(["starting", "stopping", "failed"].map((status) =>
      presentShellRuntime(runtime(status as RuntimeStatusProjection["status"]))
        .corePillLabel)).toEqual([
      "连接中",
      "连接中",
      "连接中",
    ]);
    expect(presentShellRuntime(undefined)).toMatchObject({
      isReady: false,
      sidebarStatusLabel: "连接 Local Core",
      corePillLabel: "连接中",
    });
  });

  it("maps pending enterprise activation to the existing enterprise config pill label", () => {
    expect(presentShellRuntime(runtime("ready", true)).enterpriseConfigPillLabel)
      .toBe("待激活");
    expect(presentShellRuntime(runtime("ready", false)).enterpriseConfigPillLabel)
      .toBe("本地基线");
    expect(presentShellRuntime(undefined).enterpriseConfigPillLabel)
      .toBe("本地基线");
  });

  it("formats Workspace options without reading credentials or internal state", () => {
    expect(workspaceOptionLabel(workspace())).toBe("研发目录 · /Users/example/project");
  });

  it("keeps presentation source pure and free of runtime internals", async () => {
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
      "runtimeInstanceId",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
