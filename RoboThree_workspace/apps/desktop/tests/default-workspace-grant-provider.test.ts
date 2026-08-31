import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DefaultWorkspaceGrantProvider } from
  "../src/main/default-workspace-grant-provider.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("default workspace grant provider", () => {
  it("creates ~/.robothree as a private read-write grant and discards the selection", async () => {
    const home = await mkdtemp(join(tmpdir(), "robothree-default-workspace-"));
    temporaryDirectories.push(home);
    const rootPath = join(home, ".robothree");
    const registerWorkspaceSelection = vi.fn(async () => ({
      ok: true as const,
      value: { selectionHandle: "selection-handle-default-workspace" },
    }));
    const createWorkspaceGrant = vi.fn(async () => ({
      ok: true as const,
      value: {
        workspaceGrantId: "workspace.default",
        displayName: "RoboThree 默认工作区",
        rootDisplayPath: ".robothree",
        accessMode: "read_write" as const,
        status: "active" as const,
        createdAt: "2026-08-31T00:00:00.000Z",
      },
    }));
    const discardWorkspaceSelection = vi.fn(async () => ({
      ok: true as const,
      value: { discarded: true as const },
    }));
    const provider = new DefaultWorkspaceGrantProvider({
      rootPath,
      resolveClient: () => ({
        listWorkspaceGrantAuthorities: vi.fn(async () => ({
          ok: true as const,
          value: [],
        })),
        registerWorkspaceSelection,
        createWorkspaceGrant,
        discardWorkspaceSelection,
      }) as never,
    });

    await expect(provider.ensure({
      clientInstanceId: "11111111-1111-4111-8111-111111111111",
      correlationId: "22222222-2222-4222-8222-222222222222",
    })).resolves.toBe("workspace.default");

    expect((await stat(rootPath)).isDirectory()).toBe(true);
    expect(registerWorkspaceSelection).toHaveBeenCalledWith(expect.objectContaining({
      selectedPath: await realpath(rootPath),
    }));
    expect(createWorkspaceGrant).toHaveBeenCalledWith(expect.objectContaining({
      displayName: "RoboThree 默认工作区",
      accessMode: "read_write",
    }));
    expect(discardWorkspaceSelection).toHaveBeenCalledWith(
      "selection-handle-default-workspace",
    );
  });

  it("reuses only the active read-write authority for the exact default path", async () => {
    const home = await mkdtemp(join(tmpdir(), "robothree-default-workspace-"));
    temporaryDirectories.push(home);
    const rootPath = join(home, ".robothree");
    const registerWorkspaceSelection = vi.fn();
    const provider = new DefaultWorkspaceGrantProvider({
      rootPath,
      resolveClient: () => ({
        listWorkspaceGrantAuthorities: vi.fn(async () => ({
          ok: true as const,
          value: [{
            workspaceGrantId: "workspace.default.existing",
            displayName: "RoboThree 默认工作区",
            rootDisplayPath: ".robothree",
            rootRealPath: await realpath(rootPath),
            accessMode: "read_write" as const,
            status: "active" as const,
          }],
        })),
        registerWorkspaceSelection,
        createWorkspaceGrant: vi.fn(),
        discardWorkspaceSelection: vi.fn(),
      }) as never,
    });

    await expect(provider.ensure({
      clientInstanceId: "11111111-1111-4111-8111-111111111111",
      correlationId: "22222222-2222-4222-8222-222222222222",
    })).resolves.toBe("workspace.default.existing");
    expect(registerWorkspaceSelection).not.toHaveBeenCalled();
  });
});
