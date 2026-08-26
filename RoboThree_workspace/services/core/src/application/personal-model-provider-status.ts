import {
  Sha256DigestSchema,
  type PersonalModelStatus,
  type Sha256Digest,
} from "@robothree/contracts";

export type PersonalModelProviderObservation = Readonly<{
  status: PersonalModelStatus;
  detailCode: string;
  detailDigest?: Sha256Digest;
}>;

export type PersonalModelProviderFailureKind =
  | "authentication"
  | "model_not_found"
  | "network"
  | "protocol"
  | "runtime_unavailable"
  | "permission_denied"
  | "provider_transient"
  | "cancelled"
  | "deadline";

export function mapPersonalModelProviderObservation(
  kind: "success" | PersonalModelProviderFailureKind,
  detailCode?: string,
  detailDigest?: string,
): PersonalModelProviderObservation | undefined {
  if (kind === "cancelled" || kind === "deadline") return undefined;
  const status: PersonalModelStatus = kind === "success"
    ? "available"
    : kind === "authentication"
      ? "authentication_failed"
      : kind === "model_not_found"
        ? "model_not_found"
        : kind === "network"
          ? "network_failed"
          : kind === "protocol"
            ? "protocol_incompatible"
            : kind === "permission_denied"
              ? "permission_denied"
              : "unavailable";
  return Object.freeze({
    status,
    detailCode: detailCode ?? `personal_model.provider_${kind}`,
    ...(detailDigest === undefined
      ? {}
      : { detailDigest: Sha256DigestSchema.parse(detailDigest) }),
  });
}
