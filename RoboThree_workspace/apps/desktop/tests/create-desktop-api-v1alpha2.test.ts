import { describe, expect, it } from "vitest";

import {
  DESKTOP_V1ALPHA2_IPC_CHANNELS,
} from "../src/shared/foundation-api.js";
import { createDesktopApiV1Alpha2 } from "../src/preload/create-desktop-api.js";

describe("DFI-1B Preload v1alpha2 sidecar", () => {
  it("exposes only the frozen sidecar members and fixed channels", async () => {
    const calls: string[] = [];
    const api = createDesktopApiV1Alpha2(async (channel) => {
      calls.push(channel);
      return {
        ok: true,
        value: channel === DESKTOP_V1ALPHA2_IPC_CHANNELS.compatibility
          ? compatibility()
          : channel === DESKTOP_V1ALPHA2_IPC_CHANNELS.listRobotCatalog
            ? robotPage()
            : channel === DESKTOP_V1ALPHA2_IPC_CHANNELS.getRobotCatalog
              ? robotDetail()
              : channel === DESKTOP_V1ALPHA2_IPC_CHANNELS.listToolCatalog
                ? toolPage()
                : channel === DESKTOP_V1ALPHA2_IPC_CHANNELS.getToolCatalog
                  ? toolDetail()
          : channel === DESKTOP_V1ALPHA2_IPC_CHANNELS.listWorkspaceEntries
            ? directory()
            : receipt(),
      };
    });
    expect(Object.keys(api)).toEqual([
      "contractVersion",
      "getCompatibility",
      "listRobotCatalog",
      "getRobotCatalog",
      "listToolCatalog",
      "getToolCatalog",
      "listWorkspaceEntries",
      "openTaskWorkspaceLocation",
    ]);
    await api.getCompatibility(compatibilityQuery());
    await api.listRobotCatalog(listRobotCatalogQuery());
    await api.getRobotCatalog(getRobotCatalogQuery());
    await api.listToolCatalog(listToolCatalogQuery());
    await api.getToolCatalog(getToolCatalogQuery());
    await api.listWorkspaceEntries(listQuery());
    await api.openTaskWorkspaceLocation(command());
    expect(calls).toEqual(Object.values(DESKTOP_V1ALPHA2_IPC_CHANNELS));
  });

  it("strictly rejects leaked path fields and invalid Main envelopes", async () => {
    const api = createDesktopApiV1Alpha2(async () => ({
      ok: true,
      value: { ...directory(), rootRealPath: "/private/secret" },
    }));
    await expect(api.listWorkspaceEntries(listQuery())).rejects.toThrow();

    const invalid = createDesktopApiV1Alpha2(async () => ({ ok: true, value: directory(), token: "x" }));
    await expect(invalid.listWorkspaceEntries(listQuery())).rejects.toThrow();
  });

  it("strictly rejects Catalog payloads with sensitive or unknown fields", async () => {
    const api = createDesktopApiV1Alpha2(async () => ({
      ok: true,
      value: {
        ...toolDetail(),
        credentialRef: "credential:secret",
      },
    }));
    await expect(api.getToolCatalog(getToolCatalogQuery())).rejects.toThrow();
  });
});

function compatibilityQuery() {
  return {
    contractVersion: "v1alpha2",
    queryId: "11111111-1111-4111-8111-111111111111",
    correlationId: "22222222-2222-4222-8222-222222222222",
    clientInstanceId: "33333333-3333-4333-8333-333333333333",
    supportedContractVersions: ["v1alpha2", "v1alpha1"],
  } as const;
}

function listQuery() {
  return {
    contractVersion: "v1alpha2",
    queryId: compatibilityQuery().queryId,
    correlationId: compatibilityQuery().correlationId,
    clientInstanceId: compatibilityQuery().clientInstanceId,
    type: "list_workspace_entries",
    taskId: "task:44444444-4444-4444-8444-444444444444",
  } as const;
}

function listRobotCatalogQuery() {
  return {
    contractVersion: "v1alpha2",
    queryId: compatibilityQuery().queryId,
    correlationId: compatibilityQuery().correlationId,
    clientInstanceId: compatibilityQuery().clientInstanceId,
    type: "list_robot_catalog",
    limit: 10,
  } as const;
}

function getRobotCatalogQuery() {
  return {
    contractVersion: "v1alpha2",
    queryId: compatibilityQuery().queryId,
    correlationId: compatibilityQuery().correlationId,
    clientInstanceId: compatibilityQuery().clientInstanceId,
    type: "get_robot_catalog",
    robotId: "agent:catalog-fixture",
  } as const;
}

