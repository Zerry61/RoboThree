import { z } from "zod";

import { EntityIdSchema } from "../common/identifiers.js";
import { CurrentContractVersionSchema } from "../common/version.js";
import { Sha256DigestSchema } from "../persistence/common.js";

export const FileOperationSchema = z.enum([
  "read",
  "create",
  "modify",
  "delete",
  "bulk_overwrite",
]);

export const ResourceGrantSchema = z.object({
  schemaVersion: CurrentContractVersionSchema,
  grantId: EntityIdSchema,
  kind: z.enum(["file", "workspace"]),
  rootRealPath: z.string().trim().min(1).max(4_096),
  operations: z.array(FileOperationSchema).min(1).max(5),
}).strict().superRefine((grant, context) => {
  if (!grant.rootRealPath.startsWith("/")) {
    context.addIssue({ code: "custom", message: "grant rootRealPath must be absolute", path: ["rootRealPath"] });
  }
  if (new Set(grant.operations).size !== grant.operations.length) {
    context.addIssue({ code: "custom", message: "grant operations must be unique", path: ["operations"] });
  }
});

export const ResourceAccessSchema = z.object({
  grantId: EntityIdSchema,
  targetRealPath: z.string().trim().min(1).max(4_096),
  operation: FileOperationSchema,
  protectedResource: z.boolean(),
}).strict().superRefine((access, context) => {
  if (!access.targetRealPath.startsWith("/")) {
    context.addIssue({ code: "custom", message: "targetRealPath must be absolute", path: ["targetRealPath"] });
  }
});

export const ExternalDataScopeSchema = z.object({
  externalTarget: z.string().trim().min(1).max(500),
  dataScopeDigest: Sha256DigestSchema,
}).strict();

export const UserAuthorizationSnapshotSchema = z.object({
  schemaVersion: CurrentContractVersionSchema,
  userId: EntityIdSchema,
  activeConfigRevision: z.string().trim().min(1).max(200),
  canUseTools: z.boolean(),
  assignedToolCapabilityIds: z.array(z.string().trim().min(1).max(200)),
  grants: z.array(ResourceGrantSchema),
}).strict().superRefine((snapshot, context) => {
  if (new Set(snapshot.assignedToolCapabilityIds).size !== snapshot.assignedToolCapabilityIds.length) {
    context.addIssue({ code: "custom", message: "assigned tools must be unique", path: ["assignedToolCapabilityIds"] });
  }
  if (new Set(snapshot.grants.map((grant) => grant.grantId)).size !== snapshot.grants.length) {
    context.addIssue({ code: "custom", message: "grant ids must be unique", path: ["grants"] });
  }
});

export const CapabilityAvailabilitySnapshotSchema = z.object({
  enabled: z.boolean(),
  healthy: z.boolean(),
  credentialAvailable: z.boolean(),
  revision: z.string().trim().min(1).max(200),
}).strict();

export const ToolAuthorizationContextSchema = z.object({
  schemaVersion: CurrentContractVersionSchema,
  subject: UserAuthorizationSnapshotSchema,
  resourceAccesses: z.array(ResourceAccessSchema),
  externalDataScope: ExternalDataScopeSchema.optional(),
  availability: CapabilityAvailabilitySnapshotSchema,
}).strict();

export type FileOperation = z.infer<typeof FileOperationSchema>;
export type ResourceGrant = z.infer<typeof ResourceGrantSchema>;
export type ResourceAccess = z.infer<typeof ResourceAccessSchema>;
export type ExternalDataScope = z.infer<typeof ExternalDataScopeSchema>;
export type UserAuthorizationSnapshot = z.infer<typeof UserAuthorizationSnapshotSchema>;
export type CapabilityAvailabilitySnapshot = z.infer<typeof CapabilityAvailabilitySnapshotSchema>;
export type ToolAuthorizationContext = z.infer<typeof ToolAuthorizationContextSchema>;
