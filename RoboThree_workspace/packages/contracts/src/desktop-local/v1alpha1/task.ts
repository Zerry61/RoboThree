import { z } from "zod";

import {
  DesktopCommandMetadataSchema,
  DesktopDisplayTextSchema,
  DesktopResourceIdSchema,
  DesktopSafeSummarySchema,
  Sha256DigestSchema,
  TimestampSchema,
} from "./common.js";
import { JsonObjectSchema } from "../../runtime/json.js";
import {
  TaskDisplayStatusSchema,
  TaskSummaryProjectionSchema,
} from "./session.js";

export const TaskControlCommandTypeSchema = z.enum([
  "cancel_task",
  "retry_task",
  "continue_task",
  "provide_task_input",
  "decide_user_confirmation",
]);

const TaskRevisionCommandSchema = DesktopCommandMetadataSchema.extend({
  taskId: DesktopResourceIdSchema,
  expectedTaskRevision: z.number().int().nonnegative(),
}).strict();

export const CancelTaskCommandSchema = TaskRevisionCommandSchema.extend({
  type: z.literal("cancel_task"),
  reasonSummary: DesktopSafeSummarySchema.optional(),
}).strict();

export const RetryTaskCommandSchema = TaskRevisionCommandSchema.extend({
  type: z.literal("retry_task"),
}).strict();

export const ContinueTaskCommandSchema = TaskRevisionCommandSchema.extend({
  type: z.literal("continue_task"),
}).strict();

export const ProvideTaskInputCommandSchema = TaskRevisionCommandSchema.extend({
  type: z.literal("provide_task_input"),
  input: z.string().min(1).max(128 * 1024),
}).strict();

export const DecideUserConfirmationCommandSchema =
  TaskRevisionCommandSchema.extend({
    type: z.literal("decide_user_confirmation"),
    confirmationId: DesktopResourceIdSchema,
    requestDigest: Sha256DigestSchema,
    decision: z.enum(["confirmed", "rejected"]),
  }).strict();

export const TaskControlCommandSchema = z.discriminatedUnion("type", [
  CancelTaskCommandSchema,
  RetryTaskCommandSchema,
  ContinueTaskCommandSchema,
  ProvideTaskInputCommandSchema,
  DecideUserConfirmationCommandSchema,
]);

export const TaskControlReceiptSchema = z.object({
  commandId: z.string().uuid(),
  taskId: DesktopResourceIdSchema,
  commandType: TaskControlCommandTypeSchema,
  status: z.enum(["accepted", "replayed", "rejected"]),
  taskRevision: z.number().int().nonnegative(),
  acceptedAt: TimestampSchema,
}).strict();

export const ToolActivityStatusSchema = z.enum([
  "preparing",
  "waiting_confirmation",
  "running",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "uncertain",
]);

export const ToolActivityProjectionSchema = z.object({
  activityId: DesktopResourceIdSchema,
  taskId: DesktopResourceIdSchema,
  toolName: DesktopDisplayTextSchema,
  operationType: DesktopDisplayTextSchema,
  status: ToolActivityStatusSchema,
  targetSummary: DesktopSafeSummarySchema.optional(),
  safetySummary: DesktopSafeSummarySchema.optional(),
  statusSummary: DesktopSafeSummarySchema.optional(),
  startedAt: TimestampSchema,
  updatedAt: TimestampSchema,
  endedAt: TimestampSchema.optional(),
}).strict().superRefine((activity, context) => {
  const terminal = [
    "completed",
    "failed",
    "cancelled",
    "timed_out",
    "uncertain",
  ].includes(activity.status);
  if (terminal !== (activity.endedAt !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "terminal Tool Activity must have endedAt",
      path: ["endedAt"],
    });
  }
});

export const UserConfirmationProjectionStatusSchema = z.enum([
  "pending",
  "confirmed",
  "rejected",
  "expired",
]);

