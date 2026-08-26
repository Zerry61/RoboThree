import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  LocalPersonalModelInvocationRecoveryCoordinator,
  SqliteLocalPersonalModelInvocationPersistence,
  LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
} from "../src/index.js";

const at = "2026-08-22T10:00:00.000Z";
const fixturePath = fileURLToPath(new URL(
  "./fixtures/dfi4a33-invocation-crash-child.mjs",
  import.meta.url,
));
const identity = {
  invocationKind: "compaction_summary" as const,
  invocationLinkId: "019f7447-a784-77b2-a716-000000000301",
};

describe("DFI-4A.3.3 real process crash recovery", () => {
  it.each(["I1", "I2", "I3", "I4", "I5"] as const)(
    "%s survives SIGKILL and classifies the same SQLite facts in a new PID",
    async (windowName) => {
      const directory = await mkdtemp(join(tmpdir(), `robothree-dfi4a33-${windowName}-`));
      const databasePath = join(directory, "core.sqlite");
      try {
        const child = fork(fixturePath, [], {
          stdio: ["ignore", "pipe", "pipe", "ipc"],
          env: {
            ...process.env,
            ROBOTHREE_DFI4A33_DATABASE_PATH: databasePath,
            ROBOTHREE_DFI4A33_WINDOW: windowName,
          },
        });
        const barrier = await new Promise<{ windowName: string; status: string }>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("crash barrier timeout")), 10_000);
          child.once("message", (message) => {
            clearTimeout(timeout);
            resolve(message as { windowName: string; status: string });
          });
          child.once("exit", (code, signal) => {
            clearTimeout(timeout);
            reject(new Error(`child exited before barrier: ${code ?? signal}`));
          });
        });
        expect(barrier.windowName).toBe(windowName);
        child.kill("SIGKILL");
        await new Promise<void>((resolve) => child.once("exit", () => resolve()));

        const reopened = new SqliteLocalPersonalModelInvocationPersistence({
          databasePath,
          clock: new FakeClock(at),
        });
        await reopened.start();
        try {
          if (windowName === "I5") {
            expect(await reopened.loadInvocation(identity)).toMatchObject({
              status: "terminal",
              terminalClass: "completed",
            });
            expect(await reopened.listPending(200)).toEqual([]);
          } else {
            const evidence = await new LocalPersonalModelInvocationRecoveryCoordinator({
              persistence: reopened,
              clock: new FakeClock(at),
              timeoutPolicy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
            }).classify();
            expect(evidence.scannedCount).toBe(1);
            if (windowName === "I1") {
              expect(evidence.resumeOnTaskOwnerCount).toBe(1);
            } else if (windowName === "I2") {
              expect(evidence.atLeastOnceRiskCount).toBe(1);
            } else {
              expect(evidence.recoveryExhaustedCount).toBe(1);
              expect(await reopened.loadInvocation(identity)).toMatchObject({
                status: "recovery_exhausted",
                typedErrorCode: "model_stream_resume_unavailable",
              });
            }
          }
        } finally {
          await reopened.stop();
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    20_000,
  );
});
