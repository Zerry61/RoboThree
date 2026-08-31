import { z } from "zod";

import { EntityIdSchema } from "../../common/identifiers.js";
import { TimestampSchema } from "../../common/time.js";
import { DesktopResourceIdSchema } from "../../desktop-local/v1alpha1/common.js";
import { Sha256DigestSchema } from "../../persistence/common.js";
import {
  AgentDefinitionRevisionV1Alpha2Schema,
  AgentKnowledgeRestrictionRefV1Alpha2Schema,
  AgentModelRestrictionRefV1Alpha2Schema,
  AgentSkillRestrictionRefV1Alpha2Schema,
  AgentToolRestrictionRefV1Alpha2Schema,
} from "../../runtime-selection/agent-definition/v1alpha2/index.js";

export const AGENT_LIFECYCLE_CONTRACT_VERSION = "agent-lifecycle.v1alpha1" as const;
export const AgentLifecycleContractVersionSchema = z.literal(
  AGENT_LIFECYCLE_CONTRACT_VERSION,
);

export const AgentLifecycleRobotIdSchema = DesktopResourceIdSchema.refine(
  (value) => value.startsWith("agent."),
  "robot ID must use the agent namespace",
);
export const AgentLifecycleRevisionSchema = Sha256DigestSchema;
export const AgentLifecycleDisplayNameSchema = z.string().trim().min(1).max(128);
export const AgentLifecycleDescriptionSchema = z.string().trim().min(1).max(4096);
export const AgentLifecycleBehaviorRulesSchema = z.string().trim().min(1).max(128 * 1024);
export const AgentLifecycleTagSchema = z.string().trim().min(1).max(48);
export const AgentLifecycleSafeReasonSchema = z.string().trim().min(1).max(1000);

export const AgentLifecycleCommandMetadataSchema = z.object({
  contractVersion: AgentLifecycleContractVersionSchema,
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
}).strict();

export const AgentLifecycleQueryMetadataSchema = z.object({
  contractVersion: AgentLifecycleContractVersionSchema,
  queryId: EntityIdSchema,
  correlationId: EntityIdSchema,
}).strict();

export const ListMyRobotDraftsQuerySchema = AgentLifecycleQueryMetadataSchema.extend({
  kind: z.literal("list_my_robot_drafts"),
}).strict();

export const GetMyRobotDraftQuerySchema = AgentLifecycleQueryMetadataSchema.extend({
  kind: z.literal("get_my_robot_draft"),
  robotId: AgentLifecycleRobotIdSchema,
}).strict();

export const RobotAvatarSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("system"), assetId: z.literal("robot-avatar.default") }).strict(),
  z.object({
    source: z.literal("preset"),
    assetId: DesktopResourceIdSchema.refine((value) => value.startsWith("robot-avatar.")),
  }).strict(),
  z.object({
    source: z.literal("uploaded"),
    assetId: DesktopResourceIdSchema.refine((value) => value.startsWith("robot-avatar.uploaded.")),
    contentDigest: Sha256DigestSchema,
  }).strict(),
]);

/** Bounded transport material used only while creating a server-owned opaque avatar asset. */
export const RobotAvatarUploadSchema = z.object({
  mediaType: z.enum(["image/png", "image/jpeg"]),
  contentBase64: z.string().min(4).max(2_796_204),
}).strict();

function createDraftRestrictionSchema<TReference extends z.ZodType>(reference: TReference) {
  return z.object({
    enabled: z.boolean(),
    selectedReferences: z.array(reference).max(128),
  }).strict();
}

export const RobotDraftModelRestrictionSchema = createDraftRestrictionSchema(
  AgentModelRestrictionRefV1Alpha2Schema,
);
export const RobotDraftSkillRestrictionSchema = createDraftRestrictionSchema(
  AgentSkillRestrictionRefV1Alpha2Schema,
);
export const RobotDraftToolRestrictionSchema = createDraftRestrictionSchema(
  AgentToolRestrictionRefV1Alpha2Schema,
);
export const RobotDraftKnowledgeRestrictionSchema = createDraftRestrictionSchema(
  AgentKnowledgeRestrictionRefV1Alpha2Schema,
);

export const RobotDraftMaterialSchema = z.object({
  robotId: AgentLifecycleRobotIdSchema,
  name: AgentLifecycleDisplayNameSchema,
  description: z.string().trim().max(4096).optional(),
  behaviorRules: z.string().trim().max(128 * 1024).optional(),
  avatar: RobotAvatarSchema,
  tags: z.array(AgentLifecycleTagSchema).max(12),
  modelRestriction: RobotDraftModelRestrictionSchema,
  skillRestriction: RobotDraftSkillRestrictionSchema,
  toolRestriction: RobotDraftToolRestrictionSchema,
  knowledgeRestriction: RobotDraftKnowledgeRestrictionSchema,
}).strict();