export const UserConfirmationProjectionSchema = z.object({
  confirmationId: DesktopResourceIdSchema,
  taskId: DesktopResourceIdSchema,
  requestDigest: Sha256DigestSchema,
  status: UserConfirmationProjectionStatusSchema,
  reasonSummary: DesktopSafeSummarySchema,
  riskSummary: DesktopSafeSummarySchema,
  targetSummary: DesktopSafeSummarySchema,
  consequenceSummary: DesktopSafeSummarySchema,
  requestedAt: TimestampSchema,
  expiresAt: TimestampSchema.optional(),
  decidedAt: TimestampSchema.optional(),
}).strict().superRefine((confirmation, context) => {
  if (
    confirmation.status === "pending"
    && confirmation.decidedAt !== undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "pending confirmation cannot have decidedAt",
      path: ["decidedAt"],
    });
  }
  if (
    (confirmation.status === "confirmed"
      || confirmation.status === "rejected")
    && confirmation.decidedAt === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "decided confirmation requires decidedAt",
      path: ["decidedAt"],
    });
  }
});

export const TaskStepProjectionSchema = z.object({
  stepId: DesktopResourceIdSchema,
  sequence: z.number().int().positive(),
  displayStatus: TaskDisplayStatusSchema,
  actionType: DesktopDisplayTextSchema,
  actionSummary: DesktopSafeSummarySchema,
  observationSummary: DesktopSafeSummarySchema.optional(),
  startedAt: TimestampSchema,
  updatedAt: TimestampSchema,
  endedAt: TimestampSchema.optional(),
}).strict();

export const TaskRunProjectionSchema = z.object({
  runId: DesktopResourceIdSchema,
  attempt: z.number().int().positive(),
  displayStatus: TaskDisplayStatusSchema,
  steps: z.array(TaskStepProjectionSchema).max(1024),
  startedAt: TimestampSchema,
  updatedAt: TimestampSchema,
  endedAt: TimestampSchema.optional(),
}).strict();

export const ArtifactProjectionKindSchema = z.enum([
  "document",
  "spreadsheet",
  "markdown",
  "html",
  "text",
  "image",
  "unknown",
]);

export const ArtifactProjectionStateSchema = z.enum([
  "available",
  "unsupported",
  "too_large",
  "blocked",
  "missing",
]);

export const ArtifactLifecycleProjectionSchema = z.object({
  revision: z.number().int().nonnegative().default(0),
  pinned: z.boolean(),
  dismissed: z.boolean(),
  deleted: z.boolean().default(false),
  updatedAt: TimestampSchema.optional(),
  pinnedAt: TimestampSchema.optional(),
  dismissedAt: TimestampSchema.optional(),
  deletedAt: TimestampSchema.optional(),
  restoredAt: TimestampSchema.optional(),
  sourceDeleted: z.boolean().default(false),
  sourceDeletedAt: TimestampSchema.optional(),
  sourceDeletionMode: z.literal("os_trash").optional(),
  deletionReasonSummary: DesktopSafeSummarySchema.max(512).optional(),
}).strict().superRefine((lifecycle, context) => {
  if (!lifecycle.pinned && lifecycle.pinnedAt !== undefined) {
    context.addIssue({
      code: "custom",
      message: "unpinned artifact cannot have pinnedAt",
      path: ["pinnedAt"],
    });
  }
  if (!lifecycle.dismissed && lifecycle.dismissedAt !== undefined) {
    context.addIssue({
      code: "custom",
      message: "active artifact cannot have dismissedAt",
      path: ["dismissedAt"],
    });
  }
  if (!lifecycle.deleted && lifecycle.deletedAt !== undefined) {
    context.addIssue({
      code: "custom",
      message: "active artifact cannot have deletedAt",
      path: ["deletedAt"],
    });
  }
  if (!lifecycle.deleted && lifecycle.deletionReasonSummary !== undefined) {
    context.addIssue({
      code: "custom",
      message: "active artifact cannot have deletionReasonSummary",
      path: ["deletionReasonSummary"],
    });
  }
  if (lifecycle.deleted && lifecycle.restoredAt !== undefined) {
    context.addIssue({
      code: "custom",
      message: "deleted artifact cannot have restoredAt",
      path: ["restoredAt"],
    });
  }
  if (!lifecycle.sourceDeleted && lifecycle.sourceDeletedAt !== undefined) {
    context.addIssue({
      code: "custom",
      message: "active artifact source cannot have sourceDeletedAt",
      path: ["sourceDeletedAt"],
    });
  }
  if (!lifecycle.sourceDeleted && lifecycle.sourceDeletionMode !== undefined) {
    context.addIssue({
      code: "custom",
      message: "active artifact source cannot have sourceDeletionMode",
      path: ["sourceDeletionMode"],
    });
  }
  if (lifecycle.sourceDeleted && !lifecycle.deleted) {
    context.addIssue({
      code: "custom",
      message: "source-deleted artifact must be marked deleted",
      path: ["sourceDeleted"],
    });
  }
  if (lifecycle.sourceDeleted && lifecycle.sourceDeletedAt === undefined) {
    context.addIssue({
      code: "custom",
      message: "source-deleted artifact requires sourceDeletedAt",
      path: ["sourceDeletedAt"],
    });
  }
  if (lifecycle.sourceDeleted && lifecycle.sourceDeletionMode === undefined) {
    context.addIssue({
      code: "custom",
      message: "source-deleted artifact requires sourceDeletionMode",
      path: ["sourceDeletionMode"],
    });
  }
});

