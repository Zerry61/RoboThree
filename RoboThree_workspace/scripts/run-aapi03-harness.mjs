import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  proveAapi03LeakScanner,
  scanAapi03Leakage,
  validateAapi03Evidence,
} from "./aapi03-evidence.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..");
const temporary = await mkdtemp(join(tmpdir(), "robothree-aapi03-"));
const boundaryPath = join(temporary, "boundary.json");
const artifactDirectory = join(root, "artifacts", "aapi03");
const evidencePath = join(artifactDirectory, "evidence.json");
const failurePath = join(artifactDirectory, "failure.json");

try {
  await mkdir(artifactDirectory, { recursive: true });
  const java = spawnSync("./mvnw", [
    "-q",
    "-Dtest=com.robothree.central.admincontrol.**",
    "test",
  ], {
    cwd: join(root, "services", "central-service"),
    encoding: "utf8",
    env: {
      ...process.env,
      ROBOTHREE_AAPI03_BOUNDARY_EVIDENCE_PATH: boundaryPath,
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  const vitest = spawnSync(join(root, "node_modules", ".bin", "vitest"), [
    "run",
    "packages/contracts/tests/admin-control-v1alpha1-contracts.test.ts",
    "scripts/aapi03-evidence.test.mjs",
    "--reporter=dot",
  ], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CI: "true", VITEST_MAX_WORKERS: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = sanitize(`${java.stdout ?? ""}\n${vitest.stdout ?? ""}`);
  const stderr = sanitize(`${java.stderr ?? ""}\n${vitest.stderr ?? ""}`);
  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);
  if (java.status !== 0 || vitest.status !== 0) throw typed("aapi03_focused_tests_failed");

  const boundary = JSON.parse(await readFile(boundaryPath, "utf8"));
  const javaSummary = await javaTestSummary();
  const negativeLeakInjectionDetectionCount = proveAapi03LeakScanner();
  const base = {
    schemaVersion: "v1",
    status: "PASS",
    outcome: "AAPI03_TEST_ONLY_READ_HTTP_SHELL_CONFORMANT",
    ...boundary,
    ...javaSummary,
    negativeLeakInjectionDetectionCount,
    typescriptTestFileCount: exactCount(vitest.stdout, /Test Files\s+(\d+) passed/u),
    typescriptTestCount: exactCount(vitest.stdout, /Tests\s+(\d+) passed/u),
  };
  const leakage = scanAapi03Leakage({
    stdout,
    stderr,
    evidenceJson: JSON.stringify(base),
    failureJson: await optional(failurePath),
  });
  if (leakage.totalMatchCount !== 0) throw typed("aapi03_sensitive_output_detected");
  const evidence = validateAapi03Evidence({
    ...base,
    fourChannelLeakageMatchCounts: leakage.channelMatchCounts,
    evidenceDigest: `sha256:${createHash("sha256").update(JSON.stringify(base)).digest("hex")}`,
  });
  await writeFile(evidencePath, JSON.stringify(evidence), "utf8");
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
} catch (error) {
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(failurePath, JSON.stringify({ status: "FAIL", code: safeCode(error) }), "utf8");
  process.stderr.write(`aapi03_harness_failed:${safeCode(error)}\n`);
  process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}

async function javaTestSummary() {
  const directory = join(root, "services", "central-service", "target", "surefire-reports");
  const files = (await readdir(directory)).filter((name) =>
    name.startsWith("TEST-com.robothree.central.admincontrol.") && name.endsWith(".xml"));
  let javaTestCount = 0;
  for (const name of files) {
    const xml = await readFile(join(directory, name), "utf8");
    const match = /<testsuite[^>]*\stests="(\d+)"/u.exec(xml);
    if (match?.[1] === undefined) throw typed("aapi03_java_test_count_missing");
    javaTestCount += Number.parseInt(match[1], 10);
  }
  if (files.length === 0 || javaTestCount === 0) throw typed("aapi03_java_tests_missing");
  return { javaTestClassCount: files.length, javaTestCount };
}

function exactCount(value, pattern) {
  const match = pattern.exec(value ?? "");
  if (match?.[1] === undefined) throw typed("aapi03_test_count_missing");
  return Number.parseInt(match[1], 10);
}

async function optional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function sanitize(value) {
  return value.split(root).join("<workspace>");
}

function typed(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeCode(error) {
  return typeof error?.code === "string" ? error.code : "aapi03_unexpected_failure";
}
