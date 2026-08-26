import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AgentProjectionSchema,
  CompatibilityProjectionSchema,
  ConversationSnapshotQuerySchema,
  CreateSessionCommandSchema,
  DesktopErrorEnvelopeSchema,
  DesktopEventSubscriptionQuerySchema,
  DurableDesktopEventEnvelopeSchema,
  EphemeralDesktopEventEnvelopeSchema,
  ReplayResetRequiredSchema,
  RuntimeStatusQuerySchema,
  SubmitTurnCommandSchema,
  SubmitTurnStatusQuerySchema,
  WorkspaceGrantProjectionSchema,
} from "../../packages/contracts/src/index.js";
import { describe, expect, it } from "vitest";

type Fixture = {
  schema: keyof typeof schemaRegistry;
  value: unknown;
};

const schemaRegistry = {
  agent_projection: AgentProjectionSchema,
  compatibility_projection: CompatibilityProjectionSchema,
  conversation_snapshot_query: ConversationSnapshotQuerySchema,
  create_session: CreateSessionCommandSchema,
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

function readCorpus(name: "invalid" | "valid"): Fixture[] {
  return JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        `packages/contracts/fixtures/desktop-local/v1alpha1/${name}.json`,
      ),
      "utf8",
    ),
  ) as Fixture[];
}

function validateAsDesktopMain(fixture: Fixture): boolean {
  return schemaRegistry[fixture.schema].safeParse(fixture.value).success;
}

function validateAsLocalCore(fixture: Fixture): boolean {
  return schemaRegistry[fixture.schema].safeParse(fixture.value).success;
}

describe("Desktop Main and Local Core Contract consumers", () => {
  it("produce identical acceptance results for the shared corpus", () => {
    const expected = [
      ...readCorpus("valid").map((fixture) => [fixture, true] as const),
      ...readCorpus("invalid").map((fixture) => [fixture, false] as const),
    ];

    for (const [fixture, valid] of expected) {
      expect(validateAsDesktopMain(fixture), `Main: ${fixture.schema}`).toBe(
        valid,
      );
      expect(validateAsLocalCore(fixture), `Core: ${fixture.schema}`).toBe(
        valid,
      );
    }
  });
});
