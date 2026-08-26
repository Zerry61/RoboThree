import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  presentToolActivity,
  toolActivityStatusIcon,
  toolActivityStatusLabel,
  toolActivityTone,
  type ToolActivityPresentationInput,
  type ToolActivityPresentationStatus,
} from "../src/renderer/presentation/tool-activity-presentation.js";

const presentationSource = resolve(
  "apps/desktop/src/renderer/presentation/tool-activity-presentation.ts",
);

const allStatuses = [
  "preparing",
  "waiting_confirmation",
  "running",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "uncertain",
  "manual_attention",
] as const satisfies readonly ToolActivityPresentationStatus[];

function activity(
  status: ToolActivityPresentationStatus,
  overrides: Partial<ToolActivityPresentationInput> = {},
): ToolActivityPresentationInput {
  return {
    activityId: "activity-1",
    taskId: "task-1",
    toolName: "file.read",
    operationType: "read",
    status,
    startedAt: "2026-07-29T01:00:00.000Z",
    updatedAt: "2026-07-29T01:01:00.000Z",
    ...overrides,
  };
}

describe("Tool Activity presentation", () => {
  it("covers every renderer-visible status with label, tone, and icon", () => {
    expect(allStatuses.map((status) => [
      status,
      toolActivityStatusLabel(status),
      toolActivityTone(status),
      toolActivityStatusIcon(status),
    ])).toEqual([
      ["preparing", "准备中", "completed", "…"],
      ["waiting_confirmation", "等待确认", "waiting_confirmation", "!"],
      ["running", "执行中", "running", "↗"],
      ["completed", "成功", "completed", "✓"],
      ["failed", "失败", "failed", "✕"],
      ["cancelled", "已取消", "completed", "−"],
      ["timed_out", "超时", "failed", "✕"],
      ["uncertain", "需要人工处理", "manual_attention", "!"],
      ["manual_attention", "需要人工处理", "manual_attention", "!"],
    ]);
  });

  it("uses the status label as the safe summary fallback", () => {
    expect(presentToolActivity(activity("running")).summary).toBe("执行中");
    expect(presentToolActivity(activity("timed_out")).summary).toBe("超时");
    expect(presentToolActivity(activity("uncertain")).summary).toBe("需要人工处理");
  });

  it("prefers an existing safe status summary without inventing result text", () => {
    expect(presentToolActivity(activity("completed", {
      statusSummary: "读取完成。",
    })).summary).toBe("读取完成。");
  });

  it("omits missing target and safety summaries", () => {
    expect(presentToolActivity(activity("running")).meta).toEqual([]);
  });

  it("returns only provided target and safety meta as readonly data", () => {
    expect(presentToolActivity(activity("running", {
      targetSummary: "工作区报告。",
      safetySummary: "未暴露原始参数。",
    })).meta).toEqual([
      { label: "目标", value: "工作区报告。" },
      { label: "安全", value: "未暴露原始参数。" },
    ]);
  });

  it("keeps presentation source free of UI/runtime APIs and internal payload fields", async () => {
    const source = await readFile(presentationSource, "utf8");
    expect(source).not.toMatch(/\bh\s*\(/);
    for (const forbidden of [
      "from \"vue\"",
      "document.",
      "window.",
      "robothreeDesktop",
      "resultPayload",
      "executionReceipt",
      "workspaceCredential",
      "CapabilityLock",
      "checkpoint",
      "effect",
      "rootToken",
      "accessKey",
      "secret",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
