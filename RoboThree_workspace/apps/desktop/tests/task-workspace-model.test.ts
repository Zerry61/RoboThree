import { describe, expect, it } from "vitest";

import {
  buildTaskWorkspaceDirectoryView,
  presentWorkspaceError,
} from "../src/renderer/pages/tasks/task-workspace-model.js";
import { DesktopTaskWorkspaceAdapterError } from "../src/renderer/adapters/task-workspace-adapter.js";

const timestamp = "2026-08-21T00:00:00.000Z";

describe("DFE-6A task workspace model", () => {
  it("presents directory, file and symlink entries without exposing authority", () => {
    const view = buildTaskWorkspaceDirectoryView({
      contractVersion: "v1alpha2",
      workspaceGrantId: "workspace:66666666-6666-4666-8666-666666666666",
      breadcrumbDisplayNames: ["Reports"],
      entries: [
        entry("directory", "reports", true),
        entry("file", "report.xlsx", false),
        entry("symlink", "outside-link", false),
      ],
      nextCursor: `wsc1.${"c".repeat(24)}.${"d".repeat(24)}`,
      truncated: true,
      snapshotDigest: `sha256:${"a".repeat(64)}`,
    });

    expect(view.breadcrumbLabel).toBe("Reports");
    expect(view.entries.map((item) => [item.kindLabel, item.navigable])).toEqual([
      ["文件夹", true],
      ["文件", false],
      ["链接", false],
    ]);
    expect(view.entries[2]?.unavailableReason).toBe("链接不可导航");
    expect(JSON.stringify(view)).not.toMatch(
      /workspaceRoot|rootRealPath|WorkspaceGrant authority|Credential/u,
    );
  });

  it("maps typed errors to safe workspace states", () => {
    expect(presentWorkspaceError(error("workspace.permission_denied", "authorization")))
      .toMatchObject({ state: "permission_denied", title: "没有权限查看工作空间文件" });
    expect(presentWorkspaceError(error("contract.feature_unavailable", "compatibility")))
      .toMatchObject({ state: "unavailable", title: "工作空间文件不可用" });
    expect(presentWorkspaceError(error("workspace.internal_failure", "internal")))
      .toMatchObject({ state: "error", title: "工作空间文件加载失败" });
  });
});

function entry(kind: "directory" | "file" | "symlink", displayName: string, navigable: boolean) {
  return {
    entryId: `wse1.${displayName.replace(/[^a-z]/gu, "a").padEnd(24, "a")}.${"b".repeat(24)}`,
    displayName,
    kind,
    navigable,
    ...(kind === "file" ? { sizeBytes: 4096, modifiedAt: timestamp } : {}),
    ...(kind === "symlink" ? { unavailableReason: "workspace_entry.symlink" } : {}),
  };
}

function error(
  code: string,
  category: ConstructorParameters<typeof DesktopTaskWorkspaceAdapterError>[0]["category"],
) {
  return new DesktopTaskWorkspaceAdapterError({
    contractVersion: "v1alpha2",
    code,
    category,
    safeSummary: "安全摘要。",
    retryable: false,
    correlationId: "11111111-1111-4111-8111-111111111111",
  });
}
