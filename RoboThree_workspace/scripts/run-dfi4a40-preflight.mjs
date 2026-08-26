import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = process.cwd();
const read = (relativePath) => readFile(resolve(workspace, relativePath), "utf8");

const paths = Object.freeze({
  runtime: "services/core/src/bootstrap/create-desktop-private-runtime.ts",
  coreMain: "services/core/src/desktop-private-main.ts",
  ownerPort: "services/core/src/ports/personal-model-owner-authority.ts",
  ownerResolver: "services/core/src/application/personal-model-owner-authority.ts",
  runtimeActivationPort: "services/core/src/ports/runtime-activation-persistence.ts",
  tokenProviderPort: "services/core/src/ports/enterprise-access-token-provider.ts",
  offlineProjection: "services/core/src/application/enterprise-configuration-status.ts",
  helperTrust: "services/core/src/adapters/credential/personal-credential-helper-trust.ts",
  helperSource: "services/core/native/macos/robothree-personal-credential-helper.m",
  migrations: "services/core/src/adapters/sqlite/migrations.ts",
  v1alpha1Submit: "packages/contracts/src/desktop-local/v1alpha1/submit-turn.ts",
  v1alpha2Control: "packages/contracts/src/desktop-local/v1alpha2/control.ts",
  v1alpha2Submit: "packages/contracts/src/desktop-local/v1alpha2/submit-turn.ts",
  personalProjection: "packages/contracts/src/desktop-local/v1alpha2/personal-model.ts",
  supervisor: "apps/desktop/src/main/core-private-supervisor.ts",
  desktopPackage: "apps/desktop/package.json",
  electronTypes: "apps/desktop/node_modules/electron/electron.d.ts",
});

const sources = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await read(path)]),
));
const coreSourceFiles = await listFiles(resolve(workspace, "services/core/src"));
const coreSourceText = (await Promise.all(coreSourceFiles
  .filter((path) => path.endsWith(".ts"))
  .map((path) => readFile(path, "utf8")))).join("\n");

const migrationIds = [...sources.migrations.matchAll(/\bid:\s*([0-9]+),/gu)]
  .map((match) => Number(match[1]));
const latestMigrationId = Math.max(...migrationIds);

const authority = Object.freeze({
  ownerAuthorityPortPresent:
    sources.ownerPort.includes("PersonalModelOwnerAuthorityResolver"),
  strictOwnerResolverPresent:
    sources.ownerResolver.includes("StrictPersonalModelOwnerAuthorityResolver"),
  runtimeActivationFactsPersisted:
    sources.runtimeActivationPort.includes("RuntimeActiveGeneration"),
  offlineProjectionPresent:
    sources.offlineProjection.includes("projectEnterpriseOfflineState"),
  accessTokenPortPresent:
    sources.tokenProviderPort.includes("EnterpriseAccessTokenProvider"),
  productionAccessTokenProviderImplementationPresent:
    /implements\s+EnterpriseAccessTokenProvider/u.test(coreSourceText),
  desktopCompositionConsumesRuntimeActivation:
    /SqliteRuntimeActivationPersistence|RuntimeActivationPersistence/u.test(sources.runtime),
  desktopCompositionConsumesDeviceTrust:
    /DeviceTrust|deviceTrust/u.test(sources.runtime),
  desktopCompositionConsumesPersonalEntitlement:
    /personal_model\.configure/u.test(sources.runtime),
  fixedActiveUserIdStillPresent:
    /const\s+activeUserId\s*=\s*"[0-9a-f-]+"/u.test(sources.runtime),
});

