import { z } from "zod";

import {
  PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
  PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
  PersonalCredentialTransportErrorCodeSchema,
  PersonalCredentialTransportTicketSchema,
} from "./protocol.js";

const UUID = z.string().uuid();
const Digest = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ResourceId = z.string()
  .min(3)
  .max(160)
  .regex(/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u);

export const PERSONAL_CREDENTIAL_TRANSPORT_PORT_CHANNEL =
  "robothree:personal-credential-transport:port-v1" as const;

export const PersonalCredentialTransportControlTypeSchema = z.enum([
  "ready",
  "terminal_ack",
  "cancel",
]);

export const PersonalCredentialTransportTerminalSchema = z.enum([
  "completed",
  "rejected",
  "cancelled",
  "timed_out",
  "uncertain",
]);

export const PersonalCredentialTransportControlMaterialSchema = z.object({
  protocolVersion: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION),
  transportProfileRevision: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION),
  commandId: UUID,
  correlationId: UUID,
  controlType: PersonalCredentialTransportControlTypeSchema,
  terminal: PersonalCredentialTransportTerminalSchema.optional(),
  typedErrorCode: PersonalCredentialTransportErrorCodeSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.controlType !== "terminal_ack") {
    if (value.terminal !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["terminal"],
        message: "ready and cancel control messages must not include a terminal",
      });
    }
    if (value.typedErrorCode !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["typedErrorCode"],
        message: "ready and cancel control messages must not include an error code",
      });
    }
    return;
  }
  if (value.terminal === undefined) {
    context.addIssue({
      code: "custom",
      path: ["terminal"],
      message: "terminal acknowledgement requires a terminal",
    });
    return;
  }
  if (value.terminal === "completed" && value.typedErrorCode !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["typedErrorCode"],
      message: "completed acknowledgement must not include an error code",
    });
  }
  if (value.terminal !== "completed" && value.typedErrorCode === undefined) {
    context.addIssue({
      code: "custom",
      path: ["typedErrorCode"],
      message: "non-completed acknowledgement requires a typed error code",
    });
  }
  if (value.terminal === "cancelled"
    && value.typedErrorCode !== "personal_credential_transport_cancelled") {
    context.addIssue({
      code: "custom",
      path: ["typedErrorCode"],
      message: "cancelled acknowledgement requires the cancelled transport code",
    });
  }
  if (value.terminal === "timed_out"
    && value.typedErrorCode !== "personal_credential_transport_timed_out") {
    context.addIssue({
      code: "custom",
      path: ["typedErrorCode"],
      message: "timed-out acknowledgement requires the timed-out transport code",
    });
  }
  if (value.terminal === "uncertain"
    && value.typedErrorCode !== "personal_credential_transport_uncertain"
    && value.typedErrorCode !== "personal_credential_transport_navigation_invalidated"
    && value.typedErrorCode !== "personal_credential_transport_process_lost") {
    context.addIssue({
      code: "custom",
      path: ["typedErrorCode"],
      message: "uncertain acknowledgement requires an uncertain transport code",
    });
  }
  if (value.terminal === "rejected"
    && (value.typedErrorCode === "personal_credential_transport_cancelled"
      || value.typedErrorCode === "personal_credential_transport_timed_out"
      || value.typedErrorCode === "personal_credential_transport_uncertain"
      || value.typedErrorCode === "personal_credential_transport_navigation_invalidated"
      || value.typedErrorCode === "personal_credential_transport_process_lost")) {
    context.addIssue({
      code: "custom",
      path: ["typedErrorCode"],
      message: "rejected acknowledgement requires a rejection-specific transport code",
    });
  }
});

export const PersonalCredentialTransportControlMessageSchema =
  PersonalCredentialTransportControlMaterialSchema.safeExtend({
    controlDigest: Digest,
  }).strict();

export const PersonalCredentialTransportPortOfferSchema = z.object({
  protocolVersion: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION),
  transportProfileRevision: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION),
  ticket: PersonalCredentialTransportTicketSchema,
  readyControl: PersonalCredentialTransportControlMessageSchema,
  cancelControl: PersonalCredentialTransportControlMessageSchema,
}).strict().superRefine((value, context) => {
  for (const [field, controlType] of [
    ["readyControl", "ready"],
    ["cancelControl", "cancel"],
  ] as const) {
    const control = value[field];
    if (control.controlType !== controlType
      || control.commandId !== value.ticket.commandId
      || control.correlationId !== value.ticket.correlationId
      || control.transportProfileRevision !== value.ticket.transportProfileRevision) {
      context.addIssue({
        code: "custom",
        path: [field],
        message: `${field} must be exact-ticket-bound ${controlType} control`,
      });
    }
  }
});

export const PersonalCredentialTransportPreparedCommandSchema = z.object({
  schemaVersion: z.literal("personal-credential-transport-prepared-command.v1"),
  runtimeInstanceId: UUID,
  clientInstanceId: UUID,
  commandId: UUID,
  correlationId: UUID,
  operationType: z.enum(["create", "update", "reveal"]),
  personalModelId: ResourceId,
  expectedConfigurationRevision: Digest,
  expectedExecutionDefinitionDigest: Digest.optional(),
  requestDigest: Digest,
  deadlineAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (value.operationType === "reveal"
    && value.expectedExecutionDefinitionDigest === undefined) {
    context.addIssue({
      code: "custom",
      path: ["expectedExecutionDefinitionDigest"],
      message: "reveal requires an exact execution definition digest",
    });
  }
  if (value.operationType !== "reveal"
    && value.expectedExecutionDefinitionDigest !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["expectedExecutionDefinitionDigest"],
      message: "mutation does not carry reveal execution identity",
    });
  }
});

export type PersonalCredentialTransportControlType = z.infer<
  typeof PersonalCredentialTransportControlTypeSchema
>;
export type PersonalCredentialTransportTerminal = z.infer<
  typeof PersonalCredentialTransportTerminalSchema
>;
export type PersonalCredentialTransportControlMaterial = z.infer<
  typeof PersonalCredentialTransportControlMaterialSchema
>;
export type PersonalCredentialTransportControlMessage = z.infer<
  typeof PersonalCredentialTransportControlMessageSchema
>;
export type PersonalCredentialTransportPortOffer = z.infer<
  typeof PersonalCredentialTransportPortOfferSchema
>;
export type PersonalCredentialTransportPreparedCommand = z.infer<
  typeof PersonalCredentialTransportPreparedCommandSchema
>;

export function personalCredentialTransportControlMaterial(
  input: PersonalCredentialTransportControlMessage,
): PersonalCredentialTransportControlMaterial {
  const { controlDigest: _controlDigest, ...material } =
    PersonalCredentialTransportControlMessageSchema.parse(input);
  return PersonalCredentialTransportControlMaterialSchema.parse(material);
}

export function canonicalPersonalCredentialTransportControlMaterial(
  input: PersonalCredentialTransportControlMaterial,
): string {
  const value = PersonalCredentialTransportControlMaterialSchema.parse(input);
  return JSON.stringify({
    protocolVersion: value.protocolVersion,
    transportProfileRevision: value.transportProfileRevision,
    commandId: value.commandId,
    correlationId: value.correlationId,
    controlType: value.controlType,
    terminal: value.terminal ?? null,
    typedErrorCode: value.typedErrorCode ?? null,
  });
}
