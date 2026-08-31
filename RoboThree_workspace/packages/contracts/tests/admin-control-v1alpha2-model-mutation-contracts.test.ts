import { describe, expect, it } from "vitest";

import {
  ADMIN_CONTROL_V1ALPHA2_CONTRACT_VERSION,
  AdminControlV1Alpha2SafeErrorSchema,
  AdminManagedModelDetailSchema,
  AdminModelConnectionCheckSchema,
  AdminModelMutationCommandSchema,
  AdminModelMutationReceiptSchema,
  CreateAdminModelCommandSchema,
  SetAdminModelLifecycleCommandSchema,
  SetDefaultAdminModelCommandSchema,
  UpdateAdminModelCommandSchema,
} from "../src/admin-control/v1alpha2/index.js";

const digest = (marker: string) => `sha256:${marker.repeat(64)}`;
const identity = {
  contractVersion: ADMIN_CONTROL_V1ALPHA2_CONTRACT_VERSION,
  commandId: "019f7447-a784-77b2-a716-0000000b0101",
  correlationId: "019f7447-a784-77b2-a716-0000000b0102",
};

describe("Admin Control v1alpha2 Model mutation Contract", () => {
  it("freezes one OpenAI-compatible create command and keeps the credential write-only", () => {
    const command = CreateAdminModelCommandSchema.parse({
      ...identity,
      kind: "create_admin_model",
      displayName: "企业通用模型",
      providerFamily: "openai_compatible",
      endpoint: "https://provider.example/v1",
      providerModelId: "gpt-5.2-2025-12-11",
      credential: { mode: "replace", secret: "sk-test-only-secret" },
    });
    expect(command.providerFamily).toBe("openai_compatible");
    expect(AdminModelMutationCommandSchema.parse(command)).toEqual(command);
    expect(CreateAdminModelCommandSchema.safeParse({
      ...command,
      providerFamily: "anthropic_compatible",
    }).success).toBe(false);
    expect(CreateAdminModelCommandSchema.safeParse({
      ...command,
      credential: { mode: "retain" },
    }).success).toBe(false);
  });

  it("requires exact revision and at least one strict update change", () => {
    const update = {
      ...identity,
      kind: "update_admin_model",
      modelId: "model:enterprise-general",
      expectedModelRevision: digest("a"),
      changes: {
        displayName: "企业通用模型 2",
        credential: { mode: "retain" },
      },
    } as const;
    expect(UpdateAdminModelCommandSchema.parse(update)).toEqual(update);
    expect(UpdateAdminModelCommandSchema.safeParse({ ...update, changes: {} }).success).toBe(false);
    expect(UpdateAdminModelCommandSchema.safeParse({
      ...update,
      changes: { ...update.changes, apiKey: "forbidden" },
    }).success).toBe(false);
    const { expectedModelRevision: _omitted, ...withoutRevision } = update;
    expect(UpdateAdminModelCommandSchema.safeParse(withoutRevision).success).toBe(false);
  });

  it("keeps lifecycle/default concurrency explicit and prevents silent default selection", () => {
    const disable = {
      ...identity,
      kind: "set_admin_model_lifecycle",
      modelId: "model:enterprise-general",
      expectedModelRevision: digest("b"),
      lifecycle: "disabled",
      defaultDisposition: {
        mode: "replace",
        replacementModelId: "model:enterprise-backup",
        expectedReplacementModelRevision: digest("c"),
      },
    } as const;
    expect(SetAdminModelLifecycleCommandSchema.parse(disable)).toEqual(disable);
    expect(SetAdminModelLifecycleCommandSchema.safeParse({
      ...disable,
      lifecycle: "enabled",
      defaultDisposition: { mode: "no_default" },
    }).success).toBe(false);

    expect(SetDefaultAdminModelCommandSchema.parse({
      ...identity,
      kind: "set_default_admin_model",
      modelId: "model:enterprise-backup",
      expectedModelRevision: digest("c"),
      expectedCurrentDefault: {
        state: "model",
        modelId: "model:enterprise-general",
        modelRevision: digest("b"),
      },
    }).expectedCurrentDefault.state).toBe("model");
  });

  it("keeps connection facts total, safe, and independent from lifecycle", () => {
    expect(AdminModelConnectionCheckSchema.parse({ status: "unverified" })).toEqual({
      status: "unverified",
    });
    expect(AdminModelConnectionCheckSchema.safeParse({
      status: "unverified",
      durationMs: 1,
    }).success).toBe(false);
    expect(AdminModelConnectionCheckSchema.parse({
      status: "auth_failed",
      safeReason: "服务商拒绝了当前凭据。",
      durationMs: 35,
      testedAt: "2026-08-30T08:30:00.000Z",
      correlationId: identity.correlationId,
    }).status).toBe("auth_failed");
    expect(AdminModelConnectionCheckSchema.safeParse({
      status: "success",
      safeReason: "must not exist",
      durationMs: 35,
      testedAt: "2026-08-30T08:30:00.000Z",
      correlationId: identity.correlationId,
    }).success).toBe(false);
  });

  it("provides an editable safe detail without credential material", () => {
    const detail = AdminManagedModelDetailSchema.parse({
      modelId: "model:enterprise-general",
      modelRevision: digest("d"),
      displayName: "企业通用模型",
      providerFamily: "openai_compatible",
      endpoint: "https://provider.example/v1",
      providerModelId: "gpt-5.2-2025-12-11",
      lifecycle: "disabled",
      defaultForNewTasks: false,
      credentialStatus: "configured",
      lastConnectionCheck: { status: "unverified" },
    });
    expect(detail.credentialStatus).toBe("configured");
    for (const forbidden of ["secret", "apiKey", "credentialRef", "last4"] as const) {
      expect(AdminManagedModelDetailSchema.safeParse({
        ...detail,
        [forbidden]: "forbidden",
      }).success).toBe(false);
    }
    expect(AdminManagedModelDetailSchema.safeParse({
      ...detail,
      defaultForNewTasks: true,
    }).success).toBe(false);
  });

  it("freezes safe committed receipts and safe typed errors", () => {
    expect(AdminModelMutationReceiptSchema.parse({
      kind: "admin_model_mutation_receipt",
      contractVersion: ADMIN_CONTROL_V1ALPHA2_CONTRACT_VERSION,
      commandId: identity.commandId,
      correlationId: identity.correlationId,
      modelId: "model:enterprise-general",
      modelRevision: digest("e"),
      result: "committed",
      replayed: false,
    }).result).toBe("committed");
    expect(AdminControlV1Alpha2SafeErrorSchema.parse({
      kind: "admin_control_error",
      contractVersion: ADMIN_CONTROL_V1ALPHA2_CONTRACT_VERSION,
      errorCode: "revision_conflict",
      httpStatus: "409",
      safeSummary: "模型已被其他操作更新，请刷新后重试。",
      retryable: false,
      correlationId: identity.correlationId,
    }).errorCode).toBe("revision_conflict");
  });

  it("resolves the built v1alpha2 package subpath", async () => {
    const subpath = await import("@robothree/contracts/admin-control/v1alpha2");
    expect(subpath.ADMIN_CONTROL_V1ALPHA2_CONTRACT_VERSION)
      .toBe(ADMIN_CONTROL_V1ALPHA2_CONTRACT_VERSION);
    expect(subpath.AdminModelMutationCommandSchema).toBeDefined();
  });
});
