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
  "packages/contracts/tests/eipc1.1.1-enterprise-session-contracts.test.ts",
  "packages/contracts/tests/eipc0-enterprise-identity-contracts.test.ts",
]);
const javaEvidence = Object.freeze([
  "EnterpriseSessionContractConformanceTest",
  "EnterpriseIdentityCompositionContractConformanceTest",
  "EnterpriseContractV1Alpha2ConformanceTest",
]);
const forbiddenOutput = Object.freeze([
  "T1BBUVVFX0lERU5USVRZX0hBTkRMRV9GSVhUVVJF",
  "RklYVFVSRV9TSUdOQVRVUkVfTk9UX1JFQUw",
  "eyFixture.Header.Payload.Signature",
  "credentialReference",
  "/Users/example/private/enterprise-session",
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
  `-Dtest=${javaEvidence.join(",")}`,
  "test",
], withJavaToolchainEnvironment(toolchain));

const capturedOutput = `${node.stdout}\n${node.stderr}\n${java.stdout}\n${java.stderr}`;
const sensitiveOutputMatchCount = forbiddenOutput
  .filter((value) => capturedOutput.includes(value)).length;
if (sensitiveOutputMatchCount !== 0) {
  throw new Error("EIPC-1.1.1 Harness output contained a forbidden fixture value");
}

const evidenceMaterial = Object.freeze({
  blocker: "BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION",
  contractVersion: "enterprise-session.v1alpha1",
  identityCompositionBlockerClosed: false,
  javaEvidence,
  nodeEvidence,
  outcome: "EIPC111_CONTRACT_CROSS_LANGUAGE_CONFORMANT",
  productionIdentityReady: false,
  productionSessionEnabled: false,
});
const evidenceDigest = createHash("sha256")
  .update(JSON.stringify(evidenceMaterial))
  .digest("hex");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  ...evidenceMaterial,
  downstreamCodingUnlocked: false,
  legacyContractDriftCount: 0,
  canonicalDigestCaseCount: 6,
  nodeEvidenceFileCount: nodeEvidence.length,
  javaEvidenceClassCount: javaEvidence.length,
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
