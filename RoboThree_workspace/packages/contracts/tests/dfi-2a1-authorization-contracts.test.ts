import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AuthorizationPreferenceV1Alpha2Schema,
  ReadableSubmitTurnRecordSchema,
  SubmitTurnCommandSchema,
  SubmitTurnCommandV1Alpha2Schema,
  SubmitTurnReceiptV1Alpha2Schema,
  SubmitTurnRecordSchema,
  SubmitTurnRecordV1Alpha2Schema,
} from "../src/index.js";

const schemaRegistry = {
  authorization_preference: AuthorizationPreferenceV1Alpha2Schema,
  submit_turn: SubmitTurnCommandV1Alpha2Schema,
  submit_turn_receipt: SubmitTurnReceiptV1Alpha2Schema,
};

type Fixture = {
  schema: keyof typeof schemaRegistry;
  reason?: string;
  value: unknown;
};

const id = (suffix: string) =>
  `019f9000-0000-7000-8000-${suffix.padStart(12, "0")}`;
const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const at = "2026-08-17T00:00:00.000Z";

function readFixtures(name: "valid" | "invalid"): Fixture[] {
  return JSON.parse(readFileSync(resolve(
    process.cwd(),
    "packages/contracts/fixtures/desktop-local/v1alpha2",
    `dfi-2a1-${name}.json`,
  ), "utf8")) as Fixture[];
}

function validV1Alpha1Record() {
  return {
    schemaVersion: "v1alpha1",
    submitTurnCommandId: id("1"),
    clientTurnId: "client-turn-dfi-2a1",
    desktopSessionId: `session:${id("2")}`,
    internalSessionId: id("2"),
    requestDigest: digest("1"),
    selectionRequest: {
      agentId: "agent.general",
      selectedSkillIds: [],
      selectedKnowledgeIds: [],
    },
    lockedAgent: {
      agentDefinitionId: "agent.general",
      revision: digest("2"),
      digest: digest("2"),
    },
    registryRevision: digest("3"),
    platformPromptRevision: digest("4"),
    plannedSelectionDigest: digest("5"),
    capabilityLockIds: [id("3")],
    internalUserMessageId: id("4"),
    internalTaskId: id("5"),
    internalRuntimeSelectionId: id("6"),
    initialCheckpointId: id("7"),
    status: "accepted",
    createdAt: at,
    updatedAt: at,
  } as const;
}

function validV1Alpha2Record() {
  return {
    ...validV1Alpha1Record(),
    schemaVersion: "v1alpha2",
    transportContractVersion: "v1alpha2",
    selectionRequest: {
      ...validV1Alpha1Record().selectionRequest,
      authorizationPreference: {
        schemaVersion: "v1alpha1",
        requestedMode: "task_scoped",
      },
    },
    authorizationPlan: {
      requestedMode: "task_scoped",
      resolvedMode: "task_scoped",
      policyRevision: digest("6"),
      source: "user_selected",
      authorizationSelectionDigest: digest("7"),
      executionSelectionDigest: digest("8"),
    },
  } as const;
}

describe("DFI-2A.1 authorization-aware Desktop Contract", () => {
  it("accepts the complete valid Fixture corpus", () => {
    for (const fixture of readFixtures("valid")) {
      expect(
        schemaRegistry[fixture.schema].safeParse(fixture.value).success,
        fixture.schema,
      ).toBe(true);
    }
  });

  it("rejects the complete invalid Fixture corpus", () => {
    for (const fixture of readFixtures("invalid")) {
      expect(
        schemaRegistry[fixture.schema].safeParse(fixture.value).success,
        `${fixture.schema}: ${fixture.reason}`,
      ).toBe(false);
    }
  });

  it("keeps v1alpha1 strict while v1alpha2 requires explicit authorization", () => {
    const command = readFixtures("valid").find(
      (fixture) => fixture.schema === "submit_turn",
    )!.value;
    expect(SubmitTurnCommandV1Alpha2Schema.safeParse(command).success).toBe(true);
    expect(SubmitTurnCommandSchema.safeParse(command).success).toBe(false);

    const legacy = structuredClone(command) as Record<string, unknown> & {
      selectionRequest: Record<string, unknown>;
    };
    legacy.contractVersion = "v1alpha1";
    delete legacy.selectionRequest.authorizationPreference;
    expect(SubmitTurnCommandSchema.safeParse(legacy).success).toBe(true);
  });

  it("reads exact v1alpha1 and v1alpha2 coordination records", () => {
    expect(SubmitTurnRecordSchema.safeParse(validV1Alpha1Record()).success)
      .toBe(true);
    expect(SubmitTurnRecordV1Alpha2Schema.safeParse(validV1Alpha2Record()).success)
      .toBe(true);
    expect(ReadableSubmitTurnRecordSchema.safeParse(validV1Alpha1Record()).success)
      .toBe(true);
    expect(ReadableSubmitTurnRecordSchema.safeParse(validV1Alpha2Record()).success)
      .toBe(true);
  });

  it("fails closed on future coordination versions and plan drift", () => {
    expect(ReadableSubmitTurnRecordSchema.safeParse({
      ...validV1Alpha2Record(),
      schemaVersion: "v1alpha3",
    }).success).toBe(false);
    expect(SubmitTurnRecordV1Alpha2Schema.safeParse({
      ...validV1Alpha2Record(),
      authorizationPlan: {
        ...validV1Alpha2Record().authorizationPlan,
        requestedMode: "manual_review",
        resolvedMode: "manual_review",
      },
    }).success).toBe(false);
  });

  it("keeps content, credentials and runtime handles out of coordination records", () => {
    for (const forbidden of [
      { userInput: "secret body" },
      { credentialRef: "keychain://secret" },
      { runtimeHandle: { pid: 42 } },
      { confirmationPayload: { approveEverything: true } },
    ]) {
      expect(SubmitTurnRecordV1Alpha2Schema.safeParse({
        ...validV1Alpha2Record(),
        ...forbidden,
      }).success).toBe(false);
    }
  });
});
