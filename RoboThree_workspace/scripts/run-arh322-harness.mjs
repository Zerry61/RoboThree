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
const isWindows = process.platform === "win32";
const wrapper = join(centralRoot, isWindows ? "mvnw.cmd" : "mvnw");
const testClasses = [
  "PromptCachePlannerTest",
  "PromptCacheRuntimeTest",
  "PromptCacheInMemoryPersistenceTest",
  "PostgreSqlMyBatisPersistenceIntegrationTest",
  "EmbeddedPostgreSqlMyBatisPersistenceIntegrationTest",
  "EmbeddedPostgreSqlAlignment2aSchemaIntegrationTest",
  "Cgf2a3DualNodeModelRecoveryIntegrationTest",
  "CentralArh321ArchitectureTest",
  "CentralArh322ArchitectureTest",
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
  "model-recovery-harness-access",
  "Synthetic model recovery instruction.",
  "model-recovery.invalid",
  "Authorization: Bearer",
  "x-api-key:",
];
if (forbidden.some((value) => combined.includes(value))) {
  process.stdout.write(`${JSON.stringify({
    status: "FAILED",
    errorCode: "prompt_cache.harness_sensitive_output_detected",
  })}\n`);
  process.exit(1);
}
if (result.status !== 0) {
  process.stdout.write(`${JSON.stringify({
    status: "FAILED",
    errorCode: "prompt_cache.harness_gate_failed",
  })}\n`);
  process.exit(result.status ?? 1);
}

let tests = 0;
let skipped = 0;
for (const testClass of testClasses) {
  const candidates = reportCandidates(testClass);
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const report = readFileSync(file, "utf8");
    const suite = report.match(/<testsuite[^>]*\btests="(\d+)"[^>]*\bskipped="(\d+)"/u);
    if (suite !== null) {
      tests += Number.parseInt(suite[1], 10);
      skipped += Number.parseInt(suite[2], 10);
      break;
    }
  }
}

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  testClassCount: testClasses.length,
  testCount: tests,
  skippedCount: skipped,
  namedCrashWindows: ["C3", "C4", "C5", "C6", "C7"],
  dualJvmSharedPostgresql: true,
  providerProjectionEnabled: false,
  sensitiveOutputMatchCount: 0,
})}\n`);

function reportCandidates(simpleName) {
  const reportRoot = join(centralRoot, "target", "surefire-reports");
  const packages = [
    "com.robothree.central.modelgateway.application",
    "com.robothree.central.modelgateway.recovery",
    "com.robothree.central.persistence",
    "com.robothree.central.persistence.schema",
    "com.robothree.central.architecture",
  ];
  return packages.map((name) => join(reportRoot, `TEST-${name}.${simpleName}.xml`));
}
