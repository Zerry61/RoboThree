import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, describe, expect, it } from "vitest";

const childScript = fileURLToPath(new URL(
  "./fixtures/r2d4-lifecycle-child.mjs",
  import.meta.url,
));
const windows = [
  "accepted_after_commit",
  "message_appended_after_commit",
  "task_bundle_after_commit",
  "task_committed_after_commit",
  "completed_after_commit",
] as const;
const fixedTimeSeed = "2026-08-26T10:00:00.000Z";
const driftedTimeSeed = "2026-08-26T10:00:00.001Z";
const processes = new Set<ChildProcess>();
const directories = new Set<string>();
const scenarioEvidence: Array<Record<string, unknown>> = [];
const semanticReplayDigests: string[] = [];
const semanticReplayProcessIds: number[] = [];
let timeDriftChangesSemanticDigest = false;

afterEach(async () => {
  for (const child of processes) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  processes.clear();
  for (const directory of directories) {
    await rm(directory, { recursive: true, force: true });
  }
  directories.clear();
});

afterAll(async () => {
  const output = process.env.ROBOTHREE_R2D4_PROCESS_EVIDENCE_PATH;
  if (output === undefined) return;
  const activeCoreChildren = countActiveCoreChildren();
  expect(activeCoreChildren).toBe(0);
  await writeFile(output, JSON.stringify({
    schemaVersion: "v1",
    status: "PASS",
    activeCoreChildren,
    crashWindowCount: scenarioEvidence.length,
    scenarios: scenarioEvidence,
    semanticReplayCount: semanticReplayDigests.length,
    semanticReplayDigest: semanticReplayDigests[0],
    semanticReplayProcessIds,
    semanticReplayTimeFacts: authorityTimeFacts(fixedTimeSeed),
    timeDriftChangesSemanticDigest,
  }), "utf8");
});

describe("R2D-4 real Core child lifecycle", () => {
  for (const windowName of windows) {
    it(`SIGKILLs and reopens the exact R2D plan at ${windowName}`, async () => {
      const databasePath = await database(`r2d4-${windowName}-`);
      const crashed = spawnChild("prepare", databasePath, windowName, fixedTimeSeed);
      const barrier = await waitForBarrierFile(databasePath, windowName, 25_000);
      expect(barrier.authorityCounts).toMatchObject({
        subject: 1,
        registry: 1,
        workspaceAuthorization: 1,
        preference: 1,
        capabilityLocks: 1,
        entitlement: 1,
        toolPolicy: 1,
      });
      expect(barrier.upstreamCounts).toEqual(zeroUpstreamCounts());
      const crashedPid = crashed.pid;
      const exit = waitForExit(crashed);
      expect(crashed.kill("SIGKILL")).toBe(true);
      expect(await exit).toMatchObject({ signal: "SIGKILL" });
      expect(observeExitedProcess(crashedPid)).toBe(true);

      const recovered = await runChild("recover", databasePath, windowName, fixedTimeSeed);
      expect(recovered.processId).not.toBe(crashedPid);
      expect(recovered).toMatchObject({
        outcome: "recovered",
        coordinationStatus: "completed",
        authorityCounts: zeroAuthorityCounts(),
        messageCount: 1,
        deliveryCount: 1,
        testIdentityUsed: true,
        productionR2dGateEnabled: false,
        productionCpcActivationEnabled: false,
        productionEnterpriseEntitlementReady: false,
      });
      expect(recovered.desktopDefaultModelProjection).toBe("model.r2d4-controlled");
      expect(recovered.timeFacts).toEqual(authorityTimeFacts(fixedTimeSeed));
      expect(isRecord(recovered.resourceCounts)).toBe(true);
      if (!isRecord(recovered.resourceCounts)) throw new Error("R2D-4 resources unavailable");
      expect(Object.keys(recovered.resourceCounts).sort()).toEqual([
        "activeAgentResolutionLeases",
        "activeCapabilityLocks",
        "activeCompactionJobs",
        "activeContextMaterializers",
        "activeEntitlementSnapshotLeases",
        "activeProviderRequests",
        "activeTimeoutSchedulers",
        "lateCallbacks",
        "openSqliteHandles",
        "pendingCoordination",
        "preparedInvocationLinks",
      ]);
      expect(Object.values(recovered.resourceCounts).every((value) => value === 0)).toBe(true);
      expect(recovered.loopStartedCount).toBe(1);
      expect(recovered.replayLoopStartDelta).toBe(0);
      scenarioEvidence.push({
        window: windowName,
        crashedPid,
        recoveredPid: recovered.processId,
        processExitObserved: true,
        authorityCounts: recovered.authorityCounts,
        upstreamCountsBeforeTaskCommit: barrier.upstreamCounts,
        loopStartedCount: recovered.loopStartedCount,
        replayLoopStartDelta: recovered.replayLoopStartDelta,
        resourceCounts: recovered.resourceCounts,
        acceptedPlanDigest: recovered.acceptedPlanDigest,
        entitlementSnapshotDigest: recovered.entitlementSnapshotDigest,
        agentResourceDecisionDigest: recovered.agentResourceDecisionDigest,
        runtimeSelectionDigest: recovered.runtimeSelectionDigest,
        reasoningModeLockId: recovered.reasoningModeLockId,
        reasoningModeLockDigest: recovered.reasoningModeLockDigest,
        taskInstructionBindingDigest: recovered.taskInstructionBindingDigest,
        timeFacts: recovered.timeFacts,
      });
    }, 40_000);
  }

  it("uses one controlled time seed for three fresh semantic replays", async () => {
    const summaries: Array<Record<string, unknown>> = [];
    for (let round = 0; round < 3; round += 1) {
      summaries.push(await runChild(
        "run",
        await database("r2d4-semantic-"),
        "semantic_replay",
        fixedTimeSeed,
      ));
    }
    const digests = summaries.map(semanticDigest);
    expect(new Set(digests).size).toBe(1);
    expect(new Set(summaries.map((summary) => summary.processId)).size).toBe(3);
    for (const summary of summaries) {
      expect(summary.timeFacts).toEqual(authorityTimeFacts(fixedTimeSeed));
      expect(summary.authorityCounts).toMatchObject({ entitlement: 1, toolPolicy: 1 });
    }
    semanticReplayDigests.push(...digests);
    semanticReplayProcessIds.push(...summaries.map((summary) => Number(summary.processId)));
  }, 40_000);

  it("changes the real accepted plan and semantic digest when the authority clock drifts", async () => {
    const baseline = await runChild(
      "run",
      await database("r2d4-time-base-"),
      "time_base",
      fixedTimeSeed,
    );
    const drifted = await runChild(
      "run",
      await database("r2d4-time-drift-"),
      "time_drift",
      driftedTimeSeed,
    );
    expect(drifted.acceptedPlanDigest).not.toBe(baseline.acceptedPlanDigest);
    expect(drifted.timeFacts).toEqual(authorityTimeFacts(driftedTimeSeed));
    expect(semanticDigest(drifted)).not.toBe(semanticDigest(baseline));
    timeDriftChangesSemanticDigest = true;
  }, 40_000);
});

