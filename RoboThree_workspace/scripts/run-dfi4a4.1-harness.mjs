import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitest = join(root, "node_modules", ".bin", "vitest");
const artifactDirectory = join(root, "artifacts", "dfi4a41");
const expectedLockfileDigest =
  "5b15ae0197c6f7a1450a49551fbfb50a9e0edc32f0fbe75a9259a360ed874f31";
const expectedVersion = "0.0.0-dfi.4a.4.1";
const focusedFiles = Object.freeze([
  "packages/contracts/tests/dfi4a4.1-personal-model-management-contracts.test.ts",
  "services/core/tests/dfi4a4.1-personal-model-management.test.ts",
  "apps/desktop/tests/personal-credential-helper-package.test.ts",
  "apps/desktop/tests/personal-model-v1alpha1-read-api.test.ts",
]);

await mkdir(artifactDirectory, { recursive: true });
try {
  const execution = spawnSync(vitest, [
    "run",
    "--maxWorkers=1",
    "--reporter=dot",
    ...focusedFiles,
  ], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CI: "true", VITEST_MAX_WORKERS: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(sanitize(execution.stdout ?? ""));
  process.stderr.write(sanitize(execution.stderr ?? ""));
  if (execution.error !== undefined) throw execution.error;
  if (execution.status !== 0) throw typed("dfi4a41_focused_tests_failed");

  const testFileCount = exactCount(execution.stdout ?? "", /Test Files\s+(\d+) passed/u);
  const testCount = exactCount(execution.stdout ?? "", /Tests\s+(\d+) passed/u);
  if (testFileCount !== focusedFiles.length) throw typed("dfi4a41_test_file_count_mismatch");

  const exactImport = spawnSync(process.execPath, [
    "--input-type=module",
    "--eval",
    "import('@robothree/contracts/desktop-local/personal-model-management/v1alpha1')"
      + ".then((value) => process.stdout.write(value.PERSONAL_MODEL_MANAGEMENT_CONTRACT_VERSION_V1ALPHA1))",
  ], {
    cwd: join(root, "services/core"),
    encoding: "utf8",
    env: process.env,
  });
  if (exactImport.status !== 0
    || exactImport.stdout !== "personal-model-management.v1alpha1") {
    throw typed("dfi4a41_exact_contract_subpath_unavailable");
  }

  const sharedApi = await text("apps/desktop/src/shared/foundation-api.ts");
  const router = await text("apps/desktop/src/main/personal-model-v1alpha1-ipc-router.ts");
  const preload = await text("apps/desktop/src/preload/create-desktop-api.ts");
  const preloadIndex = await text("apps/desktop/src/preload/index.ts");
  const http = await text("services/core/src/adapters/http/core-private-http-server.ts");
  const helperResolver = await text("apps/desktop/src/main/personal-credential-helper-package.ts");
  const helperBuilder = await text("apps/desktop/scripts/build-personal-credential-helper.mjs");
  const helperTrust = await text(
    "services/core/src/adapters/credential/personal-credential-helper-trust.ts",
  );
  const desktopMain = await text("apps/desktop/src/main/index.ts");

  const exactApiMethods = ["getCompatibility", "listPersonalModels", "getPersonalModel"];
  for (const method of exactApiMethods) {
    if (!sharedApi.includes(`${method}(`) || !preload.includes(`${method}:`)) {
      throw typed("dfi4a41_read_api_surface_drift");
    }
  }
  const ipcChannels = [...sharedApi.matchAll(/robothree:personal-model:v1alpha1:[a-z-]+/gu)]
    .map((match) => match[0]);
  if (new Set(ipcChannels).size !== 3) throw typed("dfi4a41_ipc_channel_count_drift");
  const routes = [...http.matchAll(/\/personal-model-management\/v1alpha1\/[a-z-]+/gu)]
    .map((match) => match[0]);
  if (new Set(routes).size !== 3) throw typed("dfi4a41_http_route_count_drift");
  if (!/exposeInMainWorld\(\s*"robothreePersonalModelV1Alpha1"/u.test(preloadIndex)) {
    throw typed("dfi4a41_preload_exposure_missing");
  }
  if (!router.includes("isCurrentConnection(lease)")
    || !router.includes("event.senderFrame !== event.sender.mainFrame")
    || !desktopMain.includes("removeWebContents")) {
    throw typed("dfi4a41_runtime_lease_boundary_drift");
  }
  const forbiddenMutations =
    /(?:createPersonalModel|updatePersonalModel|deletePersonalModel|revealPersonalModel)(?=\s*[:(])/gu;
  const readSurface = [sharedApi, router, preload, preloadIndex, http].join("\n");
  if ((readSurface.match(forbiddenMutations) ?? []).length !== 0) {
    throw typed("dfi4a41_mutation_or_reveal_surface_present");
  }
  if (/(process\.env|process\.argv)/u.test(helperResolver)
    || !helperResolver.includes('"personal-credential-helper"')
    || !helperResolver.includes('"robothree-personal-credential-helper"')
    || !helperBuilder.includes("await rename(temporaryHelperPath, helperPath)")
    || helperBuilder.indexOf('await run("/usr/bin/codesign"')
      > helperBuilder.indexOf('createHash("sha256")')
    || !helperTrust.includes("digest !== descriptor.manifestSha256")
    || !helperTrust.includes("verifyProductionSignature")) {
    throw typed("dfi4a41_helper_packaging_boundary_drift");
  }

  const rendererSource = await readTree(join(root, "apps/desktop/src/renderer"));
  const rendererConsumerCount = countMatches(
    rendererSource,
    /robothreePersonalModelV1Alpha1|personal-model-management\/v1alpha1/gu,
  );
  if (rendererConsumerCount !== 0) throw typed("dfi4a41_renderer_consumer_present");

  const plan = await text(
    "docs/development/frontend/DFI-4A.4-REVISION-2-LOCAL-PERSONAL-MODEL-CRUD-CREDENTIAL-PACKAGING-DEVELOPMENT-PLAN.md",
  );
  const parentQaMatrixCount = new Set(plan.match(/QA-\d{3}/gu) ?? []).size;
  if (parentQaMatrixCount !== 120) throw typed("dfi4a41_parent_qa_matrix_drift");

  const migrations = await text("services/core/src/adapters/sqlite/migrations.ts");
  const migrationMax = Math.max(...[...migrations.matchAll(/\bid:\s*(\d+),/gu)]
    .map((match) => Number(match[1])));
  if (migrationMax !== 26) throw typed("dfi4a41_migration_boundary_drift");
  const lockfileDigest = sha256(await readFile(join(root, "pnpm-lock.yaml")));
  if (lockfileDigest !== expectedLockfileDigest) throw typed("dfi4a41_lockfile_drift");

  const versions = await packageVersions();
  for (const key of ["root", "core", "contracts", "desktop"]) {
    if (versions[key] !== expectedVersion) throw typed("dfi4a41_version_drift");
  }
  if (versions.admin !== "0.0.0-afe.6c") throw typed("dfi4a41_admin_version_drift");

  const historicalDfi543 = JSON.parse(await text("artifacts/dfi543/evidence.json"));
  if (typeof historicalDfi543.evidenceDigest !== "string") {
    throw typed("dfi4a41_historical_evidence_invalid");
  }

  const productionHelperAssetPresent = await pathExists(join(
    root,
    "apps/desktop/resources/personal-credential-helper/robothree-personal-credential-helper",
  ));
  const evidenceMaterial = Object.freeze({
    outcome: "DFI4A41_AUTHORITY_HELPER_PACKAGING_READ_API_CONFORMANT",
    exactContractSubpathImportable: true,
    exactReadApiMethodCount: 3,
    exactIpcChannelCount: 3,
    exactCorePrivateRouteCount: 3,
    rendererConsumerCount,
    mutationMethodCount: 0,
    revealMethodCount: 0,
    authoritySchemaVersion: "v2",
    standaloneAuthorityReady: true,
    enterpriseFallbackToStandalone: false,
    helperBuilderPresent: true,
    productionHelperAssetPresent,
    coreHelperRevalidationPresent: true,
    catalogReadableWithoutVerifiedHelper: true,
    parentQaMatrixCount,
    parentQaExecutionStatus: "retained_for_dfi4a4_stage_closure",
    migrationMax,
    lockfileDigest: `sha256:${lockfileDigest}`,
    versions,
    historicalDfi543EvidenceDigest: historicalDfi543.evidenceDigest,
    sensitiveTransportReady: false,
    personalModelCrudReady: false,
    credentialRevealReady: false,
    rendererPersonalModelUiReady: false,
    enterpriseIdentityReady: false,
    adminV2Ready: false,
    tgmReady: false,
    knowledgeProviderReady: false,
    agentLifecycleReady: false,
  });
  const result = Object.freeze({
    status: "PASS",
    ...evidenceMaterial,
    testFileCount,
    testCount,
    evidenceDigest: `sha256:${createHash("sha256")
      .update(JSON.stringify(sortJson(evidenceMaterial))).digest("hex")}`,
  });
  await writeFile(join(artifactDirectory, "evidence.json"), `${JSON.stringify(result, null, 2)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = Object.freeze({
    status: "FAIL",
    outcome: "DFI4A41_HARNESS_FAILED",
    errorCode: typeof error?.code === "string" ? error.code : "dfi4a41_unexpected_failure",
  });
  await writeFile(join(artifactDirectory, "failure.json"), `${JSON.stringify(failure)}\n`, {
    mode: 0o600,
  });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

async function text(path) {
  return readFile(join(root, path), "utf8");
}

async function packageVersions() {
  const paths = Object.freeze({
    root: "package.json",
    core: "services/core/package.json",
    contracts: "packages/contracts/package.json",
    desktop: "apps/desktop/package.json",
    admin: "apps/admin-console/package.json",
  });
  return Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [
    key,
    JSON.parse(await text(path)).version,
  ])));
}

async function readTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const values = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) values.push(await readTree(path));
    else if (entry.isFile()) values.push(await readFile(path, "utf8"));
  }
  return values.join("\n");
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function exactCount(output, pattern) {
  const value = pattern.exec(output)?.[1];
  if (value === undefined) throw typed("dfi4a41_test_summary_missing");
  return Number.parseInt(value, 10);
}

function countMatches(value, pattern) {
  return (value.match(pattern) ?? []).length;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sanitize(value) {
  return value.split(root).join("<workspace>");
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortJson(child)]));
  }
  return value;
}

function typed(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
