import type { ToolActivityProjection } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  decideWorkbenchArtifactOpen,
  presentWorkspaceTextWriteActivities,
  WORKSPACE_TEXT_WRITE_OPERATION,
} from "../src/renderer/presentation/workspace-text-write-presentation.js";

const timestamp = "2026-08-31T10:00:00.000Z";

describe("WFW-3 product presentation", () => {
  it("recognizes only the exact WFW operation and sorts by update time then activity id", () => {
    const activities = presentWorkspaceTextWriteActivities([
      activity({ activityId: "activity:b", updatedAt: "2026-08-31T10:00:01.000Z" }),
      activity({ activityId: "activity:z", operationType: "write_text" }),
      activity({ activityId: "activity:a", updatedAt: "2026-08-31T10:00:01.000Z" }),
    ]);

    expect(activities.map((item) => item.activityId)).toEqual(["activity:a", "activity:b"]);
  });

  it.each([
    ["preparing", "正在准备文件"],
    ["waiting_confirmation", "等待确认"],
    ["running", "正在写入文件"],
    ["completed", "文件已生成"],
    ["failed", "文件生成失败"],
    ["cancelled", "已取消文件生成"],
    ["timed_out", "文件生成超时"],
    ["uncertain", "写入结果需要确认"],
  ] as const)("maps %s into business language", (status, expected) => {
    const [result] = presentWorkspaceTextWriteActivities([activity({
      status,
      ...(status === "preparing" || status === "waiting_confirmation" || status === "running"
        ? { endedAt: undefined }
        : { endedAt: timestamp }),
    })]);

    expect(result).toMatchObject({ title: expected, target: "成果/index.html" });
  });

  it("uses the safe fallback and never exposes private implementation fields", () => {
    const [result] = presentWorkspaceTextWriteActivities([activity({ targetSummary: undefined })]);

    expect(result?.target).toBe("工作区文件");
    expect(JSON.stringify(result)).not.toMatch(
      /capability|digest|root|grant|proof|request|effect|idempotency|stack/iu,
    );
  });

  it.each([
    ["html", { kind: "html" }],
    ["markdown", { kind: "text", mode: "markdown" }],
    ["text", { kind: "text", mode: "text" }],
    ["document", { kind: "open_location" }],
  ] as const)("chooses the existing preview path for %s", (kind, expected) => {
    expect(decideWorkbenchArtifactOpen({ kind })).toEqual(expected);
  });
});

function activity(
  override: Partial<ToolActivityProjection> = {},
): ToolActivityProjection {
  return {
    activityId: "activity:wfw",
    taskId: "task:one",
    toolName: "文件写入",
    operationType: WORKSPACE_TEXT_WRITE_OPERATION,
    status: "completed",
    targetSummary: "成果/index.html",
    startedAt: timestamp,
    updatedAt: timestamp,
    endedAt: timestamp,
    ...override,
  };
}
