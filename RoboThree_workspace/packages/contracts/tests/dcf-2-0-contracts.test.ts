import { describe, expect, it } from "vitest";

import {
  ArtifactHtmlPreviewProjectionSchema,
  ArtifactHtmlPreviewQuerySchema,
  ArtifactExportCommandSchema,
  ArtifactExportReceiptSchema,
  ArtifactCatalogItemProjectionSchema,
  ArtifactCatalogProjectionSchema,
  ArtifactLifecycleProjectionSchema,
  ArtifactLifecycleReceiptSchema,
  ArtifactOpenLocationCommandSchema,
  ArtifactOpenLocationReceiptSchema,
  ArtifactProjectionSchema,
  ArtifactPreviewCloseReceiptSchema,
  ArtifactPreviewQuerySchema,
  ArtifactSourceFileDeletionReceiptSchema,
  ArtifactTextPreviewProjectionSchema,
  CancelTaskCommandSchema,
  CloseArtifactPreviewCommandSchema,
  DeleteArtifactRecordCommandSchema,
  DeleteArtifactSourceFileCommandSchema,
  DecideUserConfirmationCommandSchema,
  DurableDesktopEventEnvelopeSchema,
  ListPendingUserConfirmationsQuerySchema,
  ListArtifactsQuerySchema,
  ListTasksQuerySchema,
  ProvideTaskInputCommandSchema,
  RegisterWorkspaceArtifactCommandSchema,
  RegisterWorkspaceArtifactReceiptSchema,
  RestoreArtifactRecordCommandSchema,
  SetArtifactLifecycleCommandSchema,
  TaskControlCommandSchema,
  TaskDetailProjectionSchema,
  TaskDisplayStatusSchema,
  TaskSummaryProjectionSchema,
  ToolActivityProjectionSchema,
  UserConfirmationProjectionSchema,
} from "../src/index.js";

const metadata = {
  contractVersion: "v1alpha1",
  commandId: "11111111-1111-4111-8111-111111111111",
  correlationId: "22222222-2222-4222-8222-222222222222",
  clientInstanceId: "33333333-3333-4333-8333-333333333333",
} as const;

const digest = `sha256:${"a".repeat(64)}`;

const summary = {
  taskId: "task.fixture-001",
  sessionId: "session.fixture-001",
  userMessageId: "message.fixture-001",
  revision: 7,
  displayStatus: "waiting_confirmation",
  createdAt: "2026-07-27T18:00:00+08:00",
  updatedAt: "2026-07-27T18:01:00+08:00",
  resolvedAgentId: "agent.general-001",
  resolvedModelId: "model.fake-001",
} as const;

