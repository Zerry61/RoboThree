import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

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
  "packages/contracts/tests/authorization-contracts.test.ts",
  "services/core/tests/model-invocation-admission.test.ts",
  "services/core/tests/model-context-provenance-classifier.test.ts",
  "services/core/tests/model-invocation-link-persistence.conformance.test.ts",
  "services/core/tests/sqlite-conversation-persistence.integration.test.ts",
  "services/core/tests/http-enterprise-model-gateway-client.integration.test.ts",
  "services/core/tests/durable-enterprise-model-provider.test.ts",
  "services/core/tests/agent-loop-coordinator.test.ts",
  "services/core/tests/tool-call-batch-coordinator.test.ts",
  "services/core/tests/user-confirmation.integration.test.ts",
  "services/core/tests/adr17-i3-recovery-matrix.test.ts",
]);
const javaEvidence = Object.freeze([
  "ModelInvocationHttpMapperTest",
  "ModelInvocationGatewayServiceTest",
  "ModelInvocationEphemeralBufferTest",
  "ModelInvocationAdmissionPolicyTest",
  "ModelInvocationRuntimeTest",
  "ProviderBackedModelInvocationExecutionBackendTest",
  "CentralCgf2c1ArchitectureTest",
  "CentralJavaAlignmentArchitectureTest",
]);
const forbiddenOutput = Object.freeze([
  "prompt-canary-cgf2c1",
  "model-output-canary-cgf2c1",
  "credential-canary-cgf2c1",
  "token-canary-cgf2c1",
  "endpoint-canary-cgf2c1",
  "/Users/example/private/workspace",
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
const sensitiveContentMatchCount = forbiddenOutput
  .filter((value) => capturedOutput.includes(value)).length;
if (sensitiveContentMatchCount !== 0) {
  throw new Error("CGF-2C.1 Harness output contained a forbidden synthetic canary");
}

const evidenceDigest = createHash("sha256")
  .update(JSON.stringify({
    matrix: "CGF-2C.1-section-14",
    matrixItemCount: 30,
    nodeEvidence,
    javaEvidence,
  }))
  .digest("hex");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  matrix: "CGF-2C.1-section-14",
  matrixItemCount: 30,
  nodeEvidenceFileCount: nodeEvidence.length,
  javaEvidenceClassCount: javaEvidence.length,
  evidenceDigest: `sha256:${evidenceDigest}`,
  sensitiveContentMatchCount,
  durationMs: Date.now() - startedAt,
})}\n`);

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: { ...env, CI: "true" },
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
