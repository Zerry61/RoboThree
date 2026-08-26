import { z } from "zod";

import { EntityIdSchema, NamespacedResourceIdSchema } from "../../common/identifiers.js";
import { TimestampSchema } from "../../common/time.js";
import { Sha256DigestSchema } from "../../persistence/common.js";
import { JsonValueSchema } from "../../runtime/json.js";
import type { JsonValue } from "../../runtime/json.js";

export const ADMIN_CONTROL_CONTRACT_VERSION = "admin-control.v1alpha1" as const;
export const ADMIN_CONTROL_CANONICAL_DOMAIN =
  "robothree.admin-control.v1alpha1.canonical.v1" as const;

export const AdminControlContractVersionSchema = z.literal(ADMIN_CONTROL_CONTRACT_VERSION);
export const AdminControlDigestDomainSchema = z.literal(ADMIN_CONTROL_CANONICAL_DOMAIN);

export const AdminControlDisplayTextSchema = z.string().min(1).max(512);
export const AdminControlSafeSummarySchema = z.string().min(1).max(4096);
export const AdminControlOptionalSafeSummarySchema = z.string().min(1).max(4096).optional();
export const AdminControlResourceIdSchema = NamespacedResourceIdSchema;
export const AdminControlRevisionSchema = Sha256DigestSchema;

export const AdminControlModuleSchema = z.enum([
  "models",
  "robots",
  "skills",
  "tools",
  "knowledge",
  "system",
]);

export const AdminControlCapabilityStateSchema = z.enum([
  "ready",
  "unavailable",
  "gated",
  "partial",
]);

export const AdminControlCredentialStatusSchema = z.enum([
  "configured",
  "missing",
  "unavailable",
]);

export const AdminControlLifecycleSchema = z.enum([
  "draft",
  "review",
  "published",
  "disabled",
  "gated",
  "unavailable",
]);

export const AdminControlRestrictionStateSchema = z.enum([
  "unrestricted",
  "restricted_nonempty",
  "restricted_empty",
]);

export const AdminControlRestrictionSummarySchema = z.object({
  models: AdminControlRestrictionStateSchema,
  skills: AdminControlRestrictionStateSchema,
  tools: AdminControlRestrictionStateSchema,
  knowledge: AdminControlRestrictionStateSchema,
}).strict();

export const AdminControlEnvelopeMetadataSchema = z.object({
  contractVersion: AdminControlContractVersionSchema,
  requestId: EntityIdSchema,
  correlationId: EntityIdSchema,
  serverTime: TimestampSchema,
  testIdentityUsed: z.boolean(),
  productionIdentityReady: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.testIdentityUsed && value.productionIdentityReady) {
    context.addIssue({
      code: "custom",
      path: ["productionIdentityReady"],
      message: "test identity cannot declare production identity ready",
    });
  }
});

export function createAdminControlSuccessEnvelopeSchema<TData extends z.ZodType>(data: TData) {
  return AdminControlEnvelopeMetadataSchema.extend({
    data,
  }).strict();
}

export function canonicalAdminControlJson(input: JsonValue): string {
  return JSON.stringify(sortAndNormalizeJson(JsonValueSchema.parse(input)));
}

export function canonicalAdminControlDigestInput(input: JsonValue): string {
  return `${ADMIN_CONTROL_CANONICAL_DOMAIN}\n${canonicalAdminControlJson(input)}`;
}

function sortAndNormalizeJson(value: JsonValue): JsonValue {
  if (typeof value === "string") return value.normalize("NFC");
  if (Array.isArray(value)) return value.map(sortAndNormalizeJson);
  if (typeof value !== "object" || value === null) return value;
  const normalized = new Map<string, JsonValue>();
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.normalize("NFC");
    if (normalized.has(normalizedKey)) {
      throw new Error("canonical admin-control JSON contains duplicate keys after NFC normalization");
    }
    normalized.set(normalizedKey, sortAndNormalizeJson(child));
  }
  return Object.fromEntries([...normalized.entries()].sort(([left], [right]) => {
    return left < right ? -1 : left > right ? 1 : 0;
  }));
}

export type AdminControlModule = z.infer<typeof AdminControlModuleSchema>;
export type AdminControlCapabilityState = z.infer<typeof AdminControlCapabilityStateSchema>;
export type AdminControlCredentialStatus = z.infer<typeof AdminControlCredentialStatusSchema>;
export type AdminControlLifecycle = z.infer<typeof AdminControlLifecycleSchema>;
export type AdminControlRestrictionState = z.infer<typeof AdminControlRestrictionStateSchema>;
export type AdminControlRestrictionSummary = z.infer<typeof AdminControlRestrictionSummarySchema>;
export type AdminControlEnvelopeMetadata = z.infer<typeof AdminControlEnvelopeMetadataSchema>;
