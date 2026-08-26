import { createHash, randomBytes } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { readFile, rm, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

type SessionEvidence = Readonly<{
  label: string;
  turnCount: number;
  messageCount: number;
  conversationDigest: string;
  sessionScopeDigest: string;
  sameSessionScopeStable: boolean;
  cacheContextCount: number;
  usageProjectionCount: number;
  usageProjectionDigest: string;
}>;

type CoreEvidence = Readonly<{
  role: "core-a" | "core-b";
  sessionCount: number;
  sessions: readonly SessionEvidence[];
  databaseIdentityDigest: string;
  localPersonal?: Readonly<{
    usageFactCount: number;
    attemptIdentitySeparated: boolean;
    gatewaySidecarCount: number;
    centralProjectionCount: number;
    authorityIsolationDigest: string;
  }>;
}>;

type RunningCore = Readonly<{
  child: ChildProcess;
  databasePath: string;
  evidence: CoreEvidence;
  output: () => string;
}>;

const testDirectory = dirname(fileURLToPath(import.meta.url));
const childFixture = join(testDirectory, "fixtures", "arh331-core-child.mjs");
let directory = "";
let coreA: RunningCore;
let coreB: RunningCore;
const canary = `arh331-${randomBytes(16).toString("hex")}`;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "robothree-arh331-topology-"));
  [coreA, coreB] = await Promise.all([
    startCore("core-a", join(directory, "core-a.sqlite")),
    startCore("core-b", join(directory, "core-b.sqlite")),
  ]);
}, 30_000);

afterAll(async () => {
  const stopped = await Promise.all([stopCore(coreA), stopCore(coreB)]);
  expect(stopped).toEqual([
    { openAdapterCount: 0, pendingTimerCount: 0 },
    { openAdapterCount: 0, pendingTimerCount: 0 },
  ]);
  expect(coreA.output()).not.toContain(canary);
  expect(coreB.output()).not.toContain(canary);
  const evidencePath = process.env.ROBOTHREE_ARH333_TOPOLOGY_EVIDENCE_PATH;
  if (evidencePath !== undefined) {
    const sessions = allSessions().map((session) => ({
      label: session.label,
      turnCount: session.turnCount,
      messageCount: session.messageCount,
      cacheContextCount: session.cacheContextCount,
      usageProjectionCount: session.usageProjectionCount,
      sameSessionScopeStable: session.sameSessionScopeStable,
    })).sort((left, right) => left.label.localeCompare(right.label));
    await writeFile(evidencePath, JSON.stringify({
      schemaVersion: "v1alpha1",
      sessionCount: sessions.length,
      userScopeCount: 2,
      enterpriseScopeCount: 2,
      cacheContextCount: sessions.reduce((sum, session) => sum + session.cacheContextCount, 0),
      usageProjectionCount: sessions.reduce(
        (sum, session) => sum + session.usageProjectionCount,
        0,
      ),
      topologyDigest: `sha256:${createHash("sha256")
        .update(JSON.stringify(sessions))
        .digest("hex")}`,
      childProcessCount: 0,
      pendingTimerCount: stopped.reduce((sum, item) => sum + item.pendingTimerCount, 0),
      openAdapterCount: stopped.reduce((sum, item) => sum + item.openAdapterCount, 0),
    }), "utf8");
  }
  await rm(directory, { recursive: true, force: true });
}, 30_000);

