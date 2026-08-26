import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DesktopIpcRouter } from "../../apps/desktop/src/main/desktop-ipc-router.js";
import { CorePrivateClient } from "../../apps/desktop/src/main/core-private-client.js";
import { DESKTOP_IPC_CHANNELS } from "../../apps/desktop/src/shared/foundation-api.js";
import { createDesktopPrivateRuntime } from "../../services/core/src/bootstrap/create-desktop-private-runtime.js";
import { makePdfFixture } from "../../services/document-worker/tests/fixtures/pdf-fixtures.js";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

describe("DTP-3B Document Tool productization", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const item of cleanup.splice(0).reverse()) await item();
  });

  it("runs a real PDF Tool call from Desktop submitTurn through Document Worker to conversation output", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dtp3b-"));
    const workspacePath = join(directory, "workspace");
    await mkdir(workspacePath);
    await writeFile(
      join(workspacePath, "sample.pdf"),
      makePdfFixture([{ text: "DTP three B PDF tool result" }]),
    );
    const runtime = createDesktopPrivateRuntime({
      databasePath: join(directory, "robothree.sqlite"),
      authorizationToken: "b".repeat(48),
    });
    await runtime.start();
    cleanup.push(async () => {
      await runtime.stop();
      await rm(directory, { recursive: true, force: true });
    });
    const router = new DesktopIpcRouter({
      core: {
        client: new CorePrivateClient({
          baseUrl: runtime.server.baseUrl,
          authorizationToken: "b".repeat(48),
        }),
      },
      chooseWorkspaceDirectory: async () => workspacePath,
    });
    const clientInstanceId = id("31");

    const workspace = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.createWorkspaceGrantFromPicker,
      {
        commandId: id("32"),
        correlationId: id("33"),
        clientInstanceId,
        displayName: "DTP-3B Workspace",
        accessMode: "read_write",
      },
    )) as { workspaceGrantId: string };
    const session = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.createSession,
      {
        contractVersion: "v1alpha1",
        type: "create_session",
        commandId: id("34"),
        correlationId: id("35"),
        clientInstanceId,
        title: "DTP-3B Session",
      },
    )) as { sessionId: string };
    const agents = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.listAgents,
      {
        contractVersion: "v1alpha1",
        type: "list_agents",
        queryId: id("36"),
        correlationId: id("37"),
        clientInstanceId,
      },
    )) as ReadonlyArray<{ agentId: string }>;

    const receipt = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.submitTurn,
      {
        contractVersion: "v1alpha1",
        type: "submit_turn",
        commandId: id("38"),
        correlationId: id("39"),
        clientInstanceId,
        clientTurnId: "turn:dtp3b-pdf",
        sessionId: session.sessionId,
        userInput: "Read sample.pdf",
        selectionRequest: {
          agentId: agents[0]!.agentId,
          selectedSkillIds: [],
          selectedKnowledgeIds: [],
          workspaceGrantId: workspace.workspaceGrantId,
        },
      },
    )) as { status: string };
    expect(receipt.status).toBe("accepted");

    const snapshot = await waitForSnapshot(router, {
      clientInstanceId,
      sessionId: session.sessionId,
      minMessageCount: 4,
    });
    expect(snapshot.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(snapshot.messages[1]?.content).toBe("Using 1 Tool.");
    expect(snapshot.messages[2]?.content).toContain("Document tool: tool.document.pdf.extract_text");
    expect(snapshot.messages[2]?.content).toContain("DTP three B PDF tool result");
    expect(snapshot.messages[3]?.content).toContain("Document tool completed.");
    expect(snapshot.messages[3]?.content).toContain("DTP three B PDF tool result");
    expect(JSON.stringify(snapshot)).not.toContain(workspacePath);

    const tasks = await waitForCompletedTasks(router, {
      clientInstanceId,
      sessionId: session.sessionId,
    });
    expect(tasks).toEqual([expect.objectContaining({ displayStatus: "completed" })]);

    const detail = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.taskDetail,
      {
        contractVersion: "v1alpha1",
        type: "task_detail",
        queryId: id("44"),
        correlationId: id("45"),
        clientInstanceId,
        taskId: tasks[0]!.taskId,
      },
    )) as {
      toolActivities: ReadonlyArray<{
        toolName: string;
        status: string;
        statusSummary: string;
      }>;
    };
    expect(detail.toolActivities).toEqual([
      expect.objectContaining({
        toolName: "adapter.tool.document-worker",
        status: "completed",
        statusSummary: "Tool action completed.",
      }),
    ]);
    expect(JSON.stringify(detail)).not.toContain(workspacePath);
  });

  it("runs a real PDF table Tool call from Desktop submitTurn to assistant table summary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-pdt3-"));
    const workspacePath = join(directory, "workspace");
    await mkdir(workspacePath);
    await writeFile(
      join(workspacePath, "tables.pdf"),
      makePdfFixture([{
        textRuns: tableRuns([
          ["Region", "Q1", "Q2"],
          ["North", "120", "135"],
          ["South", "90", "111"],
        ]),
      }]),
    );
    const runtime = createDesktopPrivateRuntime({
      databasePath: join(directory, "robothree.sqlite"),
      authorizationToken: "d".repeat(48),
    });
    await runtime.start();
    cleanup.push(async () => {
      await runtime.stop();
      await rm(directory, { recursive: true, force: true });
    });
    const router = new DesktopIpcRouter({
      core: {
        client: new CorePrivateClient({
          baseUrl: runtime.server.baseUrl,
          authorizationToken: "d".repeat(48),
        }),
      },
      chooseWorkspaceDirectory: async () => workspacePath,
    });
    const clientInstanceId = id("51");

    const workspace = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.createWorkspaceGrantFromPicker,
      {
        commandId: id("52"),
        correlationId: id("53"),
        clientInstanceId,
        displayName: "PDT-3 Workspace",
        accessMode: "read_write",
      },
    )) as { workspaceGrantId: string };
    const session = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.createSession,
      {
        contractVersion: "v1alpha1",
        type: "create_session",
        commandId: id("54"),
        correlationId: id("55"),
        clientInstanceId,
        title: "PDT-3 PDF Table Session",
      },
    )) as { sessionId: string };
    const agents = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.listAgents,
      {
        contractVersion: "v1alpha1",
        type: "list_agents",
        queryId: id("56"),
        correlationId: id("57"),
        clientInstanceId,
      },
    )) as ReadonlyArray<{ agentId: string }>;

    const receipt = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.submitTurn,
      {
        contractVersion: "v1alpha1",
        type: "submit_turn",
        commandId: id("58"),
        correlationId: id("59"),
        clientInstanceId,
        clientTurnId: "turn:pdt3-pdf-tables",
        sessionId: session.sessionId,
        userInput: "Extract tables from tables.pdf",
        selectionRequest: {
          agentId: agents[0]!.agentId,
          selectedSkillIds: [],
          selectedKnowledgeIds: [],
          workspaceGrantId: workspace.workspaceGrantId,
        },
      },
    )) as { status: string };
    expect(receipt.status).toBe("accepted");

    const snapshot = await waitForSnapshot(router, {
      clientInstanceId,
      sessionId: session.sessionId,
      minMessageCount: 4,
    });
    expect(snapshot.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(snapshot.messages[1]?.content).toBe("Using 1 Tool.");
    expect(snapshot.messages[2]?.content).toContain("Document tool: tool.document.pdf.extract_tables");
    expect(snapshot.messages[2]?.content).toContain("[table 1] page 1, table 1: 3 rows x 3 columns");
    expect(snapshot.messages[2]?.content).toContain("Region | Q1 | Q2");
    expect(snapshot.messages[2]?.content).toContain("North | 120 | 135");
    expect(snapshot.messages[3]?.content).toContain("Document tool completed.");
    expect(snapshot.messages[3]?.content).toContain("Document tool: tool.document.pdf.extract_tables");
    expect(snapshot.messages[3]?.content).toContain("Region | Q1 | Q2");
    expect(JSON.stringify(snapshot)).not.toContain(workspacePath);
    expect(JSON.stringify(snapshot)).not.toContain("\"tables\"");

    const tasks = await waitForCompletedTasks(router, {
      clientInstanceId,
      sessionId: session.sessionId,
    });
    expect(tasks).toEqual([expect.objectContaining({ displayStatus: "completed" })]);
    const detail = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.taskDetail,
      {
        contractVersion: "v1alpha1",
        type: "task_detail",
        queryId: id("64"),
        correlationId: id("65"),
        clientInstanceId,
        taskId: tasks[0]!.taskId,
      },
    )) as {
      toolActivities: ReadonlyArray<{
        toolName: string;
        status: string;
        statusSummary: string;
      }>;
      artifacts: ReadonlyArray<{
        displayName: string;
        mediaType: string;
        previewState: string;
        metadata: Record<string, unknown>;
      }>;
    };
    expect(detail.toolActivities).toEqual([
      expect.objectContaining({
        toolName: "adapter.tool.document-worker",
        status: "completed",
        statusSummary: "Tool action completed.",
      }),
    ]);
    expect(detail.artifacts).toEqual([
      expect.objectContaining({
        displayName: "tables.pdf",
        mediaType: "application/pdf",
        previewState: "available",
      }),
    ]);
    expect(JSON.stringify(detail)).not.toContain(workspacePath);
    expect(JSON.stringify(detail)).not.toContain("\"tables\"");
    expect(JSON.stringify(detail)).not.toContain("North");
  });
});