async function database(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  directories.add(directory);
  return join(directory, "core.sqlite");
}

function spawnChild(
  command: string,
  databasePath: string,
  windowName: string,
  timeSeed: string,
): ChildProcess {
  const child = fork(childScript, [command, databasePath, windowName, timeSeed], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { PATH: process.env.PATH },
  });
  processes.add(child);
  return child;
}

async function runChild(
  command: string,
  databasePath: string,
  windowName: string,
  timeSeed: string,
): Promise<Record<string, unknown>> {
  const child = spawnChild(command, databasePath, windowName, timeSeed);
  const message = await waitForMessage(
    child,
    (candidate) => isRecord(candidate)
      && candidate.type === "result"
      && isRecord(candidate.result),
    25_000,
  ) as { result: Record<string, unknown> };
  expect(await waitForExit(child)).toEqual({ code: 0, signal: null });
  return message.result;
}

function semanticDigest(summary: Record<string, unknown>): string {
  const material = JSON.stringify({
    acceptedPlanDigest: summary.acceptedPlanDigest,
    entitlementSnapshotDigest: summary.entitlementSnapshotDigest,
    agentResourceDecisionDigest: summary.agentResourceDecisionDigest,
    runtimeSelectionDigest: summary.runtimeSelectionDigest,
    reasoningModeLockId: summary.reasoningModeLockId,
    reasoningModeLockDigest: summary.reasoningModeLockDigest,
    taskInstructionBindingDigest: summary.taskInstructionBindingDigest,
    coordinationStatus: summary.coordinationStatus,
    desktopDefaultModelProjection: summary.desktopDefaultModelProjection,
    timeFacts: summary.timeFacts,
    resourceCounts: summary.resourceCounts,
  });
  return `sha256:${createHash("sha256").update(material).digest("hex")}`;
}

function waitForExit(child: ChildProcess): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
}> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
}

function waitForMessage(
  child: ChildProcess,
  predicate: (message: unknown) => boolean,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(() => reject(
      new Error("R2D-4 process barrier timeout"),
    )), timeoutMs);
    const onMessage = (message: unknown) => {
      if (predicate(message)) finish(() => resolve(message));
    };
    const onError = (error: Error) => finish(() => reject(error));
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => finish(() => reject(
      new Error(`R2D-4 child exited before evidence (code=${String(code)}, signal=${String(signal)})`),
    ));
    const finish = (done: () => void) => {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("error", onError);
      child.off("exit", onExit);
      done();
    };
    child.on("message", onMessage);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

function waitForBarrierFile(
  databasePath: string,
  windowName: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const barrierPath = `${databasePath}.${windowName}.barrier.json`;
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const inspect = async () => {
      try {
        const parsed: unknown = JSON.parse(await readFile(barrierPath, "utf8"));
        if (!isRecord(parsed) || parsed.type !== "barrier" || parsed.name !== windowName) {
          reject(new Error("R2D-4 process barrier evidence invalid"));
          return;
        }
        resolve(parsed);
      } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") {
          reject(error);
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error("R2D-4 process barrier timeout"));
          return;
        }
        setImmediate(() => void inspect());
      }
    };
    void inspect();
  });
}

function observeExitedProcess(pid: number | undefined): boolean {
  if (pid === undefined) throw new Error("R2D-4 child PID unavailable");
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ESRCH";
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function countActiveCoreChildren(): number {
  return [...processes].filter((child) =>
    child.exitCode === null && child.signalCode === null).length;
}

function zeroAuthorityCounts() {
  return {
    exactAgent: 0,
    subject: 0,
    registry: 0,
    workspaceAuthorization: 0,
    preference: 0,
    capabilityLocks: 0,
    entitlement: 0,
    toolPolicy: 0,
  };
}

function zeroUpstreamCounts() {
  return {
    credentialResolve: 0,
    providerResolve: 0,
    dns: 0,
    socket: 0,
    tls: 0,
    httpBody: 0,
    invocationLink: 0,
    usage: 0,
    agentLoop: 0,
    compaction: 0,
  };
}

function authorityTimeFacts(value: string) {
  return {
    acceptedAt: value,
    createdAt: value,
    lockedAt: value,
    observedAt: value,
    committedAt: value,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
