import {
  JsonValueSchema,
  Sha256DigestSchema,
  TaskSubmitTurnBindingSchema,
  type TaskSubmitTurnBinding,
} from "@robothree/contracts";
import {
  TaskRuntimeSelectionV1Alpha4Schema,
} from "@robothree/contracts/runtime-selection/v1alpha4";
import {
  SafeReasoningAdmissionEvidenceV1Alpha5Schema,
  ReadableSubmitTurnRecordV1Alpha5Schema,
  SubmitTurnRecordV1Alpha5Schema,
  type SafeReasoningAdmissionEvidenceV1Alpha5,
  type SubmitTurnRecordV1Alpha5,
} from "@robothree/contracts/submit-turn-coordination/v1alpha5";
import { z } from "zod";

import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  TaskInstructionBindingV1Schema,
  validateTaskInstructionBindingV1,
  type TaskInstructionBindingV1,
} from "./instruction-bundle-domain.js";
import {
  ReasoningResolutionEvidenceV1Schema,
  validateReasoningModeLockV1Alpha2,
  validateReasoningResolutionEvidenceV1,
  type ReasoningResolutionEvidenceV1,
} from "./reasoning-mode-lock-v1alpha2-domain.js";
import { hasValidTaskRuntimeSelectionV1Alpha4 } from
  "./runtime-selection-revisions.js";

export const DFI541_ACCEPTANCE_PLAN_DIGEST_DOMAIN =
  "robothree.dfi541-durable-acceptance-plan.v1\n" as const;
export const DFI541_COORDINATION_ENVELOPE_DIGEST_DOMAIN =
  "robothree.dfi541-coordination-envelope.v1\n" as const;
export const DFI541_TASK_BUNDLE_ENVELOPE_DIGEST_DOMAIN =
  "robothree.dfi541-task-bundle-envelope.v1\n" as const;

const DurableDfi541AcceptancePlanMaterialSchema = z.object({
  schemaVersion: z.literal("v1"),
  submitTurnCommandId: z.string().min(1).max(256),
  internalTaskId: z.string().min(1).max(256),
  userMessageId: z.string().min(1).max(256),
  requestDigest: Sha256DigestSchema,
  runtimeSelection: TaskRuntimeSelectionV1Alpha4Schema,
  taskInstructionBinding: TaskInstructionBindingV1Schema,
  resolutionEvidence: ReasoningResolutionEvidenceV1Schema.optional(),
  admissionEvidence: SafeReasoningAdmissionEvidenceV1Alpha5Schema,
  // Additive Core-private recovery material. Historical DFI-5.4.1 envelopes
  // omit it and therefore retain their exact digest. The production handler
  // requires it before accepting a new v1alpha5 command so accepted/message
  // recovery never rereads current selection authorities.
  recoveryMaterial: JsonValueSchema.optional(),
  invocationDeadlineAt: z.string().datetime({ offset: true }),
  acceptedAt: z.string().datetime({ offset: true }),
}).strict();

export const DurableDfi541AcceptancePlanV1Schema = z.object({
  ...DurableDfi541AcceptancePlanMaterialSchema.shape,
  planDigest: Sha256DigestSchema,
}).strict();

export const PersistedDfi541CoordinationEnvelopeV1Schema = z.object({
  schemaVersion: z.literal("dfi541_coordination_envelope_v1"),
  record: SubmitTurnRecordV1Alpha5Schema,
  acceptedPlan: DurableDfi541AcceptancePlanV1Schema,
  envelopeDigest: Sha256DigestSchema,
}).strict();

export const PersistedDfi541TaskBundleEnvelopeV1Schema = z.object({
  schemaVersion: z.literal("dfi541_task_bundle_envelope_v1"),
  submitTurnBinding: TaskSubmitTurnBindingSchema,
  taskInstructionBinding: TaskInstructionBindingV1Schema,
  resolutionEvidence: ReasoningResolutionEvidenceV1Schema.optional(),
  admissionEvidence: SafeReasoningAdmissionEvidenceV1Alpha5Schema,
  envelopeDigest: Sha256DigestSchema,
}).strict();

export type DurableDfi541AcceptancePlanV1 = z.infer<
  typeof DurableDfi541AcceptancePlanV1Schema
>;
export type PersistedDfi541CoordinationEnvelopeV1 = z.infer<
  typeof PersistedDfi541CoordinationEnvelopeV1Schema
>;
export type PersistedDfi541TaskBundleEnvelopeV1 = z.infer<
  typeof PersistedDfi541TaskBundleEnvelopeV1Schema