const helperPackaging = Object.freeze({
  trustVerifierPresent:
    sources.helperTrust.includes("verifyPersonalCredentialHelperDescriptor"),
  containmentAndNoSymlinkChecksPresent:
    sources.helperTrust.includes("relative(packageRoot, helperPath)")
      && sources.helperTrust.includes("isSymbolicLink()"),
  digestCheckPresent: sources.helperTrust.includes("manifestSha256"),
  codeSignatureAndTeamChecksPresent:
    sources.helperTrust.includes("designatedRequirement")
      && sources.helperTrust.includes("teamIdentifier")
      && sources.helperTrust.includes("/usr/bin/codesign"),
  helperSourcePresent: sources.helperSource.length > 0,
  productionDescriptorInBootMessage:
    /helperDescriptor|credentialHelperDescriptor/u.test(sources.coreMain)
      && /helperDescriptor|credentialHelperDescriptor/u.test(sources.supervisor),
  packagedHelperManifestPresent:
    /robothree-personal-credential-helper|extraResources|asarUnpack/u
      .test(sources.desktopPackage),
  brokerProductionHandlerReady:
    !/handler:\s*async\s*\(\)\s*=>\s*\(\{[\s\S]*?credential_store_unavailable/u
      .test(sources.coreMain),
});

const contract = Object.freeze({
  v1alpha1UnchangedByPersonalModel:
    !/PersonalModel|personal_model|credentialRef|modelPreferenceMutation/u
      .test(sources.v1alpha1Submit),
  v1alpha2FeatureNegotiationPresent:
    sources.v1alpha2Control.includes("DesktopFeatureV1Alpha2Schema"),
  v1alpha2PersonalSafeProjectionPresent:
    sources.personalProjection.includes("PersonalModelSafeSummaryV1Alpha2Schema"),
  v1alpha2RequestedModelPresent:
    sources.v1alpha2Submit.includes("requestedModelId"),
  v1alpha2PreferenceMutationAbsent:
    !sources.v1alpha2Submit.includes("modelPreferenceMutation"),
  productionPersonalFeaturesAbsent:
    !sources.v1alpha2Control.includes("personal_model_catalog"),
});

const persistence = Object.freeze({
  latestMigrationId,
  migration23Present: migrationIds.includes(23),
  migration24Present: migrationIds.includes(24),
  migration25Absent: !migrationIds.includes(25),
  ownerNamespacePresent:
    sources.migrations.includes("personal_model_owner_scope_namespaces"),
  immutableDefinitionPresent:
    sources.migrations.includes("personal_model_definitions"),
  operationJournalPresent:
    sources.migrations.includes("personal_model_operations"),
  durableReceiptPresent:
    sources.migrations.includes("personal_model_command_receipts"),
  invocationLinkPresent:
    sources.migrations.includes("dfi_4a3_local_personal_model_invocations"),
  usageFactPresent:
    sources.migrations.includes("local_personal_provider_usage_facts"),
});
const electronApi = Object.freeze({
  mainTransferListOnlyMessagePorts:
    /postMessage\(message: any, transfer\?: MessagePortMain\[\]\): void;/u
      .test(sources.electronTypes),
});

assertAllTrue("authority foundation", {
  ownerAuthorityPortPresent: authority.ownerAuthorityPortPresent,
  strictOwnerResolverPresent: authority.strictOwnerResolverPresent,
  runtimeActivationFactsPersisted: authority.runtimeActivationFactsPersisted,
  offlineProjectionPresent: authority.offlineProjectionPresent,
  accessTokenPortPresent: authority.accessTokenPortPresent,
  fixedActiveUserIdStillPresent: authority.fixedActiveUserIdStillPresent,
});
assertAllTrue("helper trust foundation", {
  trustVerifierPresent: helperPackaging.trustVerifierPresent,
  containmentAndNoSymlinkChecksPresent:
    helperPackaging.containmentAndNoSymlinkChecksPresent,
  digestCheckPresent: helperPackaging.digestCheckPresent,
  codeSignatureAndTeamChecksPresent:
    helperPackaging.codeSignatureAndTeamChecksPresent,
  helperSourcePresent: helperPackaging.helperSourcePresent,
});
assertAllTrue("contract foundation", contract);
assertAllTrue("migration sufficiency", {
  latestMigrationIs24: persistence.latestMigrationId === 24,
  migration23Present: persistence.migration23Present,
  migration24Present: persistence.migration24Present,
  migration25Absent: persistence.migration25Absent,
  ownerNamespacePresent: persistence.ownerNamespacePresent,
  immutableDefinitionPresent: persistence.immutableDefinitionPresent,
  operationJournalPresent: persistence.operationJournalPresent,
  durableReceiptPresent: persistence.durableReceiptPresent,
  invocationLinkPresent: persistence.invocationLinkPresent,
  usageFactPresent: persistence.usageFactPresent,
});
assertAllTrue("Electron MessagePort API surface", electronApi);

if (authority.productionAccessTokenProviderImplementationPresent
  || authority.desktopCompositionConsumesRuntimeActivation
  || authority.desktopCompositionConsumesDeviceTrust
  || authority.desktopCompositionConsumesPersonalEntitlement) {
  throw new Error("authority preflight facts changed; rerun design review");
}
if (helperPackaging.productionDescriptorInBootMessage
  || helperPackaging.packagedHelperManifestPresent
  || helperPackaging.brokerProductionHandlerReady) {
  throw new Error("helper packaging preflight facts changed; rerun design review");
}

const messagePort = await runElectronSpike();
const messagePortBlocked = messagePort.status === "BLOCKED"
  && messagePort.blocker === "BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER";
const evidence = Object.freeze({
  status: "PREFLIGHT_COMPLETE_WITH_BLOCKERS",
  closeDecision:
    "BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION_AND_ELECTRON_MESSAGEPORT_TRANSFER",
  blockers: Object.freeze([
    "BLOCKED_BY_ENTERPRISE_IDENTITY_COMPOSITION",
    ...(messagePortBlocked
      ? ["BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER"]
      : []),
  ]),
  authority,
  helperPackaging: Object.freeze({
    ...helperPackaging,
    status: "TRUST_PRIMITIVES_READY_PRODUCTION_PACKAGING_MISSING",
  }),
  messagePort,
  electronApi,
  contract: Object.freeze({
    ...contract,
    status: "ADDITIVE_V1ALPHA2_FEASIBLE_NOT_IMPLEMENTED",
  }),
  persistence: Object.freeze({
    ...persistence,
    status: "MIGRATION_23_24_SUFFICIENT_NO_MIGRATION_25",
  }),
  productionActivationAllowed: false,
  nextAllowedStep: "DOCUMENT_REVIEW_ONLY",
});

process.stdout.write(`${JSON.stringify(evidence)}\n`);

async function runElectronSpike() {
  const electronBinary = resolve(
    workspace,
    "apps/desktop/node_modules/.bin",
    process.platform === "win32" ? "electron.cmd" : "electron",
  );
  const child = spawn(electronBinary, [
    "scripts/run-dfi4a40-messageport-electron.mjs",
  ], {
    cwd: workspace,
    env: cleanElectronEnvironment(process.env),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => pushBounded(stdout, chunk));
  child.stderr.on("data", (chunk) => pushBounded(stderr, chunk));
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code));
  });
  if (exitCode !== 0) {
    throw new Error(`electron MessagePort Spike failed with exit ${String(exitCode)} (${safeDiagnostic(stderr)})`);
  }
  const lines = Buffer.concat(stdout).toString("utf8").trim().split(/\r?\n/u);
  const result = JSON.parse(lines.at(-1) ?? "null");
  const passed = result?.status === "PASS"
    && result.transferredBufferDetached === true
    && result.oneShotDeliveryCount === 1
    && result.mainConsumerZeroized === true
    && result.mainDerivedWebContentsIdentity === true
    && result.mainFrameBound === true;
  const blocked = result?.status === "BLOCKED"
    && result.blocker === "BLOCKED_BY_ELECTRON_MESSAGEPORT_TRANSFER"
    && result.bidirectionalControlHandshake === true
    && result.senderBufferDetached === true
    && result.transferredByteFrameReceivedByMain === false
    && result.mainDerivedWebContentsIdentity === true
    && result.mainFrameBound === true;
  if (!passed && !blocked) {
    throw new Error("electron MessagePort Spike evidence is incomplete");
  }
  return result;
}

function cleanElectronEnvironment(environment) {
  const clean = { ...environment, NODE_ENV: "test" };
  delete clean.ELECTRON_RUN_AS_NODE;
  return clean;
}

function assertAllTrue(label, values) {
  const failed = Object.entries(values)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  if (failed.length > 0) {
    throw new Error(`${label} failed: ${failed.join(",")}`);
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat();
}

function pushBounded(target, chunk) {
  const current = target.reduce((total, item) => total + item.byteLength, 0);
  if (current >= 64 * 1024) return;
  target.push(Buffer.from(chunk).subarray(0, 64 * 1024 - current));
}

function safeDiagnostic(chunks) {
  const text = Buffer.concat(chunks).toString("utf8");
  return text.replace(/[\r\n]+/gu, " ").slice(0, 160) || "none";
}
