import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, describe, expect, it } from "vitest";

const childScript = fileURLToPath(new URL("./fixtures/dfi534-lifecycle-child.mjs", import.meta.url));
const providerPaths = [
  "local_personal_openai",
  "enterprise_openai",
  "enterprise_anthropic",
] as const;
const barriers = ["reasoning_mapping_validated", "invocation_link_committed"] as const;
const processes = new Set<ChildProcess>();
const directories = new Set<string>();
const scenarios: Array<Record<string, unknown>> = [];
const semanticReplays: Array<Record<string, unknown>> = [];
const childResourceSnapshots: Array<Record<string, unknown>> = [];

afterEach(async () => {
  for (const child of processes) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  processes.clear();
  for (const directory of directories) await rm(directory, { recursive: true, force: true });
  directories.clear();
});

afterAll(async () => {
  const output = process.env.ROBOTHREE_DFI534_PROCESS_EVIDENCE_PATH;
  if (output === undefined) return;
  const digests = semanticReplays.map(semanticDigest);
  const resourceCounts = aggregateChildResources(childResourceSnapshots);
  await writeFile(output, JSON.stringify({
    schemaVersion: "v1",
    status: "PASS",
    crashScenarioCount: scenarios.length,
    scenarios,
    semanticReplayCount: 3,
    semanticReplayPathRunCount: semanticReplays.length,
    semanticReplayDigests: digests,
    uniqueSemanticDigestCountByProvider: Object.fromEntries(providerPaths.map((providerPath) => [
      providerPath,
      new Set(semanticReplays.filter((item) => item.providerPath === providerPath)
        .map(semanticDigest)).size,
    ])),
    processIds: semanticReplays.map((item) => item.processId),
    resourceCounts: {
      activeCoreChildren: [...processes]
        .filter((child) => child.exitCode === null && child.signalCode === null).length,
      ...resourceCounts,
    },
  }), "utf8");
});

describe("DFI-5.3.4 real child lifecycle", () => {
  for (const providerPath of providerPaths) {
    for (const barrier of barriers) {
      it(`SIGKILLs ${providerPath} at ${barrier} and recovers the exact durable facts`, async () => {
        const databasePath = await database(`dfi534-${providerPath}-`);
        const crashed = spawnChild("prepare", databasePath, providerPath, barrier);
        const barrierMessage = await waitForMessage(crashed, (message) =>
          isRecord(message) && message.type === "barrier", 20_000);
        expect(barrierMessage).toMatchObject({
          providerPath,
          barrier,
          invocationLinkCommitted: barrier === "invocation_link_committed",
        });
        const crashedPid = crashed.pid;
        const exit = waitForExit(crashed);
        expect(crashed.kill("SIGKILL")).toBe(true);
        expect(await exit).toMatchObject({ signal: "SIGKILL" });
        expect(observeExitedProcess(crashedPid)).toBe(true);

        const recovered = await runChild("recover", databasePath, providerPath, "none");
        expect(recovered.processId).not.toBe(crashedPid);
        expect(recovered).toMatchObject({
          providerPath,
          databasePath,
          deadlineAt: "2026-08-27T08:15:00.000Z",
          bodyMode: "max",
          terminal: "completed",
          upstreamRequestCount: 1,
          usageProjectionCount: 1,
        });
        expect(recovered.mappingLoadCount)
          .toBe(barrier === "invocation_link_committed" ? 0 : 1);
        expect(recovered.resourceCounts).toEqual(childZeroResources());

        const replay = await runChild("recover", databasePath, providerPath, "none");
        expect(replay).toMatchObject({
          mappingLoadCount: 0,
          upstreamRequestCount: 0,
          usageProjectionCount: 0,
          terminal: "completed",
        });
        scenarios.push({
          providerPath,
          barrier,
          crashedPid,
          recoveredPid: recovered.processId,
          replayPid: replay.processId,
          mappingDigest: recovered.mappingDigest,
          deadlineAt: recovered.deadlineAt,
          terminalReplayMappingLoadCount: replay.mappingLoadCount,
          terminalReplayUpstreamRequestCount: replay.upstreamRequestCount,
          terminalReplayUsageProjectionCount: replay.usageProjectionCount,
        });
      }, 35_000);
    }

    it(`keeps three fresh ${providerPath} semantic replays stable`, async () => {
      const results: Array<Record<string, unknown>> = [];
      for (let round = 0; round < 3; round += 1) {
        results.push(await runChild("run", await database(`dfi534-${providerPath}-semantic-`), providerPath, "none"));
      }
      expect(new Set(results.map(semanticDigest)).size).toBe(1);
      expect(new Set(results.map((result) => result.processId)).size).toBe(3);
      expect(results.every((result) => result.resourceCounts !== undefined)).toBe(true);
      semanticReplays.push(...results);
    }, 35_000);
  }

  it("retains mapping and deadline as authoritative semantic material", () => {
    const baseline = {
      providerPath: "local_personal_openai",
      reasoningModeLockDigest: digest("a"),
      modelLockDigest: digest("b"),
      requestDigest: digest("c"),
      mappingDigest: digest("d"),
      deadlineAt: "2026-08-27T08:15:00.000Z",
      bodyMode: "max",
      usageDigest: digest("e"),
      terminal: "completed",
    };
    expect(semanticDigest({ ...baseline, processId: 1 }))
      .toBe(semanticDigest({ ...baseline, processId: 2 }));
    expect(semanticDigest({ ...baseline, mappingDigest: digest("f") }))
      .not.toBe(semanticDigest(baseline));
    expect(semanticDigest({ ...baseline, deadlineAt: "2026-08-27T08:15:00.001Z" }))
      .not.toBe(semanticDigest(baseline));
  });
});