export const RobotDraftTestStateSchema = z.enum([
  "untested",
  "running",
  "passed",
  "failed",
  "stale",
]);
export const RobotSubmissionStateSchema = z.enum([
  "pending_review",
  "approved",
  "rejected",
  "withdrawn",
]);

export const RobotDraftTestFactSchema = z.object({
  draftRevision: AgentLifecycleRevisionSchema,
  state: RobotDraftTestStateSchema,
  taskId: DesktopResourceIdSchema.optional(),
  testedAt: TimestampSchema.optional(),
  safeReason: AgentLifecycleSafeReasonSchema.optional(),
}).strict().superRefine((value, context) => {
  const terminal = value.state === "passed" || value.state === "failed";
  if (terminal && (value.taskId === undefined || value.testedAt === undefined)) {
    context.addIssue({ code: "custom", message: "terminal test facts require task and time" });
  }
  if (value.state === "failed" && value.safeReason === undefined) {
    context.addIssue({ code: "custom", path: ["safeReason"], message: "failed tests require a safe reason" });
  }
  if (value.state === "passed" && value.safeReason !== undefined) {
    context.addIssue({ code: "custom", path: ["safeReason"], message: "passed tests cannot include a failure reason" });
  }
});

export const RobotDraftSummarySchema = z.object({
  robotId: AgentLifecycleRobotIdSchema,
  draftRevision: AgentLifecycleRevisionSchema,
  instructionRevision: AgentLifecycleRevisionSchema,
  name: AgentLifecycleDisplayNameSchema,
  description: z.string().max(4096).optional(),
  avatar: RobotAvatarSchema,
  tags: z.array(AgentLifecycleTagSchema).max(12),
  testState: RobotDraftTestStateSchema,
  submissionState: RobotSubmissionStateSchema.optional(),
  updatedAt: TimestampSchema,
}).strict();

export const RobotDraftDetailSchema = RobotDraftSummarySchema.extend({
  material: RobotDraftMaterialSchema,
  testFact: RobotDraftTestFactSchema.optional(),
  rejectionReason: AgentLifecycleSafeReasonSchema.optional(),
}).strict();

export const RobotDraftPageSchema = z.object({
  contractVersion: AgentLifecycleContractVersionSchema,
  queryRevision: AgentLifecycleRevisionSchema,
  items: z.array(RobotDraftSummarySchema).max(100),
}).strict();

export const CreateRobotDraftCommandSchema = AgentLifecycleCommandMetadataSchema.extend({
  kind: z.literal("create_robot_draft"),
  material: RobotDraftMaterialSchema,
  avatarUpload: RobotAvatarUploadSchema.optional(),
}).strict();

export const UpdateRobotDraftCommandSchema = AgentLifecycleCommandMetadataSchema.extend({
  kind: z.literal("update_robot_draft"),
  robotId: AgentLifecycleRobotIdSchema,
  expectedDraftRevision: AgentLifecycleRevisionSchema,
  material: RobotDraftMaterialSchema,
  avatarUpload: RobotAvatarUploadSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.robotId !== value.material.robotId) {
    context.addIssue({ code: "custom", path: ["material", "robotId"], message: "robot IDs must match" });
  }
});

export const StartRobotDraftTestCommandSchema = AgentLifecycleCommandMetadataSchema.extend({
  kind: z.literal("start_robot_draft_test"),
  robotId: AgentLifecycleRobotIdSchema,
  expectedDraftRevision: AgentLifecycleRevisionSchema,
  testInput: z.string().trim().min(1).max(64 * 1024),
}).strict();

/** Core-private command after the existing Task pipeline has allocated a real Task. */
export const BeginRobotDraftTestCommandSchema = AgentLifecycleCommandMetadataSchema.extend({
  kind: z.literal("begin_robot_draft_test"),
  robotId: AgentLifecycleRobotIdSchema,
  expectedDraftRevision: AgentLifecycleRevisionSchema,
  taskId: DesktopResourceIdSchema,
}).strict();

/** Core-private, content-free terminal callback. Test input/output never crosses this boundary. */
export const CompleteRobotDraftTestCommandSchema = AgentLifecycleCommandMetadataSchema.extend({
  kind: z.literal("complete_robot_draft_test"),
  robotId: AgentLifecycleRobotIdSchema,
  expectedDraftRevision: AgentLifecycleRevisionSchema,
  taskId: DesktopResourceIdSchema,
  result: z.enum(["passed", "failed"]),
  safeReason: AgentLifecycleSafeReasonSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.result === "failed" && value.safeReason === undefined) {
    context.addIssue({ code: "custom", path: ["safeReason"], message: "failed tests require a safe reason" });
  }
  if (value.result === "passed" && value.safeReason !== undefined) {
    context.addIssue({ code: "custom", path: ["safeReason"], message: "passed tests cannot include a failure reason" });
  }
});

