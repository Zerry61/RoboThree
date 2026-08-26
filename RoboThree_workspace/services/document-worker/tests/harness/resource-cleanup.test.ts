/**
 * Harness: Resource cleanup verification (DTP-0-repair.1)
 *
 * Verifies:
 * - Real PID tracking across 10+ start/stop rounds
 * - Post-exit PID verification via process.kill(pid, 0)
 * - Timeout MUST reject, never silently pass
 * - stdout/stderr/stdin cleanup after close
 */

import { describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WORKER_PATH = join(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "dist",
  "worker.js",
);

const ROUNDS = 10;

/** Check whether a PID still exists. Returns false if ESRCH (process gone). */
function pidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
    if (
      e instanceof Error &&
      "code" in e &&
      (e as NodeJS.ErrnoException).code === "ESRCH"
    ) {
      return false;
    }
    // EPERM means it exists but we can't signal — still alive
    return true;
  }
}

/** Spawn worker, wait for close, return the proc. Rejects on timeout. */
function spawnAndWait(
  timeoutMs: number,
): Promise<{ proc: ChildProcess; pid: number; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [WORKER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test" },
    });
    const pid = proc.pid!;

    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { proc.kill("SIGKILL"); } catch { /* best effort */ }
        reject(new Error(`Worker pid ${pid} did not exit within ${timeoutMs}ms`));
      }
    }, timeoutMs);

    proc.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ proc, pid, exitCode: code });
      }
    });

    proc.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    // Close stdin — worker exits when idle (no active request)
    proc.stdin?.end();
  });
}

describe("Resource cleanup harness (repair.1)", () => {
  it("10-round start/stop: all PIDs gone, exitCode=0", async () => {
    const pids: number[] = [];

    for (let round = 0; round < ROUNDS; round++) {
      const { pid, exitCode } = await spawnAndWait(5000);

      // Record PID for post-round verification
      pids.push(pid);

      // Must exit cleanly
      expect(exitCode).toBe(0);

      // Small delay between rounds
      await new Promise((r) => setTimeout(r, 20));
    }

    // All PIDs must be gone after loop completes
    for (const pid of pids) {
      expect(pidExists(pid)).toBe(false);
    }
  });

  it("worker exits cleanly after SIGTERM with PID verification", async () => {
    const { pid, exitCode } = await new Promise<{
      pid: number;
      exitCode: number | null;
    }>((resolve, reject) => {
      const proc = spawn("node", [WORKER_PATH], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_ENV: "test" },
      });
      const pid = proc.pid!;

      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { proc.kill("SIGKILL"); } catch { /* ignore */ }
          reject(new Error("SIGTERM test timed out"));
        }
      }, 5000);

      proc.on("close", (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({ pid, exitCode: code });
        }
      });

      proc.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(err);
        }
      });

      // Small delay then SIGTERM
      setTimeout(() => proc.kill("SIGTERM"), 200);
    });

    expect(exitCode).toBe(0);
    expect(pidExists(pid)).toBe(false);
  });

  it("worker exits cleanly after SIGINT with PID verification", async () => {
    const { pid, exitCode } = await new Promise<{
      pid: number;
      exitCode: number | null;
    }>((resolve, reject) => {
      const proc = spawn("node", [WORKER_PATH], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_ENV: "test" },
      });
      const pid = proc.pid!;

      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { proc.kill("SIGKILL"); } catch { /* ignore */ }
          reject(new Error("SIGINT test timed out"));
        }
      }, 5000);

      proc.on("close", (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({ pid, exitCode: code });
        }
      });

      proc.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(err);
        }
      });

      setTimeout(() => proc.kill("SIGINT"), 200);
    });

    expect(exitCode).toBe(0);
    expect(pidExists(pid)).toBe(false);
  });

  it("worker does not hang when stdin closes without invoke", async () => {
    const { pid, exitCode } = await new Promise<{
      pid: number;
      exitCode: number | null;
    }>((resolve, reject) => {
      const proc = spawn("node", [WORKER_PATH], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_ENV: "test" },
      });
      const pid = proc.pid!;

      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { proc.kill("SIGKILL"); } catch { /* ignore */ }
          reject(new Error("stdin-close test timed out"));
        }
      }, 5000);

      proc.on("close", (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({ pid, exitCode: code });
        }
      });

      proc.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(err);
        }
      });

      // Close stdin immediately after spawn
      setTimeout(() => proc.stdin?.end(), 100);
    });

    expect(exitCode).toBe(0);
    expect(pidExists(pid)).toBe(false);
  });

  it("stdout and stderr are closed after worker exit", async () => {
    const proc = spawn("node", [WORKER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test" },
    });
    const pid = proc.pid!;

    let stdoutEnded = false;
    let stderrEnded = false;

    proc.stdout?.on("end", () => { stdoutEnded = true; });
    proc.stderr?.on("end", () => { stderrEnded = true; });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { /* ignore */ }
        reject(new Error("stdio-close test timed out"));
      }, 5000);

      proc.on("close", () => {
        clearTimeout(timeout);
        resolve();
      });

      setTimeout(() => {
        proc.stdin?.end();
      }, 200);
    });

    // After close event, stdout and stderr should have received 'end'
    expect(stdoutEnded).toBe(true);
    expect(stderrEnded).toBe(true);
    expect(pidExists(pid)).toBe(false);
  });
});
