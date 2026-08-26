import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AgentProjectionSchema,
  CompatibilityProjectionSchema,
  CreateSessionCommandSchema,
  ConversationSnapshotQuerySchema,
  DesktopEventSubscriptionQuerySchema,
  DesktopErrorEnvelopeSchema,
  DurableDesktopEventEnvelopeSchema,
  EphemeralDesktopEventEnvelopeSchema,
  ReplayResetRequiredSchema,
  RuntimeStatusQuerySchema,
  SubmitTurnCommandSchema,
  SubmitTurnStatusQuerySchema,
  WorkspaceGrantProjectionSchema,
} from "../src/index.js";

type Fixture = {
  schema: keyof typeof schemaRegistry;
  reason?: string;
  value: unknown;
};

const schemaRegistry = {
  agent_projection: AgentProjectionSchema,
  compatibility_projection: CompatibilityProjectionSchema,
  create_session: CreateSessionCommandSchema,
  conversation_snapshot_query: ConversationSnapshotQuerySchema,
  desktop_error: DesktopErrorEnvelopeSchema,
  durable_event: DurableDesktopEventEnvelopeSchema,
  ephemeral_event: EphemeralDesktopEventEnvelopeSchema,
  event_subscription_query: DesktopEventSubscriptionQuerySchema,
  replay_reset: ReplayResetRequiredSchema,
  runtime_status_query: RuntimeStatusQuerySchema,
  submit_turn: SubmitTurnCommandSchema,
  submit_turn_status_query: SubmitTurnStatusQuerySchema,
  workspace_grant: WorkspaceGrantProjectionSchema,
};

function readFixtures(name: "invalid" | "valid"): Fixture[] {
  const path = resolve(
    process.cwd(),
    "packages/contracts/fixtures/desktop-local/v1alpha1",
    `${name}.json`,
  );
  return JSON.parse(readFileSync(path, "utf8")) as Fixture[];
}

describe("Desktop Local Runtime Contract v1alpha1", () => {
  it("accepts the complete valid fixture corpus", () => {
    for (const fixture of readFixtures("valid")) {
      expect(
        schemaRegistry[fixture.schema].safeParse(fixture.value).success,
        fixture.schema,
      ).toBe(true);
    }
  });

  it("rejects the complete negative corpus", () => {
    for (const fixture of readFixtures("invalid")) {
      expect(
        schemaRegistry[fixture.schema].safeParse(fixture.value).success,
        `${fixture.schema}: ${fixture.reason}`,
      ).toBe(false);
    }
  });

  it("keeps heartbeat outside the durable event union", () => {
    expect(
      DurableDesktopEventEnvelopeSchema.safeParse({
        contractVersion: "v1alpha1",
        eventId: "99999999-9999-4999-8999-999999999999",
        deliveryKind: "durable",
        durableCursor: "projection-1:99",
        runtimeInstanceId: "runtime.instance-001",
        emittedAt: "2026-07-24T17:30:03+08:00",
        payload: {
          type: "heartbeat",
          sentAt: "2026-07-24T17:30:03+08:00",
        },
      }).success,
    ).toBe(false);
  });

  it("does not allow large persisted content in durable event payloads", () => {
    expect(
      DurableDesktopEventEnvelopeSchema.safeParse({
        contractVersion: "v1alpha1",
        eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        deliveryKind: "durable",
        durableCursor: "projection-1:100",
        runtimeInstanceId: "runtime.instance-001",
        emittedAt: "2026-07-24T17:30:04+08:00",
        payload: {
          type: "message_committed",
          sessionId: "session.fixture-001",
          messageId: "message.fixture-001",
          messageRevision: 2,
          status: "completed",
          queryRef: "snapshot:message.fixture-001",
          content: "must be queried",
        },
      }).success,
    ).toBe(false);
  });
});
