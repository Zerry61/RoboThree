import {
  EffectAttemptSchema,
  JsonValueSchema,
  PersistenceSchemaVersion,
  TaskRunStateSchema,
} from "@robothree/contracts";
import { describe, expect, it, vi } from "vitest";
import type {
  Action,
  ArtifactLifecycleProjection,
  DeleteArtifactRecordCommand,
  DeleteArtifactSourceFileCommand,
  Observation,
  PersistedUserConfirmation,
  RestoreArtifactRecordCommand,
  SetArtifactLifecycleCommand,
  TaskRuntimeSelection,
  TaskRunState,
  TaskSubmitTurnBinding,
} from "@robothree/contracts";

import {
  projectUserConfirmationForDesktop,
  projectTaskStatusForDesktop,
  projectToolActivityForDesktop,
  DesktopTaskProjectionService,
} from "../src/application/desktop-task-projection-service.js";
import { createReasoningModeLockV1Alpha2 } from
  "../src/application/reasoning-mode-lock-v1alpha2-domain.js";
import { createTaskRuntimeSelectionV1Alpha4 } from
  "../src/application/runtime-selection-revisions.js";
import {
  sha256CanonicalJson,
  type PersistedTask,
  type TaskPersistence,
  type DesktopSessionMetadataPersistence,
  type SubmitTurnPersistence,
} from "../src/index.js";
import type {
  ArtifactLifecyclePersistence,
  ArtifactLifecycleRecord,
  DesktopFoundationReceipt,
  DesktopFoundationWriteResult,
  ManualArtifactRegistrationPersistence,
  ManualArtifactRegistrationRecord,
  WorkspaceGrantPersistence,
  WorkspaceGrantRecord,
} from "../src/ports/desktop-foundation-persistence.js";
import { firstAcceptedCommit } from "./task-persistence.fixtures.js";

const id = (value: number) =>
  `019f7447-a784-77b2-a716-${String(value).padStart(12, "0")}`;

