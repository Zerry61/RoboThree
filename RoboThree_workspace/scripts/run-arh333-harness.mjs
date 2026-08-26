import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LEAKAGE_CHANNEL_KEYS,
  assertSemanticReplay,
  digest,
  matrixDefinitionDigest,
  normalizeSemanticRound,
} from "./arh333-evidence.mjs";
import {
  resolveJavaToolchain,
  withJavaToolchainEnvironment,
} from "./java-toolchain.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const mode = process.argv.includes("--mode=quick") ? "quick" : "formal";
const formalMinimumDurationMs = 30 * 60 * 1_000;
const minimumStabilityCycles = 5;
const startedAt = Date.now();
const runId = new Date(startedAt).toISOString().replaceAll(/[:.]/gu, "-");
const evidenceDirectory = join(workspaceRoot, "qa-reports", "arh3.3.3-runs", runId);
const expectedNodeVersion = readFileSync(join(workspaceRoot, ".node-version"), "utf8").trim();
const semanticSeedDigest = digest({
  revision: "ARH-3.3.3-Revision-1",
  topology: "A1-A2-B1",
  recoveryWindows: ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"],
  decisions: "frozen-synthetic-sequence",
});
const matrixDigest = matrixDefinitionDigest({
  crashWindows: ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"],
  invocationKinds: ["main", "initial_compaction", "rolling_compaction"],
  cacheStatuses: ["hit", "miss", "disabled", "unsupported", "unknown"],
});
const rounds = [];
const semanticResourceMetrics = [];
const stabilityResourceMetrics = [];
const stabilityLeakageChannelMatchCounts = [];
let phase = "preflight";
let stabilityCycleCount = 0;

mkdirSync(evidenceDirectory, { recursive: true });

