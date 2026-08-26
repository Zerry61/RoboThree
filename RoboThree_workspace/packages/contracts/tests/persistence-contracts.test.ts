import { describe, expect, it } from "vitest";

import {
  EffectAttemptSchema,
  OutboxRecordSchema,
  PersistenceSchemaVersion,
  TaskEventSchema,
  canonicalJsonStringify,
} from "../src/index.js";

const id = (value: number) => `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;
const at = "2026-07-20T13:00:00.000Z";

describe("persistence contracts", () => {
  it("canonicalizes object keys recursively without reordering arrays", () => {
    const left = canonicalJsonStringify({ z: 1, nested: { b: true, a: false }, list: [2, 1] });
    const right = canonicalJsonStringify({ list: [2, 1], nested: { a: false, b: true }, z: 1 });
    expect(left).toBe(right);
    expect(left).toBe('{"list":[2,1],"nested":{"a":false,"b":true},"z":1}');
  });

  it("rejects non-JSON values before canonicalization", () => {
    expect(() => canonicalJsonStringify({ execute: () => undefined } as never)).toThrow();
  });

  it("requires positive per-task event sequence and JSON payload", () => {
    expect(() => TaskEventSchema.parse({
      schemaVersion: PersistenceSchemaVersion,
      eventId: id(1),
      taskId: id(2),
      sequence: 0,
      type: "runtime.command_applied",
      occurredAt: at,
      causationId: id(3),
      correlationId: id(2),
      payload: {},
    })).toThrow();
  });

  it("requires successful effect attempts to reference a result", () => {
    expect(() => EffectAttemptSchema.parse({
      schemaVersion: PersistenceSchemaVersion,
      effectAttemptId: id(1),
      taskId: id(2),
      runId: id(3),
      stepId: id(4),
      actionId: id(5),
      idempotencyKey: "effect:key:1",
      executorCapability: "tool.file.write",
      recoveryMode: "manual_reconciliation",
      status: "succeeded",
      createdAt: at,
      updatedAt: at,
    })).toThrow("succeeded effect attempt requires resultRef");
  });

  it("rejects unknown Effect recovery modes and backwards attempt timestamps", () => {
    const attempt = {
      schemaVersion: PersistenceSchemaVersion,
      effectAttemptId: id(1),
      taskId: id(2),
      runId: id(3),
      stepId: id(4),
      actionId: id(5),
      idempotencyKey: "effect:key:1",
      executorCapability: "tool.file.write",
      recoveryMode: "idempotent_retry",
      status: "prepared",
      metadata: {},
      createdAt: at,
      updatedAt: at,
    };
    expect(() => EffectAttemptSchema.parse({ ...attempt, recoveryMode: "blind_retry" })).toThrow();
    expect(() => EffectAttemptSchema.parse({
      ...attempt,
      updatedAt: "2026-07-20T12:59:00.000Z",
    })).toThrow("effect attempt updatedAt cannot predate creation");
  });

  it("rejects outbox publication timestamps before creation", () => {
    expect(() => OutboxRecordSchema.parse({
      schemaVersion: PersistenceSchemaVersion,
      outboxId: id(1),
      eventId: id(2),
      taskId: id(3),
      destination: "runtime.events",
      payload: {},
      attemptCount: 1,
      createdAt: at,
      publishedAt: "2026-07-20T12:59:00.000Z",
    })).toThrow("outbox publishedAt cannot predate creation");
  });

  it("keeps Outbox retry scheduling mutually exclusive with publication", () => {
    const base = {
      schemaVersion: PersistenceSchemaVersion,
      outboxId: id(1),
      eventId: id(2),
      taskId: id(3),
      destination: "runtime.events",
      payload: {},
      attemptCount: 1,
      createdAt: "2026-07-20T13:00:00.000Z",
    };
    expect(OutboxRecordSchema.parse({
      ...base,
      nextAttemptAt: "2026-07-20T13:00:02.000Z",
    })).toMatchObject({ attemptCount: 1 });
    expect(() => OutboxRecordSchema.parse({
      ...base,
      nextAttemptAt: "2026-07-20T13:00:02.000Z",
      publishedAt: "2026-07-20T13:00:03.000Z",
    })).toThrow("published outbox cannot retain a next attempt time");
  });
});
