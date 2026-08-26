import { fork, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const childScript = fileURLToPath(new URL(
  "./fixtures/arh23-compaction-child.mjs",
  import.meta.url,
));
const processes = new Set<ChildProcess>();
const directories = new Set<string>();

describe("DFI-5.2.3 real process lifecycle", () => {
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

  it("reopens an exact v1alpha2 Compaction Binding after SIGKILL in a new Core PID", async () => {
    const databasePath = await database();
    const crashed = spawn("dfi5-v2-w2", databasePath);
    const point = await waitForMessage(
      crashed,
      (message) => isRecord(message)
        && message.type === "barrier"
        && message.point === "request_compaction.after_commit",
      10_000,
    );
    expect(point).toMatchObject({ point: "request_compaction.after_commit" });
    const crashedPid = crashed.pid;
    const exit = waitForExit(crashed);
    expect(crashed.kill("SIGKILL")).toBe(true);
    expect(await exit).toMatchObject({ signal: "SIGKILL" });

    const pending = await run(databasePath, "inspect");
    expect(pending).toMatchObject({
      pendingCount: 1,
      executionBindingSchemaVersion: "v1alpha2",
      reasoningModeLockId: expect.any(String),
      reasoningModeLockDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
    expect(pending.processId).not.toBe(crashedPid);

    const recovered = await run(databasePath, "dfi5-v2-recover");
    expect(recovered.recoveryErrorCodes).toEqual([null]);
    expect(recovered.recoveryStatuses).toEqual(["completed"]);
    expect(recovered).toMatchObject({
      pendingCount: 0,
      activeCompaction: true,
      executionBindingSchemaVersion: "v1alpha2",
      executionBindingDigest: pending.executionBindingDigest,
      reasoningModeLockId: pending.reasoningModeLockId,
      reasoningModeLockDigest: pending.reasoningModeLockDigest,
    });
    expect(recovered.processId).not.toBe(pending.processId);
  }, 20_000);

  it("replays three fresh Core processes with one stable semantic digest", async () => {
    const summaries = [];
    for (let round = 0; round < 3; round += 1) {
      const databasePath = await database();
      summaries.push(await run(databasePath, "dfi5-v2-compact"));
    }
    expect(summaries.every((value) =>
      value.executionBindingSchemaVersion === "v1alpha2"
      && value.pendingCount === 0
      && value.activeCompaction === true)).toBe(true);
    expect(new Set(summaries.map((value) => value.semanticDigest)).size).toBe(1);
    expect(new Set(summaries.map((value) => value.executionBindingDigest)).size).toBe(1);
    expect(new Set(summaries.map((value) => value.processId)).size).toBe(3);
  }, 20_000);
});

async function database(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi5.2.3-process-"));
  directories.add(directory);
  return join(directory, "core.sqlite");
}

function spawn(command: string, databasePath: string): ChildProcess {
  const child = fork(childScript, [command, databasePath], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { PATH: process.env.PATH },
  });
  processes.add(child);
  return child;
}

async function run(databasePath: string, command: string) {
  const child = spawn(command, databasePath);
  const message = await waitForMessage(
    child,
    (candidate) => isRecord(candidate)
      && candidate.type === "result"
      && isRecord(candidate.result),
    10_000,
  );
  expect(await waitForExit(child)).toEqual({ code: 0, signal: null });
  return (message as { result: Record<string, unknown> }).result;
}

function waitForExit(child: ChildProcess): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
}> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function waitForMessage(
  child: ChildProcess,
  predicate: (message: unknown) => boolean,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(() => reject(new Error("process barrier timeout"))), timeoutMs);
    const onMessage = (message: unknown) => {
      if (predicate(message)) finish(() => resolve(message));
    };
    const onError = (error: Error) => finish(() => reject(error));
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => finish(() => reject(
      new Error(`Core child exited before evidence (code=${String(code)}, signal=${String(signal)})`),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
