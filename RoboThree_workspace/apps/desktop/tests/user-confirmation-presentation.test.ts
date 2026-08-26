import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { UserConfirmationProjection } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  canShowConfirmationDecisionActions,
  presentUserConfirmation,
  userConfirmationStatusLabel,
  userConfirmationTitle,
  type UserConfirmationPresentationInput,
} from "../src/renderer/presentation/user-confirmation-presentation.js";

const presentationSource = resolve(
  "apps/desktop/src/renderer/presentation/user-confirmation-presentation.ts",
);

const allStatuses = [
  "pending",
  "confirmed",
  "rejected",
  "expired",
] as const satisfies readonly UserConfirmationProjection["status"][];

function confirmation(
  status: UserConfirmationProjection["status"],
  overrides: Partial<UserConfirmationPresentationInput> = {},
): UserConfirmationPresentationInput {
  return {
    status,
    reasonSummary: "需要访问目标文件。",
    riskSummary: "只读取授权目录。",
    targetSummary: "工作区报告。",
    consequenceSummary: "允许后读取一次。",
    ...overrides,
  };
}

describe("User Confirmation presentation", () => {
  it("covers all confirmation statuses with stable labels and titles", () => {
    expect(allStatuses.map((status) => [
      status,
      userConfirmationStatusLabel(status),
      userConfirmationTitle(status),
      presentUserConfirmation(confirmation(status)).statusClass,
    ])).toEqual([
      ["pending", "等待确认", "等待你的确认", "pending"],
      ["confirmed", "已允许", "已允许", "confirmed"],
      ["rejected", "已拒绝", "已拒绝", "rejected"],
      ["expired", "已过期", "已过期", "expired"],
    ]);
  });

  it("shows decision actions only for pending confirmations", () => {
    expect(allStatuses.map((status) => [
      status,
      canShowConfirmationDecisionActions(confirmation(status)),
    ])).toEqual([
      ["pending", true],
      ["confirmed", false],
      ["rejected", false],
      ["expired", false],
    ]);
  });

  it("returns only safe card display data", () => {
    expect(presentUserConfirmation(confirmation("pending"))).toEqual({
      title: "等待你的确认",
      statusLabel: "等待确认",
      statusClass: "pending",
      reasonSummary: "需要访问目标文件。",
      riskSummary: "只读取授权目录。",
      meta: [
        { label: "目标", value: "工作区报告。" },
        { label: "确认后", value: "允许后读取一次。" },
      ],
      canShowDecisionActions: true,
    });
  });

  it("does not expose sensitive fields when extra input properties are present", () => {
    const sensitiveConfirmation: UserConfirmationPresentationInput & {
      requestDigest: string;
      prompt: string;
      toolParameters: string;
      CapabilityLock: string;
      Credential: string;
      Token: string;
    } = {
      ...confirmation("pending"),
      requestDigest: "digest-should-not-render",
      prompt: "prompt-should-not-render",
      toolParameters: "tool-parameters-should-not-render",
      CapabilityLock: "lock-should-not-render",
      Credential: "credential-should-not-render",
      Token: "token-should-not-render",
    };
    const output = JSON.stringify(presentUserConfirmation(sensitiveConfirmation));

    expect(output).not.toContain("digest-should-not-render");
    expect(output).not.toContain("prompt-should-not-render");
    expect(output).not.toContain("tool-parameters-should-not-render");
    expect(output).not.toContain("lock-should-not-render");
    expect(output).not.toContain("credential-should-not-render");
    expect(output).not.toContain("token-should-not-render");
    expect(output).not.toContain("requestDigest");
    expect(output).not.toContain("toolParameters");
  });

  it("keeps presentation source pure and free of sensitive runtime fields", async () => {
    const source = await readFile(presentationSource, "utf8");
    expect(source).toContain("assertNever(status)");
    expect(source).not.toMatch(/\bh\s*\(/);
    for (const forbidden of [
      "from \"vue\"",
      "document.",
      "window.",
      "robothreeDesktop",
      "prompt",
      "toolParameters",
      "requestDigest",
      "CapabilityLock",
      "Credential",
      "Token",
      "authorizationToken",
      "resultPayload",
      "executionReceipt",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
