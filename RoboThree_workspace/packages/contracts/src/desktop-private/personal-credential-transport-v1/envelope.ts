import {
  PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES,
  PersonalCredentialTransportFrameHeaderSchema,
  type PersonalCredentialTransportFrameHeader,
} from "./protocol.js";

export type PersonalCredentialTransportBinaryEnvelope = Readonly<{
  header: PersonalCredentialTransportFrameHeader;
  body: Uint8Array;
}>;

export class PersonalCredentialTransportContractError extends Error {
  public constructor(readonly code: string) {
    super(code);
    this.name = "PersonalCredentialTransportContractError";
  }
}

export function parsePersonalCredentialTransportBinaryEnvelope(
  input: unknown,
): PersonalCredentialTransportBinaryEnvelope {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new PersonalCredentialTransportContractError(
      "personal_credential_transport_invalid_frame",
    );
  }
  const keys = Object.keys(input).sort();
  if (keys.length !== 2 || keys[0] !== "body" || keys[1] !== "header") {
    throw new PersonalCredentialTransportContractError(
      "personal_credential_transport_invalid_frame",
    );
  }
  const candidate = input as Readonly<{ header?: unknown; body?: unknown }>;
  const header = PersonalCredentialTransportFrameHeaderSchema.parse(candidate.header);
  const body = candidate.body;
  if (!(body instanceof Uint8Array)
    || Object.prototype.toString.call(body) !== "[object Uint8Array]") {
    throw new PersonalCredentialTransportContractError(
      "personal_credential_transport_invalid_frame",
    );
  }
  if (typeof SharedArrayBuffer !== "undefined"
    && body.buffer instanceof SharedArrayBuffer) {
    throw new PersonalCredentialTransportContractError(
      "personal_credential_transport_invalid_frame",
    );
  }
  if (Reflect.get(body.buffer, "detached") === true) {
    throw new PersonalCredentialTransportContractError(
      "personal_credential_transport_invalid_frame",
    );
  }
  if (body.byteLength !== header.bodyLength) {
    throw new PersonalCredentialTransportContractError(
      "personal_credential_transport_invalid_frame",
    );
  }
  if (body.byteLength > PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES) {
    throw new PersonalCredentialTransportContractError(
      "personal_credential_transport_body_oversize",
    );
  }
  const secretFrame = header.frameType === "mutation_secret"
    || header.frameType === "reveal_secret";
  if (secretFrame && body.byteLength === 0) {
    throw new PersonalCredentialTransportContractError(
      "personal_credential_transport_body_empty",
    );
  }
  if (!secretFrame && body.byteLength !== 0) {
    throw new PersonalCredentialTransportContractError(
      "personal_credential_transport_invalid_frame",
    );
  }
  return Object.freeze({ header, body });
}
