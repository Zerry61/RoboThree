import { randomUUID } from "node:crypto";

import {
  PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION,
  PersonalCredentialBrokerRequestHeaderSchema,
  SensitiveFrameDecoder,
  SensitiveFrameError,
  encodeSensitiveFrame,
  parseStrictJsonObject,
} from "@robothree/contracts/desktop-private/personal-credential-broker-v1";
import { describe, expect, it } from "vitest";

const digest = `sha256:${"a".repeat(64)}`;

function header(overrides: Record<string, unknown> = {}) {
  return PersonalCredentialBrokerRequestHeaderSchema.parse({
    protocolVersion: PERSONAL_CREDENTIAL_BROKER_PROTOCOL_VERSION,
    channelInstanceId: randomUUID(),
    commandId: randomUUID(),
    commandType: "create",
    transportRequestId: randomUUID(),
    clientInstanceId: randomUUID(),
    personalModelId: "model.personal.test",
    commandRequestDigest: digest,
    deadlineAt: "2026-08-21T23:59:59.000Z",
    secretByteLength: 4,
    ...overrides,
  });
}

describe("DFI-4A.2.1 private credential broker Contract", () => {
  it("round-trips fragmented and coalesced frames without stringifying the body", () => {
    const firstBody = Uint8Array.from([0, 255, 12, 88]);
    const secondHeader = header({
      commandId: randomUUID(),
      transportRequestId: randomUUID(),
    });
    const first = encodeSensitiveFrame(header(), firstBody);
    const second = encodeSensitiveFrame(secondHeader, firstBody);
    const combined = new Uint8Array(first.byteLength + second.byteLength);
    combined.set(first);
    combined.set(second, first.byteLength);
    const decoder = new SensitiveFrameDecoder(PersonalCredentialBrokerRequestHeaderSchema);
    expect(decoder.push(combined.subarray(0, 3))).toEqual([]);
    const frames = decoder.push(combined.subarray(3));
    expect(frames).toHaveLength(2);
    expect([...frames[0]!.body]).toEqual([...firstBody]);
    expect(frames[1]!.header.commandId).toBe(secondHeader.commandId);
    frames.forEach((frame) => frame.body.fill(0));
    first.fill(0);
    second.fill(0);
    combined.fill(0);
  });

  it("rejects duplicate JSON keys before JSON.parse", () => {
    expect(() => parseStrictJsonObject('{"a":1,"a":2}'))
      .toThrowError(new SensitiveFrameError("credential_frame_duplicate_json_key"));
    expect(() => parseStrictJsonObject('{"nested":{"x":1,"x":2}}'))
      .toThrow("credential_frame_duplicate_json_key");
  });

  it.each([
    [{ commandType: "delete", secretByteLength: 4 }, "metadata-only"],
    [{ commandType: "reveal", secretByteLength: 4 }, "metadata-only"],
    [{ commandType: "create", secretByteLength: 0 }, "requires"],
    [{ commandType: "update", secretByteLength: 0 }, "requires"],
    [{ unknown: true }, "unrecognized"],
  ])("rejects invalid strict request %#", (overrides) => {
    expect(() => header(overrides)).toThrow();
  });

  it("requires exact configuration and execution identity for a metadata-only reveal", () => {
    expect(header({
      commandType: "reveal",
      expectedConfigurationRevision: digest,
      expectedExecutionDefinitionDigest: `sha256:${"b".repeat(64)}`,
      secretByteLength: 0,
    })).toMatchObject({
      commandType: "reveal",
      secretByteLength: 0,
    });
    expect(() => header({
      commandType: "reveal",
      expectedConfigurationRevision: digest,
      secretByteLength: 0,
    })).toThrow("exact configuration and execution identity");
  });

  it("fails closed on mismatch, overflow and truncated input", () => {
    expect(() => encodeSensitiveFrame(header(), new Uint8Array(3))).toThrow("body_length_mismatch");
    const decoder = new SensitiveFrameDecoder(PersonalCredentialBrokerRequestHeaderSchema);
    const frame = encodeSensitiveFrame(header(), Uint8Array.from([1, 2, 3, 4]));
    decoder.push(frame.subarray(0, frame.byteLength - 1));
    expect(() => decoder.finish()).toThrow("credential_frame_truncated");
    frame.fill(0);
  });
});