export const SubmitRobotDraftCommandSchema = AgentLifecycleCommandMetadataSchema.extend({
  kind: z.literal("submit_robot_draft"),
  robotId: AgentLifecycleRobotIdSchema,
  expectedDraftRevision: AgentLifecycleRevisionSchema,
  semanticVersion: z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u),
  changeSummary: z.string().trim().min(1).max(2000),
  publicationScope: z.literal("enterprise"),
}).strict();

export const WithdrawRobotSubmissionCommandSchema = AgentLifecycleCommandMetadataSchema.extend({
  kind: z.literal("withdraw_robot_submission"),
  robotId: AgentLifecycleRobotIdSchema,
  submissionId: EntityIdSchema,
  expectedSubmissionRevision: AgentLifecycleRevisionSchema,
}).strict();

export const AgentPackageSchema = z.object({
  robotId: AgentLifecycleRobotIdSchema,
  draftRevision: AgentLifecycleRevisionSchema,
  packageRevision: AgentLifecycleRevisionSchema,
  packageDigest: AgentLifecycleRevisionSchema,
  origin: z.literal("personal_draft"),
  name: AgentLifecycleDisplayNameSchema,
  description: AgentLifecycleDescriptionSchema,
  behaviorRules: AgentLifecycleBehaviorRulesSchema,
  avatar: RobotAvatarSchema,
  tags: z.array(AgentLifecycleTagSchema).max(12),
  agentDefinition: AgentDefinitionRevisionV1Alpha2Schema,
  publicationScope: z.literal("enterprise"),
  semanticVersion: z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u),
  changeSummary: z.string().trim().min(1).max(2000),
  createdAt: TimestampSchema,
  submittedAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  if (value.packageRevision !== value.packageDigest) {
    context.addIssue({ code: "custom", message: "package revision and digest must match" });
  }
  if (value.robotId !== value.agentDefinition.agentDefinitionId) {
    context.addIssue({ code: "custom", path: ["agentDefinition", "agentDefinitionId"], message: "agent IDs must match" });
  }
});

export const RobotReviewSummarySchema = z.object({
  submissionId: EntityIdSchema,
  submissionRevision: AgentLifecycleRevisionSchema,
  robotId: AgentLifecycleRobotIdSchema,
  name: AgentLifecycleDisplayNameSchema,
  creatorDisplayName: z.string().trim().min(1).max(256),
  state: RobotSubmissionStateSchema,
  semanticVersion: z.string(),
  submittedAt: TimestampSchema,
  reviewedAt: TimestampSchema.optional(),
}).strict();

export const RobotReviewDetailSchema = RobotReviewSummarySchema.extend({
  agentPackage: AgentPackageSchema,
  rejectionReason: AgentLifecycleSafeReasonSchema.optional(),
}).strict();

export const RobotReviewPageSchema = z.object({
  contractVersion: AgentLifecycleContractVersionSchema,
  queryRevision: AgentLifecycleRevisionSchema,
  items: z.array(RobotReviewSummarySchema).max(100),
}).strict();

export const ListRobotReviewsQuerySchema = AgentLifecycleQueryMetadataSchema.extend({
  kind: z.literal("list_robot_reviews"),
  state: RobotSubmissionStateSchema.optional(),
}).strict();

export const GetRobotReviewQuerySchema = AgentLifecycleQueryMetadataSchema.extend({
  kind: z.literal("get_robot_review"),
  submissionId: EntityIdSchema,
}).strict();

export const PublishedRobotReleaseSchema = z.object({
  robotId: AgentLifecycleRobotIdSchema,
  releaseRevision: AgentLifecycleRevisionSchema,
  packageDigest: AgentLifecycleRevisionSchema,
  agentPackage: AgentPackageSchema,
  publishedAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  if (value.robotId !== value.agentPackage.robotId
    || value.packageDigest !== value.agentPackage.packageDigest) {
    context.addIssue({ code: "custom", message: "published release identity must match its package" });
  }
});

export const PublishedRobotReleasePageSchema = z.object({
  contractVersion: AgentLifecycleContractVersionSchema,
  queryRevision: AgentLifecycleRevisionSchema,
  items: z.array(PublishedRobotReleaseSchema).max(500),
}).strict();