export const ArtifactProjectionSchema = z.object({
  artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
  taskId: DesktopResourceIdSchema,
  sourceKind: z.enum(["tool_observation", "workspace_file", "generated_preview"]),
  sourceId: z.string().min(1).max(256),
  sourceDigest: Sha256DigestSchema,
  displayName: DesktopDisplayTextSchema.max(320),
  kind: ArtifactProjectionKindSchema,
  mediaType: z.string().min(1).max(240),
  relativePath: DesktopSafeSummarySchema.max(1024).optional(),
  byteSize: z.number().int().nonnegative().optional(),
  createdAt: TimestampSchema,
  previewState: ArtifactProjectionStateSchema,
  lifecycle: ArtifactLifecycleProjectionSchema.default({
    revision: 0,
    pinned: false,
    dismissed: false,
    deleted: false,
    sourceDeleted: false,
  }),
  metadata: JsonObjectSchema,
}).strict().superRefine((artifact, context) => {
  const metadataBytes = new TextEncoder()
    .encode(JSON.stringify(artifact.metadata)).byteLength;
  if (metadataBytes > 4 * 1024) {
    context.addIssue({
      code: "custom",
      message: "Artifact metadata must be bounded to 4096 bytes",
      path: ["metadata"],
    });
  }
  if (
    artifact.relativePath !== undefined
    && (
      artifact.relativePath.includes("\0")
      || artifact.relativePath.includes("\\")
      || artifact.relativePath.startsWith("/")
      || artifact.relativePath.startsWith("//")
      || /^[a-zA-Z]:/u.test(artifact.relativePath)
      || artifact.relativePath.split("/").some((segment) =>
        segment.length === 0 || segment === "." || segment === "..")
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "Artifact relativePath must be workspace-relative",
      path: ["relativePath"],
    });
  }
});

export const ArtifactCatalogItemProjectionSchema = z.object({
  artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
  sourceKind: z.enum(["tool_observation", "workspace_file", "generated_preview"]),
  sourceId: z.string().min(1).max(256),
  sourceDigest: Sha256DigestSchema,
  displayName: DesktopDisplayTextSchema.max(320),
  kind: ArtifactProjectionKindSchema,
  mediaType: z.string().min(1).max(240),
  relativePath: DesktopSafeSummarySchema.max(1024).optional(),
  byteSize: z.number().int().nonnegative().optional(),
  createdAt: TimestampSchema,
  previewState: ArtifactProjectionStateSchema,
  lifecycle: ArtifactLifecycleProjectionSchema.default({
    revision: 0,
    pinned: false,
    dismissed: false,
    deleted: false,
    sourceDeleted: false,
  }),
  originTaskId: DesktopResourceIdSchema.optional(),
  metadata: JsonObjectSchema,
}).strict().superRefine((artifact, context) => {
  const metadataBytes = new TextEncoder()
    .encode(JSON.stringify(artifact.metadata)).byteLength;
  if (metadataBytes > 4 * 1024) {
    context.addIssue({
      code: "custom",
      message: "Artifact metadata must be bounded to 4096 bytes",
      path: ["metadata"],
    });
  }
  if (
    artifact.relativePath !== undefined
    && (
      artifact.relativePath.includes("\0")
      || artifact.relativePath.includes("\\")
      || artifact.relativePath.startsWith("/")
      || artifact.relativePath.startsWith("//")
      || /^[a-zA-Z]:/u.test(artifact.relativePath)
      || artifact.relativePath.split("/").some((segment) =>
        segment.length === 0 || segment === "." || segment === "..")
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "Artifact relativePath must be workspace-relative",
      path: ["relativePath"],
    });
  }
  if (artifact.sourceKind === "workspace_file" && artifact.originTaskId !== undefined) {
    context.addIssue({
      code: "custom",
      message: "manual workspace-file artifacts must not be task-scoped",
      path: ["originTaskId"],
    });
  }
  if (artifact.sourceKind === "tool_observation" && artifact.originTaskId === undefined) {
    context.addIssue({
      code: "custom",
      message: "tool observation artifacts require originTaskId",
      path: ["originTaskId"],
    });
  }
  });

