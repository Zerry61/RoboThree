import { z } from "zod";

import {
  DesktopQueryMetadataSchema,
  DesktopResourceIdSchema,
} from "./common.js";
import { TaskDisplayStatusSchema } from "./session.js";

export const RuntimeStatusQuerySchema = DesktopQueryMetadataSchema.extend({
  type: z.literal("runtime_status_query"),
}).strict();

export const ListWorkspaceGrantsQuerySchema =
  DesktopQueryMetadataSchema.extend({
    type: z.literal("list_workspace_grants"),
  }).strict();

export const ListSessionsQuerySchema = DesktopQueryMetadataSchema.extend({
  type: z.literal("list_sessions"),
  includeTombstoned: z.boolean().optional(),
}).strict();

export const OpenSessionQuerySchema = DesktopQueryMetadataSchema.extend({
  type: z.literal("open_session"),
  sessionId: DesktopResourceIdSchema,
}).strict();

export const ListAgentsQuerySchema = DesktopQueryMetadataSchema.extend({
  type: z.literal("list_agents"),
}).strict();

export const ListModelsQuerySchema = DesktopQueryMetadataSchema.extend({
  type: z.literal("list_models"),
}).strict();

export const ConversationSnapshotQuerySchema =
  DesktopQueryMetadataSchema.extend({
    type: z.literal("conversation_snapshot"),
    sessionId: DesktopResourceIdSchema,
    beforeSequence: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }).strict();

export const SubmitTurnStatusQuerySchema = DesktopQueryMetadataSchema.extend({
  type: z.literal("submit_turn_status"),
  submitTurnCommandId: z.string().uuid(),
}).strict();

export const ListTasksQuerySchema = DesktopQueryMetadataSchema.extend({
  type: z.literal("list_tasks"),
  sessionId: DesktopResourceIdSchema.optional(),
  displayStatuses: z.array(TaskDisplayStatusSchema).max(16).optional(),
  limit: z.number().int().min(1).max(200).optional(),
}).strict();

export const TaskDetailQuerySchema = DesktopQueryMetadataSchema.extend({
  type: z.literal("task_detail"),
  taskId: DesktopResourceIdSchema,
}).strict();

export const ArtifactPreviewModeSchema = z.enum(["text", "markdown"]);

export const ListArtifactsQuerySchema = DesktopQueryMetadataSchema.extend({
  type: z.literal("list_artifacts"),
  sourceKinds: z.array(
    z.enum(["tool_observation", "workspace_file", "generated_preview"]),
  ).max(3).optional(),
  includeDeleted: z.boolean().optional(),
  limit: z.number().int().min(1).max(1024).optional(),
}).strict();

export const ArtifactPreviewQuerySchema = DesktopQueryMetadataSchema.extend({
  type: z.literal("artifact_preview"),
  artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
  mode: ArtifactPreviewModeSchema,
  maxBytes: z.number().int().min(1).max(64 * 1024),
}).strict();

export const ArtifactHtmlPreviewQuerySchema =
  DesktopQueryMetadataSchema.extend({
    type: z.literal("artifact_html_preview"),
    artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
    maxBytes: z.number().int().min(1).max(64 * 1024),
    ttlMs: z.number().int().min(1_000).max(5 * 60 * 1_000).optional(),
  }).strict();

export const ListPendingUserConfirmationsQuerySchema =
  DesktopQueryMetadataSchema.extend({
    type: z.literal("list_pending_user_confirmations"),
    taskId: DesktopResourceIdSchema.optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }).strict();

export const DesktopEventSubscriptionQuerySchema =
  DesktopQueryMetadataSchema.extend({
    type: z.literal("desktop_event_subscription"),
    durableCursor: z.string().min(1).max(512).optional(),
  }).strict();

export type RuntimeStatusQuery = z.infer<typeof RuntimeStatusQuerySchema>;
export type ListWorkspaceGrantsQuery = z.infer<
  typeof ListWorkspaceGrantsQuerySchema
>;
export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>;
export type OpenSessionQuery = z.infer<typeof OpenSessionQuerySchema>;
export type ListAgentsQuery = z.infer<typeof ListAgentsQuerySchema>;
export type ListModelsQuery = z.infer<typeof ListModelsQuerySchema>;
export type ConversationSnapshotQuery = z.infer<
  typeof ConversationSnapshotQuerySchema
>;
export type SubmitTurnStatusQuery = z.infer<
  typeof SubmitTurnStatusQuerySchema
>;
export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;
export type TaskDetailQuery = z.infer<typeof TaskDetailQuerySchema>;
export type ArtifactPreviewMode = z.infer<typeof ArtifactPreviewModeSchema>;
export type ListArtifactsQuery = z.infer<typeof ListArtifactsQuerySchema>;
export type ArtifactPreviewQuery = z.infer<
  typeof ArtifactPreviewQuerySchema
>;
export type ArtifactHtmlPreviewQuery = z.infer<
  typeof ArtifactHtmlPreviewQuerySchema
>;
export type ListPendingUserConfirmationsQuery = z.infer<
  typeof ListPendingUserConfirmationsQuerySchema
>;
export type DesktopEventSubscriptionQuery = z.infer<
  typeof DesktopEventSubscriptionQuerySchema
>;
