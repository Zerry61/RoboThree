import { describe, expect, it } from "vitest";

import {
  presentAgentLifecycleError,
  presentRobotSubmissionState,
  presentRobotTestState,
} from "../src/renderer/presentation/agent-lifecycle-presentation.js";

describe("RSL-1 lifecycle presentation", () => {
  it("maps all user lifecycle states to Chinese business language", () => {
    expect(["untested", "running", "passed", "failed", "stale"].map((state) =>
      presentRobotTestState(state as never).label)).toEqual([
      "待测试", "测试中", "测试通过", "测试未通过", "测试结果已过期",
    ]);
    expect(["pending_review", "approved", "rejected", "withdrawn"].map((state) =>
      presentRobotSubmissionState(state as never)?.label)).toEqual([
      "审核中", "已发布", "已驳回", "已撤回",
    ]);
  });

  it("does not expose raw reserved-id or conflict summaries", () => {
    expect(presentAgentLifecycleError("agentlifecycle.robot_id_reserved", "raw"))
      .toContain("系统保留标识");
    expect(presentAgentLifecycleError("agentlifecycle.revision_conflict", "raw"))
      .toContain("重新加载最新内容");
  });
});
