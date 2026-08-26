import {
  PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES,
  PERSONAL_CREDENTIAL_TRANSPORT_PROFILE,
  PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
  PersonalCredentialTransportErrorCodeSchema,
  PersonalCredentialTransportFrameHeaderSchema,
  PersonalCredentialTransportTicketSchema,
  canonicalPersonalCredentialTransportFrameMaterial,
  parsePersonalCredentialTransportBinaryEnvelope,
} from "@robothree/contracts/desktop-private/personal-credential-transport-v1";
import { describe, expect, it } from "vitest";

const digest = `sha256:${"a".repeat(64)}`;

describe("STRM-1 private sensitive transport Contract", () => {
  it("freezes one conservative Route A profile without a production-ready claim", () => {
    expect(PERSONAL_CREDENTIAL_TRANSPORT_PROFILE).toEqual({
      protocolVersion: "personal-credential-transport.v1",
      transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
      route: "route_a_structured_clone_uint8array",
      maximumBodyBytes: 16_384,
      structuredCloneUsed: true,
      zeroCopyClaimed: false,
      internalCopiesReliablyClearable: false,
      runtimeFallbackEnabled: false,
      productionFeatureDefaultEnabled: false,
    });
  });

  it("keeps the ticket strict, non-sensitive and exact-identity bound", () => {
    const value = ticket();
    expect(value).toMatchObject({
      transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
      webContentsId: 17,
      mainFrameRoutingId: 3,
      navigationEpoch: 4,
    });
    const serialized = JSON.stringify(value);
    for (const forbidden of [
      "credentialRef",
      "ownerScopeDigest",
      "enterpriseId",
      "userId",
      "deviceId",
      "endpoint",
      "helperPath",
      "secret",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(() => PersonalCredentialTransportTicketSchema.parse({
      ...value,
      credentialRef: "credential-ref-forbidden",
    })).toThrow();
  });

  it("accepts exactly one strict Uint8Array envelope shape", () => {
    const body = Uint8Array.from([1, 2, 3, 4]);
    const header = frameHeader("mutation_secret", body.byteLength);
    expect(parsePersonalCredentialTransportBinaryEnvelope({ header, body })).toEqual({
      header,
      body,
    });
    expect(() => parsePersonalCredentialTransportBinaryEnvelope({
      header,
      body,
      extra: true,
    })).toThrow("personal_credential_transport_invalid_frame");
    expect(() => parsePersonalCredentialTransportBinaryEnvelope({
      header,
      body: new ArrayBuffer(4),
    })).toThrow("personal_credential_transport_invalid_frame");
    body.fill(0);
  });

  it("rejects empty, oversized, mismatched and shared Secret bodies", () => {
    expect(() => parsePersonalCredentialTransportBinaryEnvelope({
      header: frameHeader("mutation_secret", 0),
      body: new Uint8Array(0),
    })).toThrow("personal_credential_transport_body_empty");

    const oversized = new Uint8Array(PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES + 1);
    expect(() => parsePersonalCredentialTransportBinaryEnvelope({
      header: frameHeader("mutation_secret", PERSONAL_CREDENTIAL_TRANSPORT_MAX_BODY_BYTES),
      body: oversized,
    })).toThrow("personal_credential_transport_invalid_frame");
    oversized.fill(0);

    const shared = new Uint8Array(new SharedArrayBuffer(4));
    expect(() => parsePersonalCredentialTransportBinaryEnvelope({
      header: frameHeader("mutation_secret", 4),
      body: shared,
    })).toThrow("personal_credential_transport_invalid_frame");
    shared.fill(0);
  });

  it("allows only zero-body control envelopes", () => {
    expect(parsePersonalCredentialTransportBinaryEnvelope({
      header: frameHeader("terminal_ack", 0),
      body: new Uint8Array(0),
    }).body.byteLength).toBe(0);
    const body = Uint8Array.from([1]);
    expect(() => parsePersonalCredentialTransportBinaryEnvelope({
      header: frameHeader("terminal_ack", 1),
      body,
    })).toThrow("personal_credential_transport_invalid_frame");
    body.fill(0);
  });

  it("freezes the typed fail-closed error vocabulary", () => {
    expect(PersonalCredentialTransportErrorCodeSchema.options).toContain(
      "personal_credential_transport_unavailable",
    );
    expect(PersonalCredentialTransportErrorCodeSchema.options).toContain(
      "personal_credential_transport_navigation_invalidated",
    );
    expect(PersonalCredentialTransportErrorCodeSchema.options).toContain(
      "personal_credential_transport_replay_forbidden",
    );
    expect(() => PersonalCredentialTransportErrorCodeSchema.parse("fallback_to_json"))
      .toThrow();
  });

  it("canonicalizes frame identity without including body or Secret-derived material", () => {
    const canonical = canonicalPersonalCredentialTransportFrameMaterial({
      protocolVersion: "personal-credential-transport.v1",
      transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
      commandId: id("1"),
      correlationId: id("2"),
      frameType: "mutation_secret",
      bodyLength: 7,
    });
    expect(canonical).toBe(
      `{"protocolVersion":"personal-credential-transport.v1","transportProfileRevision":"${PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION}","commandId":"${id("1")}","correlationId":"${id("2")}","frameType":"mutation_secret","bodyLength":7}`,
    );
    expect(canonical).not.toContain("credentialRef");
    expect(canonical).not.toContain("secretDigest");
  });
});

function ticket() {
  return PersonalCredentialTransportTicketSchema.parse({
    schemaVersion: "personal-credential-transport-ticket.v1",
    transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
    runtimeInstanceId: id("1"),
    clientInstanceId: id("2"),
    commandId: id("3"),
    correlationId: id("4"),
    operationType: "create",
    personalModelId: "model.personal.test",
    expectedConfigurationRevision: digest,
    requestDigest: `sha256:${"b".repeat(64)}`,
    webContentsId: 17,
    mainFrameRoutingId: 3,
    navigationEpoch: 4,
    expiresAt: "2026-08-22T12:00:05.000Z",
    ticketDigest: `sha256:${"c".repeat(64)}`,
  });
}

function frameHeader(frameType: string, bodyLength: number) {
  return PersonalCredentialTransportFrameHeaderSchema.parse({
    protocolVersion: "personal-credential-transport.v1",
    transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
    commandId: id("3"),
    correlationId: id("4"),
    frameType,
    bodyLength,
    frameDigest: digest,
  });
}

function id(suffix: string): string {
  return `019f9a00-0000-4000-8000-${suffix.padStart(12, "0")}`;
}
