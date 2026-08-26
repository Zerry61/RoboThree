import {
  CapabilityIdSchema,
  DesktopResourceIdSchema,
  EntityIdSchema,
  JsonValueSchema,
  Sha256DigestSchema,
  TimestampSchema,
} from "@robothree/contracts";
import {
  AgentKnowledgeRestrictionRefV1Alpha2Schema,
  AgentModelRestrictionRefV1Alpha2Schema,
  AgentSkillRestrictionRefV1Alpha2Schema,
  AgentToolRestrictionRefV1Alpha2Schema,
} from "@robothree/contracts/runtime-selection/agent-definition/v1alpha2";
import { z } from "zod";

import { sha256CanonicalJson } from "../persistence/digest.js";

export const TASK_RESOURCE_ENTITLEMENT_SNAPSHOT_DIGEST_DOMAIN =
  "robothree.task-resource-entitlement-snapshot.v1\n" as const;
export const AGENT_RESOURCE_DECISION_DIGEST_DOMAIN =
  "robothree.agent-resource-decision.v1\n" as const;
export const R2D3_PRODUCTION_ENTERPRISE_ENTITLEMENT_READY = false;

const StableOrdinalSchema = z.number().int().nonnegative().max(2_147_483_647);

export const EntitledModelRefV1Schema = z.object({
  ...AgentModelRestrictionRefV1Alpha2Schema.shape,
  stableOrdinal: StableOrdinalSchema,
}).strict().superRefine((value, context) => {
  if (value.revision !== value.digest) {
    context.addIssue({
      code: "custom",
      message: "Model entitlement revision and digest must identify the same material",
    });
  }
});

export const EntitledSkillRefV1Schema = z.object({
  ...AgentSkillRestrictionRefV1Alpha2Schema.shape,
  stableOrdinal: StableOrdinalSchema,
}).strict();

export const EntitledToolRefV1Schema = z.object({
  ...AgentToolRestrictionRefV1Alpha2Schema.shape,
  stableOrdinal: StableOrdinalSchema,
}).strict();

export const EntitledKnowledgeRefV1Schema = z.object({
  ...AgentKnowledgeRestrictionRefV1Alpha2Schema.shape,
  stableOrdinal: StableOrdinalSchema,
}).strict();

export const TaskResourceIdentityEvidenceV1Schema = z.object({
  testIdentityUsed: z.boolean(),
  productionIdentityReady: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.testIdentityUsed && value.productionIdentityReady) {
    context.addIssue({
      code: "custom",
      message: "test identity cannot be declared production ready",
      path: ["productionIdentityReady"],
    });
  }
});

const TaskResourceEntitlementSnapshotV1Fields = {
  schemaVersion: z.literal("v1"),
  subjectBindingDigest: Sha256DigestSchema,
  authorityKind: z.literal("runtime_active_enterprise_identity"),
  authorityRevision: Sha256DigestSchema,
  observedAt: TimestampSchema,
  models: z.array(EntitledModelRefV1Schema).max(64),
  skills: z.array(EntitledSkillRefV1Schema).max(64),
  tools: z.array(EntitledToolRefV1Schema).max(128),
  knowledge: z.array(EntitledKnowledgeRefV1Schema).max(64),
  identityEvidence: TaskResourceIdentityEvidenceV1Schema,
};

export const TaskResourceEntitlementSnapshotV1MaterialSchema = z.object(
  TaskResourceEntitlementSnapshotV1Fields,
).strict().superRefine(validateEntitlementSnapshotMaterial);

export const TaskResourceEntitlementSnapshotV1Schema = z.object({
  ...TaskResourceEntitlementSnapshotV1Fields,
  snapshotDigest: Sha256DigestSchema,
}).strict().superRefine(validateEntitlementSnapshotMaterial);

export const AgentResourceModelSelectionSourceV1Schema = z.enum([
  "explicit",
  "user_preference",
  "stable_fallback",
]);

