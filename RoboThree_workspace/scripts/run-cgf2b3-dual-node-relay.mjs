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

const result = spawnSync(
  wrapper,
  [
    "-q",
    "-f",
    join(workspaceRoot, "services", "central-service", "pom.xml"),
    "-Dtest=Cgf2b32DualNodeRelayRecoveryIntegrationTest,CentralCgf2b32ArchitectureTest",
    "test",
  ],
  {
    cwd: workspaceRoot,
    env: environment,
    shell: isWindows,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  },
);

if (result.error !== undefined) {
  throw result.error;
}

const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const forbidden = [
  "cgf2b32-test-credential",
  "Return the fixed synthetic relay recovery acknowledgement.",
  "Authorization: Bearer",
  "x-api-key:",
];
if (forbidden.some((value) => combined.includes(value))) {
  process.stdout.write(
    `${JSON.stringify({
      status: "FAILED",
      errorCode: "model_gateway.harness_output_leak_detected",
    })}\n`,
  );
  process.exit(1);
}

if (result.status !== 0) {
  process.stdout.write(
    `${JSON.stringify({
      status: "FAILED",
      errorCode: "model_gateway.dual_node_relay_harness_failed",
      exitCode: result.status ?? 1,
    })}\n`,
  );
  process.exit(result.status ?? 1);
}

const marker = "ROBOTHREE_CGF2B32_RESULT=";
const resultLine = combined
  .split(/\r?\n/u)
  .find((line) => line.startsWith(marker));
if (resultLine === undefined) {
  process.stdout.write(
    `${JSON.stringify({
      status: "FAILED",
      errorCode: "model_gateway.harness_result_missing",
    })}\n`,
  );
  process.exit(1);
}

process.stdout.write(`${resultLine.slice(marker.length)}\n`);
