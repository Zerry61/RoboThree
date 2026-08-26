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
}): TaskDetailView {
  const status = presentTaskStatus(input.detail.summary.displayStatus);
  const messages = buildMessageItems({
    messages: input.snapshot?.messages ?? [],
    taskId: input.detail.summary.taskId,
    streamingAssistant: input.streamingAssistant,
  });

  return {
    title: input.detail.goalSummary,
    goalSummary: input.detail.goalSummary,
    status,
    messages,
    steps: input.detail.runs
      .flatMap((run) => run.steps)
      .sort(compareSteps)
      .map(buildStepItem),
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

function buildMessageItems(input: {
  messages: readonly MessageProjection[];
  taskId: string;
  streamingAssistant: StreamingAssistantState | undefined;
}): readonly TaskDetailMessageItem[] {
  const items = input.messages
    .filter((message) =>
      message.taskId === undefined || message.taskId === input.taskId)
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
