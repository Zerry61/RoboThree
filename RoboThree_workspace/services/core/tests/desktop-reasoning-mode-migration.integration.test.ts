import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  LATEST_SQLITE_SCHEMA_VERSION,
  SqliteDesktopReasoningModePreferencePersistence,
  configureSqlite,
  createDesktopExperienceOwnerNamespace,
  sqliteMigrations,
} from "../src/index.js";

const at = "2026-08-25T05:00:00.000Z";

describe("DFI-5.1 migration 26", () => {
  it("adds exactly three constrained STRICT tables and preserves migration 1-25 history", async () => {
    await withDatabase(async (databasePath) => {
      const database = new DatabaseSync(databasePath);
      configureSqlite(database);
      for (const migration of sqliteMigrations.filter((item) => item.id <= 25)) {
        database.exec(migration.sql);
        database.prepare(
          "INSERT INTO schema_migrations (migration_id, name, applied_at) VALUES (?, ?, ?)",
        ).run(migration.id, migration.name, at);
      }
      const history = database.prepare(
        "SELECT migration_id, name FROM schema_migrations WHERE migration_id <= 25 ORDER BY migration_id",
      ).all();
      database.close();

      const persistence = new SqliteDesktopReasoningModePreferencePersistence({
        databasePath, clock: new FakeClock(at),
      });
      await persistence.start();
      await persistence.stop();

      const inspection = new DatabaseSync(databasePath, { readOnly: true });
      expect(LATEST_SQLITE_SCHEMA_VERSION).toBe(26);
      expect(inspection.prepare(
        "SELECT migration_id, name FROM schema_migrations WHERE migration_id <= 25 ORDER BY migration_id",
      ).all()).toEqual(history);
      expect(inspection.prepare(
        "SELECT name FROM schema_migrations WHERE migration_id = 26",
      ).get()).toEqual({ name: "dfi_5_reasoning_mode_experience_preference" });
      const tables = inspection.prepare(`
        SELECT name, sql FROM sqlite_master WHERE type='table'
          AND (name='desktop_experience_owner_scope_namespaces'
            OR name='desktop_reasoning_mode_preferences'
            OR name='desktop_reasoning_mode_preference_receipts') ORDER BY name
      `).all() as { name: string; sql: string }[];
      expect(tables).toHaveLength(3);
      expect(tables.every((table) => table.sql.trimEnd().endsWith("STRICT"))).toBe(true);
      inspection.close();
    });
  });

  it("fails closed after independent namespace key corruption", async () => {
    await withDatabase(async (databasePath) => {
      const persistence = new SqliteDesktopReasoningModePreferencePersistence({
        databasePath, clock: new FakeClock(at),
      });
      await persistence.start();
      expect(await persistence.initializeOwnerNamespace(createDesktopExperienceOwnerNamespace({
        namespaceRevision: 1,
        namespaceKey: Buffer.alloc(32, 5),
        createdAt: at,
      }))).toMatchObject({ ok: true });
      await persistence.stop();
      const database = new DatabaseSync(databasePath);
      database.prepare(`
        UPDATE desktop_experience_owner_scope_namespaces SET namespace_key = ?
        WHERE owner_scope_namespace_revision = 1
      `).run(Buffer.alloc(32, 6));
      database.close();
      const reopened = new SqliteDesktopReasoningModePreferencePersistence({
        databasePath, clock: new FakeClock(at),
      });
      await expect(reopened.start()).rejects.toThrow("reasoning_mode.owner_namespace_key_check_invalid");
    });
  });
});

async function withDatabase(operation: (databasePath: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi51-migration-"));
  try { await operation(join(directory, "core.sqlite")); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
