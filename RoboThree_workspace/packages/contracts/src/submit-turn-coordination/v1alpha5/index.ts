import { z } from "zod";

import { RuntimeErrorSchema } from "../../common/runtime-error.js";
import { TimestampSchema } from "../../common/time.js";
import { Sha256DigestSchema } from "../../persistence/common.js";
import { SubmitTurnReceiptV1Alpha5Schema, TaskSelectionRequestV1Alpha5Schema } from
  "../../desktop-local/v1alpha5/submit-turn.js";
import { ReasoningModeLockV1Alpha2Schema,
  ReasoningResolutionEvidenceRefV1Alpha2Schema } from
  "../../reasoning-mode/v1alpha2/index.js";
import { PersistedSubmitTurnReceiptSchema, SubmitTurnRecordSchema } from "../v1alpha1.js";
import { PersistedSubmitTurnReceiptV1Alpha2Schema, SubmitTurnRecordV1Alpha2Schema } from
  "../v1alpha2.js";
import { PersistedSubmitTurnReceiptV1Alpha3Schema, SubmitTurnRecordV1Alpha3Schema } from
  "../v1alpha3.js";
import {
  SubmitTurnRecordV1Alpha4Schema,
  SubmitTurnResourcePlanV1Alpha4Schema,
} from "../v1alpha4/index.js";

export const SUBMIT_TURN_COORDINATION_SCHEMA_VERSION_V1ALPHA5 = "v1alpha5" as const;

const DigestRefSchema = z.object({
  revision: Sha256DigestSchema,
  digest: Sha256DigestSchema,
}).strict();

const ExactDigestRefSchema = DigestRefSchema.superRefine((value, context) => {
  if (value.revision !== value.digest) {
    context.addIssue({ code: "custom", message: "revision and digest must match" });
  }
});

export const SafeReasoningAdmissionEvidenceV1Alpha5Schema = z.discriminatedUnion(
  "state",
  [
    z.object({ state: z.literal("not_required") }).strict(),
    z.object({
      state: z.literal("admitted"),
      policyRef: ExactDigestRefSchema,
      profileRef: ExactDigestRefSchema,
      strategyRef: DigestRefSchema,
      mappingRef: ExactDigestRefSchema,
      materializationDigest: Sha256DigestSchema,
      manifestRef: ExactDigestRefSchema,
    }).strict(),
    z.object({
      state: z.literal("unavailable"),
      ...ReasoningResolutionEvidenceRefV1Alpha2Schema.shape,
      safeCause: z.enum([
        "provider_release.policy_unavailable",
        "provider_release.policy_not_admitted",
      ]),
    }).strict(),
  ],
);

export const SubmitTurnReasoningPlanV1Alpha5Schema = z.object({
  reasoningModeLock: ReasoningModeLockV1Alpha2Schema,
  plannedRuntimeSelectionDigest: Sha256DigestSchema,
  resolutionEvidence: ReasoningResolutionEvidenceRefV1Alpha2Schema.optional(),
  admissionEvidence: SafeReasoningAdmissionEvidenceV1Alpha5Schema,
}).strict().superRefine((value, context) => {
  const lock = value.reasoningModeLock;
  const fallback = lock.resolution === "max_support_changed_default"
    || lock.resolution === "max_mapping_unavailable_default";
  if (fallback !== (value.resolutionEvidence !== undefined)) {
    context.addIssue({ code: "custom", path: ["resolutionEvidence"],
      message: "only new fallback locks require resolution evidence" });
  }
  if (fallback && value.resolutionEvidence !== undefined
    && (lock.resolutionEvidenceRevision
      !== value.resolutionEvidence.resolutionEvidenceRevision
      || lock.resolutionEvidenceDigest
        !== value.resolutionEvidence.resolutionEvidenceDigest)) {
    context.addIssue({ code: "custom", path: ["resolutionEvidence"],
      message: "reasoning plan must bind exact lock resolution evidence" });
  }
  if ((lock.resolution === "max_applied") !== (value.admissionEvidence.state === "admitted")) {
    context.addIssue({ code: "custom", path: ["admissionEvidence"],
      message: "only max_applied requires admitted evidence" });
  }
  if ((lock.resolution === "max_mapping_unavailable_default")
    !== (value.admissionEvidence.state === "unavailable")) {
    context.addIssue({ code: "custom", path: ["admissionEvidence"],
      message: "only mapping unavailable fallback requires unavailable evidence" });
  }
});

export const SubmitTurnResourcePlanV1Alpha5Schema = z.object({
  ...SubmitTurnResourcePlanV1Alpha4Schema.shape,
  reasoningResolutionEvidenceDigest: Sha256DigestSchema.optional(),
  admissionMaterializationDigest: Sha256DigestSchema.optional(),
}).strict();