export const ArtifactCatalogProjectionSchema = z.object({
  artifacts: z.array(ArtifactCatalogItemProjectionSchema).max(1024),
  generatedAt: TimestampSchema,
}).strict();

export const ArtifactTextPreviewProjectionSchema = z.object({
  artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
  mode: z.enum(["text", "markdown"]),
  content: DesktopSafeSummarySchema.max(64 * 1024),
  byteSize: z.number().int().nonnegative().max(64 * 1024),
  truncated: z.boolean(),
  warnings: z.array(DesktopSafeSummarySchema.max(512)).max(16),
}).strict().superRefine((preview, context) => {
  const contentBytes = new TextEncoder().encode(preview.content).byteLength;
  if (contentBytes !== preview.byteSize) {
    context.addIssue({
      code: "custom",
      message: "Artifact preview byteSize must match UTF-8 content bytes",
      path: ["byteSize"],
    });
  }
});

export const ArtifactHtmlPreviewProjectionSchema = z.object({
  artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
  previewSessionId: DesktopResourceIdSchema.regex(/^preview:[0-9a-f-]{36}$/u),
  localOrigin: z.literal("http://127.0.0.1"),
  previewUrl: z.string().url().max(512),
  csp: DesktopSafeSummarySchema.max(2048),
  expiresAt: TimestampSchema,
  warnings: z.array(DesktopSafeSummarySchema.max(512)).max(16),
}).strict().superRefine((preview, context) => {
  const url = new URL(preview.previewUrl);
  if (
    url.protocol !== "http:"
    || url.hostname !== "127.0.0.1"
    || url.username !== ""
    || url.password !== ""
  ) {
    context.addIssue({
      code: "custom",
      message: "HTML preview URL must use 127.0.0.1 HTTP without credentials",
      path: ["previewUrl"],
    });
  }
});

export const CloseArtifactPreviewCommandSchema =
  DesktopCommandMetadataSchema.extend({
    type: z.literal("close_artifact_preview"),
    previewSessionId: DesktopResourceIdSchema.regex(/^preview:[0-9a-f-]{36}$/u),
  }).strict();

export const ArtifactPreviewCloseReceiptSchema = z.object({
  commandId: z.string().uuid(),
  previewSessionId: DesktopResourceIdSchema.regex(/^preview:[0-9a-f-]{36}$/u),
  closed: z.boolean(),
}).strict();

export const SetArtifactLifecycleCommandSchema =
  DesktopCommandMetadataSchema.extend({
    type: z.literal("set_artifact_lifecycle"),
    artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
    pinned: z.boolean().optional(),
    dismissed: z.boolean().optional(),
  }).strict().superRefine((command, context) => {
    if (command.pinned === undefined && command.dismissed === undefined) {
      context.addIssue({
        code: "custom",
        message: "artifact lifecycle command must change at least one flag",
      });
    }
  });

export const DeleteArtifactRecordCommandSchema =
  DesktopCommandMetadataSchema.extend({
    type: z.literal("delete_artifact_record"),
    artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
    expectedArtifactRevision: z.number().int().nonnegative(),
    reasonSummary: DesktopSafeSummarySchema.max(512).optional(),
  }).strict();

