import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { TimestampSchema } from "../../common/time.js";
import { DesktopResourceIdSchema } from "../../desktop-local/v1alpha1/common.js";
import { Sha256DigestSchema } from "../../persistence/common.js";

export const SKILL_LIFECYCLE_CONTRACT_VERSION = "skill-lifecycle.v1alpha1" as const;
export const SkillLifecycleContractVersionSchema = z.literal(
  SKILL_LIFECYCLE_CONTRACT_VERSION,
);

export const SKILL_LIFECYCLE_PERMISSION = "skill.manage" as const;
export const SkillLifecyclePermissionSchema = z.literal(SKILL_LIFECYCLE_PERMISSION);

export const DESKTOP_SKILL_LIFECYCLE_METHODS = Object.freeze([
  "getSkillLifecycleCompatibility",
  "listSkills",
  "getSkill",
  "createSkillDraftWorkspace",
  "refreshSkillDraft",
  "startSkillDraftTest",
  "submitSkillDraft",
  "withdrawSkillSubmission",
  "installSkillRelease",
  "uninstallSkillRelease",
  "querySkillOperation",
] as const);

export const ADMIN_SKILL_LIFECYCLE_METHODS = Object.freeze([
  "listSkillSubmissions",
  "getSkillSubmission",
  "approveSkillSubmission",
  "rejectSkillSubmission",
  "uploadEnterpriseSkillPackage",
  "getEnterpriseSkillDraft",
  "updateEnterpriseSkillDraftMetadata",
  "startEnterpriseSkillDraftTest",
  "queryEnterpriseSkillDraftTest",
  "publishEnterpriseSkillDraft",
] as const);

export const SkillIdSchema = DesktopResourceIdSchema.refine(
  (value) => value.startsWith("skill."),
  "skill ID must use the skill namespace",
);
export const SkillRevisionSchema = Sha256DigestSchema;
export const SkillTechnicalNameSchema = z.string()
  .min(3)
  .max(96)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
export const SkillDisplayTitleSchema = z.string().trim().min(1).max(128);
export const SkillDescriptionSchema = z.string().trim().min(1).max(4096);
export const SkillPrimaryFunctionSchema = z.string().trim().min(1).max(4096);
export const SkillSafeSummarySchema = z.string().trim().min(1).max(1000);
export const SkillSafeMarkdownProjectionSchema = z.string().max(256 * 1024);
export const SkillSemanticVersionSchema = z.string()
  .regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u);

export const SkillLifecycleCommandMetadataSchema = z.object({
  contractVersion: SkillLifecycleContractVersionSchema,
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
}).strict();

export const SkillLifecycleQueryMetadataSchema = z.object({
  contractVersion: SkillLifecycleContractVersionSchema,
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
}).strict();

export const SkillListScopeSchema = z.enum([
  "marketplace",
  "installed",
  "local",
  "created",
]);
export const SkillSourceKindSchema = z.enum([
  "code_owned",
  "personal_creator",
  "admin_upload",
  "local_user_directory",
  "local_workspace_directory",
]);
export const SkillAvailabilitySchema = z.enum([
  "available",
  "invalid",
  "source_changed",
  "conflicting",
  "unavailable",
]);
export const SkillDraftTestStateSchema = z.enum([
  "untested",
  "running",
  "passed",
  "failed",
  "stale",
]);
export const SkillSubmissionStateSchema = z.enum([
  "pending_review",
  "approved",
  "rejected",
  "withdrawn",
]);
export const SkillOperationStateSchema = z.enum([
  "accepted",
  "running",
  "succeeded",
  "failed",
]);

export const SkillPackageFactsSchema = z.object({
  packageDigest: SkillRevisionSchema,
  manifestDigest: SkillRevisionSchema,
  skillMarkdownDigest: SkillRevisionSchema,
  fileCount: z.number().int().min(1).max(4096),
  expandedByteCount: z.number().int().min(1).max(512 * 1024 * 1024),
}).strict();

export const SkillDraftMaterialSchema = z.object({
  skillId: SkillIdSchema,
  technicalName: SkillTechnicalNameSchema,
  displayTitle: SkillDisplayTitleSchema,
  displayDescription: SkillDescriptionSchema,
  primaryFunction: SkillPrimaryFunctionSchema,
}).strict();

