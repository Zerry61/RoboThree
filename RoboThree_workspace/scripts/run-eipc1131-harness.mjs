import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveJavaToolchain,
  withJavaToolchainEnvironment,
} from "./java-toolchain.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const centralRoot = join(workspaceRoot, "services", "central-service");
const productionRoot = join(centralRoot, "src", "main", "java");
const runId = new Date().toISOString().replaceAll(/[:.]/gu, "-");
const evidenceDirectory = join(
  workspaceRoot,
  "qa-reports",
  "eipc1.1.3.1-runs",
  runId,
);
const resultPath = join(evidenceDirectory, "result.json");
const failurePath = join(evidenceDirectory, "failure.json");
const startedAt = Date.now();
const javaEvidence = Object.freeze([
  "EnterpriseSessionDecisionDomainTest",
  "EnterpriseSessionDecisionDigestsTest",
  "EnterpriseSessionDecisionPortsTest",
  "Eipc1131BoundaryTest",
  "EnterpriseSessionContractConformanceTest",
]);
const productionBatchFiles = Object.freeze([
  "com/robothree/central/authentication/domain/OpaqueVerifiedIdentityHandle.java",
  "com/robothree/central/authentication/domain/EnterpriseSessionTokenClaims.java",
  "com/robothree/central/authentication/domain/EnterpriseBearerPrincipal.java",
  "com/robothree/central/authentication/domain/EnterpriseBearerAuthorizationResult.java",
  "com/robothree/central/authentication/domain/EnterpriseSessionLeaseRequestDigestMaterial.java",
  "com/robothree/central/authentication/domain/EnterpriseSessionDecisionDigests.java",
  "com/robothree/central/authentication/port/VerifiedIdentityHandleResolver.java",
  "com/robothree/central/authentication/port/EnterpriseSessionTokenCodec.java",
  "com/robothree/central/authentication/port/EnterpriseBearerAuthorizer.java",
]);
const sensitivePatterns = Object.freeze([
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/u,
  /(?:verifiedIdentityHandle|deviceProof|Authorization)\s*[:=]\s*["'][^"']{8,}/u,
  /-----BEGIN (?:EC |PRIVATE )?PRIVATE KEY-----/u,
]);

mkdirSync(evidenceDirectory, { recursive: true });
let phase = "source_boundary";

try {
  const sourceFacts = inspectProductionSource();
  phase = "canonical_contract";
  assertCanonicalContractBytes();
  phase = "java_toolchain";
  const toolchain = await resolveJavaToolchain();
  const wrapper = join(
    centralRoot,
    process.platform === "win32" ? "mvnw.cmd" : "mvnw",
  );
  phase = "java_conformance";
  const java = run(wrapper, [
    "-q",
    "-f",
    join(centralRoot, "pom.xml"),
    `-Dtest=${javaEvidence.join(",")}`,
    "-Djunit.jupiter.execution.parallel.enabled=false",
    "test",
  ], withJavaToolchainEnvironment(toolchain));
  phase = "evidence";
  const leakScannerNegativeProbeCount = proveLeakScanner();
  const sensitiveOutputMatchCount = countSensitiveMatches(
    `${java.stdout}\n${java.stderr}`,
  );
  assert.equal(sensitiveOutputMatchCount, 0);
  const semanticEvidence = Object.freeze({
    blocker: "BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION",
    canonicalContractDriftCount: 0,
    decisionDomainStrict: true,
    downstreamCodingUnlocked: false,
    identityCompositionBlockerClosed: false,
    javaEvidence,
    legacyContractDriftCount: 0,
    outcome: "EIPC1131_DECISION_DOMAIN_CONFORMANT",
    productionAuthorizerImplementationCount:
      sourceFacts.productionAuthorizerImplementationCount,
    productionCodecImplementationCount:
      sourceFacts.productionCodecImplementationCount,
    productionIdentityReady: false,
    productionResolverImplementationCount:
      sourceFacts.productionResolverImplementationCount,
    productionSessionEnabled: false,
    sourceDigestDomainCount: 3,
    testAdaptersProductionReachable: false,
  });
  const result = {
    status: "PASS",
    ...semanticEvidence,
    evidenceDigest: `sha256:${sha256(JSON.stringify(semanticEvidence))}`,
    javaEvidenceClassCount: javaEvidence.length,
    javaTestCount: countJavaTests(javaEvidence),
    leakScannerNegativeProbeCount,
    sensitiveOutputMatchCount,
    durationMs: Date.now() - startedAt,
  };
  assert.equal(countSensitiveMatches(JSON.stringify(result)), 0);
  writeFileSync(resultPath, `${JSON.stringify(result)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = {
    status: "FAIL",
    outcome: "EIPC1131_HARNESS_FAILED",
    errorCode: safeErrorCode(error),
    phase,
    elapsedMs: Date.now() - startedAt,
  };
  assert.equal(countSensitiveMatches(JSON.stringify(failure)), 0);
  writeFileSync(failurePath, `${JSON.stringify(failure)}\n`, { mode: 0o600 });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

function inspectProductionSource() {
  const allSources = listJavaFiles(productionRoot)
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const batchSource = productionBatchFiles
    .map((path) => readFileSync(join(productionRoot, path), "utf8"))
    .join("\n");
  const facts = {
    productionResolverImplementationCount: count(
      allSources,
      /implements\s+VerifiedIdentityHandleResolver/gu,
    ),
    productionCodecImplementationCount: count(
      allSources,
      /implements\s+EnterpriseSessionTokenCodec/gu,
    ),
    productionAuthorizerImplementationCount: count(
      allSources,
      /implements\s+EnterpriseBearerAuthorizer/gu,
    ),
  };
  assert.deepEqual(facts, {
    productionResolverImplementationCount: 0,
    productionCodecImplementationCount: 0,
    productionAuthorizerImplementationCount: 0,
  });
  assert.doesNotMatch(
    batchSource,
    /CentralTransactionRunner|@RestController|@RequestMapping|\/enterprise-session\//u,
  );
  assert.doesNotMatch(
    readFileSync(join(
      productionRoot,
      "com/robothree/central/authentication/domain/"
        + "EnterpriseSessionLeaseRequestDigestMaterial.java",
    ), "utf8"),
    /verifiedIdentityHandle|deviceProof|signature|accessToken|tokenDigest|credentialRef/u,
  );
  return facts;
}

function assertCanonicalContractBytes() {
  const contractRoot = join(
    workspaceRoot,
    "contracts",
    "enterprise-session",
    "v1alpha1",
  );
  const digestFile = readFileSync(
    join(contractRoot, "CANONICAL-DIGESTS.sha256"),
    "utf8",
  );
  for (const line of digestFile.split(/\r?\n/gu)) {
    if (line.trim() === "") continue;
    const [expected, path] = line.split("  ", 2);
    assert.equal(
      sha256(readFileSync(join(contractRoot, path))),
      expected,
      `canonical Contract drift: ${path}`,
    );
  }
}

function countJavaTests(classes) {
  const reportDirectory = join(centralRoot, "target", "surefire-reports");
  const reportNames = readdirSync(reportDirectory);
  return classes.reduce((sum, className) => {
    const matches = reportNames.filter((name) => name.endsWith(`.${className}.txt`));
    assert.equal(matches.length, 1, `missing unique surefire report for ${className}`);
    const report = readFileSync(join(reportDirectory, matches[0]), "utf8");
    const match = report.match(
      /Tests run:\s*(\d+),\s*Failures:\s*0,\s*Errors:\s*0/gu,
    );
    assert.ok(match?.[0], `missing passing surefire summary for ${className}`);
    return sum + Number.parseInt(/\d+/u.exec(match[0])[0], 10);
  }, 0);
}

function proveLeakScanner() {
  const canary = `r3-eipc1131-${randomBytes(18).toString("hex")}`;
  const probes = [
    `Bearer ${canary}`,
    `verifiedIdentityHandle="${canary}"`,
    "-----BEGIN PRIVATE KEY-----",
  ];
  for (const value of probes) {
    assert.ok(countSensitiveMatches(value) > 0);
  }
  return probes.length;
}

function countSensitiveMatches(value) {
  return sensitivePatterns.reduce(
    (sum, pattern) => sum + (pattern.test(value) ? 1 : 0),
    0,
  );
}

function listJavaFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listJavaFiles(path));
    else if (entry.isFile() && path.endsWith(".java")) files.push(path);
  }
  return files.sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: { ...env, CI: "true", VITEST_MAX_WORKERS: "1" },
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  const stdout = sanitize(result.stdout ?? "");
  const stderr = sanitize(result.stderr ?? "");
  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error("eipc1131.child_failed");
  return { stdout, stderr };
}

function count(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeErrorCode(error) {
  return error instanceof Error && /^eipc1131\.[a-z0-9_.]+$/u.test(error.message)
    ? error.message
    : "eipc1131.unexpected_failure";
}

function sanitize(value) {
  return value.split(workspaceRoot).join("<workspace>");
}
