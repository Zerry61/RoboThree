import {
  JsonValueSchema,
  Sha256DigestSchema,
  TaskAuthorizationSelectionSchema,
  TaskCapabilityLockSchema,
  TaskExecutionSelectionIdentitySchema,
  TaskHeadSchema,
  TaskSubmitTurnBindingSchema,
  type TaskAuthorizationSelection,
  type TaskCapabilityLock,
  type TaskExecutionSelectionIdentity,
  type TaskHead,
  type TaskSubmitTurnBinding,
} from "@robothree/contracts";
import {
  AgentDefinitionManagementClassV1Alpha2Schema,
} from "@robothree/contracts/runtime-selection/agent-definition/v1alpha2";
import {
  TaskRuntimeSelectionV1Alpha3Schema,
  type TaskRuntimeSelectionV1Alpha3,
} from "@robothree/contracts/runtime-selection/v1alpha3";
import {
  ReadableSubmitTurnRecordV1Alpha4Schema,
  SubmitTurnRecordV1Alpha4Schema,
  type ReadableSubmitTurnRecordV1Alpha4,
  type SubmitTurnRecordV1Alpha4,
} from "@robothree/contracts/submit-turn-coordination/v1alpha4";
import { z } from "zod";

import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  AgentResourceDecisionV1Schema,
  hasValidAgentResourceDecisionV1,
  type AgentResourceDecisionV1,
} from "./task-resource-entitlement.js";
import {
  TaskInstructionBindingV1Schema,
  validateTaskInstructionBindingV1,
  type TaskInstructionBindingV1,
} from "./instruction-bundle-domain.js";
import { hasValidTaskRuntimeSelectionV1Alpha3 } from
  "./runtime-selection-revisions.js";
import {
  hasValidTaskAuthorizationSelection,
  hasValidTaskExecutionSelectionIdentity,
} from "./task-authorization-selection-service.js";

export const R2D3_DURABLE_ACCEPTANCE_PLAN_DIGEST_DOMAIN =
  "robothree.r2d3-durable-acceptance-plan.v1\n" as const;
export const R2D3_COORDINATION_ENVELOPE_DIGEST_DOMAIN =
  "robothree.r2d3-coordination-envelope.v1\n" as const;
export const R2D3_TASK_BINDING_ENVELOPE_DIGEST_DOMAIN =
  "robothree.r2d3-task-bundle-binding-envelope.v1\n" as const;

const ExactAgentRefSchema = z.object({
  agentDefinitionId: z.string().min(1).max(256),
  revision: Sha256DigestSchema,
  digest: Sha256DigestSchema,
  managementClass: AgentDefinitionManagementClassV1Alpha2Schema,
}).strict().superRefine((value, context) => {
  if (value.revision !== value.digest) {
    context.addIssue({ code: "custom", message: "Agent revision and digest must match" });
  }
});

const DurableR2D3AcceptancePlanFields = {
  schemaVersion: z.literal("v1"),
  submitTurnCommandId: z.string().min(1).max(256),
  clientTurnId: z.string().min(1).max(256),
  internalSessionId: z.string().min(1).max(256),
  internalTaskId: z.string().min(1).max(256),
  userMessageId: z.string().min(1).max(256),
  initialCheckpointId: z.string().min(1).max(256),
  runtimeSelectionId: z.string().min(1).max(256),
  requestDigest: Sha256DigestSchema,
  selectionRequestDigest: Sha256DigestSchema,
  acceptedClientBindingDigest: Sha256DigestSchema,
  exactAgent: ExactAgentRefSchema,
  resourceEntitlementSnapshotDigest: Sha256DigestSchema,
  agentResourceDecision: AgentResourceDecisionV1Schema,
  capabilityLocks: z.array(TaskCapabilityLockSchema).min(1).max(129),
  runtimeSelection: TaskRuntimeSelectionV1Alpha3Schema,
  authorizationSelection: TaskAuthorizationSelectionSchema,
  executionSelectionIdentity: TaskExecutionSelectionIdentitySchema,
  taskHead: TaskHeadSchema,
  initialTaskStateDigest: Sha256DigestSchema,
  submitTurnBinding: TaskSubmitTurnBindingSchema,
  taskInstructionBinding: TaskInstructionBindingV1Schema,
  acceptanceReceiptIdentity: z.string().min(1).max(256),
  preallocatedDeliveryId: z.string().min(1).max(256),
  acceptedAt: z.string().datetime({ offset: true }),
};

export const DurableR2D3AcceptancePlanMaterialV1Schema = z.object(
  DurableR2D3AcceptancePlanFields,
).strict().superRefine(validatePlanMaterial);

