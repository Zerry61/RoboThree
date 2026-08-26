import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ConfigurationActivationCoordinator,
  EnterpriseRegistryMaterializer,
  FakeClock,
  InMemoryEnterpriseConfigurationPersistence,
  InMemoryRuntimeActivationPersistence,
  PersistenceEnterpriseRuntimeRegistrySource,
  SqliteEnterpriseConfigurationPersistence,
  SqliteRuntimeActivationPersistence,
  type EnterpriseConfigurationPersistence,
  type EnterpriseRuntimeSessionVerifier,
  type RuntimeActivationPersistence,
  type RuntimeActivationTarget,
} from "../src/index.js";
import {
  createEnterpriseConfigurationFixture,
  enterpriseScope,
} from "./enterprise-configuration.fixtures.js";

const directories: string[] = [];
const started: { stop(): Promise<void> }[] = [];

afterEach(async () => {
  for (const item of started.splice(0).reverse()) await item.stop();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

type PersistencePair = Readonly<{
  configuration: EnterpriseConfigurationPersistence;
  runtime: RuntimeActivationPersistence;
}>;

const variants: readonly [
  string,
  () => Promise<PersistencePair>,
][] = [
  [
    "InMemory",
    async () => {
      const clock = new FakeClock("2026-07-27T00:00:00.000Z");
      const configuration = new InMemoryEnterpriseConfigurationPersistence({
        clock,
      });
      await configuration.start();
      const runtime = new InMemoryRuntimeActivationPersistence({
        configurationPersistence: configuration,
        clock,
      });
      await runtime.start();
      started.push(configuration, runtime);
      return { configuration, runtime };
    },
  ],
  [
    "SQLite",
    async () => {
      const directory = mkdtempSync(
        join(tmpdir(), "robothree-runtime-activation-"),
      );
      directories.push(directory);
      const databasePath = join(
        directory,
        "enterprise-configuration.sqlite",
      );
      const clock = new FakeClock("2026-07-27T00:00:00.000Z");
      const configuration = new SqliteEnterpriseConfigurationPersistence({
        databasePath,
        clock,
      });
      await configuration.start();
      const runtime = new SqliteRuntimeActivationPersistence({
        databasePath,
        clock,
      });
      await runtime.start();
      started.push(configuration, runtime);
      return { configuration, runtime };
    },
  ],
];

describe.each(variants)(
  "CGF-1.3B %s Runtime Activation Persistence Conformance",
  (_name, create) => {
    it("records one idempotent intent and commits runtimeActive only after readiness", async () => {
      const pair = await create();
      const target = await activateAndTarget(pair.configuration, "one");
      const begin = beginInput("attempt.one", target);

      expect(await pair.runtime.beginRuntimeActivation(begin)).toMatchObject({
        ok: true,
        replayed: false,
        value: { status: "intent_recorded" },
      });
      expect(await pair.runtime.beginRuntimeActivation(begin)).toMatchObject({
        ok: true,
        replayed: true,
      });
      expect(await pair.runtime.commitRuntimeActive(
        advanceInput("attempt.one", target, "00:01"),
      )).toMatchObject({
        ok: false,
        error: { code: "runtime_activation.stale_attempt" },
      });
      expect(await pair.runtime.recordRestartDecision(
        advanceInput("attempt.one", target, "00:02"),
      )).toMatchObject({
        ok: true,
        value: { status: "restart_requested" },
      });
      expect(await pair.runtime.recordInternalReadiness(
        advanceInput("attempt.one", target, "00:03"),
      )).toMatchObject({
        ok: true,
        value: { status: "internally_ready" },
      });
      expect(await pair.runtime.commitRuntimeActive(
        advanceInput("attempt.one", target, "00:04"),
      )).toMatchObject({
        ok: true,
        replayed: false,
        value: {
          activationAttemptId: "attempt.one",
          target,
        },
      });
      expect(await pair.runtime.commitRuntimeActive(
        advanceInput("attempt.one", target, "00:05"),
      )).toMatchObject({ ok: true, replayed: true });
      expect(await pair.runtime.loadRuntimeActivationState(enterpriseScope))
        .toMatchObject({
          runtimeActive: { target },
          latestAttempt: { status: "completed" },
        });
      expect(await pair.runtime.listRuntimeActivationAttempts(enterpriseScope))
        .toMatchObject([{
          activationAttemptId: "attempt.one",
          status: "completed",
          target,
        }]);
    });

    it("rejects conflicting IDs, concurrent pending attempts and stale targets", async () => {
      const pair = await create();
      const first = await activateAndTarget(pair.configuration, "one");
      expect((await pair.runtime.beginRuntimeActivation(
        beginInput("attempt.one", first),
      )).ok).toBe(true);
      expect(await pair.runtime.beginRuntimeActivation({
        ...beginInput("attempt.one", first),
        requestedAt: timestamp("00:09"),
      })).toMatchObject({
        ok: false,
        error: { code: "runtime_activation.persistence_conflict" },
      });
      expect(await pair.runtime.beginRuntimeActivation(
        beginInput("attempt.two", first),
      )).toMatchObject({
        ok: false,
        error: { code: "runtime_activation.persistence_conflict" },
      });
      await fail(pair.runtime, "attempt.one", first);
      const second = await activateAndTarget(
        pair.configuration,
        "two",
        first.snapshotRevision,
      );
      expect(await pair.runtime.beginRuntimeActivation(
        beginInput("attempt.stale", first),
      )).toMatchObject({
        ok: false,
        error: { code: "runtime_activation.target_not_storage_active" },
      });
      expect((await pair.runtime.beginRuntimeActivation(
        beginInput("attempt.two", second),
      )).ok).toBe(true);
    });

    it("keeps Storage Active on the failed target and records only an exact old runtime fallback", async () => {
      const pair = await create();
      const first = await activateAndTarget(pair.configuration, "one");
      await complete(pair.runtime, "attempt.one", first);
      const previous = (await pair.runtime.loadRuntimeActivationState(
        enterpriseScope,
      )).runtimeActive!;
      const second = await activateAndTarget(
        pair.configuration,
        "two",
        first.snapshotRevision,
      );
      expect((await pair.runtime.beginRuntimeActivation({
        ...beginInput("attempt.two", second),
        expectedPreviousRuntimeActive: previous,
      })).ok).toBe(true);
      expect((await pair.runtime.recordRestartDecision(
        advanceInput("attempt.two", second, "01:02"),
      )).ok).toBe(true);
      expect(await pair.runtime.recordRuntimeActivationFailure({
        ...advanceInput("attempt.two", second, "01:03"),
        errorCode: "runtime_activation.target_startup_failed",
      })).toMatchObject({
        ok: true,
        value: { fallbackRuntimeActive: previous },
      });
      expect(await pair.runtime.recordRuntimeFallbackReady({
        ...advanceInput("attempt.two", second, "01:04"),
        fallbackRuntimeActive: {
          ...previous,
          target: { ...previous.target, registryRevision: "sha256:wrong" },
        },
      })).toMatchObject({
        ok: false,
        error: { code: "runtime_activation.stale_attempt" },
      });
      expect(await pair.runtime.recordRuntimeFallbackReady({
        ...advanceInput("attempt.two", second, "01:05"),
        fallbackRuntimeActive: previous,
      })).toMatchObject({
        ok: true,
        value: { fallbackReadyAt: timestamp("01:05") },
      });
      expect((await pair.configuration.loadActive(enterpriseScope))
        ?.configuration.identity.candidateKey).toBe(second.candidateKey);
      expect(await pair.runtime.loadRuntimeActivationState(enterpriseScope))
        .toMatchObject({
          runtimeActive: previous,
          latestAttempt: {
            status: "failed",
            failure: { fallbackReadyAt: timestamp("01:05") },
          },
        });
    });

    it("fails a late readiness write when Storage Active advances", async () => {
      const pair = await create();
      const first = await activateAndTarget(pair.configuration, "one");
      expect((await pair.runtime.beginRuntimeActivation(
        beginInput("attempt.one", first),
      )).ok).toBe(true);
      expect((await pair.runtime.recordRestartDecision(
        advanceInput("attempt.one", first, "00:02"),
      )).ok).toBe(true);
      await activateAndTarget(
        pair.configuration,
        "two",
        first.snapshotRevision,
      );

      expect(await pair.runtime.recordInternalReadiness(
        advanceInput("attempt.one", first, "00:03"),
      )).toMatchObject({
        ok: false,
        error: { code: "runtime_activation.target_not_storage_active" },
      });
      expect((await pair.runtime.loadRuntimeActivationAttempt("attempt.one"))
        ?.status).toBe("restart_requested");
    });
  },
);

describe("CGF-1.3B SQLite Runtime Activation recovery", () => {
  it("recovers a committed runtimeActive after response loss and close/reopen", async () => {
    const directory = mkdtempSync(
      join(tmpdir(), "robothree-runtime-activation-reopen-"),
    );
    directories.push(directory);
    const databasePath = join(directory, "enterprise-configuration.sqlite");
    const clock = new FakeClock("2026-07-27T00:00:00.000Z");
    const configuration = new SqliteEnterpriseConfigurationPersistence({
      databasePath,
      clock,
    });
    await configuration.start();
    started.push(configuration);
    const target = await activateAndTarget(configuration, "one");
    let inject = true;
    const runtime = new SqliteRuntimeActivationPersistence({
      databasePath,
      clock,
      faultInjector: (point) => {
        if (
          inject
          && point === "after_runtime_active_commit_before_response"
        ) {
          inject = false;
          throw new Error("lost runtimeActive response");
        }
      },
    });
    await runtime.start();
    expect((await runtime.beginRuntimeActivation(
      beginInput("attempt.reopen", target),
    )).ok).toBe(true);
    expect((await runtime.recordRestartDecision(
      advanceInput("attempt.reopen", target, "00:02"),
    )).ok).toBe(true);
    expect((await runtime.recordInternalReadiness(
      advanceInput("attempt.reopen", target, "00:03"),
    )).ok).toBe(true);
    await expect(runtime.commitRuntimeActive(
      advanceInput("attempt.reopen", target, "00:04"),
    )).rejects.toThrow("lost runtimeActive response");
    await runtime.stop();

    const reopened = new SqliteRuntimeActivationPersistence({
      databasePath,
      clock,
    });
    await reopened.start();
    started.push(reopened);
    expect(await reopened.loadRuntimeActivationState(enterpriseScope))
      .toMatchObject({
        latestAttempt: {
          activationAttemptId: "attempt.reopen",
          status: "completed",
        },
        runtimeActive: {
          activationAttemptId: "attempt.reopen",
          target,
        },
      });
    expect(await reopened.commitRuntimeActive(
      advanceInput("attempt.reopen", target, "00:05"),
    )).toMatchObject({ ok: true, replayed: true });
  });
});

class SessionVerifier implements EnterpriseRuntimeSessionVerifier {
  async assertCurrentSession(): Promise<void> {
    // Valid managed enterprise session fixture.
  }
}

async function activateAndTarget(
  persistence: EnterpriseConfigurationPersistence,
  marker: string,
  expectedActiveRevision?: string,
): Promise<RuntimeActivationTarget> {
  const fixture = createEnterpriseConfigurationFixture({ marker });
  const activated = await new ConfigurationActivationCoordinator({
    persistence,
  }).activate({
    scope: enterpriseScope,
    snapshot: fixture.snapshot,
    packages: fixture.packages,
    ...(expectedActiveRevision === undefined
      ? {}
      : { expectedActiveRevision }),
    now: timestamp(marker === "one" ? "00:00" : "01:00"),
  });
  if (!activated.ok) throw new Error(activated.error.code);
  const materialization = await new EnterpriseRegistryMaterializer({
    source: new PersistenceEnterpriseRuntimeRegistrySource(persistence),
    sessionVerifier: new SessionVerifier(),
    compatibility: {
      desktopVersion: "0.0.0",
      coreVersion: "0.0.0",
      supportsContractVersion: (version) => version === "v1alpha1",
      isDesktopCompatible: () => true,
      isCoreCompatible: () => true,
    },
  }).materialize(enterpriseScope);
  return {
    ...materialization.generation,
    registryRevision: materialization.registrySnapshot.registryRevision,
  };
}

function beginInput(
  activationAttemptId: string,
  target: RuntimeActivationTarget,
) {
  return {
    activationAttemptId,
    scope: enterpriseScope,
    target,
    requestedAt: timestamp("00:01"),
  };
}

function advanceInput(
  activationAttemptId: string,
  target: RuntimeActivationTarget,
  minute: string,
) {
  return {
    activationAttemptId,
    scope: enterpriseScope,
    target,
    occurredAt: timestamp(minute),
  };
}

async function complete(
  persistence: RuntimeActivationPersistence,
  attemptId: string,
  target: RuntimeActivationTarget,
): Promise<void> {
  expect((await persistence.beginRuntimeActivation(
    beginInput(attemptId, target),
  )).ok).toBe(true);
  expect((await persistence.recordRestartDecision(
    advanceInput(attemptId, target, "00:02"),
  )).ok).toBe(true);
  expect((await persistence.recordInternalReadiness(
    advanceInput(attemptId, target, "00:03"),
  )).ok).toBe(true);
  expect((await persistence.commitRuntimeActive(
    advanceInput(attemptId, target, "00:04"),
  )).ok).toBe(true);
}

async function fail(
  persistence: RuntimeActivationPersistence,
  attemptId: string,
  target: RuntimeActivationTarget,
): Promise<void> {
  expect((await persistence.recordRuntimeActivationFailure({
    ...advanceInput(attemptId, target, "00:02"),
    errorCode: "runtime_activation.cancelled_for_test",
  })).ok).toBe(true);
}

function timestamp(minute: string): string {
  return `2026-07-27T${minute}:00.000Z`;
}
