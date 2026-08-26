import { createHmac, randomBytes } from "node:crypto";

import {
  JsonValueSchema,
  ReasoningModePreferenceReceiptSchema,
  Sha256DigestSchema,
  TimestampSchema,
  canonicalJsonStringify,
  type ReasoningModePreference,
  type ReasoningModePreferenceReceipt,
  type Sha256Digest,
  type UpdateReasoningModePreferenceCommand,
} from "@robothree/contracts";
import {
  ReasoningProfileSchema,
  ReasoningProfileSubjectSchema,
  type ReasoningProfile,
  type ReasoningProfileSubject,
} from "@robothree/contracts/reasoning-mode/v1alpha1";
import { z } from "zod";

import { sha256CanonicalJson } from "../persistence/digest.js";

const OWNER_DOMAIN = "robothree.desktop-experience-preference-owner.v1";
const NAMESPACE_KEY_CHECK_DOMAIN =
  "robothree.desktop-experience-preference-owner-namespace-key-check.v1";

export const DesktopExperiencePreferenceOwnerIdentitySchema = z.object({
  ownerScopeNamespaceRevision: z.number().int().positive(),
  ownerScopeDigest: Sha256DigestSchema,
}).strict();

export const DesktopReasoningModePreferenceSchema = z.object({
  ownerScopeNamespaceRevision: z.number().int().positive(),
  ownerScopeDigest: Sha256DigestSchema,
  preferenceRevision: z.number().int().positive(),
  requestedMode: z.enum(["default", "max"]),
  updatedAt: TimestampSchema,
  recordDigest: Sha256DigestSchema,
}).strict();

export type DesktopExperiencePreferenceOwnerIdentity = z.infer<
  typeof DesktopExperiencePreferenceOwnerIdentitySchema
>;
export type DesktopReasoningModePreference = z.infer<
  typeof DesktopReasoningModePreferenceSchema
>;

export type DesktopExperienceOwnerNamespace = Readonly<{
  namespaceRevision: number;
  namespaceKey: Uint8Array;
  namespaceKeyCheckDigest: Sha256Digest;
  lifecycleState: "active";
  createdAt: string;
  recordDigest: Sha256Digest;
}>;

export function createDesktopExperienceOwnerNamespace(input: Readonly<{
  namespaceRevision: number;
  namespaceKey?: Uint8Array;
  createdAt: string;
}>): DesktopExperienceOwnerNamespace {
  const namespaceKey = input.namespaceKey === undefined
    ? randomBytes(32)
    : Uint8Array.from(input.namespaceKey);
  if (namespaceKey.byteLength < 32 || namespaceKey.byteLength > 64) {
    throw new DesktopReasoningModeIntegrityError(
      "reasoning_mode.owner_namespace_key_invalid",
    );
  }
  const material = {
    namespaceRevision: z.number().int().positive().parse(input.namespaceRevision),
    namespaceKeyCheckDigest: namespaceKeyCheckDigest(namespaceKey),
    lifecycleState: "active" as const,
    createdAt: TimestampSchema.parse(input.createdAt),
  };
  return {
    ...material,
    namespaceKey,
    recordDigest: domainDigest(
      "robothree.desktop-experience-preference-owner-namespace-record.v1",
      material,
    ),
  };
}

export function validateDesktopExperienceOwnerNamespace(
  input: DesktopExperienceOwnerNamespace,
): DesktopExperienceOwnerNamespace {
  if (input.namespaceKey.byteLength < 32 || input.namespaceKey.byteLength > 64) {
    throw new DesktopReasoningModeIntegrityError(
      "reasoning_mode.owner_namespace_key_invalid",
    );
  }
  const material = {
    namespaceRevision: z.number().int().positive().parse(input.namespaceRevision),
    namespaceKeyCheckDigest: Sha256DigestSchema.parse(input.namespaceKeyCheckDigest),
    lifecycleState: z.literal("active").parse(input.lifecycleState),
    createdAt: TimestampSchema.parse(input.createdAt),
  };
  if (material.namespaceKeyCheckDigest !== namespaceKeyCheckDigest(input.namespaceKey)) {
    throw new DesktopReasoningModeIntegrityError(
      "reasoning_mode.owner_namespace_key_check_invalid",
    );
  }
  const expected = domainDigest(
    "robothree.desktop-experience-preference-owner-namespace-record.v1",
    material,
  );
  if (input.recordDigest !== expected) {
    throw new DesktopReasoningModeIntegrityError(
      "reasoning_mode.owner_namespace_record_invalid",
    );
  }
  return { ...input, namespaceKey: Uint8Array.from(input.namespaceKey) };
}

