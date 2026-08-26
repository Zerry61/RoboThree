import { afterEach, describe, expect, it } from "vitest";

import {
  ConfigurationActivationCoordinator,
  EnterpriseRegistryMaterializer,
  FakeClock,
  FakeControlledCoreRestartPort,
  FakeRuntimeRegistryInstaller,
  InMemoryEnterpriseConfigurationPersistence,
  InMemoryRuntimeActivationPersistence,
  PersistenceEnterpriseRuntimeRegistrySource,
  RuntimeActivationCoordinator,
  RuntimeActivationCrash,
  type EnterpriseIdentityScope,
  type EnterpriseRuntimeSessionVerifier,
  type RuntimeActivationTarget,
  type RuntimeRegistryInstallation,
  type RuntimeRegistryInstaller,
} from "../src/index.js";
import {
  createEnterpriseConfigurationFixture,
  enterpriseScope,
} from "./enterprise-configuration.fixtures.js";

const resources: { stop(): Promise<void> }[] = [];

afterEach(async () => {
  for (const resource of resources.splice(0).reverse()) {
    await resource.stop();
  }
});

describe("CGF-1.3B Runtime Activation Coordinator", () => {
  it("persists restart intent, gates public readiness and replays a completed attempt", async () => {
    const fixture = await setup();
    await activateConfiguration(fixture, "one");

    expect(await fixture.coordinator.requestActivation({
      activationAttemptId: "attempt.one",
      scope: enterpriseScope,
    })).toMatchObject({ status: "restart_requested" });
    expect(fixture.restart.requests).toHaveLength(1);
    expect(fixture.installer.publicReadiness).toHaveLength(0);
    expect((await fixture.runtime.loadRuntimeActivationState(enterpriseScope))
      .latestAttempt?.status).toBe("restart_requested");

    const ready = await fixture.coordinator.recoverAtStartup(enterpriseScope);
    expect(ready).toMatchObject({ status: "ready", replayed: false });
    expect((await fixture.runtime.loadRuntimeActivationState(enterpriseScope)))
      .toMatchObject({
        latestAttempt: { status: "completed" },
        runtimeActive: { activationAttemptId: "attempt.one" },
      });
    expect(fixture.installer.publicReadiness).toHaveLength(1);

    const replay = await fixture.coordinator.recoverAtStartup(enterpriseScope);
    expect(replay).toMatchObject({ status: "ready", replayed: true });
    expect(fixture.restart.requests).toHaveLength(1);
    expect(fixture.installer.publicReadiness).toHaveLength(2);
  });

  it("recovers intent persisted before the restart request without creating a second attempt", async () => {
    const fixture = await setup({
      fault: (point) => {
        if (point === "after_activation_intent_before_restart") {
          throw new RuntimeActivationCrash(point);
        }
      },
    });
    await activateConfiguration(fixture, "one");

    await expect(fixture.coordinator.requestActivation({
      activationAttemptId: "attempt.crash",
      scope: enterpriseScope,
    })).rejects.toMatchObject({
      point: "after_activation_intent_before_restart",
    });
    expect((await fixture.runtime.loadRuntimeActivationState(enterpriseScope))
      .latestAttempt?.status).toBe("intent_recorded");
    expect(fixture.restart.requests).toHaveLength(0);

    const recovered = coordinator(fixture);
    expect(await recovered.recoverAtStartup(enterpriseScope)).toMatchObject({
      status: "restart_requested",
      attempt: { activationAttemptId: "attempt.crash" },
    });
    expect(fixture.restart.requests).toHaveLength(1);
  });

  it("replays public readiness after runtimeActive committed and the process crashed", async () => {
    const fixture = await setup();
    await activateConfiguration(fixture, "one");
    await fixture.coordinator.requestActivation({
      activationAttemptId: "attempt.commit-crash",
      scope: enterpriseScope,
    });
    const crashing = coordinator(fixture, (point) => {
      if (point === "after_runtime_active_commit_before_public_readiness") {
        throw new RuntimeActivationCrash(point);
      }
    });

    await expect(crashing.recoverAtStartup(enterpriseScope))
      .rejects.toMatchObject({
        point: "after_runtime_active_commit_before_public_readiness",
      });
    expect((await fixture.runtime.loadRuntimeActivationState(enterpriseScope)))
      .toMatchObject({
        latestAttempt: { status: "completed" },
        runtimeActive: { activationAttemptId: "attempt.commit-crash" },
      });
    expect(fixture.installer.publicReadiness).toHaveLength(0);

    expect(await fixture.coordinator.recoverAtStartup(enterpriseScope))
      .toMatchObject({ status: "ready", replayed: true });
    expect(fixture.installer.publicReadiness).toHaveLength(1);
  });

  it("falls back only to the exact last successful runtime generation and keeps Storage Active on target", async () => {
    const installer = new TargetFailingInstaller();
    const fixture = await setup({ installer });
    const first = await activateConfiguration(fixture, "one");
    await fixture.coordinator.requestActivation({
      activationAttemptId: "attempt.one",
      scope: enterpriseScope,
    });
    await fixture.coordinator.recoverAtStartup(enterpriseScope);

    const second = await activateConfiguration(
      fixture,
      "two",
      first.snapshotRevision,
    );
    installer.failCandidateKey = second.candidateKey;
    await fixture.coordinator.requestActivation({
      activationAttemptId: "attempt.two",
      scope: enterpriseScope,
    });
    const result = await fixture.coordinator.recoverAtStartup(enterpriseScope);

    expect(result).toMatchObject({
      status: "fallback_ready",
      runtimeActive: { target: { candidateKey: first.candidateKey } },
      failedAttempt: {
        status: "failed",
        failure: {
          errorCode: "runtime_activation.target_startup_failed",
          fallbackReadyAt: expect.any(String),
        },
      },
    });
    expect((await fixture.configuration.loadActive(enterpriseScope))
      ?.configuration.identity.candidateKey).toBe(second.candidateKey);
    expect((await fixture.runtime.loadRuntimeActivationState(enterpriseScope))
      .runtimeActive?.target.candidateKey).toBe(first.candidateKey);
    expect(installer.publicReadiness.at(-1)?.candidateKey)
      .toBe(first.candidateKey);
  });

  it("fails closed when Storage Active advances while an old attempt is starting", async () => {
    const fixture = await setup();
    const first = await activateConfiguration(fixture, "one");
    await fixture.coordinator.requestActivation({
      activationAttemptId: "attempt.stale",
      scope: enterpriseScope,
    });
    await activateConfiguration(
      fixture,
      "two",
      first.snapshotRevision,
    );

    expect(await fixture.coordinator.recoverAtStartup(enterpriseScope))
      .toMatchObject({
        status: "activation_failed",
        failedAttempt: {
          activationAttemptId: "attempt.stale",
          status: "failed",
        },
      });
    expect(fixture.installer.failedClosedTargets).toHaveLength(1);
    expect((await fixture.runtime.loadRuntimeActivationState(enterpriseScope))
      .runtimeActive).toBeUndefined();
  });

  it("serializes concurrent duplicate requests and suppresses duplicate restart dispatch", async () => {
    const fixture = await setup();
    await activateConfiguration(fixture, "one");

    const [first, second] = await Promise.all([
      fixture.coordinator.requestActivation({
        activationAttemptId: "attempt.concurrent",
        scope: enterpriseScope,
      }),
      fixture.coordinator.requestActivation({
        activationAttemptId: "attempt.concurrent",
        scope: enterpriseScope,
      }),
    ]);
    expect(first.status).toBe("restart_requested");
    expect(second.status).toBe("restart_requested");
    expect(fixture.restart.requests).toHaveLength(1);
  });

  it("fails closed when the new Core does not observe the exact persisted startup target", async () => {
    const fixture = await setup();
    await activateConfiguration(fixture, "one");
    await fixture.coordinator.requestActivation({
      activationAttemptId: "attempt.startup-mismatch",
      scope: enterpriseScope,
    });
    fixture.restart.startupIntent = {
      activationAttemptId: "attempt.other",
      target: fixture.restart.requests[0]!.target,
    };

    expect(await fixture.coordinator.recoverAtStartup(enterpriseScope))
      .toMatchObject({
        status: "activation_failed",
        failedAttempt: {
          status: "failed",
          failure: {
            errorCode: "runtime_activation.startup_target_mismatch",
          },
        },
      });
    expect(fixture.installer.failedClosedTargets).toHaveLength(1);
  });

  it("fails a fallback when the managed enterprise session becomes invalid", async () => {
    const installer = new TargetFailingInstaller();
    const session = new SessionVerifier();
    const fixture = await setup({ installer, session });
    const first = await activateConfiguration(fixture, "one");
    await fixture.coordinator.requestActivation({
      activationAttemptId: "attempt.one",
      scope: enterpriseScope,
    });
    await fixture.coordinator.recoverAtStartup(enterpriseScope);
    const second = await activateConfiguration(
      fixture,
      "two",
      first.snapshotRevision,
    );
    installer.failCandidateKey = second.candidateKey;
    await fixture.coordinator.requestActivation({
      activationAttemptId: "attempt.two",
      scope: enterpriseScope,
    });
    session.rejectAfterCalls = session.calls + 2;

    expect(await fixture.coordinator.recoverAtStartup(enterpriseScope))
      .toMatchObject({ status: "activation_failed" });
    expect(installer.failedClosedTargets.at(-1)?.candidateKey)
      .toBe(second.candidateKey);
  });

  it.each([
    ["before_activation_intent", undefined],
    ["after_activation_intent_before_restart", "intent_recorded"],
    ["after_restart_request_before_new_core", "restart_requested"],
  ] as const)(
    "recovers a crash at %s with the expected durable pre-restart state",
    async (point, expectedStatus) => {
      const fixture = await setup({
        fault: (candidate) => {
          if (candidate === point) throw new RuntimeActivationCrash(candidate);
        },
      });
      await activateConfiguration(fixture, "one");
      await expect(fixture.coordinator.requestActivation({
        activationAttemptId: `attempt.${point}`,
        scope: enterpriseScope,
      })).rejects.toMatchObject({ point });
      expect((await fixture.runtime.loadRuntimeActivationState(enterpriseScope))
        .latestAttempt?.status).toBe(expectedStatus);
    },
  );

  it.each([
    ["after_registry_build_before_internal_readiness", "restart_requested", 0],
    ["after_internal_readiness_before_runtime_active_commit", "internally_ready", 0],
    ["after_runtime_active_commit_before_public_readiness", "completed", 0],
    ["after_public_readiness_before_response", "completed", 1],
  ] as const)(
    "recovers a crash at %s with commit ordering preserved",
    async (point, expectedStatus, publicCount) => {
      const fixture = await setup();
      await activateConfiguration(fixture, "one");
      await fixture.coordinator.requestActivation({
        activationAttemptId: `attempt.${point}`,
        scope: enterpriseScope,
      });
      const crashing = coordinator(fixture, (candidate) => {
        if (candidate === point) throw new RuntimeActivationCrash(candidate);
      });
      await expect(crashing.recoverAtStartup(enterpriseScope))
        .rejects.toMatchObject({ point });
      expect((await fixture.runtime.loadRuntimeActivationState(enterpriseScope))
        .latestAttempt?.status).toBe(expectedStatus);
      expect(fixture.installer.publicReadiness).toHaveLength(publicCount);
    },
  );
});

