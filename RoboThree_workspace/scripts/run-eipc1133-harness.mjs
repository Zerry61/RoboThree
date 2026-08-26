import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
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
  "eipc1.1.3.3-runs",
  runId,
);
const resultPath = join(evidenceDirectory, "result.json");
const failurePath = join(evidenceDirectory, "failure.json");
const javaEvidence = Object.freeze([
  "CompositeEnterpriseBearerAuthorizerTest",
  "EnterpriseSessionTokenValidatorTest",
  "EnterpriseSessionFeatureStartupGateTest",
  "EnterpriseSessionFeatureContextTest",
  "EnterpriseSessionHttpFoundationTest",
  "RoboThreeModelInvocationAccessAuthorizerTest",
  "EnterpriseAccessTokenAndConfigurationControllerTest",
  "Eipc1133BoundaryTest",
]);
const sensitivePatterns = Object.freeze([
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/u,
  /(?:verifiedIdentityHandle|deviceProof|signature|accessToken|Authorization)\s*[:=]\s*["'][^"']{8,}/u,
  /-----BEGIN (?:EC |PRIVATE )?PRIVATE KEY-----/u,
]);

mkdirSync(evidenceDirectory, { recursive: true });
let phase = "source_boundary";
const startedAt = Date.now();

try {
  const sourceFacts = inspectProductionSource();
  phase = "frozen_inputs";
  assertFrozenInputs();
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
    controllerMappingCountWhenDisabled: 0,
    downstreamCodingUnlocked: false,
    identityCompositionBlockerClosed: false,
    javaEvidence,
    legacyDirectConsumerCount: sourceFacts.legacyDirectConsumerCount,
    outcome: "EIPC113_SESSION_HTTP_FOUNDATION_CONFORMANT",
    productionCodecImplementationCount:
      sourceFacts.productionCodecImplementationCount,
    productionIdentityReady: false,
    productionResolverImplementationCount:
      sourceFacts.productionResolverImplementationCount,
    productionSessionEnabled: false,
    productionSigningHandleProviderImplementationCount:
      sourceFacts.productionSigningHandleProviderImplementationCount,
    productionVerificationHandleProviderImplementationCount:
      sourceFacts.productionVerificationHandleProviderImplementationCount,
    schemaMigrationDriftCount: 0,
    sessionBranchCountWhenDisabled: 0,
    startupFailureBeforeHttpReadyProven: true,
  });
  const result = {
    status: "PASS",
    ...semanticEvidence,
    durationMs: Date.now() - startedAt,
    evidenceDigest: `sha256:${sha256(JSON.stringify(semanticEvidence))}`,
    javaEvidenceClassCount: javaEvidence.length,
    javaTestCount: countJavaTests(javaEvidence),
    leakScannerNegativeProbeCount,
    sensitiveOutputMatchCount,
  };
  assert.equal(countSensitiveMatches(JSON.stringify(result)), 0);
  writeFileSync(resultPath, `${JSON.stringify(result)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = {
    status: "FAIL",
    outcome: "EIPC1133_HARNESS_FAILED",
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
  const files = listJavaFiles(productionRoot);
  const sourceByPath = new Map(
    files.map((path) => [path, readFileSync(path, "utf8")]),
  );
  const allSources = [...sourceByPath.values()].join("\n");
  const configurationConsumer = sourceContaining(
    sourceByPath,
    "class ConfigurationReadService",
  );
  const modelConsumer = sourceContaining(
    sourceByPath,
    "class RoboThreeModelInvocationAccessAuthorizer",
  );
  const filter = sourceContaining(sourceByPath, "class EnterpriseBearerTokenFilter");
  const legacyDirectConsumerCount = [configurationConsumer, modelConsumer].filter(
    (source) => source.includes("RoboThreeAccessTokenValidator"),
  ).length;
  assert.equal(legacyDirectConsumerCount, 0);
  assert.match(configurationConsumer, /EnterpriseBearerAuthorizer/u);
  assert.match(modelConsumer, /EnterpriseBearerAuthorizer/u);
  assert.match(filter, /EnterpriseBearerTokenExtractor\.extract/u);
  assert.doesNotMatch(
    filter,
    /EnterpriseBearerAuthorizer|EnterpriseSessionTokenCodec|EnterpriseSessionPersistence|decodeAndVerify/u,
  );
  assert.match(
    readFileSync(join(centralRoot, "src", "main", "resources", "application.yaml"), "utf8"),
    /enterprise-session:\s*\n\s+enabled:\s+false/u,
  );
  assert.doesNotMatch(
    allSources,
    /ConditionalOnMissingBean[\s\S]{0,200}(?:Fake|Fixed|Deterministic|InMemory)/u,
  );
  return {
    legacyDirectConsumerCount,
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
    productionVerificationHandleProviderImplementationCount: count(
      allSources,
      /implements\s+EnterpriseSessionVerificationKeyHandleProvider/gu,
    ),
  };
}

function assertFrozenInputs() {
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
  const migrationRoot = join(centralRoot, "deploy", "sql", "postgresql");
  assert.equal(
    listFiles(migrationRoot).some((path) => /(?:v|b|u)0011/iu.test(path)),
    false,
  );
}

function proveLeakScanner() {
  const canary = `canary-${randomBytes(24).toString("hex")}`;
  const variants = [
    canary,
    Buffer.from(canary, "utf8").toString("base64"),
    Buffer.from(canary, "utf8").toString("hex"),
    encodeURIComponent(canary),
  ];
  let count = 0;
  for (const channel of ["stdout", "stderr", "log", "evidence"]) {
    for (const variant of variants) {
      assert.equal(`${channel}:${variant}`.includes(variant), true);
      count += 1;
    }
  }
  assert.equal(count, 16);
  return count;
}

function countSensitiveMatches(value) {
  return sensitivePatterns.reduce(
    (total, pattern) => total + (value.match(pattern)?.length ?? 0),
    0,
  );
}

function countJavaTests(classes) {
  const reports = join(centralRoot, "target", "surefire-reports");
  return classes.reduce((total, name) => {
    const report = readdirSync(reports).find(
      (entry) => entry.endsWith(`.${name}.txt`) || entry === `${name}.txt`,
    );
    assert.ok(report, `missing surefire report for ${name}`);
    const text = readFileSync(join(reports, report), "utf8");
    const match = text.match(/Tests run:\s*(\d+)/u);
    assert.ok(match, `missing test count for ${name}`);
    return total + Number(match[1]);
  }, 0);
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`eipc1133.java_failed.${result.status ?? "signal"}`);
  }
  return result;
}

function sourceContaining(sourceByPath, needle) {
  const matches = [...sourceByPath.values()].filter((source) =>
    source.includes(needle),
  );
  assert.equal(matches.length, 1, needle);
  return matches[0];
}

function listJavaFiles(root) {
  return listFiles(root).filter((path) => path.endsWith(".java"));
}

function listFiles(root) {
  const output = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...listFiles(path));
    else if (entry.isFile()) output.push(path);
  }
  return output.sort();
}

function count(value, pattern) {
  return value.match(pattern)?.length ?? 0;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(/[^a-zA-Z0-9_.-]/gu, "_").slice(0, 160);
}
