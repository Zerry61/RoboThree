import { z } from "zod";

import { CapabilityIdSchema } from "../../../capability/common.js";
import { DesktopResourceIdSchema } from "../../../desktop-local/v1alpha1/common.js";
import { Sha256DigestSchema } from "../../../persistence/common.js";
import { RequiredModelCapabilitiesSchema } from "../../runtime-selection.js";
import { TimestampSchema } from "../../../common/time.js";

export const AGENT_DEFINITION_SCHEMA_VERSION_V1ALPHA2 = "v1alpha2" as const;
export const AgentDefinitionSchemaVersionV1Alpha2Schema = z.literal(
  AGENT_DEFINITION_SCHEMA_VERSION_V1ALPHA2,
);

export const AgentDefinitionManagementClassV1Alpha2Schema = z.enum([
  "system_builtin",
  "managed",
]);

export const AgentModelRestrictionRefV1Alpha2Schema = z.object({
  modelId: CapabilityIdSchema.refine((value) => value.startsWith("model.")),
  revision: Sha256DigestSchema,
  digest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.revision !== value.digest) {
    context.addIssue({
      code: "custom",
      message: "Model restriction revision and digest must identify the same immutable material",
    });
  }
});

export const AgentSkillRestrictionRefV1Alpha2Schema = z.object({
  skillId: DesktopResourceIdSchema,
  revision: Sha256DigestSchema,
  contentDigest: Sha256DigestSchema,
}).strict();

export const AgentToolRestrictionRefV1Alpha2Schema = z.object({
  capabilityId: CapabilityIdSchema.refine((value) => value.startsWith("tool.")),
  capabilityRevision: Sha256DigestSchema,
}).strict();

export const AgentKnowledgeRestrictionRefV1Alpha2Schema = z.object({
  knowledgeId: DesktopResourceIdSchema,
  revision: Sha256DigestSchema,
  contentDigest: Sha256DigestSchema,
}).strict();

const UnrestrictedResourceRestrictionSchema = z.object({
  mode: z.literal("unrestricted"),
}).strict();

const ModelAllowlistRestrictionSchema = z.object({
  mode: z.literal("allowlist"),
  references: z.array(AgentModelRestrictionRefV1Alpha2Schema).max(64),
}).strict().superRefine((value, context) => {
  requireUniqueIds(value.references.map((reference) => reference.modelId), context, "Model");
});

const SkillAllowlistRestrictionSchema = z.object({
  mode: z.literal("allowlist"),
  references: z.array(AgentSkillRestrictionRefV1Alpha2Schema).max(64),
}).strict().superRefine((value, context) => {
  requireUniqueIds(value.references.map((reference) => reference.skillId), context, "Skill");
});

const ToolAllowlistRestrictionSchema = z.object({
  mode: z.literal("allowlist"),
  references: z.array(AgentToolRestrictionRefV1Alpha2Schema).max(128),
}).strict().superRefine((value, context) => {
  requireUniqueIds(
    value.references.map((reference) => reference.capabilityId),
    context,
    "Tool",
  );
});

const KnowledgeAllowlistRestrictionSchema = z.object({
  mode: z.literal("allowlist"),
  references: z.array(AgentKnowledgeRestrictionRefV1Alpha2Schema).max(64),
}).strict().superRefine((value, context) => {
  requireUniqueIds(
    value.references.map((reference) => reference.knowledgeId),
    context,
    "Knowledge",
  );
});

export const AgentModelRestrictionV1Alpha2Schema = z.discriminatedUnion("mode", [
  UnrestrictedResourceRestrictionSchema,
  ModelAllowlistRestrictionSchema,
]);

export const AgentSkillRestrictionV1Alpha2Schema = z.discriminatedUnion("mode", [
  UnrestrictedResourceRestrictionSchema,
  SkillAllowlistRestrictionSchema,
]);

export const AgentToolRestrictionV1Alpha2Schema = z.discriminatedUnion("mode", [
  UnrestrictedResourceRestrictionSchema,
  ToolAllowlistRestrictionSchema,
]);

export const AgentKnowledgeRestrictionV1Alpha2Schema = z.discriminatedUnion("mode", [
  UnrestrictedResourceRestrictionSchema,
  KnowledgeAllowlistRestrictionSchema,
]);

const AgentDefinitionRevisionV1Alpha2Fields = {
  schemaVersion: AgentDefinitionSchemaVersionV1Alpha2Schema,
  agentDefinitionId: DesktopResourceIdSchema,
  managementClass: AgentDefinitionManagementClassV1Alpha2Schema,
  name: z.string().min(1).max(512),
  identity: z.string().min(1).max(4096),
  goal: z.string().min(1).max(4096),
  instructions: z.string().min(1).max(128 * 1024),
  modelRestriction: AgentModelRestrictionV1Alpha2Schema,
  skillRestriction: AgentSkillRestrictionV1Alpha2Schema,
  toolRestriction: AgentToolRestrictionV1Alpha2Schema,
  knowledgeRestriction: AgentKnowledgeRestrictionV1Alpha2Schema,
  requiredModelCapabilities: RequiredModelCapabilitiesSchema,
  createdAt: TimestampSchema,
};

export const AgentDefinitionRevisionV1Alpha2MaterialSchema = z.object(
  AgentDefinitionRevisionV1Alpha2Fields,
).strict();

export const AgentDefinitionRevisionV1Alpha2Schema = z.object({
  ...AgentDefinitionRevisionV1Alpha2Fields,
  revision: Sha256DigestSchema,
  digest: Sha256DigestSchema,
}).strict().superRefine((value, context) => {
  if (value.revision !== value.digest) {
    context.addIssue({
      code: "custom",
      message: "Agent definition revision and digest must identify the same immutable material",
    });
  }
});

function requireUniqueIds(
  ids: readonly string[],
  context: z.RefinementCtx,
  resourceKind: string,
): void {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      message: `${resourceKind} restriction IDs must be unique`,
      path: ["references"],
    });
  }
}

export type AgentDefinitionManagementClassV1Alpha2 = z.infer<
  typeof AgentDefinitionManagementClassV1Alpha2Schema
>;
export type AgentModelRestrictionRefV1Alpha2 = z.infer<
  typeof AgentModelRestrictionRefV1Alpha2Schema
>;
export type AgentSkillRestrictionRefV1Alpha2 = z.infer<
  typeof AgentSkillRestrictionRefV1Alpha2Schema
>;
export type AgentToolRestrictionRefV1Alpha2 = z.infer<
  typeof AgentToolRestrictionRefV1Alpha2Schema
>;
export type AgentKnowledgeRestrictionRefV1Alpha2 = z.infer<
  typeof AgentKnowledgeRestrictionRefV1Alpha2Schema
>;
export type AgentModelRestrictionV1Alpha2 = z.infer<
  typeof AgentModelRestrictionV1Alpha2Schema
>;
export type AgentSkillRestrictionV1Alpha2 = z.infer<
  typeof AgentSkillRestrictionV1Alpha2Schema
>;
export type AgentToolRestrictionV1Alpha2 = z.infer<
  typeof AgentToolRestrictionV1Alpha2Schema
>;
export type AgentKnowledgeRestrictionV1Alpha2 = z.infer<
  typeof AgentKnowledgeRestrictionV1Alpha2Schema
>;
export type AgentDefinitionRevisionV1Alpha2Material = z.infer<
  typeof AgentDefinitionRevisionV1Alpha2MaterialSchema
>;
export type AgentDefinitionRevisionV1Alpha2 = z.infer<
  typeof AgentDefinitionRevisionV1Alpha2Schema
>;
