import { createHash } from "node:crypto";

import {
  PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
  PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
} from "@robothree/contracts/desktop-private/personal-credential-transport-v1";

const SCHEMA_VERSION = "strm3-sensitive-transport-activation.v1" as const;
const DIGEST_DOMAIN = "robothree.strm3-sensitive-transport-activation.v1\n";

export type SensitiveTransportBootDescriptor = Readonly<{
  schemaVersion: typeof SCHEMA_VERSION;
  transportProtocolVersion: typeof PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION;
  transportProfileRevision: typeof PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION;
  activationRevision: `sha256:${string}`;
  activationState: "production_active";
  runtimeFallbackEnabled: false;
  zeroCopyClaimed: false;
  structuredCloneInternalCopiesReliablyClearable: false;
}>;

export function validateSensitiveTransportBootDescriptor(
  value: unknown,
): SensitiveTransportBootDescriptor | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("sensitive_transport_activation_invalid");
  const expectedKeys = [
    "activationRevision",
    "activationState",
    "runtimeFallbackEnabled",
    "schemaVersion",
    "structuredCloneInternalCopiesReliablyClearable",
    "transportProfileRevision",
    "transportProtocolVersion",
    "zeroCopyClaimed",
  ];
  if (Object.keys(value).sort().join(",") !== expectedKeys.join(",")) {
    throw new Error("sensitive_transport_activation_invalid");
  }
  if (value.schemaVersion !== SCHEMA_VERSION
    || value.transportProtocolVersion !== PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION
    || value.transportProfileRevision !== PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION
    || value.activationState !== "production_active"
    || value.runtimeFallbackEnabled !== false
    || value.zeroCopyClaimed !== false
    || value.structuredCloneInternalCopiesReliablyClearable !== false) {
    throw new Error("sensitive_transport_activation_invalid");
  }
  const material = {
    schemaVersion: value.schemaVersion,
    transportProtocolVersion: value.transportProtocolVersion,
    transportProfileRevision: value.transportProfileRevision,
    activationState: value.activationState,
    runtimeFallbackEnabled: value.runtimeFallbackEnabled,
    zeroCopyClaimed: value.zeroCopyClaimed,
    structuredCloneInternalCopiesReliablyClearable:
      value.structuredCloneInternalCopiesReliablyClearable,
  } satisfies Omit<SensitiveTransportBootDescriptor, "activationRevision">;
  if (value.activationRevision !== activationRevision(material)) {
    throw new Error("sensitive_transport_activation_invalid");
  }
  return Object.freeze({
    ...material,
    activationRevision: value.activationRevision as `sha256:${string}`,
  }) as SensitiveTransportBootDescriptor;
}

export function activationRevision(
  material: Omit<SensitiveTransportBootDescriptor, "activationRevision">,
): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(DIGEST_DOMAIN)
    .update(JSON.stringify(material))
    .digest("hex")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
