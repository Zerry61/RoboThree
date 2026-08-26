import { z } from "zod";

import {
  DesktopCommandMetadataSchema,
  DesktopDisplayTextSchema,
  DesktopResourceIdSchema,
  TimestampSchema,
} from "./common.js";

export const WorkspaceAccessModeSchema = z.enum(["read", "read_write"]);
export const WorkspaceGrantStatusSchema = z.enum(["active", "revoked"]);

export const CreateWorkspaceGrantCommandSchema =
  DesktopCommandMetadataSchema.extend({
    type: z.literal("create_workspace_grant"),
    selectionHandle: z.string().min(16).max(512),
    displayName: DesktopDisplayTextSchema,
    accessMode: WorkspaceAccessModeSchema,
  }).strict();

export const RevokeWorkspaceGrantCommandSchema =
  DesktopCommandMetadataSchema.extend({
    type: z.literal("revoke_workspace_grant"),
    workspaceGrantId: DesktopResourceIdSchema,
  }).strict();

export const WorkspaceGrantProjectionSchema = z.object({
  workspaceGrantId: DesktopResourceIdSchema,
  displayName: DesktopDisplayTextSchema,
  rootDisplayPath: z.string().min(1).max(4096),
  accessMode: WorkspaceAccessModeSchema,
  status: WorkspaceGrantStatusSchema,
  createdAt: TimestampSchema,
  revokedAt: TimestampSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "revoked" && value.revokedAt === undefined) {
    context.addIssue({
      code: "custom",
      message: "revoked workspace grants require revokedAt",
      path: ["revokedAt"],
    });
  }
  if (value.status === "active" && value.revokedAt !== undefined) {
    context.addIssue({
      code: "custom",
      message: "active workspace grants must not include revokedAt",
      path: ["revokedAt"],
    });
  }
});

export type CreateWorkspaceGrantCommand = z.infer<
  typeof CreateWorkspaceGrantCommandSchema
>;
export type RevokeWorkspaceGrantCommand = z.infer<
  typeof RevokeWorkspaceGrantCommandSchema
>;
export type WorkspaceGrantProjection = z.infer<
  typeof WorkspaceGrantProjectionSchema
>;
export type WorkspaceAccessMode = z.infer<typeof WorkspaceAccessModeSchema>;
