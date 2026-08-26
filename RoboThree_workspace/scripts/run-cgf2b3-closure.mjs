import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveJavaToolchain,
  withJavaToolchainEnvironment,
} from "./java-toolchain.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const toolchain = await resolveJavaToolchain();
const isWindows = process.platform === "win32";
const wrapper = join(
  workspaceRoot,
  "services",
  "central-service",
  isWindows ? "mvnw.cmd" : "mvnw",
);
const environment = withJavaToolchainEnvironment(toolchain);

for (const name of [
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY",
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_ENDPOINT",
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_PROTOCOL",
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_MODEL_ID",
]) {
  delete environment[name];
}

const resourceGate = spawnSync(
  process.execPath,
  [join(workspaceRoot, "scripts", "run-cgf2b2-direct-provider.mjs")],
  {
    cwd: workspaceRoot,
    env: environment,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  },
);
const resourceGateOutput = `${resourceGate.stdout ?? ""}\n${resourceGate.stderr ?? ""}`;
if (resourceGate.status !== 0 || !resourceGateOutput.includes('"status":"RESOURCE_GATED"')) {
  fail("model_gateway.direct_provider_resource_gate_failed");
}

const result = spawnSync(
  wrapper,
  [
    "-q",
    "-f",
    join(workspaceRoot, "services", "central-service", "pom.xml"),
    "-Dtest=Cgf2b32DualNodeRelayRecoveryIntegrationTest,"
      + "ModelProviderAdapterConformanceTest,ModelProviderTransportSecurityTest,"
      + "ModelInvocationRuntimeTest,ProviderBackedModelInvocationExecutionBackendTest,"
      + "CentralCgf2b32ArchitectureTest,CentralCgf2b33ArchitectureTest",
    "test",
  ],
  {
    cwd: workspaceRoot,
    env: environment,
    shell: isWindows,
    encoding: "utf8",
    maxBuffer: 48 * 1024 * 1024,
  },
);

if (result.error !== undefined) {
  throw result.error;
}

const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const rawPrefixes = [
  "robothree-cgf2b32-",
  "cgf2b33-credential-",
  "cgf2b33-output-",
  "cgf2b33-header-",
];
const forbidden = [
  "Return the fixed synthetic relay recovery acknowledgement.",
  "Authorization: Bearer",
  "x-api-key:",
  ...rawPrefixes,
  ...rawPrefixes.map((value) => Buffer.from(value.slice(0, 12), "utf8")
    .toString("base64")),
  ...rawPrefixes.map((value) => encodeURIComponent(value)),
];
if (forbidden.some((value) => combined.includes(value))) {
  fail("model_gateway.closure_output_leak_detected");
}

if (result.status !== 0) {
  fail("model_gateway.cgf2b3_closure_failed", result.status ?? 1);
}

const b32 = marker(combined, "ROBOTHREE_CGF2B32_RESULT=");
const b33 = marker(combined, "ROBOTHREE_CGF2B33_RESULT=");
if (b32.status !== "PASS" || b32.passedScenarioCount !== 10
    || b33.status !== "PASS" || b33.lifecycleRoundCount !== 5
    || b33.scenarioCount !== 10 || b33.sensitiveOutputMatchCount !== 0) {
  fail("model_gateway.closure_result_invalid");
}

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  recoveryMatrix: "F1-F10",
  recoveryScenarioCount: b32.passedScenarioCount,
  lifecycleRoundCount: b33.lifecycleRoundCount,
  securityScenarioCount: b33.scenarioCount,
  centralProcessCount: b33.centralProcessCount,
  relayProcessCount: b33.relayProcessCount,
  finalClusterConnectionCount: b33.finalClusterConnectionCount,
  finalActiveRecoveryLeaseCount: b33.finalActiveRecoveryLeaseCount,
  finalActiveSseSubscriberCount: b33.finalActiveSseSubscriberCount,
  finalEphemeralBufferCount: b33.finalEphemeralBufferCount,
  finalRelayActiveRequestCount: b33.finalRelayActiveRequestCount,
  finalLiveChildProcessCount: b33.finalLiveChildProcessCount,
  sensitiveOutputMatchCount: b33.sensitiveOutputMatchCount,
  directProviderResourceGate: "RESOURCE_GATED",
  publicContractChanged: false,
})}\n`);

function marker(output, prefix) {
  const line = output.split(/\r?\n/u).find((candidate) => candidate.startsWith(prefix));
  if (line === undefined) {
    fail("model_gateway.closure_result_missing");
  }
  try {
    return JSON.parse(line.slice(prefix.length));
  } catch {
    fail("model_gateway.closure_result_invalid");
  }
}

function fail(errorCode, exitCode = 1) {
  process.stdout.write(`${JSON.stringify({ status: "FAILED", errorCode })}\n`);
  process.exit(exitCode);
}
