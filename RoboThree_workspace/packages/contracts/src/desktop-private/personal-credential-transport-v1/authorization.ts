import { z } from "zod";

import {
  PersonalCredentialTransportControlMessageSchema,
} from "./control.js";
import {
  PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES,
  PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
  PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
  PersonalCredentialTransportFrameHeaderSchema,
} from "./protocol.js";

const UUID = z.string().uuid();
const Digest = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const PersonalCredentialTransportDirectionSchema = z.enum([
  "mutation_to_main",
  "reveal_to_preload",
]);

export const PersonalCredentialTransportFrameAuthorizationRequestSchema = z.object({
  schemaVersion: z.literal(
    "personal-credential-transport-frame-authorization-request.v1",
  ),
  protocolVersion: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION),
  transportProfileRevision: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION),
  commandId: UUID,
  correlationId: UUID,
  direction: z.literal("mutation_to_main"),
  frameType: z.literal("mutation_secret"),
  bodyLength: z.number().int().min(1).max(PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES),
}).strict();

export const PersonalCredentialTransportFrameAuthorizationMaterialSchema = z.object({
  schemaVersion: z.literal("personal-credential-transport-frame-authorization.v1"),
  authorizationId: UUID,
  protocolVersion: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION),
  transportProfileRevision: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION),
  commandId: UUID,
  correlationId: UUID,
  direction: PersonalCredentialTransportDirectionSchema,
  frameType: z.enum(["mutation_secret", "reveal_secret"]),
  bodyLength: z.number().int().min(1).max(PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES),
  frameDigest: Digest,
  ticketDigest: Digest,
  runtimeInstanceId: UUID,
  clientInstanceId: UUID,
  webContentsId: z.number().int().nonnegative(),
  mainFrameRoutingId: z.number().int().nonnegative(),
  navigationEpoch: z.number().int().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  revealCompletedAckDigest: Digest.optional(),
  revealUncertainAckDigest: Digest.optional(),
}).strict().superRefine((value, context) => {
  const mutation = value.direction === "mutation_to_main";
  if (mutation !== (value.frameType === "mutation_secret")) {
    context.addIssue({
      code: "custom",
      path: ["frameType"],
      message: "direction and frame type must match",
    });
  }
  const hasCompleted = value.revealCompletedAckDigest !== undefined;
  const hasUncertain = value.revealUncertainAckDigest !== undefined;
  if (mutation && (hasCompleted || hasUncertain)) {
    context.addIssue({
      code: "custom",
      path: ["revealCompletedAckDigest"],
      message: "mutation authorization must not include reveal acknowledgement digests",
    });
  }
  if (!mutation && (!hasCompleted || !hasUncertain)) {
    context.addIssue({
      code: "custom",
      path: ["revealCompletedAckDigest"],
      message: "reveal authorization requires completed and uncertain acknowledgements",
    });
  }
});

export const PersonalCredentialTransportFrameAuthorizationSchema =
  PersonalCredentialTransportFrameAuthorizationMaterialSchema.safeExtend({
    frameHeader: PersonalCredentialTransportFrameHeaderSchema,
    authorizationDigest: Digest,
    revealCompletedAck: PersonalCredentialTransportControlMessageSchema.optional(),
    revealUncertainAck: PersonalCredentialTransportControlMessageSchema.optional(),
  }).strict().superRefine((value, context) => {
    const header = value.frameHeader;
    if (header.commandId !== value.commandId
      || header.correlationId !== value.correlationId
      || header.transportProfileRevision !== value.transportProfileRevision
      || header.frameType !== value.frameType
      || header.bodyLength !== value.bodyLength
      || header.frameDigest !== value.frameDigest) {
      context.addIssue({
        code: "custom",
        path: ["frameHeader"],
        message: "frame header must match the authorized frame material",
      });
    }
    const mutation = value.direction === "mutation_to_main";
    if (mutation && (value.revealCompletedAck !== undefined
      || value.revealUncertainAck !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["revealCompletedAck"],
        message: "mutation authorization must not include reveal acknowledgements",
      });
      return;
    }
    if (mutation) return;
    const completed = value.revealCompletedAck;
    const uncertain = value.revealUncertainAck;
    if (completed === undefined
      || completed.controlType !== "terminal_ack"
      || completed.terminal !== "completed"
      || completed.commandId !== value.commandId
      || completed.correlationId !== value.correlationId
      || completed.controlDigest !== value.revealCompletedAckDigest) {
      context.addIssue({
        code: "custom",
        path: ["revealCompletedAck"],
        message: "reveal completed acknowledgement must be exact-command-bound",
      });
    }
    if (uncertain === undefined
      || uncertain.controlType !== "terminal_ack"
      || uncertain.terminal !== "uncertain"
      || uncertain.typedErrorCode !== "personal_credential_transport_uncertain"
      || uncertain.commandId !== value.commandId
      || uncertain.correlationId !== value.correlationId
      || uncertain.controlDigest !== value.revealUncertainAckDigest) {
      context.addIssue({
        code: "custom",
        path: ["revealUncertainAck"],
        message: "reveal uncertain acknowledgement must be exact-command-bound",
      });
    }
  });

export type PersonalCredentialTransportDirection = z.infer<
  typeof PersonalCredentialTransportDirectionSchema
>;
export type PersonalCredentialTransportFrameAuthorizationRequest = z.infer<
  typeof PersonalCredentialTransportFrameAuthorizationRequestSchema
>;
export type PersonalCredentialTransportFrameAuthorizationMaterial = z.infer<
  typeof PersonalCredentialTransportFrameAuthorizationMaterialSchema
>;
export type PersonalCredentialTransportFrameAuthorization = z.infer<
  typeof PersonalCredentialTransportFrameAuthorizationSchema
>;

export function personalCredentialTransportFrameAuthorizationMaterial(
  input: PersonalCredentialTransportFrameAuthorization,
): PersonalCredentialTransportFrameAuthorizationMaterial {
  const {
    frameHeader: _frameHeader,
    authorizationDigest: _authorizationDigest,
    revealCompletedAck: _revealCompletedAck,
    revealUncertainAck: _revealUncertainAck,
    ...material
  } = PersonalCredentialTransportFrameAuthorizationSchema.parse(input);
  return PersonalCredentialTransportFrameAuthorizationMaterialSchema.parse(material);
}

export function canonicalPersonalCredentialTransportFrameAuthorizationMaterial(
  input: PersonalCredentialTransportFrameAuthorizationMaterial,
): string {
  const value = PersonalCredentialTransportFrameAuthorizationMaterialSchema.parse(input);
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    authorizationId: value.authorizationId,
    protocolVersion: value.protocolVersion,
    transportProfileRevision: value.transportProfileRevision,
    commandId: value.commandId,
    correlationId: value.correlationId,
    direction: value.direction,
    frameType: value.frameType,
    bodyLength: value.bodyLength,
    frameDigest: value.frameDigest,
    ticketDigest: value.ticketDigest,
    runtimeInstanceId: value.runtimeInstanceId,
    clientInstanceId: value.clientInstanceId,
    webContentsId: value.webContentsId,
    mainFrameRoutingId: value.mainFrameRoutingId,
    navigationEpoch: value.navigationEpoch,
    expiresAt: value.expiresAt,
    revealCompletedAckDigest: value.revealCompletedAckDigest ?? null,
    revealUncertainAckDigest: value.revealUncertainAckDigest ?? null,
  });
}