>;

export function createDurableDfi541AcceptancePlanV1(
  input: z.input<typeof DurableDfi541AcceptancePlanMaterialSchema>,
): DurableDfi541AcceptancePlanV1 {
  const material = DurableDfi541AcceptancePlanMaterialSchema.parse(input);
  validatePlanFacts(material);
  return Object.freeze(DurableDfi541AcceptancePlanV1Schema.parse({
    ...material,
    planDigest: digest(DFI541_ACCEPTANCE_PLAN_DIGEST_DOMAIN, material),
  }));
}

export function validateDurableDfi541AcceptancePlanV1(
  input: DurableDfi541AcceptancePlanV1,
): DurableDfi541AcceptancePlanV1 {
  const parsed = DurableDfi541AcceptancePlanV1Schema.parse(input);
  const { planDigest, ...material } = parsed;
  if (planDigest !== digest(DFI541_ACCEPTANCE_PLAN_DIGEST_DOMAIN, material)) {
    throw new Error("DFI-5.4.1 acceptance plan digest is invalid");
  }
  validatePlanFacts(material);
  return parsed;
}

export function createDfi541CoordinationEnvelopeV1(input: Readonly<{
  record: SubmitTurnRecordV1Alpha5;
  acceptedPlan: DurableDfi541AcceptancePlanV1;
}>): PersistedDfi541CoordinationEnvelopeV1 {
  const record = SubmitTurnRecordV1Alpha5Schema.parse(input.record);
  const acceptedPlan = validateDurableDfi541AcceptancePlanV1(input.acceptedPlan);
  validateRecordAgainstPlan(record, acceptedPlan);
  const material = {
    schemaVersion: "dfi541_coordination_envelope_v1" as const,
    record,
    acceptedPlan,
  };
  return Object.freeze(PersistedDfi541CoordinationEnvelopeV1Schema.parse({
    ...material,
    envelopeDigest: digest(DFI541_COORDINATION_ENVELOPE_DIGEST_DOMAIN, material),
  }));
}

export function validateDfi541CoordinationEnvelopeV1(
  input: PersistedDfi541CoordinationEnvelopeV1,
): PersistedDfi541CoordinationEnvelopeV1 {
  const parsed = PersistedDfi541CoordinationEnvelopeV1Schema.parse(input);
  const { envelopeDigest, ...material } = parsed;
  if (envelopeDigest !== digest(DFI541_COORDINATION_ENVELOPE_DIGEST_DOMAIN,
    material)) {
    throw new Error("DFI-5.4.1 coordination envelope digest is invalid");
  }
  validateDurableDfi541AcceptancePlanV1(parsed.acceptedPlan);
  validateRecordAgainstPlan(parsed.record, parsed.acceptedPlan);
  return parsed;
}

export function parsePersistedDfi541CoordinationValue(input: unknown): Readonly<{
  record: z.infer<typeof ReadableSubmitTurnRecordV1Alpha5Schema>;
  envelope?: PersistedDfi541CoordinationEnvelopeV1;
}> {
  if (typeof input === "object" && input !== null
    && Reflect.get(input, "schemaVersion") === "dfi541_coordination_envelope_v1") {
    const envelope = validateDfi541CoordinationEnvelopeV1(
      PersistedDfi541CoordinationEnvelopeV1Schema.parse(input),
    );
    return { record: envelope.record, envelope };
  }
  const record = ReadableSubmitTurnRecordV1Alpha5Schema.parse(input);
  if (record.schemaVersion === "v1alpha5") {
    throw new Error("DFI-5.4.1 coordination record is missing its durable envelope");
  }
  return { record };
}

