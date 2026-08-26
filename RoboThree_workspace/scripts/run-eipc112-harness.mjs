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
const runId = new Date().toISOString().replaceAll(/[:.]/gu, "-");
const evidenceDirectory = join(
  workspaceRoot,
  "qa-reports",
  "eipc1.1.2-runs",
  runId,
);
const resultPath = join(evidenceDirectory, "result.json");
const failurePath = join(evidenceDirectory, "failure.json");
const startedAt = Date.now();
let phase = "preflight";
const vitest = join(
  workspaceRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);
const nodeEvidence = Object.freeze([
  "packages/contracts/tests/eipc1.1.1-enterprise-session-contracts.test.ts",
  "packages/contracts/tests/eipc0-enterprise-identity-contracts.test.ts",
]);
const javaEvidence = Object.freeze([
  "EnterpriseSessionContractConformanceTest",
  "EnterpriseSessionPersistenceValidatorTest",
  "InMemoryCentralPersistenceTest",
  "EmbeddedPostgreSqlAlignment2aSchemaIntegrationTest",
  "EmbeddedPostgreSqlMyBatisPersistenceIntegrationTest",
  "PostgreSqlMyBatisPersistenceIntegrationTest",
  "CentralAlignment2aArchitectureTest",
]);
const legacySchemaDigests = Object.freeze({
  "services/central-service/deploy/sql/postgresql/legacy-flyway/V1__verified_identity_and_permissions.sql": "3a23b472e3cc67d834ef628d14bc45a63311831fa11f97cf4ae781e7835dee46",
  "services/central-service/deploy/sql/postgresql/legacy-flyway/V2__device_registration_enrollment_and_challenge.sql": "021bfeb40cfed2c98f56b84273a4cecf0bc6c20e80a79a82a9d5cd5fa211db21",
  "services/central-service/deploy/sql/postgresql/legacy-flyway/V3__token_issuance.sql": "a0e16eda59c95049b5f899026ca8bd698610635762db56737622773b494a126f",
  "services/central-service/deploy/sql/postgresql/legacy-flyway/V4__immutable_configuration.sql": "6dc43be8a4610abc57c45bb5d354c8dab09bbfd59a8fd93297d918fed53c6f28",
  "services/central-service/deploy/sql/postgresql/legacy-flyway/V5__challenge_consumption_idempotency.sql": "f250a660c2c604f4d53749da238f50978131bf62188ad062d8eb09c4d54cd5e6",
  "services/central-service/deploy/sql/postgresql/baseline/B0006__central_foundation.sql": "2d2d99172746aa7f2f5431a9c4273c1893694df0fa31eb8dddea8d48de2fd480",
  "services/central-service/deploy/sql/postgresql/baseline/B0007__model_invocation_foundation.sql": "c7a5f29568587c3cfc48fab6766374b762f5a629c77f711ea20b7cbbc79d9140",
  "services/central-service/deploy/sql/postgresql/baseline/B0008__provider_usage_facts.sql": "46880b8f5392ae3978f19206af9205b51f82df1bb2e85339d9a8d73c77a1221c",
  "services/central-service/deploy/sql/postgresql/baseline/B0009__prompt_cache_planning.sql": "8f21541e794a33c5c0123b61fde3f354a685cc59b157184a4cce426839608dac",
  "services/central-service/deploy/sql/postgresql/upgrade/U0006__bridge_from_flyway_v5.sql": "ff2e819ad5f80229035554b54ec802a7d2a3ef70fc7c665f138efc6bc0b37909",
  "services/central-service/deploy/sql/postgresql/upgrade/U0007__model_invocation_from_v0006.sql": "6feb82c722ad8dc34ff0d94f8fe6b09de7fc55e7e773dc8f1f90a09b584c944a",
  "services/central-service/deploy/sql/postgresql/upgrade/U0008__provider_usage_facts_from_v0007.sql": "246419d6960487cb507276ad8173905163320200331f27803ac004e65f74f2fc",
  "services/central-service/deploy/sql/postgresql/upgrade/U0009__prompt_cache_planning_from_v0008.sql": "9c158e5621b618dec85655e778383e0869245c7815bf999cc1c161400daa29f6",
  "services/central-service/deploy/sql/postgresql/manifest/postgresql-v0006.json": "4e6647ef6a33a5507a23d241c9d0d1556c37284d8049935139a4ad76012e1bd5",
  "services/central-service/deploy/sql/postgresql/manifest/postgresql-v0007.json": "883c28426232dd359eeea7d59374d2bc459ca58a1e23015e2be6f3ca37e92132",
  "services/central-service/deploy/sql/postgresql/manifest/postgresql-v0008.json": "bfbd11bb21095d6a5c92d5c5ec49726bbe3f3e596ee188dfa8b5e648696ba0ac",
  "services/central-service/deploy/sql/postgresql/manifest/postgresql-v0009.json": "0d06d90119695d67da6ee81658e826390461d48eb591d00cba829b6f49af7362",
  "services/central-service/deploy/sql/postgresql/manifest/postgresql-v0006.json.sha256": "e84ce86e4eeb2757ad7bd05ee0c48d70ca870eb0a66d917e88ff379e6dff5af4",
  "services/central-service/deploy/sql/postgresql/manifest/postgresql-v0007.json.sha256": "e6a257047363933daf21fca46a96cec4b5fd1b396688c9e81da71e0adb11fa48",
  "services/central-service/deploy/sql/postgresql/manifest/postgresql-v0008.json.sha256": "ec1fb6f9e27e97498f2c21cedfe4df61e70ad9935b8a332a2ccc52595a46ce91",
  "services/central-service/deploy/sql/postgresql/manifest/postgresql-v0009.json.sha256": "d688893d23939d3ec6cf8ce20588bf7b6ce44c555cff79d5f676e8ac26499c6c",
});
const sensitivePatterns = Object.freeze([
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/u,
  /(?:verifiedIdentityHandle|deviceProof|Authorization)\s*[:=]\s*["'][^"']{8,}/u,
  /-----BEGIN (?:EC |PRIVATE )?PRIVATE KEY-----/u,
]);

mkdirSync(evidenceDirectory, { recursive: true });

try {
  assertDockerAvailable();
  assertLegacySchemaBytes();
  phase = "node_conformance";
  const node = run(vitest, ["run", ...nodeEvidence], process.env);
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
  const capturedOutput = `${node.stdout}\n${node.stderr}\n${java.stdout}\n${java.stderr}`;
  const negativeProbeCount = proveLeakScanner();
  const sensitiveOutputMatchCount = countSensitiveMatches(capturedOutput);
  assert.equal(
    sensitiveOutputMatchCount,
    0,
    "EIPC-1.1.2 output contained sensitive material",
  );
  const javaTestCount = countJavaTests(javaEvidence);
  const nodeTestCount = parseNodeTestCount(node.stdout);
  const semanticEvidence = Object.freeze({
    blocker: "BLOCKED_PENDING_ENTERPRISE_INTEGRATION_AUTHORIZATION",
    downstreamCodingUnlocked: false,
    identityCompositionBlockerClosed: false,
    javaEvidence,
    legacyContractDriftCount: 0,
    legacySchemaDriftCount: 0,
    nodeEvidence,
    outcome: "EIPC112_POSTGRESQL_PERSISTENCE_CONFORMANT",
    productionIdentityReady: false,
    productionSessionEnabled: false,
    supportedEntryPathCount: 2,
    targetSchemaVersion: 10,
  });
  const result = {
    status: "PASS",
    ...semanticEvidence,
    evidenceDigest: `sha256:${sha256(JSON.stringify(semanticEvidence))}`,
    javaEvidenceClassCount: javaEvidence.length,
    javaTestCount,
    leakScannerNegativeProbeCount: negativeProbeCount,
    nodeEvidenceFileCount: nodeEvidence.length,
    nodeTestCount,
    sensitiveOutputMatchCount,
    durationMs: Date.now() - startedAt,
  };
  assert.equal(countSensitiveMatches(JSON.stringify(result)), 0);
  writeFileSync(resultPath, `${JSON.stringify(result)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = {
    status: "FAIL",
    outcome: "EIPC112_HARNESS_FAILED",
    errorCode: safeErrorCode(error),
    phase,
    elapsedMs: Date.now() - startedAt,
  };
  assert.equal(countSensitiveMatches(JSON.stringify(failure)), 0);
  writeFileSync(failurePath, `${JSON.stringify(failure)}\n`, { mode: 0o600 });
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

function assertDockerAvailable() {
  const result = spawnSync(
    "docker",
    ["info", "--format", "{{.ServerVersion}}"],
    { cwd: workspaceRoot, encoding: "utf8" },
  );
  if (result.status !== 0 || result.stdout.trim().length === 0) {
    throw new Error("eipc112.docker_unavailable");
  }
}

function assertLegacySchemaBytes() {
  for (const [path, expected] of Object.entries(legacySchemaDigests)) {
    assert.equal(sha256(readFileSync(join(workspaceRoot, path))), expected, path);
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
      /Tests run:\s*(\d+),\s*Failures:\s*0,\s*Errors:\s*0/u,
    );
    assert.ok(match, `missing passing surefire summary for ${className}`);
    return sum + Number.parseInt(match[1], 10);
  }, 0);
}

function parseNodeTestCount(stdout) {
  const matches = [...stdout.matchAll(/Tests\s+(\d+)\s+passed/gu)];
  assert.ok(matches.length > 0, "missing Vitest test count");
  return Number.parseInt(matches.at(-1)[1], 10);
}

function proveLeakScanner() {
  const canary = `r3-eipc112-${randomBytes(18).toString("hex")}`;
  const probes = [
    `Bearer ${canary}`,
    `verifiedIdentityHandle="${canary}"`,
    "-----BEGIN PRIVATE KEY-----",
  ];
  for (const value of probes) {
    assert.ok(
      countSensitiveMatches(value) > 0,
      "sensitive scanner failed its negative probe",
    );
  }
  return probes.length;
}

function countSensitiveMatches(value) {
  return sensitivePatterns.reduce(
    (count, pattern) => count + (pattern.test(value) ? 1 : 0),
    0,
  );
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
  if (result.status !== 0) throw new Error("eipc112.child_failed");
  return { stdout, stderr };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeErrorCode(error) {
  return error instanceof Error && /^eipc112\.[a-z0-9_.]+$/u.test(error.message)
    ? error.message
    : "eipc112.unexpected_failure";
}

function sanitize(value) {
  return value.split(workspaceRoot).join("<workspace>");
}
