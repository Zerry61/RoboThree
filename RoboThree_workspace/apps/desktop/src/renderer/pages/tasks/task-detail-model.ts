import type {
  ArtifactProjection,
  ConversationSnapshot,
  MessageProjection,
  TaskDetailProjection,
  TaskStepProjection,
  ToolActivityProjection,
  UserConfirmationProjection,
} from "@robothree/contracts";

import {
  presentArtifact,
  type ArtifactPresentation,
} from "../../presentation/artifact-presentation.js";
import {
  presentDurableMessage,
  presentStreamingAssistant,
  type MessagePresentation,
} from "../../presentation/message-presentation.js";
import {
  presentTaskStatus,
  type TaskStatusPresentation,
} from "../../presentation/task-presentation.js";
import {
  presentToolActivity,
  type ToolActivityPresentation,
} from "../../presentation/tool-activity-presentation.js";
import {
  canShowConfirmationDecisionActions,
  presentUserConfirmation,
  type UserConfirmationPresentation,
} from "../../presentation/user-confirmation-presentation.js";

export type StreamingAssistantState = Readonly<{
  sessionId: string;
  messageId: string;
  runtimeInstanceId: string;
  lastDeltaSequence: number;
  text: string;
}>;

export type TaskDetailMessageItem = Readonly<{
  id: string;
  presentation: MessagePresentation;
}>;

export type TaskDetailStepItem = Readonly<{
  id: string;
  sequence: number;
  title: string;
  statusLabel: string;
  observationSummary: string | undefined;
  updatedAt: string;
}>;

export type TaskDetailToolItem = Readonly<{
  id: string;
  source: ToolActivityProjection;
  presentation: ToolActivityPresentation;
}>;

export type TaskDetailConfirmationItem = Readonly<{
  id: string;
  source: UserConfirmationProjection;
  presentation: UserConfirmationPresentation;
  canDecide: boolean;
}>;

export type TaskDetailArtifactItem = Readonly<{
  id: string;
  source: ArtifactProjection;
  presentation: ArtifactPresentation;
  canPreviewText: boolean;
  canPreviewHtml: boolean;
  canOpenLocation: boolean;
  canExport: boolean;
}>;

export type TaskDetailView = Readonly<{
  title: string;
  goalSummary: string;
  status: TaskStatusPresentation;
  messages: readonly TaskDetailMessageItem[];
  steps: readonly TaskDetailStepItem[];
  tools: readonly TaskDetailToolItem[];
  confirmations: readonly TaskDetailConfirmationItem[];
  artifacts: readonly TaskDetailArtifactItem[];
  artifactCount: number;
  updatedAt: string;
  latestDurableCursor: string;
}>;

export function buildTaskDetailView(input: {
  detail: TaskDetailProjection;
  snapshot: ConversationSnapshot | undefined;
  streamingAssistant: StreamingAssistantState | undefined;
  includeSessionMessages?: boolean;
}): TaskDetailView {
  const status = presentTaskStatus(input.detail.summary.displayStatus);
  const genericSteps = input.detail.runs
    .flatMap((run) => run.steps)
    .sort(compareSteps)
    .map(buildStepItem);
  const businessSteps = buildWorkspaceSourceBusinessSteps({
    activities: input.detail.toolActivities,
    artifacts: input.detail.artifacts,
    fallbackUpdatedAt: input.detail.summary.updatedAt,
  });
  const messages = buildMessageItems({
    messages: input.snapshot?.messages ?? [],
    taskId: input.includeSessionMessages ? undefined : input.detail.summary.taskId,
    streamingAssistant: input.streamingAssistant,
  });

  return {
    title: input.detail.goalSummary,
    goalSummary: input.detail.goalSummary,
    status,
    messages,
    steps: businessSteps ?? genericSteps,
    tools: input.detail.toolActivities
      .slice()
      .sort(compareByUpdatedAt)
      .map((activity) => ({
        id: activity.activityId,
        source: activity,
        presentation: presentToolActivity(activity),
      })),
    confirmations: input.detail.userConfirmations
      .slice()
      .sort(compareByRequestedAt)
      .map((confirmation) => ({
        id: confirmation.confirmationId,
        source: confirmation,
        presentation: presentUserConfirmation(confirmation),
        canDecide: canShowConfirmationDecisionActions(confirmation),
      })),
    artifacts: input.detail.artifacts
      .slice()
      .sort(compareArtifacts)
      .map(buildArtifactItem),
    artifactCount: input.detail.artifacts.length,
    updatedAt: input.detail.summary.updatedAt,
    latestDurableCursor: input.detail.latestDurableCursor,
  };
}

function buildWorkspaceSourceBusinessSteps(input: {
  activities: readonly ToolActivityProjection[];
  artifacts: readonly ArtifactProjection[];
  fallbackUpdatedAt: string;
}): readonly TaskDetailStepItem[] | undefined {
  const readActivities = input.activities.filter((activity) =>
    WORKSPACE_SOURCE_READ_CAPABILITIES.has(activity.operationType));
  const writeActivities = input.activities.filter((activity) =>
    activity.operationType === PPTX_WRITE_CAPABILITY);
  if (readActivities.length === 0 && writeActivities.length === 0) return undefined;

  const readStatus = aggregateBusinessStatus(readActivities);
  const writeStatus = aggregateBusinessStatus(writeActivities);
  const effectiveWriteStatus = writeStatus === "completed" && !hasAvailablePptx(input.artifacts)
    ? "preparing"
    : writeStatus;

  return [{
    id: "business-stage:workspace-source-read",
    sequence: 1,
    title: "读取资料",
    statusLabel: businessStatusLabel(readStatus),
    observationSummary: undefined,
    updatedAt: latestUpdatedAt(readActivities, input.fallbackUpdatedAt),
  }, {
    id: "business-stage:pptx-write",
    sequence: 2,
    title: "生成成果",
    statusLabel: businessStatusLabel(effectiveWriteStatus),
    observationSummary: undefined,
    updatedAt: latestUpdatedAt(writeActivities, input.fallbackUpdatedAt),
  }];
}

