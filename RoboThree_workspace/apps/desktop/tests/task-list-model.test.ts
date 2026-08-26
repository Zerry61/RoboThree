import { describe, expect, it } from "vitest";

import {
  buildTaskListView,
  canDeleteTaskItem,
} from "../src/renderer/pages/tasks/task-list-model.js";

const timestamp = "2026-08-16T00:00:00.000Z";

describe("DFE-2B task list model", () => {
  it("builds a user-facing task list from sessions and latest task status", () => {
    const view = buildTaskListView({
      sessions: [
        session("session:one", "Write report", "2026-08-16T01:00:00.000Z"),
        session("session:two", "Review plan", "2026-08-16T02:00:00.000Z"),
      ],
      tasks: [
        task("task:old", "session:one", "completed", 1, "2026-08-16T01:30:00.000Z"),
        task("task:new", "session:one", "running", 2, "2026-08-16T03:00:00.000Z"),
        task("task:two", "session:two", "waiting_confirmation", 1, "2026-08-16T02:30:00.000Z"),
      ],
      pinnedSessionIds: new Set(["session:two"]),
      searchQuery: "",
      statusFilter: "all",
    });

    expect(view.summary).toMatchObject({
      total: 2,
      active: 1,
      attention: 1,
    });
    expect(view.items.map((item) => item.title)).toEqual([
      "Review plan",
      "Write report",
    ]);
    expect(view.items[0]?.statusLabel).toBe("等待确认");
    expect(view.items[1]?.statusLabel).toBe("执行中");
    expect(view.items[1]?.canDelete).toBe(false);
  });

  it("filters by search and status, and exposes delete gates", () => {
    const completed = buildTaskListView({
      sessions: [session("session:one", "Write report")],
      tasks: [task("task:done", "session:one", "completed")],
      pinnedSessionIds: new Set(),
      searchQuery: "report",
      statusFilter: "completed",
    });
    expect(completed.items).toHaveLength(1);
    expect(canDeleteTaskItem(completed.items[0]!)).toBe(true);

    const filtered = buildTaskListView({
      sessions: [session("session:one", "Write report")],
      tasks: [task("task:done", "session:one", "completed")],
      pinnedSessionIds: new Set(),
      searchQuery: "missing",
      statusFilter: "completed",
    });
    expect(filtered.items).toHaveLength(0);
    expect(filtered.emptyReason).toBe("filtered_out");
  });
});

function session(sessionId: string, title: string, updatedAt = timestamp) {
  return {
    sessionId,
    revision: 1,
    title,
    tombstoned: false,
    createdAt: timestamp,
    updatedAt,
  };
}

function task(
  taskId: string,
  sessionId: string,
  displayStatus: "completed" | "running" | "waiting_confirmation",
  revision = 1,
  updatedAt = timestamp,
) {
  return {
    taskId,
    sessionId,
    userMessageId: `message:${taskId}`,
    revision,
    displayStatus,
    createdAt: timestamp,
    updatedAt,
    resolvedAgentId: "agent:normal",
    resolvedModelId: "model:gpt",
  };
}