const AgentResourceDecisionV1Fields = {
  schemaVersion: z.literal("v1"),
  taskId: EntityIdSchema,
  agentRef: z.object({
    agentDefinitionId: DesktopResourceIdSchema,
    revision: Sha256DigestSchema,
    digest: Sha256DigestSchema,
  }).strict(),
  entitlementSnapshotDigest: Sha256DigestSchema,
  registryRevision: Sha256DigestSchema,
  modelSelectionSource: AgentResourceModelSelectionSourceV1Schema,
  requestedModelId: CapabilityIdSchema.refine(
    (value) => value.startsWith("model."),
  ).optional(),
  resolvedModelRef: AgentModelRestrictionRefV1Alpha2Schema,
  activeSkillRefs: z.array(AgentSkillRestrictionRefV1Alpha2Schema).max(64),
  toolCandidateRefs: z.array(AgentToolRestrictionRefV1Alpha2Schema).max(128),
  knowledgeRefs: z.array(AgentKnowledgeRestrictionRefV1Alpha2Schema).max(64),
};

export const AgentResourceDecisionV1MaterialSchema = z.object(
  AgentResourceDecisionV1Fields,
).strict().superRefine(validateAgentResourceDecisionMaterial);

export const AgentResourceDecisionV1Schema = z.object({
  ...AgentResourceDecisionV1Fields,
  decisionDigest: Sha256DigestSchema,
}).strict().superRefine(validateAgentResourceDecisionMaterial);

export function calculateTaskResourceEntitlementSnapshotV1Digest(
  material: TaskResourceEntitlementSnapshotV1Material,
): string {
  const parsed = TaskResourceEntitlementSnapshotV1MaterialSchema.parse(material);
  return sha256CanonicalJson(JsonValueSchema.parse({
    domain: TASK_RESOURCE_ENTITLEMENT_SNAPSHOT_DIGEST_DOMAIN,
    material: parsed,
  }));
}

export function createTaskResourceEntitlementSnapshotV1(
  material: TaskResourceEntitlementSnapshotV1Material,
): TaskResourceEntitlementSnapshotV1 {
  const parsed = TaskResourceEntitlementSnapshotV1MaterialSchema.parse(material);
  return TaskResourceEntitlementSnapshotV1Schema.parse({
    ...parsed,
    snapshotDigest: calculateTaskResourceEntitlementSnapshotV1Digest(parsed),
  });
}

export function hasValidTaskResourceEntitlementSnapshotV1(
  input: TaskResourceEntitlementSnapshotV1,
): boolean {
  const parsed = TaskResourceEntitlementSnapshotV1Schema.parse(input);
  const { snapshotDigest, ...material } = parsed;
  return snapshotDigest === calculateTaskResourceEntitlementSnapshotV1Digest(material);
}

export function calculateAgentResourceDecisionV1Digest(
  material: AgentResourceDecisionV1Material,
): string {
  const parsed = AgentResourceDecisionV1MaterialSchema.parse(material);
  return sha256CanonicalJson(JsonValueSchema.parse({
    domain: AGENT_RESOURCE_DECISION_DIGEST_DOMAIN,
    material: parsed,
  }));
}

export function createAgentResourceDecisionV1(
  material: AgentResourceDecisionV1Material,
): AgentResourceDecisionV1 {
  const parsed = AgentResourceDecisionV1MaterialSchema.parse(material);
  return AgentResourceDecisionV1Schema.parse({
    ...parsed,
    decisionDigest: calculateAgentResourceDecisionV1Digest(parsed),
  });
}

export function hasValidAgentResourceDecisionV1(
  input: AgentResourceDecisionV1,
): boolean {
  const parsed = AgentResourceDecisionV1Schema.parse(input);
  const { decisionDigest, ...material } = parsed;
  return decisionDigest === calculateAgentResourceDecisionV1Digest(material);
}

