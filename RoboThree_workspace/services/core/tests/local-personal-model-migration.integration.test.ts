import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  LATEST_SQLITE_SCHEMA_VERSION,
  SqliteLocalPersonalModelInvocationPersistence,
  configureSqlite,
  sqliteMigrations,
} from "../src/index.js";

const at = "2026-08-21T09:30:00.000Z";

describe("DFI-4A.3.1 migration 24 plus timeout migration 25", () => {
  it("keeps migration 24 and creates the additive timeout STRICT table", async () => {
    await withDatabase(async (databasePath) => {
      const persistence = new SqliteLocalPersonalModelInvocationPersistence({
        databasePath, clock: new FakeClock(at),
      });
      await persistence.start();
      await persistence.stop();
      const database = new DatabaseSync(databasePath, { readOnly: true });
      try {
        expect(LATEST_SQLITE_SCHEMA_VERSION).toBe(26);
        expect(database.prepare(
          "SELECT name FROM schema_migrations WHERE migration_id = 24",
        ).get()).toEqual({ name: "dfi_4a3_local_personal_model_invocations" });
        expect(database.prepare(
          "SELECT name FROM schema_migrations WHERE migration_id = 25",
        ).get()).toEqual({ name: "dfi_4a31_local_personal_invocation_timeout_facts" });
        const tables = database.prepare(`
          SELECT name, sql FROM sqlite_master WHERE type='table'
            AND name LIKE 'local_personal_%' ORDER BY name
        `).all() as { name: string; sql: string }[];
        expect(tables).toHaveLength(3);
        expect(tables.every((table) => table.sql.trimEnd().endsWith("STRICT"))).toBe(true);
      } finally { database.close(); }
    });
  });

  it("upgrades migration 23 without rewriting its history", async () => {
    await withDatabase(async (databasePath) => {
      const database = new DatabaseSync(databasePath);
      configureSqlite(database);
      for (const migration of sqliteMigrations.filter((item) => item.id <= 23)) {
        database.exec(migration.sql);
        database.prepare(
          "INSERT INTO schema_migrations (migration_id, name, applied_at) VALUES (?, ?, ?)",
        ).run(migration.id, migration.name, at);
      }
      const before = database.prepare(
        "SELECT migration_id, name FROM schema_migrations WHERE migration_id <= 23 ORDER BY migration_id",
      ).all();
      database.close();
      const persistence = new SqliteLocalPersonalModelInvocationPersistence({
        databasePath, clock: new FakeClock(at),
      });
      await persistence.start();
      await persistence.stop();
      const inspection = new DatabaseSync(databasePath, { readOnly: true });
      expect(inspection.prepare(
        "SELECT migration_id, name FROM schema_migrations WHERE migration_id <= 23 ORDER BY migration_id",
      ).all()).toEqual(before);
      inspection.close();
    });
  });

  it("upgrades an exact migration 24 database without rewriting its history", async () => {
    await withDatabase(async (databasePath) => {
      const database = new DatabaseSync(databasePath);
      configureSqlite(database);
      for (const migration of sqliteMigrations.filter((item) => item.id <= 24)) {
        database.exec(migration.sql);
        database.prepare(
          "INSERT INTO schema_migrations (migration_id, name, applied_at) VALUES (?, ?, ?)",
        ).run(migration.id, migration.name, at);
      }
      const before = database.prepare(
        "SELECT migration_id, name FROM schema_migrations WHERE migration_id <= 24 ORDER BY migration_id",
      ).all();
      database.close();
      const persistence = new SqliteLocalPersonalModelInvocationPersistence({
        databasePath, clock: new FakeClock(at),
      });
      await persistence.start();
      await persistence.stop();
      const inspection = new DatabaseSync(databasePath, { readOnly: true });
      expect(inspection.prepare(
        "SELECT migration_id, name FROM schema_migrations WHERE migration_id <= 24 ORDER BY migration_id",
      ).all()).toEqual(before);
      expect(inspection.prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?",
      ).get("local_personal_invocation_timeout_facts")).toEqual({ present: 1 });
      inspection.close();
    });
  });
});

async function withDatabase(operation: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi4a31-migration-"));
  try { await operation(join(directory, "core.sqlite")); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