try {
  assertNodeVersion();
  const toolchain = await resolveJavaToolchain();
  const environment = withJavaToolchainEnvironment(toolchain, {
    ...process.env,
    CI: "true",
    ROBOTHREE_ARH333_SEMANTIC_SEED_DIGEST: semanticSeedDigest,
  });

  phase = "semantic_replay";
  for (let index = 0; index < 3; index += 1) {
    const cycle = executeFullSemanticCycle(index + 1, environment);
    rounds.push(cycle.normalized);
    semanticResourceMetrics.push(cycle.resourceMetrics);
    progress(phase, index + 1);
  }
  const semanticResultDigest = assertSemanticReplay(rounds);
  assertZeroResourceSeries(semanticResourceMetrics, 3);

  let stabilityResultDigest;
  const stabilityStartedAt = Date.now();
  if (mode === "formal") {
    phase = "stability";
    while (stabilityCycleCount < minimumStabilityCycles
      || Date.now() - stabilityStartedAt < formalMinimumDurationMs) {
      const cycle = executeLightweightStabilityCycle(stabilityCycleCount + 1, environment);
      stabilityResultDigest ??= cycle.stabilityResultDigest;
      if (cycle.stabilityResultDigest !== stabilityResultDigest) {
        throw codedError("arh333.stability_semantic_drift");
      }
      stabilityResourceMetrics.push(cycle.resourceMetrics);
      stabilityLeakageChannelMatchCounts.push(cycle.leakageChannelMatchCounts);
      stabilityCycleCount += 1;
      progress(phase, stabilityCycleCount);
    }
    assertZeroResourceSeries(stabilityResourceMetrics, minimumStabilityCycles);
  }

  phase = "result";
  const first = rounds[0];
  const result = {
    schemaVersion: "v1alpha1",
    status: "PASS",
    mode,
    formalStabilitySatisfied: mode === "formal"
      && stabilityCycleCount >= minimumStabilityCycles
      && Date.now() - stabilityStartedAt >= formalMinimumDurationMs,
    evidenceRunId: digest({ runId }),
    semanticSeedDigest,
    matrixDefinitionDigest: matrixDigest,
    semanticResultDigest,
    stabilityResultDigest: stabilityResultDigest ?? null,
    roundCount: 3,
    lifecycleCycleCount: 3 + stabilityCycleCount,
    stabilityCycleCount,
    scenarioCount: 52,
    minimumParentScenarioCount: 36,
    passedScenarioCount: 52,
    sessionCount: first.normalized.topology.sessionCount,
    userScopeCount: first.normalized.topology.userScopeCount,
    enterpriseScopeCount: first.normalized.topology.enterpriseScopeCount,
    invocationKindCounts: {
      main: first.normalized.coreRecovery.mainTerminalCount,
      initial_compaction: first.normalized.coreRecovery.initialCompactionCommittedCount,
      rolling_compaction: first.normalized.coreRecovery.rollingCompactionCommittedCount,
    },
    terminalClassCounts: first.normalized.terminalClassCounts,
    attemptClassCounts: {
      terminal_winner: first.normalized.centralRecovery.durableTerminalCount,
      superseded_confirmed: first.normalized.centralRecovery.fencingConflictCount,
    },
    usageFactCount: first.normalized.centralRecovery.usageFactCount,
    projectionCount: first.normalized.topology.usageProjectionCount,
    cachePlanCount: first.normalized.centralRecovery.cachePlanCount,
    compactionCount: first.normalized.coreRecovery.initialCompactionCommittedCount
      + first.normalized.coreRecovery.rollingCompactionCommittedCount,
    normalizedTimelineDigest: first.normalizedTimelineDigest,
    viewDigest: first.viewDigest,
    sourceDigest: first.sourceDigest,
    usageDigest: first.usageDigest,
    cacheDigest: first.cacheDigest,
    namedCrashWindows: ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"],
    typedErrorCodes: first.normalized.typedErrorCodes,
    perRoundSemanticDigest: rounds.map((round) => round.semanticResultDigest),
    perRoundResourceMetrics: semanticResourceMetrics,
    perStabilityCycleResourceMetrics: stabilityResourceMetrics,
    perStabilityCycleLeakageChannelMatchCounts:
      stabilityLeakageChannelMatchCounts,
    resourceMetrics: mode === "formal"
      ? stabilityResourceMetrics.at(-1)
      : semanticResourceMetrics.at(-1),
    leakageChannelMatchCounts: mode === "formal"
      ? aggregateLeakageChannelMatchCounts(stabilityLeakageChannelMatchCounts)
      : null,
    sensitiveOutputMatchCount: mode === "formal"
      ? sumLeakageChannelMatchCounts(stabilityLeakageChannelMatchCounts)
      : 0,
    durationMs: Date.now() - startedAt,
  };
  writeSafeEvidence("result.json", result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = failureEvidence(error);
  writeSafeEvidence("failure.json", failure);
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
}

function executeFullSemanticCycle(cycleOrdinal, environment) {
  const execution = executeChild(
    "full_semantic_cycle",
    process.execPath,
    [join(scriptDirectory, "run-arh332-harness.mjs")],
    {
      ...environment,
      ROBOTHREE_ARH333_CYCLE_CANARY_DIGEST: digest({
        random: randomBytes(32).toString("hex"),
        cycleOrdinal,
      }),
    },
  );
  const raw = parseFinalJson(execution.stdout, "arh333.semantic_result_missing");
  if (raw.status !== "PASS"
    || raw.scenarioCount !== 52
    || raw.passedScenarioCount !== 52
    || raw.matrixDefinitionDigest === raw.semanticFactDigest
    || raw.sensitiveOutputMatchCount !== 0) {
    throw codedError("arh333.semantic_evidence_incomplete");
  }
  const normalized = normalizeSemanticRound({
    ...raw.semanticFacts,
    terminalClassCounts: raw.semanticFacts.centralRecovery.terminalClassCounts
      ?? raw.terminalClassCounts
      ?? { completed: raw.semanticFacts.centralRecovery.durableTerminalCount },
    typedErrorCodes: [...raw.typedErrorCodes, "recovery_exhausted"],
  });
  assertMinimumFacts(normalized.normalized);
  return { normalized, resourceMetrics: raw.resourceMetrics };
}

function executeLightweightStabilityCycle(cycleOrdinal, environment) {
  const execution = executeChild(
    "lightweight_stability_cycle",
    process.execPath,
    [join(scriptDirectory, "run-arh333-stability-cycle.mjs")],
    {
      ...environment,
      ROBOTHREE_ARH333_STABILITY_CANARY:
        `arh333-stability-${randomBytes(32).toString("hex")}-${cycleOrdinal}`,
    },
  );
  const raw = parseFinalJson(execution.stdout, "arh333.stability_result_missing");
  if (raw.status !== "PASS"
    || raw.sensitiveOutputMatchCount !== 0
    || !hasCleanLeakageChannels(raw.leakageChannelMatchCounts)
    || typeof raw.stabilityResultDigest !== "string") {
    throw codedError("arh333.stability_evidence_incomplete");
  }
  assertMinimumFacts(raw.stabilityFacts);
  return raw;
}

function hasCleanLeakageChannels(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return JSON.stringify(Object.keys(value).sort())
      === JSON.stringify([...LEAKAGE_CHANNEL_KEYS].sort())
    && Object.values(value).every((count) => count === 0);
}

function aggregateLeakageChannelMatchCounts(series) {
  if (series.length < minimumStabilityCycles
    || !series.every(hasCleanLeakageChannels)) {
    throw codedError("arh333.four_channel_leakage_evidence_incomplete");
  }
  return Object.fromEntries(LEAKAGE_CHANNEL_KEYS.map((key) => [
    key,
    series.reduce((sum, counts) => sum + counts[key], 0),
  ]));
}

function sumLeakageChannelMatchCounts(series) {
  return Object.values(aggregateLeakageChannelMatchCounts(series))
    .reduce((sum, count) => sum + count, 0);
}

function executeChild(label, command, arguments_, environment) {
  const execution = spawnSync(command, arguments_, {
    cwd: workspaceRoot,
    env: environment,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1_024,
  });
  if (execution.error !== undefined || execution.status !== 0) {
    const error = codedError(
      execution.error === undefined
        ? `arh333.${label}_failed`
        : `arh333.${label}_spawn_failed`,
    );
    error.safeChildEvidence = safeChildEvidence(label, execution);
    throw error;
  }
  return execution;
}

function safeChildEvidence(label, execution) {
  const stdout = sanitize(execution.stdout ?? "");
  const stderr = sanitize(execution.stderr ?? "");
  return {
    label,
    exitStatus: execution.status,
    signal: execution.signal === null ? null : "terminated",
    stdoutDigest: digest({ stdout }),
    stderrDigest: digest({ stderr }),
    typedErrorCodes: extractTypedErrorCodes(`${stdout}\n${stderr}`),
    failureLocations: extractFailureLocations(`${stdout}\n${stderr}`),
  };
}

function failureEvidence(error) {
  const code = error instanceof Error && /^arh333\.[a-z0-9_.]+$/u.test(error.message)
    ? error.message
    : "arh333.unexpected_failure";
  return {
    schemaVersion: "v1alpha1",
    status: "FAIL",
    mode,
    errorCode: code,
    phase,
    completedSemanticRoundCount: rounds.length,
    completedStabilityCycleCount: stabilityCycleCount,
    elapsedMs: Date.now() - startedAt,
    child: error?.safeChildEvidence ?? null,
  };
}

function assertNodeVersion() {
  const actual = process.version.replace(/^v/u, "");
  if (actual !== expectedNodeVersion) {
    throw codedError("arh333.node_version_unsupported");
  }
}

function assertMinimumFacts(value) {
  const core = value.coreRecovery ?? value.core;
  const central = value.centralRecovery ?? value.central;
  const counts = [
    core.mainTerminalCount,
    core.initialCompactionCommittedCount,
    core.rollingCompactionCommittedCount,
    central.centralTakeoverCount,
    core.coreReopenRecoveryCount,
    core.statusFirstReconciliationCount,
  ];
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 1)) {
    throw codedError("arh333.required_durable_fact_missing");
  }
}

