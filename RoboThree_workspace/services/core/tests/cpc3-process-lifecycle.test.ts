import { fork, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, describe, expect, it } from "vitest";

const childScript = fileURLToPath(new URL("./fixtures/cpc3-lifecycle-child.mjs", import.meta.url));
const windows = [
  "task_bundle_loaded",
  "instruction_bundle_materialized",
  "model_request_finalized",
  "tool_result_committed",
  "compaction_committed",
  "assistant_committed",
] as const;
const processes = new Set<ChildProcess>();
const directories = new Set<string>();
const scenarioEvidence: Array<Record<string, unknown>> = [];
const semanticReplayDigests: string[] = [];

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
  const output = process.env.ROBOTHREE_CPC3_PROCESS_EVIDENCE_PATH;
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
  }), "utf8");
});

describe("CPC-3 real Core child lifecycle", () => {
  for (const windowName of windows) {
    it(`kills and reopens the exact durable CPC facts at ${windowName}`, async () => {
      const directory = await mkdtemp(join(tmpdir(), `robothree-cpc3-${windowName}-`));
      directories.add(directory);
      const databasePath = join(directory, "core.sqlite");
      const crashed = spawnChild("prepare", databasePath, windowName);
      const barrier = await waitForMessage(
        crashed,
        (message) => isRecord(message)
          && message.type === "barrier"
          && message.name === windowName,
        15_000,
      ) as Record<string, unknown>;
      const crashedPid = crashed.pid;
      const exit = waitForExit(crashed);
      expect(crashed.kill("SIGKILL")).toBe(true);
      expect(await exit).toMatchObject({ signal: "SIGKILL" });
      expect(observeExitedProcess(crashedPid)).toBe(true);

      const recovered = await runChild("recover", databasePath, windowName);
      expect(recovered.processId).not.toBe(crashedPid);
      expect(recovered).toMatchObject({
        window: windowName,
        providerResolveCount: 0,
        upstreamRequestCount: 0,
        testIdentityUsed: true,
        productionCpcActivationEnabled: false,
      });
      expect(isRecord(recovered.resourceCounts)).toBe(true);
      if (!isRecord(recovered.resourceCounts)) throw new Error("CPC-3 resources unavailable");
      expect(Object.keys(recovered.resourceCounts).sort()).toEqual([
        "abortControllers",
        "activeAgentLoopRuns",
        "compactionJobs",
        "diagnosticSubscriptions",
        "mailboxes",
        "openSqliteHandles",
        "pendingDeliveryRecords",
        "providerStreams",
        "scheduledTimers",
        "temporaryFixtureServers",
        "toolExecutions",
      ]);
      expect(Object.values(recovered.resourceCounts).every((value) => value === 0)).toBe(true);
      if (windowName === "assistant_committed") {
        expect(recovered).toMatchObject({
          terminalReplay: true,
          materializeCount: 0,
          contextCount: 0,
        });
      } else {
        expect(recovered).toMatchObject({ terminalReplay: false, materializeCount: 1 });
        if (windowName !== "tool_result_committed") {
          expect(recovered.contextCount).toBe(1);
        }
      }
      if (windowName !== "assistant_committed"
        && typeof barrier.taskInstructionBindingDigest === "string") {
        expect(recovered.taskInstructionBindingDigest)
          .toBe(barrier.taskInstructionBindingDigest);
        expect(recovered.instructionBundleDigest).toBe(barrier.instructionBundleDigest);
      }
      if (windowName === "model_request_finalized") {
        expect(recovered.modelRequestDigest).toBe(barrier.modelRequestDigest);
        expect(recovered.receiptModelRequestDigest).toBe(recovered.modelRequestDigest);
      }
      if (windowName === "tool_result_committed") {
        expect(recovered.toolBatchCommitted).toBe(true);
      }
      if (windowName === "compaction_committed") {
        expect(recovered).toMatchObject({ activeCompaction: true, pendingCompactionCount: 0 });
      }
      scenarioEvidence.push({
        window: windowName,
        terminalReplay: recovered.terminalReplay,
        materializeCount: recovered.materializeCount,
        contextCount: recovered.contextCount,
        toolBatchCommitted: recovered.toolBatchCommitted,
        activeCompaction: recovered.activeCompaction,
        processExitObserved: true,
        resourceCounts: recovered.resourceCounts,
      });
    }, 25_000);
  }

  it("produces one semantic digest across three fresh process and SQLite runs", async () => {
    const summaries: Array<Record<string, unknown>> = [];
    for (let round = 0; round < 3; round += 1) {
      const directory = await mkdtemp(join(tmpdir(), "robothree-cpc3-replay-"));
      directories.add(directory);
      const databasePath = join(directory, "core.sqlite");
      summaries.push(await runChild("recover", databasePath, "model_request_finalized"));
    }
    const semantic = summaries.map((summary) => JSON.stringify({
      taskInstructionBindingDigest: summary.taskInstructionBindingDigest,
      instructionBundleDigest: summary.instructionBundleDigest,
      modelRequestDigest: summary.modelRequestDigest,
      receiptModelRequestDigest: summary.receiptModelRequestDigest,
      terminalReplay: summary.terminalReplay,
      resourceCounts: summary.resourceCounts,
    }));
    expect(new Set(semantic).size).toBe(1);
    expect(new Set(summaries.map((summary) => summary.processId)).size).toBe(3);
    semanticReplayDigests.push(...semantic.map((value) =>
      `sha256:${createHash("sha256").update(value).digest("hex")}`));
    expect(new Set(semanticReplayDigests).size).toBe(1);
  }, 25_000);
});

function spawnChild(command: string, databasePath: string, windowName: string): ChildProcess {
  const child = fork(childScript, [command, databasePath, windowName], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { PATH: process.env.PATH },
  });
  processes.add(child);
  return child;
}

async function runChild(command: string, databasePath: string, windowName: string) {
  const child = spawnChild(command, databasePath, windowName);
  const result = await waitForMessage(
    child,
    (message) => isRecord(message) && message.type === "result" && isRecord(message.result),
    15_000,
  ) as { result: Record<string, unknown> };
  expect(await waitForExit(child)).toEqual({ code: 0, signal: null });
  return result.result;
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
    const timeout = setTimeout(() => finish(() => reject(new Error("CPC-3 process barrier timeout"))), timeoutMs);
    const onMessage = (message: unknown) => {
      if (predicate(message)) finish(() => resolve(message));
    };
    const onError = (error: Error) => finish(() => reject(error));
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => finish(() => reject(
      new Error(`CPC-3 child exited before evidence (code=${String(code)}, signal=${String(signal)})`),
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

function observeExitedProcess(pid: number | undefined): boolean {
  if (pid === undefined) throw new Error("CPC-3 child PID unavailable");
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ESRCH";
  }
}

function countActiveCoreChildren(): number {
  return [...processes].filter((child) =>
    child.exitCode === null && child.signalCode === null).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
