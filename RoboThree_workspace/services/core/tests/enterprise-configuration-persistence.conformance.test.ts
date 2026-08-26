import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FakeClock,
  InMemoryEnterpriseConfigurationPersistence,
  SqliteEnterpriseConfigurationPersistence,
  type EnterpriseConfigurationPersistence,
} from "../src/index.js";
import {
  createEnterpriseConfigurationFixture,
  enterpriseScope,
  otherEnterpriseScope,
} from "./enterprise-configuration.fixtures.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const variants: readonly [
  string,
  () => EnterpriseConfigurationPersistence,
][] = [
  [
    "InMemory",
    () => new InMemoryEnterpriseConfigurationPersistence({
      clock: new FakeClock("2026-07-25T00:00:00.000Z"),
    }),
  ],
  [
    "SQLite",
    () => {
      const directory = mkdtempSync(
        join(tmpdir(), "robothree-config-conformance-"),
      );
      directories.push(directory);
      return new SqliteEnterpriseConfigurationPersistence({
        databasePath: join(directory, "enterprise-configuration.sqlite"),
        clock: new FakeClock("2026-07-25T00:00:00.000Z"),
      });
    },
  ],
];

describe.each(variants)(
  "CGF-1.2B %s persistence Conformance",
  (_name, create) => {
    it("makes begin, package, seal and activation idempotent", async () => {
      const persistence = create();
      await persistence.start();
      const fixture = createEnterpriseConfigurationFixture();
      const beginInput = {
        identity: fixture.materialized.identity,
        snapshot: fixture.snapshot,
        createdAt: "2026-07-25T00:00:00.000Z",
      };
      expect(await persistence.beginOrResumeCandidate(beginInput))
        .toMatchObject({ ok: true, replayed: false });
      expect(await persistence.beginOrResumeCandidate(beginInput))
        .toMatchObject({ ok: true, replayed: true });
      for (const item of fixture.packages) {
        const packageInput = {
          candidateKey: fixture.materialized.identity.candidateKey,
          scope: enterpriseScope,
          package: item,
        };
        expect(await persistence.storeValidatedPackage(packageInput))
          .toMatchObject({ ok: true, replayed: false });
        expect(await persistence.storeValidatedPackage(packageInput))
          .toMatchObject({ ok: true, replayed: true });
      }
      const sealInput = {
        candidateKey: fixture.materialized.identity.candidateKey,
        scope: enterpriseScope,
        configuration: fixture.materialized,
      };
      expect(await persistence.sealCandidate(sealInput))
        .toMatchObject({ ok: true, replayed: false });
      expect(await persistence.sealCandidate(sealInput))
        .toMatchObject({ ok: true, replayed: true });
      const activationInput = {
        candidateKey: fixture.materialized.identity.candidateKey,
        scope: enterpriseScope,
        activatedAt: "2026-07-25T00:02:00.000Z",
      };
      expect(await persistence.activateSealedCandidate(activationInput))
        .toMatchObject({ ok: true, replayed: false });
      expect(await persistence.activateSealedCandidate(activationInput))
        .toMatchObject({ ok: true, replayed: true });
      await persistence.stop();
    });

    it("rejects the same snapshot revision with a different digest", async () => {
      const persistence = create();
      await persistence.start();
      const fixture = createEnterpriseConfigurationFixture();
      expect((await persistence.beginOrResumeCandidate({
        identity: fixture.materialized.identity,
        snapshot: fixture.snapshot,
        createdAt: "2026-07-25T00:00:00.000Z",
      })).ok).toBe(true);
      const conflict = await persistence.beginOrResumeCandidate({
        identity: {
          ...fixture.materialized.identity,
          candidateKey: "0".repeat(64),
          snapshotDigest: "1".repeat(64),
        },
        snapshot: fixture.snapshot,
        createdAt: "2026-07-25T00:01:00.000Z",
      });
      expect(conflict).toMatchObject({
        ok: false,
        error: { code: "configuration.persistence_conflict" },
      });
      await persistence.stop();
    });

    it("fails closed on an incomplete seal and stale activation CAS", async () => {
      const persistence = create();
      await persistence.start();
      const first = createEnterpriseConfigurationFixture({ marker: "one" });
      await beginAndStore(persistence, first, 1);
      expect(await persistence.sealCandidate({
        candidateKey: first.materialized.identity.candidateKey,
        scope: enterpriseScope,
        configuration: first.materialized,
      })).toMatchObject({
        ok: false,
        error: { code: "configuration.candidate_incomplete" },
      });
      await persistence.storeValidatedPackage({
        candidateKey: first.materialized.identity.candidateKey,
        scope: enterpriseScope,
        package: first.packages[1]!,
      });
      expect(await persistence.sealCandidate({
        candidateKey: first.materialized.identity.candidateKey,
        scope: enterpriseScope,
        configuration: {
          ...first.materialized,
          materializationDigest: "0".repeat(64),
        },
      })).toMatchObject({
        ok: false,
        error: { code: "configuration.persistence_conflict" },
      });
      await persistence.sealCandidate({
        candidateKey: first.materialized.identity.candidateKey,
        scope: enterpriseScope,
        configuration: first.materialized,
      });
      expect(await persistence.activateSealedCandidate({
        candidateKey: first.materialized.identity.candidateKey,
        scope: enterpriseScope,
        expectedActiveRevision: "f".repeat(64),
        activatedAt: "2026-07-25T00:02:00.000Z",
      })).toMatchObject({
        ok: false,
        error: { code: "configuration.activation_conflict" },
      });
      await persistence.stop();
    });

    it("discards only unsealed candidates and reports bounded diagnostics", async () => {
      const persistence = create();
      await persistence.start();
      const fixture = createEnterpriseConfigurationFixture();
      await beginAndStore(persistence, fixture, 0);
      expect(await persistence.discardUnsealedCandidate(
        fixture.materialized.identity.candidateKey,
        enterpriseScope,
      )).toMatchObject({ ok: true, replayed: false, value: true });
      expect(await persistence.discardUnsealedCandidate(
        fixture.materialized.identity.candidateKey,
        enterpriseScope,
      )).toMatchObject({ ok: true, replayed: true, value: false });
      expect(await persistence.diagnostics(enterpriseScope)).toMatchObject({
        candidateCount: 0,
        unsealedCandidateCount: 0,
      });
      expect(await persistence.loadActive(otherEnterpriseScope)).toBeUndefined();
      await persistence.stop();
    });

    it("persists safe sync facts without erasing the last successful sync", async () => {
      const persistence = create();
      await persistence.start();
      expect(await persistence.loadSyncFacts(enterpriseScope)).toEqual({});
      expect(await persistence.recordSyncOutcome({
        scope: enterpriseScope,
        outcome: "succeeded",
        occurredAt: "2026-07-26T00:00:00.000Z",
      })).toMatchObject({
        ok: true,
        value: {
          lastSuccessfulSyncAt: "2026-07-26T00:00:00.000Z",
        },
      });
      expect(await persistence.recordSyncOutcome({
        scope: enterpriseScope,
        outcome: "failed",
        errorCode: "configuration.client_offline",
        occurredAt: "2026-07-26T00:01:00.000Z",
      })).toMatchObject({
        ok: true,
        value: {
          lastSuccessfulSyncAt: "2026-07-26T00:00:00.000Z",
          lastErrorCode: "configuration.client_offline",
        },
      });
      expect(await persistence.loadStatusEventsAfter(enterpriseScope, 0))
        .toMatchObject([
          { sequence: 1, type: "sync_succeeded" },
          {
            sequence: 2,
            type: "sync_failed",
            errorCode: "configuration.client_offline",
          },
        ]);
      await persistence.stop();
    });
  },
);

async function beginAndStore(
  persistence: EnterpriseConfigurationPersistence,
  fixture: ReturnType<typeof createEnterpriseConfigurationFixture>,
  packageCount: number,
): Promise<void> {
  await persistence.beginOrResumeCandidate({
    identity: fixture.materialized.identity,
    snapshot: fixture.snapshot,
    createdAt: "2026-07-25T00:00:00.000Z",
  });
  for (const item of fixture.packages.slice(0, packageCount)) {
    await persistence.storeValidatedPackage({
      candidateKey: fixture.materialized.identity.candidateKey,
      scope: fixture.materialized.identity.scope,
      package: item,
    });
  }
}