export const DurableR2D3AcceptancePlanV1Schema = z.object({
  ...DurableR2D3AcceptancePlanFields,
  planDigest: Sha256DigestSchema,
}).strict().superRefine(validatePlanMaterial);

export const PersistedR2D3CoordinationEnvelopeV1Schema = z.object({
  schemaVersion: z.literal("r2d3_coordination_envelope_v1"),
  record: SubmitTurnRecordV1Alpha4Schema,
  acceptedPlan: DurableR2D3AcceptancePlanV1Schema,
  envelopeDigest: Sha256DigestSchema,
}).strict();

export const PersistedR2D3TaskBundleBindingEnvelopeV1Schema = z.object({
  schemaVersion: z.literal("r2d3_task_bundle_binding_v1"),
  submitTurnBinding: TaskSubmitTurnBindingSchema,
  taskInstructionBinding: TaskInstructionBindingV1Schema,
  envelopeDigest: Sha256DigestSchema,
}).strict();

export type DurableR2D3AcceptancePlanMaterialV1 = z.infer<
  typeof DurableR2D3AcceptancePlanMaterialV1Schema
>;
export type DurableR2D3AcceptancePlanV1 = z.infer<
  typeof DurableR2D3AcceptancePlanV1Schema
>;
export type PersistedR2D3CoordinationEnvelopeV1 = z.infer<
  typeof PersistedR2D3CoordinationEnvelopeV1Schema
>;
export type PersistedR2D3TaskBundleBindingEnvelopeV1 = z.infer<
  typeof PersistedR2D3TaskBundleBindingEnvelopeV1Schema
>;

export function createDurableR2D3AcceptancePlanV1(
  input: DurableR2D3AcceptancePlanMaterialV1,
): DurableR2D3AcceptancePlanV1 {
  const material = DurableR2D3AcceptancePlanMaterialV1Schema.parse(input);
  return DurableR2D3AcceptancePlanV1Schema.parse({
    ...material,
    planDigest: calculateR2D3AcceptancePlanDigest(material),
  });
}

export function validateDurableR2D3AcceptancePlanV1(
  input: DurableR2D3AcceptancePlanV1,
): DurableR2D3AcceptancePlanV1 {
  const parsed = DurableR2D3AcceptancePlanV1Schema.parse(input);
  const { planDigest, ...material } = parsed;
  if (planDigest !== calculateR2D3AcceptancePlanDigest(material)) {
    throw new Error("R2D3 durable acceptance plan digest is invalid");
  }
  validatePlanFacts(parsed);
  return parsed;
}

export function createR2D3CoordinationEnvelopeV1(input: Readonly<{
  record: SubmitTurnRecordV1Alpha4;
  acceptedPlan: DurableR2D3AcceptancePlanV1;
}>): PersistedR2D3CoordinationEnvelopeV1 {
  const record = SubmitTurnRecordV1Alpha4Schema.parse(input.record);
  const acceptedPlan = validateDurableR2D3AcceptancePlanV1(input.acceptedPlan);
  validateRecordAgainstPlan(record, acceptedPlan);
  const material = {
    schemaVersion: "r2d3_coordination_envelope_v1" as const,
    record,
    acceptedPlan,
  };
  return PersistedR2D3CoordinationEnvelopeV1Schema.parse({
    ...material,
    envelopeDigest: digestWithDomain(
      R2D3_COORDINATION_ENVELOPE_DIGEST_DOMAIN,
      material,
    ),
  });
}

export function validateR2D3CoordinationEnvelopeV1(
  input: PersistedR2D3CoordinationEnvelopeV1,
): PersistedR2D3CoordinationEnvelopeV1 {
  const parsed = PersistedR2D3CoordinationEnvelopeV1Schema.parse(input);
  const { envelopeDigest, ...material } = parsed;
  if (envelopeDigest !== digestWithDomain(
    R2D3_COORDINATION_ENVELOPE_DIGEST_DOMAIN,
    material,
  )) throw new Error("R2D3 coordination envelope digest is invalid");
  validateDurableR2D3AcceptancePlanV1(parsed.acceptedPlan);
  validateRecordAgainstPlan(parsed.record, parsed.acceptedPlan);
  return parsed;
}

export function createR2D3TaskBundleBindingEnvelopeV1(input: Readonly<{
  submitTurnBinding: TaskSubmitTurnBinding;
  taskInstructionBinding: TaskInstructionBindingV1;
}>): PersistedR2D3TaskBundleBindingEnvelopeV1 {
  const submitTurnBinding = TaskSubmitTurnBindingSchema.parse(input.submitTurnBinding);
  const taskInstructionBinding = validateTaskInstructionBindingV1(
    input.taskInstructionBinding,
  );
  validateBindingPair(submitTurnBinding, taskInstructionBinding);
  const material = {
    schemaVersion: "r2d3_task_bundle_binding_v1" as const,
    submitTurnBinding,
    taskInstructionBinding,
  };
  return PersistedR2D3TaskBundleBindingEnvelopeV1Schema.parse({
    ...material,
    envelopeDigest: digestWithDomain(
      R2D3_TASK_BINDING_ENVELOPE_DIGEST_DOMAIN,
      material,
    ),
  });
}

