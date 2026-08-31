import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DesktopIpcRouter } from "../src/main/desktop-ipc-router.js";
import { DESKTOP_IPC_CHANNELS } from "../src/shared/foundation-api.js";
import { generatePptxBytes } from "../../../services/document-worker/src/pptx/pptx-adapter.js";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

function desktopError(code: string, correlationId: string) {
  return {
    contractVersion: "v1alpha1" as const,
    code,
    category: "validation" as const,
    safeSummary: "not found",
    retryable: false,
    correlationId,
  };
}

describe("DesktopIpcRouter", () => {
  it("keeps the selected path in Main and returns only a safe grant projection", async () => {
    const registerWorkspaceSelection = vi.fn(async () => ({
      ok: true as const,
      value: { selectionHandle: "selection-handle-private-123" },
    }));
    const createWorkspaceGrant = vi.fn(async () => ({
      ok: true as const,
      value: {
        workspaceGrantId: "workspace.grant-test",
        displayName: "研发目录",
        rootDisplayPath: "Project",
        accessMode: "read_write" as const,
        status: "active" as const,
        createdAt: "2026-07-26T00:00:00.000Z",
      },
    }));
    const discardWorkspaceSelection = vi.fn(async () => ({
      ok: true as const,
      value: { discarded: true as const },
    }));
    const client = fakeClient({
      registerWorkspaceSelection,
      discardWorkspaceSelection,
      createWorkspaceGrant,
    });
    const router = new DesktopIpcRouter({
      core: { client },
      chooseWorkspaceDirectory: async () => "/private/company/project",
    });

    const result = await router.dispatch(
      DESKTOP_IPC_CHANNELS.createWorkspaceGrantFromPicker,
      {
        commandId: id("1"),
        correlationId: id("2"),
        clientInstanceId: id("3"),
        displayName: "研发目录",
        accessMode: "read_write",
      },
    );

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        workspaceGrantId: "workspace.grant-test",
      }),
    });
    expect(registerWorkspaceSelection).toHaveBeenCalledWith({
      selectedPath: "/private/company/project",
      clientInstanceId: id("3"),
      correlationId: id("2"),
    });
    expect(createWorkspaceGrant).toHaveBeenCalledWith(expect.objectContaining({
      selectionHandle: "selection-handle-private-123",
    }));
    expect(discardWorkspaceSelection)
      .toHaveBeenCalledWith("selection-handle-private-123");
    expect(JSON.stringify(result)).not.toContain("/private/company/project");
    expect(JSON.stringify(result)).not.toContain("selection-handle-private-123");
  });

  it("fails closed before Core when an IPC payload has unknown fields", async () => {
    const runtimeStatus = vi.fn();
    const router = new DesktopIpcRouter({
      core: { client: fakeClient({ runtimeStatus }) },
      chooseWorkspaceDirectory: async () => undefined,
    });

    const result = await router.dispatch(DESKTOP_IPC_CHANNELS.runtimeStatus, {
      contractVersion: "v1alpha1",
      type: "runtime_status_query",
      queryId: id("4"),
      correlationId: id("5"),
      clientInstanceId: id("6"),
      rawHttpBaseUrl: "http://127.0.0.1:9999",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "contract.invalid",
        category: "validation",
      },
    });
    expect(runtimeStatus).not.toHaveBeenCalled();
  });

  it("registers MAR-1A workspace artifacts through Main-owned picker and bounded digest", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-mar1a-"));
    try {
      await mkdir(join(root, "reports"));
      const filePath = join(root, "reports", "manual.xlsx");
      await writeFile(filePath, "manual-artifact");
      const artifactId = `artifact:${"1".repeat(64)}`;
      const registerWorkspaceArtifact = vi.fn(async (input) => ({
        ok: true as const,
        value: registrationReceipt({
          commandId: input.command.commandId,
          artifactId,
          relativePath: input.relativePath,
        }),
      }));
      const chooseWorkspaceArtifactFile = vi.fn(async () => filePath);
      const router = new DesktopIpcRouter({
        core: {
          client: fakeClient({
            listWorkspaceGrantAuthorities: vi.fn(async () => ({
              ok: true as const,
              value: [workspaceAuthority(root)],
            })),
            registerWorkspaceArtifact,
          }),
        },
        chooseWorkspaceDirectory: async () => undefined,
        chooseWorkspaceArtifactFile,
      });

      const result = await router.dispatch(
        DESKTOP_IPC_CHANNELS.registerWorkspaceArtifactFromPicker,
        {
          contractVersion: "v1alpha1",
          type: "register_workspace_artifact",
          commandId: id("56"),
          correlationId: id("57"),
          clientInstanceId: id("58"),
        },
      );

      expect(result).toMatchObject({
        ok: true,
        value: {
          commandId: id("56"),
          artifactId,
          artifact: {
            sourceKind: "workspace_file",
            relativePath: "reports/manual.xlsx",
            previewState: "unsupported",
          },
        },
      });
      expect(chooseWorkspaceArtifactFile).toHaveBeenCalledWith([expect.objectContaining({
        rootRealPath: root,
      })]);
      expect(registerWorkspaceArtifact).toHaveBeenCalledWith({
        command: expect.objectContaining({
          type: "register_workspace_artifact",
          commandId: id("56"),
        }),
        workspaceGrantId: "workspace.grant-test",
        relativePath: "reports/manual.xlsx",
        fileSha256: createHash("sha256").update("manual-artifact").digest("hex"),
        byteSize: 15,
        mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        displayName: "manual.xlsx",
      });
      expect(JSON.stringify(result)).not.toContain(root);
      expect(JSON.stringify(result)).not.toContain("manual-artifact");
      expect(JSON.stringify(result)).not.toContain(createHash("sha256").update("manual-artifact").digest("hex"));
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("fails MAR-1A registration closed for unsafe workspace file states", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-mar1a-unsafe-"));
    const outside = await mkdtemp(join(tmpdir(), "robothree-mar1a-outside-"));
    try {
      await mkdir(join(root, "reports"));
      const realFile = join(root, "reports", "real.xlsx");
      const symlinkPath = join(root, "reports", "link.xlsx");
      const hardlinkPath = join(root, "reports", "hard.xlsx");
      const directoryPath = join(root, "reports", "directory.xlsx");
      const tooLargePath = join(root, "reports", "large.xlsx");
      const unsupportedPath = join(root, "reports", "manual.zip");
      const outsidePath = join(outside, "manual.xlsx");
      await writeFile(realFile, "manual-artifact");
      await symlink(realFile, symlinkPath);
      await link(realFile, hardlinkPath);
      await mkdir(directoryPath);
      await writeFile(tooLargePath, "");
      await truncate(tooLargePath, 256 * 1024 * 1024 + 1);
      await writeFile(unsupportedPath, "zip");
      await writeFile(outsidePath, "outside");
      const registerWorkspaceArtifact = vi.fn();
      const buildRouter = (selectedPath: string) => new DesktopIpcRouter({
        core: {
          client: fakeClient({
            listWorkspaceGrantAuthorities: vi.fn(async () => ({
              ok: true as const,
              value: [workspaceAuthority(root)],
            })),
            registerWorkspaceArtifact,
          }),
        },
        chooseWorkspaceDirectory: async () => undefined,
        chooseWorkspaceArtifactFile: async () => selectedPath,
      });
      const command = {
        contractVersion: "v1alpha1" as const,
        type: "register_workspace_artifact" as const,
        commandId: id("59"),
        correlationId: id("60"),
        clientInstanceId: id("61"),
      };

      await expect(buildRouter(symlinkPath).dispatch(
        DESKTOP_IPC_CHANNELS.registerWorkspaceArtifactFromPicker,
        command,
      )).resolves.toMatchObject({ ok: false, error: { code: "artifact.source_unavailable" } });
      await expect(buildRouter(hardlinkPath).dispatch(
        DESKTOP_IPC_CHANNELS.registerWorkspaceArtifactFromPicker,
        { ...command, commandId: id("62") },
      )).resolves.toMatchObject({ ok: false, error: { code: "artifact.source_unavailable" } });
      await expect(buildRouter(directoryPath).dispatch(
        DESKTOP_IPC_CHANNELS.registerWorkspaceArtifactFromPicker,
        { ...command, commandId: id("63") },
      )).resolves.toMatchObject({ ok: false, error: { code: "artifact.source_unavailable" } });
      await expect(buildRouter(tooLargePath).dispatch(
        DESKTOP_IPC_CHANNELS.registerWorkspaceArtifactFromPicker,
        { ...command, commandId: id("64") },
      )).resolves.toMatchObject({ ok: false, error: { code: "artifact.source_unavailable" } });
      await expect(buildRouter(unsupportedPath).dispatch(
        DESKTOP_IPC_CHANNELS.registerWorkspaceArtifactFromPicker,
        { ...command, commandId: id("65") },
      )).resolves.toMatchObject({ ok: false, error: { code: "artifact.source_unavailable" } });
      await expect(buildRouter(outsidePath).dispatch(
        DESKTOP_IPC_CHANNELS.registerWorkspaceArtifactFromPicker,
        { ...command, commandId: id("66") },
      )).resolves.toMatchObject({
        ok: false,
        error: { code: "workspace.boundary_violation", category: "workspace_boundary" },
      });
      expect(registerWorkspaceArtifact).not.toHaveBeenCalled();
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  });

  it("limits Workbench attachment picking to the selected workspace and rejects pre-submit drift", async () => {
    const selectedRoot = await mkdtemp(join(tmpdir(), "robothree-vs22-selected-"));
    const otherRoot = await mkdtemp(join(tmpdir(), "robothree-vs22-other-"));
    try {
      await mkdir(join(selectedRoot, "资料"));
      const selectedPath = join(selectedRoot, "资料", "source.xlsx");
      await writeFile(selectedPath, "manual-artifact");
      const artifactId = `artifact:${"2".repeat(64)}`;
      const receipt = registrationReceipt({
        commandId: id("80"),
        artifactId,
        relativePath: "资料/source.xlsx",
      });
      const registerWorkspaceArtifact = vi.fn(async () => ({
        ok: true as const,
        value: receipt,
      }));
      const chooseWorkspaceArtifactFile = vi.fn(async () => selectedPath);
      const router = new DesktopIpcRouter({
        core: {
          client: fakeClient({
            listWorkspaceGrantAuthorities: vi.fn(async () => ({
              ok: true as const,
              value: [
                workspaceAuthority(selectedRoot),
                {
                  ...workspaceAuthority(otherRoot),
                  workspaceGrantId: "workspace.grant-other",
                },
              ],
            })),
            registerWorkspaceArtifact,
          }),
        },
        chooseWorkspaceDirectory: async () => undefined,
        chooseWorkspaceArtifactFile,
      });

      const picked = await router.dispatch(DESKTOP_IPC_CHANNELS.pickWorkbenchAttachment, {
        contractVersion: "v1alpha1",
        type: "register_workspace_artifact",
        commandId: id("80"),
        correlationId: id("81"),
        clientInstanceId: id("82"),
        workspaceGrantId: "workspace.grant-test",
      });
      expect(picked).toEqual({ ok: true, value: receipt });
      expect(chooseWorkspaceArtifactFile).toHaveBeenCalledWith(
        [expect.objectContaining({ workspaceGrantId: "workspace.grant-test" })],
        { documentSourcesOnly: true },
      );
      expect(registerWorkspaceArtifact).toHaveBeenNthCalledWith(1, expect.objectContaining({
        command: {
          contractVersion: "v1alpha1",
          type: "register_workspace_artifact",
          commandId: id("80"),
          correlationId: id("81"),
          clientInstanceId: id("82"),
        },
      }));

      const validatedBeforeDrift = await router.dispatch(
        DESKTOP_IPC_CHANNELS.validateWorkbenchAttachment,
        {
          contractVersion: "v1alpha1",
          type: "register_workspace_artifact",
          commandId: id("83"),
          correlationId: id("84"),
          clientInstanceId: id("85"),
          workspaceGrantId: "workspace.grant-test",
          artifact: receipt.artifact,
        },
      );
      expect(validatedBeforeDrift).toEqual({ ok: true, value: receipt });
      expect(registerWorkspaceArtifact).toHaveBeenNthCalledWith(2, expect.objectContaining({
        command: {
          contractVersion: "v1alpha1",
          type: "register_workspace_artifact",
          commandId: id("83"),
          correlationId: id("84"),
          clientInstanceId: id("85"),
        },
      }));

      await writeFile(selectedPath, "changed-manual-artifact");
      const validated = await router.dispatch(
        DESKTOP_IPC_CHANNELS.validateWorkbenchAttachment,
        {
          contractVersion: "v1alpha1",
          type: "register_workspace_artifact",
          commandId: id("86"),
          correlationId: id("87"),
          clientInstanceId: id("88"),
          workspaceGrantId: "workspace.grant-test",
          artifact: receipt.artifact,
        },
      );
      expect(validated).toMatchObject({
        ok: false,
        error: { code: "artifact.source_changed", category: "conflict" },
      });
      expect(registerWorkspaceArtifact).toHaveBeenCalledTimes(2);
    } finally {
      await rm(selectedRoot, { recursive: true, force: true });
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  it("maps transport failures to a retryable safe availability error", async () => {
    const router = new DesktopIpcRouter({
      core: {
        client: fakeClient({
          runtimeStatus: vi.fn(async () => {
            throw new Error("connect ECONNREFUSED 127.0.0.1:61234");
          }),
        }),
      },
      chooseWorkspaceDirectory: async () => undefined,
    });

    const result = await router.dispatch(DESKTOP_IPC_CHANNELS.runtimeStatus, {
      contractVersion: "v1alpha1",
      type: "runtime_status_query",
      queryId: id("7"),
      correlationId: id("8"),
      clientInstanceId: id("9"),
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "runtime.unavailable",
        category: "availability",
        retryable: true,
        safeSummary: "The local runtime operation is unavailable.",
      }),
    });
    expect(JSON.stringify(result)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(result)).not.toContain("61234");
  });

  it("maps exhausted Core recovery to the frozen non-retryable Renderer message", async () => {
    const router = new DesktopIpcRouter({
      core: {
        get client() {
          throw new Error("Local Core client is unavailable");
        },
        snapshot: () => ({ runtimeState: "failed" as const }),
      },
      chooseWorkspaceDirectory: async () => undefined,
    });

    const result = await router.dispatch(DESKTOP_IPC_CHANNELS.runtimeStatus, {
      contractVersion: "v1alpha1",
      type: "runtime_status_query",
      queryId: id("10"),
      correlationId: id("11"),
      clientInstanceId: id("12"),
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "runtime.unavailable",
        category: "availability",
        retryable: false,
        safeSummary: "Core 启动失败，已完成自动恢复尝试，请重新启动 RoboThree。",
      }),
    });
  });

  it("routes bounded Artifact preview requests without leaking workspace authority", async () => {
    const previewArtifact = vi.fn(async () => ({
      ok: true as const,
      value: {
        artifactId: `artifact:${"a".repeat(64)}`,
        mode: "markdown" as const,
        content: "## Preview",
        byteSize: new TextEncoder().encode("## Preview").byteLength,
        truncated: false,
        warnings: [],
      },
    }));
    const router = new DesktopIpcRouter({
      core: { client: fakeClient({ previewArtifact }) },
      chooseWorkspaceDirectory: async () => undefined,
    });

    const result = await router.dispatch(DESKTOP_IPC_CHANNELS.artifactPreview, {
      contractVersion: "v1alpha1",
      type: "artifact_preview",
      queryId: id("13"),
      correlationId: id("14"),
      clientInstanceId: id("15"),
      artifactId: `artifact:${"a".repeat(64)}`,
      mode: "markdown",
      maxBytes: 4096,
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        artifactId: `artifact:${"a".repeat(64)}`,
      }),
    });
    expect(previewArtifact).toHaveBeenCalledWith(expect.objectContaining({
      type: "artifact_preview",
      artifactId: `artifact:${"a".repeat(64)}`,
    }));
    expect(JSON.stringify(previewArtifact.mock.calls)).not.toContain("workspaceRoot");
  });

  it("previews MAR-1B workspace markdown artifacts through Main-owned bounded file reads", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-mar1b-preview-"));
    try {
      await mkdir(join(root, "notes"));
      await writeFile(join(root, "notes", "summary.md"), "abcdef");
      const artifactId = `artifact:${"7".repeat(64)}`;
      const previewArtifact = vi.fn(async (query) => ({
        ok: false as const,
        error: desktopError("desktop.artifact_not_found", query.correlationId),
      }));
      const resolveArtifactFileSource = vi.fn(async () => ({
        ok: true as const,
        value: {
          artifactId,
          displayName: "summary.md",
          relativePath: "notes/summary.md",
          workspaceGrantId: "workspace.grant-test",
          rootRealPath: root,
        },
      }));
      const router = new DesktopIpcRouter({
        core: { client: fakeClient({ previewArtifact, resolveArtifactFileSource }) },
        chooseWorkspaceDirectory: async () => undefined,
      });

      const result = await router.dispatch(DESKTOP_IPC_CHANNELS.artifactPreview, {
        contractVersion: "v1alpha1",
        type: "artifact_preview",
        queryId: id("70"),
        correlationId: id("71"),
        clientInstanceId: id("3"),
        artifactId,
        mode: "markdown",
        maxBytes: 4,
      });

      expect(result).toEqual({
        ok: true,
        value: {
          artifactId,
          mode: "markdown",
          content: "abcd",
          byteSize: 4,
          truncated: true,
          warnings: ["Preview truncated to the requested byte budget."],
        },
      });
      expect(previewArtifact).toHaveBeenCalledWith(expect.objectContaining({
        artifactId,
        maxBytes: 4,
      }));
      expect(resolveArtifactFileSource).toHaveBeenCalledWith({ artifactId });
      expect(JSON.stringify(result)).not.toContain(root);
      expect(JSON.stringify(resolveArtifactFileSource.mock.calls)).not.toContain("relativePath");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("renders MAR-1B workspace HTML artifacts with raw content inside the APV-1C sandbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-mar1b-html-"));
    try {
      await mkdir(join(root, "pages"));
      const html = "<h1>Hello</h1><script>window.bad = true</script>";
      await writeFile(join(root, "pages", "preview.html"), html);
      const artifactId = `artifact:${"8".repeat(64)}`;
      const previewArtifact = vi.fn();
      const resolveArtifactFileSource = vi.fn(async () => ({
        ok: true as const,
        value: {
          artifactId,
          displayName: "preview.html",
          relativePath: "pages/preview.html",
          workspaceGrantId: "workspace.grant-test",
          rootRealPath: root,
        },
      }));
      const start = vi.fn(async () => ({
        artifactId,
        previewSessionId: "preview:00000000-0000-4000-8000-000000000801",
        localOrigin: "http://127.0.0.1" as const,
        previewUrl: "http://127.0.0.1:49152/preview:00000000-0000-4000-8000-000000000801/00000000-0000-4000-8000-000000000802/index.html",
        csp: "default-src 'none'; script-src 'none'",
        expiresAt: "2026-08-06T18:00:00.000Z",
        warnings: [],
      }));
      const router = new DesktopIpcRouter({
        core: {
          client: fakeClient({ previewArtifact, resolveArtifactFileSource }),
          htmlPreviewSandbox: { start, close: vi.fn() } as never,
        },
        chooseWorkspaceDirectory: async () => undefined,
      });

      const result = await router.dispatch(DESKTOP_IPC_CHANNELS.artifactHtmlPreview, {
        contractVersion: "v1alpha1",
        type: "artifact_html_preview",
        queryId: id("72"),
        correlationId: id("73"),
        clientInstanceId: id("3"),
        artifactId,
        maxBytes: 1024,
        ttlMs: 60_000,
      });

      expect(result).toMatchObject({
        ok: true,
        value: {
          artifactId,
          localOrigin: "http://127.0.0.1",
        },
      });
      expect(previewArtifact).not.toHaveBeenCalled();
      expect(start).toHaveBeenCalledWith(expect.objectContaining({
        artifactId,
        html,
        ttlMs: 60_000,
      }));
      expect(JSON.stringify(result)).not.toContain(root);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("renders Core-authorized task-generated workspace HTML without exposing private authority", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-wfw3-task-html-"));
    try {
      await mkdir(join(root, "pages"));
      const html = "<!doctype html><html><body><h1>Task output</h1></body></html>";
      await writeFile(join(root, "pages", "task-output.html"), html);
      const artifactId = `artifact:${"5".repeat(64)}`;
      const previewArtifact = vi.fn();
      const resolveArtifactFileSource = vi.fn(async () => ({
        ok: true as const,
        value: {
          artifactId,
          taskId: "task:wfw3-private",
          displayName: "task-output.html",
          relativePath: "pages/task-output.html",
          workspaceGrantId: "workspace.grant-private",
          rootRealPath: root,
        },
      }));
      const start = vi.fn(async () => ({
        artifactId,
        previewSessionId: "preview:00000000-0000-4000-8000-000000000851",
        localOrigin: "http://127.0.0.1" as const,
        previewUrl: "http://127.0.0.1:49152/preview:00000000-0000-4000-8000-000000000851/00000000-0000-4000-8000-000000000852/index.html",
        csp: "default-src 'none'; script-src 'none'",
        expiresAt: "2026-08-31T18:00:00.000Z",
        warnings: [],
      }));
      const router = new DesktopIpcRouter({
        core: {
          client: fakeClient({ previewArtifact, resolveArtifactFileSource }),
          htmlPreviewSandbox: { start, close: vi.fn() } as never,
        },
        chooseWorkspaceDirectory: async () => undefined,
      });

      const result = await router.dispatch(DESKTOP_IPC_CHANNELS.artifactHtmlPreview, {
        contractVersion: "v1alpha1",
        type: "artifact_html_preview",
        queryId: id("85"),
        correlationId: id("86"),
        clientInstanceId: id("3"),
        artifactId,
        maxBytes: 4096,
        ttlMs: 60_000,
      });

      expect(result).toMatchObject({
        ok: true,
        value: {
          artifactId,
          localOrigin: "http://127.0.0.1",
          csp: "default-src 'none'; script-src 'none'",
        },
      });
      expect(previewArtifact).not.toHaveBeenCalled();
      expect(resolveArtifactFileSource).toHaveBeenCalledWith({ artifactId });
      expect(start).toHaveBeenCalledWith({
        artifactId,
        html,
        ttlMs: 60_000,
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(root);
      expect(serialized).not.toContain("workspace.grant-private");
      expect(serialized).not.toContain("task:wfw3-private");
      expect(serialized).not.toContain(html);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("renders task-scoped PPTX artifacts through a Main-owned sandbox visual preview", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-ptx4-html-"));
    try {
      await mkdir(join(root, "reports"));
      const bytes = await generatePptxBytes({
        title: "PTX-4 Deck",
        layout: "wide",
        templateRef: "robothree.default",
        slides: [{
          title: "PTX-4 Visual",
          elements: [
            {
              type: "text",
              text: "Generated by RoboThree",
              x: 0.8,
              y: 1.2,
              w: 6,
              h: 0.6,
              style: {
                fontSize: 18,
                color: "111827",
                bold: false,
                italic: false,
                align: "left",
              },
            },
            {
              type: "table",
              rows: [["Metric", "Value"], ["Slides", "1"]],
              x: 0.8,
              y: 2,
              w: 5,
              h: 1.2,
            },
            {
              type: "chart",
              chartType: "bar",
              labels: ["A", "B"],
              series: [{ name: "Score", values: [1, 2] }],
              x: 6,
              y: 2,
              w: 4,
              h: 2,
            },
          ],
        }],
      });
      await writeFile(join(root, "reports", "deck.pptx"), bytes);
      const artifactId = `artifact:${"6".repeat(64)}`;
      const previewArtifact = vi.fn();
      const resolveArtifactFileSource = vi.fn(async () => ({
        ok: true as const,
        value: {
          artifactId,
          taskId: "task:ptx4",
          displayName: "deck.pptx",
          relativePath: "reports/deck.pptx",
          workspaceGrantId: "workspace.grant-test",
          rootRealPath: root,
        },
      }));
      const start = vi.fn(async () => ({
        artifactId,
        previewSessionId: "preview:00000000-0000-4000-8000-000000000901",
        localOrigin: "http://127.0.0.1" as const,
        previewUrl: "http://127.0.0.1:49152/preview:00000000-0000-4000-8000-000000000901/00000000-0000-4000-8000-000000000902/index.html",
        csp: "default-src 'none'; script-src 'none'",
        expiresAt: "2026-08-25T18:00:00.000Z",
        warnings: [],
      }));
      const router = new DesktopIpcRouter({
        core: {
          client: fakeClient({ previewArtifact, resolveArtifactFileSource }),
          htmlPreviewSandbox: { start, close: vi.fn() } as never,
        },
        chooseWorkspaceDirectory: async () => undefined,
      });

      const result = await router.dispatch(DESKTOP_IPC_CHANNELS.artifactHtmlPreview, {
        contractVersion: "v1alpha1",
        type: "artifact_html_preview",
        queryId: id("90"),
        correlationId: id("91"),
        clientInstanceId: id("3"),
        artifactId,
        maxBytes: 16 * 1024,
        ttlMs: 60_000,
      });

      expect(result).toMatchObject({
        ok: true,
        value: {
          artifactId,
          localOrigin: "http://127.0.0.1",
        },
      });
      expect(previewArtifact).not.toHaveBeenCalled();
      expect(start).toHaveBeenCalledWith(expect.objectContaining({
        artifactId,
        ttlMs: 60_000,
      }));
      const html = start.mock.calls[0]?.[0]?.html as string;
      expect(html).toContain("PPTX visual preview");
      expect(html).toContain("PTX-4 Visual");
      expect(html).toContain("Generated by RoboThree");
      expect(html).toContain("table");
      expect(html).toContain("chart");
      expect(html).not.toContain(root);
      expect(html).not.toContain("workspaceGrantId");
      expect(html).not.toContain("<script");
      expect(JSON.stringify(result)).not.toContain(root);
      expect(resolveArtifactFileSource).toHaveBeenCalledWith({ artifactId });
      expect(JSON.stringify(resolveArtifactFileSource.mock.calls)).not.toContain("relativePath");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("fails closed for MAR-1B workspace preview symlinks without leaking paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-mar1b-symlink-"));
    try {
      await mkdir(join(root, "notes"));
      await writeFile(join(root, "notes", "target.md"), "safe");
      await symlink(join(root, "notes", "target.md"), join(root, "notes", "link.md"));
      const artifactId = `artifact:${"9".repeat(64)}`;
      const previewArtifact = vi.fn(async (query) => ({
        ok: false as const,
        error: desktopError("desktop.artifact_not_found", query.correlationId),
      }));
      const resolveArtifactFileSource = vi.fn(async () => ({
        ok: true as const,
        value: {
          artifactId,
          displayName: "link.md",
          relativePath: "notes/link.md",
          workspaceGrantId: "workspace.grant-test",
          rootRealPath: root,
        },
      }));
      const router = new DesktopIpcRouter({
        core: { client: fakeClient({ previewArtifact, resolveArtifactFileSource }) },
        chooseWorkspaceDirectory: async () => undefined,
      });

      const result = await router.dispatch(DESKTOP_IPC_CHANNELS.artifactPreview, {
        contractVersion: "v1alpha1",
        type: "artifact_preview",
        queryId: id("74"),
        correlationId: id("75"),
        clientInstanceId: id("3"),
        artifactId,
        mode: "text",
        maxBytes: 64,
      });

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "artifact.source_unavailable",
          category: "validation",
          retryable: false,
        },
      });
      expect(JSON.stringify(result)).not.toContain(root);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("starts and closes APV-1C HTML preview sessions through Main-owned sandbox", async () => {
    const previewArtifact = vi.fn(async () => ({
      ok: true as const,
      value: {
        artifactId: `artifact:${"b".repeat(64)}`,
        mode: "markdown" as const,
        content: "## Preview",
        byteSize: new TextEncoder().encode("## Preview").byteLength,
        truncated: false,
        warnings: [],
      },
    }));
    const start = vi.fn(async () => ({
      artifactId: `artifact:${"b".repeat(64)}`,
      previewSessionId: "preview:00000000-0000-4000-8000-000000000201",
      localOrigin: "http://127.0.0.1" as const,
      previewUrl: "http://127.0.0.1:49152/preview:00000000-0000-4000-8000-000000000201/00000000-0000-4000-8000-000000000202/index.html",
      csp: "default-src 'none'; script-src 'none'",
      expiresAt: "2026-08-05T09:00:00.000Z",
      warnings: [],
    }));
    const close = vi.fn(async () => ({
      commandId: id("18"),
      previewSessionId: "preview:00000000-0000-4000-8000-000000000201",
      closed: true,
    }));
    const router = new DesktopIpcRouter({
      core: {
        client: fakeClient({ previewArtifact }),
        htmlPreviewSandbox: { start, close } as never,
      },
      chooseWorkspaceDirectory: async () => undefined,
    });

    const started = await router.dispatch(DESKTOP_IPC_CHANNELS.artifactHtmlPreview, {
      contractVersion: "v1alpha1",
      type: "artifact_html_preview",
      queryId: id("16"),
      correlationId: id("17"),
      clientInstanceId: id("3"),
      artifactId: `artifact:${"b".repeat(64)}`,
      maxBytes: 4096,
      ttlMs: 60_000,
    });
    const closed = await router.dispatch(DESKTOP_IPC_CHANNELS.closeArtifactPreview, {
      contractVersion: "v1alpha1",
      type: "close_artifact_preview",
      commandId: id("18"),
      correlationId: id("19"),
      clientInstanceId: id("3"),
      previewSessionId: "preview:00000000-0000-4000-8000-000000000201",
    });

    expect(started).toMatchObject({
      ok: true,
      value: {
        localOrigin: "http://127.0.0.1",
      },
    });
    expect(closed).toMatchObject({ ok: true, value: { closed: true } });
    expect(previewArtifact).toHaveBeenCalledWith(expect.objectContaining({
      type: "artifact_preview",
      mode: "markdown",
      artifactId: `artifact:${"b".repeat(64)}`,
    }));
    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: `artifact:${"b".repeat(64)}`,
      ttlMs: 60_000,
    }));
    expect(close).toHaveBeenCalledWith(
      "preview:00000000-0000-4000-8000-000000000201",
      id("18"),
    );
    expect(JSON.stringify(previewArtifact.mock.calls)).not.toContain("workspaceRoot");
  });

  it("forwards APV-2 lifecycle commands without file authority fields", async () => {
    const artifactId = `artifact:${"c".repeat(64)}`;
    const setArtifactLifecycle = vi.fn(async () => ({
      ok: true as const,
      value: {
        commandId: id("20"),
        artifactId,
        status: "accepted" as const,
        lifecycle: {
          revision: 1,
          pinned: true,
          dismissed: false,
          deleted: false,
          updatedAt: "2026-08-06T09:00:00.000Z",
          pinnedAt: "2026-08-06T09:00:00.000Z",
        },
      },
    }));
    const router = new DesktopIpcRouter({
      core: { client: fakeClient({ setArtifactLifecycle }) },
      chooseWorkspaceDirectory: async () => undefined,
    });

    const result = await router.dispatch(DESKTOP_IPC_CHANNELS.setArtifactLifecycle, {
      contractVersion: "v1alpha1",
      type: "set_artifact_lifecycle",
      commandId: id("20"),
      correlationId: id("21"),
      clientInstanceId: id("22"),
      artifactId,
      pinned: true,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { artifactId, status: "accepted" },
    });
    expect(setArtifactLifecycle).toHaveBeenCalledWith(expect.objectContaining({
      type: "set_artifact_lifecycle",
      artifactId,
      pinned: true,
    }));
    expect(JSON.stringify(setArtifactLifecycle.mock.calls)).not.toContain("workspaceRoot");
    expect(JSON.stringify(setArtifactLifecycle.mock.calls)).not.toContain("relativePath");
  });

  it("forwards APV-3A record tombstone commands without file authority fields", async () => {
    const artifactId = `artifact:${"f".repeat(64)}`;
    const deleteArtifactRecord = vi.fn(async () => ({
      ok: true as const,
      value: {
        commandId: id("32"),
        artifactId,
        status: "accepted" as const,
        lifecycle: {
          revision: 1,
          pinned: false,
          dismissed: false,
          deleted: true,
          updatedAt: "2026-08-06T10:00:00.000Z",
          deletedAt: "2026-08-06T10:00:00.000Z",
        },
      },
    }));
    const restoreArtifactRecord = vi.fn(async () => ({
      ok: true as const,
      value: {
        commandId: id("35"),
        artifactId,
        status: "accepted" as const,
        lifecycle: {
          revision: 2,
          pinned: false,
          dismissed: false,
          deleted: false,
          updatedAt: "2026-08-06T10:01:00.000Z",
          restoredAt: "2026-08-06T10:01:00.000Z",
        },
      },
    }));
    const router = new DesktopIpcRouter({
      core: {
        client: fakeClient({ deleteArtifactRecord, restoreArtifactRecord }),
      },
      chooseWorkspaceDirectory: async () => undefined,
    });

    const deleted = await router.dispatch(DESKTOP_IPC_CHANNELS.deleteArtifactRecord, {
      contractVersion: "v1alpha1",
      type: "delete_artifact_record",
      commandId: id("32"),
      correlationId: id("33"),
      clientInstanceId: id("34"),
      artifactId,
      expectedArtifactRevision: 0,
      reasonSummary: "Panel cleanup.",
    });
    const restored = await router.dispatch(DESKTOP_IPC_CHANNELS.restoreArtifactRecord, {
      contractVersion: "v1alpha1",
      type: "restore_artifact_record",
      commandId: id("35"),
      correlationId: id("36"),
      clientInstanceId: id("37"),
      artifactId,
      expectedArtifactRevision: 1,
    });
    const rejected = await router.dispatch(DESKTOP_IPC_CHANNELS.deleteArtifactRecord, {
      contractVersion: "v1alpha1",
      type: "delete_artifact_record",
      commandId: id("38"),
      correlationId: id("39"),
      clientInstanceId: id("40"),
      artifactId,
      expectedArtifactRevision: 0,
      workspaceRoot: "/Users/example/private-root",
    });

    expect(deleted).toMatchObject({
      ok: true,
      value: { artifactId, status: "accepted" },
    });
    expect(restored).toMatchObject({
      ok: true,
      value: { artifactId, status: "accepted" },
    });
    expect(rejected).toMatchObject({
      ok: false,
      error: { code: "contract.invalid" },
    });
    expect(deleteArtifactRecord).toHaveBeenCalledTimes(1);
    expect(restoreArtifactRecord).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(deleteArtifactRecord.mock.calls)).not.toContain("workspaceRoot");
    expect(JSON.stringify(deleteArtifactRecord.mock.calls)).not.toContain("relativePath");
    expect(JSON.stringify(restoreArtifactRecord.mock.calls)).not.toContain("workspaceRoot");
    expect(JSON.stringify(restoreArtifactRecord.mock.calls)).not.toContain("relativePath");
  });

  it("moves APV-3B artifact source files to Trash through Main-only authority", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-apv3b-"));
    try {
      await mkdir(join(root, "reports"));
      await mkdir(join(root, "trash"));
      const sourcePath = join(root, "reports", "report.xlsx");
      const trashedPath = join(root, "trash", "report.xlsx");
      await writeFile(sourcePath, "artifact-bytes");
      const sourceRealPath = await realpath(sourcePath);
      const artifactId = `artifact:${"a".repeat(64)}`;
      const prepared = preparedSourceDelete({
        artifactId,
        rootRealPath: root,
        relativePath: "reports/report.xlsx",
      });
      const prepareArtifactSourceFileDeletion = vi.fn(async () => ({
        ok: true as const,
        value: prepared,
      }));
      const commitArtifactSourceFileDeletion = vi.fn(async () => ({
        ok: true as const,
        value: sourceDeleteReceipt(artifactId, "accepted"),
      }));
      const trashed: string[] = [];
      const router = new DesktopIpcRouter({
        core: {
          client: fakeClient({
            prepareArtifactSourceFileDeletion,
            commitArtifactSourceFileDeletion,
          }),
        },
        chooseWorkspaceDirectory: async () => undefined,
        trashArtifactSourceFile: async (realPath) => {
          trashed.push(realPath);
          await rename(realPath, trashedPath);
        },
      });

      const result = await router.dispatch(DESKTOP_IPC_CHANNELS.deleteArtifactSourceFile, {
        contractVersion: "v1alpha1",
        type: "delete_artifact_source_file",
        commandId: id("41"),
        correlationId: id("42"),
        clientInstanceId: id("43"),
        artifactId,
        expectedArtifactRevision: 0,
        confirmationText: "DELETE report.xlsx",
      });

      expect(result).toMatchObject({
        ok: true,
        value: {
          artifactId,
          sourceFileDeleted: true,
          deletionMode: "os_trash",
        },
      });
      await expect(readFile(trashedPath, "utf8")).resolves.toBe("artifact-bytes");
      await expect(readFile(sourcePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      expect(trashed[0]).toBe(sourceRealPath);
      expect(prepareArtifactSourceFileDeletion).toHaveBeenCalledWith(expect.objectContaining({
        type: "delete_artifact_source_file",
        artifactId,
        confirmationText: "DELETE report.xlsx",
      }));
      expect(commitArtifactSourceFileDeletion).toHaveBeenCalledWith(expect.objectContaining({
        type: "delete_artifact_source_file",
        artifactId,
      }));
      expect(JSON.stringify(prepareArtifactSourceFileDeletion.mock.calls)).not.toContain("workspaceRoot");
      expect(JSON.stringify(prepareArtifactSourceFileDeletion.mock.calls)).not.toContain("relativePath");
      expect(JSON.stringify(result)).not.toContain(root);
      expect(JSON.stringify(result)).not.toContain("reports/report.xlsx");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("fails APV-3B source delete closed for unsafe file states", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-apv3b-unsafe-"));
    try {
      await mkdir(join(root, "reports"));
      const realFile = join(root, "reports", "real.xlsx");
      const symlinkPath = join(root, "reports", "link.xlsx");
      const hardlinkPath = join(root, "reports", "hard.xlsx");
      await writeFile(realFile, "artifact-bytes");
      await symlink(realFile, symlinkPath);
      await link(realFile, hardlinkPath);
      const artifactId = `artifact:${"b".repeat(64)}`;
      const trashArtifactSourceFile = vi.fn(async () => undefined);
      const commitArtifactSourceFileDeletion = vi.fn(async () => ({
        ok: true as const,
        value: sourceDeleteReceipt(artifactId, "accepted"),
      }));
      const router = new DesktopIpcRouter({
        core: {
          client: fakeClient({
            prepareArtifactSourceFileDeletion: vi.fn(async () => ({
              ok: true as const,
              value: preparedSourceDelete({
                artifactId,
                rootRealPath: root,
                relativePath: "reports/link.xlsx",
              }),
            })),
            commitArtifactSourceFileDeletion,
          }),
        },
        chooseWorkspaceDirectory: async () => undefined,
        trashArtifactSourceFile,
      });
      const symlinkResult = await router.dispatch(DESKTOP_IPC_CHANNELS.deleteArtifactSourceFile, {
        contractVersion: "v1alpha1",
        type: "delete_artifact_source_file",
        commandId: id("44"),
        correlationId: id("45"),
        clientInstanceId: id("46"),
        artifactId,
        expectedArtifactRevision: 0,
        confirmationText: "DELETE link.xlsx",
      });

      expect(symlinkResult).toMatchObject({
        ok: false,
        error: { code: "artifact.delete_unsupported" },
      });
      expect(trashArtifactSourceFile).not.toHaveBeenCalled();
      expect(commitArtifactSourceFileDeletion).not.toHaveBeenCalled();

      const hardlinkRouter = new DesktopIpcRouter({
        core: {
          client: fakeClient({
            prepareArtifactSourceFileDeletion: vi.fn(async () => ({
              ok: true as const,
              value: preparedSourceDelete({
                artifactId,
                rootRealPath: root,
                relativePath: "reports/hard.xlsx",
              }),
            })),
            commitArtifactSourceFileDeletion,
          }),
        },
        chooseWorkspaceDirectory: async () => undefined,
        trashArtifactSourceFile,
      });
      const hardlinkResult = await hardlinkRouter.dispatch(
        DESKTOP_IPC_CHANNELS.deleteArtifactSourceFile,
        {
          contractVersion: "v1alpha1",
          type: "delete_artifact_source_file",
          commandId: id("47"),
          correlationId: id("48"),
          clientInstanceId: id("49"),
          artifactId,
          expectedArtifactRevision: 0,
          confirmationText: "DELETE hard.xlsx",
        },
      );
      expect(hardlinkResult).toMatchObject({
        ok: false,
        error: { code: "artifact.delete_unsupported" },
      });
      expect(trashArtifactSourceFile).not.toHaveBeenCalled();
      expect(commitArtifactSourceFileDeletion).not.toHaveBeenCalled();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does not commit APV-3B source delete when Trash is unsupported or postcondition is uncertain", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-apv3b-trash-"));
    try {
      await mkdir(join(root, "reports"));
      const sourcePath = join(root, "reports", "report.xlsx");
      await writeFile(sourcePath, "artifact-bytes");
      const artifactId = `artifact:${"c".repeat(64)}`;
      const commitArtifactSourceFileDeletion = vi.fn(async () => ({
        ok: true as const,
        value: sourceDeleteReceipt(artifactId, "accepted"),
      }));
      const baseClient = {
        prepareArtifactSourceFileDeletion: vi.fn(async () => ({
          ok: true as const,
          value: preparedSourceDelete({
            artifactId,
            rootRealPath: root,
            relativePath: "reports/report.xlsx",
          }),
        })),
        commitArtifactSourceFileDeletion,
      };
      const unsupportedRouter = new DesktopIpcRouter({
        core: { client: fakeClient(baseClient) },
        chooseWorkspaceDirectory: async () => undefined,
        trashArtifactSourceFile: async () => {
          throw new Error("trash unavailable");
        },
      });
      const unsupported = await unsupportedRouter.dispatch(
        DESKTOP_IPC_CHANNELS.deleteArtifactSourceFile,
        {
          contractVersion: "v1alpha1",
          type: "delete_artifact_source_file",
          commandId: id("50"),
          correlationId: id("51"),
          clientInstanceId: id("52"),
          artifactId,
          expectedArtifactRevision: 0,
          confirmationText: "DELETE report.xlsx",
        },
      );
      expect(unsupported).toMatchObject({
        ok: false,
        error: { code: "artifact.delete_unsupported" },
      });

      const uncertainRouter = new DesktopIpcRouter({
        core: { client: fakeClient(baseClient) },
        chooseWorkspaceDirectory: async () => undefined,
        trashArtifactSourceFile: async () => undefined,
      });
      const uncertain = await uncertainRouter.dispatch(
        DESKTOP_IPC_CHANNELS.deleteArtifactSourceFile,
        {
          contractVersion: "v1alpha1",
          type: "delete_artifact_source_file",
          commandId: id("53"),
          correlationId: id("54"),
          clientInstanceId: id("55"),
          artifactId,
          expectedArtifactRevision: 0,
          confirmationText: "DELETE report.xlsx",
        },
      );
      expect(uncertain).toMatchObject({
        ok: false,
        error: { code: "artifact.delete_uncertain", category: "uncertain" },
      });
      expect(commitArtifactSourceFileDeletion).not.toHaveBeenCalled();
      await expect(readFile(sourcePath, "utf8")).resolves.toBe("artifact-bytes");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("opens and exports APV-2 artifacts from Main-only resolved file authority", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-apv2-"));
    try {
      await mkdir(join(root, "reports"));
      const sourcePath = join(root, "reports", "report.xlsx");
      await writeFile(sourcePath, "artifact-bytes");
      const exportDir = join(root, "exports");
      await mkdir(exportDir);
      const exportPath = join(exportDir, "copy.xlsx");
      const artifactId = `artifact:${"d".repeat(64)}`;
      const resolveArtifactFileSource = vi.fn(async () => ({
        ok: true as const,
        value: {
          artifactId,
          taskId: "task.fixture-001",
          displayName: "report.xlsx",
          relativePath: "reports/report.xlsx",
          workspaceGrantId: "workspace.grant-test",
          rootRealPath: root,
        },
      }));
      const opened: string[] = [];
      const router = new DesktopIpcRouter({
        core: { client: fakeClient({ resolveArtifactFileSource }) },
        chooseWorkspaceDirectory: async () => undefined,
        openFileLocation: (realPath) => {
          opened.push(realPath);
        },
        chooseArtifactExportPath: async () => exportPath,
      });

      const openResult = await router.dispatch(DESKTOP_IPC_CHANNELS.openArtifactLocation, {
        contractVersion: "v1alpha1",
        type: "open_artifact_location",
        commandId: id("23"),
        correlationId: id("24"),
        clientInstanceId: id("25"),
        artifactId,
      });
      const exportResult = await router.dispatch(DESKTOP_IPC_CHANNELS.exportArtifact, {
        contractVersion: "v1alpha1",
        type: "export_artifact",
        commandId: id("26"),
        correlationId: id("27"),
        clientInstanceId: id("28"),
        artifactId,
      });

      expect(openResult).toEqual({
        ok: true,
        value: { commandId: id("23"), artifactId, opened: true },
      });
      await expect(realpath(sourcePath)).resolves.toBe(opened[0]);
      expect(exportResult).toEqual({
        ok: true,
        value: { commandId: id("26"), artifactId, exported: true, fileName: "copy.xlsx" },
      });
      await expect(readFile(exportPath, "utf8")).resolves.toBe("artifact-bytes");
      expect(JSON.stringify(openResult)).not.toContain(root);
      expect(JSON.stringify(exportResult)).not.toContain(root);
      expect(JSON.stringify(resolveArtifactFileSource.mock.calls)).toContain(artifactId);
      expect(JSON.stringify(resolveArtifactFileSource.mock.calls)).not.toContain("relativePath");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("fails APV-2 export closed when the target already exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "robothree-apv2-exists-"));
    try {
      await mkdir(join(root, "reports"));
      await mkdir(join(root, "exports"));
      const sourcePath = join(root, "reports", "report.xlsx");
      const exportPath = join(root, "exports", "copy.xlsx");
      await writeFile(sourcePath, "new-artifact");
      await writeFile(exportPath, "existing-file");
      const artifactId = `artifact:${"e".repeat(64)}`;
      const router = new DesktopIpcRouter({
        core: {
          client: fakeClient({
            resolveArtifactFileSource: vi.fn(async () => ({
              ok: true as const,
              value: {
                artifactId,
                taskId: "task.fixture-001",
                displayName: "report.xlsx",
                relativePath: "reports/report.xlsx",
                workspaceGrantId: "workspace.grant-test",
                rootRealPath: root,
              },
            })),
          }),
        },
        chooseWorkspaceDirectory: async () => undefined,
        chooseArtifactExportPath: async () => exportPath,
      });

      const result = await router.dispatch(DESKTOP_IPC_CHANNELS.exportArtifact, {
        contractVersion: "v1alpha1",
        type: "export_artifact",
        commandId: id("29"),
        correlationId: id("30"),
        clientInstanceId: id("31"),
        artifactId,
      });

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "command.idempotency_conflict",
          category: "conflict",
          retryable: false,
        },
      });
      await expect(readFile(exportPath, "utf8")).resolves.toBe("existing-file");
      expect(await readdir(join(root, "exports"))).toEqual(["copy.xlsx"]);
      expect(JSON.stringify(result)).not.toContain(root);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

function fakeClient(overrides: Record<string, unknown>) {
  const fallback = vi.fn(async () => {
    throw new Error("Unexpected fake client call");
  });
  return {
    runtimeStatus: fallback,
    registerWorkspaceSelection: fallback,
    discardWorkspaceSelection: fallback,
    createWorkspaceGrant: fallback,
    revokeWorkspaceGrant: fallback,
    listWorkspaceGrants: fallback,
    createSession: fallback,
    renameSession: fallback,
    deleteSession: fallback,
    listSessions: fallback,
    openSession: fallback,
    listAgents: fallback,
    listModels: fallback,
    loadConversationSnapshot: fallback,
    listTasks: fallback,
    loadTaskDetail: fallback,
    listArtifacts: fallback,
    listWorkspaceGrantAuthorities: fallback,
    registerWorkspaceArtifact: fallback,
    previewArtifact: fallback,
    setArtifactLifecycle: fallback,
    deleteArtifactRecord: fallback,
    restoreArtifactRecord: fallback,
    prepareArtifactSourceFileDeletion: fallback,
    commitArtifactSourceFileDeletion: fallback,
    resolveArtifactFileSource: fallback,
    listPendingUserConfirmations: fallback,
    controlTask: fallback,
    submitTurn: fallback,
    querySubmitTurn: fallback,
    ...overrides,
  } as never;
}

function workspaceAuthority(rootRealPath: string) {
  return {
    workspaceGrantId: "workspace.grant-test",
    displayName: "研发目录",
    rootDisplayPath: "Project",
    rootRealPath,
    accessMode: "read_write",
    status: "active",
  } as const;
}

function registrationReceipt(input: {
  commandId: string;
  artifactId: string;
  relativePath: string;
}) {
  return {
    commandId: input.commandId,
    artifactId: input.artifactId,
    status: "accepted",
    artifact: {
      artifactId: input.artifactId,
      sourceKind: "workspace_file",
      sourceId: `manual:${"a".repeat(64)}`,
      sourceDigest: `sha256:${"b".repeat(64)}`,
      displayName: input.relativePath.split("/").at(-1) ?? "manual.xlsx",
      kind: "spreadsheet",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      relativePath: input.relativePath,
      byteSize: 15,
      createdAt: "2026-08-06T12:00:00.000Z",
      previewState: "unsupported",
      lifecycle: {
        revision: 0,
        pinned: false,
        dismissed: false,
        deleted: false,
        sourceDeleted: false,
      },
      metadata: {
        registration: "manual",
      },
    },
  } as const;
}

function preparedSourceDelete(input: {
  artifactId: string;
  rootRealPath: string;
  relativePath: string;
}) {
  return {
    commandId: id("41"),
    requestDigest: `sha256:${"d".repeat(64)}`,
    artifactId: input.artifactId,
    taskId: "task.fixture-001",
    displayName: input.relativePath.split("/").at(-1) ?? "report.xlsx",
    relativePath: input.relativePath,
    workspaceGrantId: "workspace.grant-test",
    rootRealPath: input.rootRealPath,
    expectedArtifactRevision: 0,
    expectedConfirmationText: `DELETE ${input.relativePath.split("/").at(-1) ?? "report.xlsx"}`,
  };
}

function sourceDeleteReceipt(
  artifactId: string,
  status: "accepted" | "replayed",
) {
  return {
    commandId: id("41"),
    artifactId,
    status,
    sourceFileDeleted: true,
    deletionMode: "os_trash",
    lifecycle: {
      revision: 1,
      pinned: false,
      dismissed: false,
      deleted: true,
      sourceDeleted: true,
      updatedAt: "2026-08-06T11:00:00.000Z",
      deletedAt: "2026-08-06T11:00:00.000Z",
      sourceDeletedAt: "2026-08-06T11:00:00.000Z",
      sourceDeletionMode: "os_trash",
    },
  } as const;
}