export const SkillDraftTestFactSchema = z.object({
  draftRevision: SkillRevisionSchema,
  state: SkillDraftTestStateSchema,
  taskId: DesktopResourceIdSchema.optional(),
  testedAt: TimestampSchema.optional(),
  safeReason: SkillSafeSummarySchema.optional(),
}).strict().superRefine((value, context) => {
  const terminal = value.state === "passed" || value.state === "failed";
  if (terminal && (value.taskId === undefined || value.testedAt === undefined)) {
    context.addIssue({ code: "custom", message: "terminal test facts require task and time" });
  }
  if (value.state === "failed" && value.safeReason === undefined) {
    context.addIssue({ code: "custom", path: ["safeReason"], message: "failed tests require a safe reason" });
  }
  if (value.state === "passed" && value.safeReason !== undefined) {
    context.addIssue({ code: "custom", path: ["safeReason"], message: "passed tests cannot contain a failure reason" });
  }
});

const SkillSummaryFields = {
  skillId: SkillIdSchema,
  revision: SkillRevisionSchema,
  technicalName: SkillTechnicalNameSchema,
  displayTitle: SkillDisplayTitleSchema,
  displayDescription: SkillDescriptionSchema,
  sourceKind: SkillSourceKindSchema,
  availability: SkillAvailabilitySchema,
  creatorDisplayName: z.string().trim().min(1).max(256).optional(),
  semanticVersion: SkillSemanticVersionSchema.optional(),
  installed: z.boolean(),
  installationRevision: SkillRevisionSchema.optional(),
  updatedAt: TimestampSchema,
} as const;

export const SkillSummarySchema = z.object(SkillSummaryFields).strict()
  .superRefine(validateInstallationIdentity);

export const SkillSubmissionIdentitySchema = z.object({
  submissionId: EntityIdSchema,
  submissionRevision: SkillRevisionSchema,
  state: SkillSubmissionStateSchema,
}).strict();

export const SkillDetailSchema = z.object({
  ...SkillSummaryFields,
  packageFacts: SkillPackageFactsSchema.optional(),
  safeMarkdown: SkillSafeMarkdownProjectionSchema.optional(),
  draftTestFact: SkillDraftTestFactSchema.optional(),
  submission: SkillSubmissionIdentitySchema.optional(),
}).strict().superRefine(validateInstallationIdentity);

export const SkillPageSchema = z.object({
  contractVersion: SkillLifecycleContractVersionSchema,
  queryRevision: SkillRevisionSchema,
  scope: SkillListScopeSchema,
  items: z.array(SkillSummarySchema).max(500),
  nextCursor: z.string().min(1).max(512).optional(),
}).strict();

export const SkillLifecycleCompatibilitySchema = z.object({
  contractVersion: SkillLifecycleContractVersionSchema,
  serviceAvailable: z.boolean(),
  marketplaceAvailable: z.boolean(),
  creatorAvailable: z.boolean(),
  installationAvailable: z.boolean(),
  testIdentityUsed: z.boolean(),
  productionIdentityReady: z.literal(false),
}).strict();

export const GetSkillLifecycleCompatibilityQuerySchema =
  SkillLifecycleQueryMetadataSchema.extend({
    kind: z.literal("get_skill_lifecycle_compatibility"),
  }).strict();