export function createDfi541TaskBundleEnvelopeV1(input: Readonly<{
  submitTurnBinding: TaskSubmitTurnBinding;
  taskInstructionBinding: TaskInstructionBindingV1;
  resolutionEvidence?: ReasoningResolutionEvidenceV1;
  admissionEvidence: SafeReasoningAdmissionEvidenceV1Alpha5;
}>): PersistedDfi541TaskBundleEnvelopeV1 {
  const submitTurnBinding = TaskSubmitTurnBindingSchema.parse(input.submitTurnBinding);
  const taskInstructionBinding = validateTaskInstructionBindingV1(
    input.taskInstructionBinding,
  );
  const resolutionEvidence = input.resolutionEvidence === undefined
    ? undefined
    : validateReasoningResolutionEvidenceV1(input.resolutionEvidence);
  const admissionEvidence = SafeReasoningAdmissionEvidenceV1Alpha5Schema.parse(
    input.admissionEvidence,
  );
  if (taskInstructionBinding.taskId !== submitTurnBinding.taskId
    || taskInstructionBinding.runtimeSelectionId
      !== submitTurnBinding.runtimeSelectionId
    || taskInstructionBinding.submitTurnBundleDigest !== submitTurnBinding.bundleDigest) {
    throw new Error("DFI-5.4.1 Task bundle bindings are inconsistent");
  }
  const material = {
    schemaVersion: "dfi541_task_bundle_envelope_v1" as const,
    submitTurnBinding,
    taskInstructionBinding,
    ...(resolutionEvidence === undefined ? {} : { resolutionEvidence }),
    admissionEvidence,
  };
  return Object.freeze(PersistedDfi541TaskBundleEnvelopeV1Schema.parse({
    ...material,
    envelopeDigest: digest(DFI541_TASK_BUNDLE_ENVELOPE_DIGEST_DOMAIN, material),
  }));
}

export function validateDfi541TaskBundleEnvelopeV1(
  input: PersistedDfi541TaskBundleEnvelopeV1,
): PersistedDfi541TaskBundleEnvelopeV1 {
  const parsed = PersistedDfi541TaskBundleEnvelopeV1Schema.parse(input);
  const { envelopeDigest, ...material } = parsed;
  if (envelopeDigest !== digest(DFI541_TASK_BUNDLE_ENVELOPE_DIGEST_DOMAIN,
    material)) {
    throw new Error("DFI-5.4.1 Task bundle envelope digest is invalid");
  }
  return createDfi541TaskBundleEnvelopeV1({
    submitTurnBinding: material.submitTurnBinding,
    taskInstructionBinding: material.taskInstructionBinding,
    admissionEvidence: material.admissionEvidence,
    ...(material.resolutionEvidence === undefined
      ? {}
      : { resolutionEvidence: material.resolutionEvidence }),
  });
}

function validatePlanFacts(
  plan: z.infer<typeof DurableDfi541AcceptancePlanMaterialSchema>,
): void {
  if (!hasValidTaskRuntimeSelectionV1Alpha4(plan.runtimeSelection)) {
    throw new Error("DFI-5.4.1 Runtime Selection is invalid");
  }
  const lock = plan.runtimeSelection.reasoningModeLock;
  validateReasoningModeLockV1Alpha2(lock, {
    taskId: plan.internalTaskId,
    modelLockRef: plan.runtimeSelection.resolvedModelLock,
    ...(plan.resolutionEvidence === undefined
      ? {}
      : { resolutionEvidence: plan.resolutionEvidence }),
  });
  const admitted = plan.admissionEvidence.state === "admitted";
  if (
    plan.submitTurnCommandId.length === 0
    || plan.internalTaskId !== plan.runtimeSelection.taskId
    || plan.taskInstructionBinding.taskId !== plan.internalTaskId
    || plan.taskInstructionBinding.runtimeSelectionId
      !== plan.runtimeSelection.runtimeSelectionId
    || plan.taskInstructionBinding.runtimeSelectionDigest
      !== plan.runtimeSelection.selectionDigest
    || admitted !== (lock.resolution === "max_applied")
  ) {
    throw new Error("DFI-5.4.1 acceptance plan facts are inconsistent");
  }
}

function validateRecordAgainstPlan(
  record: SubmitTurnRecordV1Alpha5,
  plan: DurableDfi541AcceptancePlanV1,
): void {
  const recordEvidence = record.reasoningPlan.resolutionEvidence;
  if (
    record.submitTurnCommandId !== plan.submitTurnCommandId
    || record.internalTaskId !== plan.internalTaskId
    || record.internalUserMessageId !== plan.userMessageId
    || record.requestDigest !== plan.requestDigest
    || record.plannedSelectionDigest !== plan.runtimeSelection.selectionDigest
    || record.reasoningPlan.reasoningModeLock.reasoningModeLockDigest
      !== plan.runtimeSelection.reasoningModeLock.reasoningModeLockDigest
    || record.reasoningPlan.admissionEvidence.state !== plan.admissionEvidence.state
    || recordEvidence?.resolutionEvidenceDigest
      !== plan.resolutionEvidence?.resolutionEvidenceDigest
  ) {
    throw new Error("DFI-5.4.1 coordination record does not match accepted plan");
  }
}

function digest(domain: string, material: unknown): string {
  return sha256CanonicalJson(JsonValueSchema.parse({ domain, material }));
}
