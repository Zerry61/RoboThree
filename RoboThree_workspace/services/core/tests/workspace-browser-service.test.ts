import type { TaskRuntimeSelection, WorkspaceGrantProjection } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  HmacWorkspaceBrowserProofCodec,
  WorkspaceBrowserService,
  createTaskRuntimeSelection,
  type RawWorkspaceEntry,
} from "../src/index.js";

const taskId = "11111111-1111-4111-8111-111111111111";
const desktopTaskId = `task:${taskId}`;
const workspaceGrantId = "workspace:22222222-2222-4222-8222-222222222222";
const digest = (character: string) => `sha256:${character.repeat(64)}` as const;

const query = {
  contractVersion: "v1alpha2",
  queryId: "33333333-3333-4333-8333-333333333333",
  correlationId: "44444444-4444-4444-8444-444444444444",
  clientInstanceId: "55555555-5555-4555-8555-555555555555",
  type: "list_workspace_entries",
  taskId: desktopTaskId,
} as const;

describe("DFI-1A WorkspaceBrowserService", () => {
  it("rejects tampered opaque proofs without exposing their payload", () => {
    const codec = new HmacWorkspaceBrowserProofCodec(Buffer.alloc(32, 9));
    const token = codec.sealEntry({
      kind: "entry",
      taskId: desktopTaskId,
      selectionDigest: digest("e"),
      workspaceGrantId,
      relativePath: "src",
      entryKind: "directory",
    });
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(() => codec.openEntry(tampered)).toThrowError(expect.objectContaining({
      code: "workspace.browser_invalid_proof",
    }));
  });

  it("uses the exact Task selection and returns filtered stable pages", async () => {
    const entries: RawWorkspaceEntry[] = [
      { relativePath: "z.txt", displayName: "z.txt", kind: "file", sizeBytes: 1 },
      { relativePath: ".git", displayName: ".git", kind: "directory" },
      { relativePath: ".claude", displayName: ".claude", kind: "directory" },
      { relativePath: "src", displayName: "src", kind: "directory" },
      { relativePath: "link", displayName: "link", kind: "symlink" },
    ];
    const service = createService({ entries });
    const first = await service.listEntries({ ...query, limit: 2 });
    expect(first.entries.map((entry) => entry.displayName)).toEqual([".claude", "src"]);
    expect(first.truncated).toBe(true);
    expect(first.nextCursor).toBeDefined();
    expect(JSON.stringify(first)).not.toContain("/private/workspace");

    const second = await service.listEntries({
      ...query,
      cursor: first.nextCursor,
      limit: 2,
    });
    expect(second.entries.map((entry) => [entry.displayName, entry.navigable])).toEqual([
      ["z.txt", false],
      ["link", false],
    ]);
    expect(second.entries[1]).toMatchObject({
      kind: "symlink",
      unavailableReason: "workspace.symlink_navigation_disabled",
    });
  });

  it("allows navigation only with an exact directory proof", async () => {
    const calls: string[] = [];
    const service = createService({
      entries: [{ relativePath: "src", displayName: "src", kind: "directory" }],
      onRead: (relativePath) => calls.push(relativePath),
    });
    const root = await service.listEntries(query);
    const nested = await service.listEntries({ ...query, parentEntryId: root.entries[0]!.entryId });
    expect(calls).toEqual(["", "src"]);
    expect(nested.breadcrumbDisplayNames).toEqual(["src"]);
  });

  it("invalidates entry and cursor proofs after Core restart", async () => {
    const first = createService({
      entries: [
        { relativePath: "src", displayName: "src", kind: "directory" },
        { relativePath: "a.txt", displayName: "a.txt", kind: "file", sizeBytes: 1 },
      ],
      key: Buffer.alloc(32, 1),
    });
    const projection = await first.listEntries({ ...query, limit: 1 });
    const restarted = createService({ entries: [], key: Buffer.alloc(32, 2) });
    await expect(restarted.listEntries({
      ...query,
      parentEntryId: projection.entries[0]!.entryId,
    })).rejects.toMatchObject({ code: "workspace.browser_invalid_proof" });
    await expect(restarted.listEntries({
      ...query,
      cursor: projection.nextCursor,
    })).rejects.toMatchObject({ code: "workspace.browser_invalid_proof" });
  });

  it("fails closed for missing, revoked, unlocked, and invalid Task authority", async () => {
    await expect(createService({ selection: undefined }).listEntries(query))
      .rejects.toMatchObject({ code: "workspace.browser_task_selection_unavailable" });
    await expect(createService({
      selection: createSelection(undefined),
    }).listEntries(query)).rejects.toMatchObject({
      code: "workspace.browser_task_workspace_unlocked",
    });
    await expect(createService({ grant: undefined }).listEntries(query))
      .rejects.toMatchObject({ code: "workspace.browser_grant_missing" });
    await expect(createService({ grantStatus: "revoked" }).listEntries(query))
      .rejects.toMatchObject({ code: "workspace.browser_grant_revoked" });
  });

  it("rejects a cursor after the directory snapshot changes", async () => {
    let entries: RawWorkspaceEntry[] = [
      { relativePath: "a", displayName: "a", kind: "directory" },
      { relativePath: "b", displayName: "b", kind: "directory" },
    ];
    const service = createService({ getEntries: () => entries });
    const first = await service.listEntries({ ...query, limit: 1 });
    entries = [...entries, { relativePath: "c", displayName: "c", kind: "directory" }];
    await expect(service.listEntries({ ...query, cursor: first.nextCursor, limit: 1 }))
      .rejects.toMatchObject({ code: "workspace.browser_cursor_stale" });
  });
});