export const ListSkillsQuerySchema = SkillLifecycleQueryMetadataSchema.extend({
  kind: z.literal("list_skills"),
  scope: SkillListScopeSchema,
  cursor: z.string().min(1).max(512).optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();

export const GetSkillQuerySchema = SkillLifecycleQueryMetadataSchema.extend({
  kind: z.literal("get_skill"),
  skillId: SkillIdSchema,
  revision: SkillRevisionSchema.optional(),
  sourceKind: SkillSourceKindSchema.optional(),
}).strict();

export const CreateSkillDraftWorkspaceCommandSchema =
  SkillLifecycleCommandMetadataSchema.extend({
    kind: z.literal("create_skill_draft_workspace"),
    displayTitle: SkillDisplayTitleSchema,
    displayDescription: SkillDescriptionSchema,
    primaryFunction: SkillPrimaryFunctionSchema,
  }).strict();

export const RefreshSkillDraftCommandSchema = SkillLifecycleCommandMetadataSchema.extend({
  kind: z.literal("refresh_skill_draft"),
  skillId: SkillIdSchema,
  expectedDraftRevision: SkillRevisionSchema,
}).strict();

export const StartSkillDraftTestCommandSchema = SkillLifecycleCommandMetadataSchema.extend({
  kind: z.literal("start_skill_draft_test"),
  skillId: SkillIdSchema,
  expectedDraftRevision: SkillRevisionSchema,
  testInput: z.string().trim().min(1).max(64 * 1024),
}).strict();

export const SubmitSkillDraftCommandSchema = SkillLifecycleCommandMetadataSchema.extend({
  kind: z.literal("submit_skill_draft"),
  skillId: SkillIdSchema,
  expectedDraftRevision: SkillRevisionSchema,
  semanticVersion: SkillSemanticVersionSchema,
  changeSummary: z.string().trim().min(1).max(2000),
  publicationScope: z.literal("enterprise"),
}).strict();

export const WithdrawSkillSubmissionCommandSchema =
  SkillLifecycleCommandMetadataSchema.extend({
    kind: z.literal("withdraw_skill_submission"),
    skillId: SkillIdSchema,
    submissionId: EntityIdSchema,
    expectedSubmissionRevision: SkillRevisionSchema,
  }).strict();

export const InstallSkillReleaseCommandSchema = SkillLifecycleCommandMetadataSchema.extend({
  kind: z.literal("install_skill_release"),
  skillId: SkillIdSchema,
  releaseRevision: SkillRevisionSchema,
  packageDigest: SkillRevisionSchema,
  mode: z.enum(["install_exact", "replace_with_exact_release"]),
}).strict();

export const UninstallSkillReleaseCommandSchema = SkillLifecycleCommandMetadataSchema.extend({
  kind: z.literal("uninstall_skill_release"),
  skillId: SkillIdSchema,
  releaseRevision: SkillRevisionSchema,
  expectedInstallationRevision: SkillRevisionSchema,
}).strict();

export const QuerySkillOperationSchema = SkillLifecycleQueryMetadataSchema.extend({
  kind: z.literal("query_skill_operation"),
  operationId: EntityIdSchema,
}).strict();

export const SkillOperationSchema = z.object({
  contractVersion: SkillLifecycleContractVersionSchema,
  operationId: EntityIdSchema,
  correlationId: EntityIdSchema,
  operationKind: z.enum(["draft_test", "install", "uninstall", "admin_draft_test"]),
  state: SkillOperationStateSchema,
  skillId: SkillIdSchema,
  targetRevision: SkillRevisionSchema,
  taskId: DesktopResourceIdSchema.optional(),
  safeReason: SkillSafeSummarySchema.optional(),
  updatedAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  if (value.state === "failed" && value.safeReason === undefined) {
    context.addIssue({ code: "custom", path: ["safeReason"], message: "failed operations require a safe reason" });
  }
  if (value.state === "succeeded" && value.safeReason !== undefined) {
    context.addIssue({ code: "custom", path: ["safeReason"], message: "successful operations cannot contain a failure reason" });
  }
});

export const SkillLifecycleMutationStateSchema = z.enum([
  "draft_created",
  "draft_refreshed",
  "test_started",
  "submitted",
  "withdrawn",
  "install_accepted",
  "uninstall_accepted",
  "approved",
  "rejected",
  "metadata_updated",
  "upload_accepted",
  "published",
]);

export const SkillLifecycleMutationReceiptSchema = z.object({
  contractVersion: SkillLifecycleContractVersionSchema,
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
  skillId: SkillIdSchema,
  currentRevision: SkillRevisionSchema,
  state: SkillLifecycleMutationStateSchema,
  operationId: EntityIdSchema.optional(),
  submissionId: EntityIdSchema.optional(),
}).strict();

export const CreateSkillDraftWorkspaceReceiptSchema =
  SkillLifecycleMutationReceiptSchema.extend({
    state: z.literal("draft_created"),
    draftId: EntityIdSchema,
    workspaceGrantId: DesktopResourceIdSchema,
    displayName: SkillDisplayTitleSchema,
  }).strict();

export const SubmitSkillDraftReceiptSchema = SkillLifecycleMutationReceiptSchema.extend({
  state: z.literal("submitted"),
  submissionId: EntityIdSchema,
  submissionRevision: SkillRevisionSchema,
}).strict();

export const SkillSubmissionSummarySchema = z.object({
  submissionId: EntityIdSchema,
  submissionRevision: SkillRevisionSchema,
  skillId: SkillIdSchema,
  draftRevision: SkillRevisionSchema,
  displayTitle: SkillDisplayTitleSchema,
  technicalName: SkillTechnicalNameSchema,
  creatorDisplayName: z.string().trim().min(1).max(256),
  semanticVersion: SkillSemanticVersionSchema,
  state: SkillSubmissionStateSchema,
  submittedAt: TimestampSchema,
  reviewedAt: TimestampSchema.optional(),
}).strict();

export const SkillSubmissionDetailSchema = SkillSubmissionSummarySchema.extend({
  displayDescription: SkillDescriptionSchema,
  primaryFunction: SkillPrimaryFunctionSchema,
  packageFacts: SkillPackageFactsSchema,
  testFact: SkillDraftTestFactSchema,
  changeSummary: z.string().trim().min(1).max(2000),
  rejectionReason: SkillSafeSummarySchema.optional(),
}).strict();

export const SkillSubmissionPageSchema = z.object({
  contractVersion: SkillLifecycleContractVersionSchema,
  queryRevision: SkillRevisionSchema,
  items: z.array(SkillSubmissionSummarySchema).max(100),
  nextCursor: z.string().min(1).max(512).optional(),
}).strict();

export const ListSkillSubmissionsQuerySchema = SkillLifecycleQueryMetadataSchema.extend({
  kind: z.literal("list_skill_submissions"),
  state: SkillSubmissionStateSchema.optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();

export const GetSkillSubmissionQuerySchema = SkillLifecycleQueryMetadataSchema.extend({
  kind: z.literal("get_skill_submission"),
  submissionId: EntityIdSchema,
}).strict();

export const ApproveSkillSubmissionCommandSchema =
  SkillLifecycleCommandMetadataSchema.extend({
    kind: z.literal("approve_skill_submission"),
    submissionId: EntityIdSchema,
    expectedSubmissionRevision: SkillRevisionSchema,
  }).strict();

export const RejectSkillSubmissionCommandSchema =
  SkillLifecycleCommandMetadataSchema.extend({
    kind: z.literal("reject_skill_submission"),
    submissionId: EntityIdSchema,
    expectedSubmissionRevision: SkillRevisionSchema,
    reason: SkillSafeSummarySchema,
  }).strict();

export const SkillArchiveFormatSchema = z.enum(["zip", "rar", "tar_gz", "tgz"]);
export const SkillArchiveUploadMetadataSchema = z.object({
  archiveFileName: z.string().trim().min(1).max(255),
  archiveFormat: SkillArchiveFormatSchema,
  mediaType: z.string().trim().min(1).max(128),
  byteLength: z.number().int().min(1).max(200 * 1024 * 1024),
  archiveDigest: SkillRevisionSchema,
}).strict();

/** The archive bytes are a separate bounded multipart file part and never appear here. */
export const UploadEnterpriseSkillPackageCommandSchema =
  SkillLifecycleCommandMetadataSchema.extend({
    kind: z.literal("upload_enterprise_skill_package"),
    upload: SkillArchiveUploadMetadataSchema,
  }).strict();

export const EnterpriseSkillDraftMetadataSchema = z.object({
  displayTitle: SkillDisplayTitleSchema,
  displayDescription: SkillDescriptionSchema,
  semanticVersion: SkillSemanticVersionSchema,
  usageScope: z.enum(["enterprise_all", "restricted"]),
  allowedSubjectIds: z.array(EntityIdSchema).max(1000),
}).strict().superRefine((value, context) => {
  if (value.usageScope === "enterprise_all" && value.allowedSubjectIds.length > 0) {
    context.addIssue({ code: "custom", path: ["allowedSubjectIds"], message: "enterprise-wide scope cannot carry subject IDs" });
  }
  if (value.usageScope === "restricted" && value.allowedSubjectIds.length === 0) {
    context.addIssue({ code: "custom", path: ["allowedSubjectIds"], message: "restricted scope requires subject IDs" });
  }
});

export const EnterpriseSkillDraftSchema = z.object({
  contractVersion: SkillLifecycleContractVersionSchema,
  skillId: SkillIdSchema,
  draftRevision: SkillRevisionSchema,
  technicalName: SkillTechnicalNameSchema,
  metadata: EnterpriseSkillDraftMetadataSchema,
  packageFacts: SkillPackageFactsSchema,
  testFact: SkillDraftTestFactSchema,
  updatedAt: TimestampSchema,
}).strict();

export const GetEnterpriseSkillDraftQuerySchema =
  SkillLifecycleQueryMetadataSchema.extend({
    kind: z.literal("get_enterprise_skill_draft"),
    skillId: SkillIdSchema,
  }).strict();

export const UpdateEnterpriseSkillDraftMetadataCommandSchema =
  SkillLifecycleCommandMetadataSchema.extend({
    kind: z.literal("update_enterprise_skill_draft_metadata"),
    skillId: SkillIdSchema,
    expectedDraftRevision: SkillRevisionSchema,
    metadata: EnterpriseSkillDraftMetadataSchema,
  }).strict();

export const StartEnterpriseSkillDraftTestCommandSchema =
  SkillLifecycleCommandMetadataSchema.extend({
    kind: z.literal("start_enterprise_skill_draft_test"),
    skillId: SkillIdSchema,
    expectedDraftRevision: SkillRevisionSchema,
    testInput: z.string().trim().min(1).max(64 * 1024),
  }).strict();

export const QueryEnterpriseSkillDraftTestSchema =
  SkillLifecycleQueryMetadataSchema.extend({
    kind: z.literal("query_enterprise_skill_draft_test"),
    operationId: EntityIdSchema,
  }).strict();

export const PublishEnterpriseSkillDraftCommandSchema =
  SkillLifecycleCommandMetadataSchema.extend({
    kind: z.literal("publish_enterprise_skill_draft"),
    skillId: SkillIdSchema,
    expectedDraftRevision: SkillRevisionSchema,
  }).strict();

export const PublishedSkillReleaseSchema = z.object({
  contractVersion: SkillLifecycleContractVersionSchema,
  skillId: SkillIdSchema,
  releaseRevision: SkillRevisionSchema,
  packageFacts: SkillPackageFactsSchema,
  technicalName: SkillTechnicalNameSchema,
  displayTitle: SkillDisplayTitleSchema,
  displayDescription: SkillDescriptionSchema,
  semanticVersion: SkillSemanticVersionSchema,
  sourceKind: z.enum(["personal_creator", "admin_upload"]),
  publishedAt: TimestampSchema,
}).strict();

export const SkillLifecycleErrorCodeSchema = z.enum([
  "skilllifecycle.invalid_request",
  "skilllifecycle.unauthorized",
  "skilllifecycle.not_found",
  "skilllifecycle.revision_conflict",
  "skilllifecycle.service_unavailable",
  "skilllifecycle.skill_id_reserved",
  "skilllifecycle.draft_incomplete",
  "skilllifecycle.package_invalid",
  "skilllifecycle.package_too_large",
  "skilllifecycle.archive_unsupported",
  "skilllifecycle.test_required",
  "skilllifecycle.submission_conflict",
  "skilllifecycle.release_conflict",
  "skilllifecycle.installation_conflict",
  "skilllifecycle.active_task_lock",
  "skilllifecycle.local_source_changed",
  "skilllifecycle.operation_failed",
]);

export const SkillLifecycleSafeErrorSchema = z.object({
  contractVersion: SkillLifecycleContractVersionSchema,
  errorCode: SkillLifecycleErrorCodeSchema,
  safeSummary: SkillSafeSummarySchema,
  correlationId: EntityIdSchema,
  retryable: z.boolean(),
}).strict();

export type DesktopSkillLifecycleMethod = typeof DESKTOP_SKILL_LIFECYCLE_METHODS[number];
export type AdminSkillLifecycleMethod = typeof ADMIN_SKILL_LIFECYCLE_METHODS[number];
export type SkillId = z.infer<typeof SkillIdSchema>;
export type SkillRevision = z.infer<typeof SkillRevisionSchema>;
export type SkillListScope = z.infer<typeof SkillListScopeSchema>;
export type SkillSummary = z.infer<typeof SkillSummarySchema>;
export type SkillDetail = z.infer<typeof SkillDetailSchema>;
export type SkillPage = z.infer<typeof SkillPageSchema>;
export type SkillLifecycleCompatibility = z.infer<typeof SkillLifecycleCompatibilitySchema>;
export type SkillOperation = z.infer<typeof SkillOperationSchema>;
export type SkillLifecycleMutationReceipt = z.infer<typeof SkillLifecycleMutationReceiptSchema>;
export type CreateSkillDraftWorkspaceReceipt = z.infer<
  typeof CreateSkillDraftWorkspaceReceiptSchema
>;
export type SubmitSkillDraftReceipt = z.infer<typeof SubmitSkillDraftReceiptSchema>;
export type SkillSubmissionIdentity = z.infer<typeof SkillSubmissionIdentitySchema>;
export type SkillSubmissionPage = z.infer<typeof SkillSubmissionPageSchema>;
export type SkillSubmissionDetail = z.infer<typeof SkillSubmissionDetailSchema>;
export type EnterpriseSkillDraft = z.infer<typeof EnterpriseSkillDraftSchema>;
export type PublishedSkillRelease = z.infer<typeof PublishedSkillReleaseSchema>;
export type SkillLifecycleErrorCode = z.infer<typeof SkillLifecycleErrorCodeSchema>;
export type SkillLifecycleSafeError = z.infer<typeof SkillLifecycleSafeErrorSchema>;
export type GetSkillLifecycleCompatibilityQuery = z.infer<
  typeof GetSkillLifecycleCompatibilityQuerySchema
>;
export type ListSkillsQuery = z.infer<typeof ListSkillsQuerySchema>;
export type GetSkillQuery = z.infer<typeof GetSkillQuerySchema>;
export type CreateSkillDraftWorkspaceCommand = z.infer<
  typeof CreateSkillDraftWorkspaceCommandSchema
>;
export type RefreshSkillDraftCommand = z.infer<typeof RefreshSkillDraftCommandSchema>;
export type StartSkillDraftTestCommand = z.infer<typeof StartSkillDraftTestCommandSchema>;
export type SubmitSkillDraftCommand = z.infer<typeof SubmitSkillDraftCommandSchema>;
export type WithdrawSkillSubmissionCommand = z.infer<
  typeof WithdrawSkillSubmissionCommandSchema
>;
export type InstallSkillReleaseCommand = z.infer<typeof InstallSkillReleaseCommandSchema>;
export type UninstallSkillReleaseCommand = z.infer<typeof UninstallSkillReleaseCommandSchema>;
export type QuerySkillOperation = z.infer<typeof QuerySkillOperationSchema>;
export type ListSkillSubmissionsQuery = z.infer<typeof ListSkillSubmissionsQuerySchema>;
export type GetSkillSubmissionQuery = z.infer<typeof GetSkillSubmissionQuerySchema>;
export type ApproveSkillSubmissionCommand = z.infer<
  typeof ApproveSkillSubmissionCommandSchema
>;
export type RejectSkillSubmissionCommand = z.infer<typeof RejectSkillSubmissionCommandSchema>;
export type UploadEnterpriseSkillPackageCommand = z.infer<
  typeof UploadEnterpriseSkillPackageCommandSchema
>;
export type GetEnterpriseSkillDraftQuery = z.infer<
  typeof GetEnterpriseSkillDraftQuerySchema
>;
export type UpdateEnterpriseSkillDraftMetadataCommand = z.infer<
  typeof UpdateEnterpriseSkillDraftMetadataCommandSchema
>;
export type StartEnterpriseSkillDraftTestCommand = z.infer<
  typeof StartEnterpriseSkillDraftTestCommandSchema
>;
export type QueryEnterpriseSkillDraftTest = z.infer<
  typeof QueryEnterpriseSkillDraftTestSchema
>;
export type PublishEnterpriseSkillDraftCommand = z.infer<
  typeof PublishEnterpriseSkillDraftCommandSchema
>;

export type DesktopSkillLifecycleApiV1Alpha1 = Readonly<{
  getSkillLifecycleCompatibility(
    query: GetSkillLifecycleCompatibilityQuery,
  ): Promise<SkillLifecycleCompatibility>;
  listSkills(query: ListSkillsQuery): Promise<SkillPage>;
  getSkill(query: GetSkillQuery): Promise<SkillDetail>;
  createSkillDraftWorkspace(
    command: CreateSkillDraftWorkspaceCommand,
  ): Promise<CreateSkillDraftWorkspaceReceipt>;
  refreshSkillDraft(
    command: RefreshSkillDraftCommand,
  ): Promise<SkillLifecycleMutationReceipt>;
  startSkillDraftTest(
    command: StartSkillDraftTestCommand,
  ): Promise<SkillLifecycleMutationReceipt>;
  submitSkillDraft(
    command: SubmitSkillDraftCommand,
  ): Promise<SubmitSkillDraftReceipt>;
  withdrawSkillSubmission(
    command: WithdrawSkillSubmissionCommand,
  ): Promise<SkillLifecycleMutationReceipt>;
  installSkillRelease(
    command: InstallSkillReleaseCommand,
  ): Promise<SkillLifecycleMutationReceipt>;
  uninstallSkillRelease(
    command: UninstallSkillReleaseCommand,
  ): Promise<SkillLifecycleMutationReceipt>;
  querySkillOperation(query: QuerySkillOperation): Promise<SkillOperation>;
}>;

/**
 * ArchivePart is transport-owned (for example Browser File/FormData). Archive bytes are not
 * represented by the shared JSON contract and must not be copied into safe projections.
 */
export type AdminSkillLifecycleApiV1Alpha1<ArchivePart> = Readonly<{
  listSkillSubmissions(query: ListSkillSubmissionsQuery): Promise<SkillSubmissionPage>;
  getSkillSubmission(query: GetSkillSubmissionQuery): Promise<SkillSubmissionDetail>;
  approveSkillSubmission(
    command: ApproveSkillSubmissionCommand,
  ): Promise<SkillLifecycleMutationReceipt>;
  rejectSkillSubmission(
    command: RejectSkillSubmissionCommand,
  ): Promise<SkillLifecycleMutationReceipt>;
  uploadEnterpriseSkillPackage(
    command: UploadEnterpriseSkillPackageCommand,
    archive: ArchivePart,
  ): Promise<SkillLifecycleMutationReceipt>;
  getEnterpriseSkillDraft(query: GetEnterpriseSkillDraftQuery): Promise<EnterpriseSkillDraft>;
  updateEnterpriseSkillDraftMetadata(
    command: UpdateEnterpriseSkillDraftMetadataCommand,
  ): Promise<SkillLifecycleMutationReceipt>;
  startEnterpriseSkillDraftTest(
    command: StartEnterpriseSkillDraftTestCommand,
  ): Promise<SkillLifecycleMutationReceipt>;
  queryEnterpriseSkillDraftTest(query: QueryEnterpriseSkillDraftTest): Promise<SkillOperation>;
  publishEnterpriseSkillDraft(
    command: PublishEnterpriseSkillDraftCommand,
  ): Promise<SkillLifecycleMutationReceipt>;
}>;

function validateInstallationIdentity(
  value: Readonly<{ installed: boolean; installationRevision?: string | undefined }>,
  context: z.RefinementCtx,
): void {
  if (value.installed !== (value.installationRevision !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["installationRevision"],
      message: "installed Skills require one exact installation revision",
    });
  }
}