describe("ARH-3.3.1 Multi-Session Core topology", () => {
  it("uses two independent Core processes and two independent SQLite files", async () => {
    expect(coreA.child.pid).toBeDefined();
    expect(coreB.child.pid).toBeDefined();
    expect(coreA.child.pid).not.toBe(coreB.child.pid);
    const [databaseA, databaseB] = await Promise.all([
      stat(coreA.databasePath),
      stat(coreB.databasePath),
    ]);
    expect(databaseA.ino).not.toBe(databaseB.ino);
    expect(coreA.evidence.databaseIdentityDigest)
      .not.toBe(coreB.evidence.databaseIdentityDigest);
  });

  it("runs three Sessions across two Core owners", () => {
    expect(coreA.evidence).toMatchObject({ role: "core-a", sessionCount: 2 });
    expect(coreB.evidence).toMatchObject({ role: "core-b", sessionCount: 1 });
    expect(labels()).toEqual(["A1", "A2", "B1"]);
  });

  it("keeps Conversation facts isolated across Sessions", () => {
    const sessions = allSessions();
    expect(new Set(sessions.map((session) => session.conversationDigest)).size)
      .toBe(3);
    expect(session("A1")).toMatchObject({ turnCount: 2, messageCount: 4 });
    expect(session("A2")).toMatchObject({ turnCount: 1, messageCount: 2 });
    expect(session("B1")).toMatchObject({ turnCount: 1, messageCount: 2 });
  });

  it("keeps exact Session scope stable across Turns and isolated across Sessions", () => {
    expect(session("A1")).toMatchObject({
      sameSessionScopeStable: true,
      cacheContextCount: 2,
    });
    expect(new Set(allSessions().map((value) => value.sessionScopeDigest)).size)
      .toBe(3);
  });

  it("keeps Usage Projection and deterministic aggregates per Session", () => {
    expect(session("A1").usageProjectionCount).toBe(2);
    expect(session("A2").usageProjectionCount).toBe(1);
    expect(session("B1").usageProjectionCount).toBe(1);
    expect(new Set(allSessions().map((value) => value.usageProjectionDigest)).size)
      .toBe(3);
  });

  it("keeps local personal authority isolated without Gateway sidecar or Central projection", () => {
    expect(coreB.evidence.localPersonal).toMatchObject({
      usageFactCount: 1,
      attemptIdentitySeparated: true,
      gatewaySidecarCount: 0,
      centralProjectionCount: 0,
    });
    expect(coreB.evidence.localPersonal?.authorityIsolationDigest)
      .toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("keeps the Core child fixture free of network and production recovery switches", async () => {
    const source = await readFile(childFixture, "utf8");
    expect(source).not.toMatch(/node:(?:http|https|net|tls)|fetch\s*\(/u);
    expect(source).not.toContain("M1");
    expect(source).not.toContain("M8");
    expect(source).not.toContain("faultInjector");
  });
});

function allSessions(): readonly SessionEvidence[] {
  return [...coreA.evidence.sessions, ...coreB.evidence.sessions];
}

function labels(): readonly string[] {
  return allSessions().map((value) => value.label).sort();
}

function session(label: string): SessionEvidence {
  const value = allSessions().find((candidate) => candidate.label === label);
  if (value === undefined) throw new Error(`Missing ARH-3.3.1 Session evidence: ${label}`);
  return value;
}

async function startCore(
  role: "core-a" | "core-b",
  databasePath: string,
): Promise<RunningCore> {
  const child = fork(childFixture, [role, databasePath], {
    cwd: dirname(testDirectory),
    env: { ...process.env, ROBOTHREE_ARH331_CANARY: canary },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output = bounded(output + chunk.toString("utf8"));
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output = bounded(output + chunk.toString("utf8"));
  });
  const evidence = await waitFor<CoreEvidence>(child, "ready", 20_000);
  return { child, databasePath, evidence, output: () => output };
}

async function stopCore(core: RunningCore): Promise<{
  openAdapterCount: number;
  pendingTimerCount: number;
}> {
  if (!core.child.connected) {
    return { openAdapterCount: 0, pendingTimerCount: 0 };
  }
  const stopped = waitFor<{
    resourceMetrics: { openAdapterCount: number; pendingTimerCount: number };
  }>(core.child, "stopped", 10_000);
  core.child.send({ type: "stop" });
  const result = await stopped;
  await waitForExit(core.child, 10_000);
  return result.resourceMetrics;
}

function waitFor<T>(child: ChildProcess, type: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(() => reject(new Error(
      `ARH-3.3.1 child timed out waiting for ${type}`,
    ))), timeoutMs);
    const onMessage = (message: unknown) => {
      if (typeof message !== "object" || message === null) return;
      const record = message as Record<string, unknown>;
      if (record.type === "fatal") {
        finish(() => reject(new Error(String(record.errorCode))));
      } else if (record.type === type) {
        finish(() => resolve((record.result ?? record) as T));
      }
    };
    const onExit = () => finish(() => reject(new Error(
      `ARH-3.3.1 child exited before ${type}`,
    )));
    const finish = (action: () => void) => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
      action();
    };
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ARH-3.3.1 child did not exit cleanly"));
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function bounded(value: string): string {
  return value.length <= 8_192 ? value : value.slice(-8_192);
}