function tableRuns(
  rows: readonly (readonly string[])[],
  startY = 720,
): { text: string; x: number; y: number }[] {
  const xs = [72, 180, 300, 420];
  const runs: { text: string; x: number; y: number }[] = [];
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const x = xs[columnIndex];
      if (x === undefined) {
        throw new Error("Fixture supports up to four columns");
      }
      runs.push({ text: cell, x, y: startY - (rowIndex * 22) });
    });
  });
  return runs;
}

async function waitForSnapshot(
  router: DesktopIpcRouter,
  input: {
    clientInstanceId: string;
    sessionId: string;
    minMessageCount: number;
  },
): Promise<{ messages: ReadonlyArray<{ role: string; content: string }> }> {
  let latest: { messages: ReadonlyArray<{ role: string; content: string }> } | undefined;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    latest = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.conversationSnapshot,
      {
        contractVersion: "v1alpha1",
        type: "conversation_snapshot",
        queryId: id(`40${attempt}`),
        correlationId: id(`41${attempt}`),
        clientInstanceId: input.clientInstanceId,
        sessionId: input.sessionId,
        limit: 200,
      },
    )) as { messages: ReadonlyArray<{ role: string; content: string }> };
    if (latest.messages.length >= input.minMessageCount) return latest;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return latest ?? { messages: [] };
}

async function waitForCompletedTasks(
  router: DesktopIpcRouter,
  input: {
    clientInstanceId: string;
    sessionId: string;
  },
): Promise<ReadonlyArray<{ taskId: string; displayStatus: string }>> {
  let latest: ReadonlyArray<{ taskId: string; displayStatus: string }> = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    latest = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.listTasks,
      {
        contractVersion: "v1alpha1",
        type: "list_tasks",
        queryId: id(`42${attempt}`),
        correlationId: id(`43${attempt}`),
        clientInstanceId: input.clientInstanceId,
        sessionId: input.sessionId,
      },
    )) as ReadonlyArray<{ taskId: string; displayStatus: string }>;
    if (latest.some((task) => task.displayStatus === "completed")) return latest;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return latest;
}

function success(result: { ok: boolean; value?: unknown; error?: unknown }): unknown {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
