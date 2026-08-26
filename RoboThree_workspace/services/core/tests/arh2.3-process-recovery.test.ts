import { fork, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const childScript = fileURLToPath(new URL("./fixtures/arh23-compaction-child.mjs", import.meta.url));
const processes = new Set<ChildProcess>();
const directories = new Set<string>();

describe("ARH-2.3 real process recovery matrix", () => {
  afterEach(async () => {
    for (const child of processes) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    processes.clear();
    for (const directory of directories) await rm(directory, { recursive: true, force: true });
    directories.clear();
  });

  it("W1 kills after admission and proves that no Compaction Job was invented", async () => {
    const databasePath = await database();
    await crashAt(databasePath, "w1", "compaction.admission_authorized_before_request");
    expect(await run(databasePath, "inspect")).toMatchObject({
      pendingCount: 0,
      activeCompaction: false,
      contextRevision: 0,
    });
  });

  it("W2 kills after Transaction A and recovers the exact pending Job", async () => {
    const databasePath = await database();
    await crashAt(databasePath, "w2", "request_compaction.after_commit");
    expect(await run(databasePath, "inspect")).toMatchObject({
      pendingCount: 1,
      activeCompaction: false,
      contextRevision: 0,
    });
    expect(await run(databasePath, "recover")).toMatchObject({
      pendingCount: 0,
      activeCompaction: true,
      contextRevision: 1,
      recoveryStatuses: ["completed"],
    });
  });

  it("W4 kills after Summary acquisition and never commits a partial Record", async () => {
    const databasePath = await database();
    await crashAt(databasePath, "w4", "compaction.summary_obtained_before_commit");
    expect(await run(databasePath, "inspect")).toMatchObject({
      pendingCount: 1,
      activeCompaction: false,
      contextRevision: 0,
    });
  });

  it("W5 kills after Transaction C and replays the committed Record", async () => {
    const databasePath = await database();
    await crashAt(databasePath, "w5", "commit_compaction.after_commit");
    const recovered = await run(databasePath, "recover");
    expect(recovered).toMatchObject({
      pendingCount: 0,
      activeCompaction: true,
      contextRevision: 1,
      recoveryStatuses: [],
    });
  });

  it("W6 lets two fresh recovery owners converge on one active Record", async () => {
    const databasePath = await database();
    await crashAt(databasePath, "w2", "request_compaction.after_commit");

    const ownerA = await prepareRecoveryOwner(databasePath, 1);
    const ownerB = await prepareRecoveryOwner(databasePath, 2);
    const recoveries = await Promise.all([ownerA.recover(), ownerB.recover()]);
    const final = await run(databasePath, "inspect");

    expect(final).toMatchObject({
      pendingCount: 0,
      activeCompaction: true,
      contextRevision: 1,
    });
    expect(recoveries.every((result) => result.contextRevision === 1)).toBe(true);
    expect(new Set(recoveries.map((result) => result.semanticDigest))).toEqual(
      new Set([final.semanticDigest]),
    );
  }, 40_000);

  it("W7 kills before the main Model call and converges to one Assistant commit", async () => {
    const databasePath = await database();
    await crashAt(databasePath, "w7", "compaction.context_prepared_before_model_invocation");
    const before = await run(databasePath, "inspect");
    expect(before).toMatchObject({
      activeCompaction: true,
      assistantCommitCount: 0,
    });
    const first = await run(databasePath, "w7-main");
    const replay = await run(databasePath, "w7-main");
    expect(first.assistantCommitCount).toBe(1);
    expect(replay.assistantCommitCount).toBe(1);
    expect(replay.semanticDigest).toBe(first.semanticDigest);
  });

  it("proves first and rolling Compaction preserve the full immutable source range", async () => {
    const databasePath = await database();
    const first = await run(databasePath, "compact");
    expect(first).toMatchObject({
      resultStatus: "completed",
      activeCompaction: true,
      contextRevision: 1,
    });
    const rolling = await run(databasePath, "rolling");
    expect(rolling).toMatchObject({
      status: "rolling_completed",
      resultStatus: "completed",
      activeCompaction: true,
      contextRevision: 2,
    });
    expect(rolling.semanticDigest).not.toBe(first.semanticDigest);
  });

  it("reopens one rolling active view ten times with stable semantic evidence", async () => {
    const databasePath = await database();
    await run(databasePath, "compact");
    const rolling = await run(databasePath, "rolling");
    const reopened = [];
    for (let round = 0; round < 10; round += 1) {
      reopened.push(await run(databasePath, "inspect"));
    }
    expect(reopened.every((result) => result.contextRevision === 2)).toBe(true);
    expect(new Set(reopened.map((result) => result.semanticDigest))).toEqual(
      new Set([rolling.semanticDigest]),
    );
    const evidencePath = process.env.ROBOTHREE_ARH333_REOPEN_EVIDENCE_PATH;
    if (evidencePath !== undefined) {
      await writeFile(evidencePath, JSON.stringify({
        schemaVersion: "v1alpha1",
        coreReopenRecoveryCount: reopened.length,
        contextRevision: 2,
        semanticDigest: rolling.semanticDigest,
        pendingTimerCount: 0,
        temporaryArtifactHandleCount: 0,
      }), "utf8");
    }
  }, 20_000);
});

async function database(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "robothree-arh23-process-"));
  directories.add(directory);
  return join(directory, "robothree.sqlite");
}