describe("DCF-2A Desktop Task projection safety", () => {
  it("projects XLSX overwrite confirmations with destructive copy and no private material", () => {
    const action: Action = {
      actionId: id(401),
      kind: "tool.document.xlsx.write",
      payload: {
        relativePath: "reports/out.xlsx",
        mode: "overwrite_existing",
        workbook: {
          sheets: [{ name: "Secrets", rows: [["do-not-leak"]] }],
        },
        overwrite: { confirmedOldSha256: "a".repeat(64) },
        requestDigest: "b".repeat(64),
        workspaceRoot: "/Users/example/private-root",
      },
    };
    const projected = projectUserConfirmationForDesktop(
      pendingOverwriteConfirmation(action),
      "2026-08-06T09:00:00.000Z",
      action,
    );

    expect(projected).toMatchObject({
      status: "pending",
      reasonSummary: "Overwrite one existing XLSX file.",
      riskSummary: "Destructive file change.",
      targetSummary: "reports/out.xlsx",
      consequenceSummary: "This replaces the existing workbook. RoboThree cannot undo this operation.",
    });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("/Users/example/private-root");
    expect(serialized).not.toContain("confirmedOldSha256");
    expect(serialized).not.toContain("do-not-leak");
    expect(serialized).not.toContain("requestDigest\":\"b");
  });

  it("maps an uncertain external Effect to manual attention without payload leakage", () => {
    const state = firstAcceptedCommit().checkpoint.state;
    const attempt = EffectAttemptSchema.parse({
      schemaVersion: PersistenceSchemaVersion,
      effectAttemptId: id(201),
      taskId: state.taskId,
      runId: state.runs[0]!.runId,
      stepId: id(202),
      actionId: id(203),
      idempotencyKey: "effect:must-not-leak",
      executorCapability: "tool.enterprise.send",
      recoveryMode: "manual_reconciliation",
      status: "uncertain",
      metadata: {
        rawToolArguments: "must-not-leak",
        credential: "must-not-leak",
        resultBody: "must-not-leak",
      },
      terminalError: {
        code: "effect.result_uncertain",
        category: "provider",
        message: "must-not-leak",
        retryable: false,
      },
      createdAt: "2026-07-27T08:00:00.000Z",
      updatedAt: "2026-07-27T08:01:00.000Z",
    });

    expect(projectTaskStatusForDesktop(state, [attempt]))
      .toBe("manual_attention");
    const activity = projectToolActivityForDesktop(attempt, state);
    expect(activity).toMatchObject({
      status: "uncertain",
      statusSummary: "External result could not be confirmed.",
      safetySummary: "Tool arguments and results are hidden.",
    });
    const serialized = JSON.stringify(activity);
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("idempotencyKey");
    expect(serialized).not.toContain("credential");
    expect(serialized).not.toContain("rawToolArguments");
    expect(serialized).not.toContain("resultBody");
  });

  it("projects APV-1A metadata-only artifacts through Task Detail without sensitive fields", async () => {
    const internalSessionId = id(2);
    const task = persistedDocumentTask(internalSessionId, "reports/out.xlsx");
    const service = new DesktopTaskProjectionService({
      tasks: taskPersistence(task),
      metadata: sessionMetadata(internalSessionId, "session:desktop-a"),
      deliveries: submitTurnPersistence(),
      clock: { now: () => "2026-08-05T09:05:00.000Z" },
      projectionStartedAt: "2026-08-05T09:00:00.000Z",
    });

    const loaded = await service.loadDetail({
      desktopTaskId: `task:${task.head.taskId}`,
    });

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.artifacts).toHaveLength(1);
    expect(loaded.value.artifacts[0]).toMatchObject({
      taskId: `task:${task.head.taskId}`,
      sourceKind: "tool_observation",
      displayName: "out.xlsx",
      kind: "spreadsheet",
      relativePath: "reports/out.xlsx",
      previewState: "available",
      metadata: {
        capabilityId: "tool.document.xlsx.write",
        logicalWorkbookDigest: "b".repeat(64),
      },
    });
    const serialized = JSON.stringify(loaded.value);
    const artifactSerialized = JSON.stringify(loaded.value.artifacts[0]);
    expect(serialized).not.toContain("schemaVersion");
    expect(artifactSerialized).not.toContain("session:desktop-a");
    expect(serialized).not.toContain("/Users/example/private-root");
    expect(serialized).not.toContain("do-not-leak");
    expect(serialized).not.toContain("workbook");
  });

  it("serves APV-1B previews by artifactId without exposing task payloads", async () => {
    const internalSessionId = id(2);
    const task = persistedDocumentTask(internalSessionId, "reports/out.xlsx");
    const service = new DesktopTaskProjectionService({
      tasks: taskPersistence(task),
      metadata: sessionMetadata(internalSessionId, "session:desktop-a"),
      deliveries: submitTurnPersistence(),
      clock: { now: () => "2026-08-05T09:05:00.000Z" },
      projectionStartedAt: "2026-08-05T09:00:00.000Z",
    });
    const detail = await service.loadDetail({
      desktopTaskId: `task:${task.head.taskId}`,
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const artifact = detail.value.artifacts.at(0);
    expect(artifact).toBeDefined();
    if (artifact === undefined) return;

    const preview = await service.previewArtifact({
      contractVersion: "v1alpha1",
      type: "artifact_preview",
      queryId: id(910),
      correlationId: id(911),
      clientInstanceId: id(912),
      artifactId: artifact.artifactId,
      mode: "text",
      maxBytes: 256,
    });

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.value.content).toContain("Created: reports/out.xlsx");
    const serialized = JSON.stringify(preview.value);
    expect(serialized).not.toContain("/Users/example/private-root");
    expect(serialized).not.toContain("do-not-leak");
    expect(serialized).not.toContain("workbook");
  });

  it("persists APV-2 lifecycle overlays without changing artifact identity", async () => {
    const internalSessionId = id(2);
    const task = persistedDocumentTask(internalSessionId, "reports/out.xlsx");
    const lifecycles = new FakeArtifactLifecyclePersistence();
    const service = new DesktopTaskProjectionService({
      tasks: taskPersistence(task),
      metadata: sessionMetadata(internalSessionId, "session:desktop-a"),
      deliveries: submitTurnPersistence(),
      artifactLifecycles: lifecycles,
      clock: { now: () => "2026-08-06T09:00:00.000Z" },
      projectionStartedAt: "2026-08-05T09:00:00.000Z",
    });
    const detail = await service.loadDetail({
      desktopTaskId: `task:${task.head.taskId}`,
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const artifact = detail.value.artifacts.at(0);
    expect(artifact).toBeDefined();
    if (artifact === undefined) return;

    const command = {
      contractVersion: "v1alpha1",
      type: "set_artifact_lifecycle",
      commandId: id(920),
      correlationId: id(921),
      clientInstanceId: id(922),
      artifactId: artifact.artifactId,
      pinned: true,
    } satisfies SetArtifactLifecycleCommand;
    const updated = await service.setArtifactLifecycle(command);
    const replayed = await service.setArtifactLifecycle(command);
    const reloaded = await service.loadDetail({
      desktopTaskId: `task:${task.head.taskId}`,
    });

    expect(updated).toMatchObject({
      ok: true,
      value: {
        status: "accepted",
        artifactId: artifact.artifactId,
        lifecycle: {
          revision: 1,
          pinned: true,
          dismissed: false,
          deleted: false,
          updatedAt: "2026-08-06T09:00:00.000Z",
          pinnedAt: "2026-08-06T09:00:00.000Z",
        },
      },
    });
    expect(replayed).toMatchObject({
      ok: true,
      value: { status: "replayed" },
    });
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    expect(reloaded.value.artifacts[0]).toMatchObject({
      artifactId: artifact.artifactId,
      sourceDigest: artifact.sourceDigest,
      lifecycle: {
        revision: 1,
        pinned: true,
        dismissed: false,
        deleted: false,
      },
    });
    expect(JSON.stringify(reloaded.value)).not.toContain("/Users/example/private-root");
  });

  it("tombstones and restores APV-3A artifact records without touching file authority", async () => {
    const internalSessionId = id(2);
    const task = persistedDocumentTask(internalSessionId, "reports/out.xlsx");
    const lifecycles = new FakeArtifactLifecyclePersistence();
    const service = new DesktopTaskProjectionService({
      tasks: taskPersistence(task),
      metadata: sessionMetadata(internalSessionId, "session:desktop-a"),
      deliveries: submitTurnPersistence(),
      artifactLifecycles: lifecycles,
      workspaces: workspaceGrantPersistence({
        status: "active",
        rootRealPath: "/Users/example/private-root",
      }),
      clock: { now: () => "2026-08-06T10:00:00.000Z" },
      projectionStartedAt: "2026-08-05T09:00:00.000Z",
    });
    const detail = await service.loadDetail({
      desktopTaskId: `task:${task.head.taskId}`,
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const artifact = detail.value.artifacts.at(0);
    expect(artifact).toBeDefined();
    if (artifact === undefined) return;

    const deleteCommand = {
      contractVersion: "v1alpha1",
      type: "delete_artifact_record",
      commandId: id(930),
      correlationId: id(931),
      clientInstanceId: id(932),
      artifactId: artifact.artifactId,
      expectedArtifactRevision: 0,
      reasonSummary: "Hidden during APV-3A.",
    } satisfies DeleteArtifactRecordCommand;
    const deleted = await service.deleteArtifactRecord(deleteCommand);
    const replayedDelete = await service.deleteArtifactRecord(deleteCommand);
    const previewAfterDelete = await service.previewArtifact({
      contractVersion: "v1alpha1",
      type: "artifact_preview",
      queryId: id(933),
      correlationId: id(934),
      clientInstanceId: id(935),
      artifactId: artifact.artifactId,
      mode: "text",
      maxBytes: 256,
    });
    const sourceAfterDelete = await service.resolveArtifactFileSource({
      artifactId: artifact.artifactId,
    });

    expect(deleted).toMatchObject({
      ok: true,
      value: {
        status: "accepted",
        lifecycle: {
          revision: 1,
          pinned: false,
          dismissed: false,
          deleted: true,
          deletedAt: "2026-08-06T10:00:00.000Z",
          deletionReasonSummary: "Hidden during APV-3A.",
        },
      },
    });
    expect(replayedDelete).toMatchObject({
      ok: true,
      value: {
        status: "replayed",
        lifecycle: {
          revision: 1,
          deleted: true,
        },
      },
    });
    expect(previewAfterDelete).toMatchObject({
      ok: false,
      error: { code: "desktop.artifact_deleted" },
    });
    expect(sourceAfterDelete).toMatchObject({
      ok: false,
      error: { code: "desktop.artifact_deleted" },
    });

    const staleRestore = await service.restoreArtifactRecord({
      contractVersion: "v1alpha1",
      type: "restore_artifact_record",
      commandId: id(936),
      correlationId: id(937),
      clientInstanceId: id(938),
      artifactId: artifact.artifactId,
      expectedArtifactRevision: 0,
    } satisfies RestoreArtifactRecordCommand);
    expect(staleRestore).toMatchObject({
      ok: false,
      error: { code: "desktop.artifact_revision_conflict" },
    });

    const restoreCommand = {
      contractVersion: "v1alpha1",
      type: "restore_artifact_record",
      commandId: id(939),
      correlationId: id(940),
      clientInstanceId: id(941),
      artifactId: artifact.artifactId,
      expectedArtifactRevision: 1,
    } satisfies RestoreArtifactRecordCommand;
    const restored = await service.restoreArtifactRecord(restoreCommand);
    const sourceAfterRestore = await service.resolveArtifactFileSource({
      artifactId: artifact.artifactId,
    });
    expect(restored).toMatchObject({
      ok: true,
      value: {
        status: "accepted",
        lifecycle: {
          revision: 2,
          deleted: false,
          restoredAt: "2026-08-06T10:00:00.000Z",
        },
      },
    });
    expect(sourceAfterRestore.ok).toBe(true);
    expect(JSON.stringify(deleted)).not.toContain("/Users/example/private-root");
    expect(JSON.stringify(restored)).not.toContain("/Users/example/private-root");
  });

  it("prepares and commits APV-3B source file deletion through private authority only", async () => {
    const internalSessionId = id(2);
    const task = persistedDocumentTask(internalSessionId, "reports/out.xlsx");
    const lifecycles = new FakeArtifactLifecyclePersistence();
    const service = new DesktopTaskProjectionService({
      tasks: taskPersistence(task),
      metadata: sessionMetadata(internalSessionId, "session:desktop-a"),
      deliveries: submitTurnPersistence(),
      artifactLifecycles: lifecycles,
      workspaces: workspaceGrantPersistence({
        status: "active",
        rootRealPath: "/Users/example/private-root",
      }),
      clock: { now: () => "2026-08-06T11:00:00.000Z" },
      projectionStartedAt: "2026-08-05T09:00:00.000Z",
    });
    const detail = await service.loadDetail({
      desktopTaskId: `task:${task.head.taskId}`,
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const artifact = detail.value.artifacts.at(0);
    expect(artifact).toBeDefined();
    if (artifact === undefined) return;

    const mismatch = await service.prepareArtifactSourceFileDeletion({
      contractVersion: "v1alpha1",
      type: "delete_artifact_source_file",
      commandId: id(950),
      correlationId: id(951),
      clientInstanceId: id(952),
      artifactId: artifact.artifactId,
      expectedArtifactRevision: 0,
      confirmationText: "delete report.xlsx",
    } satisfies DeleteArtifactSourceFileCommand);
    expect(mismatch).toMatchObject({
      ok: false,
      error: { code: "desktop.artifact_delete_confirmation_mismatch" },
    });

    const command = {
      contractVersion: "v1alpha1",
      type: "delete_artifact_source_file",
      commandId: id(953),
      correlationId: id(954),
      clientInstanceId: id(955),
      artifactId: artifact.artifactId,
      expectedArtifactRevision: 0,
      confirmationText: "DELETE out.xlsx",
    } satisfies DeleteArtifactSourceFileCommand;
    const prepared = await service.prepareArtifactSourceFileDeletion(command);
    expect(prepared).toMatchObject({
      ok: true,
      value: {
        artifactId: artifact.artifactId,
        displayName: "out.xlsx",
        relativePath: "reports/out.xlsx",
        workspaceGrantId: "workspace.grant-test",
        rootRealPath: "/Users/example/private-root",
        expectedConfirmationText: "DELETE out.xlsx",
      },
    });

    const committed = await service.commitArtifactSourceFileDeletion(command);
    const replayed = await service.commitArtifactSourceFileDeletion(command);
    const restoreAfterSourceDelete = await service.restoreArtifactRecord({
      contractVersion: "v1alpha1",
      type: "restore_artifact_record",
      commandId: id(956),
      correlationId: id(957),
      clientInstanceId: id(958),
      artifactId: artifact.artifactId,
      expectedArtifactRevision: 1,
    } satisfies RestoreArtifactRecordCommand);

    expect(committed).toMatchObject({
      ok: true,
      value: {
        status: "accepted",
        sourceFileDeleted: true,
        deletionMode: "os_trash",
        lifecycle: {
          revision: 1,
          deleted: true,
          sourceDeleted: true,
          sourceDeletedAt: "2026-08-06T11:00:00.000Z",
          sourceDeletionMode: "os_trash",
        },
      },
    });
    expect(replayed).toMatchObject({
      ok: true,
      value: {
        status: "replayed",
        sourceFileDeleted: true,
        deletionMode: "os_trash",
      },
    });
    expect(restoreAfterSourceDelete).toMatchObject({
      ok: false,
      error: { code: "desktop.artifact_restore_unavailable" },
    });
    expect(JSON.stringify(committed)).not.toContain("/Users/example/private-root");
    expect(JSON.stringify(committed)).not.toContain("reports/out.xlsx");
  });

  it("registers MAR-1.0 manual workspace artifacts into a global catalog without synthetic Task identity", async () => {
    const internalSessionId = id(2);
    const task = persistedDocumentTask(internalSessionId, "reports/out.xlsx");
    const manualArtifacts = manualArtifactPersistence();
    const service = new DesktopTaskProjectionService({
      tasks: taskPersistence(task),
      metadata: sessionMetadata(internalSessionId, "session:desktop-a"),
      deliveries: submitTurnPersistence(),
      artifactLifecycles: new FakeArtifactLifecyclePersistence(),
      manualArtifacts,
      workspaces: workspaceGrantPersistence({
        status: "active",
        rootRealPath: "/Users/example/private-root",
      }),
      clock: { now: () => "2026-08-06T12:00:00.000Z" },
      projectionStartedAt: "2026-08-05T09:00:00.000Z",
    });

    const registered = await service.registerManualArtifact({
      command: {
        contractVersion: "v1alpha1",
        type: "register_workspace_artifact",
        commandId: id(960),
        correlationId: id(961),
        clientInstanceId: id(962),
      },
      workspaceGrantId: "workspace.grant-test",
      relativePath: "manual/report.html",
      fileSha256: "a".repeat(64),
      byteSize: 42,
      mediaType: "text/html",
      displayName: "report.html",
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    expect(registered.value.artifact).toMatchObject({
      sourceKind: "workspace_file",
      displayName: "report.html",
      kind: "html",
      mediaType: "text/html",
      relativePath: "manual/report.html",
      byteSize: 42,
      previewState: "available",
      lifecycle: {
        revision: 0,
        pinned: false,
        dismissed: false,
        deleted: false,
        sourceDeleted: false,
      },
    });
    expect(registered.value.artifact).not.toHaveProperty("originTaskId");

    const detail = await service.loadDetail({
      desktopTaskId: `task:${task.head.taskId}`,
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.value.artifacts).toHaveLength(1);
    expect(detail.value.artifacts[0]?.sourceKind).toBe("tool_observation");

    const catalog = await service.listArtifactCatalog({
      contractVersion: "v1alpha1",
      type: "list_artifacts",
      queryId: id(963),
      correlationId: id(964),
      clientInstanceId: id(965),
    });
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;
    expect(catalog.value.artifacts.map((artifact) => artifact.sourceKind).sort())
      .toEqual(["tool_observation", "workspace_file"]);
    const manual = catalog.value.artifacts.find((artifact) =>
      artifact.sourceKind === "workspace_file");
    expect(manual).toBeDefined();
    if (manual === undefined) return;
    expect(manual).not.toHaveProperty("originTaskId");
    const serialized = JSON.stringify(manual);
    expect(serialized).not.toContain("/Users/example/private-root");
    expect(serialized).not.toContain("workspace.grant-test");
    expect(serialized).not.toContain("a".repeat(64));
    expect(serialized).not.toContain("session:desktop-a");

    const source = await service.resolveArtifactFileSource({
      artifactId: manual.artifactId,
    });
    expect(source).toMatchObject({
      ok: true,
      value: {
        artifactId: manual.artifactId,
        relativePath: "manual/report.html",
        workspaceGrantId: "workspace.grant-test",
        rootRealPath: "/Users/example/private-root",
      },
    });
    if (source.ok) expect(source.value).not.toHaveProperty("taskId");
    const preview = await service.previewArtifact({
      contractVersion: "v1alpha1",
      type: "artifact_preview",
      queryId: id(966),
      correlationId: id(967),
      clientInstanceId: id(968),
      artifactId: manual.artifactId,
      mode: "text",
      maxBytes: 256,
    });
    expect(preview).toMatchObject({
      ok: false,
      error: { code: "desktop.artifact_not_found" },
    });
  });

  it("keeps MAR-1.0 manual Artifact registration replayable and conflict-aware", async () => {
    const internalSessionId = id(2);
    const manualArtifacts = manualArtifactPersistence();
    const service = new DesktopTaskProjectionService({
      tasks: taskPersistence(persistedDocumentTask(internalSessionId, "reports/out.xlsx")),
      metadata: sessionMetadata(internalSessionId, "session:desktop-a"),
      deliveries: submitTurnPersistence(),
      artifactLifecycles: new FakeArtifactLifecyclePersistence(),
      manualArtifacts,
      workspaces: workspaceGrantPersistence({
        status: "active",
        rootRealPath: "/Users/example/private-root",
      }),
      clock: { now: () => "2026-08-06T12:00:00.000Z" },
      projectionStartedAt: "2026-08-05T09:00:00.000Z",
    });
    const command = {
      contractVersion: "v1alpha1",
      type: "register_workspace_artifact",
      commandId: id(970),
      correlationId: id(971),
      clientInstanceId: id(972),
    } as const;
    const first = await service.registerManualArtifact({
      command,
      workspaceGrantId: "workspace.grant-test",
      relativePath: "manual/report.xlsx",
      fileSha256: "b".repeat(64),
      byteSize: 64,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const replay = await service.registerManualArtifact({
      command,
      workspaceGrantId: "workspace.grant-test",
      relativePath: "manual/report.xlsx",
      fileSha256: "b".repeat(64),
      byteSize: 64,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const conflict = await service.registerManualArtifact({
      command: {
        ...command,
        commandId: id(973),
      },
      workspaceGrantId: "workspace.grant-test",
      relativePath: "manual/report.xlsx",
      fileSha256: "c".repeat(64),
      byteSize: 64,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const invalidPath = await service.registerManualArtifact({
      command: {
        ...command,
        commandId: id(974),
      },
      workspaceGrantId: "workspace.grant-test",
      relativePath: "../manual/report.xlsx",
      fileSha256: "b".repeat(64),
      byteSize: 64,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const revokedService = new DesktopTaskProjectionService({
      tasks: taskPersistence(persistedDocumentTask(internalSessionId, "reports/out.xlsx")),
      metadata: sessionMetadata(internalSessionId, "session:desktop-a"),
      deliveries: submitTurnPersistence(),
      manualArtifacts,
      workspaces: workspaceGrantPersistence({
        status: "revoked",
        rootRealPath: "/Users/example/private-root",
      }),
      clock: { now: () => "2026-08-06T12:00:00.000Z" },
      projectionStartedAt: "2026-08-05T09:00:00.000Z",
    });
    const revoked = await revokedService.registerManualArtifact({
      command: {
        ...command,
        commandId: id(975),
      },
      workspaceGrantId: "workspace.grant-test",
      relativePath: "manual/other.xlsx",
      fileSha256: "b".repeat(64),
      byteSize: 64,
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(first).toMatchObject({ ok: true, value: { status: "accepted" } });
    expect(replay).toMatchObject({ ok: true, value: { status: "replayed" } });
    expect(conflict).toMatchObject({
      ok: false,
      error: { code: "desktop.artifact_registration_conflict" },
    });
    expect(invalidPath).toMatchObject({
      ok: false,
      error: { code: "desktop.artifact_registration_invalid" },
    });
    expect(revoked).toMatchObject({
      ok: false,
      error: { code: "desktop.workspace_unavailable" },
    });
  });

  it("resolves APV-2 file source only through active workspace authority", async () => {
    const internalSessionId = id(2);
    const task = persistedDocumentTask(internalSessionId, "reports/out.xlsx");
    const service = new DesktopTaskProjectionService({
      tasks: taskPersistence(task),
      metadata: sessionMetadata(internalSessionId, "session:desktop-a"),
      deliveries: submitTurnPersistence(),
      workspaces: workspaceGrantPersistence({
        status: "active",
        rootRealPath: "/Users/example/private-root",
      }),
      clock: { now: () => "2026-08-06T09:00:00.000Z" },
      projectionStartedAt: "2026-08-05T09:00:00.000Z",
    });
    const detail = await service.loadDetail({
      desktopTaskId: `task:${task.head.taskId}`,
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const artifact = detail.value.artifacts.at(0);
    expect(artifact).toBeDefined();
    if (artifact === undefined) return;

    const resolved = await service.resolveArtifactFileSource({
      artifactId: artifact.artifactId,
    });
    const revokedService = new DesktopTaskProjectionService({
      tasks: taskPersistence(task),
      metadata: sessionMetadata(internalSessionId, "session:desktop-a"),
      deliveries: submitTurnPersistence(),
      workspaces: workspaceGrantPersistence({
        status: "revoked",
        rootRealPath: "/Users/example/private-root",
      }),
      clock: { now: () => "2026-08-06T09:00:00.000Z" },
      projectionStartedAt: "2026-08-05T09:00:00.000Z",
    });
    const revoked = await revokedService.resolveArtifactFileSource({
      artifactId: artifact.artifactId,
    });

    expect(resolved).toEqual({
      ok: true,
      value: {
        artifactId: artifact.artifactId,
        taskId: `task:${task.head.taskId}`,
        displayName: "out.xlsx",
        relativePath: "reports/out.xlsx",
        workspaceGrantId: "workspace.grant-test",
        rootRealPath: "/Users/example/private-root",
      },
    });
    expect(revoked).toMatchObject({
      ok: false,
      error: { code: "desktop.workspace_unavailable" },
    });
  });

  it("resolves artifact file source from locked runtime selection when action payload omits workspaceGrantId", async () => {
    const internalSessionId = id(2);
    const task = persistedDocumentTask(internalSessionId, "reports/out.xlsx");
    const toolStep = task.checkpoint.state.runs[0]!.steps[0]!;
    delete (toolStep.action.payload as Record<string, unknown>).workspaceGrantId;
    expect(JSON.stringify(toolStep.action.payload)).not.toContain("workspace.grant-test");
    const service = new DesktopTaskProjectionService({
      tasks: taskPersistence(task, { runtimeWorkspaceGrantId: "workspace.grant-test" }),
      metadata: sessionMetadata(internalSessionId, "session:desktop-a"),
      deliveries: submitTurnPersistence(),
      workspaces: workspaceGrantPersistence({
        status: "active",
        rootRealPath: "/Users/example/private-root",
      }),
      clock: { now: () => "2026-08-06T09:00:00.000Z" },
      projectionStartedAt: "2026-08-05T09:00:00.000Z",
    });
    const detail = await service.loadDetail({
      desktopTaskId: `task:${task.head.taskId}`,
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const artifact = detail.value.artifacts.at(0);
    expect(artifact).toBeDefined();
    if (artifact === undefined) return;

    const resolved = await service.resolveArtifactFileSource({
      artifactId: artifact.artifactId,
    });

    expect(resolved).toEqual({
      ok: true,
      value: {
        artifactId: artifact.artifactId,
        taskId: `task:${task.head.taskId}`,
        displayName: "out.xlsx",
        relativePath: "reports/out.xlsx",
        workspaceGrantId: "workspace.grant-test",
        rootRealPath: "/Users/example/private-root",
      },
    });
  });

  it("resolves a restarted v1alpha4 Task only through the readable locked runtime selection", async () => {
    const internalSessionId = id(2);
    const task = persistedDocumentTask(internalSessionId, "reports/out.xlsx");
    const toolStep = task.checkpoint.state.runs[0]!.steps[0]!;
    delete (toolStep.action.payload as Record<string, unknown>).workspaceGrantId;
    const modelLock = {
      lockId: id(904),
      capabilityId: "model.default",
      lockDigest: `sha256:${"f".repeat(64)}`,
    };
    const reasoningModeLock = createReasoningModeLockV1Alpha2({
      schemaVersion: "v1alpha2",
      reasoningModeLockId: id(905),
      taskId: task.head.taskId,
      modelLockRef: {
        lockId: modelLock.lockId,
        lockDigest: modelLock.lockDigest,
      },
      lockedAt: "2026-08-05T09:00:00.000Z",
      requestedMode: "default",
      resolution: "default_passthrough",
    });
    const readableSelection = createTaskRuntimeSelectionV1Alpha4({
      schemaVersion: "v1alpha4",
      runtimeSelectionId: id(903),
      taskId: task.head.taskId,
      agent: {
        agentDefinitionId: "agent.general",
        revision: `sha256:${"e".repeat(64)}`,
        digest: `sha256:${"e".repeat(64)}`,
      },
      agentResourceDecisionDigest: `sha256:${"a".repeat(64)}`,
      resourceEntitlementSnapshotDigest: `sha256:${"b".repeat(64)}`,
      modelSelectionSource: "stable_fallback",
      resolvedModelLock: modelLock,
      activeSkillRevisions: [],
      toolLocks: [],
      knowledgeRevisions: [],
      reasoningModeLock,
      workspaceGrantId: "workspace.grant-test",
      platformPromptRevision: `sha256:${"1".repeat(64)}`,
      registryRevision: `sha256:${"2".repeat(64)}`,
      createdAt: "2026-08-05T09:00:00.000Z",
    });
    const loadLegacySelection = vi.fn(async () => {
      throw new Error("legacy selection parser must not run for v1alpha4");
    });
    const loadReadableSelection = vi.fn(async () => readableSelection);
    const tasks = {
      ...taskPersistence(task),
      loadTaskRuntimeSelection: loadLegacySelection,
      loadReadableTaskRuntimeSelection: loadReadableSelection,
    } as unknown as TaskPersistence;
    const service = new DesktopTaskProjectionService({
      tasks,
      metadata: sessionMetadata(internalSessionId, "session:desktop-a"),
      deliveries: submitTurnPersistence(),
      workspaces: workspaceGrantPersistence({
        status: "active",
        rootRealPath: "/Users/example/private-root",
      }),
      clock: { now: () => "2026-08-06T09:00:00.000Z" },
      projectionStartedAt: "2026-08-05T09:00:00.000Z",
    });
    const detail = await service.loadDetail({
      desktopTaskId: `task:${task.head.taskId}`,
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;

    const resolved = await service.resolveArtifactFileSource({
      artifactId: detail.value.artifacts[0]!.artifactId,
    });

    expect(resolved).toMatchObject({
      ok: true,
      value: {
        taskId: `task:${task.head.taskId}`,
        relativePath: "reports/out.xlsx",
        workspaceGrantId: "workspace.grant-test",
      },
    });
    expect(loadReadableSelection).toHaveBeenCalledWith(task.head.taskId);
    expect(loadLegacySelection).not.toHaveBeenCalled();
  });
});

function persistedDocumentTask(
  internalSessionId: string,
  relativePath: string,
): PersistedTask {
  const observation = succeededObservation({
    observationId: id(501),
    actionId: id(401),
    output: {
      status: "succeeded",
      result: {
        format: "xlsx",
        relativePath,
        sha256: "a".repeat(64),
        logicalWorkbookDigest: "b".repeat(64),
        byteSize: 4096,
        sheetCount: 1,
        cellCount: 2,
        mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        warnings: [],
      },
      metadata: {
        originalCount: 1,
        returnedCount: 1,
        truncated: false,
        resultDigest: "c".repeat(64),
        timingMs: 1,
      },
    },
  });
  const state = TaskRunStateSchema.parse({
    taskId: id(101),
    sessionId: internalSessionId,
    agentDefinition: {
      agentDefinitionId: "agent.general",
      version: "1.0.0",
    },
    goal: "create spreadsheet",
    status: "completed",
    revision: 2,
    runs: [{
      runId: id(301),
      attempt: 1,
      status: "succeeded",
      steps: [step({
        stepId: id(601),
        action: {
          actionId: id(401),
          kind: "tool.document.xlsx.write",
          payload: {
            workspaceRoot: "/Users/example/private-root",
            workspaceGrantId: "workspace.grant-test",
            relativePath: "ignored/action.xlsx",
            workbook: {
              sheets: [{ name: "Secrets", rows: [["do-not-leak"]] }],
            },
          },
        },
        observation,
      })],
      startedAt: "2026-08-05T09:00:00.000Z",
      updatedAt: "2026-08-05T09:01:00.000Z",
      endedAt: "2026-08-05T09:01:00.000Z",
    }],
    createdAt: "2026-08-05T09:00:00.000Z",
    updatedAt: "2026-08-05T09:01:00.000Z",
    endedAt: "2026-08-05T09:01:00.000Z",
  });
  return {
    head: {
      schemaVersion: PersistenceSchemaVersion,
      taskId: state.taskId,
      initializationDigest: sha256CanonicalJson(JsonValueSchema.parse({
        taskId: state.taskId,
        goal: state.goal,
        agentDefinition: state.agentDefinition,
        createdAt: state.createdAt,
      })),
      stateRevision: state.revision,
      lastEventSequence: 2,
      latestCheckpointId: id(701),
      status: state.status,
      updatedAt: state.updatedAt,
    },
    checkpoint: {
      schemaVersion: PersistenceSchemaVersion,
      checkpointId: id(701),
      taskId: state.taskId,
      stateRevision: state.revision,
      lastEventSequence: 2,
      state,
      stateDigest: sha256CanonicalJson(JsonValueSchema.parse(state)),
      createdAt: state.updatedAt,
    },
  };
}

function pendingOverwriteConfirmation(action: Action): PersistedUserConfirmation {
  const scope = {
    schemaVersion: PersistenceSchemaVersion,
    type: "single_action" as const,
    taskId: id(101),
    runId: id(301),
    stepId: id(601),
    actionId: action.actionId,
    actionDigest: sha256CanonicalJson(JsonValueSchema.parse(action)),
    toolCapabilityRevision: `sha256:${"1".repeat(64)}`,
    bindingRevision: `sha256:${"2".repeat(64)}`,
    adapterDescriptorRevision: `sha256:${"3".repeat(64)}`,
  };
  return {
    request: {
      schemaVersion: PersistenceSchemaVersion,
      confirmationId: id(901),
      runId: scope.runId,
      stepId: scope.stepId,
      actionId: scope.actionId,
      scope,
      scopeDigest: sha256CanonicalJson(JsonValueSchema.parse(scope)),
      displaySummary: "Confirm this exact Tool Action",
      requestedAt: "2026-08-06T08:59:00.000Z",
      expiresAt: "2026-08-06T09:10:00.000Z",
    },
  };
}

function step(input: {
  stepId: string;
  action: Action;
  observation: Observation;
}): TaskRunState["runs"][number]["steps"][number] {
  return {
    stepId: input.stepId,
    sequence: 1,
    status: input.observation.outcome,
    planRevision: {
      executionPlanId: id(801),
      planRevisionId: id(802),
      revision: 1,
    },
    action: input.action,
    observation: input.observation,
    startedAt: "2026-08-05T09:00:00.000Z",
    updatedAt: input.observation.observedAt,
    endedAt: input.observation.observedAt,
  };
}

function succeededObservation(input: {
  observationId: string;
  actionId: string;
  output: unknown;
}): Extract<Observation, { outcome: "succeeded" }> {
  return {
    observationId: input.observationId,
    actionId: input.actionId,
    observedAt: "2026-08-05T09:01:00.000Z",
    outcome: "succeeded",
    output: JsonValueSchema.parse(input.output),
  };
}

function taskPersistence(
  task: PersistedTask,
  options: { runtimeWorkspaceGrantId?: string } = {},
): TaskPersistence {
  const binding: TaskSubmitTurnBinding = {
    schemaVersion: PersistenceSchemaVersion,
    submitTurnCommandId: id(901),
    clientTurnId: "turn:apv-1a",
    sessionId: task.checkpoint.state.sessionId ?? id(2),
    userMessageId: id(902),
    taskId: task.head.taskId,
    runtimeSelectionId: id(903),
    bundleDigest: `sha256:${"d".repeat(64)}`,
    createdAt: "2026-08-05T09:00:00.000Z",
  };
  const selection: TaskRuntimeSelection = {
    schemaVersion: PersistenceSchemaVersion,
    runtimeSelectionId: id(903),
    taskId: task.head.taskId,
    agent: {
      agentDefinitionId: "agent.general",
      revision: `sha256:${"e".repeat(64)}`,
      digest: `sha256:${"e".repeat(64)}`,
    },
    agentDefaultModelId: "model.default",
    resolvedModelLock: {
      lockId: id(904),
      capabilityId: "model.default",
      lockDigest: `sha256:${"f".repeat(64)}`,
    },
    activeSkillRevisions: [],
    toolLocks: [],
    knowledgeRevisions: [],
    platformPromptRevision: `sha256:${"1".repeat(64)}`,
    registryRevision: `sha256:${"2".repeat(64)}`,
    selectionDigest: `sha256:${"3".repeat(64)}`,
    ...(options.runtimeWorkspaceGrantId === undefined
      ? {}
      : { workspaceGrantId: options.runtimeWorkspaceGrantId }),
    createdAt: "2026-08-05T09:00:00.000Z",
  };
  return {
    loadTask: async () => task,
    listTasks: async () => [task],
    listTasksBySession: async () => [task],
    listEffectAttemptsByTask: async () => [],
    listUserConfirmationsByTask: async (): Promise<readonly PersistedUserConfirmation[]> => [],
    loadSubmitTurnBindingByTaskId: async () => binding,
    loadTaskRuntimeSelection: async () => selection,
    loadReadableTaskRuntimeSelection: async () => selection,
    loadEventsAfter: async () => [],
  } as unknown as TaskPersistence;
}

function sessionMetadata(
  internalSessionId: string,
  desktopSessionId: string,
): DesktopSessionMetadataPersistence {
  return {
    listDesktopSessions: async () => [{
      internalSessionId,
      summary: {
        sessionId: desktopSessionId,
        title: "APV",
        createdAt: "2026-08-05T09:00:00.000Z",
        updatedAt: "2026-08-05T09:00:00.000Z",
        revision: 1,
        tombstoned: false,
      },
    }],
  } as unknown as DesktopSessionMetadataPersistence;
}

function submitTurnPersistence(): SubmitTurnPersistence {
  return {
    appendDelivery: async () => ({
      ok: true as const,
      replayed: false,
      value: {
        sequence: 1,
      },
    }),
    deliveryBounds: async () => ({ oldestSequence: 0, latestSequence: 0 }),
  } as unknown as SubmitTurnPersistence;
}

class FakeArtifactLifecyclePersistence implements ArtifactLifecyclePersistence {
  readonly #records = new Map<string, ArtifactLifecycleRecord>();
  readonly #receipts = new Map<string, DesktopFoundationReceipt>();

  async findArtifactLifecycleCommandReceipt(
    commandId: string,
  ): Promise<DesktopFoundationReceipt | undefined> {
    return this.#receipts.get(commandId);
  }

  async loadArtifactLifecycle(
    artifactId: string,
  ): Promise<ArtifactLifecycleRecord | undefined> {
    return this.#records.get(artifactId);
  }

  async listArtifactLifecycleByTask(
    taskId: string,
  ): Promise<readonly ArtifactLifecycleRecord[]> {
    return [...this.#records.values()].filter((record) => record.taskId === taskId);
  }

  async commitArtifactLifecycle(input: {
    artifactId: string;
    taskId?: string;
    sourceDigest: string;
    lifecycle: ArtifactLifecycleProjection;
    commandId: string;
    requestDigest: string;
    committedAt: string;
  }): Promise<DesktopFoundationWriteResult<ArtifactLifecycleProjection>> {
    const receipt = this.#receipts.get(input.commandId);
    if (receipt?.commandType === "set_artifact_lifecycle") {
      return { ok: true, replayed: true, value: receipt.lifecycle };
    }
    this.#records.set(input.artifactId, {
      artifactId: input.artifactId,
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      sourceDigest: input.sourceDigest,
      lifecycle: input.lifecycle,
    });
    this.#receipts.set(input.commandId, {
      commandId: input.commandId,
      commandType: "set_artifact_lifecycle",
      requestDigest: input.requestDigest,
      resourceId: input.artifactId,
      committedAt: input.committedAt,
      artifactId: input.artifactId,
      lifecycle: input.lifecycle,
    });
    return { ok: true, replayed: false, value: input.lifecycle };
  }
}

function manualArtifactPersistence(): ManualArtifactRegistrationPersistence {
  const records = new Map<string, ManualArtifactRegistrationRecord>();
  const receipts = new Map<string, DesktopFoundationReceipt>();
  const projection = (record: ManualArtifactRegistrationRecord) => ({
    artifactId: record.artifactId,
    sourceKind: "workspace_file" as const,
    sourceId: record.sourceId,
    sourceDigest: record.sourceDigest,
    displayName: record.displayName,
    kind: record.kind,
    mediaType: record.mediaType,
    relativePath: record.relativePath,
    byteSize: record.byteSize,
    createdAt: record.createdAt,
    previewState: record.previewState,
    lifecycle: {
      revision: 0,
      pinned: false,
      dismissed: false,
      deleted: false,
      sourceDeleted: false,
    },
    metadata: record.metadata,
  });
  return {
    adapterKind: "persistence",
    componentId: "persistence.manual-artifact.fake",
    status: () => ({ ok: true, componentId: "persistence.manual-artifact.fake" }),
    start: async () => {},
    stop: async () => {},
    findManualArtifactRegistrationCommandReceipt: async (commandId) =>
      receipts.get(commandId),
    loadManualArtifactRegistration: async (artifactId) => records.get(artifactId),
    findManualArtifactRegistrationByWorkspacePath: async (input) =>
      [...records.values()].find((record) =>
        record.workspaceGrantId === input.workspaceGrantId
        && record.relativePath === input.relativePath),
    listManualArtifactRegistrations: async () => [...records.values()],
    commitManualArtifactRegistration: async (input) => {
      const existingReceipt = receipts.get(input.commandId);
      if (existingReceipt?.commandType === "register_workspace_artifact") {
        if (existingReceipt.requestDigest !== input.requestDigest) {
          return {
            ok: false,
            error: {
              code: "desktop.command_idempotency_conflict",
              message: "manual artifact command digest changed",
              category: "persistence",
              retryable: false,
            },
          };
        }
        return { ok: true, replayed: true, value: existingReceipt.artifact };
      }
      const samePath = [...records.values()].find((record) =>
        record.workspaceGrantId === input.record.workspaceGrantId
        && record.relativePath === input.record.relativePath);
      if (samePath !== undefined) {
        if (samePath.sourceDigest !== input.record.sourceDigest) {
          return {
            ok: false,
            error: {
              code: "desktop.artifact_registration_conflict",
              message: "manual artifact source changed",
              category: "persistence",
              retryable: false,
            },
          };
        }
        const existing = projection(samePath);
        receipts.set(input.commandId, {
          commandId: input.commandId,
          commandType: "register_workspace_artifact",
          requestDigest: input.requestDigest,
          resourceId: samePath.artifactId,
          committedAt: input.committedAt,
          artifact: existing,
        });
        return { ok: true, replayed: false, value: existing };
      }
      const created = projection(input.record);
      records.set(input.record.artifactId, input.record);
      receipts.set(input.commandId, {
        commandId: input.commandId,
        commandType: "register_workspace_artifact",
        requestDigest: input.requestDigest,
        resourceId: input.record.artifactId,
        committedAt: input.committedAt,
        artifact: created,
      });
      return { ok: true, replayed: false, value: created };
    },
  } as ManualArtifactRegistrationPersistence;
}

function workspaceGrantPersistence(input: {
  status: WorkspaceGrantRecord["status"];
  rootRealPath: string;
}): WorkspaceGrantPersistence {
  return {
    loadWorkspaceGrant: async (workspaceGrantId) => {
      if (workspaceGrantId !== "workspace.grant-test") return undefined;
      return {
        workspaceGrantId,
        displayName: "Workspace",
        rootDisplayPath: "Project",
        accessMode: "read_write",
        status: input.status,
        createdAt: "2026-08-05T09:00:00.000Z",
        ...(input.status === "revoked"
          ? { revokedAt: "2026-08-06T09:00:00.000Z" }
          : {}),
        rootRealPath: input.rootRealPath,
      };
    },
  } as WorkspaceGrantPersistence;
}
