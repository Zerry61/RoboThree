import { z } from "zod";

import { NamespacedResourceIdSchema } from "../common/identifiers.js";
import { Sha256DigestSchema } from "../persistence/common.js";
import { ReasoningSupportStateSchema } from "./support-state.js";

export const REASONING_PROFILE_SCHEMA_VERSION = "v1alpha1" as const;

export const ReasoningMappingKindSchema = z.enum([
  "effort_level",
  "boolean_thinking",
  "bounded_budget_preset",
]);

export const ReasoningProfileSubjectSchema = z.object({
  modelCapabilityId: NamespacedResourceIdSchema.refine((value) => value.startsWith("model.")),
  modelCapabilityRevision: Sha256DigestSchema,
  adapterDescriptorId: NamespacedResourceIdSchema,
  adapterDescriptorRevision: Sha256DigestSchema,
  authority: z.enum(["central_enterprise", "local_personal"]),
  personalExecutionDefinitionDigest: Sha256DigestSchema.optional(),
}).strict().superRefine((value, context) => {
  if ((value.authority === "local_personal")
    !== (value.personalExecutionDefinitionDigest !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["personalExecutionDefinitionDigest"],
      message: "only local Personal Model profiles require an execution definition digest",
    });
  }
});

export const ReasoningMaxStrategySchema = z.object({
  strategyId: NamespacedResourceIdSchema,
  strategyRevision: Sha256DigestSchema,
  strategyDigest: Sha256DigestSchema,
  mappingKind: ReasoningMappingKindSchema,
  timeoutPolicyRef: NamespacedResourceIdSchema,
}).strict();

export const ReasoningProfileSchema = z.object({
  schemaVersion: z.literal(REASONING_PROFILE_SCHEMA_VERSION),
  profileId: NamespacedResourceIdSchema,
  profileRevision: Sha256DigestSchema,
  profileDigest: Sha256DigestSchema,
  subject: ReasoningProfileSubjectSchema,
  support: ReasoningSupportStateSchema,
  maxStrategy: ReasoningMaxStrategySchema.optional(),
  safeUnavailableReasonCode: z.string()
    .min(3)
    .max(120)
    .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/u)
    .optional(),
}).strict().superRefine((value, context) => {
  if (value.profileRevision !== value.profileDigest) {
    context.addIssue({
      code: "custom",
      path: ["profileRevision"],
      message: "Reasoning Profile revision and digest must identify the same immutable material",
    });
  }
  if ((value.support === "supported") !== (value.maxStrategy !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["maxStrategy"],
      message: "only a supported Reasoning Profile may carry one Max strategy",
    });
  }
  if (value.support === "supported" && value.safeUnavailableReasonCode !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["safeUnavailableReasonCode"],
      message: "supported Reasoning Profiles cannot carry an unavailable reason",
    });
  }
});

export type ReasoningMappingKind = z.infer<typeof ReasoningMappingKindSchema>;
export type ReasoningProfileSubject = z.infer<typeof ReasoningProfileSubjectSchema>;
export type ReasoningMaxStrategy = z.infer<typeof ReasoningMaxStrategySchema>;
export type ReasoningProfile = z.infer<typeof ReasoningProfileSchema>;
