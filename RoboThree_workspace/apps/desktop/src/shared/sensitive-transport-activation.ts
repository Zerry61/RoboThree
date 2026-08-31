import {
  PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
  PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
} from "@robothree/contracts/desktop-private/personal-credential-transport-v1";

export const STRM3_SENSITIVE_TRANSPORT_ACTIVATION_SCHEMA_VERSION =
  "strm3-sensitive-transport-activation.v1" as const;
export const STRM3_SENSITIVE_TRANSPORT_ACTIVATION_REVISION =
  "sha256:05518b25b34c0554a029a435a93680f4cead19c16cf8bd9ad96ae80d4cc2edbf" as const;

export type SensitiveTransportActivationMaterial = Readonly<{
  schemaVersion: typeof STRM3_SENSITIVE_TRANSPORT_ACTIVATION_SCHEMA_VERSION;
  transportProtocolVersion: typeof PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION;
  transportProfileRevision: typeof PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION;
  activationState: "production_active";
  runtimeFallbackEnabled: false;
  zeroCopyClaimed: false;
  structuredCloneInternalCopiesReliablyClearable: false;
}>;

export type SensitiveTransportActivationDescriptor =
  SensitiveTransportActivationMaterial & Readonly<{
    activationRevision: typeof STRM3_SENSITIVE_TRANSPORT_ACTIVATION_REVISION;
  }>;

export const STRM3_SENSITIVE_TRANSPORT_ACTIVATION_MATERIAL = Object.freeze({
  schemaVersion: STRM3_SENSITIVE_TRANSPORT_ACTIVATION_SCHEMA_VERSION,
  transportProtocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
  transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
  activationState: "production_active",
  runtimeFallbackEnabled: false,
  zeroCopyClaimed: false,
  structuredCloneInternalCopiesReliablyClearable: false,
} satisfies SensitiveTransportActivationMaterial);

export const STRM3_SENSITIVE_TRANSPORT_ACTIVATION = Object.freeze({
  ...STRM3_SENSITIVE_TRANSPORT_ACTIVATION_MATERIAL,
  activationRevision: STRM3_SENSITIVE_TRANSPORT_ACTIVATION_REVISION,
} satisfies SensitiveTransportActivationDescriptor);

export function isExactSensitiveTransportActivationDescriptor(
  value: unknown,
): value is SensitiveTransportActivationDescriptor {
  if (!isRecord(value)) return false;
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
  return Object.keys(value).sort().join(",") === expectedKeys.join(",")
    && value.schemaVersion === STRM3_SENSITIVE_TRANSPORT_ACTIVATION_SCHEMA_VERSION
    && value.transportProtocolVersion === PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION
    && value.transportProfileRevision === PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION
    && value.activationRevision === STRM3_SENSITIVE_TRANSPORT_ACTIVATION_REVISION
    && value.activationState === "production_active"
    && value.runtimeFallbackEnabled === false
    && value.zeroCopyClaimed === false
    && value.structuredCloneInternalCopiesReliablyClearable === false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