function createService(input: {
  entries?: readonly RawWorkspaceEntry[];
  getEntries?: () => readonly RawWorkspaceEntry[];
  onRead?: (relativePath: string) => void;
  selection?: TaskRuntimeSelection | undefined;
  grant?: (WorkspaceGrantProjection & { rootRealPath: string }) | undefined;
  grantStatus?: "active" | "revoked";
  key?: Buffer;
} = {}) {
  const selection = Object.hasOwn(input, "selection")
    ? input.selection
    : createSelection(workspaceGrantId);
  const grant = Object.hasOwn(input, "grant")
    ? input.grant
    : {
      workspaceGrantId,
      displayName: "Workspace",
      rootDisplayPath: "Workspace",
      rootRealPath: "/private/workspace",
      accessMode: "read_write" as const,
      status: input.grantStatus ?? "active" as const,
      createdAt: "2026-08-16T10:00:00.000Z",
      ...(input.grantStatus === "revoked"
        ? { revokedAt: "2026-08-16T11:00:00.000Z" }
        : {}),
    };
  return new WorkspaceBrowserService({
    tasks: { loadTaskRuntimeSelection: async () => selection },
    workspaces: { loadWorkspaceGrant: async () => grant },
    reader: {
      readDirectory: async ({ directoryRelativePath }) => {
        input.onRead?.(directoryRelativePath);
        return input.getEntries?.() ?? input.entries ?? [];
      },
      readRootIdentity: async ({ rootRealPath }) => ({
        rootRealPath,
        device: "1",
        inode: "2",
        mode: 16877,
      }),
    },
    proofs: new HmacWorkspaceBrowserProofCodec(input.key ?? Buffer.alloc(32, 7)),
  });
}

function createSelection(lockedWorkspaceGrantId: string | undefined): TaskRuntimeSelection {
  return createTaskRuntimeSelection({
    schemaVersion: "v1alpha1",
    runtimeSelectionId: "66666666-6666-4666-8666-666666666666",
    taskId,
    agent: {
      agentDefinitionId: "agent.workspace-browser",
      revision: digest("a"),
      digest: digest("a"),
    },
    agentDefaultModelId: "model.workspace-browser",
    resolvedModelLock: {
      lockId: "77777777-7777-4777-8777-777777777777",
      capabilityId: "model.workspace-browser",
      lockDigest: digest("b"),
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    ...(lockedWorkspaceGrantId === undefined ? {} : { workspaceGrantId: lockedWorkspaceGrantId }),
    platformPromptRevision: digest("c"),
    registryRevision: digest("d"),
    createdAt: "2026-08-16T10:00:00.000Z",
  });
}
