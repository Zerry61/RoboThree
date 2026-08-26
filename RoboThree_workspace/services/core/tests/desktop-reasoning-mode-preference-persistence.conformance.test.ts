import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  InMemoryDesktopReasoningModePreferencePersistence,
  ReasoningModePreferenceService,
  SqliteDesktopReasoningModePreferencePersistence,
  resolveDesktopReasoningModeOwner,
} from "../src/index.js";
import type {
  DesktopReasoningModeOwnerAuthorityProvider,
  DesktopReasoningModePreferencePersistence,
} from "../src/index.js";

const at = "2026-08-25T05:00:00.000Z";
const authority: DesktopReasoningModeOwnerAuthorityProvider = {
  resolve: async () => ({
    state: "available",
    enterpriseId: "enterprise.fixture",
    userId: "user.fixture",
    deviceId: "device.fixture",
    currentClientInstanceId: "019f7447-a784-77b2-a716-000000005203",
    authoritySource: "test_only",
    testIdentityUsed: true,
    productionIdentityReady: false,
  }),
};

describe.each(["memory", "sqlite"] as const)("DFI-5.1 %s preference persistence", (kind) => {
  it("atomically commits, exactly replays, conflicts on changed material and enforces CAS", async () => {
    const harness = await createHarness(kind);
    try {
      const service = new ReasoningModePreferenceService({
        persistence: harness.persistence,
        ownerAuthority: authority,
        clock: new FakeClock(at),
      });
      const command = {
        contractVersion: "v1alpha3" as const,
        commandId: "019f7447-a784-77b2-a716-000000005201",
        correlationId: "019f7447-a784-77b2-a716-000000005202",
        clientInstanceId: "019f7447-a784-77b2-a716-000000005203",
        type: "update_reasoning_mode_preference" as const,
        expectedPreferenceRevision: 0,
        requestedMode: "max" as const,
      };
      const committed = await service.update(command);
      expect(committed).toMatchObject({ ok: true, replayed: false, receipt: {
        requestedMode: "max", committedPreferenceRevision: 1,
      } });
      expect(await service.update(command)).toMatchObject({ ok: true, replayed: true });
      expect(await service.update({ ...command, requestedMode: "default" }))
        .toEqual({ ok: false, error: { code: "reasoning_mode.preference_conflict" } });
      expect(await service.update({
        ...command,
        commandId: "019f7447-a784-77b2-a716-000000005204",
        requestedMode: "default",
      })).toEqual({ ok: false, error: { code: "reasoning_mode.preference_conflict" } });
    } finally {
      await harness.cleanup();
    }
  });

  it("does not create a durable success Receipt without trusted owner authority", async () => {
    const harness = await createHarness(kind);
    try {
      const service = new ReasoningModePreferenceService({
        persistence: harness.persistence,
        ownerAuthority: {
          resolve: async () => ({
            state: "unavailable", testIdentityUsed: false, productionIdentityReady: false,
          }),
        },
        clock: new FakeClock(at),
      });
      expect(await service.update({
        contractVersion: "v1alpha3",
        commandId: "019f7447-a784-77b2-a716-000000005205",
        correlationId: "019f7447-a784-77b2-a716-000000005206",
        clientInstanceId: "019f7447-a784-77b2-a716-000000005207",
        type: "update_reasoning_mode_preference",
        expectedPreferenceRevision: 0,
        requestedMode: "max",
      })).toEqual({ ok: false, error: { code: "reasoning_mode.preference_unavailable" } });
      expect(await harness.persistence.loadActiveOwnerNamespace()).toBeUndefined();
    } finally {
      await harness.cleanup();
    }
  });

  it("allows exactly one CAS winner for the same expected revision", async () => {
    const harness = await createHarness(kind);
    try {
      const service = new ReasoningModePreferenceService({
        persistence: harness.persistence,
        ownerAuthority: authority,
        clock: new FakeClock(at),
      });
      const base = {
        contractVersion: "v1alpha3" as const,
        correlationId: "019f7447-a784-77b2-a716-000000005208",
        clientInstanceId: "019f7447-a784-77b2-a716-000000005203",
        type: "update_reasoning_mode_preference" as const,
        expectedPreferenceRevision: 0,
      };
      const results = await Promise.all([
        service.update({
          ...base,
          commandId: "019f7447-a784-77b2-a716-000000005210",
          requestedMode: "max",
        }),
        service.update({
          ...base,
          commandId: "019f7447-a784-77b2-a716-000000005211",
          requestedMode: "default",
        }),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([
        { ok: false, error: { code: "reasoning_mode.preference_conflict" } },
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  it("rejects a command after current client session rebind before creating owner facts", async () => {
    const harness = await createHarness(kind);
    try {
      const service = new ReasoningModePreferenceService({
        persistence: harness.persistence,
        ownerAuthority: authority,
        clock: new FakeClock(at),
      });
      await expect(service.update({
        contractVersion: "v1alpha3",
        commandId: "019f7447-a784-77b2-a716-000000005212",
        correlationId: "019f7447-a784-77b2-a716-000000005213",
        clientInstanceId: "019f7447-a784-77b2-a716-000000005214",
        type: "update_reasoning_mode_preference",
        expectedPreferenceRevision: 0,
        requestedMode: "max",
      })).rejects.toThrow("reasoning_mode.owner_session_rebound");
      expect(await harness.persistence.loadActiveOwnerNamespace()).toBeUndefined();
    } finally {
      await harness.cleanup();
    }
  });
});

describe("DFI-5.1 SQLite preference recovery and integrity", () => {
  it("reopens the exact Preference and replays its durable Receipt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dfi51-reopen-"));
    const databasePath = join(directory, "core.sqlite");
    const command = preferenceCommand("019f7447-a784-77b2-a716-000000005220");
    try {
      const first = new SqliteDesktopReasoningModePreferencePersistence({
        databasePath, clock: new FakeClock(at),
      });
      await first.start();
      const firstService = new ReasoningModePreferenceService({
        persistence: first, ownerAuthority: authority, clock: new FakeClock(at),
      });
      await expect(firstService.update(command)).resolves.toMatchObject({ ok: true, replayed: false });
      await first.stop();

      const reopened = new SqliteDesktopReasoningModePreferencePersistence({
        databasePath, clock: new FakeClock(at),
      });
      await reopened.start();
      const owner = await resolveDesktopReasoningModeOwner({
        authorityProvider: authority,
        persistence: reopened,
        clock: new FakeClock(at),
        expectedClientInstanceId: command.clientInstanceId,
      });
      expect(owner).toBeDefined();
      await expect(reopened.loadPreference(owner!.identity)).resolves.toMatchObject({
        preferenceRevision: 1,
        requestedMode: "max",
      });
      await expect(new ReasoningModePreferenceService({
        persistence: reopened, ownerAuthority: authority, clock: new FakeClock(at),
      }).update(command)).resolves.toMatchObject({ ok: true, replayed: true });
      await reopened.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rolls back the Preference when durable Receipt insertion fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dfi51-atomic-"));
    const databasePath = join(directory, "core.sqlite");
    const persistence = new SqliteDesktopReasoningModePreferencePersistence({
      databasePath, clock: new FakeClock(at),
    });
    try {
      await persistence.start();
      await resolveDesktopReasoningModeOwner({
        authorityProvider: authority,
        persistence,
        clock: new FakeClock(at),
        expectedClientInstanceId: authorityClientInstanceId,
      });
      const database = new DatabaseSync(databasePath);
      database.exec(`
        CREATE TRIGGER dfi51_test_abort_receipt
        BEFORE INSERT ON desktop_reasoning_mode_preference_receipts
        BEGIN SELECT RAISE(ABORT, 'dfi51_test_receipt_failure'); END
      `);
      database.close();

      await expect(new ReasoningModePreferenceService({
        persistence, ownerAuthority: authority, clock: new FakeClock(at),
      }).update(preferenceCommand("019f7447-a784-77b2-a716-000000005221")))
        .rejects.toThrow("dfi51_test_receipt_failure");

      const inspection = new DatabaseSync(databasePath, { readOnly: true });
      expect(inspection.prepare("SELECT count(*) AS count FROM desktop_reasoning_mode_preferences").get())
        .toEqual({ count: 0 });
      expect(inspection.prepare("SELECT count(*) AS count FROM desktop_reasoning_mode_preference_receipts").get())
        .toEqual({ count: 0 });
      inspection.close();
    } finally {
      await persistence.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed on Preference record digest corruption", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dfi51-tamper-"));
    const databasePath = join(directory, "core.sqlite");
    const persistence = new SqliteDesktopReasoningModePreferencePersistence({
      databasePath, clock: new FakeClock(at),
    });
    try {
      await persistence.start();
      await new ReasoningModePreferenceService({
        persistence, ownerAuthority: authority, clock: new FakeClock(at),
      }).update(preferenceCommand("019f7447-a784-77b2-a716-000000005222"));
      await persistence.stop();
      const database = new DatabaseSync(databasePath);
      database.prepare("UPDATE desktop_reasoning_mode_preferences SET record_digest = ?")
        .run(`sha256:${"f".repeat(64)}`);
      database.close();

      const reopened = new SqliteDesktopReasoningModePreferencePersistence({
        databasePath, clock: new FakeClock(at),
      });
      await reopened.start();
      const owner = await resolveDesktopReasoningModeOwner({
        authorityProvider: authority,
        persistence: reopened,
        clock: new FakeClock(at),
        expectedClientInstanceId: authorityClientInstanceId,
      });
      await expect(reopened.loadPreference(owner!.identity))
        .rejects.toThrow("record_digest does not match record material");
      await reopened.stop();
    } finally {
      await persistence.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

const authorityClientInstanceId = "019f7447-a784-77b2-a716-000000005203";

function preferenceCommand(commandId: string) {
  return {
    contractVersion: "v1alpha3" as const,
    commandId,
    correlationId: "019f7447-a784-77b2-a716-000000005223",
    clientInstanceId: authorityClientInstanceId,
    type: "update_reasoning_mode_preference" as const,
    expectedPreferenceRevision: 0,
    requestedMode: "max" as const,
  };
}

async function createHarness(kind: "memory" | "sqlite"): Promise<{
  persistence: DesktopReasoningModePreferencePersistence;
  cleanup: () => Promise<void>;
}> {
  if (kind === "memory") {
    const persistence = new InMemoryDesktopReasoningModePreferencePersistence();
    await persistence.start();
    return { persistence, cleanup: () => persistence.stop() };
  }
  const directory = await mkdtemp(join(tmpdir(), "robothree-dfi51-preference-"));
  const persistence = new SqliteDesktopReasoningModePreferencePersistence({
    databasePath: join(directory, "core.sqlite"),
    clock: new FakeClock(at),
  });
  await persistence.start();
  return {
    persistence,
    cleanup: async () => {
      await persistence.stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