export function validateR2D3TaskBundleBindingEnvelopeV1(
  input: PersistedR2D3TaskBundleBindingEnvelopeV1,
): PersistedR2D3TaskBundleBindingEnvelopeV1 {
  const parsed = PersistedR2D3TaskBundleBindingEnvelopeV1Schema.parse(input);
  const { envelopeDigest, ...material } = parsed;
  if (envelopeDigest !== digestWithDomain(
    R2D3_TASK_BINDING_ENVELOPE_DIGEST_DOMAIN,
    material,
  )) throw new Error("R2D3 Task binding envelope digest is invalid");
  validateTaskInstructionBindingV1(parsed.taskInstructionBinding);
  validateBindingPair(parsed.submitTurnBinding, parsed.taskInstructionBinding);
  return parsed;
}

export function parsePersistedR2D3CoordinationValue(
  input: unknown,
): Readonly<{
  record: ReadableSubmitTurnRecordV1Alpha4;
  envelope?: PersistedR2D3CoordinationEnvelopeV1;
}> {
  if (isObjectWithVersion(input, "r2d3_coordination_envelope_v1")) {
    const envelope = validateR2D3CoordinationEnvelopeV1(
      PersistedR2D3CoordinationEnvelopeV1Schema.parse(input),
    );
    return { record: envelope.record, envelope };
  }
  const record = ReadableSubmitTurnRecordV1Alpha4Schema.parse(input);
  if (record.schemaVersion === "v1alpha4") {
    throw new Error("R2D3 coordination record is missing its durable envelope");
  }
  return { record };
}

export function parsePersistedTaskBindingValue(input: unknown): Readonly<{
  submitTurnBinding: TaskSubmitTurnBinding;
  envelope?: PersistedR2D3TaskBundleBindingEnvelopeV1;
}> {
  if (isObjectWithVersion(input, "r2d3_task_bundle_binding_v1")) {
    const envelope = validateR2D3TaskBundleBindingEnvelopeV1(
      PersistedR2D3TaskBundleBindingEnvelopeV1Schema.parse(input),
    );
    return { submitTurnBinding: envelope.submitTurnBinding, envelope };
  }
  return { submitTurnBinding: TaskSubmitTurnBindingSchema.parse(input) };
}

function calculateR2D3AcceptancePlanDigest(
  material: DurableR2D3AcceptancePlanMaterialV1,
): string {
  return digestWithDomain(R2D3_DURABLE_ACCEPTANCE_PLAN_DIGEST_DOMAIN, material);
}

function digestWithDomain(domain: string, material: unknown): string {
  return sha256CanonicalJson(JsonValueSchema.parse({ domain, material }));
}

function validatePlanMaterial(
  value: Omit<DurableR2D3AcceptancePlanV1, "planDigest">,
  context: z.RefinementCtx,
): void {
  const lockIds = value.capabilityLocks.map((lock) => lock.lockId);
  if (new Set(lockIds).size !== lockIds.length) {
    context.addIssue({ code: "custom", message: "Capability lock IDs must be unique" });
  }
  if (value.acceptanceReceiptIdentity !== value.submitTurnCommandId) {
    context.addIssue({
      code: "custom",
      message: "Acceptance Receipt identity must equal SubmitTurn command identity",
      path: ["acceptanceReceiptIdentity"],
    });
  }
  if (value.preallocatedDeliveryId === value.acceptanceReceiptIdentity) {
    context.addIssue({
      code: "custom",
      message: "Delivery identity must remain separate from Receipt identity",
      path: ["preallocatedDeliveryId"],
    });
  }
}