describe("DCF-2.0 Desktop task and confirmation contracts", () => {
  it("freezes the initial Task display status order while allowing future additive versions", () => {
    expect(TaskDisplayStatusSchema.options).toEqual([
      "preparing",
      "queued",
      "running",
      "waiting_input",
      "waiting_confirmation",
      "recovering",
      "completed",
      "failed",
      "cancelled",
      "timed_out",
      "manual_attention",
    ]);
  });

  it("accepts all five high-level Task commands", () => {
    const commands = [
      { ...metadata, type: "cancel_task", taskId: summary.taskId, expectedTaskRevision: 7 },
      { ...metadata, type: "retry_task", taskId: summary.taskId, expectedTaskRevision: 7 },
      { ...metadata, type: "continue_task", taskId: summary.taskId, expectedTaskRevision: 7 },
      {
        ...metadata,
        type: "provide_task_input",
        taskId: summary.taskId,
        expectedTaskRevision: 7,
        input: "Continue with the approved scope.",
      },
      {
        ...metadata,
        type: "decide_user_confirmation",
        taskId: summary.taskId,
        expectedTaskRevision: 7,
        confirmationId: "confirmation.fixture-001",
        requestDigest: digest,
        decision: "confirmed",
      },
    ];
    for (const command of commands) {
      expect(TaskControlCommandSchema.safeParse(command).success).toBe(true);
    }
  });

  it("requires Task revision on all control commands", () => {
    expect(CancelTaskCommandSchema.safeParse({
      ...metadata,
      type: "cancel_task",
      taskId: summary.taskId,
    }).success).toBe(false);
  });

  it("binds a confirmation decision to confirmationId and requestDigest", () => {
    const base = {
      ...metadata,
      type: "decide_user_confirmation",
      taskId: summary.taskId,
      expectedTaskRevision: 7,
      confirmationId: "confirmation.fixture-001",
      requestDigest: digest,
      decision: "confirmed",
    };
    expect(DecideUserConfirmationCommandSchema.parse(base)).toEqual(base);
    expect(DecideUserConfirmationCommandSchema.safeParse({
      ...base,
      requestDigest: undefined,
    }).success).toBe(false);
    expect(DecideUserConfirmationCommandSchema.safeParse({
      ...base,
      requestDigest: `sha256:${"b".repeat(63)}`,
    }).success).toBe(false);
  });

  it("does not accept identity claims or mutable ActionIntent in confirmation decisions", () => {
    const base = {
      ...metadata,
      type: "decide_user_confirmation",
      taskId: summary.taskId,
      expectedTaskRevision: 7,
      confirmationId: "confirmation.fixture-001",
      requestDigest: digest,
      decision: "confirmed",
    };
    for (const forbidden of [
      { decidedByUserId: "user.fake-001" },
      { actionIntent: { command: "override" } },
      { credential: "secret" },
      { toolArguments: { path: "/sensitive" } },
    ]) {
      expect(DecideUserConfirmationCommandSchema.safeParse({
        ...base,
        ...forbidden,
      }).success).toBe(false);
    }
  });

  it("bounds user-provided continuation input", () => {
    const base = {
      ...metadata,
      type: "provide_task_input",
      taskId: summary.taskId,
      expectedTaskRevision: 7,
    };
    expect(ProvideTaskInputCommandSchema.safeParse({
      ...base,
      input: "",
    }).success).toBe(false);
    expect(ProvideTaskInputCommandSchema.safeParse({
      ...base,
      input: "x".repeat(128 * 1024 + 1),
    }).success).toBe(false);
  });

  it("keeps User Confirmation Projection product-safe and internally opaque", () => {
    const projection = {
      confirmationId: "confirmation.fixture-001",
      taskId: summary.taskId,
      requestDigest: digest,
      status: "pending",
      reasonSummary: "External transmission needs approval.",
      riskSummary: "Data will leave the local workspace.",
      targetSummary: "Approved enterprise endpoint.",
      consequenceSummary: "The selected files will be sent.",
      requestedAt: "2026-07-27T18:01:00+08:00",
    };
    expect(UserConfirmationProjectionSchema.parse(projection)).toEqual(projection);
    for (const forbidden of [
      { effect: {} },
      { receipt: {} },
      { outbox: {} },
      { checkpoint: {} },
      { capabilityLock: {} },
      { runtimeHandle: {} },
      { rawToolArguments: {} },
    ]) {
      expect(UserConfirmationProjectionSchema.safeParse({
        ...projection,
        ...forbidden,
      }).success).toBe(false);
    }
  });

  it("rejects impossible User Confirmation status metadata", () => {
    const base = {
      confirmationId: "confirmation.fixture-001",
      taskId: summary.taskId,
      requestDigest: digest,
      reasonSummary: "reason",
      riskSummary: "risk",
      targetSummary: "target",
      consequenceSummary: "consequence",
      requestedAt: "2026-07-27T18:01:00+08:00",
    };
    expect(UserConfirmationProjectionSchema.safeParse({
      ...base,
      status: "pending",
      decidedAt: "2026-07-27T18:02:00+08:00",
    }).success).toBe(false);
    expect(UserConfirmationProjectionSchema.safeParse({
      ...base,
      status: "confirmed",
    }).success).toBe(false);
  });

  it("keeps Tool Activity terminal timing consistent", () => {
    const activity = {
      activityId: "activity.fixture-001",
      taskId: summary.taskId,
      toolName: "Local File",
      operationType: "write",
      status: "uncertain",
      targetSummary: "Workspace report",
      safetySummary: "No raw arguments exposed.",
      startedAt: "2026-07-27T18:01:00+08:00",
      updatedAt: "2026-07-27T18:02:00+08:00",
      endedAt: "2026-07-27T18:02:00+08:00",
    };
    expect(ToolActivityProjectionSchema.parse(activity)).toEqual(activity);
    expect(ToolActivityProjectionSchema.safeParse({
      ...activity,
      endedAt: undefined,
    }).success).toBe(false);
    expect(ToolActivityProjectionSchema.safeParse({
      ...activity,
      status: "running",
    }).success).toBe(false);
  });

  it("requires all nested projections to belong to the same Task", () => {
    const detail = {
      summary,
      goalSummary: "Complete the requested task.",
      runs: [],
      toolActivities: [{
        activityId: "activity.fixture-001",
        taskId: "task.other-001",
        toolName: "Echo",
        operationType: "invoke",
        status: "running",
        startedAt: "2026-07-27T18:01:00+08:00",
        updatedAt: "2026-07-27T18:01:00+08:00",
      }],
      userConfirmations: [],
      latestDurableCursor: "projection-1:10",
    };
    expect(TaskDetailProjectionSchema.safeParse(detail).success).toBe(false);
  });

  it("rejects internal or sensitive fields from Task Detail", () => {
    const detail = {
      summary,
      goalSummary: "Complete the requested task.",
      runs: [],
      toolActivities: [],
      userConfirmations: [],
      latestDurableCursor: "projection-1:10",
    };
    expect(TaskDetailProjectionSchema.parse(detail)).toEqual({
      ...detail,
      artifacts: [],
    });
    for (const forbidden of [
      { effects: [] },
      { receipts: [] },
      { outbox: [] },
      { checkpoints: [] },
      { capabilityLock: {} },
      { credential: "secret" },
      { prompt: "full prompt" },
    ]) {
      expect(TaskDetailProjectionSchema.safeParse({
        ...detail,
        ...forbidden,
      }).success).toBe(false);
    }
  });

  it("accepts metadata-only Artifact projections and keeps them task-scoped", () => {
    const artifact = {
      artifactId: `artifact:${"b".repeat(64)}`,
      taskId: summary.taskId,
      sourceKind: "tool_observation",
      sourceId: "019f9990-0000-7000-8000-000000000001",
      sourceDigest: digest,
      displayName: "report.xlsx",
      kind: "spreadsheet",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      relativePath: "reports/report.xlsx",
      byteSize: 2048,
      createdAt: "2026-08-05T09:00:00.000Z",
      previewState: "available",
      metadata: {
        capabilityId: "tool.document.xlsx.write",
        sheetCount: 1,
      },
    };

    const parsedArtifact = ArtifactProjectionSchema.parse(artifact);
    expect(parsedArtifact).toEqual({
      ...artifact,
      lifecycle: {
        revision: 0,
        pinned: false,
        dismissed: false,
        deleted: false,
        sourceDeleted: false,
      },
    });
    expect(TaskDetailProjectionSchema.parse({
      summary,
      goalSummary: "Complete the requested task.",
      runs: [],
      toolActivities: [],
      userConfirmations: [],
      artifacts: [artifact],
      latestDurableCursor: "projection-1:10",
    }).artifacts).toEqual([parsedArtifact]);

    expect(TaskDetailProjectionSchema.safeParse({
      summary,
      goalSummary: "Complete the requested task.",
      runs: [],
      toolActivities: [],
      userConfirmations: [],
      artifacts: [{ ...artifact, taskId: "task.other-001" }],
      latestDurableCursor: "projection-1:10",
    }).success).toBe(false);
  });

  it("rejects Artifact projection leakage and unsafe relative paths", () => {
    const artifact = {
      artifactId: `artifact:${"c".repeat(64)}`,
      taskId: summary.taskId,
      sourceKind: "tool_observation",
      sourceId: "019f9990-0000-7000-8000-000000000002",
      sourceDigest: digest,
      displayName: "blocked.xlsx",
      kind: "spreadsheet",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      relativePath: "reports/blocked.xlsx",
      createdAt: "2026-08-05T09:00:00.000Z",
      previewState: "blocked",
      metadata: {
        capabilityId: "tool.document.xlsx.write",
      },
    };

    for (const forbidden of [
      { workspaceRoot: "/Users/example/private" },
      { workbook: { sheets: [] } },
      { sessionId: "session.fixture-001" },
      { schemaVersion: "robothree-artifact-preview/v1alpha1" },
    ]) {
      expect(ArtifactProjectionSchema.safeParse({
        ...artifact,
        ...forbidden,
      }).success).toBe(false);
    }
    for (const relativePath of [
      "../secret.xlsx",
      "/tmp/secret.xlsx",
      "C:/secret.xlsx",
      "reports\\secret.xlsx",
      "reports/\0secret.xlsx",
    ]) {
      expect(ArtifactProjectionSchema.safeParse({
        ...artifact,
        relativePath,
      }).success).toBe(false);
    }
    expect(ArtifactProjectionSchema.safeParse({
      ...artifact,
      metadata: { payload: "x".repeat(4_200) },
    }).success).toBe(false);
  });

  it("freezes MAR-1.0 global Artifact catalog and pathless registration contracts", () => {
    const manualArtifact = {
      artifactId: `artifact:${"f".repeat(64)}`,
      sourceKind: "workspace_file",
      sourceId: `sha256:${"1".repeat(64)}`,
      sourceDigest: `sha256:${"2".repeat(64)}`,
      displayName: "manual-report.html",
      kind: "document",
      mediaType: "text/html",
      relativePath: "reports/manual-report.html",
      byteSize: 42,
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
        registrationKind: "manual_workspace_file",
        previewReason: "metadata_only",
      },
    };
    expect(ArtifactCatalogItemProjectionSchema.parse(manualArtifact)).toEqual(manualArtifact);
    expect(ArtifactCatalogProjectionSchema.parse({
      generatedAt: "2026-08-06T12:00:01.000Z",
      artifacts: [manualArtifact],
    }).artifacts).toHaveLength(1);

    expect(ArtifactCatalogItemProjectionSchema.safeParse({
      ...manualArtifact,
      originTaskId: "task.synthetic-must-not-exist",
    }).success).toBe(false);
    expect(ArtifactCatalogItemProjectionSchema.safeParse({
      ...manualArtifact,
      relativePath: "../secret.html",
    }).success).toBe(false);
    expect(ArtifactCatalogItemProjectionSchema.safeParse({
      ...manualArtifact,
      metadata: { payload: "x".repeat(4_200) },
    }).success).toBe(false);
    expect(ArtifactCatalogItemProjectionSchema.safeParse({
      ...manualArtifact,
      workspaceRoot: "/Users/example/private",
    }).success).toBe(false);
    expect(ArtifactCatalogItemProjectionSchema.safeParse({
      ...manualArtifact,
      sessionId: "session.fixture-001",
    }).success).toBe(false);

    const taskArtifact = {
      ...manualArtifact,
      sourceKind: "tool_observation",
      originTaskId: summary.taskId,
    };
    expect(ArtifactCatalogItemProjectionSchema.safeParse(taskArtifact).success).toBe(true);
    expect(ArtifactCatalogItemProjectionSchema.safeParse({
      ...taskArtifact,
      originTaskId: undefined,
    }).success).toBe(false);

    const registerCommand = {
      ...metadata,
      type: "register_workspace_artifact",
    };
    expect(RegisterWorkspaceArtifactCommandSchema.parse(registerCommand)).toEqual(registerCommand);
    for (const forbidden of [
      { relativePath: "reports/manual-report.html" },
      { workspaceRoot: "/Users/example/private" },
      { rootRealPath: "/Users/example/private" },
      { fileSha256: "a".repeat(64) },
      { workbook: { sheets: [] } },
      { html: "<p>blocked</p>" },
      { sessionId: "session.fixture-001" },
    ]) {
      expect(RegisterWorkspaceArtifactCommandSchema.safeParse({
        ...registerCommand,
        ...forbidden,
      }).success).toBe(false);
    }

    expect(RegisterWorkspaceArtifactReceiptSchema.parse({
      commandId: metadata.commandId,
      artifactId: manualArtifact.artifactId,
      status: "accepted",
      artifact: manualArtifact,
    })).toMatchObject({
      status: "accepted",
      artifact: { artifactId: manualArtifact.artifactId },
    });
    expect(ListArtifactsQuerySchema.parse({
      contractVersion: "v1alpha1",
      type: "list_artifacts",
      queryId: "019fa200-0000-7000-8000-000000000001",
      correlationId: metadata.correlationId,
      clientInstanceId: metadata.clientInstanceId,
      sourceKinds: ["workspace_file"],
      includeDeleted: false,
      limit: 50,
    })).toMatchObject({
      type: "list_artifacts",
      sourceKinds: ["workspace_file"],
    });
    expect(ListArtifactsQuerySchema.safeParse({
      contractVersion: "v1alpha1",
      type: "list_artifacts",
      queryId: "019fa200-0000-7000-8000-000000000002",
      correlationId: metadata.correlationId,
      clientInstanceId: metadata.clientInstanceId,
      workspaceRoot: "/Users/example/private",
    }).success).toBe(false);
  });

  it("accepts APV-2 lifecycle metadata without source authority", () => {
    const lifecycle = {
      revision: 0,
      pinned: true,
      dismissed: false,
      deleted: false,
      sourceDeleted: false,
      updatedAt: "2026-08-06T09:00:00.000Z",
      pinnedAt: "2026-08-06T09:00:00.000Z",
    };
    expect(ArtifactLifecycleProjectionSchema.parse(lifecycle)).toEqual(lifecycle);
    expect(ArtifactLifecycleProjectionSchema.safeParse({
      ...lifecycle,
      pinned: false,
    }).success).toBe(false);
    expect(ArtifactLifecycleProjectionSchema.safeParse({
      pinned: false,
      dismissed: false,
      deleted: false,
      dismissedAt: "2026-08-06T09:00:00.000Z",
    }).success).toBe(false);
    expect(ArtifactLifecycleProjectionSchema.safeParse({
      pinned: false,
      dismissed: false,
      deleted: false,
      deletedAt: "2026-08-06T09:00:00.000Z",
    }).success).toBe(false);

    const command = {
      ...metadata,
      type: "set_artifact_lifecycle",
      artifactId: `artifact:${"d".repeat(64)}`,
      pinned: true,
    };
    expect(SetArtifactLifecycleCommandSchema.parse(command)).toEqual(command);
    expect(SetArtifactLifecycleCommandSchema.safeParse({
      ...metadata,
      type: "set_artifact_lifecycle",
      artifactId: `artifact:${"d".repeat(64)}`,
    }).success).toBe(false);
    for (const forbidden of [
      { workspaceRoot: "/Users/example/private" },
      { rootRealPath: "/Users/example/private" },
      { relativePath: "reports/report.xlsx" },
      { filePath: "/tmp/report.xlsx" },
      { workbook: { sheets: [] } },
      { sessionId: "session.fixture-001" },
    ]) {
      expect(SetArtifactLifecycleCommandSchema.safeParse({
        ...command,
        ...forbidden,
      }).success).toBe(false);
    }

    expect(ArtifactLifecycleReceiptSchema.parse({
      commandId: metadata.commandId,
      artifactId: command.artifactId,
      status: "accepted",
      lifecycle,
    })).toMatchObject({
      artifactId: command.artifactId,
      lifecycle,
    });
  });

  it("accepts APV-3A record tombstone commands by artifactId and revision only", () => {
    const artifactId = `artifact:${"e".repeat(64)}`;
    const deleteCommand = {
      ...metadata,
      type: "delete_artifact_record",
      artifactId,
      expectedArtifactRevision: 3,
      reasonSummary: "No longer needed in this task.",
    };
    const restoreCommand = {
      ...metadata,
      type: "restore_artifact_record",
      artifactId,
      expectedArtifactRevision: 4,
    };
    expect(DeleteArtifactRecordCommandSchema.parse(deleteCommand))
      .toEqual(deleteCommand);
    expect(RestoreArtifactRecordCommandSchema.parse(restoreCommand))
      .toEqual(restoreCommand);
    for (const forbidden of [
      { workspaceRoot: "/Users/example/private" },
      { rootRealPath: "/Users/example/private" },
      { relativePath: "reports/report.xlsx" },
      { filePath: "/tmp/report.xlsx" },
      { workbook: { sheets: [] } },
      { sessionId: "session.fixture-001" },
      { sourceDeleted: true },
    ]) {
      expect(DeleteArtifactRecordCommandSchema.safeParse({
        ...deleteCommand,
        ...forbidden,
      }).success).toBe(false);
      expect(RestoreArtifactRecordCommandSchema.safeParse({
        ...restoreCommand,
        ...forbidden,
      }).success).toBe(false);
    }
    expect(DeleteArtifactRecordCommandSchema.safeParse({
      ...deleteCommand,
      expectedArtifactRevision: undefined,
    }).success).toBe(false);
    expect(ArtifactLifecycleProjectionSchema.parse({
      revision: 4,
      pinned: false,
      dismissed: false,
      deleted: true,
      sourceDeleted: false,
      updatedAt: "2026-08-06T09:00:00.000Z",
      deletedAt: "2026-08-06T09:00:00.000Z",
      deletionReasonSummary: "No longer needed in this task.",
    })).toMatchObject({
      revision: 4,
      deleted: true,
      sourceDeleted: false,
    });
  });

  it("accepts APV-3B source file delete commands with explicit confirmation only", () => {
    const artifactId = `artifact:${"f".repeat(64)}`;
    const command = {
      ...metadata,
      type: "delete_artifact_source_file",
      artifactId,
      expectedArtifactRevision: 2,
      confirmationText: "DELETE report.xlsx",
    };
    expect(DeleteArtifactSourceFileCommandSchema.parse(command)).toEqual(command);
    for (const forbidden of [
      { workspaceRoot: "/Users/example/private-root" },
      { rootRealPath: "/Users/example/private-root" },
      { relativePath: "reports/report.xlsx" },
      { filePath: "/tmp/report.xlsx" },
      { workbook: { sheets: [] } },
      { sessionId: "session.fixture-001" },
      { sourceDeleted: true },
      { deletionMode: "os_trash" },
    ]) {
      expect(DeleteArtifactSourceFileCommandSchema.safeParse({
        ...command,
        ...forbidden,
      }).success).toBe(false);
    }
    const sourceDeletedLifecycle = {
      revision: 3,
      pinned: false,
      dismissed: false,
      deleted: true,
      sourceDeleted: true,
      sourceDeletedAt: "2026-08-06T11:00:00.000Z",
      sourceDeletionMode: "os_trash",
      updatedAt: "2026-08-06T11:00:00.000Z",
      deletedAt: "2026-08-06T11:00:00.000Z",
      deletionReasonSummary: "Source file moved to operating system Trash.",
    };
    expect(ArtifactLifecycleProjectionSchema.parse(sourceDeletedLifecycle))
      .toEqual(sourceDeletedLifecycle);
    expect(ArtifactLifecycleProjectionSchema.safeParse({
      ...sourceDeletedLifecycle,
      deleted: false,
    }).success).toBe(false);
    expect(ArtifactLifecycleProjectionSchema.safeParse({
      ...sourceDeletedLifecycle,
      sourceDeletedAt: undefined,
    }).success).toBe(false);
    expect(ArtifactSourceFileDeletionReceiptSchema.parse({
      commandId: metadata.commandId,
      artifactId,
      status: "accepted",
      sourceFileDeleted: true,
      deletionMode: "os_trash",
      lifecycle: sourceDeletedLifecycle,
    })).toMatchObject({
      artifactId,
      sourceFileDeleted: true,
      deletionMode: "os_trash",
    });
  });

  it("accepts APV-2 open/export commands by artifactId only", () => {
    const openCommand = {
      ...metadata,
      type: "open_artifact_location",
      artifactId: `artifact:${"e".repeat(64)}`,
    };
    const exportCommand = {
      ...metadata,
      type: "export_artifact",
      artifactId: `artifact:${"e".repeat(64)}`,
    };
    expect(ArtifactOpenLocationCommandSchema.parse(openCommand)).toEqual(openCommand);
    expect(ArtifactExportCommandSchema.parse(exportCommand)).toEqual(exportCommand);
    for (const forbidden of [
      { workspaceRoot: "/Users/example/private" },
      { rootRealPath: "/Users/example/private" },
      { relativePath: "reports/report.xlsx" },
      { targetPath: "/tmp/report.xlsx" },
      { workbook: { sheets: [] } },
      { sessionId: "session.fixture-001" },
    ]) {
      expect(ArtifactOpenLocationCommandSchema.safeParse({
        ...openCommand,
        ...forbidden,
      }).success).toBe(false);
      expect(ArtifactExportCommandSchema.safeParse({
        ...exportCommand,
        ...forbidden,
      }).success).toBe(false);
    }

    expect(ArtifactOpenLocationReceiptSchema.parse({
      commandId: metadata.commandId,
      artifactId: openCommand.artifactId,
      opened: true,
    })).toMatchObject({ opened: true });
    expect(ArtifactExportReceiptSchema.parse({
      commandId: metadata.commandId,
      artifactId: exportCommand.artifactId,
      exported: true,
      fileName: "report.xlsx",
    })).toMatchObject({ exported: true, fileName: "report.xlsx" });
    expect(ArtifactExportReceiptSchema.safeParse({
      commandId: metadata.commandId,
      artifactId: exportCommand.artifactId,
      exported: true,
      fileName: "/Users/example/private/report.xlsx",
    }).success).toBe(false);
  });

  it("accepts bounded Artifact text preview queries and rejects leakage fields", () => {
    const queryMetadata = {
      contractVersion: "v1alpha1",
      queryId: "44444444-4444-4444-8444-444444444444",
      correlationId: metadata.correlationId,
      clientInstanceId: metadata.clientInstanceId,
    };
    const query = {
      ...queryMetadata,
      type: "artifact_preview",
      artifactId: `artifact:${"d".repeat(64)}`,
      mode: "markdown",
      maxBytes: 4096,
    };
    expect(ArtifactPreviewQuerySchema.parse(query)).toEqual(query);
    for (const forbidden of [
      { workspaceRoot: "/Users/example/private" },
      { workbook: { sheets: [] } },
      { sessionId: "session.fixture-001" },
      { schemaVersion: "robothree-artifact-preview/v1alpha1" },
      { relativePath: "reports/report.xlsx" },
    ]) {
      expect(ArtifactPreviewQuerySchema.safeParse({
        ...query,
        ...forbidden,
      }).success).toBe(false);
    }
    expect(ArtifactPreviewQuerySchema.safeParse({
      ...query,
      maxBytes: 64 * 1024 + 1,
    }).success).toBe(false);
  });

  it("accepts bounded Artifact text preview projections only", () => {
    const preview = {
      artifactId: `artifact:${"e".repeat(64)}`,
      mode: "text",
      content: "Preview content",
      byteSize: new TextEncoder().encode("Preview content").byteLength,
      truncated: false,
      warnings: [],
    };
    expect(ArtifactTextPreviewProjectionSchema.parse(preview)).toEqual(preview);
    for (const forbidden of [
      { workspaceRoot: "/Users/example/private" },
      { workbook: { sheets: [] } },
      { sessionId: "session.fixture-001" },
      { schemaVersion: "robothree-artifact-preview/v1alpha1" },
      { html: "<script>alert(1)</script>" },
    ]) {
      expect(ArtifactTextPreviewProjectionSchema.safeParse({
        ...preview,
        ...forbidden,
      }).success).toBe(false);
    }
    expect(ArtifactTextPreviewProjectionSchema.safeParse({
      ...preview,
      byteSize: 1,
    }).success).toBe(false);
  });

  it("accepts APV-1C HTML preview session schemas without content authority", () => {
    const queryMetadata = {
      contractVersion: "v1alpha1",
      queryId: "55555555-5555-4555-8555-555555555555",
      correlationId: metadata.correlationId,
      clientInstanceId: metadata.clientInstanceId,
    };
    const query = {
      ...queryMetadata,
      type: "artifact_html_preview",
      artifactId: `artifact:${"f".repeat(64)}`,
      maxBytes: 4096,
      ttlMs: 60_000,
    };
    expect(ArtifactHtmlPreviewQuerySchema.parse(query)).toEqual(query);
    for (const forbidden of [
      { workspaceRoot: "/Users/example/private" },
      { relativePath: "reports/report.html" },
      { sessionId: "session.fixture-001" },
      { schemaVersion: "robothree-artifact-preview/v1alpha1" },
      { html: "<script>alert(1)</script>" },
      { previewSessionId: "preview:00000000-0000-4000-8000-000000000001" },
      { localOrigin: "http://127.0.0.1" },
    ]) {
      expect(ArtifactHtmlPreviewQuerySchema.safeParse({
        ...query,
        ...forbidden,
      }).success).toBe(false);
    }

    const projection = {
      artifactId: query.artifactId,
      previewSessionId: "preview:00000000-0000-4000-8000-000000000001",
      localOrigin: "http://127.0.0.1",
      previewUrl: "http://127.0.0.1:49152/preview:00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/index.html",
      csp: "default-src 'none'; script-src 'none'",
      expiresAt: "2026-08-05T09:00:00.000Z",
      warnings: [],
    };
    expect(ArtifactHtmlPreviewProjectionSchema.parse(projection)).toEqual(projection);
    for (const previewUrl of [
      "http://localhost:49152/index.html",
      "https://127.0.0.1:49152/index.html",
      "file:///tmp/index.html",
      "http://example.test/index.html",
    ]) {
      expect(ArtifactHtmlPreviewProjectionSchema.safeParse({
        ...projection,
        previewUrl,
      }).success).toBe(false);
    }

    const command = {
      ...metadata,
      type: "close_artifact_preview",
      previewSessionId: projection.previewSessionId,
    };
    expect(CloseArtifactPreviewCommandSchema.parse(command)).toEqual(command);
    expect(ArtifactPreviewCloseReceiptSchema.parse({
      commandId: metadata.commandId,
      previewSessionId: projection.previewSessionId,
      closed: true,
    })).toMatchObject({ closed: true });
  });

  it("keeps Task Summary strict", () => {
    expect(TaskSummaryProjectionSchema.safeParse({
      ...summary,
      internalTaskState: {},
    }).success).toBe(false);
  });

  it("defines bounded Task and pending-confirmation queries", () => {
    const queryMetadata = {
      contractVersion: "v1alpha1",
      queryId: "44444444-4444-4444-8444-444444444444",
      correlationId: metadata.correlationId,
      clientInstanceId: metadata.clientInstanceId,
    };
    expect(ListTasksQuerySchema.safeParse({
      ...queryMetadata,
      type: "list_tasks",
      displayStatuses: ["running", "manual_attention"],
      limit: 200,
    }).success).toBe(true);
    expect(ListTasksQuerySchema.safeParse({
      ...queryMetadata,
      type: "list_tasks",
      limit: 201,
    }).success).toBe(false);
    expect(ListPendingUserConfirmationsQuerySchema.safeParse({
      ...queryMetadata,
      type: "list_pending_user_confirmations",
      limit: 200,
    }).success).toBe(true);
  });

  it("emits only query references for Tool Activity and Confirmation changes", () => {
    for (const payload of [
      {
        type: "tool_activity_changed",
        taskId: summary.taskId,
        activityId: "activity.fixture-001",
        queryRef: "task.detail:task.fixture-001",
      },
      {
        type: "user_confirmation_changed",
        taskId: summary.taskId,
        confirmationId: "confirmation.fixture-001",
        queryRef: "task.detail:task.fixture-001",
      },
    ]) {
      const event = {
        contractVersion: "v1alpha1",
        eventId: "55555555-5555-4555-8555-555555555555",
        deliveryKind: "durable",
        durableCursor: "projection-1:10",
        runtimeInstanceId: "runtime.instance-001",
        emittedAt: "2026-07-27T18:02:00+08:00",
        payload,
      };
      expect(DurableDesktopEventEnvelopeSchema.safeParse(event).success).toBe(true);
      expect(DurableDesktopEventEnvelopeSchema.safeParse({
        ...event,
        payload: { ...payload, rawToolArguments: { secret: true } },
      }).success).toBe(false);
    }
  });
});