export const SubmitTurnRecordV1Alpha5Schema = z.object({
  ...SubmitTurnRecordV1Alpha4Schema.shape,
  schemaVersion: z.literal(SUBMIT_TURN_COORDINATION_SCHEMA_VERSION_V1ALPHA5),
  transportContractVersion: z.literal("v1alpha5"),
  selectionRequest: TaskSelectionRequestV1Alpha5Schema,
  reasoningPlan: SubmitTurnReasoningPlanV1Alpha5Schema,
  resourcePlan: SubmitTurnResourcePlanV1Alpha5Schema,
}).strict().superRefine((value, context) => {
  const lock = value.reasoningPlan.reasoningModeLock;
  if (lock.taskId !== value.internalTaskId
    || value.reasoningPlan.plannedRuntimeSelectionDigest !== value.plannedSelectionDigest
    || value.resourcePlan.plannedRuntimeSelectionDigest !== value.plannedSelectionDigest
    || value.resourcePlan.reasoningModeLockId !== lock.reasoningModeLockId) {
    context.addIssue({ code: "custom", message: "v1alpha5 plan identities must match" });
  }
  const request = value.selectionRequest.reasoningPreference;
  if (request.requestedMode !== lock.requestedMode
    || (request.requestedMode === "max" && lock.requestedMode === "max"
      && (request.observedMaxSupport !== lock.observedMaxSupport
        || request.observedMaxSupportRevision !== lock.observedMaxSupportRevision))) {
    context.addIssue({ code: "custom", path: ["reasoningPlan"],
      message: "reasoning plan must bind the exact request observation" });
  }
  const evidence = value.reasoningPlan.resolutionEvidence;
  if ((evidence?.resolutionEvidenceDigest)
    !== value.resourcePlan.reasoningResolutionEvidenceDigest) {
    context.addIssue({ code: "custom", path: ["resourcePlan"],
      message: "resource plan must bind exact resolution evidence" });
  }
  const materialization = value.reasoningPlan.admissionEvidence.state === "admitted"
    ? value.reasoningPlan.admissionEvidence.materializationDigest
    : undefined;
  if (materialization !== value.resourcePlan.admissionMaterializationDigest) {
    context.addIssue({ code: "custom", path: ["resourcePlan"],
      message: "resource plan must bind exact admission materialization" });
  }
  if ((value.status === "failed_terminal") !== (value.lastFailure !== undefined)) {
    context.addIssue({ code: "custom", path: ["lastFailure"],
      message: "only failed_terminal requires lastFailure" });
  }
  if (value.loopStartedAt !== undefined && value.status !== "completed") {
    context.addIssue({ code: "custom", path: ["loopStartedAt"],
      message: "only completed records may mark loop started" });
  }
});

export const ReadableSubmitTurnRecordV1Alpha5Schema = z.union([
  SubmitTurnRecordSchema,
  SubmitTurnRecordV1Alpha2Schema,
  SubmitTurnRecordV1Alpha3Schema,
  SubmitTurnRecordV1Alpha4Schema,
  SubmitTurnRecordV1Alpha5Schema,
]);

export const PersistedSubmitTurnReceiptV1Alpha5Schema =
  SubmitTurnReceiptV1Alpha5Schema.extend({
    requestDigest: Sha256DigestSchema,
    completedAt: TimestampSchema,
    terminalError: RuntimeErrorSchema.optional(),
  }).strict().superRefine((value, context) => {
    if ((value.status === "rejected") !== (value.terminalError !== undefined)) {
      context.addIssue({ code: "custom", path: ["terminalError"],
        message: "only rejected receipts require terminalError" });
    }
  });

export const ReadablePersistedSubmitTurnReceiptV1Alpha5Schema = z.union([
  PersistedSubmitTurnReceiptSchema,
  PersistedSubmitTurnReceiptV1Alpha2Schema,
  PersistedSubmitTurnReceiptV1Alpha3Schema,
  PersistedSubmitTurnReceiptV1Alpha5Schema,
]);

export type SafeReasoningAdmissionEvidenceV1Alpha5 = z.infer<
  typeof SafeReasoningAdmissionEvidenceV1Alpha5Schema
>;
export type SubmitTurnRecordV1Alpha5 = z.infer<typeof SubmitTurnRecordV1Alpha5Schema>;
export type ReadableSubmitTurnRecordV1Alpha5 = z.infer<
  typeof ReadableSubmitTurnRecordV1Alpha5Schema
>;
export type PersistedSubmitTurnReceiptV1Alpha5 = z.infer<
  typeof PersistedSubmitTurnReceiptV1Alpha5Schema
>;
export type ReadablePersistedSubmitTurnReceiptV1Alpha5 = z.infer<
  typeof ReadablePersistedSubmitTurnReceiptV1Alpha5Schema
>;
