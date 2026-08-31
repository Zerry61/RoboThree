import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scanStrm23Leakage } from "./strm23-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules/.bin/vitest");
const artifactDirectory = join(root, "artifacts/dfi4a42");
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const expectedVersion = "0.0.0-dfi.4a.4.2";
const focusedFiles = Object.freeze([
  "packages/contracts/tests/dfi4a4.2-personal-model-management-contracts.test.ts",
  "services/core/tests/dfi4a4.2-personal-model-command-service.test.ts",
  "services/core/tests/dfi4a4.2-personal-model-lifecycle.integration.test.ts",
  "services/core/tests/personal-model-credential-coordinator.test.ts",
  "services/core/tests/personal-model-credential-reveal-service.test.ts",
  "services/core/tests/personal-model-persistence.conformance.test.ts",
  "apps/desktop/tests/personal-model-v1alpha2-safe-api.test.ts",
  "tests/e2e/dfi4a23-owner-reveal.e2e.test.ts",
]);
const markers = Object.freeze({
  personalModelId: "model.personal.dfi4a42-canary-not-real",
  credentialReference: "credential.personal.dfi4a42-canary-not-real",
  providerEndpoint: "https://dfi4a42-sensitive.example.invalid/v1",
  operationDigest: `sha256:${"7".repeat(64)}`,
  keychainAccountOrHelperPath: "/Users/dfi4a42/private/keychain-helper-not-real",
});

