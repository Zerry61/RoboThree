import { z } from "zod";

const UUID = z.string().uuid();
const Digest = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ResourceId = z.string()
  .min(3)
  .max(160)
  .regex(/^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u);

export const PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION =
  "personal-credential-transport.v1" as const;
export const PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION =
  "personal-credential.route-a.structured-clone.v1" as const;
export const PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES = 16_384;
export const PERSONAL_CREDENTIAL_TRANSPORT_TICKET_TTL_MS = 5_000;
export const PERSONAL_CREDENTIAL_TRANSPORT_TOMBSTONE_TTL_MS = 10 * 60_000;
export const PERSONAL_CREDENTIAL_TRANSPORT_MAX_INFLIGHT = 4;
export const PERSONAL_CREDENTIAL_TRANSPORT_MAX_REGISTRY = 256;

export const PersonalCredentialTransportProfileSchema = z.object({
  protocolVersion: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION),
  transportProfileRevision: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION),
  route: z.literal("route_a_structured_clone_uint8array"),
  maximumBodyBytes: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES),
  structuredCloneUsed: z.literal(true),
  zeroCopyClaimed: z.literal(false),
  internalCopiesReliablyClearable: z.literal(false),
  runtimeFallbackEnabled: z.literal(false),
  productionFeatureDefaultEnabled: z.literal(false),
}).strict();

export const PERSONAL_CREDENTIAL_TRANSPORT_PROFILE = Object.freeze(
  PersonalCredentialTransportProfileSchema.parse({
    protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
    transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
    route: "route_a_structured_clone_uint8array",
    maximumBodyBytes: PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES,
    structuredCloneUsed: true,
    zeroCopyClaimed: false,
    internalCopiesReliablyClearable: false,
    runtimeFallbackEnabled: false,
    productionFeatureDefaultEnabled: false,
  }),
);

export const PersonalCredentialTransportOperationTypeSchema = z.enum([
  "create",
  "update",
  "reveal",
]);

export const PersonalCredentialTransportFrameTypeSchema = z.enum([
  "mutation_secret",
  "reveal_secret",
  "terminal_ack",
  "cancel",
]);

export const PersonalCredentialTransportErrorCodeSchema = z.enum([
  "personal_credential_transport_unavailable",
  "personal_credential_transport_rejected",
  "personal_credential_transport_invalid_ticket",
  "personal_credential_transport_profile_mismatch",
  "personal_credential_transport_identity_mismatch",
  "personal_credential_transport_expired",
  "personal_credential_transport_busy",
  "personal_credential_transport_duplicate",
  "personal_credential_transport_replay_forbidden",
  "personal_credential_transport_invalid_frame",
  "personal_credential_transport_body_empty",
  "personal_credential_transport_body_oversize",
  "personal_credential_transport_navigation_invalidated",
  "personal_credential_transport_process_lost",
  "personal_credential_transport_timed_out",
  "personal_credential_transport_cancelled",
  "personal_credential_transport_uncertain",
]);

export const PersonalCredentialTransportTicketMaterialSchema = z.object({
  schemaVersion: z.literal("personal-credential-transport-ticket.v1"),
  transportProfileRevision: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION),
  runtimeInstanceId: UUID,
  clientInstanceId: UUID,
  commandId: UUID,
  correlationId: UUID,
  operationType: PersonalCredentialTransportOperationTypeSchema,
  personalModelId: ResourceId,
  expectedConfigurationRevision: Digest,
  requestDigest: Digest,
  webContentsId: z.number().int().nonnegative(),
  mainFrameRoutingId: z.number().int().nonnegative(),
  navigationEpoch: z.number().int().min(1),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();

export const PersonalCredentialTransportTicketSchema =
  PersonalCredentialTransportTicketMaterialSchema.extend({
    ticketDigest: Digest,
  }).strict();

export const PersonalCredentialTransportFrameHeaderMaterialSchema = z.object({
  protocolVersion: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION),
  transportProfileRevision: z.literal(PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION),
  commandId: UUID,
  correlationId: UUID,
  frameType: PersonalCredentialTransportFrameTypeSchema,
  bodyLength: z.number().int().min(0).max(PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES),
}).strict();

export const PersonalCredentialTransportFrameHeaderSchema =
  PersonalCredentialTransportFrameHeaderMaterialSchema.extend({
    frameDigest: Digest,
  }).strict();

export type PersonalCredentialTransportProfile = z.infer<
  typeof PersonalCredentialTransportProfileSchema
>;
export type PersonalCredentialTransportOperationType = z.infer<
  typeof PersonalCredentialTransportOperationTypeSchema
>;
export type PersonalCredentialTransportFrameType = z.infer<
  typeof PersonalCredentialTransportFrameTypeSchema
>;
export type PersonalCredentialTransportErrorCode = z.infer<
  typeof PersonalCredentialTransportErrorCodeSchema
>;
export type PersonalCredentialTransportTicketMaterial = z.infer<
  typeof PersonalCredentialTransportTicketMaterialSchema
>;
export type PersonalCredentialTransportTicket = z.infer<
  typeof PersonalCredentialTransportTicketSchema
>;
export type PersonalCredentialTransportFrameHeaderMaterial = z.infer<
  typeof PersonalCredentialTransportFrameHeaderMaterialSchema
>;
export type PersonalCredentialTransportFrameHeader = z.infer<
  typeof PersonalCredentialTransportFrameHeaderSchema
>;

export function personalCredentialTransportTicketMaterial(
  ticket: PersonalCredentialTransportTicket,
): PersonalCredentialTransportTicketMaterial {
  const { ticketDigest: _ticketDigest, ...material } =
    PersonalCredentialTransportTicketSchema.parse(ticket);
  return PersonalCredentialTransportTicketMaterialSchema.parse(material);
}

export function personalCredentialTransportFrameHeaderMaterial(
  header: PersonalCredentialTransportFrameHeader,
): PersonalCredentialTransportFrameHeaderMaterial {
  const { frameDigest: _frameDigest, ...material } =
    PersonalCredentialTransportFrameHeaderSchema.parse(header);
  return PersonalCredentialTransportFrameHeaderMaterialSchema.parse(material);
}

export function canonicalPersonalCredentialTransportTicketMaterial(
  material: PersonalCredentialTransportTicketMaterial,
): string {
  const value = PersonalCredentialTransportTicketMaterialSchema.parse(material);
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    transportProfileRevision: value.transportProfileRevision,
    runtimeInstanceId: value.runtimeInstanceId,
    clientInstanceId: value.clientInstanceId,
    commandId: value.commandId,
    correlationId: value.correlationId,
    operationType: value.operationType,
    personalModelId: value.personalModelId,
    expectedConfigurationRevision: value.expectedConfigurationRevision,
    requestDigest: value.requestDigest,
    webContentsId: value.webContentsId,
    mainFrameRoutingId: value.mainFrameRoutingId,
    navigationEpoch: value.navigationEpoch,
    expiresAt: value.expiresAt,
  });
}

export function canonicalPersonalCredentialTransportFrameMaterial(
  material: PersonalCredentialTransportFrameHeaderMaterial,
): string {
  const value = PersonalCredentialTransportFrameHeaderMaterialSchema.parse(material);
  return JSON.stringify({
    protocolVersion: value.protocolVersion,
    transportProfileRevision: value.transportProfileRevision,
    commandId: value.commandId,
    correlationId: value.correlationId,
    frameType: value.frameType,
    bodyLength: value.bodyLength,
  });
}