type BusinessActivityStatus = ToolActivityProjection["status"] | "waiting";

function aggregateBusinessStatus(
  activities: readonly ToolActivityProjection[],
): BusinessActivityStatus {
  if (activities.length === 0) return "waiting";
  for (const status of BUSINESS_STATUS_PRECEDENCE) {
    if (activities.some((activity) => activity.status === status)) return status;
  }
  return "completed";
}

function businessStatusLabel(status: BusinessActivityStatus): string {
  switch (status) {
    case "waiting": return "等待开始";
    case "uncertain": return "需要人工处理";
    case "failed": return "失败";
    case "timed_out": return "超时";
    case "cancelled": return "已取消";
    case "waiting_confirmation": return "等待确认";
    case "running": return "执行中";
    case "preparing": return "准备中";
    case "completed": return "成功";
    default: return assertNever(status);
  }
}

function hasAvailablePptx(artifacts: readonly ArtifactProjection[]): boolean {
  return artifacts.some((artifact) =>
    !artifact.lifecycle.deleted
    && !artifact.lifecycle.sourceDeleted
    && artifact.previewState === "available"
    && (artifact.mediaType === PPTX_MEDIA_TYPE
      || artifact.displayName.toLowerCase().endsWith(".pptx")));
}

function latestUpdatedAt(
  activities: readonly ToolActivityProjection[],
  fallback: string,
): string {
  return activities.reduce(
    (latest, activity) => Date.parse(activity.updatedAt) > Date.parse(latest)
      ? activity.updatedAt
      : latest,
    fallback,
  );
}

function buildMessageItems(input: {
  messages: readonly MessageProjection[];
  taskId: string | undefined;
  streamingAssistant: StreamingAssistantState | undefined;
}): readonly TaskDetailMessageItem[] {
  const items = input.messages
    .filter((message) =>
      input.taskId === undefined
      || message.taskId === undefined
      || message.taskId === input.taskId)
    .sort((left, right) => left.sequence - right.sequence)
    .map((message) => ({
      id: message.messageId,
      presentation: presentDurableMessage(message),
    }));

  if (input.streamingAssistant !== undefined) {
    items.push({
      id: input.streamingAssistant.messageId,
      presentation: presentStreamingAssistant(input.streamingAssistant),
    });
  }

  return items;
}

function buildStepItem(step: TaskStepProjection): TaskDetailStepItem {
  return {
    id: step.stepId,
    sequence: step.sequence,
    title: step.actionSummary || step.actionType,
    statusLabel: presentTaskStatus(step.displayStatus).label,
    observationSummary: step.observationSummary,
    updatedAt: step.updatedAt,
  };
}

function buildArtifactItem(artifact: ArtifactProjection): TaskDetailArtifactItem {
  const lifecycle = artifact.lifecycle;
  const active = !lifecycle.deleted && !lifecycle.sourceDeleted;
  const available = active && artifact.previewState === "available";
  const pptx = artifact.mediaType === PPTX_MEDIA_TYPE
    || artifact.displayName.toLowerCase().endsWith(".pptx");
  return {
    id: artifact.artifactId,
    source: artifact,
    presentation: presentArtifact(artifact),
    canPreviewText: available && !pptx && artifact.kind !== "html" && artifact.kind !== "image",
    canPreviewHtml: available && (artifact.kind === "html" || pptx),
    canOpenLocation: active && artifact.relativePath !== undefined,
    canExport: active && artifact.relativePath !== undefined,
  };
}

const PPTX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const PPTX_WRITE_CAPABILITY = "tool.document.pptx.write";
const WORKSPACE_SOURCE_READ_CAPABILITIES = new Set([
  "tool.document.docx.read",
  "tool.document.xlsx.read",
  "tool.document.pdf.extract_text",
]);
const BUSINESS_STATUS_PRECEDENCE: readonly ToolActivityProjection["status"][] = [
  "uncertain",
  "failed",
  "timed_out",
  "cancelled",
  "waiting_confirmation",
  "running",
  "preparing",
];

function compareSteps(left: TaskStepProjection, right: TaskStepProjection): number {
  return left.sequence - right.sequence
    || Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
}

function compareByUpdatedAt(
  left: Pick<ToolActivityProjection, "updatedAt">,
  right: Pick<ToolActivityProjection, "updatedAt">,
): number {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function compareByRequestedAt(
  left: Pick<UserConfirmationProjection, "requestedAt">,
  right: Pick<UserConfirmationProjection, "requestedAt">,
): number {
  return Date.parse(left.requestedAt) - Date.parse(right.requestedAt);
}

function compareArtifacts(left: ArtifactProjection, right: ArtifactProjection): number {
  const leftLifecycle = left.lifecycle;
  const rightLifecycle = right.lifecycle;
  return Number(rightLifecycle.pinned) - Number(leftLifecycle.pinned)
    || Number(leftLifecycle.dismissed) - Number(rightLifecycle.dismissed)
    || Number(leftLifecycle.deleted) - Number(rightLifecycle.deleted)
    || Date.parse(right.createdAt) - Date.parse(left.createdAt)
    || left.displayName.localeCompare(right.displayName);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled business activity status: ${String(value)}`);
}
