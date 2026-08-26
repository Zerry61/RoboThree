import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const vitest = join(
  workspaceRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);
const evidenceFiles = Object.freeze([
  "services/core/tests/adr17-i3-recovery-matrix.test.ts",
  "services/core/tests/tool-call-batch-coordinator.test.ts",
  "services/core/tests/tool-call-batch-persistence.conformance.test.ts",
  "services/core/tests/sqlite-tool-call-batch.integration.test.ts",
  "services/core/tests/agent-loop-coordinator.test.ts",
  "services/core/tests/tool-execution.integration.test.ts",
  "services/core/tests/process-echo-tool.integration.test.ts",
  "services/core/tests/effect-recovery.test.ts",
  "services/core/tests/user-confirmation.integration.test.ts",
  "services/core/tests/task-runtime.test.ts",
]);
const forbiddenCanaries = Object.freeze([
  "tool-argument-canary-adr17-i3",
  "tool-result-body-canary-adr17-i3",
  "prompt-canary-adr17-i3",
  "credential-canary-adr17-i3",
  "token-canary-adr17-i3",
  "/Users/example/private/workspace",
]);

const startedAt = Date.now();
const execution = spawnSync(vitest, ["run", ...evidenceFiles], {
  cwd: workspaceRoot,
  encoding: "utf8",
  env: {
    ...process.env,
    CI: "true",
  },
  maxBuffer: 32 * 1024 * 1024,
});

const sanitizedStdout = execution.stdout.split(workspaceRoot).join("<workspace>");
const sanitizedStderr = execution.stderr.split(workspaceRoot).join("<workspace>");
if (sanitizedStdout.length > 0) process.stdout.write(sanitizedStdout);
if (sanitizedStderr.length > 0) process.stderr.write(sanitizedStderr);

if (execution.error !== undefined) throw execution.error;
if (execution.status !== 0) process.exit(execution.status ?? 1);

const capturedOutput = `${sanitizedStdout}\n${sanitizedStderr}`;
const sensitiveContentMatchCount = forbiddenCanaries
  .filter((value) => capturedOutput.includes(value)).length;
if (sensitiveContentMatchCount !== 0) {
  throw new Error("ADR17-I3 Harness output contained a forbidden synthetic canary");
}

const evidenceDigest = createHash("sha256")
  .update(JSON.stringify({
    matrix: "ADR-017-section-11",
    scenarioIds: Array.from({ length: 18 }, (_, index) => `ADR17-I3-${String(index + 1).padStart(2, "0")}`),
    evidenceFileCount: evidenceFiles.length,
  }))
  .digest("hex");

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  matrix: "ADR-017-section-11",
  scenarioCount: 18,
  evidenceFileCount: evidenceFiles.length,
  evidenceDigest: `sha256:${evidenceDigest}`,
  sensitiveContentMatchCount,
  durationMs: Date.now() - startedAt,
})}\n`);
