import { z } from "zod";

export const PERSONAL_CREDENTIAL_HELPER_PROTOCOL_VERSION =
  "personal-keychain-helper.v1" as const;

const CredentialRef = z.string().regex(/^pmcr1\.[A-Za-z0-9_-]{43,86}$/u);
const Digest = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const EntityId = z.string().uuid();

export const PersonalCredentialHelperRequestSchema = z.object({
  protocolVersion: z.literal(PERSONAL_CREDENTIAL_HELPER_PROTOCOL_VERSION),
  operation: z.enum(["store", "replace", "inspect", "resolve", "delete"]),
  operationId: EntityId.optional(),
  credentialRef: CredentialRef,
  oldCredentialRef: CredentialRef.optional(),
  credentialRevision: z.number().int().positive().optional(),
  credentialBindingDigest: Digest.optional(),
  testKeychainPath: z.string().min(1).max(4_096).optional(),
  secretByteLength: z.number().int().min(0).max(16_384),
}).strict().superRefine((value, context) => {
  const mutation = value.operation === "store" || value.operation === "replace";
  if (mutation && (value.operationId === undefined
    || value.credentialRevision === undefined
    || value.credentialBindingDigest === undefined
    || value.secretByteLength === 0)) {
    context.addIssue({ code: "custom", message: "mutation metadata is incomplete" });
  }
  if (value.operation === "replace" && value.oldCredentialRef === undefined) {
    context.addIssue({ code: "custom", path: ["oldCredentialRef"], message: "replace needs old ref" });
  }
  if (value.operation === "delete" && value.operationId === undefined) {
    context.addIssue({ code: "custom", path: ["operationId"], message: "delete needs operation id" });
  }
  if (!mutation && value.secretByteLength !== 0) {
    context.addIssue({ code: "custom", path: ["secretByteLength"], message: "metadata command has body" });
  }
});

export const PersonalCredentialHelperResponseSchema = z.object({
  protocolVersion: z.literal(PERSONAL_CREDENTIAL_HELPER_PROTOCOL_VERSION),
  ok: z.boolean(),
  replayed: z.boolean(),
  code: z.enum([
    "ok",
    "invalid_request",
    "unavailable",
    "locked",
    "not_found",
    "access_denied",
    "corrupted",
    "cancelled",
    "conflict",
    "input_already_bound",
    "uncertain",
    "internal",
  ]),
  credentialRef: CredentialRef.optional(),
  createdByOperationId: EntityId.optional(),
  credentialRevision: z.number().int().positive().optional(),
  credentialBindingDigest: Digest.optional(),
  secretByteLength: z.number().int().min(0).max(16_384),
}).strict().superRefine((value, context) => {
  if (value.ok !== (value.code === "ok")) {
    context.addIssue({ code: "custom", path: ["code"], message: "helper result/code mismatch" });
  }
  if (!value.ok && value.replayed) {
    context.addIssue({ code: "custom", path: ["replayed"], message: "helper error cannot replay" });
  }
  if (!value.ok && value.secretByteLength !== 0) {
    context.addIssue({ code: "custom", path: ["secretByteLength"], message: "helper error carries body" });
  }
  const metadataCount = [
    value.credentialRef,
    value.createdByOperationId,
    value.credentialRevision,
    value.credentialBindingDigest,
  ].filter((item) => item !== undefined).length;
  if (metadataCount !== 0 && metadataCount !== 4) {
    context.addIssue({ code: "custom", message: "helper binding metadata must be complete" });
  }
});

export type PersonalCredentialHelperRequest = z.infer<
  typeof PersonalCredentialHelperRequestSchema
>;
export type PersonalCredentialHelperResponse = z.infer<
  typeof PersonalCredentialHelperResponseSchema
>;
