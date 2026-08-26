import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DESKTOP_LOCAL_CONTRACT_VERSION,
} from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  DesktopSessionService,
  DesktopConversationProjectionService,
  FakeClock,
  FakeWorkspaceSelectionResolver,
  InMemoryConversationPersistence,
  InMemoryDesktopFoundationPersistence,
  NodeWorkspacePathResolver,
  SqliteConversationPersistence,
  SqliteDesktopFoundationPersistence,
  WorkspaceGrantService,
  sha256CanonicalJson,
} from "../src/index.js";
import { JsonValueSchema } from "@robothree/contracts";

const commandIds = {
  createWorkspace: "019f8e00-0000-7000-8000-000000000001",
  revokeWorkspace: "019f8e00-0000-7000-8000-000000000002",
  createSession: "019f8e00-0000-7000-8000-000000000003",
  renameSession: "019f8e00-0000-7000-8000-000000000004",
  deleteSession: "019f8e00-0000-7000-8000-000000000005",
  correlation: "019f8e00-0000-7000-8000-000000000006",
  client: "019f8e00-0000-7000-8000-000000000007",
} as const;

describe("DCF-1.1A WorkspaceGrantService", () => {
  it("resolves an opaque selection once and stores the canonical directory target", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf11a-workspace-"));
    const link = join(tmpdir(), `robothree-dcf11a-link-${commandIds.createWorkspace}`);
    const clock = new FakeClock("2026-07-26T11:00:00.000Z");
    const persistence = new InMemoryDesktopFoundationPersistence({ clock });
    const selections = new FakeWorkspaceSelectionResolver();
    selections.register("selection-handle-0001", link);
    try {
      await symlink(directory, link);
      const canonicalDirectory = await realpath(directory);
      await persistence.start();
      const service = new WorkspaceGrantService({
        clock,
        persistence,
        selectionResolver: selections,
        pathResolver: new NodeWorkspacePathResolver(),
      });
      const result = await service.create({
        ...metadata(commandIds.createWorkspace),
        type: "create_workspace_grant",
        selectionHandle: "selection-handle-0001",
        displayName: "RoboThree",
        accessMode: "read_write",
      });
      expect(result).toMatchObject({
        ok: true,
        replayed: false,
        value: {
          workspaceGrantId: `workspace:${commandIds.createWorkspace}`,
          rootDisplayPath: canonicalDirectory,
        },
      });
      expect(await persistence.loadWorkspaceGrant(
        `workspace:${commandIds.createWorkspace}`,
      )).toMatchObject({ rootRealPath: canonicalDirectory });
      expect(JSON.stringify(await persistence.listWorkspaceGrants()))
        .not.toContain("selection-handle-0001");
      await mkdir(join(directory, "inside"));
      await writeFile(join(directory, "inside", "note.txt"), "ok");
      expect(await service.resolveAuthorizedPath({
        workspaceGrantId: `workspace:${commandIds.createWorkspace}`,
        relativePath: "inside/note.txt",
        operation: "write",
      })).toMatchObject({
        ok: true,
        value: { absolutePath: join(canonicalDirectory, "inside", "note.txt") },
      });
      expect(await service.resolveAuthorizedPath({
        workspaceGrantId: `workspace:${commandIds.createWorkspace}`,
        relativePath: "../outside.txt",
        operation: "read",
      })).toMatchObject({
        ok: false,
        error: { code: "workspace.path_invalid_relative" },
      });

      const outside = await mkdtemp(join(tmpdir(), "robothree-dcf11a-outside-"));
      try {
        await symlink(outside, join(directory, "escape"));
        expect(await service.resolveAuthorizedPath({
          workspaceGrantId: `workspace:${commandIds.createWorkspace}`,
          relativePath: "escape",
          operation: "read",
        })).toMatchObject({
          ok: false,
          error: { code: "workspace.path_outside_grant" },
        });
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    } finally {
      await persistence.stop();
      await rm(link, { force: true });
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("replays committed WorkspaceGrant create and revoke after SQLite response loss", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf11a-workspace-recovery-"));
    const selectedDirectory = await mkdtemp(join(tmpdir(), "robothree-dcf11a-selected-"));
    const databasePath = join(directory, "robothree.sqlite");
    const clock = new FakeClock("2026-07-26T11:05:00.000Z");
    const selections = new FakeWorkspaceSelectionResolver();
    selections.register("selection-handle-0002", selectedDirectory);
    const crashed = new Set<string>();
    let persistence = new SqliteDesktopFoundationPersistence({
      databasePath,
      clock,
      faultInjector(point) {
        if (!crashed.has(point)) {
          crashed.add(point);
          throw new Error(`lost response at ${point}`);
        }
      },
    });
    try {
      await persistence.start();
      let service = new WorkspaceGrantService({
        clock,
        persistence,
        selectionResolver: selections,
        pathResolver: new NodeWorkspacePathResolver(),
      });
      const create = {
        ...metadata(commandIds.createWorkspace),
        type: "create_workspace_grant" as const,
        selectionHandle: "selection-handle-0002",
        displayName: "Durable Workspace",
        accessMode: "read_write" as const,
      };
      expect(await service.create(create)).toMatchObject({
        ok: false,
        error: { code: "desktop.persistence_failure" },
      });
      await persistence.stop();

      persistence = new SqliteDesktopFoundationPersistence({
        databasePath,
        clock,
        faultInjector(point) {
          if (!crashed.has(point)) {
            crashed.add(point);
            throw new Error(`lost response at ${point}`);
          }
        },
      });
      await persistence.start();
      service = new WorkspaceGrantService({
        clock,
        persistence,
        selectionResolver: selections,
        pathResolver: new NodeWorkspacePathResolver(),
      });
      expect(await service.create(create)).toMatchObject({
        ok: true,
        replayed: true,
      });
      clock.set("2026-07-26T11:06:00.000Z");
      const revoke = {
        ...metadata(commandIds.revokeWorkspace),
        type: "revoke_workspace_grant" as const,
        workspaceGrantId: `workspace:${commandIds.createWorkspace}`,
      };
      expect(await service.revoke(revoke)).toMatchObject({
        ok: false,
        error: { code: "desktop.persistence_failure" },
      });
      expect(await service.revoke(revoke)).toMatchObject({
        ok: true,
        replayed: true,
        value: { status: "revoked" },
      });
      expect(await service.create({
        ...create,
        displayName: "different digest",
      })).toMatchObject({
        ok: false,
        error: { code: "desktop.command_idempotency_conflict" },
      });
    } finally {
      await persistence.stop();
      await rm(directory, { recursive: true, force: true });
      await rm(selectedDirectory, { recursive: true, force: true });
    }
  });
});

describe("DCF-1.1A DesktopSessionService recovery", () => {
  it("repairs a crash after SessionHead commit by replaying the same create command", async () => {
    const clock = new FakeClock("2026-07-26T11:10:00.000Z");
    const conversation = new InMemoryConversationPersistence({ clock });
    const metadataPersistence = new InMemoryDesktopFoundationPersistence({ clock });
    let crash = true;
    await conversation.start();
    await metadataPersistence.start();
    const service = new DesktopSessionService({
      clock,
      conversation,
      metadata: metadataPersistence,
      faultInjector(point) {
        if (point === "session.create.after_head" && crash) {
          crash = false;
          throw new Error("response path crashed after SessionHead commit");
        }
      },
    });
    const command = {
      ...metadata(commandIds.createSession),
      type: "create_session" as const,
      title: "恢复测试",
    };
    await expect(service.create(command)).rejects.toThrow("SessionHead commit");
    expect(await conversation.loadSession(command.commandId)).toBeDefined();
    expect(await metadataPersistence.listDesktopSessions()).toEqual([]);
    clock.set("2026-07-26T11:10:30.000Z");
    expect(await service.create({
      ...command,
      title: "被篡改的重试",
    })).toMatchObject({
      ok: false,
      error: { code: "desktop.command_idempotency_conflict" },
    });
    expect(await service.create(command)).toMatchObject({
      ok: true,
      replayed: false,
      value: {
        title: "恢复测试",
        createdAt: "2026-07-26T11:10:00.000Z",
        updatedAt: "2026-07-26T11:10:00.000Z",
      },
    });
    expect(await service.create(command)).toMatchObject({
      ok: true,
      replayed: true,
    });
    await metadataPersistence.stop();
    await conversation.stop();
  });

  it("projects ordered Conversation messages without inventing the durable cursor owner", async () => {
    const clock = new FakeClock("2026-07-26T11:15:00.000Z");
    const conversation = new InMemoryConversationPersistence({ clock });
    const foundation = new InMemoryDesktopFoundationPersistence({ clock });
    await conversation.start();
    await foundation.start();
    try {
      const sessions = new DesktopSessionService({
        clock,
        conversation,
        metadata: foundation,
      });
      const create = {
        ...metadata(commandIds.createSession),
        type: "create_session" as const,
        title: "Projection",
      };
      expect(await sessions.create(create)).toMatchObject({ ok: true });
      await appendTextMessage(conversation, {
        sessionId: commandIds.createSession,
        messageId: "019f8e00-0000-7000-8000-000000000020",
        sequence: 1,
        text: "第一条",
        createdAt: "2026-07-26T11:15:01.000Z",
      });
      await appendTextMessage(conversation, {
        sessionId: commandIds.createSession,
        messageId: "019f8e00-0000-7000-8000-000000000021",
        sequence: 2,
        text: "第二条",
        createdAt: "2026-07-26T11:15:02.000Z",
      });
      const projection = new DesktopConversationProjectionService({
        conversation,
        metadata: foundation,
      });
      expect(await projection.loadSnapshot({
        desktopSessionId: `session:${commandIds.createSession}`,
        latestDurableCursor: "cursor:provided-by-dcf11c",
        limit: 1,
      })).toMatchObject({
        ok: true,
        value: {
          latestDurableCursor: "cursor:provided-by-dcf11c",
          hasMoreBefore: true,
          messages: [{
            messageId: "message:019f8e00-0000-7000-8000-000000000021",
            sequence: 2,
            role: "user",
            status: "completed",
            content: "第二条",
          }],
        },
      });
    } finally {
      await foundation.stop();
      await conversation.stop();
    }
  });

  it("recovers committed create, rename and tombstone receipts after SQLite close/reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf11a-recovery-"));
    const databasePath = join(directory, "robothree.sqlite");
    const clock = new FakeClock("2026-07-26T11:20:00.000Z");
    const crashed = new Set<string>();
    let conversation = new SqliteConversationPersistence({ databasePath, clock });
    let foundation = new SqliteDesktopFoundationPersistence({
      databasePath,
      clock,
      faultInjector(point) {
        if (!crashed.has(point)) {
          crashed.add(point);
          throw new Error(`lost response at ${point}`);
        }
      },
    });
    try {
      await conversation.start();
      await foundation.start();
      let service = new DesktopSessionService({
        clock,
        conversation,
        metadata: foundation,
      });
      const create = {
        ...metadata(commandIds.createSession),
        type: "create_session" as const,
        title: "Durable",
      };
      expect(await service.create(create)).toMatchObject({
        ok: false,
        error: { code: "desktop.persistence_failure" },
      });
      await foundation.stop();
      await conversation.stop();

      conversation = new SqliteConversationPersistence({ databasePath, clock });
      foundation = new SqliteDesktopFoundationPersistence({
        databasePath,
        clock,
        faultInjector(point) {
          if (!crashed.has(point)) {
            crashed.add(point);
            throw new Error(`lost response at ${point}`);
          }
        },
      });
      await conversation.start();
      await foundation.start();
      service = new DesktopSessionService({
        clock,
        conversation,
        metadata: foundation,
      });
      expect(await service.create(create)).toMatchObject({
        ok: true,
        replayed: true,
      });

      clock.set("2026-07-26T11:21:00.000Z");
      const rename = {
        ...metadata(commandIds.renameSession),
        type: "rename_session" as const,
        sessionId: `session:${commandIds.createSession}`,
        title: "Renamed",
        expectedRevision: 0,
      };
      expect(await service.rename(rename)).toMatchObject({
        ok: false,
        error: { code: "desktop.persistence_failure" },
      });
      expect(await service.rename(rename)).toMatchObject({
        ok: true,
        replayed: true,
        value: { revision: 1, title: "Renamed" },
      });

      clock.set("2026-07-26T11:22:00.000Z");
      const tombstone = {
        ...metadata(commandIds.deleteSession),
        type: "delete_session" as const,
        sessionId: `session:${commandIds.createSession}`,
        expectedRevision: 1,
      };
      expect(await service.delete(tombstone)).toMatchObject({
        ok: false,
        error: { code: "desktop.persistence_failure" },
      });
      expect(await service.delete(tombstone)).toMatchObject({
        ok: true,
        replayed: true,
        value: { revision: 2, tombstoned: true },
      });
      expect(await conversation.loadSession(commandIds.createSession)).toBeDefined();
      expect(await service.list()).toEqual([]);
      expect(await service.list(true)).toHaveLength(1);
    } finally {
      await foundation.stop();
      await conversation.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function metadata(commandId: string) {
  return {
    contractVersion: DESKTOP_LOCAL_CONTRACT_VERSION,
    commandId,
    correlationId: commandIds.correlation,
    clientInstanceId: commandIds.client,
  };
}

async function appendTextMessage(
  conversation: InMemoryConversationPersistence,
  input: {
    sessionId: string;
    messageId: string;
    sequence: number;
    text: string;
    createdAt: string;
  },
): Promise<void> {
  const message = {
    schemaVersion: "v1alpha1" as const,
    role: "user" as const,
    content: [{ type: "text" as const, text: input.text }],
  };
  expect(await conversation.appendMessage({
    expectedMessageSequence: input.sequence - 1,
    message: {
      envelope: {
        schemaVersion: "v1alpha1",
        messageId: input.messageId,
        sessionId: input.sessionId,
        sequence: input.sequence,
        messageSchemaVersion: "v1alpha1",
        messageDigest: sha256CanonicalJson(JsonValueSchema.parse(message)),
        createdAt: input.createdAt,
      },
      message,
    },
    updatedAt: input.createdAt,
  })).toMatchObject({ ok: true });
}