class SessionVerifier implements EnterpriseRuntimeSessionVerifier {
  calls = 0;
  rejectAfterCalls = Number.POSITIVE_INFINITY;

  async assertCurrentSession(
    _scope: EnterpriseIdentityScope,
    _permission: string,
  ): Promise<void> {
    this.calls += 1;
    if (this.calls >= this.rejectAfterCalls) {
      throw new Error("enterprise session invalid");
    }
  }
}

class TargetFailingInstaller implements RuntimeRegistryInstaller {
  readonly installations: RuntimeRegistryInstallation[] = [];
  readonly publicReadiness: RuntimeActivationTarget[] = [];
  readonly failedClosedTargets: RuntimeActivationTarget[] = [];
  failCandidateKey: string | undefined;

  async installAndCheckInternalReadiness(
    installation: RuntimeRegistryInstallation,
  ): Promise<void> {
    this.installations.push(structuredClone(installation));
    if (installation.target.candidateKey === this.failCandidateKey) {
      throw new Error("target adapter unavailable");
    }
  }

  async exposePublicReadiness(target: RuntimeActivationTarget): Promise<void> {
    this.publicReadiness.push(structuredClone(target));
  }

  async failClosedEnterprisePartition(
    target: RuntimeActivationTarget,
  ): Promise<void> {
    this.failedClosedTargets.push(structuredClone(target));
  }
}