export const RestoreArtifactRecordCommandSchema =
  DesktopCommandMetadataSchema.extend({
    type: z.literal("restore_artifact_record"),
    artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
    expectedArtifactRevision: z.number().int().nonnegative(),
  }).strict();

export const DeleteArtifactSourceFileCommandSchema =
  DesktopCommandMetadataSchema.extend({
    type: z.literal("delete_artifact_source_file"),
    artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
    expectedArtifactRevision: z.number().int().nonnegative(),
    confirmationText: DesktopSafeSummarySchema.max(512),
  }).strict();

export const RegisterWorkspaceArtifactCommandSchema =
  DesktopCommandMetadataSchema.extend({
    type: z.literal("register_workspace_artifact"),
  }).strict();

export const ArtifactOpenLocationCommandSchema =
  DesktopCommandMetadataSchema.extend({
    type: z.literal("open_artifact_location"),
    artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
  }).strict();

export const ArtifactExportCommandSchema =
  DesktopCommandMetadataSchema.extend({
    type: z.literal("export_artifact"),
    artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
  }).strict();

export const ArtifactLifecycleReceiptSchema = z.object({
  commandId: z.string().uuid(),
  artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
  status: z.enum(["accepted", "replayed"]),
  lifecycle: ArtifactLifecycleProjectionSchema,
}).strict();

export const ArtifactRecordDeletionReceiptSchema =
  ArtifactLifecycleReceiptSchema;

export const ArtifactSourceFileDeletionReceiptSchema = z.object({
  commandId: z.string().uuid(),
  artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
  status: z.enum(["accepted", "replayed"]),
  sourceFileDeleted: z.literal(true),
  deletionMode: z.literal("os_trash"),
  lifecycle: ArtifactLifecycleProjectionSchema,
}).strict();

export const RegisterWorkspaceArtifactReceiptSchema = z.object({
  commandId: z.string().uuid(),
  artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
  status: z.enum(["accepted", "replayed"]),
  artifact: ArtifactCatalogItemProjectionSchema,
}).strict().superRefine((receipt, context) => {
  if (receipt.artifact.artifactId !== receipt.artifactId) {
    context.addIssue({
      code: "custom",
      message: "registration receipt artifactId must match artifact projection",
      path: ["artifact", "artifactId"],
    });
  }
});

export const ArtifactOpenLocationReceiptSchema = z.object({
  commandId: z.string().uuid(),
  artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
  opened: z.boolean(),
}).strict();

export const ArtifactExportReceiptSchema = z.object({
  commandId: z.string().uuid(),
  artifactId: z.string().min(1).max(256).regex(/^artifact:[0-9a-f]{64}$/u),
  exported: z.boolean(),
  fileName: DesktopSafeSummarySchema.max(320).optional(),
}).strict().superRefine((receipt, context) => {
  if (
    receipt.fileName !== undefined
    && (
      receipt.fileName.includes("\0")
      || receipt.fileName.includes("/")
      || receipt.fileName.includes("\\")
      || receipt.fileName === "."
      || receipt.fileName === ".."
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "Artifact export receipt fileName must not contain a path",
      path: ["fileName"],
    });
  }
});

export const TaskDetailProjectionSchema = z.object({
  summary: TaskSummaryProjectionSchema,
  goalSummary: DesktopSafeSummarySchema,
  runs: z.array(TaskRunProjectionSchema).max(128),
  toolActivities: z.array(ToolActivityProjectionSchema).max(2048),
  userConfirmations: z.array(UserConfirmationProjectionSchema).max(256),
  artifacts: z.array(ArtifactProjectionSchema).max(256).default([]),
  latestDurableCursor: z.string().min(1).max(512),
}).strict().superRefine((detail, context) => {
  for (const [index, activity] of detail.toolActivities.entries()) {
    if (activity.taskId !== detail.summary.taskId) {
      context.addIssue({
        code: "custom",
        message: "Tool Activity must belong to the projected Task",
        path: ["toolActivities", index, "taskId"],
      });
    }
  }
  for (const [index, confirmation] of detail.userConfirmations.entries()) {
    if (confirmation.taskId !== detail.summary.taskId) {
      context.addIssue({
        code: "custom",
        message: "User Confirmation must belong to the projected Task",
        path: ["userConfirmations", index, "taskId"],
      });
    }
  }
  for (const [index, artifact] of detail.artifacts.entries()) {
    if (artifact.taskId !== detail.summary.taskId) {
      context.addIssue({
        code: "custom",
        message: "Artifact must belong to the projected Task",
        path: ["artifacts", index, "taskId"],
      });
    }
  }
});

