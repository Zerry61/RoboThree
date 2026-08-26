import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  explainDesktopError,
  type DesktopErrorPresentationInput,
} from "../src/renderer/presentation/desktop-error-presentation.js";

const presentationSource = resolve(
  "apps/desktop/src/renderer/presentation/desktop-error-presentation.ts",
);

function desktopError(
  overrides: Partial<DesktopErrorPresentationInput> = {},
): DesktopErrorPresentationInput {
  return {
    contractVersion: "v1alpha1",
    code: "runtime.unavailable",
    category: "availability",
    safeSummary: "Local Core is unavailable.",
    retryable: true,
    correlationId: "00000000-0000-4000-8000-000000000001",
    ...overrides,
  };
}

describe("Desktop Error presentation", () => {
  it("uses known error code guidance", () => {
    expect(explainDesktopError(desktopError({
      code: "workspace.boundary_violation",
      category: "workspace_boundary",
      safeSummary: "Target is outside the authorized workspace.",
      retryable: false,
    }))).toBe(
      "workspace.boundary_violation: Target is outside the authorized workspace. 目标路径超出授权边界，请调整授权目录。",
    );
  });

  it("falls back to the retryable safe suggestion for unknown error codes", () => {
    expect(explainDesktopError(desktopError({
      code: "future.error_code",
      safeSummary: "Temporary desktop failure.",
      retryable: true,
    }))).toBe("future.error_code: Temporary desktop failure. 可重试。");
  });

  it("falls back to the non-retryable safe suggestion for unknown error codes", () => {
    expect(explainDesktopError(desktopError({
      code: "future.non_retryable",
      safeSummary: "Desktop environment is not ready.",
      retryable: false,
    }))).toBe("future.non_retryable: Desktop environment is not ready. 请先检查环境后重试。");
  });

  it("does not stringify unknown error objects or expose extra sensitive fields", () => {
    const sensitiveError: DesktopErrorPresentationInput & {
      authorizationToken: string;
      resultPayload: string;
      secret: string;
    } = {
      ...desktopError({
        code: "future.secret_bearing_error",
        safeSummary: "Safe summary only.",
        retryable: false,
      }),
      authorizationToken: "token-should-not-render",
      resultPayload: "payload-should-not-render",
      secret: "secret-should-not-render",
    };
    const output = explainDesktopError(sensitiveError);

    expect(output).toBe("future.secret_bearing_error: Safe summary only. 请先检查环境后重试。");
    expect(output).not.toContain("token-should-not-render");
    expect(output).not.toContain("payload-should-not-render");
    expect(output).not.toContain("secret-should-not-render");
    expect(output).not.toContain("authorizationToken");
    expect(output).not.toContain("resultPayload");
  });

  it("keeps presentation source free of UI/runtime APIs and object stringification", async () => {
    const source = await readFile(presentationSource, "utf8");
    expect(source).not.toMatch(/\bh\s*\(/);
    for (const forbidden of [
      "from \"vue\"",
      "document.",
      "window.",
      "robothreeDesktop",
      "JSON.stringify",
      "authorizationToken",
      "resultPayload",
      "executionReceipt",
      "workspaceCredential",
      "CapabilityLock",
      "secret",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
