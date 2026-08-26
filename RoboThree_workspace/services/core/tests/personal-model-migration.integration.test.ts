import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  LATEST_SQLITE_SCHEMA_VERSION,
  SqlitePersonalModelPersistence,
  configureSqlite,
  createPersonalModelOwnerNamespace,
  sqliteMigrations,
} from "../src/index.js";

const at = "2026-08-21T03:00:00.000Z";

describe("DFI-4A.1 migration 23", () => {
  it("creates all seven STRICT tables, constraints and bounded indexes", async () => {
    await withDatabase(async (databasePath) => {
      const persistence = new SqlitePersonalModelPersistence({
        databasePath,
        clock: new FakeClock(at),
      });
      await persistence.start();
      await persistence.stop();
      const database = new DatabaseSync(databasePath, { readOnly: true });
      try {
        const migration = database.prepare(
          "SELECT name FROM schema_migrations WHERE migration_id = 23",
        ).get() as { name: string };
        expect(migration.name).toBe("dfi_4a1_personal_model_foundation");
        expect(LATEST_SQLITE_SCHEMA_VERSION).toBe(26);
        const tables = database.prepare(`
          SELECT name, sql FROM sqlite_master
          WHERE type = 'table' AND name LIKE 'personal_model_%' ORDER BY name
        `).all() as { name: string; sql: string }[];
        expect(tables).toHaveLength(7);
        expect(tables.every((table) => table.sql.trimEnd().endsWith("STRICT"))).toBe(true);
        const indexes = database.prepare(`
          SELECT name FROM sqlite_master
          WHERE type = 'index' AND name LIKE 'personal_model_%_idx'
        `).all() as { name: string }[];
        expect(indexes.map((row) => row.name)).toEqual(expect.arrayContaining([
          "personal_model_owner_scope_one_active_idx",
          "personal_model_definitions_owner_created_idx",
          "personal_model_heads_active_idx",
          "personal_model_status_latest_idx",
          "personal_model_operations_pending_idx",
          "personal_model_receipts_committed_idx",
        ]));
      } finally {
        database.close();
      }
    });
  });

  it("upgrades a real migration 22 database without rewriting history", async () => {
    await withDatabase(async (databasePath) => {
      const database = new DatabaseSync(databasePath, { allowExtension: false });
      configureSqlite(database);
      for (const migration of sqliteMigrations.filter((item) => item.id <= 22)) {
        database.exec(migration.sql);
        database.prepare(
          "INSERT INTO schema_migrations (migration_id, name, applied_at) VALUES (?, ?, ?)",
        ).run(migration.id, migration.name, at);
      }
      const history = database.prepare(
        "SELECT migration_id, name FROM schema_migrations ORDER BY migration_id",
      ).all();
      database.close();

      const persistence = new SqlitePersonalModelPersistence({
        databasePath,
        clock: new FakeClock(at),
      });
      await persistence.start();
      await persistence.stop();
      const inspection = new DatabaseSync(databasePath, { readOnly: true });
      try {
        expect(inspection.prepare(
          "SELECT migration_id, name FROM schema_migrations WHERE migration_id <= 22 ORDER BY migration_id",
        ).all()).toEqual(history);
        expect((inspection.prepare(
          "SELECT COUNT(*) AS count FROM schema_migrations",
        ).get() as { count: number }).count).toBe(26);
      } finally {
        inspection.close();
      }
    });
  });

  it("fails closed after namespace key corruption and does not generate a replacement", async () => {
    await withDatabase(async (databasePath) => {
      const persistence = new SqlitePersonalModelPersistence({
        databasePath,
        clock: new FakeClock(at),
      });
      await persistence.start();
      const namespace = createPersonalModelOwnerNamespace({
        namespaceRevision: 1,
        namespaceKey: Buffer.alloc(32, 3),
        createdAt: at,
      });
      expect(await persistence.initializeOwnerNamespace(namespace)).toMatchObject({ ok: true });
      await persistence.stop();
      const database = new DatabaseSync(databasePath);
      database.prepare(`
        UPDATE personal_model_owner_scope_namespaces SET namespace_key = ? WHERE namespace_revision = 1
      `).run(Buffer.alloc(32, 4));
      database.close();
      const reopened = new SqlitePersonalModelPersistence({
        databasePath,
        clock: new FakeClock(at),
      });
      await expect(reopened.start()).rejects.toThrow("personal_model.owner_namespace_key_check_invalid");
      const inspection = new DatabaseSync(databasePath, { readOnly: true });
      expect((inspection.prepare(
        "SELECT COUNT(*) AS count FROM personal_model_owner_scope_namespaces",
      ).get() as { count: number }).count).toBe(1);
      inspection.close();
    });
  });
});

async function withDatabase(operation: (databasePath: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi4a1-migration-"));
  try {
    await operation(join(directory, "core.sqlite"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
