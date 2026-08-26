import { z } from "zod";

import {
  DesktopDisplayTextSchema,
  DesktopResourceIdSchema,
  Sha256DigestSchema,
  TimestampSchema,
} from "../v1alpha1/common.js";
import {
  DesktopCommandMetadataV1Alpha2Schema,
  DesktopQueryMetadataV1Alpha2Schema,
} from "./common.js";

export const WorkspaceEntryIdV1Alpha2Schema = z.string()
  .min(48)
  .max(4096)
  .regex(/^wse1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);

export const WorkspaceCursorV1Alpha2Schema = z.string()
  .min(48)
  .max(4096)
  .regex(/^wsc1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);

export const ListWorkspaceEntriesQuerySchema =
  DesktopQueryMetadataV1Alpha2Schema.extend({
    type: z.literal("list_workspace_entries"),
    taskId: DesktopResourceIdSchema.refine((value) => value.startsWith("task:"), {
      message: "workspace browsing requires a Desktop task ID",
    }),
    parentEntryId: WorkspaceEntryIdV1Alpha2Schema.optional(),
    cursor: WorkspaceCursorV1Alpha2Schema.optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }).strict();

export const WorkspaceEntryKindSchema = z.enum([
  "directory",
  "file",
  "symlink",
]);

export const WorkspaceEntryProjectionSchema = z.object({
  entryId: WorkspaceEntryIdV1Alpha2Schema,
  displayName: DesktopDisplayTextSchema,
  kind: WorkspaceEntryKindSchema,
  navigable: z.boolean(),
  sizeBytes: z.number().int().nonnegative().optional(),
  modifiedAt: TimestampSchema.optional(),
  unavailableReason: z.string()
    .min(3)
    .max(128)
    .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/u)
    .optional(),
}).strict().superRefine((value, context) => {
  if (value.kind === "directory" && !value.navigable) {
    context.addIssue({ code: "custom", message: "directories must be navigable" });
  }
  if (value.kind === "file" && value.sizeBytes === undefined) {
    context.addIssue({ code: "custom", message: "files require sizeBytes" });
  }
  if (value.kind === "symlink" && (value.navigable || value.unavailableReason === undefined)) {
    context.addIssue({
      code: "custom",
      message: "symlinks must be unavailable and non-navigable",
    });
  }
});

export const WorkspaceDirectoryProjectionSchema = z.object({
  contractVersion: z.literal("v1alpha2"),
  workspaceGrantId: DesktopResourceIdSchema,
  parentEntryId: WorkspaceEntryIdV1Alpha2Schema.optional(),
  breadcrumbDisplayNames: z.array(DesktopDisplayTextSchema).max(64),
  entries: z.array(WorkspaceEntryProjectionSchema).max(200),
  nextCursor: WorkspaceCursorV1Alpha2Schema.optional(),
  truncated: z.boolean(),
  snapshotDigest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.truncated !== (value.nextCursor !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "truncated and nextCursor must agree",
      path: ["nextCursor"],
    });
  }
});

export const OpenTaskWorkspaceLocationCommandSchema =
  DesktopCommandMetadataV1Alpha2Schema.extend({
    type: z.literal("open_task_workspace_location"),
    taskId: DesktopResourceIdSchema.refine((value) => value.startsWith("task:"), {
      message: "workspace reveal requires a Desktop task ID",
    }),
  }).strict();

export const TaskWorkspaceOpenReceiptSchema = z.object({
  contractVersion: z.literal("v1alpha2"),
  commandId: z.string().uuid(),
  taskId: DesktopResourceIdSchema,
  workspaceGrantId: DesktopResourceIdSchema,
  openedAt: TimestampSchema,
}).strict();

export type ListWorkspaceEntriesQuery = z.infer<
  typeof ListWorkspaceEntriesQuerySchema
>;
export type WorkspaceEntryKind = z.infer<typeof WorkspaceEntryKindSchema>;
export type WorkspaceEntryProjection = z.infer<
  typeof WorkspaceEntryProjectionSchema
>;
export type WorkspaceDirectoryProjection = z.infer<
  typeof WorkspaceDirectoryProjectionSchema
>;
export type OpenTaskWorkspaceLocationCommand = z.infer<
  typeof OpenTaskWorkspaceLocationCommandSchema
>;
export type TaskWorkspaceOpenReceipt = z.infer<
  typeof TaskWorkspaceOpenReceiptSchema
>;
