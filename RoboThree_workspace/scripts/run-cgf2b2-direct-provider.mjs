import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveJavaToolchain,
  withJavaToolchainEnvironment,
} from "./java-toolchain.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const requiredNames = [
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY",
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_ENDPOINT",
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_PROTOCOL",
  "ROBOTHREE_CGF2B2_DIRECT_PROVIDER_MODEL_ID",
];
const missing = requiredNames.filter((name) => {
  const value = process.env[name];
  return value === undefined || value.trim().length === 0;
});

if (missing.length > 0) {
  process.stdout.write(
    `${JSON.stringify({
      status: "RESOURCE_GATED",
      missing,
      message: "Direct Provider resources were not supplied; no network call was attempted.",
    })}\n`,
  );
  process.exit(0);
}

const protocol = process.env.ROBOTHREE_CGF2B2_DIRECT_PROVIDER_PROTOCOL;
if (
  protocol !== "ANTHROPIC_COMPATIBLE" &&
  protocol !== "OPENAI_COMPATIBLE"
) {
  process.stdout.write(
    `${JSON.stringify({
      status: "RESOURCE_INVALID",
      errorCode: "model_gateway.provider_protocol_invalid",
    })}\n`,
  );
  process.exit(1);
}

const toolchain = await resolveJavaToolchain();
const isWindows = process.platform === "win32";
const wrapper = join(
  workspaceRoot,
  "services",
  "central-service",
  isWindows ? "mvnw.cmd" : "mvnw",
);
const runCanary = `robothree-cgf2b2-${randomUUID()}`;
const environment = withJavaToolchainEnvironment(toolchain);
environment.ROBOTHREE_CGF2B2_RUN_CANARY = runCanary;

const result = spawnSync(
  wrapper,
  [
    "-q",
    "-f",
    join(workspaceRoot, "services", "central-service", "pom.xml"),
    "-Dtest=DirectProviderConformanceHarness",
    "test",
  ],
  {
    cwd: workspaceRoot,
    env: environment,
    shell: isWindows,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  },
);

if (result.error !== undefined) {
  throw result.error;
}

const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const secret = process.env.ROBOTHREE_CGF2B2_DIRECT_PROVIDER_KEY;
const forbidden = [
  secret,
  runCanary,
  Buffer.from(runCanary, "utf8").toString("base64"),
  encodeURIComponent(runCanary),
].filter((value) => value !== undefined && value.length > 0);
if (forbidden.some((value) => combined.includes(value))) {
  process.stdout.write(
    `${JSON.stringify({
      status: "FAILED",
      errorCode: "model_gateway.conformance_output_leak_detected",
    })}\n`,
  );
  process.exit(1);
}

if (result.status !== 0) {
  const diagnostic = safeDiagnostic(combined);
  process.stdout.write(
    `${JSON.stringify(diagnostic ?? {
      status: "FAILED",
      errorCode: "model_gateway.direct_provider_conformance_failed",
      exitCode: result.status ?? 1,
    })}\n`,
  );
  process.exit(result.status ?? 1);
}

const marker = "ROBOTHREE_CGF2B2_RESULT=";
const safeResultLine = combined
  .split(/\r?\n/u)
  .find((line) => line.startsWith(marker));
if (safeResultLine === undefined) {
  process.stdout.write(
    `${JSON.stringify({
      status: "FAILED",
      errorCode: "model_gateway.conformance_result_missing",
    })}\n`,
  );
  process.exit(1);
}

process.stdout.write(`${safeResultLine.slice(marker.length)}\n`);

function safeDiagnostic(output) {
  const marker = "ROBOTHREE_CGF2B2_DIAGNOSTIC=";
  const line = output
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith(marker));
  if (line === undefined) {
    return undefined;
  }
  try {
    const value = JSON.parse(line.slice(marker.length));
    const validPhase = [
      "normal_streaming",
      "invalid_credential",
      "cancel",
      "deadline",
    ].includes(value.phase);
    const validOutcome = [
      "COMPLETED",
      "FAILED",
      "UNCERTAIN",
      "CANCELLED",
      "TIMED_OUT",
    ]
      .includes(value.outcome);
    const validCode = typeof value.errorCode === "string"
      && /^model_gateway\.[a-z0-9_.-]{1,120}$/u.test(value.errorCode);
    if (value.status !== "FAILED" || !validPhase || !validOutcome || !validCode) {
      return undefined;
    }
    return {
      status: "FAILED",
      phase: value.phase,
      outcome: value.outcome,
      errorCode: value.errorCode,
    };
  } catch {
    return undefined;
  }
}