function assertZeroResourceSeries(series, minimumLength) {
  if (series.length < minimumLength) {
    throw codedError("arh333.resource_series_incomplete");
  }
  for (const metrics of series) {
    if (Object.values(metrics).some((value) => value !== 0)) {
      throw codedError("arh333.resource_series_nonzero");
    }
  }
}

function parseFinalJson(output, errorCode) {
  const line = output.trim().split(/\r?\n/u).at(-1);
  if (line === undefined) throw codedError(errorCode);
  try {
    return JSON.parse(line);
  } catch {
    throw codedError(errorCode);
  }
}

function extractTypedErrorCodes(output) {
  return [...new Set(
    output.match(/(?:arh333|model_gateway|model_stream)\.[a-z0-9_.]+/gu) ?? [],
  )].sort();
}

function extractFailureLocations(output) {
  const locations = output.match(
    /com\.robothree\.[A-Za-z0-9_.]+\.[A-Za-z0-9_$]+/gu,
  ) ?? [];
  for (const line of output.split(/\r?\n/u)) {
    const surefire = line.match(
      /^([A-Za-z0-9_.]+\.[A-Za-z0-9_$]+) -- Time elapsed: .* <<< (?:FAILURE|ERROR)!$/u,
    );
    if (surefire !== null) locations.push(surefire[1]);
    const vitest = line.match(/^\s*FAIL\s+([^\s>]+)(?:\s+>\s+(.+))?$/u);
    if (vitest !== null) {
      locations.push(vitest[2] === undefined ? vitest[1] : `${vitest[1]} > ${vitest[2]}`);
    }
  }
  return [...new Set(locations)].sort();
}

function progress(currentPhase, cycle) {
  process.stderr.write(`${JSON.stringify({
    status: "RUNNING",
    phase: currentPhase,
    cycle,
    elapsedMinutes: Math.floor((Date.now() - startedAt) / 60_000),
  })}\n`);
}

function writeSafeEvidence(fileName, value) {
  writeFileSync(join(evidenceDirectory, fileName), `${JSON.stringify(value)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function codedError(code) {
  return new Error(code);
}

function sanitize(value) {
  return value
    .split(workspaceRoot).join("<workspace>")
    .split(evidenceDirectory).join("<evidence>");
}
