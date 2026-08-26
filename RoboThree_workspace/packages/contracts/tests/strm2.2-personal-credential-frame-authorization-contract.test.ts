import {
  PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES,
  PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
  PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
  PersonalCredentialTransportFrameAuthorizationMaterialSchema,
  PersonalCredentialTransportFrameAuthorizationRequestSchema,
  canonicalPersonalCredentialTransportFrameAuthorizationMaterial,
} from "@robothree/contracts/desktop-private/personal-credential-transport-v1";
import { describe, expect, it } from "vitest";

const digest = `sha256:${"a".repeat(64)}`;

describe("STRM-2.2 frame authorization Contract", () => {
  it("only permits a bounded mutation authorization request", () => {
    expect(request(1)).toMatchObject({
      direction: "mutation_to_main",
      frameType: "mutation_secret",
    });
    expect(request(PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES).bodyLength)
      .toBe(PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES);
    expect(() => request(0)).toThrow();
    expect(() => request(PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES + 1)).toThrow();
    expect(() => PersonalCredentialTransportFrameAuthorizationRequestSchema.parse({
      ...request(1),
      direction: "reveal_to_preload",
    })).toThrow();
  });

  it("keeps the request strict and free of authority or Secret material", () => {
    expect(() => PersonalCredentialTransportFrameAuthorizationRequestSchema.parse({
      ...request(1),
      ownerScopeDigest: digest,
    })).toThrow();
    expect(() => PersonalCredentialTransportFrameAuthorizationRequestSchema.parse({
      ...request(1),
      credentialRef: "credential.private.test",
    })).toThrow();
  });

  it("requires direction and frame type to match", () => {
    expect(() => material({
      direction: "mutation_to_main",
      frameType: "reveal_secret",
    })).toThrow();
    expect(() => material({
      direction: "reveal_to_preload",
      frameType: "mutation_secret",
      revealCompletedAckDigest: digest,
      revealUncertainAckDigest: digest,
    })).toThrow();
  });

  it("forbids reveal acknowledgements on mutation authorization", () => {
    expect(material({
      direction: "mutation_to_main",
      frameType: "mutation_secret",
    })).toMatchObject({ direction: "mutation_to_main" });
    expect(() => material({
      direction: "mutation_to_main",
      frameType: "mutation_secret",
      revealCompletedAckDigest: digest,
    })).toThrow();
  });

  it("requires both pre-signed acknowledgements on reveal authorization", () => {
    expect(() => material({
      direction: "reveal_to_preload",
      frameType: "reveal_secret",
    })).toThrow();
    expect(material({
      direction: "reveal_to_preload",
      frameType: "reveal_secret",
      revealCompletedAckDigest: digest,
      revealUncertainAckDigest: digest,
    })).toMatchObject({ direction: "reveal_to_preload" });
  });

  it("canonicalizes only non-secret transport identity", () => {
    const canonical = canonicalPersonalCredentialTransportFrameAuthorizationMaterial(
      material({
        direction: "mutation_to_main",
        frameType: "mutation_secret",
      }),
    );
    for (const expected of [
      '"ticketDigest"',
      '"runtimeInstanceId"',
      '"webContentsId"',
      '"frameDigest"',
    ]) expect(canonical).toContain(expected);
    for (const forbidden of [
      "secretValue",
      "credentialRef",
      "ownerScopeDigest",
      "endpoint",
      "authorizationHeader",
    ]) expect(canonical).not.toContain(forbidden);
  });
});

function request(bodyLength: number) {
  return PersonalCredentialTransportFrameAuthorizationRequestSchema.parse({
    schemaVersion: "personal-credential-transport-frame-authorization-request.v1",
    protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
    transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
    commandId: id("1"),
    correlationId: id("2"),
    direction: "mutation_to_main",
    frameType: "mutation_secret",
    bodyLength,
  });
}

function material(input: Readonly<{
  direction: "mutation_to_main" | "reveal_to_preload";
  frameType: "mutation_secret" | "reveal_secret";
  revealCompletedAckDigest?: string;
  revealUncertainAckDigest?: string;
}>) {
  return PersonalCredentialTransportFrameAuthorizationMaterialSchema.parse({
    schemaVersion: "personal-credential-transport-frame-authorization.v1",
    authorizationId: id("3"),
    protocolVersion: PERSONAL_CREDENTIAL_TRANSPORT_PROTOCOL_VERSION,
    transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
    commandId: id("1"),
    correlationId: id("2"),
    direction: input.direction,
    frameType: input.frameType,
    bodyLength: 8,
    frameDigest: digest,
    ticketDigest: digest,
    runtimeInstanceId: id("4"),
    clientInstanceId: id("5"),
    webContentsId: 17,
    mainFrameRoutingId: 3,
    navigationEpoch: 1,
    expiresAt: "2026-08-22T12:00:05.000Z",
    ...(input.revealCompletedAckDigest === undefined
      ? {}
      : { revealCompletedAckDigest: input.revealCompletedAckDigest }),
    ...(input.revealUncertainAckDigest === undefined
      ? {}
      : { revealUncertainAckDigest: input.revealUncertainAckDigest }),
  });
}

function id(suffix: string): string {
  return `019f9c00-0000-4000-8000-${suffix.padStart(12, "0")}`;
}
