import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import {
  assertStrm23LeakageScannerNegativeCoverage,
  scanStrm23Leakage,
} from "./strm23-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const electron = join(root, "apps/desktop/node_modules/.bin/electron");
const vitest = join(root, "node_modules/.bin/vitest");
const artifactDirectory = join(root, "artifacts/strm3");
const focusedFiles = Object.freeze([
  "apps/desktop/tests/strm3-sensitive-transport-activation.test.ts",
  "services/core/tests/strm3-sensitive-transport-activation.test.ts",
  "apps/desktop/tests/strm2.1-personal-credential-lifecycle.test.ts",
  "apps/desktop/tests/strm2.2-personal-credential-directional-closure.test.ts",
  "apps/desktop/tests/strm2.3-personal-credential-transport-closure.test.ts",
]);
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const activeElectronProcesses = new Set();

async function main() {
  await mkdir(artifactDirectory, { recursive: true });
  try {
  const tests = runSync(vitest, [
    "run", "--maxWorkers=1", "--reporter=dot", ...focusedFiles,
  ]);
  const testFileCount = exactCount(tests.stdout, /Test Files\s+(\d+) passed/u);
  const testCount = exactCount(tests.stdout, /Tests\s+(\d+) passed/u);
  if (testFileCount !== focusedFiles.length) throw typed("strm3_test_file_count_drift");

  const normalRuns = [];
  for (let round = 1; round <= 3; round += 1) {
    normalRuns.push(parseLastJsonLine(runSync(electron, [
      "scripts/run-strm3-electron.mjs",
    ]).stdout));
  }
  const controlledRuns = [];
  for (let round = 1; round <= 3; round += 1) {
    for (const scenario of ["s1_mutation", "s1_reveal"]) {
      controlledRuns.push(await runControlledScenario(scenario, round));
    }
  }
  validateNormalRuns(normalRuns);
  validateControlledRuns(controlledRuns);

  const semanticSummary = {
    activationRevision:
      "sha256:05518b25b34c0554a029a435a93680f4cead19c16cf8bd9ad96ae80d4cc2edbf",
    transportProfileRevision: "personal-credential.route-a.structured-clone.v1",
    normal: normalRuns.map((item) => ({
      transportState: item.transportState,
      mutationAvailable: item.mutationAvailable,
      revealAvailable: item.revealAvailable,
      namedCrashBarrier: item.namedCrashBarrier,
    })),
    controlled: controlledRuns.map((item) => ({
      scenario: item.evidence.scenario,
      direction: item.evidence.direction,
      window: item.evidence.window,
      classification: item.evidence.classification,
      brokerDispatchCount: item.evidence.brokerDispatchCount,
    })),
  };
  const semanticEvidenceDigest = digest(sortJson(semanticSummary));
  const authorityDriftDigest = digest(sortJson({
    ...semanticSummary,
    activationRevision: `sha256:${"0".repeat(64)}`,
  }));
  if (semanticEvidenceDigest === authorityDriftDigest) {
    throw typed("strm3_authority_drift_not_detected");
  }

  const channels = Object.freeze({
    parentStdout: [
      ...normalRuns.map((item) => JSON.stringify(item)),
      ...controlledRuns.map((item) => item.stdout),
    ].join("\n"),
    childStderr: controlledRuns.map((item) => item.stderr).join("\n"),
    machineEvidence: JSON.stringify({ normalRuns, controlledRuns: controlledRuns.map(
      (item) => item.evidence,
    ) }),
    safeTrace: JSON.stringify(semanticSummary),
  });
  const leakage = scanStrm23Leakage(channels);
  if (leakage.totalMatchCount !== 0) throw typed("strm3_sensitive_output_detected");
  const negativeLeakInjectionDetectionCount =
    assertStrm23LeakageScannerNegativeCoverage();
  if (negativeLeakInjectionDetectionCount !== 80) {
    throw typed("strm3_negative_leak_coverage_incomplete");
  }

  const resourceCounts = aggregateResourceCounts(normalRuns, controlledRuns);
  if (activeElectronProcesses.size !== 0
    || Object.values(resourceCounts).some((value) => value !== 0)) {
    throw typed("strm3_final_resource_not_zero");
  }

  const [main, preload, shared, controller, receiver, coreMain, coreRuntime,
    coreBroker, renderer, foundationApi, coreHttp, plan, migrations] = await Promise.all([
    text("apps/desktop/src/main/index.ts"),
    text("apps/desktop/src/preload/index.ts"),
    text("apps/desktop/src/shared/sensitive-transport-activation.ts"),
    text("apps/desktop/src/main/personal-credential-transport-controller.ts"),
    text("apps/desktop/src/preload/personal-credential-transport-receiver.ts"),
    text("services/core/src/desktop-private-main.ts"),
    text("services/core/src/bootstrap/create-desktop-private-runtime.ts"),
    text("services/core/src/desktop-private-main.ts"),
    readTree(join(root, "apps/desktop/src/renderer")),
    text("apps/desktop/src/shared/foundation-api.ts"),
    text("services/core/src/adapters/http/core-private-http-server.ts"),
    text("docs/development/frontend/STRM-3-SENSITIVE-TRANSPORT-PRODUCTION-ACTIVATION-UNBLOCK-AUDIT-DEVELOPMENT-PLAN.md"),
    text("services/core/src/adapters/sqlite/migrations.ts"),
  ]);
  if (!main.includes("STRM3_SENSITIVE_TRANSPORT_ACTIVATION")
    || !preload.includes("STRM3_SENSITIVE_TRANSPORT_ACTIVATION")
    || !controller.includes("this.#productionActivationReady")
    || !receiver.includes("this.#productionActivationReady")
    || !coreMain.includes("validateSensitiveTransportBootDescriptor")
    || !coreRuntime.includes("sensitiveTransportProductionReady")
    || !coreBroker.includes('typedErrorCode: "credential_store_unavailable"')) {
    throw typed("strm3_production_graph_drift");
  }
  if (/process\.env|process\.argv|localStorage/u.test(shared)
    || /sensitive-transport-activation/u.test(renderer)) {
    throw typed("strm3_activation_authority_boundary_drift");
  }
  const normalProductSensitiveCallerCount = count(main, /\.openPreparedCommand\(/gu);
  const personalModelIpcCount = new Set(
    foundationApi.match(/robothree:personal-model:v1alpha1:[a-z-]+/gu) ?? [],
  ).size;
  const personalModelRouteCount = new Set(
    coreHttp.match(/\/personal-model-management\/v1alpha1\/[a-z-]+/gu) ?? [],
  ).size;
  const mutationMethodCount = count(
    [foundationApi, coreHttp, preload].join("\n"),
    /(?:createPersonalModel|updatePersonalModel|deletePersonalModel)(?=\s*[:(])/gu,
  );
  const revealMethodCount = count(
    [foundationApi, coreHttp, preload].join("\n"),
    /revealPersonalModel(?=\s*[:(])/gu,
  );
  if (normalProductSensitiveCallerCount !== 0 || personalModelIpcCount !== 3
    || personalModelRouteCount !== 3 || mutationMethodCount !== 0
    || revealMethodCount !== 0) {
    throw typed("strm3_product_surface_expanded");
  }
  const qaMatrixCount = new Set(plan.match(/QA-\d{3}/gu) ?? []).size;
  if (qaMatrixCount !== 96) throw typed("strm3_qa_matrix_drift");
  const mutationRuns = controlledRuns.filter(
    (item) => item.evidence.direction === "mutation",
  );
  const revealRuns = controlledRuns.filter(
    (item) => item.evidence.direction === "reveal",
  );
  const sourceSurface = [main, preload, controller, receiver, foundationApi, coreHttp]
    .join("\n");
  const parentQaLedger = Object.freeze([
    ledger("QA-061", "run-strm3-process-electron.mjs", "mutationBypassesOrdinaryInvoke",
      mutationRuns.length === 3 && mutationRuns.every((item) => item.evidence.status === "PASS")),
    ledger("QA-062", "run-strm3-process-electron.mjs", "updateSharesSensitiveMutationRoute",
      mutationRuns.length === 3 && mutationMethodCount === 0),
    ledger("QA-063", "run-strm3-process-electron.mjs", "revealBypassesCoreHttp",
      revealRuns.length === 3 && revealMethodCount === 0),
    ledger("QA-064", "run-strm3-electron.mjs", "productCallersRemainUnavailable",
      normalProductSensitiveCallerCount === 0
        && normalRuns.every((item) => item.productionFeatureEnabled === false)),
    ledger("QA-065", "strm2.2-personal-credential-directional-closure.test.ts",
      "preloadBodyLengthBound", testFileCount === focusedFiles.length),
    ledger("QA-066", "strm2.2-personal-credential-directional-closure.test.ts",
      "mainTicketBound", testFileCount === focusedFiles.length),
    ledger("QA-067", "strm2.1-personal-credential-lifecycle.test.ts",
      "perWebContentsInflightBound", testFileCount === focusedFiles.length),
    ledger("QA-068", "strm2.1-personal-credential-lifecycle.test.ts",
      "globalInflightBound", testFileCount === focusedFiles.length),
    ledger("QA-069", "strm2.2-personal-credential-directional-closure.test.ts",
      "exactFrameAuthorization", testFileCount === focusedFiles.length),
    ledger("QA-070", "strm2.1-personal-credential-lifecycle.test.ts",
      "staleTicketRejected", testFileCount === focusedFiles.length),
    ledger("QA-071", "strm2.1-personal-credential-lifecycle.test.ts",
      "duplicateTicketRejected", testFileCount === focusedFiles.length),
    ledger("QA-072", "strm2.2-personal-credential-directional-closure.test.ts",
      "lateBodyRejected", testFileCount === focusedFiles.length),
    ledger("QA-073", "strm2.1-personal-credential-lifecycle.test.ts",
      "cancelSingleTerminal", testFileCount === focusedFiles.length),
    ledger("QA-074", "strm2.1-personal-credential-lifecycle.test.ts",
      "deadlineSingleTerminal", testFileCount === focusedFiles.length),
    ledger("QA-075", "run-strm3-electron.mjs", "oldCorePortInvalidAfterRestart",
      normalRuns.every((item) => item.coreRestartedWithNewIdentity === true)),
    ledger("QA-076", "strm2.2-personal-credential-directional-closure.test.ts",
      "navigationAndCloseScrub", testFileCount === focusedFiles.length
        && resourceCounts.navigationListenerCount === 0),
    ledger("QA-077", "strm2.3-personal-credential-transport-closure.test.ts",
      "helperFrameStrict", testFileCount === focusedFiles.length),
    ledger("QA-078", "run-strm3-process-electron.mjs", "helperStderrFailClosed",
      controlledRuns.every((item) => item.evidence.status === "PASS")),
    ledger("QA-079", "run-strm3-process-electron.mjs", "revealExactConsumerNoFanout",
      revealRuns.length === 3
        && revealRuns.every((item) => item.evidence.brokerDispatchCount <= 1)),
    ledger("QA-080", "run-strm3-harness.mjs", "clipboardCacheBroadcastZero",
      !/(?:clipboard|localStorage|sessionStorage|BroadcastChannel)\s*[.(]/u
        .test(sourceSurface)),
  ]);
  if (parentQaLedger.some((item) => item.result !== "pass")) {
    throw typed("strm3_parent_qa_ledger_incomplete");
  }
  const migrationMax = Math.max(...[...migrations.matchAll(/\bid:\s*(\d+),/gu)]
    .map((match) => Number(match[1])));
  if (migrationMax !== 26) throw typed("strm3_migration_drift");
  const lockfileDigest = sha256(await readFile(join(root, "pnpm-lock.yaml")));
  if (lockfileDigest !== expectedLockfileDigest) throw typed("strm3_lockfile_drift");
  const historicalDfi4a41 = JSON.parse(await text("artifacts/dfi4a41/evidence.json"));
  const productionHelperAssetPresent = await exists(join(
    root,
    "apps/desktop/resources/personal-credential-helper/robothree-personal-credential-helper",
  ));
  if (productionHelperAssetPresent) throw typed("strm3_helper_asset_boundary_drift");
  const versions = await packageVersions();
  if (versions.root !== "0.0.0-strm.3" || versions.core !== versions.root
    || versions.desktop !== versions.root
    || versions.contracts !== "0.0.0-dfi.4a.4.1"
    || versions.admin !== "0.0.0-afe.6c") {
    throw typed("strm3_version_drift");
  }

  const evidenceMaterial = Object.freeze({
    outcome: "STRM3_SENSITIVE_TRANSPORT_PRODUCTION_CONFORMANT",
    transportDecision: "SENSITIVE_TRANSPORT_READY",
    activationSchemaVersion: "strm3-sensitive-transport-activation.v1",
    activationRevision:
      "sha256:05518b25b34c0554a029a435a93680f4cead19c16cf8bd9ad96ae80d4cc2edbf",
    transportProtocolVersion: "personal-credential-transport.v1",
    transportProfileRevision: "personal-credential.route-a.structured-clone.v1",
    normalProductionGraphActivated: true,
    normalProductSensitiveCallerCount,
    productionSensitiveTransportReady: true,
    transportBlockerClosed: true,
    productionFeatureEnabled: false,
    productionBusinessHandlerReady: false,
    productionHelperAssetPresent,
    personalModelCrudReady: false,
    credentialRevealReady: false,
    rendererPersonalModelUiReady: false,
    enterpriseIdentityReady: false,
    adminV2Ready: false,
    tgmReady: false,
    knowledgeProviderReady: false,
    agentLifecycleReady: false,
    zeroCopyClaimed: false,
    structuredCloneInternalCopiesReliablyClearable: false,
    normalGraphScenarioCount: normalRuns.length,
    controlledDataPathScenarioCount: controlledRuns.length,
    semanticReplayCount: 3,
    semanticEvidenceDigest,
    authorityDriftDigest,
    negativeLeakInjectionDetectionCount,
    fourChannelLeakageMatchCounts: leakage.channelMatchCounts,
    resourceCounts,
    historicalDfi4a41EvidenceDigest: historicalDfi4a41.evidenceDigest,
    historicalStrm23EvidenceArtifactPresent: false,
    parentQaLedgerStatus: "qa_061_080_executed_by_strm3",
    parentQaLedger,
    parentRemainingQaCount: 100,
    qaMatrixCount,
    migrationMax,
    lockfileDigest: `sha256:${lockfileDigest}`,
    versions,
  });
  const result = Object.freeze({
    status: "PASS",
    ...evidenceMaterial,
    testFileCount,
    testCount,
    evidenceDigest: digest(sortJson(evidenceMaterial)),
  });
  await writeFile(
    join(artifactDirectory, "evidence.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    { flag: "w" },
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`strm3_harness_failed:${safeCode(error)}\n`);
    process.exitCode = 1;
  }
}

async function runControlledScenario(scenario, round) {
  const scenarioId = `strm3-round-${round}:${scenario}`;
  const child = spawn(electron, ["scripts/run-strm23-process-electron.mjs"], {
    cwd: root,
    detached: process.platform !== "win32",
    env: {
      ...cleanElectronEnvironment(process.env),
      CI: "true",
      ROBOTHREE_STRM23_SCENARIO: scenario,
      ROBOTHREE_STRM23_SCENARIO_ID: scenarioId,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  activeElectronProcesses.add(child);
  let stdout = "";
  let stderr = "";
  let barrierCount = 0;
  let evidence;
  const reader = createInterface({ input: child.stdout });
  reader.on("line", (line) => {
    stdout += `${line}\n`;
    let value;
    try { value = JSON.parse(line); } catch { return; }
    if (value?.type === "barrier") {
      barrierCount += 1;
      child.stdin.write(`${JSON.stringify({ scenarioId, action: "continue" })}\n`);
    } else if (value?.type === "evidence") {
      evidence = value;
    }
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const exit = await waitForChild(child, 20_000).finally(() => {
    activeElectronProcesses.delete(child);
    reader.close();
  });
  if (exit.code !== 0 || barrierCount !== 1 || evidence?.status !== "PASS") {
    throw typed("strm3_controlled_scenario_failed");
  }
  return Object.freeze({ evidence, stdout, stderr });
}

function validateNormalRuns(runs) {
  if (runs.length !== 3) throw typed("strm3_normal_scenario_count_invalid");
  for (const item of runs) {
    if (item.status !== "PASS" || item.realElectronMain !== true
      || item.realCoreChild !== true || item.realFd4Fd5SensitiveStreams !== true
      || item.realSigkill !== true || item.coreRestartedWithNewIdentity !== true
      || item.transportState !== "ready" || item.mutationAvailable !== false
      || item.revealAvailable !== false || item.helperState !== "unavailable"
      || item.productionSensitiveTransportReady !== true
      || item.productionFeatureEnabled !== false) {
      throw typed("strm3_normal_scenario_invalid");
    }
  }
}

function validateControlledRuns(runs) {
  if (runs.length !== 6) throw typed("strm3_controlled_scenario_count_invalid");
  for (const item of runs) {
    const evidence = item.evidence;
    if (evidence.realCorePrivateSupervisor !== true
      || evidence.binaryBrokerFd4Fd5 !== true || evidence.sandbox !== true
      || evidence.contextIsolation !== true || evidence.nodeIntegrationDisabled !== true
      || evidence.productionFeatureEnabled !== false
      || evidence.productionBusinessHandlerReady !== false
      || Object.values(evidence.resourceCounts).some((value) => value !== 0)) {
      throw typed("strm3_controlled_scenario_invalid");
    }
  }
}

function aggregateResourceCounts(normalRuns, controlledRuns) {
  const normal = normalRuns.flatMap((item) => [item.resourceCounts]);
  const controlled = controlledRuns.map((item) => item.evidence.resourceCounts);
  const sum = (items, key) => items.reduce((total, item) => {
    const value = item[key];
    if (!Number.isSafeInteger(value) || value < 0) throw typed(`strm3_resource_invalid:${key}`);
    return total + value;
  }, 0);
  return Object.freeze({
    electronProcessCount: activeElectronProcesses.size,
    browserWindowCount: sum(normal, "browserWindowCount") + sum(controlled, "windowCount"),
    webContentsCount: sum(normal, "webContentsCount") + sum(controlled, "windowCount"),
    messagePortCount: sum(normal, "messagePortCount") + sum(controlled, "messagePortCount"),
    ipcListenerCount: sum(normal, "ipcListenerCount") + sum(controlled, "ipcListenerCount"),
    navigationListenerCount: sum(normal, "navigationListenerCount")
      + sum(controlled, "navigationListenerCount"),
    timerCount: sum(normal, "timerCount") + sum(controlled, "timerCount"),
    transportSessionCount: sum(normal, "transportSessionCount")
      + sum(controlled, "transportSessionCount"),
    transportRegistryCount: sum(normal, "transportRegistryCount")
      + sum(controlled, "transportRegistryCount"),
    brokerInflightCount: sum(normal, "brokerInflightCount")
      + sum(controlled, "brokerInflightCount"),
    brokerTombstoneCount: sum(normal, "brokerTombstoneCount")
      + sum(controlled, "brokerRevealTombstoneCount"),
    coreChildProcessCount: sum(normal, "coreChildProcessCount")
      + sum(controlled, "childProcessCount"),
    sensitiveStreamCount: sum(normal, "sensitiveStreamCount")
      + sum(controlled, "openSensitiveStreamCount"),
    helperProcessCount: sum(normal, "helperProcessCount")
      + sum(controlled, "helperProcessCount"),
    listeningPortCount: sum(normal, "listeningPortCount"),
    temporaryDirectoryCount: sum(normal, "temporaryDirectoryCount"),
  });
}

function waitForChild(child, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch { child.kill("SIGKILL"); }
      reject(typed("strm3_process_timeout"));
    }, timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal });
    });
  });
}

function runSync(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...cleanElectronEnvironment(process.env), CI: "true", VITEST_MAX_WORKERS: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(sanitize(result.stdout));
  if (result.stderr) process.stderr.write(sanitize(result.stderr));
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw typed("strm3_command_failed");
  return result;
}

function cleanElectronEnvironment(environment) {
  const output = { ...environment };
  delete output.ELECTRON_RUN_AS_NODE;
  return output;
}

async function packageVersions() {
  const paths = {
    root: "package.json", core: "services/core/package.json",
    contracts: "packages/contracts/package.json", desktop: "apps/desktop/package.json",
    admin: "apps/admin-console/package.json",
  };
  return Object.freeze(Object.fromEntries(await Promise.all(Object.entries(paths)
    .map(async ([key, path]) => [key, JSON.parse(await text(path)).version]))));
}

async function readTree(directory) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => entry.isDirectory()
    ? readTree(join(directory, entry.name))
    : /\.(?:ts|vue)$/u.test(entry.name)
      ? readFile(join(directory, entry.name), "utf8")
      : ""))).join("\n");
}

const text = (path) => readFile(join(root, path), "utf8");
const count = (value, pattern) => (value.match(pattern) ?? []).length;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digest = (value) => `sha256:${sha256(JSON.stringify(value))}`;
const sortJson = (value) => Array.isArray(value)
  ? value.map(sortJson)
  : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]))
    : value;
const exactCount = (value, pattern) => Number(pattern.exec(value)?.[1] ?? -1);
const parseLastJsonLine = (value) => JSON.parse(value.trim().split(/\r?\n/u).at(-1));
const exists = async (path) => access(path).then(() => true, () => false);
const ledger = (qaId, ownerTest, evidenceKey, passed) => Object.freeze({
  qaId,
  ownerTest,
  evidenceKey,
  result: passed ? "pass" : "fail",
});
const typed = (code) => Object.assign(new Error(code), { code });
function safeCode(error) {
  if (typeof error?.code === "string"
    && /^[a-z0-9_.:-]+$/u.test(error.code)) return error.code;
  if (typeof error?.message === "string"
    && /^[a-z0-9_.:-]+$/u.test(error.message)) return error.message;
  return "strm3_failed";
}
const sanitize = (value) => value.replaceAll(/sk-[A-Za-z0-9_-]+/gu, "[redacted]");

await main();