function listToolCatalogQuery() {
  return {
    contractVersion: "v1alpha2",
    queryId: compatibilityQuery().queryId,
    correlationId: compatibilityQuery().correlationId,
    clientInstanceId: compatibilityQuery().clientInstanceId,
    type: "list_tool_catalog",
    limit: 10,
  } as const;
}

function getToolCatalogQuery() {
  return {
    contractVersion: "v1alpha2",
    queryId: compatibilityQuery().queryId,
    correlationId: compatibilityQuery().correlationId,
    clientInstanceId: compatibilityQuery().clientInstanceId,
    type: "get_tool_catalog",
    toolId: "tool.catalog_fixture",
  } as const;
}

function command() {
  return {
    contractVersion: "v1alpha2",
    commandId: "55555555-5555-4555-8555-555555555555",
    correlationId: compatibilityQuery().correlationId,
    clientInstanceId: compatibilityQuery().clientInstanceId,
    type: "open_task_workspace_location",
    taskId: listQuery().taskId,
  } as const;
}

function compatibility() {
  return {
    contractVersion: "v1alpha2",
    coreVersion: "0.0.0-dfi.1b",
    supportedContractVersions: ["v1alpha1", "v1alpha2"],
    selectedContractVersion: "v1alpha2",
    features: [
      "enterprise_configuration_status",
      "task_workspace_browser",
      "task_workspace_reveal",
      "robot_tool_catalog",
    ],
    runtimeInstanceId: "runtime.instance-dfi-1b",
    activationState: "uninitialized",
    pendingRuntimeActivation: false,
    enterpriseConfigurationStatusQueryRef: "enterprise-configuration-status:current",
  } as const;
}

function directory() {
  return {
    contractVersion: "v1alpha2",
    workspaceGrantId: "workspace:66666666-6666-4666-8666-666666666666",
    breadcrumbDisplayNames: [],
    entries: [],
    truncated: false,
    snapshotDigest: `sha256:${"a".repeat(64)}`,
  } as const;
}

function robotPage() {
  return {
    contractVersion: "v1alpha2",
    queryRevision: `sha256:${"a".repeat(64)}`,
    items: [robotDetailBase()],
  } as const;
}

function robotDetail() {
  return {
    ...robotDetailBase(),
    defaultModel: {
      resourceId: "model.catalog_fixture",
      displayName: "Catalog fixture model",
      availability: "unavailable",
      unavailableReason: "catalog.model_unavailable",
    },
    allowModelOverride: false,
    eligibleModels: [],
    skills: [],
    tools: [],
    knowledge: [],
  } as const;
}

function robotDetailBase() {
  return {
    robotId: "agent:catalog-fixture",
    configurationRevision: `sha256:${"b".repeat(64)}`,
    displayName: "Catalog fixture robot",
    description: "Safe catalog fixture.",
    source: "local_trusted",
    restrictionSummary: {
      models: "restricted_nonempty",
      skills: "restricted_empty",
      tools: "restricted_nonempty",
      knowledge: "restricted_empty",
    },
    runnable: false,
    unavailableReason: "catalog.model_unavailable",
  } as const;
}

function toolPage() {
  return {
    contractVersion: "v1alpha2",
    queryRevision: `sha256:${"c".repeat(64)}`,
    items: [toolDetailBase()],
  } as const;
}

function toolDetail() {
  return {
    ...toolDetailBase(),
    inputShape: "structured_object",
    outputShape: "structured_object",
  } as const;
}

function toolDetailBase() {
  return {
    toolId: "tool.catalog_fixture",
    capabilityRevision: `sha256:${"d".repeat(64)}`,
    registryRevision: `sha256:${"e".repeat(64)}`,
    displayName: "Catalog fixture tool",
    description: "Safe catalog fixture tool.",
    source: "official_package",
    readOnly: true,
    riskSummary: ["routine_file"],
    availability: "unknown",
    unavailableReason: "catalog.availability_unknown",
  } as const;
}

function receipt() {
  return {
    contractVersion: "v1alpha2",
    commandId: command().commandId,
    taskId: command().taskId,
    workspaceGrantId: "workspace:66666666-6666-4666-8666-666666666666",
    openedAt: "2026-08-17T00:00:00.000Z",
  } as const;
}