await mkdir(artifactDirectory, { recursive: true });
try {
  const execution = spawnSync(vitest, [
    "run", "--maxWorkers=1", "--reporter=dot", ...focusedFiles,
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "true",
      VITEST_MAX_WORKERS: "1",
      DFI4A42_RESOURCE_EVIDENCE: "1",
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(sanitize(execution.stdout ?? ""));
  process.stderr.write(sanitize(execution.stderr ?? ""));
  if (execution.error !== undefined) throw execution.error;
  if (execution.status !== 0) throw typed("dfi4a42_focused_tests_failed");
  const testFileCount = exactCount(execution.stdout ?? "", /Test Files\s+(\d+) passed/u);
  const testCount = exactCount(execution.stdout ?? "", /Tests\s+(\d+) passed/u);
  if (testFileCount !== focusedFiles.length) throw typed("dfi4a42_test_file_count_mismatch");
  const currentResources = parseResourceEvidence(execution.stdout ?? "");

  const exactImport = spawnSync(process.execPath, [
    "--input-type=module",
    "--eval",
    "import('@robothree/contracts/desktop-local/personal-model-management/v1alpha2')"
      + ".then((value) => process.stdout.write(value.PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA2))",
  ], { cwd: join(root, "services/core"), encoding: "utf8", env: process.env });
  if (exactImport.status !== 0
    || exactImport.stdout !== "personal-model-management.v1alpha2") {
    throw typed("dfi4a42_exact_contract_subpath_unavailable");
  }

  const [shared, router, preload, preloadIndex, main, client, http, facade,
    commandService, coordinator, reveal, runtime, coreMain, renderer, plan, parentPlan,
    migrations] = await Promise.all([
    text("apps/desktop/src/shared/foundation-api.ts"),
    text("apps/desktop/src/main/personal-model-v1alpha2-ipc-router.ts"),
    text("apps/desktop/src/preload/create-desktop-api.ts"),
    text("apps/desktop/src/preload/index.ts"),
    text("apps/desktop/src/main/index.ts"),
    text("apps/desktop/src/main/core-private-client.ts"),
    text("services/core/src/adapters/http/core-private-http-server.ts"),
    text("services/core/src/application/desktop-application-facade.ts"),
    text("services/core/src/application/personal-model-management-command-service.ts"),
    text("services/core/src/application/personal-model-credential-coordinator.ts"),
    text("services/core/src/application/personal-model-credential-reveal-service.ts"),
    text("services/core/src/bootstrap/create-desktop-private-runtime.ts"),
    text("services/core/src/desktop-private-main.ts"),
    readTree(join(root, "apps/desktop/src/renderer")),
    text("docs/development/frontend/DFI-4A.4.2-PERSONAL-MODEL-CRUD-CREDENTIAL-REVEAL-DURABLE-RECOVERY-DEVELOPMENT-PLAN.md"),
    text("docs/development/frontend/DFI-4A.4-REVISION-2-LOCAL-PERSONAL-MODEL-CRUD-CREDENTIAL-PACKAGING-DEVELOPMENT-PLAN.md"),
    text("services/core/src/adapters/sqlite/migrations.ts"),
  ]);

  const exactMethods = Object.freeze([
    "getCompatibility", "listPersonalModels", "getPersonalModel",
    "createPersonalModel", "updatePersonalModel", "deletePersonalModel",
    "revealPersonalModelKey", "queryPersonalModelOperation",
  ]);
  for (const method of exactMethods) {
    if (!shared.includes(`${method}(`) || !preload.includes(`${method}:`)) {
      throw typed("dfi4a42_api_surface_drift");
    }
  }
  const ipcChannels = new Set(shared.match(/robothree:personal-model:v1alpha2:[a-z-]+/gu) ?? []);
  const routes = new Set(http.match(/\/personal-model-management\/v1alpha2\/[a-z-]+/gu) ?? []);
  if (ipcChannels.size !== 8 || routes.size !== 8
    || !preloadIndex.includes('"robothreePersonalModelV1Alpha2"')) {
    throw typed("dfi4a42_transport_surface_drift");
  }
  if (!router.includes("isCurrentConnection(lease)")
    || !router.includes("event.senderFrame !== event.sender.mainFrame")
    || !router.includes("openPreparedCommand")
    || !main.includes("removeWebContents")
    || !client.includes("queryPersonalModelOperationV1Alpha2")) {
    throw typed("dfi4a42_runtime_lease_or_route_drift");
  }
  const mutationMethodCount = exactMethods.filter((value) =>
    ["createPersonalModel", "updatePersonalModel", "deletePersonalModel"].includes(value)).length;
  const revealMethodCount = exactMethods.filter((value) => value === "revealPersonalModelKey").length;
  const genericDispatcherCount = count(
    [shared, router, preload, client, http, facade].join("\n"),
    /(?:dispatchPersonalModelAction|personalModelAction|action\s*:\s*z\.)/gu,
  );
  if (mutationMethodCount !== 3 || revealMethodCount !== 1 || genericDispatcherCount !== 0) {
    throw typed("dfi4a42_command_surface_drift");
  }
  if (!commandService.includes('credentialMutation === "replace_secret"')
    || count(commandService, /secret: new Uint8Array\(0\)/gu) !== 2
    || !commandService.includes('commandType: "delete"')
    || !coordinator.includes("PersonalModelOperationGate")
    || !reveal.includes("resourceSnapshot()")
    || !runtime.includes("createPersonalModelCredentialBrokerHandler")
    || !runtime.includes("PersonalModelManagementCommandService")
    || !coreMain.includes("created.personalCredentialBrokerHandler")) {
    throw typed("dfi4a42_production_composition_drift");
  }

  const rendererConsumerCount = count(
    renderer,
    /robothreePersonalModelV1Alpha2|personal-model-management\/v1alpha2/gu,
  );
  if (rendererConsumerCount !== 0) throw typed("dfi4a42_renderer_consumer_present");
  const qaMatrixCount = qaLineCount(plan);
  const parentQaMatrixCount = qaLineCount(parentPlan);
  if (qaMatrixCount !== 96 || parentQaMatrixCount !== 120) {
    throw typed("dfi4a42_qa_matrix_drift");
  }

  const historicalStrm3 = JSON.parse(await text("artifacts/strm3/evidence.json"));
  const historicalDfi4a41 = JSON.parse(await text("artifacts/dfi4a41/evidence.json"));
  if (historicalStrm3.evidenceDigest
      !== "sha256:f1a42004058f14ae3e1178dd2243d95a379874a62a11d4392784066bcff90722"
    || historicalDfi4a41.evidenceDigest
      !== "sha256:69bdb4003e29c1bbe0d51b1dd987041c806babfea1b3ef6c1de282623c328750"
    || historicalStrm3.parentQaLedgerStatus !== "qa_061_080_executed_by_strm3") {
    throw typed("dfi4a42_historical_evidence_drift");
  }

  const channels = Object.freeze({
    parentStdout: sanitize(execution.stdout ?? ""),
    childStderr: sanitize(execution.stderr ?? ""),
    machineEvidence: JSON.stringify({
      testFileCount, testCount, exactApiMethodCount: exactMethods.length, currentResources,
    }),
    safeTrace: JSON.stringify({
      outcome: "DFI4A42_PERSONAL_MODEL_CRUD_REVEAL_RECOVERY_CONFORMANT",
      transportSplit: "create_replace_reveal_strm_reuse_delete_safe_core_zero_secret",
    }),
  });
  const leakage = scanStrm23Leakage(channels, markers);
  if (leakage.totalMatchCount !== 0) throw typed("dfi4a42_sensitive_output_detected");
  const negativeLeakInjectionDetectionCount = proveNegativeLeakCoverage();
  if (negativeLeakInjectionDetectionCount !== 80) {
    throw typed("dfi4a42_negative_leak_coverage_incomplete");
  }

  const historicalResources = historicalStrm3.resourceCounts;
  const resourceCounts = Object.freeze({
    electronProcessCount: exactResource(historicalResources, "electronProcessCount"),
    browserWindowCount: exactResource(historicalResources, "browserWindowCount"),
    webContentsCount: exactResource(historicalResources, "webContentsCount"),
    messagePortCount: exactResource(historicalResources, "messagePortCount"),
    ipcListenerCount: exactResource(historicalResources, "ipcListenerCount"),
    navigationListenerCount: exactResource(historicalResources, "navigationListenerCount"),
    timerCount: exactResource(historicalResources, "timerCount"),
    transportSessionCount: exactResource(historicalResources, "transportSessionCount"),
    transportRegistryCount: exactResource(historicalResources, "transportRegistryCount"),
    brokerInflightCount: exactResource(historicalResources, "brokerInflightCount"),
    brokerTombstoneCount: exactResource(historicalResources, "brokerTombstoneCount"),
    coreChildProcessCount: exactResource(historicalResources, "coreChildProcessCount"),
    sensitiveStreamCount: exactResource(historicalResources, "sensitiveStreamCount"),
    helperProcessCount: exactResource(historicalResources, "helperProcessCount"),
    listeningPortCount: exactResource(historicalResources, "listeningPortCount"),
    temporaryDirectoryCount: exactResource(historicalResources, "temporaryDirectoryCount"),
    revealAttemptCount: exactResource(currentResources, "revealAttemptCount"),
    operationLeaseCount: exactResource(currentResources, "operationLeaseCount"),
  });
  if (Object.keys(resourceCounts).length !== 18
    || Object.values(resourceCounts).some((value) => value !== 0)) {
    throw typed("dfi4a42_resource_not_zero");
  }

  const parentQaLedger = createParentLedger(historicalStrm3.parentQaLedger);
  if (parentQaLedger.length !== 120
    || parentQaLedger.filter((item) => item.result === "pass").length !== 40
    || parentQaLedger.filter((item) => item.result === "retained").length !== 80) {
    throw typed("dfi4a42_parent_qa_ledger_incomplete");
  }
  const migrationMax = Math.max(...[...migrations.matchAll(/\bid:\s*(\d+),/gu)]
    .map((match) => Number(match[1])));
  if (migrationMax !== 26) throw typed("dfi4a42_migration_drift");
  const lockfileDigest = sha256(await readFile(join(root, "pnpm-lock.yaml")));
  if (lockfileDigest !== expectedLockfileDigest) throw typed("dfi4a42_lockfile_drift");
  const versions = await packageVersions();
  for (const key of ["root", "core", "contracts", "desktop"]) {
    if (versions[key] !== expectedVersion) throw typed("dfi4a42_version_drift");
  }
  if (versions.admin !== "0.0.0-afe.6c") throw typed("dfi4a42_admin_version_drift");
  const productionHelperAssetPresent = await exists(join(
    root,
    "apps/desktop/resources/personal-credential-helper/robothree-personal-credential-helper",
  ));
  if (productionHelperAssetPresent) throw typed("dfi4a42_helper_asset_boundary_drift");

  const evidenceMaterial = Object.freeze({
    outcome: "DFI4A42_PERSONAL_MODEL_CRUD_REVEAL_RECOVERY_CONFORMANT",
    contractVersion: "personal-model-management.v1alpha2",
    exactContractSubpathImportable: true,
    exactApiMethodCount: exactMethods.length,
    exactIpcChannelCount: ipcChannels.size,
    exactCorePrivateRouteCount: routes.size,
    mutationMethodCount,
    revealMethodCount,
    genericDispatcherCount,
    transportSplit: "create_replace_reveal_strm_reuse_delete_safe_core_zero_secret",
    productionSensitiveTransportReady: true,
    productionBusinessHandlerInstalled: true,
    productionBusinessHandlerReady: false,
    productionHelperAssetPresent,
    personalModelCrudReady: false,
    credentialRevealReady: false,
    rendererConsumerCount,
    rendererPersonalModelUiReady: false,
    dfi4a43Unlocked: false,
    enterpriseIdentityReady: false,
    adminV2Ready: false,
    tgmReady: false,
    knowledgeProviderReady: false,
    agentLifecycleReady: false,
    zeroCopyClaimed: false,
    structuredCloneInternalCopiesReliablyClearable: false,
    negativeLeakInjectionDetectionCount,
    fourChannelLeakageMatchCounts: leakage.channelMatchCounts,
    resourceCounts,
    resourceAccountingSources: Object.freeze({
      transportAndProcess: "historical_strm3_real_process_evidence",
      revealAndOperation: "dfi4a42_lifecycle_runtime_diagnostics",
    }),
    parentQaMatrixCount,
    focusedQaMatrixCount: qaMatrixCount,
    parentQaLedgerStatus: "qa_061_080_strm3_qa_081_100_dfi4a42_other_80_retained",
    parentQaLedger,
    historicalStrm3EvidenceDigest: historicalStrm3.evidenceDigest,
    historicalStrm3EvidenceFileSha256: sha256(await readFile(join(root, "artifacts/strm3/evidence.json"))),
    historicalDfi4a41EvidenceDigest: historicalDfi4a41.evidenceDigest,
    historicalDfi4a41EvidenceFileSha256: sha256(await readFile(join(root, "artifacts/dfi4a41/evidence.json"))),
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
  await writeFile(join(artifactDirectory, "evidence.json"), `${JSON.stringify(result, null, 2)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = Object.freeze({
    status: "FAIL",
    outcome: "DFI4A42_HARNESS_FAILED",
    errorCode: safeCode(error),
  });
  await writeFile(join(artifactDirectory, "failure.json"), `${JSON.stringify(failure)}\n`, {
    mode: 0o600,
  });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

function createParentLedger(historicalLedger) {
  const historical = new Map(historicalLedger.map((item) => [item.qaId, item]));
  const currentKeys = [
    "createPreparedBeforeKeychain", "createInitialUnverified", "saveNoConnectionTest",
    "metadataUpdateReusesCredential", "bindingChangeRequiresNewKey", "replaceExactRevision",
    "activeTaskDeleteBlocked", "usageUnknownDeleteBlocked", "corePreferenceConvergence",
    "receiptExactReplay", "commandMaterialConflict", "uncertainHonest", "manualAttentionHonest",
    "cleanupPendingHonest", "recoveryNoRendererSecretReread", "revealExactRevalidation",
    "revealRateLimitSingleConcurrency", "revealExpiredNoReplay", "revealNoDurableViewedFact",
    "enterprisePersonalCredentialIsolation",
  ];
  const currentOwners = [
    "dfi4a4.2-personal-model-lifecycle.integration.test.ts",
    "dfi4a4.2-personal-model-command-service.test.ts",
    "dfi4a4.2-personal-model-command-service.test.ts",
    "dfi4a4.2-personal-model-command-service.test.ts",
    "dfi4a4.2-personal-model-command-service.test.ts",
    "dfi4a4.2-personal-model-command-service.test.ts",
    "dfi4a4.2-personal-model-lifecycle.integration.test.ts",
    "dfi4a4.2-personal-model-lifecycle.integration.test.ts",
    "dfi4a4.2-personal-model-lifecycle.integration.test.ts",
    "dfi4a4.2-personal-model-lifecycle.integration.test.ts",
    "dfi4a4.2-personal-model-lifecycle.integration.test.ts",
    "dfi4a4.2-personal-model-lifecycle.integration.test.ts",
    "dfi4a4.2-personal-model-lifecycle.integration.test.ts",
    "dfi4a4.2-personal-model-lifecycle.integration.test.ts",
    "dfi4a4.2-personal-model-lifecycle.integration.test.ts",
    "dfi4a4.2-personal-model-lifecycle.integration.test.ts",
    "dfi4a4.2-personal-model-command-service.test.ts",
    "personal-model-v1alpha2-safe-api.test.ts",
    "dfi4a4.2-personal-model-lifecycle.integration.test.ts",
    "dfi4a4.2-personal-model-command-service.test.ts",
  ];
  return Object.freeze(Array.from({ length: 120 }, (_, index) => {
    const number = index + 1;
    const qaId = `QA-${String(number).padStart(3, "0")}`;
    if (number >= 61 && number <= 80) return Object.freeze(historical.get(qaId));
    if (number >= 81 && number <= 100) return Object.freeze({
      qaId,
      ownerTest: currentOwners[number - 81],
      evidenceKey: currentKeys[number - 81],
      result: "pass",
    });
    return Object.freeze({
      qaId,
      ownerTest: "DFI-4A.4.3 stage closure",
      evidenceKey: "retained_for_dfi4a4_stage_closure",
      result: "retained",
    });
  }));
}

function proveNegativeLeakCoverage() {
  let detections = 0;
  const channelKeys = ["parentStdout", "childStderr", "machineEvidence", "safeTrace"];
  for (const channel of channelKeys) {
    for (const marker of Object.values(markers)) {
      for (const variant of markerVariants(marker)) {
        const channels = Object.fromEntries(channelKeys.map((key) => [key, "safe"]));
        channels[channel] = `prefix-${variant}-suffix`;
        if (scanStrm23Leakage(channels, markers).channelMatchCounts[channel] <= 0) {
          throw typed("dfi4a42_negative_leak_injection_missed");
        }
        detections += 1;
      }
    }
  }
  return detections;
}

function markerVariants(marker) {
  return [...new Set([
    marker,
    Buffer.from(marker).toString("base64"),
    [...Buffer.from(marker)].map((value) => `%${value.toString(16).padStart(2, "0")}`).join(""),
    Buffer.from(marker).toString("hex"),
  ])];
}

function parseResourceEvidence(output) {
  const value = /DFI4A42_RESOURCE_EVIDENCE=(\{[^\r\n]*\})/u.exec(output)?.[1];
  if (value === undefined) throw typed("dfi4a42_resource_evidence_missing");
  return JSON.parse(value);
}

function qaLineCount(value) {
  return new Set([...value.matchAll(/^\d+\. (QA-\d{3})/gmu)].map((match) => match[1])).size;
}

function exactResource(value, key) {
  if (typeof value !== "object" || value === null || !(key in value)) {
    throw typed(`dfi4a42_resource_missing:${key}`);
  }
  const countValue = value[key];
  if (!Number.isSafeInteger(countValue) || countValue < 0) {
    throw typed(`dfi4a42_resource_invalid:${key}`);
  }
  return countValue;
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
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => entry.isDirectory()
    ? readTree(join(directory, entry.name))
    : /\.(?:ts|vue)$/u.test(entry.name)
      ? readFile(join(directory, entry.name), "utf8")
      : ""))).join("\n");
}

function text(path) { return readFile(join(root, path), "utf8"); }
function count(value, pattern) { return (value.match(pattern) ?? []).length; }
function exactCount(value, pattern) { return Number(pattern.exec(value)?.[1] ?? -1); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function digest(value) { return `sha256:${sha256(JSON.stringify(value))}`; }
function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  }
  return value;
}
async function exists(path) { return access(path).then(() => true, () => false); }
function sanitize(value) {
  return value.replaceAll(root, "<workspace>")
    .replaceAll(/sk-[A-Za-z0-9_-]+/gu, "[redacted]");
}
function typed(code) { return Object.assign(new Error(code), { code }); }
function safeCode(error) {
  if (typeof error?.code === "string" && /^[a-z0-9_.:-]+$/u.test(error.code)) {
    return error.code;
  }
  if (typeof error?.message === "string" && /^[a-z0-9_.:-]+$/u.test(error.message)) {
    return error.message;
  }
  return "dfi4a42_unexpected_failure";
}
