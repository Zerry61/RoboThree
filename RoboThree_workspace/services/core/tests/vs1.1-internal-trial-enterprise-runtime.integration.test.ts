import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONTRACT_VERSION, JsonValueSchema } from "@robothree/contracts";
import { TEXT_FILE_WRITE_CAPABILITY_ID } from "@robothree/document-worker";
import { afterEach, describe, expect, it } from "vitest";

import {
  INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV,
} from "../src/adapters/environment/internal-trial-enterprise-access-token-provider.js";
import { createDesktopPrivateRuntime } from
  "../src/bootstrap/create-desktop-private-runtime.js";
import {
  INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV,
} from "../src/bootstrap/internal-trial-enterprise-model-deployment.js";
import {
  createAdapterDescriptor,
  createCapabilityBinding,
  createCapabilityDefinition,
} from "../src/registry/capability-revision.js";
import { RegistryBuilder } from "../src/registry/registry-builder.js";
import { sha256CanonicalJson } from "../src/persistence/digest.js";
import {
  projectEnterpriseProviderToolName,
} from "../src/application/enterprise-model-request-converter.js";
import { makeDocxSpikeFixture } from
  "../../document-worker/tests/fixtures/docx-fixtures.js";

const source = Object.freeze({
  trust: "enterprise" as const,
  packageId: "deployment.internal-trial.vs1",
  packageRevision: `sha256:${"a".repeat(64)}` as const,
});
const servers: Server[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    })));
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("VS1.1 internal-trial Enterprise runtime", () => {
  it("streams a real Gateway reply and restores the durable conversation after restart", async () => {
    const gateway = await startGatewayFixture();
    const directory = await mkdtemp(join(tmpdir(), "robothree-vs11-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "core.sqlite");
    const first = createDesktopPrivateRuntime({
      databasePath,
      authorizationToken: "vs1-first-core-private-token-00000001",
      environment: environment(gateway.origin),
    });
    await first.start();
    let sessionId: string;
    try {
      const created = await first.facade.createSession({
        contractVersion: "v1alpha1",
        type: "create_session",
        commandId: "019f7447-a784-77b2-a716-000000002101",
        correlationId: "019f7447-a784-77b2-a716-000000002102",
        clientInstanceId: "019f7447-a784-77b2-a716-000000002103",
        title: "VS1.1 真实模型",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error(created.error.code);
      sessionId = created.value.sessionId;

      const submitted = await first.facade.submitTurnV1Alpha5({
        contractVersion: "v1alpha5",
        type: "submit_turn",
        commandId: "019f7447-a784-77b2-a716-000000002104",
        correlationId: "019f7447-a784-77b2-a716-000000002105",
        clientInstanceId: "019f7447-a784-77b2-a716-000000002103",
        clientTurnId: "vs1.1-turn-0001",
        sessionId,
        userInput: "请用一句话确认真实企业模型链路。",
        selectionRequest: {
          agentId: "agent.general",
          requestedModelId: "model.internal-trial",
          selectedSkillIds: [],
          selectedKnowledgeIds: [],
          authorizationPreference: {
            schemaVersion: "v1alpha1",
            requestedMode: "task_scoped",
          },
          reasoningPreference: { requestedMode: "default" },
        },
      });
      expect(submitted).toMatchObject({
        ok: true,
        value: {
          runtimeSelectionSummary: {
            resolvedModel: { id: "model.internal-trial" },
            allowedTools: [
              { id: "tool.document.docx.read" },
              { id: "tool.document.pdf.extract_text" },
              { id: "tool.document.pptx.write" },
              { id: "tool.document.xlsx.read" },
              { id: TEXT_FILE_WRITE_CAPABILITY_ID },
            ],
          },
        },
      });

      const snapshot = await waitForAssistant(
        first,
        sessionId,
        gateway.paths,
      );
      expect(snapshot.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: "assistant", content: "VS1.1 真实企业模型回复" }),
      ]));
      expect(gateway.authorizationHeaders).toEqual([
        expect.stringMatching(/^Bearer /u),
        expect.stringMatching(/^Bearer /u),
        expect.stringMatching(/^Bearer /u),
      ]);
      expect(gateway.paths).toEqual([
        "POST /v1alpha3/model-invocations",
        expect.stringMatching(/^GET \/v1alpha3\/model-invocations\/[^/]+$/u),
        expect.stringMatching(
          /^GET \/v1alpha3\/model-invocations\/[^/]+\/events\?cursor=/u,
        ),
      ]);
    } finally {
      await first.stop();
    }

    const second = createDesktopPrivateRuntime({
      databasePath,
      authorizationToken: "vs1-second-core-private-token-0000002",
      environment: environment(gateway.origin),
    });
    await second.start();
    try {
      const restored = await second.facade.loadConversationSnapshot({
        contractVersion: "v1alpha1",
        type: "conversation_snapshot",
        queryId: "019f7447-a784-77b2-a716-000000002106",
        correlationId: "019f7447-a784-77b2-a716-000000002107",
        clientInstanceId: "019f7447-a784-77b2-a716-000000002103",
        sessionId,
      });
      expect(restored).toMatchObject({
        ok: true,
        value: { messages: expect.arrayContaining([
          expect.objectContaining({
            role: "assistant",
            content: "VS1.1 真实企业模型回复",
          }),
        ]) },
      });
    } finally {
      await second.stop();
    }
  });

  it("locks the presentation Agent, explicit local Skill, CPC bundle, and PPTX tool context", async () => {
    const gateway = await startGatewayFixture();
    const directory = await mkdtemp(join(tmpdir(), "robothree-vs12-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "core.sqlite");
    const runtime = createDesktopPrivateRuntime({
      databasePath,
      authorizationToken: "vs12-core-private-token-000000000001",
      environment: environment(gateway.origin),
    });
    await runtime.start();
    try {
      const agents = await runtime.facade.listAgents({
        contractVersion: "v1alpha1",
        type: "list_agents",
        queryId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId: "019f7447-a784-77b2-a716-000000002103",
      });
      expect(agents).toMatchObject({
        ok: true,
        value: [{
          agentId: "agent.presentation",
          name: "演示文稿助手",
          runnable: true,
          skills: [{ id: "skill.presentation-planning", available: true }],
          tools: [
            { id: "tool.document.docx.read", available: true },
            { id: "tool.document.xlsx.read", available: true },
            { id: "tool.document.pdf.extract_text", available: true },
            { id: "tool.document.pptx.write", available: true },
          ],
        }],
      });

      const created = await runtime.facade.createSession({
        contractVersion: "v1alpha1",
        type: "create_session",
        commandId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId: "019f7447-a784-77b2-a716-000000002103",
        title: "VS1.2 演示文稿",
      });
      if (!created.ok) throw new Error(created.error.code);
      const submitted = await runtime.facade.submitTurnV1Alpha5({
        contractVersion: "v1alpha5",
        type: "submit_turn",
        commandId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId: "019f7447-a784-77b2-a716-000000002103",
        clientTurnId: "vs1.2-presentation-0001",
        sessionId: created.value.sessionId,
        userInput: "请生成一份 5 页项目汇报 PPT。",
        selectionRequest: {
          agentId: "agent.presentation",
          requestedModelId: "model.internal-trial",
          selectedSkillIds: ["skill.presentation-planning"],
          selectedKnowledgeIds: [],
          authorizationPreference: {
            schemaVersion: "v1alpha1",
            requestedMode: "task_scoped",
          },
          reasoningPreference: { requestedMode: "default" },
        },
      });
      if (!submitted.ok) throw new Error(JSON.stringify(submitted.error));
      expect(submitted).toMatchObject({
        ok: true,
        value: {
          runtimeSelectionSummary: {
            agent: { id: "agent.presentation" },
            activeSkills: [{ id: "skill.presentation-planning" }],
            allowedTools: [
              { id: "tool.document.docx.read" },
              { id: "tool.document.pdf.extract_text" },
              { id: "tool.document.pptx.write" },
              { id: "tool.document.xlsx.read" },
            ],
          },
        },
      });
      await waitForAssistant(runtime, created.value.sessionId, gateway.paths);
      expect(gateway.requests).toHaveLength(1);
      const serialized = JSON.stringify(gateway.requests[0]);
      expect(serialized).toContain("RoboThree Instruction Bundle v1");
      expect(serialized).toContain("演示文稿助手");
      expect(serialized).toContain("演示文稿规划");
      expect(serialized).toContain("tool.document.pptx.write");
      expect(serialized).not.toContain("materializedRef");
      expect(serialized).not.toContain("services/core/resources/skills");
    } finally {
      await runtime.stop();
    }
  });

  it("lets the general Agent execute a real PPTX tool call in the selected workspace", async () => {
    const relativePath = "项目汇报.pptx";
    const gateway = await startGatewayFixture({ pptxToolCall: relativePath });
    const directory = await mkdtemp(join(tmpdir(), "robothree-vs12-pptx-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "core.sqlite");
    const runtime = createDesktopPrivateRuntime({
      databasePath,
      authorizationToken: "vs12-pptx-core-private-token-00001",
      environment: environment(gateway.origin),
      vs1TestHarness: true,
    });
    await runtime.start();
    try {
      const clientInstanceId = "019f7447-a784-77b2-a716-000000002103";
      const workspaceCorrelationId = randomUUID();
      const selectionHandle = runtime.testOnlyIssueWorkspaceSelection?.({
        selectedPath: directory,
        clientInstanceId,
        correlationId: workspaceCorrelationId,
      });
      if (selectionHandle === undefined) throw new Error("missing VS1 test harness");
      const workspace = await runtime.facade.createWorkspaceGrant({
        contractVersion: "v1alpha1",
        type: "create_workspace_grant",
        commandId: randomUUID(),
        correlationId: workspaceCorrelationId,
        clientInstanceId,
        selectionHandle,
        displayName: "VS1.2 Workspace",
        accessMode: "read_write",
      });
      if (!workspace.ok) throw new Error(workspace.error.code);
      const session = await runtime.facade.createSession({
        contractVersion: "v1alpha1",
        type: "create_session",
        commandId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId,
        title: "VS1.2 PPTX Tool",
      });
      if (!session.ok) throw new Error(session.error.code);
      const submitted = await runtime.facade.submitTurnV1Alpha5({
        contractVersion: "v1alpha5",
        type: "submit_turn",
        commandId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId,
        clientTurnId: "vs1.2-pptx-tool-0001",
        sessionId: session.value.sessionId,
        userInput: "请生成一份项目汇报 PPT，保存为项目汇报.pptx。",
        selectionRequest: {
          agentId: "agent.general",
          requestedModelId: "model.internal-trial",
          selectedSkillIds: [],
          selectedKnowledgeIds: [],
          workspaceGrantId: workspace.value.workspaceGrantId,
          authorizationPreference: {
            schemaVersion: "v1alpha1",
            requestedMode: "task_scoped",
          },
          reasoningPreference: { requestedMode: "default" },
        },
      });
      if (!submitted.ok) throw new Error(JSON.stringify(submitted.error));
      const snapshot = await waitForAssistantText(
        runtime,
        session.value.sessionId,
        "PPTX 已真实生成",
        submitted.value.taskId,
        () => ({
          paths: gateway.paths,
          requests: gateway.requests,
        }),
      );
      expect(snapshot.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: "assistant", content: "PPTX 已真实生成" }),
      ]));
      const detail = await runtime.facade.loadTaskDetail({
        contractVersion: "v1alpha1",
        type: "task_detail",
        queryId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId,
        taskId: submitted.value.taskId,
      });
      expect(detail).toMatchObject({
        ok: true,
        value: {
          summary: { displayStatus: "completed" },
          toolActivities: [expect.objectContaining({ status: "completed" })],
          artifacts: [expect.objectContaining({
            displayName: relativePath,
            mediaType:
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            previewState: "available",
          })],
        },
      });
      expect(gateway.requests).toHaveLength(2);
      expect(JSON.stringify(gateway.requests[1])).toContain("tool.document.pptx.write");
      expect(JSON.stringify(gateway.requests[1])).toContain(relativePath);
      const createdFile = await import("node:fs/promises").then(({ stat }) =>
        stat(join(directory, relativePath)));
      expect(createdFile.isFile()).toBe(true);
      expect(createdFile.size).toBeGreaterThan(0);
    } finally {
      await runtime.stop();
    }
  }, 20_000);

  it("reads a real workspace DOCX before generating the PPTX", async () => {
    const sourceRelativePath = "项目资料.docx";
    const outputRelativePath = "资料汇报.pptx";
    const gateway = await startGatewayFixture({
      docxReadThenPptx: { sourceRelativePath, outputRelativePath },
    });
    const directory = await mkdtemp(join(tmpdir(), "robothree-vs21-docx-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, sourceRelativePath), makeDocxSpikeFixture({
      includeSectionBreak: true,
    }));
    const runtime = createDesktopPrivateRuntime({
      databasePath: join(directory, "core.sqlite"),
      authorizationToken: "vs21-docx-core-private-token-000001",
      environment: environment(gateway.origin),
      vs1TestHarness: true,
    });
    await runtime.start();
    try {
      const clientInstanceId = "019f7447-a784-77b2-a716-000000002103";
      const workspaceCorrelationId = randomUUID();
      const selectionHandle = runtime.testOnlyIssueWorkspaceSelection?.({
        selectedPath: directory,
        clientInstanceId,
        correlationId: workspaceCorrelationId,
      });
      if (selectionHandle === undefined) throw new Error("missing VS2 test harness");
      const workspace = await runtime.facade.createWorkspaceGrant({
        contractVersion: "v1alpha1",
        type: "create_workspace_grant",
        commandId: randomUUID(),
        correlationId: workspaceCorrelationId,
        clientInstanceId,
        selectionHandle,
        displayName: "VS2.1 Workspace",
        accessMode: "read_write",
      });
      if (!workspace.ok) throw new Error(workspace.error.code);
      const session = await runtime.facade.createSession({
        contractVersion: "v1alpha1",
        type: "create_session",
        commandId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId,
        title: "VS2.1 DOCX to PPTX",
      });
      if (!session.ok) throw new Error(session.error.code);
      const submitted = await runtime.facade.submitTurnV1Alpha5({
        contractVersion: "v1alpha5",
        type: "submit_turn",
        commandId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId,
        clientTurnId: "vs2.1-docx-to-pptx-0001",
        sessionId: session.value.sessionId,
        userInput: `请读取 ${sourceRelativePath}，并生成 ${outputRelativePath}。`,
        selectionRequest: {
          agentId: "agent.presentation",
          requestedModelId: "model.internal-trial",
          selectedSkillIds: ["skill.presentation-planning"],
          selectedKnowledgeIds: [],
          workspaceGrantId: workspace.value.workspaceGrantId,
          authorizationPreference: {
            schemaVersion: "v1alpha1",
            requestedMode: "task_scoped",
          },
          reasoningPreference: { requestedMode: "default" },
        },
      });
      if (!submitted.ok) throw new Error(JSON.stringify(submitted.error));
      await waitForAssistantText(
        runtime,
        session.value.sessionId,
        "已根据工作空间资料生成 PPTX",
        submitted.value.taskId,
        () => ({ paths: gateway.paths, requests: gateway.requests }),
      );
      expect(gateway.requests).toHaveLength(3);
      expect(JSON.stringify(gateway.requests[1])).toContain("段落 Unicode 你好 β");
      expect(JSON.stringify(gateway.requests[1])).toContain("tool.document.docx.read");
      expect(JSON.stringify(gateway.requests[2])).toContain("tool.document.pptx.write");
      const followUp = await runtime.facade.submitTurnV1Alpha5({
        contractVersion: "v1alpha5",
        type: "submit_turn",
        commandId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId,
        clientTurnId: "vs3-follow-up-context-0001",
        sessionId: session.value.sessionId,
        userInput: "将第 3 页改为风险与下一步，并生成修订版，不覆盖原文件。",
        selectionRequest: {
          agentId: "agent.presentation",
          requestedModelId: "model.internal-trial",
          selectedSkillIds: ["skill.presentation-planning"],
          selectedKnowledgeIds: [],
          workspaceGrantId: workspace.value.workspaceGrantId,
          authorizationPreference: {
            schemaVersion: "v1alpha1",
            requestedMode: "task_scoped",
          },
          reasoningPreference: { requestedMode: "default" },
        },
      });
      if (!followUp.ok) throw new Error(JSON.stringify(followUp.error));
      await waitForGatewayRequestCount(gateway.requests, 4);
      const followUpRequest = JSON.stringify(gateway.requests[3]);
      expect(followUpRequest).toContain(
        `请读取 ${sourceRelativePath}，并生成 ${outputRelativePath}。`,
      );
      expect(followUpRequest).toContain("已根据工作空间资料生成 PPTX");
      expect(followUpRequest).toContain(outputRelativePath);
      const detail = await runtime.facade.loadTaskDetail({
        contractVersion: "v1alpha1",
        type: "task_detail",
        queryId: randomUUID(),
        correlationId: randomUUID(),
        clientInstanceId,
        taskId: submitted.value.taskId,
      });
      expect(detail).toMatchObject({
        ok: true,
        value: {
          summary: { displayStatus: "completed" },
          toolActivities: expect.arrayContaining([
            expect.objectContaining({
              operationType: "tool.document.docx.read",
              status: "completed",
            }),
            expect.objectContaining({
              operationType: "tool.document.pptx.write",
              status: "completed",
            }),
          ]),
          artifacts: expect.arrayContaining([
            expect.objectContaining({ displayName: outputRelativePath }),
          ]),
        },
      });
      const createdFile = await import("node:fs/promises").then(({ stat }) =>
        stat(join(directory, outputRelativePath)));
      expect(createdFile.size).toBeGreaterThan(0);
    } finally {
      await runtime.stop();
    }
  }, 20_000);
});

