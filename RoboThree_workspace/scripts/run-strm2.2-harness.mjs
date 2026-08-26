import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const vitest = join(workspaceRoot, "node_modules", ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest");
const electron = join(workspaceRoot, "apps", "desktop", "node_modules", ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron");
const startedAt = Date.now();

run(vitest, [
  "run",
  "packages/contracts/tests/strm1-personal-credential-transport-contract.test.ts",
  "packages/contracts/tests/strm2.1-personal-credential-control-contract.test.ts",
  "packages/contracts/tests/strm2.2-personal-credential-frame-authorization-contract.test.ts",
  "apps/desktop/tests/strm1-personal-credential-transport.test.ts",
  "apps/desktop/tests/strm2.1-personal-credential-lifecycle.test.ts",
  "apps/desktop/tests/strm2.2-personal-credential-directional-closure.test.ts",
  "tests/e2e/dfi4a21-sensitive-broker.e2e.test.ts",
  "tests/e2e/dfi4a23-owner-reveal.e2e.test.ts",
  "--reporter=dot",
]);

const scenarios = [
  "production_disabled",
  "mutation_completed",
  "reveal_completed",
  "broker_rejected",
];
const processEvidence = scenarios.map((scenario) => {
  const result = run(electron, ["scripts/run-strm22-directional-electron.mjs"], true, {
    ROBOTHREE_STRM22_SCENARIO: scenario,
  });
  return parseLastJsonLine(result.stdout);
});
for (const item of processEvidence) {
  if (item.status !== "PASS"
    || item.productionFeatureEnabled !== false
    || item.productionBusinessHandlerReady !== false
    || item.productionSensitiveTransportReady !== false
    || item.transportBlockerClosed !== false) {
    throw new Error("strm22_process_evidence_invalid");
  }
}
const mutation = processEvidence.find((item) => item.scenario === "mutation_completed");
const reveal = processEvidence.find((item) => item.scenario === "reveal_completed");
if (mutation?.executeCount !== 1 || mutation.mutationByteLength !== 4
  || mutation.terminal !== "completed"
  || reveal?.executeCount !== 1 || reveal.revealConsumed !== true) {
  throw new Error("strm22_directional_closure_missing");
}

const regression = parseLastJsonLine(run(
  process.execPath,
  ["scripts/run-strm2.1-harness.mjs"],
  true,
).stdout);
if (regression.outcome !== "STRM21_CONTROL_LIFECYCLE_CONFORMANT") {
  throw new Error("strm22_strm21_regression_invalid");
}

const evidence = Object.freeze({
  status: "PASS",
  outcome: "STRM22_BROKER_DIRECTIONAL_CLOSURE_CONFORMANT",
  focusedTestFileCount: 8,
  electronProcessScenarioRunCount: processEvidence.length,
  namedElectronScenarios: scenarios,
  controlledBroker: true,
  mutationExecuteCount: mutation.executeCount,
  revealExecuteCount: reveal.executeCount,
  productionFeatureEnabled: false,
  productionSensitiveTransportReady: false,
  productionBusinessHandlerReady: false,
  transportBlockerClosed: false,
  rendererBusinessApiExposed: false,
  zeroCopyClaimed: false,
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
    throw new Error("strm22_evidence_missing");
  }
  return value;
}
