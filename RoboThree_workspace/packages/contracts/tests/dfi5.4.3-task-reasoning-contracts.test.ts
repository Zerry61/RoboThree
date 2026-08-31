import { describe, expect, it } from "vitest";

import {
  GetTaskReasoningModeQueryV1Alpha1Schema,
  TaskReasoningModeProjectionV1Alpha1Schema,
} from "../src/desktop-local/task-reasoning/v1alpha1/index.js";

const id = "00000000-0000-4000-8000-000000000001";
const taskId = `task:${"a".repeat(64)}`;

describe("DFI-5.4.3 Task Reasoning Contract", () => {
  it("strictly parses the exact read query", () => {
    expect(GetTaskReasoningModeQueryV1Alpha1Schema.parse({
      contractVersion: "task-reasoning.v1alpha1",
      queryId: id,
      correlationId: id,
      clientInstanceId: id,
      type: "get_task_reasoning_mode",
      taskId,
    }).taskId).toBe(taskId);
  });

  it("accepts only available and legacy states", () => {
    expect(TaskReasoningModeProjectionV1Alpha1Schema.parse({
      state: "available",
      taskId,
      requestedMode: "max",
      resolvedMode: "model_default",
      resolutionReason: "support_changed_default",
      acceptedAt: "2026-08-28T00:00:00.000Z",
    }).state).toBe("available");
    expect(TaskReasoningModeProjectionV1Alpha1Schema.parse({
      state: "legacy",
      taskId,
      safeSummary: "该任务创建时未记录 Max 推理摘要",
    }).state).toBe("legacy");
    for (const state of ["loading", "error"]) {
      expect(TaskReasoningModeProjectionV1Alpha1Schema.safeParse({
        state,
        taskId,
      }).success).toBe(false);
    }
  });

  it("rejects private and digest fields", () => {
    expect(TaskReasoningModeProjectionV1Alpha1Schema.safeParse({
      state: "available",
      taskId,
      requestedMode: "max",
      resolvedMode: "max",
      resolutionReason: "applied",
      acceptedAt: "2026-08-28T00:00:00.000Z",
      reasoningModeLockDigest: `sha256:${"b".repeat(64)}`,
    }).success).toBe(false);
  });
});
