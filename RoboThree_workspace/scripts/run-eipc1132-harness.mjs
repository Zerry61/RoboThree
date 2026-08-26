import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
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
  "eipc1.1.3.2-runs",
  runId,
);
const resultPath = join(evidenceDirectory, "result.json");
const failurePath = join(evidenceDirectory, "failure.json");
const startedAt = Date.now();
const javaEvidence = Object.freeze([
  "EnterpriseSessionTransactionalApplicationTest",
  "EnterpriseSessionDecisionDigestsTest",
  "InMemoryCentralPersistenceTest",
  "PostgreSqlMyBatisPersistenceIntegrationTest",
]);
const sensitivePatterns = Object.freeze([
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/u,
  /(?:verifiedIdentityHandle|deviceProof|signature|Authorization)\s*[:=]\s*["'][^"']{8,}/u,
  /-----BEGIN (?:EC |PRIVATE )?PRIVATE KEY-----/u,
]);

mkdirSync(evidenceDirectory, { recursive: true });
let phase = "source_boundary";

try {
  assertDockerAvailable();
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
  const java = run(
    wrapper,
    [
      "-q",
      "-f",
      join(centralRoot, "pom.xml"),
      `-Dtest=${javaEvidence.join(",")}`,
      "-Djunit.jupiter.execution.parallel.enabled=false",
      "test",
    ],
    withJavaToolchainEnvironment(toolchain),
  );
  phase = "evidence";
  const leakScannerNegativeProbeCount = proveLeakScanner();
  const sensitiveOutputMatchCount = countSensitiveMatches(
    `${java.stdout}\n${java.stderr}`,
  );
  assert.equal(sensitiveOutputMatchCount, 0);
  const semanticEvidence = Object.freeze({
    blocker: "BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION",
    canonicalContractDriftCount: 0,
    downstreamCodingUnlocked: false,
    encodeInsideTransactionSourceProof: true,
    exactPermissionLockConformant: true,
    identityCompositionBlockerClosed: false,
    javaEvidence,
    outcome: "EIPC1132_TRANSACTIONAL_SESSION_LEASE_CONFORMANT",
    productionCodecImplementationCount:
      sourceFacts.productionCodecImplementationCount,
    productionIdentityReady: false,
    productionResolverImplementationCount:
      sourceFacts.productionResolverImplementationCount,
    productionSessionEnabled: false,
    productionSigningHandleProviderImplementationCount:
      sourceFacts.productionSigningHandleProviderImplementationCount,
    schemaMigrationDriftCount: 0,
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
    outcome: "EIPC1132_HARNESS_FAILED",
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
  const leaseSource = readFileSync(
    join(
      productionRoot,
      "com/robothree/central/authentication/application/IssueEnterpriseSessionLeaseService.java",
    ),
    "utf8",
  );
  const challengeSource = readFileSync(
    join(
      productionRoot,
      "com/robothree/central/authentication/application/IssueEnterpriseSessionChallengeService.java",
    ),
    "utf8",
  );
  const permissionXml = readFileSync(
    join(centralRoot, "src", "main", "resources", "mybatis", "AuthenticationMapper.xml"),
    "utf8",
  );
  const facts = {
    productionResolverImplementationCount: count(
      allSources,
      /implements\s+VerifiedIdentityHandleResolver/gu,
    ),
    productionCodecImplementationCount: count(
      allSources,
      /implements\s+EnterpriseSessionTokenCodec/gu,
    ),
    productionSigningHandleProviderImplementationCount: count(
      allSources,
      /implements\s+EnterpriseSessionSigningKeyHandleProvider/gu,
    ),
  };
  assert.deepEqual(facts, {
    productionResolverImplementationCount: 0,
    productionCodecImplementationCount: 0,
    productionSigningHandleProviderImplementationCount: 0,
  });
  assert.match(leaseSource, /transactions\.required\(\(\)\s*->\s*issueWithinTransaction/gu);
  assert.match(leaseSource, /tokenCodec\.encode\(/gu);
  assert.doesNotMatch(
    `${leaseSource}\n${challengeSource}`,
    /@RestController|@RequestMapping|ipcMain|contextBridge|Renderer/u,
  );
  assert.match(
    permissionXml,
    /permission\s*=\s*ANY\([\s\S]*PostgresTextArrayTypeHandler[\s\S]*ORDER BY permission[\s\S]*FOR UPDATE/gu,
  );
  assert.doesNotMatch(permissionXml, /<foreach|\$\{/u);
  assert.doesNotMatch(
    leaseSource,
    /proof.*(?:Digest|Hash)|signature.*(?:Digest|Hash)|bearerJournal/iu,
  );
  const migrationFiles = listFiles(join(
    centralRoot,
    "deploy",
    "sql",
    "postgresql",
  ));
  assert.equal(migrationFiles.some((path) => /0011/u.test(path)), false);
  return facts;
}

function assertDockerAvailable() {
  const result = spawnSync(
    "docker",
    ["info", "--format", "{{.ServerVersion}}"],
    { cwd: workspaceRoot, encoding: "utf8" },
  );
  if (result.status !== 0 || result.stdout.trim() === "") {
    throw new Error("eipc1132.docker_unavailable");
  }
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
    assert.equal(sha256(readFileSync(join(contractRoot, path))), expected, path);
  }
}

function countJavaTests(classes) {
  const reportDirectory = join(centralRoot, "target", "surefire-reports");
  const reportNames = readdirSync(reportDirectory);
  return classes.reduce((sum, className) => {
    const matches = reportNames.filter((name) => name.endsWith(`.${className}.txt`));
    assert.equal(matches.length, 1, `missing unique report for ${className}`);
    const report = readFileSync(join(reportDirectory, matches[0]), "utf8");
    const match = report.match(
      /Tests run:\s*(\d+),\s*Failures:\s*0,\s*Errors:\s*0/u,
    );
    assert.ok(match, `missing passing summary for ${className}`);
    return sum + Number.parseInt(match[1], 10);
  }, 0);
}

function proveLeakScanner() {
  const canary = `r3-eipc1132-${randomBytes(18).toString("hex")}`;
  const probes = [
    `Bearer ${canary}`,
    `verifiedIdentityHandle="${canary}"`,
    `signature="${canary}"`,
    "-----BEGIN PRIVATE KEY-----",
  ];
  for (const value of probes) assert.ok(countSensitiveMatches(value) > 0);
  return probes.length;
}

function countSensitiveMatches(value) {
  return sensitivePatterns.reduce(
    (sum, pattern) => sum + (pattern.test(value) ? 1 : 0),
    0,
  );
}

function listJavaFiles(root) {
  return listFiles(root).filter((path) => path.endsWith(".java"));
}

function listFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
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
  if (result.status !== 0) throw new Error("eipc1132.child_failed");
  return { stdout, stderr };
}

function count(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeErrorCode(error) {
  return error instanceof Error && /^eipc1132\.[a-z0-9_.]+$/u.test(error.message)
    ? error.message
    : "eipc1132.unexpected_failure";
}

function sanitize(value) {
  return value.split(workspaceRoot).join("<workspace>");
}
