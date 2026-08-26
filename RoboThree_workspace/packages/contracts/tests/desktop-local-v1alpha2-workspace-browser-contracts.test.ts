import { describe, expect, it } from "vitest";

import {
  DesktopErrorEnvelopeV1Alpha2Schema,
  ListWorkspaceEntriesQuerySchema,
  OpenTaskWorkspaceLocationCommandSchema,
  TaskWorkspaceOpenReceiptSchema,
  WorkspaceDirectoryProjectionSchema,
} from "../src/index.js";

const metadata = {
  contractVersion: "v1alpha2",
  queryId: "11111111-1111-4111-8111-111111111111",
  correlationId: "22222222-2222-4222-8222-222222222222",
  clientInstanceId: "33333333-3333-4333-8333-333333333333",
} as const;

describe("DFI-1A Desktop workspace browser contract", () => {
  it("accepts only task-authorized bounded queries", () => {
    expect(ListWorkspaceEntriesQuerySchema.parse({
      ...metadata,
      type: "list_workspace_entries",
      taskId: "task:44444444-4444-4444-8444-444444444444",
      limit: 200,
    }).limit).toBe(200);
    expect(ListWorkspaceEntriesQuerySchema.safeParse({
      ...metadata,
      type: "list_workspace_entries",
      taskId: "task:44444444-4444-4444-8444-444444444444",
      workspaceGrantId: "workspace:55555555-5555-4555-8555-555555555555",
    }).success).toBe(false);
    expect(ListWorkspaceEntriesQuerySchema.safeParse({
      ...metadata,
      type: "list_workspace_entries",
      taskId: "task:44444444-4444-4444-8444-444444444444",
      limit: 201,
    }).success).toBe(false);
  });

  it("keeps symlinks unavailable and cursor state exact", () => {
    const base = {
      contractVersion: "v1alpha2",
      workspaceGrantId: "workspace:55555555-5555-4555-8555-555555555555",
      breadcrumbDisplayNames: [],
      entries: [{
        entryId: "wse1.eyJraW5kIjoiZW50cnkifQ.dGVzdC1zaWduYXR1cmUtdGhhdC1pcy1sb25nLWVub3VnaA",
        displayName: "link",
        kind: "symlink",
        navigable: false,
        unavailableReason: "workspace.symlink_navigation_disabled",
      }],
      truncated: false,
      snapshotDigest: `sha256:${"a".repeat(64)}`,
    } as const;
    expect(WorkspaceDirectoryProjectionSchema.safeParse(base).success).toBe(true);
    expect(WorkspaceDirectoryProjectionSchema.safeParse({
      ...base,
      truncated: true,
    }).success).toBe(false);
  });

  it("freezes the task-bound reveal command and path-free receipt", () => {
    const command = {
      contractVersion: "v1alpha2",
      commandId: "66666666-6666-4666-8666-666666666666",
      correlationId: metadata.correlationId,
      clientInstanceId: metadata.clientInstanceId,
      type: "open_task_workspace_location",
      taskId: "task:44444444-4444-4444-8444-444444444444",
    } as const;
    expect(OpenTaskWorkspaceLocationCommandSchema.safeParse(command).success).toBe(true);
    expect(OpenTaskWorkspaceLocationCommandSchema.safeParse({
      ...command,
      workspaceGrantId: "workspace:55555555-5555-4555-8555-555555555555",
    }).success).toBe(false);
    const receipt = TaskWorkspaceOpenReceiptSchema.parse({
      contractVersion: "v1alpha2",
      commandId: command.commandId,
      taskId: command.taskId,
      workspaceGrantId: "workspace:55555555-5555-4555-8555-555555555555",
      openedAt: "2026-08-17T00:00:00.000Z",
    });
    expect(JSON.stringify(receipt)).not.toContain("/Users/");
  });

  it("supports v1alpha2 typed errors without widening v1alpha1", () => {
    expect(DesktopErrorEnvelopeV1Alpha2Schema.parse({
      contractVersion: "v1alpha2",
      code: "workspace.reveal_outcome_uncertain",
      category: "uncertain",
      safeSummary: "The outcome is uncertain.",
      retryable: false,
      correlationId: metadata.correlationId,
    }).code).toBe("workspace.reveal_outcome_uncertain");
  });
});