function validateEntitlementSnapshotMaterial(
  value: {
    models: readonly EntitledModelRefV1[];
    skills: readonly EntitledSkillRefV1[];
    tools: readonly EntitledToolRefV1[];
    knowledge: readonly EntitledKnowledgeRefV1[];
  },
  context: z.RefinementCtx,
): void {
  validateOrderedResourceRefs(value.models, (entry) => entry.modelId, context, "Model");
  validateOrderedResourceRefs(value.skills, (entry) => entry.skillId, context, "Skill");
  validateOrderedResourceRefs(value.tools, (entry) => entry.capabilityId, context, "Tool");
  validateOrderedResourceRefs(
    value.knowledge,
    (entry) => entry.knowledgeId,
    context,
    "Knowledge",
  );
}

function validateOrderedResourceRefs<T extends { stableOrdinal: number }>(
  entries: readonly T[],
  idOf: (entry: T) => string,
  context: z.RefinementCtx,
  label: string,
): void {
  const ids = entries.map(idOf);
  const ordinals = entries.map((entry) => entry.stableOrdinal);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: `${label} entitlement IDs must be unique` });
  }
  if (new Set(ordinals).size !== ordinals.length) {
    context.addIssue({
      code: "custom",
      message: `${label} entitlement ordinals must be unique`,
    });
  }
  const sorted = [...entries].sort(
    (left, right) => left.stableOrdinal - right.stableOrdinal
      || compareExactId(idOf(left), idOf(right)),
  );
  if (sorted.some((entry, index) => entry !== entries[index])) {
    context.addIssue({
      code: "custom",
      message: `${label} entitlement refs must follow stable ordinal order`,
    });
  }
}

function compareExactId(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function validateAgentResourceDecisionMaterial(
  value: z.infer<z.ZodObject<typeof AgentResourceDecisionV1Fields>>,
  context: z.RefinementCtx,
): void {
  if (value.agentRef.revision !== value.agentRef.digest) {
    context.addIssue({
      code: "custom",
      message: "Agent decision requires an exact Agent revision/digest",
      path: ["agentRef"],
    });
  }
  const explicit = value.modelSelectionSource === "explicit";
  if (
    explicit !== (value.requestedModelId !== undefined)
    || (explicit && value.requestedModelId !== value.resolvedModelRef.modelId)
  ) {
    context.addIssue({
      code: "custom",
      message: "only explicit selection requires the exact requested Model ID",
      path: ["requestedModelId"],
    });
  }
  requireUnique(value.activeSkillRefs.map((ref) => ref.skillId), context, "Skill");
  requireUnique(
    value.toolCandidateRefs.map((ref) => ref.capabilityId),
    context,
    "Tool",
  );
  requireUnique(
    value.knowledgeRefs.map((ref) => ref.knowledgeId),
    context,
    "Knowledge",
  );
}

function requireUnique(
  ids: readonly string[],
  context: z.RefinementCtx,
  label: string,
): void {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: `${label} decision refs must be unique` });
  }
}

export type EntitledModelRefV1 = z.infer<typeof EntitledModelRefV1Schema>;
export type EntitledSkillRefV1 = z.infer<typeof EntitledSkillRefV1Schema>;
export type EntitledToolRefV1 = z.infer<typeof EntitledToolRefV1Schema>;
export type EntitledKnowledgeRefV1 = z.infer<typeof EntitledKnowledgeRefV1Schema>;
export type TaskResourceEntitlementSnapshotV1Material = z.infer<
  typeof TaskResourceEntitlementSnapshotV1MaterialSchema
>;
export type TaskResourceEntitlementSnapshotV1 = z.infer<
  typeof TaskResourceEntitlementSnapshotV1Schema
>;
export type AgentResourceDecisionV1Material = z.infer<
  typeof AgentResourceDecisionV1MaterialSchema
>;
export type AgentResourceDecisionV1 = z.infer<
  typeof AgentResourceDecisionV1Schema
>;
