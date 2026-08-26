import {
  PersonalCredentialTransportControlMessageSchema,
  PersonalCredentialTransportErrorCodeSchema,
} from "@robothree/contracts/desktop-private/personal-credential-transport-v1";
import { describe, expect, it } from "vitest";

describe("STRM-2.3 private transport closure Contract", () => {
  it("distinguishes rejected from unavailable", () => {
    expect(PersonalCredentialTransportErrorCodeSchema.parse(
      "personal_credential_transport_rejected",
    )).toBe("personal_credential_transport_rejected");
    expect(PersonalCredentialTransportErrorCodeSchema.parse(
      "personal_credential_transport_unavailable",
    )).toBe("personal_credential_transport_unavailable");
  });

  it("keeps rejected terminal strict and private", () => {
    const control = PersonalCredentialTransportControlMessageSchema.parse({
      protocolVersion: "personal-credential-transport.v1",
      transportProfileRevision: "personal-credential.route-a.structured-clone.v1",
      commandId: "019f9e00-0000-4000-8000-000000000001",
      correlationId: "019f9e00-0000-4000-8000-000000000002",
      controlType: "terminal_ack",
      terminal: "rejected",
      typedErrorCode: "personal_credential_transport_rejected",
      controlDigest: `sha256:${"a".repeat(64)}`,
    });
    expect(control).toMatchObject({
      terminal: "rejected",
      typedErrorCode: "personal_credential_transport_rejected",
    });
    expect(() => PersonalCredentialTransportControlMessageSchema.parse({
      ...control,
      credentialRef: "credential.private.forbidden",
    })).toThrow();
  });
});
