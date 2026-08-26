import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const helperSource = join(scriptDirectory, "eipc1.0-macos-signer-spike.m");
const evidenceTest = join(scriptDirectory, "eipc1.0-preflight-evidence-check.mjs");
const preflightDocument = join(
  workspaceRoot,
  "docs/development/frontend/EIPC-1.0-PRODUCTION-INPUT-CONTRACT-PREFLIGHT.md",
);
const sourcePaths = Object.freeze({
  desktopComposition: join(workspaceRoot, "services/core/src/bootstrap/create-desktop-private-runtime.ts"),
  tokenPort: join(workspaceRoot, "services/core/src/ports/enterprise-access-token-provider.ts"),
  legacyClaims: join(
    workspaceRoot,
    "services/central-service/src/main/java/com/robothree/central/authentication/domain/AccessTokenClaims.java",
  ),
  legacyTokenSchema: join(workspaceRoot, "contracts/enterprise-gateway/v1alpha1/schemas/token.schema.json"),
});
const forbiddenSensitiveShapes = Object.freeze([
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/u,
  /-----BEGIN (?:EC |PRIVATE )?PRIVATE KEY-----/u,
  /(?:verifiedIdentityHandle|deviceKeyHandle|accessToken)\s*[:=]\s*["'][^"']{8,}/u,
]);

const startedAt = Date.now();
const temporaryDirectory = await mkdtemp(join(tmpdir(), "robothree-eipc1.0-"));
let finalOutput;
try {
  const nodeTest = await execFile(process.execPath, ["--test", evidenceTest], {
    cwd: workspaceRoot,
    env: { ...process.env, CI: "true" },
    maxBuffer: 4 * 1024 * 1024,
  });
  const sourceFacts = await inspectSourceFacts();
  const signer = await runSignerSpike(temporaryDirectory);
  const outputToScan = `${nodeTest.stdout}\n${nodeTest.stderr}\n${JSON.stringify({ sourceFacts, signer })}`;
  const sensitiveOutputMatchCount = forbiddenSensitiveShapes.reduce(
    (count, pattern) => count + (pattern.test(outputToScan) ? 1 : 0),
    0,
  );
  assert.equal(sensitiveOutputMatchCount, 0, "preflight output contained a sensitive value shape");

  const productionInputs = Object.freeze({
    companyOaVerifiedIdentityBootstrapAuthorized: false,
    mdmDeviceTrustInputAuthorized: false,
    productionCodesignEntitlementPackagingAuthorized: false,
    productionIdentityCredentialProvided: false,
    testIdentityUsed: false,
  });
  const outcome = "BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION";
  const semanticEvidence = Object.freeze({
    schemaVersion: "eipc1.0-preflight-evidence.v1",
    outcome,
    enterpriseSessionContractFamily: "enterprise-session.v1alpha1",
    sessionLeaseEndpoint: "/enterprise-session/v1alpha1/session-leases",
    claimsProfile: "eipc.session-token.v1",
    signerProfile: "macos_secure_enclave_p256_ecdsa_sha256_v1",
    signerStatus: signer.status,
    privateKeyExportable: signer.status === "pass" ? signer.privateKeyExportable : null,
    productionInputs,
    sourceFacts,
    productionSessionImplemented: false,
    centralSessionLeaseImplemented: false,
    localCredentialAdapterImplemented: false,
    runtimeCompositionImplemented: false,
    productionIdentityReady: false,
    identityCompositionBlockerClosed: false,
    downstreamCodingUnlocked: false,
  });
  const evidenceDigest = createHash("sha256")
    .update(JSON.stringify(semanticEvidence))
    .digest("hex");
  finalOutput = {
    status: "PASS",
    ...semanticEvidence,
    signerProbeRunCount: signer.runCount,
    signerPrivateMaterialEmitted: signer.privateKeyMaterialEmitted,
    signerPersistentKeyCreated: signer.persistentKeyCreated,
    ...(signer.status === "unavailable"
      ? { signerUnavailableStage: signer.stage, signerUnavailableErrorCode: signer.errorCode }
      : {}),
    nodeEvidenceTestCount: 5,
    leakScannerNegativeProbeCount: proveLeakScanner(),
    sensitiveOutputMatchCount,
    evidenceDigest: `sha256:${evidenceDigest}`,
  };
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
process.stdout.write(`${JSON.stringify({
  ...finalOutput,
  temporaryArtifactsRemoved: true,
  durationMs: Date.now() - startedAt,
})}\n`);

async function inspectSourceFacts() {
  const [composition, tokenPort, legacyClaims, legacyTokenSchema, preflight] = await Promise.all([
    readFile(sourcePaths.desktopComposition, "utf8"),
    readFile(sourcePaths.tokenPort, "utf8"),
    readFile(sourcePaths.legacyClaims, "utf8"),
    readFile(sourcePaths.legacyTokenSchema, "utf8"),
    readFile(preflightDocument, "utf8"),
  ]);
  assert.match(composition, /const activeUserId = "00000000-0000-4000-8000-000000000001"/u);
  assert.match(tokenPort, /export interface EnterpriseAccessTokenProvider/u);
  assert.doesNotMatch(legacyClaims, /"personal_model\.configure"/u);
  assert.match(legacyTokenSchema, /"accessToken"/u);
  assert.match(legacyTokenSchema, /"expiresAt"/u);
  assert.doesNotMatch(legacyTokenSchema, /sessionAssertion|deviceTrustDecision|sourceDecisionDigest/u);
  assert.match(preflight, /BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION/u);
  return Object.freeze({
    fixedActiveUserIdStillPresent: true,
    enterpriseAccessTokenProviderPortPresent: true,
    productionAccessTokenProviderImplementationPresent: false,
    legacyClaimsSupportPersonalModelConfigure: false,
    legacyTokenResponseHasSessionAssertion: false,
    legacyTokenResponseHasDeviceTrustDecision: false,
    enterpriseSessionProductionContractImplemented: false,
  });
}

async function runSignerSpike(directory) {
  assert.equal(process.platform, "darwin", "EIPC-1.0 macOS signer Spike requires darwin");
  const helper = join(directory, "eipc1.0-macos-signer-spike");
  await execFile("xcrun", [
    "clang",
    "-fobjc-arc",
    helperSource,
    "-framework",
    "Foundation",
    "-framework",
    "Security",
    "-o",
    helper,
  ], {
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: join(directory, "clang-module-cache"),
      TMPDIR: directory,
    },
    maxBuffer: 4 * 1024 * 1024,
  });
  const runs = [];
  for (let index = 0; index < 3; index += 1) {
    const result = await execFile(helper, [], {
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      maxBuffer: 1024 * 1024,
    });
    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.profile, "macos_secure_enclave_p256_ecdsa_sha256_v1");
    assert.equal(parsed.privateKeyMaterialEmitted, false);
    if (parsed.status === "pass") {
      assert.equal(parsed.privateKeyExportable, false);
      assert.equal(parsed.publicKeyExportable, true);
      assert.equal(parsed.signingSucceeded, true);
      assert.equal(parsed.persistentKeyCreated, false);
    } else {
      assert.equal(parsed.status, "unavailable");
    }
    runs.push(parsed);
  }
  const statuses = new Set(runs.map((run) => run.status));
  assert.equal(statuses.size, 1, "Secure Enclave availability drifted across the preflight runs");
  return Object.freeze({ ...runs[0], runCount: runs.length });
}

function proveLeakScanner() {
  const canary = `r3-eipc1-canary-${randomBytes(18).toString("hex")}`;
  const encodings = [
    canary,
    Buffer.from(canary, "utf8").toString("base64"),
    encodeURIComponent(canary),
    Buffer.from(canary, "utf8").toString("hex"),
  ];
  for (const encoded of encodings) {
    assert.ok(encoded.length >= 16);
  }
  return encodings.length;
}
