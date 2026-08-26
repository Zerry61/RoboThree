import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ADMIN_CONTROL_CONTRACT_VERSION,
  AdminControlCommandMetadataSchema,
  AdminControlCursorSchema,
  AdminControlEnvelopeMetadataSchema,
  AdminControlReceiptSchema,
  AdminControlSafeErrorSchema,
  AdminModelDetailSchema,
  AdminRobotSummarySchema,
  AdminToolDetailSchema,
  AdminToolSummarySchema,
  createAdminControlSuccessEnvelopeSchema,
  createUnknownAdminControlError,
  canonicalAdminControlDigestInput,
  canonicalAdminControlJson,
} from "../src/index.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const ids = {
  requestId: "019f7447-a784-77b2-a716-0000000a0101",
  correlationId: "019f7447-a784-77b2-a716-0000000a0102",
  commandId: "019f7447-a784-77b2-a716-0000000a0103",
  receiptId: "019f7447-a784-77b2-a716-0000000a0104",
};

describe("Admin Control v1alpha1 Contract", () => {
  it("keeps envelope identity flags strict and does not let test identity claim production readiness", () => {
    const metadata = {
      contractVersion: ADMIN_CONTROL_CONTRACT_VERSION,
      requestId: ids.requestId,
      correlationId: ids.correlationId,
      serverTime: "2026-08-24T14:20:00.000Z",
      testIdentityUsed: true,
      productionIdentityReady: false,
    };
    expect(AdminControlEnvelopeMetadataSchema.parse(metadata)).toEqual(metadata);
    expect(AdminControlEnvelopeMetadataSchema.safeParse({
      ...metadata,
      productionIdentityReady: true,
    }).success).toBe(false);
    expect(AdminControlEnvelopeMetadataSchema.safeParse({
      ...metadata,
      bearer: "forbidden",
    }).success).toBe(false);

    const envelope = createAdminControlSuccessEnvelopeSchema(AdminRobotSummarySchema);
    expect(envelope.parse({
      ...metadata,
      data: robotFixture(),
    }).data.robotId).toBe("agent:catalog-fixture");
  });

  it("keeps typed errors safe and maps codes to fixed HTTP status values", () => {
    const safe = AdminControlSafeErrorSchema.parse({
      kind: "admin_control_error",
      contractVersion: ADMIN_CONTROL_CONTRACT_VERSION,
      errorCode: "permission_denied",
      httpStatus: "403",
      safeSummary: "当前账号没有权限访问该管理页面。",
      retryable: false,
      correlationId: ids.correlationId,
    });
    expect(safe.errorCode).toBe("permission_denied");
    expect(AdminControlSafeErrorSchema.safeParse({
      ...safe,
      httpStatus: "503",
    }).success).toBe(false);
    for (const forbidden of ["stack", "credentialRef", "token", "apiKey"] as const) {
      expect(AdminControlSafeErrorSchema.safeParse({
        ...safe,
        [forbidden]: "forbidden",
      }).success).toBe(false);
    }

    const unknown = createUnknownAdminControlError({
      correlationId: ids.correlationId,
      retryable: true,
    });
    expect(unknown.safeSummary).toBe("管理能力暂不可用，请稍后重试。");
    expect(JSON.stringify(unknown)).not.toContain("Error:");
  });

  it("freezes opaque cursor, expectedRevision and Receipt shape without opening mutation semantics", () => {
    expect(AdminControlCursorSchema.parse(
      "r3admin1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    )).toContain("r3admin1.");
    expect(AdminControlCursorSchema.safeParse("cursor:plain").success).toBe(false);

    const command = AdminControlCommandMetadataSchema.parse({
      contractVersion: ADMIN_CONTROL_CONTRACT_VERSION,
      commandId: ids.commandId,
      correlationId: ids.correlationId,
      expectedRevision: digest("c"),
    });
    expect(command.expectedRevision).toBe(digest("c"));
    expect(AdminControlReceiptSchema.safeParse({
      kind: "admin_control_receipt",
      contractVersion: ADMIN_CONTROL_CONTRACT_VERSION,
      receiptId: ids.receiptId,
      commandId: ids.commandId,
      correlationId: ids.correlationId,
      resourceId: "tool.catalog_fixture",
      receiptState: "accepted",
      safeSummary: "Accepted shape only.",
    }).success).toBe(false);
    expect(AdminControlReceiptSchema.parse({
      kind: "admin_control_receipt",
      contractVersion: ADMIN_CONTROL_CONTRACT_VERSION,
      receiptId: ids.receiptId,
      commandId: ids.commandId,
      correlationId: ids.correlationId,
      resourceId: "tool.catalog_fixture",
      resourceRevision: digest("d"),
      receiptState: "accepted",
      safeSummary: "Accepted shape only.",
    }).receiptState).toBe("accepted");
  });

  it("keeps module projections strict and excludes credential, endpoint and provider internals", () => {
    expect(AdminModelDetailSchema.safeParse({
      modelId: "model.catalog_fixture",
      modelRevision: digest("e"),
      displayName: "Model fixture",
      providerLabel: "Provider",
      lifecycle: "published",
      credentialStatus: "configured",
      safeSummary: "Safe model summary.",
      contextWindowState: "known",
      defaultForNewTasks: false,
      credentialRef: "credential:forbidden",
    }).success).toBe(false);

    const tool = toolFixture();
    expect(AdminToolDetailSchema.parse({
      ...tool,
      inputSummary: "Structured JSON object.",
      outputSummary: "Structured JSON object.",
    }).toolId).toBe("tool.catalog_fixture");
    for (const forbidden of [
      "endpoint",
      "credentialRef",
      "bindingId",
      "adapterDescriptor",
      "workspacePath",
      "stack",
      "apiKey",
    ] as const) {
      expect(AdminToolDetailSchema.safeParse({
        ...tool,
        inputSummary: "Structured JSON object.",
        [forbidden]: "forbidden",
      }).success).toBe(false);
    }
  });

  it("aligns Robot and Tool common semantics with the cross-consumer canonical fixture", () => {
    const admin = readJson("packages/contracts/fixtures/admin-control/v1alpha1/catalog-alignment-admin.json") as {
      robot: ReturnType<typeof robotFixture>;
      tool: ReturnType<typeof toolFixture>;
    };
    const cross = readJson("packages/contracts/fixtures/cross-consumer/catalog-alignment-v1.json") as {
      robot: {
        identity: { robotId: string; publishedRobotRevision: string };
        displayName: string;
        description: string;
        restrictionSummary: Record<string, string>;
      };
      tool: {
        identity: { toolId: string; toolDefinitionRevision: string };
        displayName: string;
        description: string;
        readOnly: boolean;
        riskSummary: string[];
      };
    };

    expect(AdminRobotSummarySchema.parse(admin.robot)).toEqual(admin.robot);
    expect(AdminToolSummarySchema.parse(admin.tool)).toEqual(admin.tool);
    expect(admin.robot.robotId).toBe(cross.robot.identity.robotId);
    expect(admin.robot.publishedRobotRevision).toBe(cross.robot.identity.publishedRobotRevision);
    expect(admin.robot.displayName).toBe(cross.robot.displayName);
    expect(admin.robot.description).toBe(cross.robot.description);
    expect(admin.robot.restrictionSummary).toEqual(cross.robot.restrictionSummary);
    expect(admin.tool.toolId).toBe(cross.tool.identity.toolId);
    expect(admin.tool.toolDefinitionRevision).toBe(cross.tool.identity.toolDefinitionRevision);
    expect(admin.tool.displayName).toBe(cross.tool.displayName);
    expect(admin.tool.description).toBe(cross.tool.description);
    expect(admin.tool.readOnly).toBe(cross.tool.readOnly);
    expect(admin.tool.riskSummary).toEqual(cross.tool.riskSummary);
  });

  it("provides deterministic TS-only canonical material without sensitive fields", () => {
    const fixture = readJson("packages/contracts/fixtures/admin-control/v1alpha1/catalog-alignment-admin.json");
    const canonical = canonicalAdminControlJson(fixture);
    const digestValue = `sha256:${createHash("sha256")
      .update(canonicalAdminControlDigestInput(fixture), "utf8")
      .digest("hex")}`;

    expect(canonical).toBe(canonicalAdminControlJson({
      tool: (fixture as { tool: unknown }).tool,
      schemaVersion: "admin-control.catalog-alignment.v1",
      robot: (fixture as { robot: unknown }).robot,
    }));
    expect(digestValue).toMatch(/^sha256:[0-9a-f]{64}$/u);
    for (const forbidden of [
      "apiKey",
      "token",
      "credentialRef",
      "endpoint",
      "adapterDescriptor",
      "workspacePath",
      "systemPrompt",
      "stack",
    ]) {
      expect(canonical).not.toContain(forbidden);
    }
  });

  it("resolves the admin-control v1alpha1 subpath export from the built package", async () => {
    const subpath = await import("@robothree/contracts/admin-control/v1alpha1");

    expect(subpath.ADMIN_CONTROL_CONTRACT_VERSION).toBe(ADMIN_CONTROL_CONTRACT_VERSION);
    expect(Object.keys(subpath).length).toBeGreaterThan(40);
    expect(subpath.AdminControlEnvelopeMetadataSchema.parse({
      contractVersion: ADMIN_CONTROL_CONTRACT_VERSION,
      requestId: ids.requestId,
      correlationId: ids.correlationId,
      serverTime: "2026-08-24T14:20:00.000Z",
      testIdentityUsed: true,
      productionIdentityReady: false,
    }).testIdentityUsed).toBe(true);
  });
});

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function robotFixture() {
  return {
    robotId: "agent:catalog-fixture",
    publishedRobotRevision: digest("a"),
    displayName: "Catalog fixture robot",
    description: "Cross-consumer Robot catalog fixture.",
    source: "enterprise_published",
    lifecycle: "published",
    restrictionSummary: {
      models: "restricted_nonempty",
      skills: "restricted_empty",
      tools: "restricted_nonempty",
      knowledge: "restricted_empty",
    },
  } as const;
}

function toolFixture() {
  return {
    toolId: "tool.catalog_fixture",
    toolDefinitionRevision: digest("b"),
    displayName: "Catalog fixture tool",
    description: "Cross-consumer Tool catalog fixture.",
    source: "official_package",
    lifecycle: "published",
    readOnly: true,
    riskSummary: ["routine_file"],
    policyState: "unavailable",
    connectionState: "unavailable",
    credentialStatus: "unavailable",
    healthState: "unavailable",
  } as const;
}