type Fixture = Awaited<ReturnType<typeof setup>>;

async function setup(input?: {
  fault?: ConstructorParameters<typeof RuntimeActivationCoordinator>[0][
    "faultInjector"
  ];
  installer?: RuntimeRegistryInstaller;
  session?: SessionVerifier;
}) {
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
  resources.push(configuration, runtime);
  const restart = new FakeControlledCoreRestartPort();
  const installer = input?.installer ?? new FakeRuntimeRegistryInstaller();
  const session = input?.session ?? new SessionVerifier();
  const materializer = new EnterpriseRegistryMaterializer({
    source: new PersistenceEnterpriseRuntimeRegistrySource(configuration),
    sessionVerifier: session,
    compatibility: {
      desktopVersion: "0.0.0",
      coreVersion: "0.0.0",
      supportsContractVersion: (version) => version === "v1alpha1",
      isDesktopCompatible: () => true,
      isCoreCompatible: () => true,
    },
  });
  const fixture = {
    clock,
    configuration,
    runtime,
    restart,
    installer,
    session,
    materializer,
    coordinator: undefined as unknown as RuntimeActivationCoordinator,
  };
  fixture.coordinator = coordinator(fixture, input?.fault);
  return fixture;
}

function coordinator(
  fixture: Omit<Fixture, "coordinator"> | Fixture,
  fault?: ConstructorParameters<typeof RuntimeActivationCoordinator>[0][
    "faultInjector"
  ],
): RuntimeActivationCoordinator {
  return new RuntimeActivationCoordinator({
    materializer: fixture.materializer,
    persistence: fixture.runtime,
    restart: fixture.restart,
    installer: fixture.installer,
    clock: fixture.clock,
    ...(fault === undefined ? {} : { faultInjector: fault }),
  });
}

async function activateConfiguration(
  fixture: Fixture,
  marker: string,
  expectedActiveRevision?: string,
) {
  const source = createEnterpriseConfigurationFixture({ marker });
  const result = await new ConfigurationActivationCoordinator({
    persistence: fixture.configuration,
  }).activate({
    scope: enterpriseScope,
    snapshot: source.snapshot,
    packages: source.packages,
    ...(expectedActiveRevision === undefined
      ? {}
      : { expectedActiveRevision }),
    now: `2026-07-27T${marker === "one" ? "00" : "01"}:00:00.000Z`,
  });
  if (!result.ok) throw new Error(result.error.code);
  const materialization = await fixture.materializer.materialize(
    enterpriseScope,
  );
  return {
    ...materialization.generation,
    registryRevision: materialization.registrySnapshot.registryRevision,
  };
}
