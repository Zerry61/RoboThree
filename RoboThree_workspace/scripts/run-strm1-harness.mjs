import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const vitest = join(
  workspaceRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);
const startedAt = Date.now();

run(vitest, [
  "run",
  "packages/contracts/tests/strm1-personal-credential-transport-contract.test.ts",
  "apps/desktop/tests/strm1-personal-credential-transport.test.ts",
  "--reporter=dot",
]);

const strm0 = run(process.execPath, ["scripts/run-strm0-harness.mjs"], true);
const strm0Evidence = parseLastJsonLine(strm0.stdout);
if (strm0Evidence.outcome !== "ROUTE_A_ACCEPTABLE"
  || strm0Evidence.productionSensitiveTransportReady !== false
  || strm0Evidence.electronMessagePortBlockerClosed !== false
  || strm0Evidence.zeroCopyClaimed !== false
  || strm0Evidence.structuredCloneInternalCopiesReliablyClearable !== false) {
  throw new Error("strm1_route_a_regression_evidence_invalid");
}

const evidence = Object.freeze({
  status: "PASS",
  outcome: "STRM1_CONTRACT_ADAPTER_FOUNDATION_CONFORMANT",
  transportProfileRevision: "personal-credential.route-a.structured-clone.v1",
  contractAndAdapterTestFileCount: 2,
  contractAndAdapterTestCount: 16,
  routeARegressionScenarioRunCount: strm0Evidence.electronProcessScenarioRunCount,
  routeARegressionUniqueScenarioCount: strm0Evidence.uniqueScenarioCount,
  structuredCloneInternalCopiesReliablyClearable: false,
  zeroCopyClaimed: false,
  residualRiskAccepted: true,
  productionSensitiveTransportReady: false,
  productionFeatureEnabledByDefault: false,
  electronMessagePortBlockerClosed: false,
  personalModelCrudWired: false,
  credentialRevealUiWired: false,
  runtimeFallbackEnabled: false,
  sensitiveOutputMatchCount: strm0Evidence.sensitiveOutputMatchCount,
  resourceCounts: strm0Evidence.resourceCounts,
  durationMs: Date.now() - startedAt,
});

process.stdout.write(`${JSON.stringify(evidence)}\n`);

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "true", VITEST_MAX_WORKERS: "1" },
    maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  if (!capture && result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result;
}

function parseLastJsonLine(output) {
  const lines = output.trim().split(/\r?\n/u);
  const value = JSON.parse(lines.at(-1) ?? "null");
  if (typeof value !== "object" || value === null) {
    throw new Error("strm1_route_a_regression_evidence_missing");
  }
  return value;
}
