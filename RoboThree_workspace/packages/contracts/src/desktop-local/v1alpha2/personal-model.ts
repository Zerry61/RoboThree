import { z } from "zod";

import {
  DesktopDisplayTextSchema,
  DesktopResourceIdSchema,
  ModelCapabilitySchema,
  Sha256DigestSchema,
  TimestampSchema,
} from "../v1alpha1/index.js";

const SafeVisibleTextSchema = DesktopDisplayTextSchema.refine(
  (value) => !containsControlCharacter(value),
  "visible model text must not contain control characters",
);

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

export const PersonalModelProviderSchema = z.enum([
  "deepseek",
  "zhipu",
  "kimi",
  "custom",
]);

export const PersonalModelProtocolSchema = z.literal("openai_compatible");

export const PersonalModelStatusSchema = z.enum([
  "unverified",
  "available",
  "authentication_failed",
  "network_failed",
  "protocol_incompatible",
  "model_not_found",
  "unavailable",
  "permission_denied",
]);

export const PersonalModelCredentialStateSchema = z.enum([
  "absent",
  "present_masked",
  "unavailable",
  "delete_uncertain",
]);

export const PersonalModelUnavailableReasonSchema = z.enum([
  "authentication_failed",
  "protocol_incompatible",
  "model_not_found",
  "credential_unavailable",
  "provider_unavailable",
  "permission_denied",
  "delete_uncertain",
]);

export const PersonalModelSafeSummaryV1Alpha2Schema = z.object({
  contractVersion: z.literal("v1alpha2"),
  personalModelId: DesktopResourceIdSchema,
  configurationRevision: Sha256DigestSchema,
  displayName: SafeVisibleTextSchema.max(160),
  provider: PersonalModelProviderSchema,
  protocol: PersonalModelProtocolSchema,
  providerModelId: SafeVisibleTextSchema.max(160),
  endpointDisplayHost: SafeVisibleTextSchema.max(253),
  endpointIdentityDigest: Sha256DigestSchema,
  capabilities: z.array(ModelCapabilitySchema).max(16),
  status: PersonalModelStatusSchema,
  statusRevision: z.number().int().positive(),
  available: z.boolean(),
  unavailableReason: PersonalModelUnavailableReasonSchema.optional(),
  credentialState: PersonalModelCredentialStateSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  if (value.credentialState === "absent") {
    context.addIssue({
      code: "custom",
      path: ["credentialState"],
      message: "active Personal Model summaries cannot expose absent credentials",
    });
  }
  if (["unavailable", "delete_uncertain"].includes(value.credentialState)
    && value.status !== "unavailable") {
    context.addIssue({
      code: "custom",
      path: ["status"],
      message: "unavailable Credential state requires unavailable model status",
    });
  }

  const expectedReason = unavailableReasonFor(value.status, value.credentialState);
  if (expectedReason === undefined) {
    if (!value.available || value.unavailableReason !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["available"],
        message: "selectable Personal Model status must omit unavailableReason",
      });
    }
    return;
  }
  if (value.available || value.unavailableReason !== expectedReason) {
    context.addIssue({
      code: "custom",
      path: ["unavailableReason"],
      message: "Personal Model availability must be derived from its status and credential state",
    });
  }
});

function unavailableReasonFor(
  status: z.infer<typeof PersonalModelStatusSchema>,
  credentialState: z.infer<typeof PersonalModelCredentialStateSchema>,
): z.infer<typeof PersonalModelUnavailableReasonSchema> | undefined {
  if (credentialState === "delete_uncertain") return "delete_uncertain";
  if (credentialState === "unavailable") return "credential_unavailable";
  switch (status) {
    case "unverified":
    case "available":
    case "network_failed":
      return undefined;
    case "authentication_failed":
    case "protocol_incompatible":
    case "model_not_found":
    case "permission_denied":
      return status;
    case "unavailable":
      return "provider_unavailable";
  }
}

export type PersonalModelProvider = z.infer<typeof PersonalModelProviderSchema>;
export type PersonalModelProtocol = z.infer<typeof PersonalModelProtocolSchema>;
export type PersonalModelStatus = z.infer<typeof PersonalModelStatusSchema>;
export type PersonalModelCredentialState = z.infer<
  typeof PersonalModelCredentialStateSchema
>;
export type PersonalModelUnavailableReason = z.infer<
  typeof PersonalModelUnavailableReasonSchema
>;
export type PersonalModelSafeSummaryV1Alpha2 = z.infer<
  typeof PersonalModelSafeSummaryV1Alpha2Schema
>;
