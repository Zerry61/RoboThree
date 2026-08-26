import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FakeClock,
  SqliteEnterpriseConfigurationPersistence,
  enterpriseConfigurationSqliteMigrations,
  type EnterpriseConfigurationPersistence,
} from "../src/index.js";
import {
  createEnterpriseConfigurationFixture,
  enterpriseScope,
} from "./enterprise-configuration.fixtures.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("CGF-1.2B SQLite enterprise configuration persistence", () => {
  it("uses a separate database and preserves activation across reopen", async () => {
    const databasePath = temporaryDatabasePath();
    const persistence = createPersistence(databasePath);
    await persistence.start();
    const first = createEnterpriseConfigurationFixture({ marker: "one" });
    await stageSealActivate(persistence, first);
    await persistence.stop();

    const reopened = createPersistence(databasePath);
    await reopened.start();
    expect((await reopened.loadActive(enterpriseScope))
      ?.configuration.identity.snapshotId).toBe("snapshot.one");
    expect(await reopened.loadStatusEventsAfter(enterpriseScope, 0))
      .toHaveLength(1);
    await reopened.stop();

    const database = new DatabaseSync(databasePath);
    const migrations = database.prepare(`
      SELECT migration_id, name, checksum
      FROM enterprise_configuration_schema_migrations
      ORDER BY migration_id
    `).all() as Record<string, unknown>[];
    expect(migrations).toEqual([
      expect.objectContaining({
        migration_id: 1,
        name: "enterprise-config-V1",
        checksum: enterpriseConfigurationSqliteMigrations[0]?.checksum,
      }),
      expect.objectContaining({
        migration_id: 2,
        name: "enterprise-config-V2",
        checksum: enterpriseConfigurationSqliteMigrations[1]?.checksum,
      }),
      expect.objectContaining({
        migration_id: 3,
        name: "enterprise-config-V3-runtime-activation",
        checksum: enterpriseConfigurationSqliteMigrations[2]?.checksum,
      }),
    ]);
    expect(database.prepare(`
      SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = 'task_heads'
    `).get()).toBeUndefined();
    database.close();
  });

  it("turns a post-commit response loss into one durable activation", async () => {
    const databasePath = temporaryDatabasePath();
    let inject = true;
    const persistence = createPersistence(databasePath, (point) => {
      if (point === "after_activation_commit_before_response" && inject) {
        inject = false;
        throw new Error("lost response");
      }
    });
    await persistence.start();
    const fixture = createEnterpriseConfigurationFixture();
    await stageAndSeal(persistence, fixture);
    await expect(persistence.activateSealedCandidate({
      candidateKey: fixture.materialized.identity.candidateKey,
      scope: enterpriseScope,
      activatedAt: "2026-07-25T00:02:00.000Z",
    })).rejects.toThrow("lost response");
    expect(await persistence.activateSealedCandidate({
      candidateKey: fixture.materialized.identity.candidateKey,
      scope: enterpriseScope,
      activatedAt: "2026-07-25T00:02:00.000Z",
    })).toMatchObject({ ok: true, replayed: true });
    expect(await persistence.loadStatusEventsAfter(enterpriseScope, 0))
      .toHaveLength(1);
    await persistence.stop();
  });

  it("fails closed on a newer independent schema", async () => {
    const databasePath = temporaryDatabasePath();
    const persistence = createPersistence(databasePath);
    await persistence.start();
    await persistence.stop();
    const database = new DatabaseSync(databasePath);
    database.prepare(`
      INSERT INTO enterprise_configuration_schema_migrations (
        migration_id, name, checksum, applied_at
      ) VALUES (4, 'future', ?, ?)
    `).run("f".repeat(64), "2026-07-25T00:00:00.000Z");
    database.close();
    await expect(createPersistence(databasePath).start())
      .rejects.toThrow(/newer than supported/u);
  });

  it("upgrades an accepted V1 database forward without rewriting V1", async () => {
    const databasePath = temporaryDatabasePath();
    const v1 = enterpriseConfigurationSqliteMigrations[0];
    if (v1 === undefined) throw new Error("V1 migration fixture is missing");
    const database = new DatabaseSync(databasePath);
    database.exec(v1.sql);
    database.prepare(`
      INSERT INTO enterprise_configuration_schema_migrations (
        migration_id, name, checksum, applied_at
      ) VALUES (?, ?, ?, ?)
    `).run(v1.id, v1.name, v1.checksum, "2026-07-25T00:00:00.000Z");
    database.close();

    const upgraded = createPersistence(databasePath);
    await upgraded.start();
    expect(await upgraded.loadSyncFacts(enterpriseScope)).toEqual({});
    await upgraded.stop();

    const verified = new DatabaseSync(databasePath);
    const rows = verified.prepare(`
      SELECT migration_id, name, checksum
      FROM enterprise_configuration_schema_migrations
      ORDER BY migration_id
    `).all() as Record<string, unknown>[];
    expect(rows[0]).toEqual(expect.objectContaining({
      migration_id: v1.id,
      name: v1.name,
      checksum: v1.checksum,
    }));
    expect(rows[1]).toEqual(expect.objectContaining({
      migration_id: 2,
      name: "enterprise-config-V2",
    }));
    verified.close();
  });

  it("fails closed when an independently required table is missing", async () => {
    const databasePath = temporaryDatabasePath();
    const persistence = createPersistence(databasePath);
    await persistence.start();
    await persistence.stop();
    const database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = OFF");
    database.exec("DROP TABLE enterprise_configuration_status_events");
    database.close();
    await expect(createPersistence(databasePath).start())
      .rejects.toThrow(/missing table/u);
  });
});

function createPersistence(
  databasePath: string,
  faultInjector?: ConstructorParameters<
    typeof SqliteEnterpriseConfigurationPersistence
  >[0]["faultInjector"],
): SqliteEnterpriseConfigurationPersistence {
  return new SqliteEnterpriseConfigurationPersistence({
    databasePath,
    clock: new FakeClock("2026-07-25T00:00:00.000Z"),
    ...(faultInjector === undefined ? {} : { faultInjector }),
  });
}

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "robothree-enterprise-config-"));
  directories.push(directory);
  return join(directory, "enterprise-configuration.sqlite");
}

async function stageSealActivate(
  persistence: EnterpriseConfigurationPersistence,
  fixture: ReturnType<typeof createEnterpriseConfigurationFixture>,
): Promise<void> {
  await stageAndSeal(persistence, fixture);
  expect((await persistence.activateSealedCandidate({
    candidateKey: fixture.materialized.identity.candidateKey,
    scope: fixture.materialized.identity.scope,
    activatedAt: "2026-07-25T00:02:00.000Z",
  })).ok).toBe(true);
}

async function stageAndSeal(
  persistence: EnterpriseConfigurationPersistence,
  fixture: ReturnType<typeof createEnterpriseConfigurationFixture>,
): Promise<void> {
  expect((await persistence.beginOrResumeCandidate({
    identity: fixture.materialized.identity,
    snapshot: fixture.snapshot,
    createdAt: "2026-07-25T00:00:00.000Z",
  })).ok).toBe(true);
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
