import { createHash } from "node:crypto";

import {
  PERSONAL_CREDENTIAL_TRANSPORT_PORT_CHANNEL,
  PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
  PersonalCredentialTransportControlMaterialSchema,
  PersonalCredentialTransportControlMessageSchema,
  PersonalCredentialTransportPortOfferSchema,
  PersonalCredentialTransportPreparedCommandSchema,
  canonicalPersonalCredentialTransportControlMaterial,
} from "@robothree/contracts/desktop-private/personal-credential-transport-v1";
import { describe, expect, it } from "vitest";

const digest = `sha256:${"a".repeat(64)}`;

describe("STRM-2.1 private control Contract", () => {
  it("freezes one private port-offer channel", () => {
    expect(PERSONAL_CREDENTIAL_TRANSPORT_PORT_CHANNEL).toBe(
      "robothree:personal-credential-transport:port-v1",
    );
  });

  it("accepts strict ready and cancel controls without terminal material", () => {
    for (const controlType of ["ready", "cancel"] as const) {
      expect(control({ controlType })).toMatchObject({ controlType });
      expect(() => control({ controlType, terminal: "cancelled" })).toThrow();
      expect(() => control({
        controlType,
        typedErrorCode: "personal_credential_transport_cancelled",
      })).toThrow();
    }
  });

  it("requires terminal and typed failure for non-completed acknowledgements", () => {
    expect(() => control({ controlType: "terminal_ack" })).toThrow();
    expect(() => control({
      controlType: "terminal_ack",
      terminal: "rejected",
    })).toThrow();
    expect(control({
      controlType: "terminal_ack",
      terminal: "rejected",
      typedErrorCode: "personal_credential_transport_invalid_frame",
    })).toMatchObject({ terminal: "rejected" });
    expect(() => control({
      controlType: "terminal_ack",
      terminal: "cancelled",
      typedErrorCode: "personal_credential_transport_invalid_frame",
    })).toThrow();
    expect(() => control({
      controlType: "terminal_ack",
      terminal: "timed_out",
      typedErrorCode: "personal_credential_transport_cancelled",
    })).toThrow();
    expect(control({
      controlType: "terminal_ack",
      terminal: "uncertain",
      typedErrorCode: "personal_credential_transport_uncertain",
    })).toMatchObject({ terminal: "uncertain" });
  });

  it("forbids an error code on completed acknowledgement", () => {
    const completed = control({
      controlType: "terminal_ack",
      terminal: "completed",
    });
    expect(completed).toMatchObject({ terminal: "completed" });
    expect("typedErrorCode" in completed).toBe(false);
    expect(() => control({
      controlType: "terminal_ack",
      terminal: "completed",
      typedErrorCode: "personal_credential_transport_uncertain",
    })).toThrow();
  });

  it("canonicalizes null optional fields without business or Secret material", () => {
    const canonical = canonicalPersonalCredentialTransportControlMaterial(
      material({ controlType: "ready" }),
    );
    expect(canonical).toContain('"terminal":null');
    expect(canonical).toContain('"typedErrorCode":null');
    for (const forbidden of [
      "secret",
      "credentialRef",
      "ownerScopeDigest",
      "endpoint",
      "receipt",
    ]) {
      expect(canonical).not.toContain(forbidden);
    }
  });

  it("keeps the port offer strict and free of business or Secret material", () => {
    const value = PersonalCredentialTransportPortOfferSchema.parse({
      protocolVersion: "personal-credential-transport.v1",
      transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
      ticket: ticket(),
      readyControl: control({ controlType: "ready" }),
      cancelControl: control({ controlType: "cancel" }),
    });
    expect(Object.keys(value).sort()).toEqual([
      "cancelControl",
      "protocolVersion",
      "readyControl",
      "ticket",
      "transportProfileRevision",
    ]);
    expect(() => PersonalCredentialTransportPortOfferSchema.parse({
      ...value,
      ownerScopeDigest: digest,
    })).toThrow();
    expect(() => PersonalCredentialTransportPortOfferSchema.parse({
      ...value,
      readyControl: value.cancelControl,
    })).toThrow();
  });

  it("requires exact reveal execution identity in prepared material", () => {
    expect(() => PersonalCredentialTransportPreparedCommandSchema.parse({
      ...prepared(),
      operationType: "reveal",
    })).toThrow();
    expect(PersonalCredentialTransportPreparedCommandSchema.parse({
      ...prepared(),
      operationType: "reveal",
      expectedExecutionDefinitionDigest: digest,
    })).toMatchObject({ operationType: "reveal" });
  });

  it("forbids reveal-only execution identity on mutation prepare", () => {
    expect(() => PersonalCredentialTransportPreparedCommandSchema.parse({
      ...prepared(),
      expectedExecutionDefinitionDigest: digest,
    })).toThrow();
    expect(PersonalCredentialTransportPreparedCommandSchema.parse(prepared()))
      .toMatchObject({ operationType: "create" });
  });
});

function control(input: Readonly<{
  controlType: "ready" | "terminal_ack" | "cancel";
  terminal?: "completed" | "rejected" | "cancelled" | "timed_out" | "uncertain";
  typedErrorCode?: "personal_credential_transport_invalid_frame"
    | "personal_credential_transport_cancelled"
    | "personal_credential_transport_timed_out"
    | "personal_credential_transport_uncertain";
}>) {
  const value = material(input);
  return PersonalCredentialTransportControlMessageSchema.parse({
    ...value,
    controlDigest: `sha256:${createHash("sha256")
      .update(canonicalPersonalCredentialTransportControlMaterial(value), "utf8")
      .digest("hex")}`,
  });
}

function material(input: Readonly<{
  controlType: "ready" | "terminal_ack" | "cancel";
  terminal?: "completed" | "rejected" | "cancelled" | "timed_out" | "uncertain";
  typedErrorCode?: "personal_credential_transport_invalid_frame"
    | "personal_credential_transport_cancelled"
    | "personal_credential_transport_timed_out"
    | "personal_credential_transport_uncertain";
}>) {
  return PersonalCredentialTransportControlMaterialSchema.parse({
    protocolVersion: "personal-credential-transport.v1",
    transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
    commandId: id("1"),
    correlationId: id("2"),
    ...input,
  });
}

function prepared() {
  return {
    schemaVersion: "personal-credential-transport-prepared-command.v1",
    runtimeInstanceId: id("1"),
    clientInstanceId: id("2"),
    commandId: id("1"),
    correlationId: id("2"),
    operationType: "create",
    personalModelId: "model.personal.test",
    expectedConfigurationRevision: digest,
    requestDigest: `sha256:${"b".repeat(64)}`,
    deadlineAt: "2026-08-22T12:00:05.000Z",
  };
}

function ticket() {
  return {
    schemaVersion: "personal-credential-transport-ticket.v1",
    transportProfileRevision: PERSONAL_CREDENTIAL_TRANSPORT_PROFILE_REVISION,
    runtimeInstanceId: id("1"),
    clientInstanceId: id("2"),
    commandId: id("1"),
    correlationId: id("2"),
    operationType: "create",
    personalModelId: "model.personal.test",
    expectedConfigurationRevision: digest,
    requestDigest: `sha256:${"b".repeat(64)}`,
    webContentsId: 17,
    mainFrameRoutingId: 3,
    navigationEpoch: 4,
    expiresAt: "2026-08-22T12:00:05.000Z",
    ticketDigest: `sha256:${"c".repeat(64)}`,
  };
}

function id(suffix: string): string {
  return `019f9a00-0000-4000-8000-${suffix.padStart(12, "0")}`;
}
