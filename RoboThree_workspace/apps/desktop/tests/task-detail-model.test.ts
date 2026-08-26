import { describe, expect, it } from "vitest";

import {
  buildTaskDetailView,
} from "../src/renderer/pages/tasks/task-detail-model.js";

const timestamp = "2026-08-16T00:00:00.000Z";

describe("DFE-3A task detail model", () => {
  it("projects durable messages, streaming text, steps, tools and confirmations", () => {
    const view = buildTaskDetailView({
      detail: taskDetail("waiting_confirmation"),
      snapshot: {
        sessionId: "session:one",
        sessionRevision: 1,
        messages: [{
          messageId: "message:user",
          sessionId: "session:one",
          sequence: 1,
          role: "user",
          status: "completed",
          content: "请生成报表",
          taskId: "task:one",
          createdAt: timestamp,
        }],
        activeTaskSummaries: [],
        latestDurableCursor: "cursor:conversation",
        hasMoreBefore: false,
      },
      streamingAssistant: {
        sessionId: "session:one",
        messageId: "message:assistant",
        runtimeInstanceId: "runtime:one",
        lastDeltaSequence: 1,
        text: "正在处理",
      },
    });

    expect(view.status.label).toBe("等待确认");
    expect(view.messages.map((message) => message.presentation.content)).toEqual([
      "请生成报表",
      "正在处理",
    ]);
    expect(view.confirmations[0]?.canDecide).toBe(true);
    expect(view.tools[0]?.presentation.statusLabel).toBe("等待确认");
    expect(view.artifacts[0]).toMatchObject({
      id: `artifact:${"a".repeat(64)}`,
      canPreviewText: true,
      canOpenLocation: true,
      canExport: true,
    });
    expect(JSON.stringify(view)).not.toContain("workspaceRoot");
  });

  it("maps uncertain tool activity and manual attention task status to user language", () => {
    const view = buildTaskDetailView({
      detail: {
        ...taskDetail("manual_attention"),
        toolActivities: [{
          activityId: "activity:uncertain",
          taskId: "task:one",
          toolName: "document.xlsx.write",
          operationType: "write",
          status: "uncertain",
          statusSummary: "执行结果需要人工检查。",
          startedAt: timestamp,
          updatedAt: timestamp,
          endedAt: timestamp,
        }],
      },
      snapshot: undefined,
      streamingAssistant: undefined,
    });

    expect(view.status.label).toBe("需要人工处理");
    expect(view.tools[0]?.presentation.statusLabel).toBe("需要人工处理");
  });

  it("routes PPTX artifacts to visual HTML preview instead of text preview", () => {
    const view = buildTaskDetailView({
      detail: {
        ...taskDetail("manual_attention"),
        artifacts: [{
          artifactId: `artifact:${"c".repeat(64)}`,
          taskId: "task:one",
          sourceKind: "tool_observation",
          sourceId: "019fa000-0000-7000-8000-000000000222",
          sourceDigest: `sha256:${"d".repeat(64)}`,
          displayName: "deck.pptx",
          kind: "document",
          mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          relativePath: "reports/deck.pptx",
          byteSize: 4096,
          createdAt: timestamp,
          previewState: "available",
          lifecycle: {
            revision: 1,
            pinned: false,
            dismissed: false,
            deleted: false,
            sourceDeleted: false,
          },
          metadata: {
            capabilityId: "tool.document.pptx.write",
            slideCount: 2,
          },
        }],
      },
      snapshot: undefined,
      streamingAssistant: undefined,
    });

    expect(view.artifacts[0]).toMatchObject({
      id: `artifact:${"c".repeat(64)}`,
      canPreviewText: false,
      canPreviewHtml: true,
      canOpenLocation: true,
      canExport: true,
    });
    expect(JSON.stringify(view)).not.toContain("workspaceRoot");
  });
});

function taskDetail(displayStatus: "waiting_confirmation" | "manual_attention") {
  return {
    summary: {
      taskId: "task:one",
      sessionId: "session:one",
      userMessageId: "message:user",
      revision: 1,
      displayStatus,
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAgentId: "agent:normal",
      resolvedModelId: "model:gpt",
    },
    goalSummary: "生成报表",
    runs: [{
      runId: "run:one",
      attempt: 1,
      displayStatus,
      startedAt: timestamp,
      updatedAt: timestamp,
      steps: [{
        stepId: "step:one",
        sequence: 1,
        displayStatus,
        actionType: "tool",
        actionSummary: "写入表格",
        observationSummary: "等待确认。",
        startedAt: timestamp,
        updatedAt: timestamp,
      }],
    }],
    toolActivities: [{
      activityId: "activity:one",
      taskId: "task:one",
      toolName: "document.xlsx.write",
      operationType: "write",
      status: "waiting_confirmation",
      targetSummary: "report.xlsx",
      safetySummary: "单次操作",
      statusSummary: "等待确认",
      startedAt: timestamp,
      updatedAt: timestamp,
    }],
    userConfirmations: [{
      confirmationId: "confirmation:one",
      taskId: "task:one",
      requestDigest: "a".repeat(64),
      status: "pending",
      reasonSummary: "需要确认写入文件。",
      riskSummary: "会创建工作区文件。",
      targetSummary: "report.xlsx",
      consequenceSummary: "只执行这一次写入。",
      requestedAt: timestamp,
    }],
    artifacts: [{
      artifactId: `artifact:${"a".repeat(64)}`,
      taskId: "task:one",
      sourceKind: "tool_observation",
      sourceId: "019fa000-0000-7000-8000-000000000111",
      sourceDigest: `sha256:${"b".repeat(64)}`,
      displayName: "report.md",
      kind: "markdown",
      mediaType: "text/markdown",
      relativePath: "reports/report.md",
      byteSize: 64,
      createdAt: timestamp,
      previewState: "available",
      lifecycle: {
        revision: 1,
        pinned: false,
        dismissed: false,
        deleted: false,
        sourceDeleted: false,
      },
      metadata: {
        capabilityId: "tool.document.docx.read",
      },
    }],
    latestDurableCursor: "cursor:task",
  };
}
