import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();

describe("DFI-5.3.3 enterprise reasoning mapping boundary", () => {
  it("keeps the Task-locked mapper in the authorized durable and task-resolution paths only", () => {
    expect(scan("services/core/src", /TaskLockedReasoningProviderMapper/u)
      .filter((file) => !file.endsWith("task-locked-reasoning-provider-mapper.ts")))
      .toEqual([
        "services/core/src/application/durable-local-personal-model-provider.ts",
        "services/core/src/application/task-locked-model-provider-resolution.ts",
      ]);
    expect(scan("services/core/src", /EnterpriseReasoningMappingInstallation/u)
      .filter((file) => !file.endsWith("enterprise-reasoning-mapping.ts")))
      .toEqual(["services/core/src/application/durable-enterprise-model-provider.ts"]);
  });

  it("keeps raw private directives out of Contracts, Desktop and Admin", () => {
    const pattern = /ProviderReasoningProjection|openai_reasoning_effort|anthropic_thinking_budget/u;
    expect([
      ...scan("packages/contracts/src", pattern),
      ...scan("apps/desktop/src", pattern),
      ...scan("apps/admin-console/src", pattern),
    ]).toEqual([]);
  });

  it("installs no enterprise release and allows only the local PRA-2 materializer", () => {
    expect(scan(
      "services/central-service/src/main",
      /new\s+EnterpriseReasoningMappingRelease\s*\(/u,
    )).toEqual([]);
    expect(scan(
      "services/core/src",
      /createProviderReasoningMappingRelease\s*\(/u,
    ).filter((file) => !file.endsWith("provider-reasoning-mapping-domain.ts")))
      .toEqual([
        "services/core/src/application/exact-subject-provider-release-materializer.ts",
      ]);
  });

  it("uses an explicit property gate and forbids production activation", () => {
    const controller = text(
      "services/central-service/src/main/java/com/robothree/central/modelgateway/adapter/http/ModelInvocationV1Alpha3Controller.java",
    );
    const gate = text(
      "services/central-service/src/main/java/com/robothree/central/modelgateway/configuration/EnterpriseReasoningGatewayStartupGate.java",
    );
    expect(controller).toContain("enterprise-reasoning-v1alpha3-enabled");
    expect(gate).toContain("enterprise_reasoning_production_activation_forbidden");
    expect(gate).not.toMatch(/ConditionalOnMissingBean/u);
  });

  it("keeps production SubmitTurn v1alpha3 and Desktop Max UI unreachable", () => {
    expect(scan("apps", /reasoning_effort|budget_tokens|locked_max_strategy/u)).toEqual([]);
    expect(scan(
      "services/core/src/bootstrap",
      /EnterpriseReasoningMappingInstallation|ReasoningMappingRelease/u,
    )).toEqual([]);
  });

  it("keeps migration and lockfile boundaries frozen", () => {
    const ids = [...text("services/core/src/adapters/sqlite/migrations.ts")
      .matchAll(/\bid:\s*(\d+),/gu)].map((match) => Number(match[1]));
    expect(Math.max(...ids)).toBe(26);
    expect(sha256(text("pnpm-lock.yaml")))
      .toBe("5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31");
  });

  it("retains CPC closure evidence as an upstream invariant", () => {
    const evidence = JSON.parse(text("artifacts/cpc3/evidence.json")) as {
      status: string;
      outcome: string;
    };
    expect(evidence).toMatchObject({
      status: "PASS",
      outcome: "CPC_CORE_PROMPT_MVP_CONFORMANT",
    });
  });

  it("contains no focused test escape hatch", () => {
    const focused = [
      "services/core/tests/dfi5.3.3-enterprise-reasoning-mapping.test.ts",
    ].map(text).join("\n");
    expect(focused).not.toMatch(/\.skip\(|\.only\(|@Disabled|\bsleep\b/u);
  });
});

function scan(relative: string, pattern: RegExp): string[] {
  return listFiles(relative).filter((file) => pattern.test(text(file)));
}

function listFiles(relative: string): string[] {
  const output: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(join(workspace, directory), { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (/\.(?:ts|tsx|js|mjs|java|json)$/u.test(entry.name)) output.push(child);
    }
  };
  visit(relative);
  return output.sort();
}

function text(relative: string): string {
  return readFileSync(join(workspace, relative), "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
