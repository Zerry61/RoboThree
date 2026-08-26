import { describe, expect, it } from "vitest";

import {
  ConfigurationActivationCoordinator,
  FakeClock,
  InMemoryEnterpriseConfigurationPersistence,
} from "../src/index.js";
import {
  createEnterpriseConfigurationFixture,
  enterpriseScope,
  otherEnterpriseScope,
} from "./enterprise-configuration.fixtures.js";

describe("CGF-1.2B InMemory enterprise configuration persistence", () => {
  it("stages, seals, atomically activates and preserves previous", async () => {
    const persistence = new InMemoryEnterpriseConfigurationPersistence({
      clock: new FakeClock("2026-07-25T00:00:00.000Z"),
    });
    await persistence.start();
    const first = createEnterpriseConfigurationFixture({ marker: "one" });
    await stageAndSeal(persistence, first);
    const activated = await persistence.activateSealedCandidate({
      candidateKey: first.materialized.identity.candidateKey,
      scope: enterpriseScope,
      activatedAt: "2026-07-25T00:02:00.000Z",
    });
    expect(activated.ok).toBe(true);

    const second = createEnterpriseConfigurationFixture({ marker: "two" });
    await stageAndSeal(persistence, second);
    const secondActivation = await persistence.activateSealedCandidate({
      candidateKey: second.materialized.identity.candidateKey,
      scope: enterpriseScope,
      expectedActiveRevision: first.snapshot.document.revision,
      activatedAt: "2026-07-25T00:03:00.000Z",
    });
    expect(secondActivation.ok).toBe(true);
    expect((await persistence.loadActive(enterpriseScope))
      ?.configuration.identity.snapshotId).toBe("snapshot.two");
    expect((await persistence.loadPrevious(enterpriseScope))
      ?.configuration.identity.snapshotId).toBe("snapshot.one");
    expect(await persistence.loadStatusEventsAfter(enterpriseScope, 0))
      .toHaveLength(2);
  });

  it("recovers an activation response loss as an idempotent replay", async () => {
    let failAfterCommit = true;
    const persistence = new InMemoryEnterpriseConfigurationPersistence({
      clock: new FakeClock("2026-07-25T00:00:00.000Z"),
      faultInjector: (point) => {
        if (point === "after_activation_commit_before_response" && failAfterCommit) {
          failAfterCommit = false;
          throw new Error("injected response loss");
        }
      },
    });
    await persistence.start();
    const fixture = createEnterpriseConfigurationFixture();
    await stageAndSeal(persistence, fixture);
    await expect(persistence.activateSealedCandidate({
      candidateKey: fixture.materialized.identity.candidateKey,
      scope: enterpriseScope,
      activatedAt: "2026-07-25T00:02:00.000Z",
    })).rejects.toThrow("injected response loss");
    const replay = await persistence.activateSealedCandidate({
      candidateKey: fixture.materialized.identity.candidateKey,
      scope: enterpriseScope,
      activatedAt: "2026-07-25T00:02:00.000Z",
    });
    expect(replay).toMatchObject({ ok: true, replayed: true });
    expect(await persistence.loadStatusEventsAfter(enterpriseScope, 0))
      .toHaveLength(1);
  });

  it("isolates identical snapshot facts across enterprise scopes", async () => {
    const persistence = new InMemoryEnterpriseConfigurationPersistence({
      clock: new FakeClock("2026-07-25T00:00:00.000Z"),
    });
    await persistence.start();
    const first = createEnterpriseConfigurationFixture();
    const other = createEnterpriseConfigurationFixture({
      scope: otherEnterpriseScope,
    });
    expect(first.materialized.identity.candidateKey)
      .not.toBe(other.materialized.identity.candidateKey);
    await stageAndSeal(persistence, first);
    const wrongScope = await persistence.activateSealedCandidate({
      candidateKey: first.materialized.identity.candidateKey,
      scope: otherEnterpriseScope,
      activatedAt: "2026-07-25T00:02:00.000Z",
    });
    expect(wrongScope).toMatchObject({
      ok: false,
      error: { code: "configuration.scope_mismatch" },
    });
  });

  it("serializes same-scope Storage Activation and rejects the stale writer", async () => {
    const persistence = new InMemoryEnterpriseConfigurationPersistence({
      clock: new FakeClock("2026-07-25T00:00:00.000Z"),
    });
    await persistence.start();
    const coordinator = new ConfigurationActivationCoordinator({ persistence });
    const first = createEnterpriseConfigurationFixture({ marker: "one" });
    const second = createEnterpriseConfigurationFixture({ marker: "two" });
    const [firstResult, secondResult] = await Promise.all([
      coordinator.activate({
        scope: enterpriseScope,
        snapshot: first.snapshot,
        packages: first.packages,
        now: "2026-07-25T00:02:00.000Z",
      }),
      coordinator.activate({
        scope: enterpriseScope,
        snapshot: second.snapshot,
        packages: second.packages,
        now: "2026-07-25T00:03:00.000Z",
      }),
    ]);
    expect(firstResult.ok).toBe(true);
    expect(secondResult).toMatchObject({
      ok: false,
      error: { code: "configuration.activation_conflict" },
    });
    expect((await persistence.loadActive(enterpriseScope))
      ?.configuration.identity.snapshotId).toBe("snapshot.one");
  });
});

async function stageAndSeal(
  persistence: InMemoryEnterpriseConfigurationPersistence,
  fixture: ReturnType<typeof createEnterpriseConfigurationFixture>,
): Promise<void> {
  const begun = await persistence.beginOrResumeCandidate({
    identity: fixture.materialized.identity,
    snapshot: fixture.snapshot,
    createdAt: "2026-07-25T00:00:00.000Z",
  });
  expect(begun.ok).toBe(true);
  for (const item of fixture.packages) {
    expect((await persistence.storeValidatedPackage({
      candidateKey: fixture.materialized.identity.candidateKey,
      scope: fixture.materialized.identity.scope,
      package: item,
    })).ok).toBe(true);
  }
  expect((await persistence.sealCandidate({
    candidateKey: fixture.materialized.identity.candidateKey,
    scope: fixture.materialized.identity.scope,
    configuration: fixture.materialized,
  })).ok).toBe(true);
}
