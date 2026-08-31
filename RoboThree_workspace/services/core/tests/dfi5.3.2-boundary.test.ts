import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const authorizedLocalConsumers = [
  "services/core/src/application/durable-local-personal-model-provider.ts",
  "services/core/src/application/task-locked-model-provider-resolution.ts",
];

describe("DFI-5.3.2 Local Personal mapping boundary", () => {
  it("allows the Task-locked mapper only in the durable wrapper and the authorized task resolver", () => {
    expect(scan("services/core/src", /TaskLockedReasoningProviderMapper/u)
      .filter((file) => !file.endsWith("task-locked-reasoning-provider-mapper.ts")))
      .toEqual(authorizedLocalConsumers);
  });

  it("keeps Enterprise, Central, Desktop and Admin consumers at zero", () => {
    const pattern = /LocalPersonalReasoningProjection|LOCAL_PERSONAL_REASONING_TIMEOUT_POLICY_REF/u;
    expect([
      ...scan("services/central-service/src", pattern),
      ...scan("apps/desktop/src", pattern),
      ...scan("apps/admin-console/src", pattern),
    ]).toEqual([]);
  });

  it("keeps private projection and raw values out of public Contracts", () => {
    expect(scan(
      "packages/contracts/src",
      /LocalPersonalReasoningProjection|reasoning_effort|openai_reasoning_effort/u,
    )).toEqual([]);
  });

  it("allows only the uninstalled PRA-2 materializer to create a release", () => {
    const calls = scan(
      "services/core/src",
      /createProviderReasoningMappingRelease\s*\(/u,
    ).filter((file) => !file.endsWith("provider-reasoning-mapping-domain.ts"));
    expect(calls).toEqual([
      "services/core/src/application/exact-subject-provider-release-materializer.ts",
    ]);
  });

  it("does not expose mapping or timeout selection through process state", () => {
    const files = [
      "services/core/src/application/local-personal-reasoning-mapping.ts",
      "services/core/src/application/durable-local-personal-model-provider.ts",
      "services/core/src/adapters/https/local-personal-openai-compatible-model-provider.ts",
    ];
    expect(files.filter((file) =>
      /process\.env\.(?:REASONING|DFI5)|process\.argv[^\n]*(?:reasoning|DFI5)/u.test(text(file))))
      .toEqual([]);
  });

  it("keeps migration and lockfile boundaries frozen", () => {
    const ids = [...text("services/core/src/adapters/sqlite/migrations.ts")
      .matchAll(/\bid:\s*(\d+),/gu)].map((match) => Number(match[1]));
    expect(Math.max(...ids)).toBe(26);
    expect(sha256(text("pnpm-lock.yaml")))
      .toBe("5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31");
  });

  it("keeps production SubmitTurn and Desktop Max UI unreachable", () => {
    expect(scan("apps", /reasoning_effort|openai_reasoning_effort/u)).toEqual([]);
    expect(scan("services/core/src/bootstrap", /ReasoningMappingRelease|reasoningMapper/u))
      .toEqual([]);
  });

  it("contains no focused test escape hatch", () => {
    const focused = [
      "services/core/tests/dfi5.3.2-local-personal-reasoning-mapping.test.ts",
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
      else if (/\.(?:ts|tsx|js|mjs|json)$/u.test(entry.name)) output.push(child);
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