export function deriveDesktopExperiencePreferenceOwnerIdentity(
  namespace: DesktopExperienceOwnerNamespace,
  input: Readonly<{ enterpriseId: string; userId: string; deviceId: string }>,
): DesktopExperiencePreferenceOwnerIdentity {
  const validated = validateDesktopExperienceOwnerNamespace(namespace);
  const material = canonicalJsonStringify(JsonValueSchema.parse({
    schemaVersion: "v1alpha1",
    enterpriseId: nonemptyIdentity(input.enterpriseId),
    userId: nonemptyIdentity(input.userId),
    deviceId: nonemptyIdentity(input.deviceId),
  }));
  const hex = createHmac("sha256", validated.namespaceKey)
    .update(`${OWNER_DOMAIN}\n${material}`, "utf8")
    .digest("hex");
  return DesktopExperiencePreferenceOwnerIdentitySchema.parse({
    ownerScopeNamespaceRevision: validated.namespaceRevision,
    ownerScopeDigest: `sha256:${hex}`,
  });
}

export function createDesktopReasoningModePreference(input: Readonly<{
  ownerIdentity: DesktopExperiencePreferenceOwnerIdentity;
  preferenceRevision: number;
  requestedMode: ReasoningModePreference;
  updatedAt: string;
}>): DesktopReasoningModePreference {
  const owner = DesktopExperiencePreferenceOwnerIdentitySchema.parse(input.ownerIdentity);
  const material = {
    ownerScopeNamespaceRevision: owner.ownerScopeNamespaceRevision,
    ownerScopeDigest: owner.ownerScopeDigest,
    preferenceRevision: z.number().int().positive().parse(input.preferenceRevision),
    requestedMode: z.enum(["default", "max"]).parse(input.requestedMode),
    updatedAt: TimestampSchema.parse(input.updatedAt),
  };
  return DesktopReasoningModePreferenceSchema.parse({
    ...material,
    recordDigest: domainDigest(
      "robothree.desktop-reasoning-mode-preference-record.v1",
      material,
    ),
  });
}

export function validateDesktopReasoningModePreference(
  input: DesktopReasoningModePreference,
): DesktopReasoningModePreference {
  const parsed = DesktopReasoningModePreferenceSchema.parse(input);
  const { recordDigest, ...material } = parsed;
  if (recordDigest !== domainDigest(
    "robothree.desktop-reasoning-mode-preference-record.v1",
    material,
  )) {
    throw new DesktopReasoningModeIntegrityError(
      "reasoning_mode.preference_integrity_invalid",
    );
  }
  return parsed;
}

export function createDesktopReasoningModePreferenceReceipt(input: Readonly<{
  ownerIdentity: DesktopExperiencePreferenceOwnerIdentity;
  commandId: string;
  requestDigest: Sha256Digest;
  expectedPreferenceRevision: number;
  committedPreferenceRevision: number;
  requestedMode: ReasoningModePreference;
  committedAt: string;
}>): ReasoningModePreferenceReceipt & DesktopExperiencePreferenceOwnerIdentity {
  const owner = DesktopExperiencePreferenceOwnerIdentitySchema.parse(input.ownerIdentity);
  const material = {
    contractVersion: "v1alpha3" as const,
    commandId: input.commandId,
    requestDigest: input.requestDigest,
    expectedPreferenceRevision: input.expectedPreferenceRevision,
    committedPreferenceRevision: input.committedPreferenceRevision,
    requestedMode: input.requestedMode,
    outcome: "preference_committed" as const,
    committedAt: input.committedAt,
  };
  const receipt = ReasoningModePreferenceReceiptSchema.parse({
    ...material,
    receiptDigest: domainDigest(
      "robothree.desktop-reasoning-mode-preference-receipt.v1",
      { ...owner, ...material },
    ),
  });
  return { ...owner, ...receipt };
}

