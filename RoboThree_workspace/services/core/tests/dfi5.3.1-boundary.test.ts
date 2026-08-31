import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ProviderReasoningMappingMaterialSchema,
  ProviderReasoningStrategyCommitmentMaterialSchema,
} from "../src/application/provider-reasoning-mapping-domain.js";
import { commitmentFixture } from "./support/dfi531-private-mapping-fixture.js";

const workspace = process.cwd();
const productionFiles = [
  "services/core/src/application/provider-reasoning-mapping-domain.ts",
  "services/core/src/application/release-pinned-reasoning-mapping-registry.ts",
  "services/core/src/application/task-locked-reasoning-provider-mapper.ts",
  "services/core/src/ports/provider-reasoning-mapping-source.ts",
];

describe("DFI-5.3.1 private mapping boundary", () => {
  it("keeps raw private mapping symbols out of public Contracts", () => {
    expect(scan("packages/contracts/src", /ProviderReasoning|mappingDigest|typedPrivateDirective/u))
      .toEqual([]);
  });

  it("keeps private mapping symbols out of Desktop and Admin", () => {
    expect(scan("apps", /ProviderReasoning|typedPrivateDirective|reasoning_mapping_conflict/u))
      .toEqual([]);
  });

  it("keeps the later DFI-5.3.3 Central bridge in its exact private boundary", () => {
    expect(scan("services/central-service/src/main", /ProviderReasoning|mappingDigest/u))
      .toEqual(expect.arrayContaining([
        "services/central-service/src/main/java/com/robothree/central/modelgateway/domain/ProviderReasoningProjection.java",
        "services/central-service/src/main/java/com/robothree/central/modelgateway/application/EnterpriseReasoningMappingRelease.java",
      ]));
    expect(scan("services/central-service/src/main", /DFI531/u)).toEqual([]);
  });

  it("does not install the registry or mapper in production bootstrap", () => {
    expect(scan("services/core/src/bootstrap", /TaskLockedReasoningProviderMapper|ReleasePinnedReasoningMappingRegistry/u))
      .toEqual([]);
  });

  it("allows only the DFI-5.3.2 Local Adapter integrity guard after stage cutover", () => {
    expect(scan("services/core/src/adapters", /ProviderReasoningMapping/u)).toEqual([
      "services/core/src/adapters/https/local-personal-openai-compatible-model-provider.ts",
    ]);
    expect(scan("services/core/src/adapters", /TaskLockedReasoningProviderMapper|ReleasePinnedReasoningMappingRegistry/u))
      .toEqual([]);
  });

  it("admits only the additive DFI-5.3.3 Gateway v1alpha3 directory", () => {
    expect(scan("contracts/enterprise-gateway", /v1alpha3|reasoning_mapping/u))
      .toEqual(expect.arrayContaining([
        "contracts/enterprise-gateway/v1alpha3/README.md",
        "contracts/enterprise-gateway/v1alpha3/openapi.yaml",
      ]));
  });

  it("keeps SQLite migrations at 26", () => {
    const migrations = text("services/core/src/adapters/sqlite/migrations.ts");
    const ids = [...migrations.matchAll(/\bid:\s*(\d+),/gu)].map((match) => Number(match[1]));
    expect(Math.max(...ids)).toBe(26);
  });

  it("keeps the accepted AAPI-0.4 lockfile digest", () => {
    expect(sha256(text("pnpm-lock.yaml")))
      .toBe("5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31");
  });

  it("does not make private mapping values configurable through process state", () => {
    expect(productionFiles.flatMap((file) => {
      const source = text(file);
      return /process\.env|process\.argv/u.test(source) ? [file] : [];
    })).toEqual([]);
  });

  it("uses strict private schemas that reject unknown JSON fields", () => {
    expect(() => ProviderReasoningStrategyCommitmentMaterialSchema.parse({
      ...commitmentFixture(),
      arbitraryJsonPatch: [{ path: "/reasoning", value: "xhigh" }],
    })).toThrow();
  });

  it("excludes derived Profile and mapping digests from Strategy material", () => {
    const keys = Object.keys(ProviderReasoningStrategyCommitmentMaterialSchema.parse(
      commitmentFixture(),
    ));
    expect(keys).not.toEqual(expect.arrayContaining([
      "profileRevision",
      "profileDigest",
      "strategyDigest",
      "mappingRevision",
      "mappingDigest",
    ]));
  });

  it("excludes mapping revision and digest from their own canonical material", () => {
    const shape = ProviderReasoningMappingMaterialSchema.safeParse({
      ...commitmentFixture(),
      mappingId: "reasoning.mapping.fixture",
    });
    expect(shape.success).toBe(false);
    expect(Object.keys(ProviderReasoningMappingMaterialSchema.shape))
      .not.toEqual(expect.arrayContaining(["mappingRevision", "mappingDigest"]));
  });

  it("keeps mappingDigest out of lock, ModelRequest, Receipt, and UI sources", () => {
    const unexpected = [
      ...scan("packages/contracts/src/reasoning-mode", /mappingDigest/u),
      ...scan("packages/contracts/src/model-protocol", /mappingDigest/u),
      ...scan("apps", /mappingDigest/u),
    ];
    expect(unexpected).toEqual([]);
  });

  it("contains no skipped focused tests or timing sleeps", () => {
    const focused = [
      "services/core/tests/dfi5.3.1-private-mapping-domain.test.ts",
      "services/core/tests/dfi5.3.1-task-locked-mapper.test.ts",
    ].map((file) => text(file))
      .join("\n");
    expect(focused).not.toMatch(/\.skip\(|\.only\(|@Disabled|setTimeout\(|\bsleep\b/u);
  });
});

function scan(relative: string, pattern: RegExp): string[] {
  return listFiles(relative).filter((file) => pattern.test(text(file)));
}

function listFiles(relative: string): string[] {
  const absolute = join(workspace, relative);
  const output: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:ts|tsx|js|mjs|json|java|md|yaml)$/u.test(entry.name)) {
        output.push(path.slice(workspace.length + 1));
      }
    }
  };
  visit(absolute);
  return output.sort();
}

function text(relative: string): string {
  return readFileSync(join(workspace, relative), "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
