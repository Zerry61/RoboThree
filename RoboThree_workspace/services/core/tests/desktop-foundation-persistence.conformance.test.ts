import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FakeClock,
  InMemoryConversationPersistence,
  InMemoryDesktopFoundationPersistence,
  SqliteConversationPersistence,
  SqliteDesktopFoundationPersistence,
} from "../src/index.js";
import type {
  ConversationPersistence,
  DesktopSessionMetadataPersistence,
  ManualArtifactRegistrationPersistence,
  WorkspaceGrantPersistence,
} from "../src/index.js";

const at = {
  created: "2026-07-26T10:00:00.000Z",
  changed: "2026-07-26T10:01:00.000Z",
  deleted: "2026-07-26T10:02:00.000Z",
} as const;
const sessionId = "019f8d00-0000-7000-8000-000000000001";
const desktopSessionId = `session:${sessionId}`;
const workspaceGrantId = "workspace:019f8d00-0000-7000-8000-000000000002";

type Harness = {
  workspace: WorkspaceGrantPersistence;
  session: DesktopSessionMetadataPersistence;
  manual: ManualArtifactRegistrationPersistence;
  conversation: ConversationPersistence;
  cleanup(): Promise<void>;
};

const variants: readonly {
  name: string;
  create(): Promise<Harness>;
}[] = [
  {
    name: "InMemoryDesktopFoundationPersistence",
    async create() {
      const clock = new FakeClock(at.created);
      const foundation = new InMemoryDesktopFoundationPersistence({ clock });
      const conversation = new InMemoryConversationPersistence({ clock });
      await conversation.start();
      await foundation.start();
      return {
        workspace: foundation,
        session: foundation,
        manual: foundation,
        conversation,
        async cleanup() {
          await foundation.stop();
          await conversation.stop();
        },
      };
    },
  },
  {
    name: "SqliteDesktopFoundationPersistence",
    async create() {
      const directory = await mkdtemp(join(tmpdir(), "robothree-dcf11a-"));
      const databasePath = join(directory, "robothree.sqlite");
      const clock = new FakeClock(at.created);
      const conversation = new SqliteConversationPersistence({
        databasePath,
        clock,
      });
      const foundation = new SqliteDesktopFoundationPersistence({
        databasePath,
        clock,
      });
      await conversation.start();
      await foundation.start();
      return {
        workspace: foundation,
        session: foundation,
        manual: foundation,
        conversation,
        async cleanup() {
          await foundation.stop();
          await conversation.stop();
          await rm(directory, { recursive: true, force: true });
        },
      };
    },
  },
];