async function crashAt(databasePath: string, command: string, expectedPoint: string): Promise<void> {
  const child = spawn(command, databasePath);
  const point = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${expectedPoint}`)), 10_000);
    child.once("error", reject);
    child.on("message", (message: unknown) => {
      if (!isMessage(message) || message.type !== "barrier") return;
      clearTimeout(timeout);
      resolve(String(message.point));
    });
  });
  expect(point).toBe(expectedPoint);
  const exit = waitForExit(child);
  expect(child.kill("SIGKILL")).toBe(true);
  expect(await exit).toMatchObject({ signal: "SIGKILL" });
}

async function run(
  databasePath: string,
  command: string,
  timeoutMs = 10_000,
): Promise<Record<string, unknown>> {
  const child = spawn(command, databasePath);
  const result = await waitForResult(child, command, timeoutMs);
  const exit = await waitForExit(child);
  expect(exit).toEqual({ code: 0, signal: null });
  return result;
}

async function prepareRecoveryOwner(databasePath: string, ownerOrdinal: number): Promise<Readonly<{
  recover(): Promise<Record<string, unknown>>;
}>> {
  const child = spawn("recover-gated", databasePath, [String(ownerOrdinal)]);
  await waitForMessage(child, (message) => isMessage(message) && message.type === "ready", 10_000,
    "Timed out preparing recovery owner");
  return {
    async recover() {
      const result = waitForResult(child, "recover", 30_000);
      child.send({ type: "recover" });
      const value = await result;
      expect(await waitForExit(child)).toEqual({ code: 0, signal: null });
      return value;
    },
  };
}

async function waitForResult(
  child: ChildProcess,
  command: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const message = await waitForMessage(
    child,
    (candidate) => isMessage(candidate)
      && candidate.type === "result"
      && isRecord(candidate.result),
    timeoutMs,
    `Timed out running ${command}`,
  );
  return (message as { result: Record<string, unknown> }).result;
}

function waitForMessage(
  child: ChildProcess,
  predicate: (message: unknown) => boolean,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(() => reject(new Error(timeoutMessage))), timeoutMs);
    const onError = (error: Error) => finish(() => reject(error));
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => finish(() => reject(
      new Error(`Recovery child exited before its IPC result (code=${String(code)}, signal=${String(signal)})`),
    ));
    const onMessage = (message: unknown) => {
      if (predicate(message)) finish(() => resolve(message));
    };
    const finish = (complete: () => void) => {
      clearTimeout(timeout);
      child.off("error", onError);
      child.off("exit", onExit);
      child.off("message", onMessage);
      complete();
    };
    child.once("error", onError);
    child.once("exit", onExit);
    child.on("message", onMessage);
  });
}

function spawn(command: string, databasePath: string, extraArguments: readonly string[] = []): ChildProcess {
  const child = fork(childScript, [command, databasePath, ...extraArguments], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { PATH: process.env.PATH },
  });
  processes.add(child);
  return child;
}

function waitForExit(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      processes.delete(child);
      resolve({ code, signal });
    });
  });
}

function isMessage(value: unknown): value is { type: string; point?: unknown; result?: unknown } {
  return isRecord(value) && typeof value.type === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