async function waitForAssistantText(
  runtime: ReturnType<typeof createDesktopPrivateRuntime>,
  sessionId: string,
  content: string,
  taskId?: string,
  diagnostics?: () => unknown,
) {
  let last: unknown;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await runtime.facade.loadConversationSnapshot({
      contractVersion: "v1alpha1",
      type: "conversation_snapshot",
      queryId: randomUUID(),
      correlationId: randomUUID(),
      clientInstanceId: "019f7447-a784-77b2-a716-000000002103",
      sessionId,
    });
    last = result;
    if (result.ok && result.value.messages.some((message) =>
      message.role === "assistant" && message.content === content)) return result.value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const detail = taskId === undefined ? undefined : await runtime.facade.loadTaskDetail({
    contractVersion: "v1alpha1",
    type: "task_detail",
    queryId: randomUUID(),
    correlationId: randomUUID(),
    clientInstanceId: "019f7447-a784-77b2-a716-000000002103",
    taskId,
  });
  throw new Error(`VS1.2 final assistant reply unavailable: ${JSON.stringify({
    last,
    detail,
    diagnostics: diagnostics?.(),
  })}`);
}

async function waitForGatewayRequestCount(
  requests: readonly unknown[],
  expectedCount: number,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (requests.length >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Gateway request count did not reach ${expectedCount}`);
}

async function waitForAssistant(
  runtime: ReturnType<typeof createDesktopPrivateRuntime>,
  sessionId: string,
  paths: readonly string[],
) {
  let last: unknown;
  let tasks: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await runtime.facade.loadConversationSnapshot({
      contractVersion: "v1alpha1",
      type: "conversation_snapshot",
      queryId: randomUUID(),
      correlationId: randomUUID(),
      clientInstanceId: "019f7447-a784-77b2-a716-000000002103",
      sessionId,
    });
    last = result;
    tasks = await runtime.facade.listTasks({
      contractVersion: "v1alpha1",
      type: "list_tasks",
      queryId: randomUUID(),
      correlationId: randomUUID(),
      clientInstanceId: "019f7447-a784-77b2-a716-000000002103",
      sessionId,
    });
    if (result.ok && result.value.messages.some((message) =>
      message.role === "assistant" && message.status === "completed")) {
      return result.value;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`VS1.1 assistant reply did not become durable: ${JSON.stringify({
    paths,
    last,
    tasks,
  })}`);
}

async function startGatewayFixture(options: Readonly<{
  pptxToolCall?: string;
  docxReadThenPptx?: Readonly<{
    sourceRelativePath: string;
    outputRelativePath: string;
  }>;
}> = {}) {
  const paths: string[] = [];
  const authorizationHeaders: string[] = [];
  const requests: unknown[] = [];
  let accepted: Readonly<{
    invocationId: string;
    clientRequestId: string;
    requestDigest: string;
    modelId: string;
    modelRevision: string;
    configurationRevision: string;
    runtimeRegistryGeneration: string;
  }> | undefined;
  let acceptedRound = 0;
  const server = createServer(async (request, response) => {
    paths.push(`${request.method} ${request.url}`);
    authorizationHeaders.push(String(request.headers.authorization));
    if (request.method === "POST") {
      const body = JSON.parse(await readBody(request)) as {
        clientRequestId: string;
        requestDigest: string;
        modelRequest: { model: {
          modelId: string;
          modelRevision: string;
          configurationRevision: string;
          runtimeRegistryGeneration: string;
        } };
      };
      requests.push(body);
      accepted = Object.freeze({
        invocationId: randomUUID(),
        clientRequestId: body.clientRequestId,
        requestDigest: body.requestDigest,
        ...body.modelRequest.model,
      });
      acceptedRound = requests.length;
      json(response, 202, {
        contractVersion: "v1alpha3",
        invocationId: accepted.invocationId,
        clientRequestId: accepted.clientRequestId,
        requestDigest: accepted.requestDigest,
        status: "accepted",
        statusRevision: 0,
        createdAt: new Date().toISOString(),
        lastDurableEventSequence: 1,
        durableCursor: `cursor:1:${"a".repeat(16)}`,
      });
      return;
    }
    if (accepted === undefined) {
      json(response, 409, { code: "invocation_missing" });
      return;
    }
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname.endsWith("/events")) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      for (const event of gatewayEvents(accepted.invocationId, acceptedRound, options)) {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      response.end();
      return;
    }
    json(response, 200, {
      contractVersion: "v1alpha3",
      ...accepted,
      status: "running",
      statusRevision: 1,
      createdAt: new Date().toISOString(),
      lastDurableEventSequence: 1,
      durableCursor: `cursor:1:${"a".repeat(16)}`,
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("missing port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    paths,
    authorizationHeaders,
    requests,
  };
}

function gatewayEvents(
  invocationId: string,
  round: number,
  options: Readonly<{
    pptxToolCall?: string;
    docxReadThenPptx?: Readonly<{
      sourceRelativePath: string;
      outputRelativePath: string;
    }>;
  }>,
) {
  const occurredAt = new Date().toISOString();
  const common = [{
    contractVersion: "v1alpha3",
    invocationId,
    eventId: randomUUID(),
    eventClass: "ephemeral",
    streamSequence: 1,
    eventType: "started",
    eventPayload: {},
    eventDigest: "1".repeat(64),
    occurredAt,
  }];
  const response = options.docxReadThenPptx !== undefined
    ? round === 1
      ? [documentReadToolCallEvent(
        invocationId,
        options.docxReadThenPptx.sourceRelativePath,
        occurredAt,
      )]
      : round === 2
        ? [pptxToolCallEvent(
          invocationId,
          options.docxReadThenPptx.outputRelativePath,
          occurredAt,
        )]
        : [textDeltaEvent(invocationId, "已根据工作空间资料生成 PPTX", occurredAt)]
    : options.pptxToolCall === undefined || round > 1
    ? [{
    contractVersion: "v1alpha3",
    invocationId,
    eventId: randomUUID(),
    eventClass: "ephemeral",
    streamSequence: 2,
    eventType: "text_delta",
    eventPayload: { delta: options.pptxToolCall === undefined
      ? "VS1.1 真实企业模型回复"
      : "PPTX 已真实生成" },
    eventDigest: "2".repeat(64),
    occurredAt,
  }]
    : [pptxToolCallEvent(invocationId, options.pptxToolCall, occurredAt)];
  return [...common, ...response, {
    contractVersion: "v1alpha3",
    invocationId,
    eventId: randomUUID(),
    eventClass: "durable",
    durableSequence: 2,
    eventType: "completed",
    eventPayload: { status: "completed", statusRevision: 2 },
    eventDigest: "3".repeat(64),
    durableCursor: `cursor:2:${"b".repeat(16)}`,
    occurredAt,
  }];
}

function textDeltaEvent(invocationId: string, delta: string, occurredAt: string) {
  return {
    contractVersion: "v1alpha3",
    invocationId,
    eventId: randomUUID(),
    eventClass: "ephemeral",
    streamSequence: 2,
    eventType: "text_delta",
    eventPayload: { delta },
    eventDigest: "2".repeat(64),
    occurredAt,
  };
}

function documentReadToolCallEvent(
  invocationId: string,
  relativePath: string,
  occurredAt: string,
) {
  const args = { relativePath, options: {} };
  return {
    contractVersion: "v1alpha3",
    invocationId,
    eventId: randomUUID(),
    eventClass: "ephemeral",
    streamSequence: 2,
    eventType: "tool_call",
    eventPayload: { call: {
      toolCallId: randomUUID(),
      name: projectEnterpriseProviderToolName("tool.document.docx.read"),
      arguments: args,
      argumentsDigest: sha256CanonicalJson(JsonValueSchema.parse(args))
        .replace(/^sha256:/u, ""),
    } },
    eventDigest: "2".repeat(64),
    occurredAt,
  };
}

function pptxToolCallEvent(
  invocationId: string,
  relativePath: string,
  occurredAt: string,
) {
  const args = {
    relativePath,
    presentation: {
      title: "项目汇报",
      layout: "wide",
      templateRef: "robothree.default",
      slides: [{
        title: "项目概览",
        elements: [{
          type: "text",
          text: "RoboThree VS1.2 真实工具链",
          x: 0.8,
          y: 1.2,
          w: 8.8,
          h: 0.8,
          style: { fontSize: 24, bold: true, color: "111827" },
        }],
      }],
    },
  };
  return {
    contractVersion: "v1alpha3",
    invocationId,
    eventId: randomUUID(),
    eventClass: "ephemeral",
    streamSequence: 2,
    eventType: "tool_call",
    eventPayload: { call: {
      toolCallId: randomUUID(),
      name: projectEnterpriseProviderToolName("tool.document.pptx.write"),
      arguments: args,
      argumentsDigest: sha256CanonicalJson(JsonValueSchema.parse(args))
        .replace(/^sha256:/u, ""),
    } },
    eventDigest: "2".repeat(64),
    occurredAt,
  };
}

function environment(origin: string) {
  const now = Date.now();
  return {
    [INTERNAL_TRIAL_ENTERPRISE_MODEL_DEPLOYMENT_ENV]: JSON.stringify(
      deployment(origin),
    ),
    [INTERNAL_TRIAL_ENTERPRISE_ACCESS_TOKEN_ENV]: compactToken({
      issuedAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 3_600_000).toISOString(),
    }),
  };
}

function deployment(origin: string) {
  const capability = createCapabilityDefinition({
    schemaVersion: CONTRACT_VERSION,
    capabilityId: "model.internal-trial",
    kind: "model",
    name: "Internal Trial Model",
    description: "VS1.1 controlled enterprise Model",
    source,
    model: {
      family: "openai-compatible",
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 128_000,
      supportsStreaming: true,
    },
  });
  const descriptor = createAdapterDescriptor({
    schemaVersion: CONTRACT_VERSION,
    adapterDescriptorId: "adapter.model.internal-trial",
    adapterKind: "model_provider",
    source,
    implementationRef: "enterprise:model-gateway",
    runtimeBoundary: "remote",
    protocol: { name: "robothree-enterprise-model", version: "v1alpha1" },
  });
  const binding = createCapabilityBinding({
    schemaVersion: CONTRACT_VERSION,
    bindingId: "binding.model.internal-trial",
    capability: {
      capabilityId: capability.capabilityId,
      capabilityRevision: capability.revision,
    },
    adapterDescriptor: {
      adapterDescriptorId: descriptor.adapterDescriptorId,
      adapterDescriptorRevision: descriptor.revision,
    },
    port: "model_provider",
    source,
  });
  return {
    schemaVersion: "mvp-vs1.internal-trial.v1",
    centralBaseUrl: origin,
    configurationRevision: `sha256:${"c".repeat(64)}`,
    modelId: capability.capabilityId,
    modelCreatedAt: "2026-08-29T00:00:00.000Z",
    supportsToolCalling: true,
    registrySnapshot: new RegistryBuilder({ trustedSources: [source] })
      .registerCapability(capability)
      .registerAdapterDescriptor(descriptor)
      .registerBinding(binding)
      .finalize(),
  };
}

function compactToken(input: Readonly<{ issuedAt: string; expiresAt: string }>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value))
    .toString("base64url");
  return [encode({ alg: "ES256", typ: "JWT" }), encode({
    contractVersion: "v1alpha1",
    issuer: "central.internal-trial",
    audience: "enterprise-model-gateway",
    enterpriseId: "enterprise.internal-trial",
    userId: "user.internal-trial",
    deviceId: "device.internal-trial",
    clientInstanceId: "019f7447-a784-77b2-a716-000000002103",
    tokenId: randomUUID(),
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    permissions: ["model.use"],
  }), "controlled-fixture-signature"].join(".");
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  }).end(body);
}
