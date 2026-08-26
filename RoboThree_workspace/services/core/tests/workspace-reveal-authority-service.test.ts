import type { TaskRuntimeSelection } from "@robothree/contracts";
import { describe, expect, it } from "vitest";

import {
  HmacWorkspaceBrowserProofCodec,
  WorkspaceRevealAuthorityService,
  createTaskRuntimeSelection,
} from "../src/index.js";

const taskId = "11111111-1111-4111-8111-111111111111";
const desktopTaskId = `task:${taskId}`;
const workspaceGrantId = "workspace:22222222-2222-4222-8222-222222222222";
const digest = (character: string) => `sha256:${character.repeat(64)}` as const;
const command = {
  contractVersion: "v1alpha2",
  commandId: "33333333-3333-4333-8333-333333333333",
  correlationId: "44444444-4444-4444-8444-444444444444",
  clientInstanceId: "55555555-5555-4555-8555-555555555555",
  type: "open_task_workspace_location",
  taskId: desktopTaskId,
} as const;

describe("DFI-1B WorkspaceRevealAuthorityService", () => {
  it("binds prepare and consume to the exact Task selection and root identity", async () => {
    const service = createService();
    const prepared = await service.prepare(command);
    expect(prepared.authorityToken).toMatch(/^wra1\./u);
    const consumed = await service.consume({ command, ...prepared });
    expect(consumed).toEqual({
      commandId: command.commandId,
      taskId: desktopTaskId,
      workspaceGrantId,
      root: rootIdentity(),
    });
    expect(JSON.stringify(prepared)).not.toContain("/private/workspace");
  });

  it("rejects wrong command, expired authority and another runtime key", async () => {
    let now = 1_000;
    const service = createService({ now: () => now });
    const prepared = await service.prepare(command);
    await expect(service.consume({
      command: { ...command, commandId: "66666666-6666-4666-8666-666666666666" },
      ...prepared,
    })).rejects.toMatchObject({ code: "workspace.reveal_authority_invalid" });
    now += 5_001;
    await expect(service.consume({ command, ...prepared }))
      .rejects.toMatchObject({ code: "workspace.reveal_authority_invalid" });
    await expect(createService({ key: Buffer.alloc(32, 8) }).consume({ command, ...prepared }))
      .rejects.toMatchObject({ code: "workspace.browser_invalid_proof" });
  });

  it("fails closed when Grant or root identity changes after prepare", async () => {
    let status: "active" | "revoked" = "active";
    let inode = "2";
    const service = createService({
      grantStatus: () => status,
      root: () => ({ ...rootIdentity(), inode }),
    });
    const first = await service.prepare(command);
    status = "revoked";
    await expect(service.consume({ command, ...first }))
      .rejects.toMatchObject({ code: "workspace.reveal_grant_unavailable" });
    status = "active";
    const second = await service.prepare(command);
    inode = "9";
    await expect(service.consume({ command, ...second }))
      .rejects.toMatchObject({ code: "workspace.reveal_authority_stale" });
  });
});

function createService(input: Readonly<{
  key?: Buffer;
  now?: () => number;
  grantStatus?: () => "active" | "revoked";
  root?: () => ReturnType<typeof rootIdentity>;
}> = {}) {
  return new WorkspaceRevealAuthorityService({
    tasks: { loadTaskRuntimeSelection: async () => createSelection() },
    workspaces: {
      loadWorkspaceGrant: async () => ({
        workspaceGrantId,
        displayName: "Workspace",
        rootDisplayPath: "Workspace",
        rootRealPath: "/private/workspace",
        accessMode: "read_write",
        status: input.grantStatus?.() ?? "active",
        createdAt: "2026-08-17T00:00:00.000Z",
        ...((input.grantStatus?.() ?? "active") === "revoked"
          ? { revokedAt: "2026-08-17T01:00:00.000Z" }
          : {}),
      }),
    },
    reader: { readRootIdentity: async () => input.root?.() ?? rootIdentity() },
    proofs: new HmacWorkspaceBrowserProofCodec(input.key ?? Buffer.alloc(32, 7)),
    runtimeInstanceId: "runtime.instance-dfi-1b",
    now: input.now,
  });
}

function rootIdentity() {
  return Object.freeze({
    rootRealPath: "/private/workspace",
    device: "1",
    inode: "2",
    mode: 16877,
  });
}

function createSelection(): TaskRuntimeSelection {
  return createTaskRuntimeSelection({
    schemaVersion: "v1alpha1",
    runtimeSelectionId: "77777777-7777-4777-8777-777777777777",
    taskId,
    agent: {
      agentDefinitionId: "agent.workspace-browser",
      revision: digest("a"),
      digest: digest("a"),
    },
    agentDefaultModelId: "model.workspace-browser",
    resolvedModelLock: {
      lockId: "88888888-8888-4888-8888-888888888888",
      capabilityId: "model.workspace-browser",
      lockDigest: digest("b"),
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    workspaceGrantId,
    platformPromptRevision: digest("c"),
    registryRevision: digest("d"),
    createdAt: "2026-08-17T00:00:00.000Z",
  });
}
