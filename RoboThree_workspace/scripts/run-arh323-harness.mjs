import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  resolveJavaToolchain,
  withJavaToolchainEnvironment,
} from "./java-toolchain.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const centralRoot = join(workspaceRoot, "services", "central-service");
const toolchain = await resolveJavaToolchain();
const wrapper = join(
  centralRoot,
  process.platform === "win32" ? "mvnw.cmd" : "mvnw",
);
const testClasses = [
  "ProviderCacheProjectionResolverTest",
  "ModelProviderAdapterConformanceTest",
  "ProviderBackedModelInvocationExecutionBackendTest",
  "Arh323ControlledProviderProcessIntegrationTest",
  "ProviderUsageFactsTest",
  "PromptCachePlannerTest",
  "PromptCacheRuntimeTest",
  "ModelInvocationRuntimeTest",
  "CentralArh322ArchitectureTest",
  "CentralArh323ArchitectureTest",
];

const result = spawnSync(
  wrapper,
  ["-q", `-Dtest=${testClasses.join(",")}`, "test"],
  {
    cwd: centralRoot,
    env: withJavaToolchainEnvironment(toolchain),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  },
);
if (result.error !== undefined) throw result.error;

const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const forbidden = [
  "arh323-canary-9f7d1b72",
  "controlled-provider-key",
  "Controlled static instruction.",
  "Controlled dynamic input.",
  "Authorization: Bearer",
  "x-api-key:",
];
let sensitiveOutputMatchCount = forbidden.filter((value) =>
  combined.includes(value),
).length;
if (result.status !== 0 || sensitiveOutputMatchCount > 0) {
  process.stdout.write(`${JSON.stringify({
    status: "FAILED",
    errorCode:
      sensitiveOutputMatchCount > 0
        ? "prompt_cache.harness_sensitive_output_detected"
        : "prompt_cache.harness_gate_failed",
    sensitiveOutputMatchCount,
  })}\n`);
  process.exit(result.status ?? 1);
}

let tests = 0;
let skipped = 0;
for (const testClass of testClasses) {
  for (const report of reportCandidates(testClass)) {
    if (!existsSync(report)) continue;
    const xml = readFileSync(report, "utf8");
    sensitiveOutputMatchCount += forbidden.filter((value) =>
      xml.includes(value),
    ).length;
    const suite = xml.match(
      /<testsuite[^>]*\btests="(\d+)"[^>]*\bskipped="(\d+)"/u,
    );
    if (suite !== null) {
      tests += Number.parseInt(suite[1], 10);
      skipped += Number.parseInt(suite[2], 10);
    }
    break;
  }
}

if (sensitiveOutputMatchCount > 0 || skipped > 0 || tests < 41) {
  process.stdout.write(`${JSON.stringify({
    status: "FAILED",
    errorCode: "prompt_cache.harness_evidence_invalid",
    testCount: tests,
    skippedCount: skipped,
    sensitiveOutputMatchCount,
  })}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  testClassCount: testClasses.length,
  testCount: tests,
  skippedCount: skipped,
  namedCrashWindows: ["C8", "C9", "C10a", "C10b", "C10c"],
  controlledProviderProtocols: [
    "anthropic_compatible",
    "openai_compatible",
  ],
  providerProjectionEnabled: true,
  providerProjectionDefaultEnabled: false,
  realProviderProductionReadyClaimed: false,
  sensitiveOutputMatchCount,
})}\n`);

function reportCandidates(simpleName) {
  const root = join(centralRoot, "target", "surefire-reports");
  const packages = [
    "com.robothree.central.modelgateway.application",
    "com.robothree.central.modelgateway.provider",
    "com.robothree.central.modelgateway.adapter.runtime",
    "com.robothree.central.modelgateway.domain",
    "com.robothree.central.architecture",
  ];
  return packages.map((name) => join(root, `TEST-${name}.${simpleName}.xml`));
}
