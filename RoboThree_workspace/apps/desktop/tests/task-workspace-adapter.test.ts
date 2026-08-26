// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import {
  desktopTaskWorkspaceAdapter,
} from "../src/renderer/adapters/task-workspace-adapter.js";

const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value });
const timestamp = "2026-08-21T00:00:00.000Z";

describe("DFE-6A task workspace adapter", () => {
  it("negotiates v1alpha2 workspace browser and reveal features through the sidecar", async () => {
    const api = installSidecar();

    const compatibility = await desktopTaskWorkspaceAdapter.negotiate();

    expect(api.getCompatibility).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: "v1alpha2",
      supportedContractVersions: ["v1alpha2", "v1alpha1"],
    }));
    expect(compatibility).toMatchObject({
      runtimeInstanceId: "runtime.instance-dfi-1b",
      browserAvailable: true,
      revealAvailable: true,
    });
  });

  it("keeps list and reveal inputs distinct without leaking paths or entry IDs into reveal", async () => {
    const api = installSidecar();
    await desktopTaskWorkspaceAdapter.listEntries({
      taskId,
      parentEntryId,
      cursor,
      limit: 25,
    });
    await desktopTaskWorkspaceAdapter.openTaskWorkspaceLocation({ taskId });

    expect(api.listWorkspaceEntries).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: "v1alpha2",
      type: "list_workspace_entries",
      taskId,
      parentEntryId,
      cursor,
      limit: 25,
    }));
    expect(api.openTaskWorkspaceLocation).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: "v1alpha2",
      type: "open_task_workspace_location",
      taskId,
    }));
    expect(JSON.stringify(api.openTaskWorkspaceLocation.mock.calls)).not.toMatch(
      /entryId|cursor|workspaceGrantId|workspaceRoot|rootRealPath|path/u,
    );
  });

  it("returns real unavailable when the sidecar or feature is missing", async () => {
    Object.defineProperty(window, "robothreeDesktopV1Alpha2", {
      configurable: true,
      value: undefined,
    });

    await expect(desktopTaskWorkspaceAdapter.listEntries({ taskId }))
      .rejects.toThrow("工作空间文件浏览接口不可用");
    expect(await desktopTaskWorkspaceAdapter.negotiate()).toMatchObject({
      browserAvailable: false,
      revealAvailable: false,
      reasonCode: "contract.feature_unavailable",
    });

    installSidecar({ features: ["enterprise_configuration_status"] });
    expect(await desktopTaskWorkspaceAdapter.negotiate()).toMatchObject({
      browserAvailable: false,
      revealAvailable: false,
      reasonCode: "contract.feature_unavailable",
    });
  });
});

const taskId = "task:44444444-4444-4444-8444-444444444444";
const parentEntryId = `wse1.${"a".repeat(24)}.${"b".repeat(24)}`;
const cursor = `wsc1.${"c".repeat(24)}.${"d".repeat(24)}`;

function installSidecar(input: {
  features?: readonly string[];
} = {}) {
  const api = {
    contractVersion: "v1alpha2" as const,
    getCompatibility: vi.fn(() => ok({
      contractVersion: "v1alpha2",
      coreVersion: "0.0.0-dfi.1b",
      supportedContractVersions: ["v1alpha1", "v1alpha2"],
      selectedContractVersion: "v1alpha2",
      features: input.features ?? [
        "enterprise_configuration_status",
        "task_workspace_browser",
        "task_workspace_reveal",
      ],
      runtimeInstanceId: "runtime.instance-dfi-1b",
      activationState: "uninitialized",
      pendingRuntimeActivation: false,
      enterpriseConfigurationStatusQueryRef: "enterprise-configuration-status:current",
    })),
    listWorkspaceEntries: vi.fn(() => ok(directory())),
    openTaskWorkspaceLocation: vi.fn(() => ok({
      contractVersion: "v1alpha2",
      commandId: "55555555-5555-4555-8555-555555555555",
      taskId,
      workspaceGrantId: "workspace:66666666-6666-4666-8666-666666666666",
      openedAt: timestamp,
    })),
  };
  Object.defineProperty(window, "robothreeDesktopV1Alpha2", {
    configurable: true,
    value: api,
  });
  return api;
}

function directory() {
  return {
    contractVersion: "v1alpha2",
    workspaceGrantId: "workspace:66666666-6666-4666-8666-666666666666",
    breadcrumbDisplayNames: [],
    entries: [],
    truncated: false,
    snapshotDigest: `sha256:${"a".repeat(64)}`,
  };
}
