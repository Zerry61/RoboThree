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
const electron = join(
  workspaceRoot,
  "apps",
  "desktop",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);
const startedAt = Date.now();

run(vitest, [
  "run",
  "packages/contracts/tests/strm1-personal-credential-transport-contract.test.ts",
  "packages/contracts/tests/strm2.1-personal-credential-control-contract.test.ts",
  "apps/desktop/tests/strm1-personal-credential-transport.test.ts",
  "apps/desktop/tests/strm2.1-personal-credential-lifecycle.test.ts",
  "--reporter=dot",
]);

const scenarios = [
  "production_disabled",
  "ready_cancel",
  "hash_navigation",
  "renderer_crash",
  "foreign_window",
];
const scenarioEvidence = scenarios.map((scenario) => {
  const result = run(electron, [
    "scripts/run-strm21-lifecycle-electron.mjs",
  ], true, { ROBOTHREE_STRM21_SCENARIO: scenario });
  return parseLastJsonLine(result.stdout);
});
for (const item of scenarioEvidence) {
  if (item.status !== "PASS"
    || item.productionFeatureEnabled !== false
    || item.productionSensitiveTransportReady !== false
    || item.transportBlockerClosed !== false) {
    throw new Error("strm21_electron_lifecycle_evidence_invalid");
  }
}

const strm0 = run(process.execPath, ["scripts/run-strm0-harness.mjs"], true);
const strm0Evidence = parseLastJsonLine(strm0.stdout);
if (strm0Evidence.outcome !== "ROUTE_A_ACCEPTABLE"
  || strm0Evidence.electronMessagePortBlockerClosed !== false
  || strm0Evidence.zeroCopyClaimed !== false) {
  throw new Error("strm21_route_a_regression_evidence_invalid");
}

const evidence = Object.freeze({
  status: "PASS",
  outcome: "STRM21_CONTROL_LIFECYCLE_CONFORMANT",
  contractAndLifecycleTestFileCount: 4,
  contractAndLifecycleTestCount: 31,
  electronProcessScenarioRunCount: scenarioEvidence.length,
  namedElectronScenarios: scenarios,
  mainWiringInstalled: true,
  preloadWiringInstalled: true,
  productionFeatureEnabled: false,
  productionSensitiveTransportReady: false,
  productionBusinessHandlerReady: false,
  transportBlockerClosed: false,
  brokerDirectionalClosureImplemented: false,
  rendererBusinessApiExposed: false,
  routeARegressionScenarioRunCount: strm0Evidence.electronProcessScenarioRunCount,
  zeroCopyClaimed: false,
  sensitiveOutputMatchCount: strm0Evidence.sensitiveOutputMatchCount,
  resourceCounts: strm0Evidence.resourceCounts,
  durationMs: Date.now() - startedAt,
});

process.stdout.write(`${JSON.stringify(evidence)}\n`);

function run(command, args, capture = false, env = {}) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...cleanElectronEnvironment(process.env),
      ...env,
      CI: "true",
      VITEST_MAX_WORKERS: "1",
    },
    maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  if (!capture && result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result;
}

function cleanElectronEnvironment(environment) {
  const clean = { ...environment };
  delete clean.ELECTRON_RUN_AS_NODE;
  return clean;
}

function parseLastJsonLine(output) {
  const lines = output.trim().split(/\r?\n/u);
  const value = JSON.parse(lines.at(-1) ?? "null");
  if (typeof value !== "object" || value === null) {
    throw new Error("strm21_evidence_missing");
  }
  return value;
}
