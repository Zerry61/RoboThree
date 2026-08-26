import { afterEach, describe, expect, it } from "vitest";

import {
  CORE_PRIVATE_ORIGIN,
  CORE_PRIVATE_ROUTES,
  CorePrivateHttpServer,
  type DesktopApplicationFacade,
} from "../src/index.js";

const token = "t".repeat(64);
const servers: CorePrivateHttpServer[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
});

describe("DFI-1B Core private HTTP v1alpha2", () => {
  it("preserves typed workspace errors and rejects unauthorized requests", async () => {
    const server = await startServer({
      listWorkspaceEntriesV1Alpha2: async (input: { correlationId: string }) => ({
        ok: false,
        error: {
          contractVersion: "v1alpha2",
          code: "workspace.browser_grant_revoked",
          category: "authorization",
          safeSummary: "This task cannot access the requested workspace.",
          retryable: false,
          correlationId: input.correlationId,
        },
      }),
    });
    const unauthorized = await fetch(
      new URL(CORE_PRIVATE_ROUTES.workspaceEntriesV1Alpha2, server.baseUrl),
      { method: "POST", body: "{}" },
    );
    expect(unauthorized.status).toBe(401);

    const response = await post(server, CORE_PRIVATE_ROUTES.workspaceEntriesV1Alpha2, {
      contractVersion: "v1alpha2",
      queryId: "11111111-1111-4111-8111-111111111111",
      correlationId: "22222222-2222-4222-8222-222222222222",
      clientInstanceId: "33333333-3333-4333-8333-333333333333",
      type: "list_workspace_entries",
      taskId: "task:44444444-4444-4444-8444-444444444444",
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "workspace.browser_grant_revoked", contractVersion: "v1alpha2" },
    });
  });

  it("enforces the 16 KiB workspace request limit", async () => {
    const server = await startServer({});
    const response = await post(
      server,
      CORE_PRIVATE_ROUTES.workspaceEntriesV1Alpha2,
      { payload: "x".repeat(17 * 1024) },
    );
    expect(response.status).toBe(413);
  });

  it("serves the v1alpha2 Catalog routes with typed pathless projections", async () => {
    const server = await startServer({
      listRobotCatalogV1Alpha2: async () => ({ ok: true, value: robotPage() }),
      getRobotCatalogV1Alpha2: async () => ({ ok: true, value: robotDetail() }),
      listToolCatalogV1Alpha2: async () => ({ ok: true, value: toolPage() }),
      getToolCatalogV1Alpha2: async () => ({ ok: true, value: toolDetail() }),
    });
    const listRobot = await post(
      server,
      CORE_PRIVATE_ROUTES.listRobotCatalogV1Alpha2,
      { ...query(), type: "list_robot_catalog" },
    );
    expect(listRobot.status).toBe(200);
    await expect(listRobot.json()).resolves.toEqual({ ok: true, value: robotPage() });

    const getRobot = await post(
      server,
      CORE_PRIVATE_ROUTES.getRobotCatalogV1Alpha2,
      { ...query(), type: "get_robot_catalog", robotId: "agent:catalog-fixture" },
    );
    expect(getRobot.status).toBe(200);
    await expect(getRobot.json()).resolves.toEqual({ ok: true, value: robotDetail() });

    const listTool = await post(
      server,
      CORE_PRIVATE_ROUTES.listToolCatalogV1Alpha2,
      { ...query(), type: "list_tool_catalog" },
    );
    expect(listTool.status).toBe(200);
    await expect(listTool.json()).resolves.toEqual({ ok: true, value: toolPage() });

    const getTool = await post(
      server,
      CORE_PRIVATE_ROUTES.getToolCatalogV1Alpha2,
      { ...query(), type: "get_tool_catalog", toolId: "tool.catalog_fixture" },
    );
    expect(getTool.status).toBe(200);
    const getToolBody = await getTool.json();
    expect(getToolBody).toEqual({ ok: true, value: toolDetail() });
    expect(JSON.stringify(getToolBody).includes("credential")).toBe(false);
  });

  it("enforces the 16 KiB Catalog request limit independently of the transport cap", async () => {
    const server = await startServer({});
    const response = await post(
      server,
      CORE_PRIVATE_ROUTES.listToolCatalogV1Alpha2,
      { payload: "x".repeat(17 * 1024) },
    );
    expect(response.status).toBe(413);
  });
});

async function startServer(overrides: Record<string, unknown>) {
  const facade = {
    now: () => "2026-08-17T00:00:00.000Z",
    compatibilityV1Alpha2: () => ({ ok: true, value: {} }),
    listWorkspaceEntriesV1Alpha2: async () => ({ ok: true, value: {} }),
    prepareWorkspaceRevealV1Alpha2: async () => ({ ok: true, value: {} }),
    consumeWorkspaceRevealV1Alpha2: async () => ({ ok: true, value: {} }),
    ...overrides,
  } as unknown as DesktopApplicationFacade;
  const server = new CorePrivateHttpServer({ authorizationToken: token, facade });
  servers.push(server);
  await server.start();
  return server;
}

function post(server: CorePrivateHttpServer, path: string, value: unknown) {
  const body = JSON.stringify(value);
  return fetch(new URL(path, server.baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: {
      authorization: `Bearer ${token}`,
      origin: CORE_PRIVATE_ORIGIN,
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
    },
    body,
  });
}

function query() {
  return {
    contractVersion: "v1alpha2",
    queryId: "11111111-1111-4111-8111-111111111111",
    correlationId: "22222222-2222-4222-8222-222222222222",
    clientInstanceId: "33333333-3333-4333-8333-333333333333",
  } as const;
}

function robotPage() {
  return {
    contractVersion: "v1alpha2",
    queryRevision: `sha256:${"a".repeat(64)}`,
    items: [robotBase()],
  } as const;
}

function robotDetail() {
  return {
    ...robotBase(),
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

function robotBase() {
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
    items: [toolBase()],
  } as const;
}

function toolDetail() {
  return {
    ...toolBase(),
    inputShape: "structured_object",
    outputShape: "structured_object",
  } as const;
}

function toolBase() {
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
