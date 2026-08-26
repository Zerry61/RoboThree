import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveJavaToolchain,
  withJavaToolchainEnvironment,
} from "./java-toolchain.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const vitest = join(
  workspaceRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);
const nodeEvidence = Object.freeze([
  "packages/contracts/tests/eipc0-enterprise-identity-contracts.test.ts",
  "services/core/tests/eipc0-enterprise-identity-authority-semantics.test.ts",
  "services/core/tests/eipc0-authority-boundary.test.ts",
  "services/core/tests/enterprise-offline-projection.test.ts",
  "services/core/tests/runtime-activation-persistence.conformance.test.ts",
]);
const javaEvidence = "EnterpriseIdentityCompositionContractConformanceTest";
const forbiddenOutput = Object.freeze([
  "eipc0-bearer-canary-never-real",
  "eipc0-refresh-canary-never-real",
  "eipc0-device-proof-canary-never-real",
  "eipc0-private-key-canary-never-real",
  "/Users/example/private/enterprise-identity",
]);

const startedAt = Date.now();
const node = run(vitest, ["run", ...nodeEvidence], process.env);
const toolchain = await resolveJavaToolchain();
const wrapper = join(
  workspaceRoot,
  "services",
  "central-service",
  process.platform === "win32" ? "mvnw.cmd" : "mvnw",
);
const java = run(wrapper, [
  "-q",
  "-f",
  join(workspaceRoot, "services", "central-service", "pom.xml"),
  `-Dtest=${javaEvidence}`,
  "test",
], withJavaToolchainEnvironment(toolchain));

const capturedOutput = `${node.stdout}\n${node.stderr}\n${java.stdout}\n${java.stderr}`;
const sensitiveOutputMatchCount = forbiddenOutput
  .filter((value) => capturedOutput.includes(value)).length;
if (sensitiveOutputMatchCount !== 0) {
  throw new Error("EIPC-0 Harness output contained a forbidden synthetic canary");
}

const evidenceDigest = createHash("sha256")
  .update(JSON.stringify({
    contractVersion: "eipc.v1alpha1",
    javaEvidence,
    nodeEvidence,
    outcome: "AUTHORITY_SEMANTICS_FROZEN",
    productionIdentityReady: false,
  }))
  .digest("hex");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  outcome: "AUTHORITY_SEMANTICS_FROZEN",
  contractVersion: "eipc.v1alpha1",
  productionIdentityReady: false,
  identityCompositionBlockerClosed: false,
  legacyGatewaySupportsPersonalModelConfigure: false,
  productionAdapterImplemented: false,
  nodeEvidenceFileCount: nodeEvidence.length,
  javaEvidenceClassCount: 1,
  evidenceDigest: `sha256:${evidenceDigest}`,
  sensitiveOutputMatchCount,
  durationMs: Date.now() - startedAt,
})}\n`);

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: { ...env, CI: "true", VITEST_MAX_WORKERS: "1" },
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  const stdout = sanitize(result.stdout ?? "");
  const stderr = sanitize(result.stderr ?? "");
  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return { stdout, stderr };
}

function sanitize(value) {
  return value.split(workspaceRoot).join("<workspace>");
}