export function validateDesktopReasoningModePreferenceReceipt(
  input: ReasoningModePreferenceReceipt & DesktopExperiencePreferenceOwnerIdentity,
): ReasoningModePreferenceReceipt & DesktopExperiencePreferenceOwnerIdentity {
  const owner = DesktopExperiencePreferenceOwnerIdentitySchema.parse({
    ownerScopeNamespaceRevision: input.ownerScopeNamespaceRevision,
    ownerScopeDigest: input.ownerScopeDigest,
  });
  const receipt = ReasoningModePreferenceReceiptSchema.parse({
    contractVersion: input.contractVersion,
    commandId: input.commandId,
    requestDigest: input.requestDigest,
    expectedPreferenceRevision: input.expectedPreferenceRevision,
    committedPreferenceRevision: input.committedPreferenceRevision,
    requestedMode: input.requestedMode,
    outcome: input.outcome,
    committedAt: input.committedAt,
    receiptDigest: input.receiptDigest,
  });
  const { receiptDigest, ...material } = receipt;
  if (receiptDigest !== domainDigest(
    "robothree.desktop-reasoning-mode-preference-receipt.v1",
    { ...owner, ...material },
  )) {
    throw new DesktopReasoningModeIntegrityError(
      "reasoning_mode.preference_receipt_integrity_invalid",
    );
  }
  return { ...owner, ...receipt };
}

export function createReasoningProfile(
  input: Omit<ReasoningProfile, "profileRevision" | "profileDigest">,
): ReasoningProfile {
  const material = JsonValueSchema.parse(input);
  const digest = domainDigest("robothree.reasoning-profile.v1", material);
  return ReasoningProfileSchema.parse({
    ...input,
    profileRevision: digest,
    profileDigest: digest,
  });
}

export function validateReasoningProfile(input: ReasoningProfile): ReasoningProfile {
  const parsed = ReasoningProfileSchema.parse(input);
  const { profileRevision: _revision, profileDigest, ...material } = parsed;
  if (profileDigest !== domainDigest("robothree.reasoning-profile.v1", material)) {
    throw new DesktopReasoningModeIntegrityError("reasoning_mode.profile_integrity_invalid");
  }
  return parsed;
}

export function calculateReasoningSupportRevision(input: Readonly<{
  subject: ReasoningProfileSubject;
  profile?: ReasoningProfile;
}>): Sha256Digest {
  const subject = ReasoningProfileSubjectSchema.parse(input.subject);
  const profile = input.profile === undefined ? undefined : validateReasoningProfile(input.profile);
  if (profile !== undefined && !sameReasoningProfileSubject(profile.subject, subject)) {
    throw new DesktopReasoningModeIntegrityError("reasoning_mode.profile_subject_mismatch");
  }
  return domainDigest("robothree.reasoning-mode-support.v1", {
    effectiveModelId: subject.modelCapabilityId,
    effectiveModelRevision: subject.modelCapabilityRevision,
    modelCapabilityRevision: subject.modelCapabilityRevision,
    adapterDescriptorId: subject.adapterDescriptorId,
    adapterDescriptorRevision: subject.adapterDescriptorRevision,
    profileId: profile?.profileId ?? null,
    profileRevision: profile?.profileRevision ?? null,
    profileDigest: profile?.profileDigest ?? null,
    support: profile?.support ?? "unknown",
    safeUnavailableReasonCode: profile?.safeUnavailableReasonCode ?? null,
  });
}

export function calculateReasoningModePreferenceRequestDigest(
  command: UpdateReasoningModePreferenceCommand,
): Sha256Digest {
  return domainDigest("robothree.desktop-reasoning-mode-preference-request.v1", command);
}

export function sameReasoningProfileSubject(
  left: ReasoningProfileSubject,
  right: ReasoningProfileSubject,
): boolean {
  return canonicalJsonStringify(JsonValueSchema.parse(left))
    === canonicalJsonStringify(JsonValueSchema.parse(right));
}

export class DesktopReasoningModeIntegrityError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "DesktopReasoningModeIntegrityError";
  }
}

export const DesktopReasoningModeDomainConstants = Object.freeze({
  ownerDomain: OWNER_DOMAIN,
  namespaceKeyCheckDomain: NAMESPACE_KEY_CHECK_DOMAIN,
});

function namespaceKeyCheckDigest(key: Uint8Array): Sha256Digest {
  const hex = createHmac("sha256", key)
    .update(NAMESPACE_KEY_CHECK_DOMAIN, "utf8")
    .digest("hex");
  return Sha256DigestSchema.parse(`sha256:${hex}`);
}

function domainDigest(domain: string, material: unknown): Sha256Digest {
  return sha256CanonicalJson(JsonValueSchema.parse({ domain, material }));
}

function nonemptyIdentity(value: string): string {
  const normalized = value.normalize("NFC");
  if (normalized.length < 1 || normalized.length > 240) {
    throw new DesktopReasoningModeIntegrityError("reasoning_mode.owner_identity_invalid");
  }
  return normalized;
}
