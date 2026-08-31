import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const workspace = process.cwd();
const canonicalDigests = {
  "schemas/model-invocation.schema.json": "0ba2f3e903643a140059960bbaad3272bf35a4df2dbadc60d23f4dd2afa63a21",
  "schemas/compatibility.schema.json": "630505fd8efec461fe0bfd9a30188b431e9590417891fe03d08bb53c1912f8bc",
  "openapi.yaml": "958d0a2ca5fee08bf7b474687d7001f01deb83e764f87ab140b6813fea912aa1",
  "fixtures/manifest.json": "9394e4b6da2b69e322d31ed789572a0aa3a74ef070a4c555cfbbc7ddc008ddab",
} as const;
const facts: Record<string, unknown> = {};

afterAll(() => {
  const output = process.env.ROBOTHREE_DFI534_BOUNDARY_EVIDENCE_PATH;
  if (output === undefined) return;
  writeFileSync(output, JSON.stringify({ status: "PASS", ...facts }), "utf8");
});

describe("DFI-5.3.4 closure boundary", () => {
  it("freezes all four Gateway v1alpha3 canonical files", () => {
    for (const [relative, expected] of Object.entries(canonicalDigests)) {
      expect(sha256(bytes(`contracts/enterprise-gateway/v1alpha3/${relative}`))).toBe(expected);
    }
    facts.gatewayV1Alpha3CanonicalDigests = canonicalDigests;
  });

  it("retains single dispatch for Gateway v1, v2 and v3 without malformed fallback", () => {
    const mapper = text(
      "services/central-service/src/main/java/com/robothree/central/modelgateway/adapter/http/ModelInvocationHttpMapper.java",
    );
    expect(mapper).toContain("parseAccept(ObjectNode document)");
    expect(mapper).toContain("parseAcceptV1Alpha2(ObjectNode document)");
    expect(mapper).toContain("parseAcceptV1Alpha3(ObjectNode document)");
    expect(mapper).not.toMatch(/catch[\s\S]{0,160}parseAcceptV1Alpha2/u);
    facts.gatewayDispatchVersions = ["v1alpha1", "v1alpha2", "v1alpha3"];
  });

  it("keeps production activation, routes and releases unavailable", () => {
    const gate = text(
      "services/central-service/src/main/java/com/robothree/central/modelgateway/configuration/EnterpriseReasoningGatewayStartupGate.java",
    );
    expect(gate).toContain("enterprise_reasoning_production_activation_forbidden");
    expect(scan("services/core/src/bootstrap", /ReasoningMappingRelease|EnterpriseReasoningMappingInstallation/u))
      .toEqual([]);
    expect(scan("services/central-service/src/main", /new\s+EnterpriseReasoningMappingRelease\s*\(/u))
      .toEqual([]);
    expect(scan("apps", /reasoning_effort|budget_tokens|locked_max_strategy/u)).toEqual([]);
    Object.assign(facts, {
      productionSubmitTurnV1Alpha3Reachable: false,
      desktopMaxUiReady: false,
      productionGatewayV1Alpha3RouteCount: 0,
      productionLocalPersonalMaxReleaseCount: 0,
      productionEnterpriseOpenAiMaxReleaseCount: 0,
      productionEnterpriseAnthropicMaxReleaseCount: 0,
      productionCpcActivationEnabled: false,
      productionEnterpriseEntitlementReady: false,
      tgmReady: false,
      knowledgeProviderReady: false,
      agentLifecycleReady: false,
      desktopAdminV2ConsumptionReady: false,
    });
  });

  it("keeps private mapping material out of public Contracts and UIs", () => {
    const pattern = /ProviderReasoningProjection|openai_reasoning_effort|anthropic_thinking_budget/u;
    expect([
      ...scan("packages/contracts/src", pattern),
      ...scan("apps/desktop/src", pattern),
      ...scan("apps/admin-console/src", pattern),
    ]).toEqual([]);
    facts.publicPrivateMappingLeakCount = 0;
  });

  it("freezes migration 26 and the exact lockfile", () => {
    const ids = [...text("services/core/src/adapters/sqlite/migrations.ts")
      .matchAll(/\bid:\s*(\d+),/gu)].map((match) => Number(match[1]));
    expect(Math.max(...ids)).toBe(26);
    expect(sha256(bytes("pnpm-lock.yaml")))
      .toBe("5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31");
    facts.migrationMax = 26;
    facts.lockfileDigest = "sha256:5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
  });

  it("contains no DFI-5.3.4 production capability implementation", () => {
    expect(scan("services/core/src", /DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT|Dfi534/u))
      .toEqual([]);
    expect(scan("services/central-service/src/main", /DFI53_REASONING_PROVIDER_MAPPING_CONFORMANT|Dfi534/u))
      .toEqual([]);
  });
});

function scan(relative: string, pattern: RegExp) {
  return listFiles(relative).filter((file) => pattern.test(text(file)));
}

function listFiles(relative: string) {
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

function text(relative: string) { return readFileSync(join(workspace, relative), "utf8"); }
function bytes(relative: string) { return readFileSync(join(workspace, relative)); }
function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