function validatePlanFacts(plan: DurableR2D3AcceptancePlanV1): void {
  if (!hasValidAgentResourceDecisionV1(plan.agentResourceDecision)) {
    throw new Error("R2D3 Agent resource decision is invalid");
  }
  if (!hasValidTaskRuntimeSelectionV1Alpha3(plan.runtimeSelection)) {
    throw new Error("R2D3 Runtime Selection is invalid");
  }
  if (!hasValidTaskAuthorizationSelection(plan.authorizationSelection)
    || !hasValidTaskExecutionSelectionIdentity(plan.executionSelectionIdentity)) {
    throw new Error("R2D3 authorization facts are invalid");
  }
  const selection = plan.runtimeSelection;
  const decision = plan.agentResourceDecision;
  const lockIds = [selection.resolvedModelLock.lockId,
    ...selection.toolLocks.map((lock) => lock.lockId)];
  if (
    plan.submitTurnCommandId !== plan.submitTurnBinding.submitTurnCommandId
    || plan.internalTaskId !== selection.taskId
    || plan.internalTaskId !== plan.taskHead.taskId
    || plan.internalTaskId !== plan.submitTurnBinding.taskId
    || plan.userMessageId !== plan.submitTurnBinding.userMessageId
    || plan.runtimeSelectionId !== selection.runtimeSelectionId
    || plan.runtimeSelectionId !== plan.submitTurnBinding.runtimeSelectionId
    || plan.exactAgent.agentDefinitionId !== selection.agent.agentDefinitionId
    || plan.exactAgent.revision !== selection.agent.revision
    || plan.exactAgent.digest !== selection.agent.digest
    || plan.resourceEntitlementSnapshotDigest
      !== selection.resourceEntitlementSnapshotDigest
    || plan.resourceEntitlementSnapshotDigest
      !== decision.entitlementSnapshotDigest
    || decision.decisionDigest !== selection.agentResourceDecisionDigest
    || plan.authorizationSelection.runtimeSelectionId !== selection.runtimeSelectionId
    || plan.executionSelectionIdentity.runtimeSelectionDigest
      !== selection.selectionDigest
    || plan.taskInstructionBinding.submitTurnBundleDigest
      !== plan.submitTurnBinding.bundleDigest
    || plan.taskInstructionBinding.bindingDigest.length === 0
    || !sameStrings(lockIds, plan.capabilityLocks.map((lock) => lock.lockId))
  ) throw new Error("R2D3 durable acceptance plan facts are inconsistent");
}

function validateRecordAgainstPlan(
  record: SubmitTurnRecordV1Alpha4,
  plan: DurableR2D3AcceptancePlanV1,
): void {
  const resourcePlan = record.resourcePlan;
  if (
    record.submitTurnCommandId !== plan.submitTurnCommandId
    || record.clientTurnId !== plan.clientTurnId
    || record.internalSessionId !== plan.internalSessionId
    || record.internalTaskId !== plan.internalTaskId
    || record.internalUserMessageId !== plan.userMessageId
    || record.initialCheckpointId !== plan.initialCheckpointId
    || record.internalRuntimeSelectionId !== plan.runtimeSelectionId
    || record.requestDigest !== plan.requestDigest
    || resourcePlan.resourceEntitlementSnapshotDigest
      !== plan.resourceEntitlementSnapshotDigest
    || resourcePlan.agentResourceDecisionDigest
      !== plan.agentResourceDecision.decisionDigest
    || resourcePlan.plannedRuntimeSelectionDigest
      !== plan.runtimeSelection.selectionDigest
    || resourcePlan.authorizationSelectionDigest
      !== plan.authorizationSelection.authorizationSelectionDigest
    || resourcePlan.executionSelectionDigest
      !== plan.executionSelectionIdentity.executionSelectionDigest
    || resourcePlan.plannedTaskBundleDigest !== plan.submitTurnBinding.bundleDigest
    || resourcePlan.plannedInstructionBindingDigest
      !== plan.taskInstructionBinding.bindingDigest
    || resourcePlan.durableAcceptanceRevision !== plan.planDigest
    || resourcePlan.acceptanceReceiptIdentity !== plan.acceptanceReceiptIdentity
  ) throw new Error("R2D3 coordination record does not match its accepted plan");
}

function validateBindingPair(
  binding: TaskSubmitTurnBinding,
  instruction: TaskInstructionBindingV1,
): void {
  if (
    binding.taskId !== instruction.taskId
    || binding.runtimeSelectionId !== instruction.runtimeSelectionId
    || binding.bundleDigest !== instruction.submitTurnBundleDigest
  ) throw new Error("R2D3 Task binding envelope facts are inconsistent");
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function isObjectWithVersion(input: unknown, version: string): boolean {
  return typeof input === "object"
    && input !== null
    && !Array.isArray(input)
    && Reflect.get(input, "schemaVersion") === version;
}

export type R2D3AcceptancePlanFacts = Readonly<{
  taskHead: TaskHead;
  capabilityLocks: readonly TaskCapabilityLock[];
  runtimeSelection: TaskRuntimeSelectionV1Alpha3;
  authorizationSelection: TaskAuthorizationSelection;
  executionSelectionIdentity: TaskExecutionSelectionIdentity;
  submitTurnBinding: TaskSubmitTurnBinding;
  taskInstructionBinding: TaskInstructionBindingV1;
  agentResourceDecision: AgentResourceDecisionV1;
}>;
