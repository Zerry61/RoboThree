import { describe, expect, it } from "vitest";

import {
  CONTRACT_VERSION,
  CoreHealthSchema,
  ModelRequestSchema,
  ModelStreamEventSchema,
  RuntimeErrorSchema,
  createEnvelopeMetadata,
} from "../src/index.js";

const id = "019f7447-a784-77b2-a716-ce42b07e4818";

describe("contract foundations", () => {
  it("creates versioned envelope metadata", () => {
    expect(
      createEnvelopeMetadata({
        id,
        correlationId: id,
        timestamp: "2026-07-19T12:00:00+08:00",
      }),
    ).toEqual({
      schemaVersion: CONTRACT_VERSION,
      id,
      correlationId: id,
      timestamp: "2026-07-19T12:00:00+08:00",
    });
  });

  it("rejects an invalid model request at runtime", () => {
    expect(() =>
      ModelRequestSchema.parse({ requestId: "not-an-id", model: "", messages: [] }),
    ).toThrow();
  });

  it("validates all initial boundary schemas", () => {
    expect(
      ModelStreamEventSchema.parse({ type: "text_delta", delta: "hello" }),
    ).toEqual({ type: "text_delta", delta: "hello" });
    expect(
      RuntimeErrorSchema.parse({
        code: "provider.timeout",
        category: "timeout",
        message: "Provider timed out",
        retryable: true,
      }),
    ).toBeDefined();
    expect(
      CoreHealthSchema.parse({
        status: "ready",
        checkedAt: "2026-07-19T12:00:00+08:00",
        components: [],
      }),
    ).toBeDefined();
  });
});
