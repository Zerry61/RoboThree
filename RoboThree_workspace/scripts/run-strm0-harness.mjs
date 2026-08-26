import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STRM0_SCENARIOS,
  assertStrm0LeakageScannerNegativeCoverage,
  scanStrm0Leakage,
  strm0SemanticDigest,
  validateStrm0ScenarioEvidence,
} from "./strm0-evidence.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const electron = join(
  workspaceRoot,
  "apps",
  "desktop",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);
const vitest = join(
  workspaceRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);
const childScript = join(workspaceRoot, "scripts", "run-strm0-route-a-electron.mjs");
const scenarioSequence = Object.freeze([
  "roundtrip",
  "roundtrip",
  "roundtrip",
  ...STRM0_SCENARIOS.filter((scenario) => scenario !== "roundtrip"),
]);
const childStdout = [];
const childStderr = [];
const results = [];
const startedAt = Date.now();

run(vitest, ["run", "scripts/strm0-evidence.test.mjs"]);
for (const scenario of scenarioSequence) {
  const result = spawnSync(electron, [childScript, scenario], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: cleanElectronEnvironment(process.env),
    maxBuffer: 4 * 1024 * 1024,
    shell: process.platform === "win32",
    timeout: 15_000,
  });
  if (result.error !== undefined) throw result.error;
  childStdout.push(result.stdout ?? "");
  childStderr.push(result.stderr ?? "");
  if (result.status !== 0) {
    throw new Error(`strm0_electron_scenario_failed:${scenario}:${String(result.status)}`);
  }
  const lines = (result.stdout ?? "").trim().split(/\r?\n/u);
  const evidence = JSON.parse(lines.at(-1) ?? "null");
  results.push(evidence);
}

const scenarioEvidence = validateStrm0ScenarioEvidence(results);
const negativeLeakInjectionDetectionCount =
  assertStrm0LeakageScannerNegativeCoverage();
const safeTrace = JSON.stringify(results.map((result) => ({
  scenario: result.scenario,
  status: result.status,
  terminalCode: result.terminalCode,
  resources: result.resources,
})));
const semantic = Object.freeze({
  profileRevision: "strm0.route-a.v1",
  routeDecision: "ROUTE_A_ACCEPTABLE",
  scenarioEvidence,
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  structuredCloneUsed: true,
  zeroCopyClaimed: false,
  internalCopiesReliablyClearable: false,
  controlledApplicationBuffersZeroized: true,
  runtimeFallbackEnabled: false,
  productionInterfaceImplemented: false,
  rendererIntegrated: false,
});
const machineEvidence = JSON.stringify(semantic);
const leakage = scanStrm0Leakage({
  parentStdout: childStdout.join("\n"),
  childStderr: childStderr.join("\n"),
  machineEvidence,
  safeTrace,
});
if (leakage.totalMatchCount !== 0) {
  throw new Error("strm0_sensitive_output_detected");
}

const evidence = Object.freeze({
  status: "PASS",
  outcome: "ROUTE_A_ACCEPTABLE",
  profileRevision: "strm0.route-a.v1",
  electronProcessScenarioRunCount: scenarioEvidence.scenarioRunCount,
  uniqueScenarioCount: scenarioEvidence.uniqueScenarioCount,
  roundtripReplayCount: scenarioEvidence.roundtripReplayCount,
  observableApplicationCopyLowerBound:
    scenarioEvidence.observableApplicationCopyLowerBound,
  structuredCloneInternalCopiesReliablyClearable: false,
  zeroCopyClaimed: false,
  residualRiskRequiresExplicitAcceptance: true,
  productionSensitiveTransportReady: false,
  electronMessagePortBlockerClosed: false,
  productionInterfaceImplemented: false,
  rendererIntegrated: false,
  runtimeFallbackEnabled: false,
  fourChannelLeakageMatchCounts: leakage.channelMatchCounts,
  sensitiveOutputMatchCount: leakage.totalMatchCount,
  negativeLeakInjectionDetectionCount,
  resourceCounts: Object.freeze({
    windowCount: 0,
    portCount: 0,
    timerCount: 0,
    ipcListenerCount: 0,
    requestCount: 0,
    registryCount: 0,
    childCount: 0,
    helperCount: 0,
  }),
  semanticEvidenceDigest: strm0SemanticDigest(semantic),
  durationMs: Date.now() - startedAt,
});

process.stdout.write(`${JSON.stringify(evidence)}\n`);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "true", VITEST_MAX_WORKERS: "1" },
    maxBuffer: 16 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function cleanElectronEnvironment(environment) {
  const clean = { ...environment, NODE_ENV: "test" };
  delete clean.ELECTRON_RUN_AS_NODE;
  return clean;
}
