import { describe, expect, it, vi } from "vitest";

import {
  createDesktopApi,
  createDesktopApiV1Alpha1,
} from "../src/preload/create-desktop-api.js";
import {
  DESKTOP_IPC_CHANNELS,
  FOUNDATION_FIXTURE_SCHEMA,
  FOUNDATION_STATUS_CHANNEL,
  type FoundationStatus,
} from "../src/shared/foundation-api.js";

describe("createDesktopApi", () => {
  it("exposes only the fixed foundation status command", async () => {
    const status: FoundationStatus = {
      fixtureSchema: FOUNDATION_FIXTURE_SCHEMA,
      fixtureOnly: true,
      runtimeState: "ready",
      coreReady: true,
      compatible: true,
      unexpectedRestartCount: 0,
    };
    const invoke = vi.fn(async () => status);
    const api = createDesktopApi(invoke);

    await expect(api.getFoundationStatus()).resolves.toEqual(status);
    expect(invoke).toHaveBeenCalledWith(FOUNDATION_STATUS_CHANNEL);
    expect(Object.keys(api)).toEqual(["getFoundationStatus"]);
    expect(Object.isFrozen(api)).toBe(true);
  });

  it("exposes only the frozen v1alpha1 business whitelist and validates events", async () => {
    const runtime = {
      contractVersion: "v1alpha1",
      status: "ready",
      runtimeInstanceId: "runtime.instance-test",
      pendingRuntimeActivation: false,
    } as const;
    const preview = {
      artifactId: `artifact:${"a".repeat(64)}`,
      mode: "text",
      content: "Preview",
      byteSize: new TextEncoder().encode("Preview").byteLength,
      truncated: false,
      warnings: [],
    } as const;
    const htmlPreview = {
      artifactId: `artifact:${"a".repeat(64)}`,
      previewSessionId: "preview:00000000-0000-4000-8000-000000000008",
      localOrigin: "http://127.0.0.1",
      previewUrl: "http://127.0.0.1:49152/preview:00000000-0000-4000-8000-000000000008/00000000-0000-4000-8000-000000000009/index.html",
      csp: "default-src 'none'; script-src 'none'",
      expiresAt: "2026-08-05T09:00:00.000Z",
      warnings: [],
    } as const;
    const closeReceipt = {
      commandId: "00000000-0000-4000-8000-000000000010",
      previewSessionId: htmlPreview.previewSessionId,
      closed: true,
    } as const;
    const artifactId = `artifact:${"a".repeat(64)}` as const;
    const lifecycleReceipt = {
      commandId: "00000000-0000-4000-8000-000000000016",
      artifactId,
      status: "accepted",
      lifecycle: {
        revision: 1,
        pinned: true,
        dismissed: false,
        deleted: false,
        sourceDeleted: false,
        updatedAt: "2026-08-06T09:00:00.000Z",
        pinnedAt: "2026-08-06T09:00:00.000Z",
      },
    } as const;
    const deleteReceipt = {
      commandId: "00000000-0000-4000-8000-000000000025",
      artifactId,
      status: "accepted",
      lifecycle: {
        revision: 2,
        pinned: true,
        dismissed: false,
        deleted: true,
        sourceDeleted: false,
        updatedAt: "2026-08-06T09:01:00.000Z",
        pinnedAt: "2026-08-06T09:00:00.000Z",
        deletedAt: "2026-08-06T09:01:00.000Z",
      },
    } as const;
    const restoreReceipt = {
      commandId: "00000000-0000-4000-8000-000000000028",
      artifactId,
      status: "accepted",
      lifecycle: {
        revision: 3,
        pinned: true,
        dismissed: false,
        deleted: false,
        sourceDeleted: false,
        updatedAt: "2026-08-06T09:02:00.000Z",
        pinnedAt: "2026-08-06T09:00:00.000Z",
        restoredAt: "2026-08-06T09:02:00.000Z",
      },
    } as const;
    const sourceDeleteReceipt = {
      commandId: "00000000-0000-4000-8000-000000000031",
      artifactId,
      status: "accepted",
      sourceFileDeleted: true,
      deletionMode: "os_trash",
      lifecycle: {
        revision: 4,
        pinned: true,
        dismissed: false,
        deleted: true,
        sourceDeleted: true,
        updatedAt: "2026-08-06T09:03:00.000Z",
        pinnedAt: "2026-08-06T09:00:00.000Z",
        deletedAt: "2026-08-06T09:03:00.000Z",
        sourceDeletedAt: "2026-08-06T09:03:00.000Z",
        sourceDeletionMode: "os_trash",
      },
    } as const;
    const openReceipt = {
      commandId: "00000000-0000-4000-8000-000000000019",
      artifactId,
      opened: true,
    } as const;
    const artifactCatalogItem = {
      artifactId,
      sourceKind: "workspace_file",
      sourceId: `manual:${"a".repeat(64)}`,
      sourceDigest: `sha256:${"b".repeat(64)}`,
      displayName: "report.xlsx",
      kind: "spreadsheet",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      relativePath: "reports/report.xlsx",
      byteSize: 64,
      createdAt: "2026-08-06T09:04:00.000Z",
      previewState: "unsupported",
      lifecycle: {
        revision: 0,
        pinned: false,
        dismissed: false,
        deleted: false,
        sourceDeleted: false,
      },
      metadata: {},
    } as const;
    const artifactCatalog = {
      artifacts: [artifactCatalogItem],
      generatedAt: "2026-08-06T09:04:00.000Z",
    } as const;
    const registerReceipt = {
      commandId: "00000000-0000-4000-8000-000000000034",
      artifactId,
      status: "accepted",
      artifact: artifactCatalogItem,
    } as const;
    const exportReceipt = {
      commandId: "00000000-0000-4000-8000-000000000022",
      artifactId,
      exported: true,
      fileName: "report.xlsx",
    } as const;
    const invoke = vi.fn(async (channel) => ({
      ok: true,
      value: channel === DESKTOP_IPC_CHANNELS.artifactPreview
        ? preview
        : channel === DESKTOP_IPC_CHANNELS.artifactHtmlPreview
          ? htmlPreview
          : channel === DESKTOP_IPC_CHANNELS.closeArtifactPreview
            ? closeReceipt
            : channel === DESKTOP_IPC_CHANNELS.setArtifactLifecycle
              ? lifecycleReceipt
              : channel === DESKTOP_IPC_CHANNELS.deleteArtifactRecord
                ? deleteReceipt
                : channel === DESKTOP_IPC_CHANNELS.restoreArtifactRecord
                  ? restoreReceipt
                  : channel === DESKTOP_IPC_CHANNELS.deleteArtifactSourceFile
                    ? sourceDeleteReceipt
                    : channel === DESKTOP_IPC_CHANNELS.listArtifacts
                      ? artifactCatalog
                      : channel === DESKTOP_IPC_CHANNELS.registerWorkspaceArtifactFromPicker
                        ? registerReceipt
                        : channel === DESKTOP_IPC_CHANNELS.openArtifactLocation
                          ? openReceipt
                          : channel === DESKTOP_IPC_CHANNELS.exportArtifact
                            ? exportReceipt
                            : runtime,
    }));
    let eventSink: ((event: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const api = createDesktopApiV1Alpha1({
      invoke,
      subscribe: (channel, listener) => {
        expect(channel).toBe(DESKTOP_IPC_CHANNELS.desktopEvent);
        eventSink = listener;
        return unsubscribe;
      },
    });

    await expect(api.getRuntimeStatus({
      contractVersion: "v1alpha1",
      type: "runtime_status_query",
      queryId: "00000000-0000-4000-8000-000000000001",
      correlationId: "00000000-0000-4000-8000-000000000002",
      clientInstanceId: "00000000-0000-4000-8000-000000000003",
    })).resolves.toEqual({ ok: true, value: runtime });
    expect(invoke).toHaveBeenCalledWith(
      DESKTOP_IPC_CHANNELS.runtimeStatus,
      expect.objectContaining({ type: "runtime_status_query" }),
    );

    const listener = vi.fn();
    const remove = api.onDesktopEvent(listener);
    eventSink?.({ unsafe: true });
    expect(listener).not.toHaveBeenCalled();
    eventSink?.({
      contractVersion: "v1alpha1",
      eventId: "00000000-0000-4000-8000-000000000004",
      deliveryKind: "durable",
      durableCursor: "delivery:1",
      runtimeInstanceId: "runtime.instance-test",
      emittedAt: "2026-07-26T00:00:00.000Z",
      payload: {
        type: "runtime_notice",
        noticeCode: "desktop.ready",
        safeSummary: "Desktop is ready.",
      },
    });
    expect(listener).toHaveBeenCalledTimes(1);
    remove();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    await expect(api.previewArtifact({
      contractVersion: "v1alpha1",
      type: "artifact_preview",
      queryId: "00000000-0000-4000-8000-000000000005",
      correlationId: "00000000-0000-4000-8000-000000000006",
      clientInstanceId: "00000000-0000-4000-8000-000000000007",
      artifactId: `artifact:${"a".repeat(64)}`,
      mode: "text",
      maxBytes: 4096,
    })).resolves.toEqual({ ok: true, value: preview });
    expect(invoke).toHaveBeenCalledWith(
      DESKTOP_IPC_CHANNELS.artifactPreview,
      expect.objectContaining({ type: "artifact_preview" }),
    );
    await expect(api.startArtifactHtmlPreview({
      contractVersion: "v1alpha1",
      type: "artifact_html_preview",
      queryId: "00000000-0000-4000-8000-000000000011",
      correlationId: "00000000-0000-4000-8000-000000000012",
      clientInstanceId: "00000000-0000-4000-8000-000000000013",
      artifactId: `artifact:${"a".repeat(64)}`,
      maxBytes: 4096,
      ttlMs: 60_000,
    })).resolves.toEqual({ ok: true, value: htmlPreview });
    expect(invoke).toHaveBeenCalledWith(
      DESKTOP_IPC_CHANNELS.artifactHtmlPreview,
      expect.objectContaining({ type: "artifact_html_preview" }),
    );
    await expect(api.closeArtifactPreview({
      contractVersion: "v1alpha1",
      type: "close_artifact_preview",
      commandId: closeReceipt.commandId,
      correlationId: "00000000-0000-4000-8000-000000000014",
      clientInstanceId: "00000000-0000-4000-8000-000000000015",
      previewSessionId: htmlPreview.previewSessionId,
    })).resolves.toEqual({ ok: true, value: closeReceipt });
    expect(invoke).toHaveBeenCalledWith(
      DESKTOP_IPC_CHANNELS.closeArtifactPreview,
      expect.objectContaining({ type: "close_artifact_preview" }),
    );
    await expect(api.setArtifactLifecycle({
      contractVersion: "v1alpha1",
      type: "set_artifact_lifecycle",
      commandId: lifecycleReceipt.commandId,
      correlationId: "00000000-0000-4000-8000-000000000017",
      clientInstanceId: "00000000-0000-4000-8000-000000000018",
      artifactId,
      pinned: true,
    })).resolves.toEqual({ ok: true, value: lifecycleReceipt });
    expect(invoke).toHaveBeenCalledWith(
      DESKTOP_IPC_CHANNELS.setArtifactLifecycle,
      expect.objectContaining({ type: "set_artifact_lifecycle", artifactId }),
    );
    await expect(api.deleteArtifactRecord({
      contractVersion: "v1alpha1",
      type: "delete_artifact_record",
      commandId: deleteReceipt.commandId,
      correlationId: "00000000-0000-4000-8000-000000000026",
      clientInstanceId: "00000000-0000-4000-8000-000000000027",
      artifactId,
      expectedArtifactRevision: 1,
      reasonSummary: "No longer needed.",
    })).resolves.toEqual({ ok: true, value: deleteReceipt });
    expect(invoke).toHaveBeenCalledWith(
      DESKTOP_IPC_CHANNELS.deleteArtifactRecord,
      expect.objectContaining({
        type: "delete_artifact_record",
        artifactId,
        expectedArtifactRevision: 1,
      }),
    );
    await expect(api.restoreArtifactRecord({
      contractVersion: "v1alpha1",
      type: "restore_artifact_record",
      commandId: restoreReceipt.commandId,
      correlationId: "00000000-0000-4000-8000-000000000029",
      clientInstanceId: "00000000-0000-4000-8000-000000000030",
      artifactId,
      expectedArtifactRevision: 2,
    })).resolves.toEqual({ ok: true, value: restoreReceipt });
    expect(invoke).toHaveBeenCalledWith(
      DESKTOP_IPC_CHANNELS.restoreArtifactRecord,
      expect.objectContaining({
        type: "restore_artifact_record",
        artifactId,
        expectedArtifactRevision: 2,
      }),
    );
    await expect(api.deleteArtifactSourceFile({
      contractVersion: "v1alpha1",
      type: "delete_artifact_source_file",
      commandId: sourceDeleteReceipt.commandId,
      correlationId: "00000000-0000-4000-8000-000000000032",
      clientInstanceId: "00000000-0000-4000-8000-000000000033",
      artifactId,
      expectedArtifactRevision: 3,
      confirmationText: "DELETE report.xlsx",
    })).resolves.toEqual({ ok: true, value: sourceDeleteReceipt });
    expect(invoke).toHaveBeenCalledWith(
      DESKTOP_IPC_CHANNELS.deleteArtifactSourceFile,
      expect.objectContaining({
        type: "delete_artifact_source_file",
        artifactId,
        expectedArtifactRevision: 3,
        confirmationText: "DELETE report.xlsx",
      }),
    );
    await expect(api.listArtifacts({
      contractVersion: "v1alpha1",
      type: "list_artifacts",
      queryId: "00000000-0000-4000-8000-000000000035",
      correlationId: "00000000-0000-4000-8000-000000000036",
      clientInstanceId: "00000000-0000-4000-8000-000000000037",
      sourceKinds: ["workspace_file"],
      limit: 200,
    })).resolves.toEqual({ ok: true, value: artifactCatalog });
    expect(invoke).toHaveBeenCalledWith(
      DESKTOP_IPC_CHANNELS.listArtifacts,
      expect.objectContaining({ type: "list_artifacts", sourceKinds: ["workspace_file"] }),
    );
    await expect(api.registerWorkspaceArtifactFromPicker({
      contractVersion: "v1alpha1",
      type: "register_workspace_artifact",
      commandId: registerReceipt.commandId,
      correlationId: "00000000-0000-4000-8000-000000000038",
      clientInstanceId: "00000000-0000-4000-8000-000000000039",
    })).resolves.toEqual({ ok: true, value: registerReceipt });
    expect(invoke).toHaveBeenCalledWith(
      DESKTOP_IPC_CHANNELS.registerWorkspaceArtifactFromPicker,
      expect.objectContaining({ type: "register_workspace_artifact" }),
    );
    expect(() => api.registerWorkspaceArtifactFromPicker({
      contractVersion: "v1alpha1",
      type: "register_workspace_artifact",
      commandId: "00000000-0000-4000-8000-000000000040",
      correlationId: "00000000-0000-4000-8000-000000000041",
      clientInstanceId: "00000000-0000-4000-8000-000000000042",
      relativePath: "reports/report.xlsx",
    } as never)).toThrow();
    await expect(api.openArtifactLocation({
      contractVersion: "v1alpha1",
      type: "open_artifact_location",
      commandId: openReceipt.commandId,
      correlationId: "00000000-0000-4000-8000-000000000020",
      clientInstanceId: "00000000-0000-4000-8000-000000000021",
      artifactId,
    })).resolves.toEqual({ ok: true, value: openReceipt });
    expect(invoke).toHaveBeenCalledWith(
      DESKTOP_IPC_CHANNELS.openArtifactLocation,
      expect.objectContaining({ type: "open_artifact_location", artifactId }),
    );
    await expect(api.exportArtifact({
      contractVersion: "v1alpha1",
      type: "export_artifact",
      commandId: exportReceipt.commandId,
      correlationId: "00000000-0000-4000-8000-000000000023",
      clientInstanceId: "00000000-0000-4000-8000-000000000024",
      artifactId,
    })).resolves.toEqual({ ok: true, value: exportReceipt });
    expect(invoke).toHaveBeenCalledWith(
      DESKTOP_IPC_CHANNELS.exportArtifact,
      expect.objectContaining({ type: "export_artifact", artifactId }),
    );

    expect(Object.keys(api)).toEqual([
      "contractVersion",
      "getRuntimeStatus",
      "createWorkspaceGrantFromPicker",
      "revokeWorkspaceGrant",
      "listWorkspaceGrants",
      "createSession",
      "renameSession",
      "deleteSession",
      "listSessions",
      "openSession",
      "listAgents",
      "listModels",
      "loadConversationSnapshot",
      "listTasks",
      "loadTaskDetail",
      "listArtifacts",
      "registerWorkspaceArtifactFromPicker",
      "previewArtifact",
      "startArtifactHtmlPreview",
      "closeArtifactPreview",
      "setArtifactLifecycle",
      "deleteArtifactRecord",
      "restoreArtifactRecord",
      "deleteArtifactSourceFile",
      "openArtifactLocation",
      "exportArtifact",
      "listPendingUserConfirmations",
      "controlTask",
      "submitTurn",
      "querySubmitTurn",
      "onDesktopEvent",
    ]);
    expect(Object.isFrozen(api)).toBe(true);

    expect(() => api.createWorkspaceGrantFromPicker({
      commandId: "invalid",
      correlationId: "invalid",
      clientInstanceId: "invalid",
      displayName: "Workspace",
      accessMode: "read_write",
    })).toThrow();
    expect(invoke).toHaveBeenCalledTimes(12);
  });
});
