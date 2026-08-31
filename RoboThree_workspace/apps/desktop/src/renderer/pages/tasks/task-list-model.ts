import type {
  SessionSummary,
  TaskDisplayStatus,
  TaskSummaryProjection,
} from "@robothree/contracts";

import {
  isTerminalTaskStatus,
  presentTaskStatus,
} from "../../presentation/task-presentation.js";

export type TaskListStatusFilter =
  | "all"
  | "active"
  | "attention"
  | "completed"
  | "failed";

export type TaskListItem = {
  id: string;
  session: SessionSummary;
  task: TaskSummaryProjection | undefined;
  title: string;
  statusLabel: string;
  statusTone: "neutral" | "success" | "warning" | "danger" | "primary";
  updatedAt: string;
  sortTimestamp: number;
  pinned: boolean;
  canOpen: boolean;
  canRename: boolean;
  canDelete: boolean;
  canCancel: boolean;
  deleteBlockReason: string;
};

export type TaskListSummary = {
  total: number;
  active: number;
  attention: number;
  completed: number;
  failed: number;
};

export type TaskListView = {
  items: readonly TaskListItem[];
  summary: TaskListSummary;
  emptyReason: "no_tasks" | "filtered_out";
};

export function buildTaskListView(input: {
  sessions: readonly SessionSummary[];
  tasks: readonly TaskSummaryProjection[];
  pinnedTaskIds: ReadonlySet<string>;
  searchQuery: string;
  statusFilter: TaskListStatusFilter;
}): TaskListView {
  const tasksBySession = new Map<string, TaskSummaryProjection[]>();
  for (const task of input.tasks) {
    const tasks = tasksBySession.get(task.sessionId) ?? [];
    tasks.push(task);
    tasksBySession.set(task.sessionId, tasks);
  }

  const allItems = input.sessions
    .filter((session) => !session.tombstoned)
    .flatMap((session) => {
      const tasks = tasksBySession.get(session.sessionId) ?? [];
      const sessionCanDelete = tasks.every((task) =>
        isTerminalTaskStatus(task.displayStatus));
      if (tasks.length === 0) {
        return [buildTaskListItem({
          session,
          task: undefined,
          pinned: false,
          sessionCanDelete,
        })];
      }
      return tasks.map((task) => buildTaskListItem({
        session,
        task,
        pinned: input.pinnedTaskIds.has(task.taskId),
        sessionCanDelete,
      }));
    });

  const summary = summarizeTaskList(allItems);
  const query = normalizeSearch(input.searchQuery);
  const items = allItems
    .filter((item) => matchesStatusFilter(item, input.statusFilter))
    .filter((item) => query === "" || searchableText(item).includes(query))
    .sort(compareTaskListItems);

  return {
    items,
    summary,
    emptyReason: allItems.length === 0 ? "no_tasks" : "filtered_out",
  };
}

export function buildTaskListItem(input: {
  session: SessionSummary;
  task: TaskSummaryProjection | undefined;
  pinned: boolean;
  sessionCanDelete?: boolean;
}): TaskListItem {
  const status = input.task?.displayStatus;
  const presentation = status === undefined ? undefined : presentTaskStatus(status);
  const canDelete = input.sessionCanDelete
    ?? (input.task === undefined || isTerminalTaskStatus(input.task.displayStatus));
  return {
    id: input.task?.taskId ?? input.session.sessionId,
    session: input.session,
    task: input.task,
    title: input.session.title,
    statusLabel: presentation?.label ?? "未开始",
    statusTone: taskListTone(status),
    updatedAt: input.task?.updatedAt ?? input.session.updatedAt,
    sortTimestamp: Date.parse(input.task?.updatedAt ?? input.session.updatedAt),
    pinned: input.pinned,
    canOpen: true,
    canRename: true,
    canDelete,
    canCancel: input.task === undefined ? false : presentation?.controls.canCancel ?? false,
    deleteBlockReason: canDelete ? "" : "仍有未结束任务，需先取消或等待结束。",
  };
}

export function canDeleteTaskItem(item: Pick<TaskListItem, "canDelete">): boolean {
  return item.canDelete;
}

export const taskStatusFilterOptions: ReadonlyArray<{
  label: string;
  value: TaskListStatusFilter;
}> = Object.freeze([
  { label: "全部", value: "all" },
  { label: "进行中", value: "active" },
  { label: "需处理", value: "attention" },
  { label: "已完成", value: "completed" },
  { label: "异常", value: "failed" },
]);

function summarizeTaskList(items: readonly TaskListItem[]): TaskListSummary {
  return {
    total: items.length,
    active: items.filter((item) => item.task !== undefined
      && statusGroup(item.task.displayStatus) === "active").length,
    attention: items.filter((item) => item.task !== undefined
      && statusGroup(item.task.displayStatus) === "attention").length,
    completed: items.filter((item) => item.task !== undefined
      && statusGroup(item.task.displayStatus) === "completed").length,
    failed: items.filter((item) => item.task !== undefined
      && statusGroup(item.task.displayStatus) === "failed").length,
  };
}

function matchesStatusFilter(
  item: TaskListItem,
  filter: TaskListStatusFilter,
): boolean {
  if (filter === "all") return true;
  if (item.task === undefined) return filter === "active";
  return statusGroup(item.task.displayStatus) === filter;
}

function statusGroup(status: TaskDisplayStatus): Exclude<TaskListStatusFilter, "all"> {
  switch (status) {
    case "preparing":
    case "queued":
    case "running":
    case "recovering":
      return "active";
    case "waiting_input":
    case "waiting_confirmation":
    case "manual_attention":
      return "attention";
    case "completed":
      return "completed";
    case "failed":
    case "cancelled":
    case "timed_out":
      return "failed";
    default:
      return assertNever(status);
  }
}

function taskListTone(
  status: TaskDisplayStatus | undefined,
): TaskListItem["statusTone"] {
  if (status === undefined) return "neutral";
  switch (statusGroup(status)) {
    case "active":
      return "primary";
    case "attention":
      return "warning";
    case "completed":
      return "success";
    case "failed":
      return "danger";
  }
}

function compareTaskListItems(a: TaskListItem, b: TaskListItem): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.sortTimestamp - a.sortTimestamp;
}

function searchableText(item: TaskListItem): string {
  return normalizeSearch([
    item.title,
    item.statusLabel,
    item.task?.failureSummary ?? "",
    item.task?.taskId ?? "",
  ].join(" "));
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function assertNever(value: never): never {
  throw new Error(`Unhandled task status: ${String(value)}`);
}
