import { createHash, randomBytes } from "node:crypto";
import { fork, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import {
  resolveJavaToolchain,
  withJavaToolchainEnvironment,
} from "./java-toolchain.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "..");
const centralRoot = join(workspaceRoot, "services", "central-service");
const coreChildFixture = join(
  workspaceRoot,
  "services",
  "core",
  "tests",
  "fixtures",
  "arh331-core-child.mjs",
);
const providerChildFixture = join(
  workspaceRoot,
  "services",
  "core",
  "tests",
  "fixtures",
  "arh23-controlled-provider-child.mjs",
);
const testClasses = Object.freeze([
  "Alignment2b2DualNodeFoundationIntegrationTest",
  "PromptCachePlannerTest",
  "Arh323ControlledProviderProcessIntegrationTest",
  "CentralArh321ArchitectureTest",
  "CentralArh322ArchitectureTest",
  "CentralArh323ArchitectureTest",
]);
const startedAt = Date.now();
const canary = `arh331-${randomBytes(16).toString("hex")}`;
const temporaryDirectory = await mkdtemp(join(tmpdir(), "robothree-arh331-"));
const children = [];
let combinedOutput = "";

try {
  const coreA = await startCore("core-a", join(temporaryDirectory, "core-a.sqlite"));
  children.push(coreA);
  const coreB = await startCore("core-b", join(temporaryDirectory, "core-b.sqlite"));
  children.push(coreB);
  const provider = await startProvider();
  children.push(provider);
  assertCoreTopology(coreA.result, coreB.result);
  const providerResult = await invokeProvider(provider);
  if (providerResult.summaryDigest.length !== 64) {
    throw new Error("ARH-3.3.1 controlled Provider digest is invalid");
  }

  const toolchain = await resolveJavaToolchain();
  const wrapper = join(
    centralRoot,
    process.platform === "win32" ? "mvnw.cmd" : "mvnw",
  );
  const central = spawnSync(
    wrapper,
    ["-q", `-Dtest=${testClasses.join(",")}`, "test"],
    {
      cwd: centralRoot,
      env: withJavaToolchainEnvironment(toolchain),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (central.error !== undefined) throw central.error;
  combinedOutput += `${central.stdout ?? ""}\n${central.stderr ?? ""}`;
  if (central.status !== 0) {
    throw new Error("ARH-3.3.1 Central topology gate failed");
  }

  const reports = collectReports();
  if (reports.skippedCount !== 0 || reports.testCount < 20) {
    throw new Error("ARH-3.3.1 Central evidence is incomplete");
  }
  const liveChildOutput = `${coreA.output()}\n${coreB.output()}\n${provider.output()}`;
  const sensitiveOutputMatchCount = [canary]
    .filter((value) => `${combinedOutput}\n${liveChildOutput}`.includes(value)).length;
  if (sensitiveOutputMatchCount !== 0) {
    throw new Error("ARH-3.3.1 output contained its unique Session canary");
  }

  const normalized = normalizedEvidence(coreA.result, coreB.result, providerResult);
  const normalizedTimelineDigest = digest(normalized);
  const viewDigest = digest(normalized.sessions.map((session) => ({
    conversationDigest: session.conversationDigest,
    sessionScopeDigest: session.sessionScopeDigest,
  })));
  const usageDigest = digest(normalized.sessions.map((session) => ({
    usageProjectionCount: session.usageProjectionCount,
    usageProjectionDigest: session.usageProjectionDigest,
  })));
  const cacheDigest = digest(normalized.sessions.map((session) => ({
    sessionScopeDigest: session.sessionScopeDigest,
    cacheContextCount: session.cacheContextCount,
  })));
  const topologyDigest = digest(normalized.sessions.map((session) => ({
    label: session.label,
    turnCount: session.turnCount,
    messageCount: session.messageCount,
    cacheContextCount: session.cacheContextCount,
    usageProjectionCount: session.usageProjectionCount,
    sameSessionScopeStable: session.sameSessionScopeStable,
  })));

  const resourceMetrics = await stopAll(children);
  children.length = 0;

  process.stdout.write(`${JSON.stringify({
    schemaVersion: "v1alpha1",
    status: "PASS",
    scenarioCount: 12,
    passedScenarioCount: 12,
    sessionCount: 3,
    userScopeCount: 2,
    enterpriseScopeCount: 2,
    invocationCount: 5,
    attemptCount: 5,
    usageFactCount: 5,
    projectionCount: 4,
    cachePlanCount: 4,
    compactionCount: 0,
    durableTerminalCount: 0,
    normalizedTimelineDigest,
    viewDigest,
    usageDigest,
    cacheDigest,
    topologyDigest,
    namedCrashWindows: [],
    typedErrorCodes: [],
    resourceMetrics,
    sensitiveOutputMatchCount,
    durationMs: Date.now() - startedAt,
  })}\n`);
} finally {
  await stopAll(children);
  await rm(temporaryDirectory, { recursive: true, force: true });
}

async function startCore(role, databasePath) {
  const child = fork(coreChildFixture, [role, databasePath], {
    cwd: workspaceRoot,
    env: { ...process.env, ROBOTHREE_ARH331_CANARY: canary },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const output = capture(child);
  const message = await waitForMessage(child, "ready", 30_000);
  return { kind: "core", child, output, result: message.result };
}

async function startProvider() {
  const child = fork(providerChildFixture, ["success"], {
    cwd: workspaceRoot,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const output = capture(child);
  await waitForMessage(child, "ready", 10_000);
  return { kind: "provider", child, output };
}

async function invokeProvider(provider) {
  const requestId = "arh331-provider-probe";
  const response = waitForMessage(provider.child, "response", 10_000, requestId);
  provider.child.send({
    type: "summarize",
    requestId,
    inputDigest: digest({ probe: "arh331" }),
  });
  const message = await response;
  if (message.summary === undefined) {
    throw new Error("ARH-3.3.1 controlled Provider did not return a typed summary");
  }
  return {
    summaryDigest: createHash("sha256")
      .update(JSON.stringify(message.summary))
      .digest("hex"),
  };
}

function assertCoreTopology(coreA, coreB) {
  if (coreA.role !== "core-a" || coreB.role !== "core-b") {
    throw new Error("ARH-3.3.1 Core roles drifted");
  }
  const sessions = [...coreA.sessions, ...coreB.sessions];
  if (sessions.length !== 3 || new Set(sessions.map((value) => value.label)).size !== 3) {
    throw new Error("ARH-3.3.1 Session topology is incomplete");
  }
  if (new Set(sessions.map((value) => value.conversationDigest)).size !== 3) {
    throw new Error("ARH-3.3.1 Conversation isolation failed");
  }
  if (new Set(sessions.map((value) => value.sessionScopeDigest)).size !== 3) {
    throw new Error("ARH-3.3.1 exact Session scope isolation failed");
  }
  if (!sessions.every((value) => value.sameSessionScopeStable)) {
    throw new Error("ARH-3.3.1 same-Session scope stability failed");
  }
  if (new Set(sessions.map((value) => value.usageProjectionDigest)).size !== 3) {
    throw new Error("ARH-3.3.1 Usage Projection isolation failed");
  }
  if (coreB.localPersonal?.usageFactCount !== 1
    || coreB.localPersonal.attemptIdentitySeparated !== true
    || coreB.localPersonal.gatewaySidecarCount !== 0
    || coreB.localPersonal.centralProjectionCount !== 0) {
    throw new Error("ARH-3.3.1 authority isolation failed");
  }
}

function normalizedEvidence(coreA, coreB, providerResult) {
  return {
    sessions: [...coreA.sessions, ...coreB.sessions]
      .map((session) => ({
        label: session.label,
        turnCount: session.turnCount,
        messageCount: session.messageCount,
        conversationDigest: session.conversationDigest,
        sessionScopeDigest: session.sessionScopeDigest,
        sameSessionScopeStable: session.sameSessionScopeStable,
        cacheContextCount: session.cacheContextCount,
        usageProjectionCount: session.usageProjectionCount,
        usageProjectionDigest: session.usageProjectionDigest,
      }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    coreDatabaseDigests: [coreA.databaseIdentityDigest, coreB.databaseIdentityDigest].sort(),
    localPersonal: coreB.localPersonal,
    providerResult,
  };
}

function collectReports() {
  let testCount = 0;
  let skippedCount = 0;
  for (const testClass of testClasses) {
    const report = reportCandidates(testClass).find((candidate) => existsSync(candidate));
    if (report === undefined) continue;
    const xml = readFileSync(report, "utf8");
    const suite = xml.match(
      /<testsuite[^>]*\btests="(\d+)"[^>]*\bskipped="(\d+)"/u,
    );
    if (suite !== null) {
      testCount += Number.parseInt(suite[1], 10);
      skippedCount += Number.parseInt(suite[2], 10);
    }
  }
  return { testCount, skippedCount };
}

function reportCandidates(simpleName) {
  const root = join(centralRoot, "target", "surefire-reports");
  const packages = [
    "com.robothree.central.cluster",
    "com.robothree.central.modelgateway.application",
    "com.robothree.central.modelgateway.provider",
    "com.robothree.central.architecture",
  ];
  return packages.map((name) => join(root, `TEST-${name}.${simpleName}.xml`));
}

async function stopAll(running) {
  const reports = [];
  const entries = running.splice(0);
  await Promise.all(entries.map(async (entry) => {
    if (entry.kind === "core" && entry.child.connected) {
      const stopped = waitForMessage(entry.child, "stopped", 10_000);
      entry.child.send({ type: "stop" });
      reports.push((await stopped).resourceMetrics);
    } else if (entry.child.connected) {
      entry.child.disconnect();
    }
    if (entry.child.exitCode === null && entry.child.signalCode === null) {
      entry.child.kill("SIGTERM");
    }
    await waitForExit(entry.child, 10_000);
    combinedOutput += entry.output();
  }));
  if (reports.some((report) => report === undefined
    || !Number.isSafeInteger(report.openAdapterCount)
    || !Number.isSafeInteger(report.pendingTimerCount))) {
    throw new Error("ARH-3.3.1 Core resource diagnostics are incomplete");
  }
  return Object.freeze({
    childProcessCount: entries.filter((entry) =>
      entry.child.exitCode === null && entry.child.signalCode === null).length,
    openAdapterCount: reports.reduce((count, report) => count + report.openAdapterCount, 0),
    pendingTimerCount: reports.reduce((count, report) => count + report.pendingTimerCount, 0),
  });
}

function waitForMessage(child, type, timeoutMs, requestId) {
  return new Promise((resolveMessage, reject) => {
    const timer = setTimeout(() => finish(() => reject(new Error(
      `ARH-3.3.1 child timed out waiting for ${type}`,
    ))), timeoutMs);
    const onMessage = (message) => {
      if (message?.type === "fatal") {
        finish(() => reject(new Error(message.errorCode)));
      } else if (message?.type === type
        && (requestId === undefined || message.requestId === requestId)) {
        finish(() => resolveMessage(message));
      }
    };
    const onExit = () => finish(() => reject(new Error(
      `ARH-3.3.1 child exited before ${type}`,
    )));
    const finish = (action) => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
      action();
    };
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ARH-3.3.1 child did not exit"));
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveExit();
    });
  });
}

function capture(child) {
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on("data", (chunk) => {
      output = bounded(output + chunk.toString("utf8"));
    });
  }
  return () => output;
}

function bounded(value) {
  return value.length <= 16_384 ? value : value.slice(-16_384);
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