async function database(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  directories.add(directory);
  return join(directory, "core.sqlite");
}

function spawnChild(command: string, databasePath: string, providerPath: string, barrier: string) {
  const child = fork(childScript, [command, databasePath, providerPath, barrier], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { PATH: process.env.PATH },
  });
  processes.add(child);
  return child;
}

async function runChild(command: string, databasePath: string, providerPath: string, barrier: string) {
  const child = spawnChild(command, databasePath, providerPath, barrier);
  const message = await waitForMessage(child, (candidate) =>
    isRecord(candidate) && candidate.type === "result" && isRecord(candidate.result), 20_000);
  expect(await waitForExit(child)).toEqual({ code: 0, signal: null });
  const result = (message as { result: Record<string, unknown> }).result;
  if (isRecord(result.resourceCounts)) childResourceSnapshots.push(result.resourceCounts);
  return result;
}

function waitForExit(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
}

function waitForMessage(child: ChildProcess, predicate: (message: unknown) => boolean, timeoutMs: number) {
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => finish(() => reject(new Error("DFI-5.3.4 child timeout"))), timeoutMs);
    const onMessage = (message: unknown) => { if (predicate(message)) finish(() => resolve(message)); };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => finish(() => reject(
      new Error(`DFI-5.3.4 child exited early (code=${String(code)}, signal=${String(signal)})`),
    ));
    const onError = (error: Error) => finish(() => reject(error));
    const finish = (done: () => void) => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
      child.off("error", onError);
      done();
    };
    child.on("message", onMessage);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

function observeExitedProcess(pid: number | undefined) {
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return isRecord(error) && error.code === "ESRCH";
  }
}

function semanticDigest(summary: Record<string, unknown>) {
  const material = {
    providerPath: summary.providerPath,
    reasoningModeLockDigest: summary.reasoningModeLockDigest,
    modelLockDigest: summary.modelLockDigest,
    requestDigest: summary.requestDigest,
    mappingDigest: summary.mappingDigest,
    deadlineAt: summary.deadlineAt,
    bodyMode: summary.bodyMode,
    usageDigest: summary.usageDigest,
    terminal: summary.terminal,
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(material)).digest("hex")}`;
}

function childZeroResources() {
  return {
    listeningPorts: 0,
    openSqliteHandles: 0,
    providerFixtureServers: 0,
    inFlightInvocationLinkClaims: 0,
    providerStreams: 0,
    sseSubscriptions: 0,
    timersSchedulers: 0,
    abortControllers: 0,
    mappingLookupLeases: 0,
    pendingUsageProjections: 0,
    lateCallbacks: 0,
    temporaryFixtureFileHandles: 0,
  };
}

function aggregateChildResources(snapshots: Array<Record<string, unknown>>) {
  expect(snapshots.length).toBeGreaterThan(0);
  return Object.fromEntries(Object.keys(childZeroResources()).map((key) => {
    const values = snapshots.map((snapshot) => snapshot[key]);
    expect(values.every((value) => Number.isSafeInteger(value) && value === 0)).toBe(true);
    return [key, Math.max(...values.map(Number))];
  }));
}

function digest(marker: string) {
  return `sha256:${marker.repeat(64)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
