import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CPC3_CONFLICT_CORPUS,
  CPC3_RESOURCE_KEYS,
  cpc3SemanticDigest,
  cpc3SemanticSummary,
  proveCpc3LeakScannerNegativeCoverage,
  scanCpc3Leakage,
  validateCpc3ClosureEvidence,
} from "./cpc3-evidence.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const executableSuffix = process.platform === "win32" ? ".cmd" : "";
const vitest = join(workspaceRoot, "node_modules", ".bin", `vitest${executableSuffix}`);
const artifactDirectory = join(workspaceRoot, "artifacts", "cpc3");
const evidencePath = join(artifactDirectory, "evidence.json");
const failurePath = join(artifactDirectory, "failure.json");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "robothree-cpc3-harness-"));
const lifecycleEvidencePath = join(temporaryDirectory, "lifecycle.json");
const processEvidencePath = join(temporaryDirectory, "process.json");
const startedAt = Date.now();

try {
  await mkdir(artifactDirectory, { recursive: true });
  const execution = spawnSync(vitest, [
    "run",
    "services/core/tests/cpc3-lifecycle-eval.test.ts",
    "services/core/tests/cpc3-process-lifecycle.test.ts",
    "services/core/tests/cpc3-boundary.test.ts",
    "scripts/cpc3-evidence.test.mjs",
    "services/core/tests/cpc2-runtime-integration.test.ts",
    "services/core/tests/cpc2-boundary.test.ts",
    "services/core/tests/cpc1-instruction-foundation.test.ts",
    "services/core/tests/cpc1-instruction-boundary.test.ts",
    "services/core/tests/arh2.3-durable-loop-harness.test.ts",
    "--reporter=dot",
  ], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "true",
      VITEST_MAX_WORKERS: "1",
      ROBOTHREE_CPC3_LIFECYCLE_EVIDENCE_PATH: lifecycleEvidencePath,
      ROBOTHREE_CPC3_PROCESS_EVIDENCE_PATH: processEvidencePath,
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = sanitize(execution.stdout ?? "");
  const stderr = sanitize(execution.stderr ?? "");
  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);
  if (execution.error !== undefined) throw execution.error;
  if (execution.status !== 0) throw typed("cpc3_focused_tests_failed");

  const lifecycle = JSON.parse(await readFile(lifecycleEvidencePath, "utf8"));
  const processEvidence = JSON.parse(await readFile(processEvidencePath, "utf8"));
  validateFocusedEvidence(lifecycle, processEvidence);
  const childResources = exactChildTerminalResources(processEvidence.scenarios);
  const resourceCounts = Object.freeze({
    activeCoreChildren: processEvidence.activeCoreChildren,
    ...childResources,
  });
  const semanticSummary = cpc3SemanticSummary({
    scenarioOutcomes: [
      ...Array.from({ length: lifecycle.lifecycleScenarioCount }, (_, index) => ({
        scenario: `L${String(index + 1)}`,
        outcome: "conformant",
      })),
      ...Array.from({ length: lifecycle.failureScenarioCount }, (_, index) => ({
        scenario: `F${String(index + 1)}`,
        outcome: "typed_fail_closed",
      })),
      ...processEvidence.scenarios.map((scenario) => ({
        scenario: `C:${scenario.window}`,
        outcome: "sigkill_reopen_conformant",
      })),
    ],
    taskInstructionBindingDigest: lifecycle.taskInstructionBindingDigest,
    instructionBundleDigest: lifecycle.instructionBundleDigest,
    orderedSourceIdentities: lifecycle.orderedSourceIdentities,
    mainRequestDigestSequence: lifecycle.mainRequestDigestSequence,
    compactionEvidence: [{ initial: true, rolling: true, summaryAuthority: "data" }],
    toolEffectOutcomes: [{ rounds: lifecycle.toolRoundCount, structuredOutcomeWins: true }],
    typedFailureCodes: [
      "context.instruction_runtime_unavailable",
      "context.instruction_binding_invalid",
      "context.platform_prompt_unavailable",
      "context.agent_material_invalid",
      "context.skill_material_unavailable",
      "context.skill_material_invalid",
      "context.locked_instructions_too_large",
    ],
    terminalState: "completed",
    resourceTerminalCounts: resourceCounts,
  });
  const evidenceWithoutLeakage = Object.freeze({
    schemaVersion: "v1",
    status: "PASS",
    outcome: "CPC_CORE_PROMPT_MVP_CONFORMANT",
    lifecycleScenarioCount: lifecycle.lifecycleScenarioCount,
    failureScenarioCount: lifecycle.failureScenarioCount,
    crashWindowCount: processEvidence.crashWindowCount,
    toolRoundCount: lifecycle.toolRoundCount,
    mainRequestCount: lifecycle.mainRequestCount,
    semanticReplayCount: processEvidence.semanticReplayCount,
    semanticReplayDigest: processEvidence.semanticReplayDigest,
    semanticEvidenceDigest: cpc3SemanticDigest(semanticSummary),
    conflictCorpusRevision: "cpc3.normative-corpus.v1",
    conflictCorpusCaseCount: CPC3_CONFLICT_CORPUS.length,
    observationalModelEvalOutcome:
      "MODEL_BEHAVIOR_EVAL_NOT_RUN_APPROVED_PROFILE_MISSING",
    testIdentityUsed: true,
    productionCpcActivationEnabled: false,
    productionSkillResolverPresent: false,
    knowledgeProviderReady: false,
    memoryReady: false,
    effectReconciliationReady: false,
    desktopAdminEntryReady: false,
    dfi53Unlocked: false,
    resourceCounts,
    durationMs: Date.now() - startedAt,
  });
  const evidenceJson = JSON.stringify(evidenceWithoutLeakage);
  const failureJson = await optionalFile(failurePath);
  const leakage = scanCpc3Leakage({
    stdout,
    stderr,
    evidenceJson,
    failureJson,
  });
  if (leakage.totalMatchCount !== 0) throw typed("cpc3_sensitive_output_detected");
  const negativeLeakInjectionDetectionCount = proveCpc3LeakScannerNegativeCoverage();
  const evidence = validateCpc3ClosureEvidence(Object.freeze({
    ...evidenceWithoutLeakage,
    fourChannelLeakageMatchCounts: leakage.channelMatchCounts,
    negativeLeakInjectionDetectionCount,
  }));
  await writeFile(evidencePath, JSON.stringify(evidence), "utf8");
  await unlink(failurePath).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
} catch (error) {
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(failurePath, JSON.stringify({
    status: "FAIL",
    code: safeCode(error),
  }), "utf8");
  process.stderr.write(`cpc3_harness_failed:${safeCode(error)}\n`);
  process.exitCode = 1;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

function validateFocusedEvidence(lifecycle, processEvidence) {
  if (lifecycle?.status !== "PASS"
    || lifecycle.lifecycleScenarioCount !== 7
    || lifecycle.failureScenarioCount !== 8
    || lifecycle.conflictCorpusCaseCount !== 12
    || lifecycle.toolRoundCount !== 50
    || lifecycle.mainRequestCount !== 51
    || processEvidence?.status !== "PASS"
    || !Number.isSafeInteger(processEvidence.activeCoreChildren)
    || processEvidence.activeCoreChildren !== 0
    || processEvidence.crashWindowCount !== 6
    || processEvidence.semanticReplayCount !== 3
    || new Set(processEvidence.scenarios.map((scenario) => scenario.window)).size !== 6) {
    throw typed("cpc3_focused_evidence_invalid");
  }
}

function exactChildTerminalResources(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw typed("cpc3_process_scenarios_missing");
  }
  const output = {};
  for (const key of CPC3_RESOURCE_KEYS.filter((candidate) => candidate !== "activeCoreChildren")) {
    const values = scenarios.map((scenario) => scenario?.resourceCounts?.[key]);
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw typed(`cpc3_process_resource_invalid:${key}`);
    }
    output[key] = Math.max(...values);
  }
  return Object.freeze(output);
}

async function optionalFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function sanitize(value) {
  return value.split(workspaceRoot).join("<workspace>");
}

function typed(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeCode(error) {
  return typeof error?.code === "string" ? error.code : "cpc3_unexpected_failure";
}
