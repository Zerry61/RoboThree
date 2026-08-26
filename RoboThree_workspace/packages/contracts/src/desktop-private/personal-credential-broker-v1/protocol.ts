import { z } from "zod";

const UUID = z.string().uuid();
const Digest = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ResourceId = z.string()
  .min(3)
  .max(160)
  .regex(/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u);

export const PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION =
  "personal-credential-broker.v1" as const;
export const PERSONAL_CREDENTIAL_BROKER_MAX_HEADER_BYTES = 16_384;
export const PERSONAL_CREDENTIAL_BROKER_MAX_SECRET_BYTES = 16_384;

export const PersonalCredentialBrokerCommandTypeSchema = z.enum([
  "create",
  "update",
  "delete",
  "reveal",
]);

export const PersonalCredentialBrokerStatusSchema = z.enum([
  "completed",
  "rejected",
  "cancelled",
  "timed_out",
  "uncertain",
]);

export const PersonalCredentialBrokerErrorCodeSchema = z.enum([
  "credential_transport_unavailable",
  "credential_transport_invalid_request",
  "credential_transport_conflict",
  "credential_transport_busy",
  "credential_store_unavailable",
  "credential_store_locked",
  "credential_store_not_found",
  "credential_store_access_denied",
  "credential_store_corrupted",
  "credential_store_cancelled",
  "credential_store_conflict",
  "credential_input_already_bound",
  "credential_reveal_replay_forbidden",
  "credential_operation_uncertain",
  "credential_store_internal",
]);

export const PersonalCredentialBrokerRequestHeaderSchema = z.object({
  protocolVersion: z.literal(PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION),
  channelInstanceId: UUID,
  commandId: UUID,
  commandType: PersonalCredentialBrokerCommandTypeSchema,
  transportRequestId: UUID,
  clientInstanceId: UUID,
  personalModelId: ResourceId,
  expectedConfigurationRevision: Digest.optional(),
  expectedExecutionDefinitionDigest: Digest.optional(),
  commandRequestDigest: Digest,
  deadlineAt: z.string().datetime({ offset: true }),
  secretByteLength: z.number().int().min(0)
    .max(PERSONAL_CREDENTIAL_BROKER_MAX_SECRET_BYTES),
}).strict().superRefine((value, context) => {
  const needsSecret = value.commandType === "create" || value.commandType === "update";
  if (needsSecret === (value.secretByteLength === 0)) {
    context.addIssue({
      code: "custom",
      path: ["secretByteLength"],
      message: needsSecret
        ? "credential mutation requires bounded Secret bytes"
        : "metadata-only command must not carry Secret bytes",
    });
  }
  if (value.commandType === "reveal"
    && (value.expectedConfigurationRevision === undefined
      || value.expectedExecutionDefinitionDigest === undefined)) {
    context.addIssue({
      code: "custom",
      path: ["expectedConfigurationRevision"],
      message: "reveal requires exact configuration and execution identity",
    });
  }
});

export const PersonalCredentialBrokerResponseHeaderSchema = z.object({
  protocolVersion: z.literal(PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION),
  channelInstanceId: UUID,
  commandId: UUID,
  transportRequestId: UUID,
  status: PersonalCredentialBrokerStatusSchema,
  typedErrorCode: PersonalCredentialBrokerErrorCodeSchema.optional(),
  secretByteLength: z.number().int().min(0)
    .max(PERSONAL_CREDENTIAL_BROKER_MAX_SECRET_BYTES),
}).strict().superRefine((value, context) => {
  if (value.status === "completed" && value.typedErrorCode !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["typedErrorCode"],
      message: "completed result must not include an error code",
    });
  }
  if (value.status !== "completed" && value.typedErrorCode === undefined) {
    context.addIssue({
      code: "custom",
      path: ["typedErrorCode"],
      message: "non-completed result requires a typed error code",
    });
  }
  if (value.status !== "completed" && value.secretByteLength !== 0) {
    context.addIssue({
      code: "custom",
      path: ["secretByteLength"],
      message: "non-completed result must not carry Secret bytes",
    });
  }
});

export type PersonalCredentialBrokerCommandType = z.infer<
  typeof PersonalCredentialBrokerCommandTypeSchema
>;
export type PersonalCredentialBrokerRequestHeader = z.infer<
  typeof PersonalCredentialBrokerRequestHeaderSchema
>;
export type PersonalCredentialBrokerResponseHeader = z.infer<
  typeof PersonalCredentialBrokerResponseHeaderSchema
>;
export type PersonalCredentialBrokerErrorCode = z.infer<
  typeof PersonalCredentialBrokerErrorCodeSchema
>;