export const ApproveRobotReviewCommandSchema = AgentLifecycleCommandMetadataSchema.extend({
  kind: z.literal("approve_robot_review"),
  submissionId: EntityIdSchema,
  expectedSubmissionRevision: AgentLifecycleRevisionSchema,
}).strict();

export const RejectRobotReviewCommandSchema = AgentLifecycleCommandMetadataSchema.extend({
  kind: z.literal("reject_robot_review"),
  submissionId: EntityIdSchema,
  expectedSubmissionRevision: AgentLifecycleRevisionSchema,
  reason: AgentLifecycleSafeReasonSchema,
}).strict();

export const RobotLifecycleMutationReceiptSchema = z.object({
  commandId: EntityIdSchema,
  correlationId: EntityIdSchema,
  robotId: AgentLifecycleRobotIdSchema,
  currentRevision: AgentLifecycleRevisionSchema,
  state: z.enum(["draft_saved", "test_started", "submitted", "withdrawn", "approved", "rejected"]),
  sessionId: DesktopResourceIdSchema.optional(),
  taskId: DesktopResourceIdSchema.optional(),
}).strict().superRefine((value, context) => {
  const hasTaskLocation = value.sessionId !== undefined || value.taskId !== undefined;
  if (hasTaskLocation
    && (value.state !== "test_started"
      || value.sessionId === undefined
      || value.taskId === undefined)) {
    context.addIssue({
      code: "custom",
      message: "test task location requires a complete test_started receipt",
    });
  }
});

export const AgentLifecycleErrorCodeSchema = z.enum([
  "agentlifecycle.invalid_request",
  "agentlifecycle.unauthorized",
  "agentlifecycle.not_found",
  "agentlifecycle.revision_conflict",
  "agentlifecycle.robot_id_reserved",
  "agentlifecycle.draft_incomplete",
  "agentlifecycle.test_required",
  "agentlifecycle.resource_unavailable",
  "agentlifecycle.submission_conflict",
  "agentlifecycle.avatar_invalid",
  "agentlifecycle.service_unavailable",
]);

export const AgentLifecycleSafeErrorSchema = z.object({
  contractVersion: AgentLifecycleContractVersionSchema,
  errorCode: AgentLifecycleErrorCodeSchema,
  safeSummary: z.string().trim().min(1).max(512),
  correlationId: EntityIdSchema,
}).strict();

export type RobotDraftMaterial = z.infer<typeof RobotDraftMaterialSchema>;
export type ListMyRobotDraftsQuery = z.infer<typeof ListMyRobotDraftsQuerySchema>;
export type GetMyRobotDraftQuery = z.infer<typeof GetMyRobotDraftQuerySchema>;
export type RobotDraftSummary = z.infer<typeof RobotDraftSummarySchema>;
export type RobotDraftDetail = z.infer<typeof RobotDraftDetailSchema>;
export type RobotDraftPage = z.infer<typeof RobotDraftPageSchema>;
export type CreateRobotDraftCommand = z.infer<typeof CreateRobotDraftCommandSchema>;
export type UpdateRobotDraftCommand = z.infer<typeof UpdateRobotDraftCommandSchema>;
export type StartRobotDraftTestCommand = z.infer<typeof StartRobotDraftTestCommandSchema>;
export type BeginRobotDraftTestCommand = z.infer<typeof BeginRobotDraftTestCommandSchema>;
export type CompleteRobotDraftTestCommand = z.infer<typeof CompleteRobotDraftTestCommandSchema>;
export type SubmitRobotDraftCommand = z.infer<typeof SubmitRobotDraftCommandSchema>;
export type WithdrawRobotSubmissionCommand = z.infer<typeof WithdrawRobotSubmissionCommandSchema>;
export type AgentPackage = z.infer<typeof AgentPackageSchema>;
export type RobotReviewSummary = z.infer<typeof RobotReviewSummarySchema>;
export type RobotReviewDetail = z.infer<typeof RobotReviewDetailSchema>;
export type RobotReviewPage = z.infer<typeof RobotReviewPageSchema>;
export type PublishedRobotRelease = z.infer<typeof PublishedRobotReleaseSchema>;
export type PublishedRobotReleasePage = z.infer<typeof PublishedRobotReleasePageSchema>;
export type ApproveRobotReviewCommand = z.infer<typeof ApproveRobotReviewCommandSchema>;
export type RejectRobotReviewCommand = z.infer<typeof RejectRobotReviewCommandSchema>;
export type RobotLifecycleMutationReceipt = z.infer<typeof RobotLifecycleMutationReceiptSchema>;
export type AgentLifecycleErrorCode = z.infer<typeof AgentLifecycleErrorCodeSchema>;
export type AgentLifecycleSafeError = z.infer<typeof AgentLifecycleSafeErrorSchema>;
