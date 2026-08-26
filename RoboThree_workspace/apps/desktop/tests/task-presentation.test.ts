import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { TaskDisplayStatus } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  isTerminalTaskStatus,
  presentTaskStatus,
  taskControlVisibility,
  taskStatusGuidance,
  taskStatusIcon,
  taskStatusLabel,
  taskStatusTone,
} from "../src/renderer/presentation/task-presentation.js";

const presentationSource = resolve(
  "apps/desktop/src/renderer/presentation/task-presentation.ts",
);

const allStatuses = [
  "preparing",
  "queued",
  "running",
  "waiting_input",
  "waiting_confirmation",
  "recovering",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "manual_attention",
] as const satisfies readonly TaskDisplayStatus[];

describe("Task presentation", () => {
  it("covers all TaskDisplayStatus values with label, tone, icon, and class", () => {
    expect(allStatuses).toHaveLength(11);
    expect(allStatuses.map((status) => [
      status,
      taskStatusLabel(status),
      taskStatusTone(status),
      taskStatusIcon(status),
      presentTaskStatus(status).statusClass,
    ])).toEqual([
      ["preparing", "准备中", "active", "…", "preparing"],
      ["queued", "排队中", "active", "…", "queued"],
      ["running", "执行中", "active", "↗", "running"],
      ["waiting_input", "等待输入", "attention", "!", "waiting_input"],
      ["waiting_confirmation", "等待确认", "attention", "!", "waiting_confirmation"],
      ["recovering", "正在恢复", "active", "↗", "recovering"],
      ["completed", "成功", "completed", "✓", "completed"],
      ["failed", "失败", "failed", "✕", "failed"],
      ["cancelled", "已取消", "failed", "−", "cancelled"],
      ["timed_out", "已超时", "failed", "✕", "timed_out"],
      ["manual_attention", "需要人工处理", "attention", "!", "manual_attention"],
    ]);
  });

  it("returns guidance only for states that need user-facing direction", () => {
    expect(taskStatusGuidance("waiting_input")).toBe(
      "任务正在等待补充信息。请选择“补充输入”，说明下一步所需内容。",
    );
    expect(taskStatusGuidance("waiting_confirmation")).toBe(
      "请检查下方操作的目标、风险和后果；允许或拒绝只作用于这一次操作。",
    );
    expect(taskStatusGuidance("recovering")).toBe(
      "Local Core 正从持久记录恢复任务，无需重复提交；恢复完成后状态会自动刷新。",
    );
    expect(taskStatusGuidance("manual_attention")).toBe(
      "外部结果无法安全确认。请检查已完成内容，再决定是否重试或人工处理。",
    );
    expect(taskStatusGuidance("running")).toBeUndefined();
    expect(taskStatusGuidance("completed")).toBeUndefined();
  });

  it("marks only completed, failed, cancelled, and timed_out as terminal", () => {
    expect(allStatuses.filter(isTerminalTaskStatus)).toEqual([
      "completed",
      "failed",
      "cancelled",
      "timed_out",
    ]);
  });

  it("keeps task control visibility equivalent to the existing UI behavior", () => {
    expect(taskControlVisibility("running")).toEqual({
      canCancel: true,
      canRetry: false,
      canContinue: false,
      canProvideInput: false,
    });
    expect(taskControlVisibility("waiting_input")).toEqual({
      canCancel: true,
      canRetry: false,
      canContinue: false,
      canProvideInput: true,
    });
    expect(taskControlVisibility("recovering")).toEqual({
      canCancel: true,
      canRetry: false,
      canContinue: true,
      canProvideInput: false,
    });
    expect(taskControlVisibility("failed")).toEqual({
      canCancel: false,
      canRetry: true,
      canContinue: false,
      canProvideInput: false,
    });
    expect(taskControlVisibility("completed")).toEqual({
      canCancel: false,
      canRetry: false,
      canContinue: false,
      canProvideInput: false,
    });
  });

  it("keeps presentation source pure and free of sensitive runtime fields", async () => {
    const source = await readFile(presentationSource, "utf8");
    expect(source).toContain("assertNever(status)");
    expect(source).not.toMatch(/\bh\s*\(/);
    for (const forbidden of [
      "from \"vue\"",
      "document.",
      "window.",
      "robothreeDesktop",
      "prompt",
      "toolParameters",
      "requestDigest",
      "CapabilityLock",
      "Credential",
      "Token",
      "authorizationToken",
      "resultPayload",
      "executionReceipt",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