for (const variant of variants) {
  describe(`DCF-1.1A ${variant.name} Conformance`, () => {
    it("creates, replays and revokes a WorkspaceGrant without persisting the selection handle", async () => {
      await withHarness(variant, async ({ workspace }) => {
        const create = {
          record: {
            workspaceGrantId,
            displayName: "RoboThree",
            rootDisplayPath: "/workspace/RoboThree",
            rootRealPath: "/workspace/RoboThree",
            accessMode: "read_write" as const,
            status: "active" as const,
            createdAt: at.created,
          },
          commandId: "019f8d00-0000-7000-8000-000000000010",
          requestDigest: digest("1"),
          committedAt: at.created,
        };
        expect(await workspace.commitWorkspaceGrantCreation(create))
          .toMatchObject({ ok: true, replayed: false });
        expect(await workspace.commitWorkspaceGrantCreation(create))
          .toMatchObject({ ok: true, replayed: true });
        expect(await workspace.commitWorkspaceGrantCreation({
          ...create,
          requestDigest: digest("2"),
        })).toMatchObject({
          ok: false,
          error: { code: "desktop.command_idempotency_conflict" },
        });
        expect(await workspace.commitWorkspaceGrantRevocation({
          workspaceGrantId,
          commandId: "019f8d00-0000-7000-8000-000000000011",
          requestDigest: digest("3"),
          revokedAt: at.changed,
        })).toMatchObject({
          ok: true,
          replayed: false,
          value: { status: "revoked", revokedAt: at.changed },
        });
        expect(await workspace.listWorkspaceGrants()).toHaveLength(1);
      });
    });

    it("uses CAS revisions and tombstones Session metadata without deleting SessionHead", async () => {
      await withHarness(variant, async ({ conversation, session }) => {
        await seedHead(conversation);
        expect(await session.prepareDesktopSessionCreation({
          commandId: "019f8d00-0000-7000-8000-000000000020",
          requestDigest: digest("4"),
          internalSessionId: sessionId,
          desktopSessionId,
          preparedAt: at.created,
        })).toMatchObject({ ok: true, replayed: false });
        const create = {
          record: {
            internalSessionId: sessionId,
            summary: {
              sessionId: desktopSessionId,
              revision: 0,
              title: "初始标题",
              tombstoned: false,
              createdAt: at.created,
              updatedAt: at.created,
            },
          },
          commandId: "019f8d00-0000-7000-8000-000000000020",
          requestDigest: digest("4"),
          committedAt: at.created,
        };
        expect(await session.commitDesktopSessionCreation(create))
          .toMatchObject({ ok: true, replayed: false });
        expect(await session.commitDesktopSessionCreation(create))
          .toMatchObject({ ok: true, replayed: true });
        expect(await session.commitDesktopSessionRename({
          desktopSessionId,
          title: "新标题",
          expectedRevision: 1,
          commandId: "019f8d00-0000-7000-8000-000000000021",
          requestDigest: digest("5"),
          committedAt: at.changed,
        })).toMatchObject({
          ok: false,
          error: { code: "desktop.session_revision_conflict" },
        });
        expect(await session.commitDesktopSessionRename({
          desktopSessionId,
          title: "新标题",
          expectedRevision: 0,
          commandId: "019f8d00-0000-7000-8000-000000000022",
          requestDigest: digest("6"),
          committedAt: at.changed,
        })).toMatchObject({
          ok: true,
          value: { revision: 1, title: "新标题" },
        });
        expect(await session.commitDesktopSessionTombstone({
          desktopSessionId,
          expectedRevision: 1,
          commandId: "019f8d00-0000-7000-8000-000000000023",
          requestDigest: digest("7"),
          committedAt: at.deleted,
        })).toMatchObject({
          ok: true,
          value: { revision: 2, tombstoned: true },
        });
        expect(await session.listDesktopSessions()).toEqual([]);
        expect(await session.listDesktopSessions(true)).toHaveLength(1);
        expect(await conversation.loadSession(sessionId)).toBeDefined();
      });
    });

    it("persists MAR-1.0 manual Artifact registrations as a global catalog without Task identity", async () => {
      await withHarness(variant, async ({ manual }) => {
        const record = {
          artifactId: `artifact:${"a".repeat(64)}`,
          workspaceGrantId,
          relativePath: "reports/manual.xlsx",
          sourceId: digest("b"),
          sourceDigest: digest("c"),
          fileSha256: "d".repeat(64),
          byteSize: 4096,
          displayName: "manual.xlsx",
          kind: "spreadsheet" as const,
          mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          createdAt: at.created,
          previewState: "unsupported" as const,
          metadata: {
            registrationKind: "manual_workspace_file",
            previewReason: "metadata_only",
          },
        };
        const create = {
          record,
          commandId: "019f8d00-0000-7000-8000-000000000030",
          requestDigest: digest("e"),
          committedAt: at.created,
        };
        const committed = await manual.commitManualArtifactRegistration(create);
        expect(committed).toMatchObject({
          ok: true,
          replayed: false,
          value: {
            artifactId: record.artifactId,
            sourceKind: "workspace_file",
            relativePath: "reports/manual.xlsx",
          },
        });
        expect(await manual.commitManualArtifactRegistration(create))
          .toMatchObject({ ok: true, replayed: true });
        expect(await manual.commitManualArtifactRegistration({
          ...create,
          requestDigest: digest("f"),
        })).toMatchObject({
          ok: false,
          error: { code: "desktop.command_idempotency_conflict" },
        });

        const samePathReplay = await manual.commitManualArtifactRegistration({
          ...create,
          commandId: "019f8d00-0000-7000-8000-000000000031",
          requestDigest: digest("1"),
          record: {
            ...record,
            artifactId: `artifact:${"1".repeat(64)}`,
          },
        });
        expect(samePathReplay).toMatchObject({
          ok: true,
          replayed: false,
          value: { artifactId: record.artifactId },
        });
        expect(await manual.commitManualArtifactRegistration({
          ...create,
          commandId: "019f8d00-0000-7000-8000-000000000032",
          requestDigest: digest("2"),
          record: {
            ...record,
            artifactId: `artifact:${"2".repeat(64)}`,
            sourceDigest: digest("3"),
          },
        })).toMatchObject({
          ok: false,
          error: { code: "desktop.artifact_registration_conflict" },
        });

        expect(await manual.loadManualArtifactRegistration(record.artifactId))
          .toMatchObject({ relativePath: record.relativePath });
        expect(await manual.findManualArtifactRegistrationByWorkspacePath({
          workspaceGrantId,
          relativePath: record.relativePath,
        })).toMatchObject({ artifactId: record.artifactId });
        expect(await manual.listManualArtifactRegistrations()).toHaveLength(1);
        const receipt = await manual.findManualArtifactRegistrationCommandReceipt(create.commandId);
        expect(receipt).toMatchObject({
          commandType: "register_workspace_artifact",
          artifact: { artifactId: record.artifactId },
        });
        const serialized = JSON.stringify((receipt as { artifact?: unknown }).artifact);
        expect(serialized).not.toContain(workspaceGrantId);
        expect(serialized).not.toContain(record.fileSha256);
      });
    });
  });
}

async function withHarness(
  variant: (typeof variants)[number],
  test: (harness: Harness) => Promise<void>,
): Promise<void> {
  const harness = await variant.create();
  try {
    await test(harness);
  } finally {
    await harness.cleanup();
  }
}

async function seedHead(conversation: ConversationPersistence): Promise<void> {
  expect(await conversation.createSession({
    schemaVersion: "v1alpha1",
    sessionId,
    messageSequence: 0,
    sessionEventSequence: 0,
    contextRevision: 0,
    createdAt: at.created,
    updatedAt: at.created,
  })).toMatchObject({ ok: true });
}

function digest(marker: string): string {
  return `sha256:${marker.repeat(64)}`;
}