export type TaskControlCommand = z.infer<typeof TaskControlCommandSchema>;
export type CancelTaskCommand = z.infer<typeof CancelTaskCommandSchema>;
export type RetryTaskCommand = z.infer<typeof RetryTaskCommandSchema>;
export type ContinueTaskCommand = z.infer<typeof ContinueTaskCommandSchema>;
export type ProvideTaskInputCommand = z.infer<
  typeof ProvideTaskInputCommandSchema
>;
export type DecideUserConfirmationCommand = z.infer<
  typeof DecideUserConfirmationCommandSchema
>;
export type TaskControlReceipt = z.infer<typeof TaskControlReceiptSchema>;
export type ToolActivityProjection = z.infer<
  typeof ToolActivityProjectionSchema
>;
export type ArtifactProjection = z.infer<typeof ArtifactProjectionSchema>;
export type ArtifactCatalogItemProjection = z.infer<
  typeof ArtifactCatalogItemProjectionSchema
>;
export type ArtifactCatalogProjection = z.infer<
  typeof ArtifactCatalogProjectionSchema
>;
export type ArtifactLifecycleProjection = z.infer<
  typeof ArtifactLifecycleProjectionSchema
>;
export type ArtifactTextPreviewProjection = z.infer<
  typeof ArtifactTextPreviewProjectionSchema
>;
export type ArtifactHtmlPreviewProjection = z.infer<
  typeof ArtifactHtmlPreviewProjectionSchema
>;
export type CloseArtifactPreviewCommand = z.infer<
  typeof CloseArtifactPreviewCommandSchema
>;
export type ArtifactPreviewCloseReceipt = z.infer<
  typeof ArtifactPreviewCloseReceiptSchema
>;
export type SetArtifactLifecycleCommand = z.infer<
  typeof SetArtifactLifecycleCommandSchema
>;
export type DeleteArtifactRecordCommand = z.infer<
  typeof DeleteArtifactRecordCommandSchema
>;
export type RestoreArtifactRecordCommand = z.infer<
  typeof RestoreArtifactRecordCommandSchema
>;
export type DeleteArtifactSourceFileCommand = z.infer<
  typeof DeleteArtifactSourceFileCommandSchema
>;
export type RegisterWorkspaceArtifactCommand = z.infer<
  typeof RegisterWorkspaceArtifactCommandSchema
>;
export type ArtifactOpenLocationCommand = z.infer<
  typeof ArtifactOpenLocationCommandSchema
>;
export type ArtifactExportCommand = z.infer<
  typeof ArtifactExportCommandSchema
>;
export type ArtifactLifecycleReceipt = z.infer<
  typeof ArtifactLifecycleReceiptSchema
>;
export type ArtifactRecordDeletionReceipt = z.infer<
  typeof ArtifactRecordDeletionReceiptSchema
>;
export type ArtifactSourceFileDeletionReceipt = z.infer<
  typeof ArtifactSourceFileDeletionReceiptSchema
>;
export type RegisterWorkspaceArtifactReceipt = z.infer<
  typeof RegisterWorkspaceArtifactReceiptSchema
>;
export type ArtifactOpenLocationReceipt = z.infer<
  typeof ArtifactOpenLocationReceiptSchema
>;
export type ArtifactExportReceipt = z.infer<
  typeof ArtifactExportReceiptSchema
>;
export type UserConfirmationProjection = z.infer<
  typeof UserConfirmationProjectionSchema
>;
export type TaskStepProjection = z.infer<typeof TaskStepProjectionSchema>;
export type TaskRunProjection = z.infer<typeof TaskRunProjectionSchema>;
export type TaskDetailProjection = z.infer<typeof TaskDetailProjectionSchema>;
