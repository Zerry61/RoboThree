import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DesktopIpcRouter } from "../../apps/desktop/src/main/desktop-ipc-router.js";
import { CorePrivateClient } from "../../apps/desktop/src/main/core-private-client.js";
import { DESKTOP_IPC_CHANNELS } from "../../apps/desktop/src/shared/foundation-api.js";
import { createDesktopPrivateRuntime } from "../../services/core/src/bootstrap/create-desktop-private-runtime.js";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

describe("DCF-1.2B workbench bridge", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const item of cleanup.splice(0).reverse()) await item();
  });

  it("runs the minimum Renderer-safe workbench flow through Main and Core", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-dcf12b-"));
    const workspacePath = join(directory, "workspace");
    await mkdir(workspacePath);
    const runtime = createDesktopPrivateRuntime({
      databasePath: join(directory, "robothree.sqlite"),
      authorizationToken: "a".repeat(48),
    });
    await runtime.start();
    cleanup.push(async () => {
      await runtime.stop();
      await rm(directory, { recursive: true, force: true });
    });
    const client = new CorePrivateClient({
      baseUrl: runtime.server.baseUrl,
      authorizationToken: "a".repeat(48),
    });
    const router = new DesktopIpcRouter({
      core: { client },
      chooseWorkspaceDirectory: async () => workspacePath,
    });
    const clientInstanceId = id("1");

    const workspaceResult = await router.dispatch(
      DESKTOP_IPC_CHANNELS.createWorkspaceGrantFromPicker,
      {
        commandId: id("2"),
        correlationId: id("3"),
        clientInstanceId,
        displayName: "E2E Workspace",
        accessMode: "read_write",
      },
    );
    const workspace = success(workspaceResult) as {
      workspaceGrantId: string;
      rootDisplayPath: string;
    };
    expect(workspace.rootDisplayPath).toContain("workspace");
    expect(JSON.stringify(workspaceResult)).not.toContain("selection-handle");

    const session = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.createSession,
      {
        contractVersion: "v1alpha1",
        type: "create_session",
        commandId: id("4"),
        correlationId: id("5"),
        clientInstanceId,
        title: "E2E Session",
      },
    )) as { sessionId: string };
    const agents = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.listAgents,
      {
        contractVersion: "v1alpha1",
        type: "list_agents",
        queryId: id("6"),
        correlationId: id("7"),
        clientInstanceId,
      },
    )) as ReadonlyArray<{
      agentId: string;
      tools: ReadonlyArray<{ id: string; available: boolean }>;
    }>;
    expect(agents).toHaveLength(1);
    expect(agents[0]?.tools.map((tool) => tool.id)).toEqual([
      "tool.document.pdf.extract_text",
      "tool.document.pdf.extract_tables",
      "tool.document.xlsx.read",
      "tool.document.docx.read",
      "tool.document.xlsx.write",
      "tool.document.pptx.write",
    ]);
    expect(agents[0]?.tools.every((tool) => tool.available)).toBe(true);

    const receipt = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.submitTurn,
      {
        contractVersion: "v1alpha1",
        type: "submit_turn",
        commandId: id("8"),
        correlationId: id("9"),
        clientInstanceId,
        clientTurnId: "turn:dcf12b-e2e",
        sessionId: session.sessionId,
        userInput: "Run the DCF-1.2B workbench flow.",
        selectionRequest: {
          agentId: agents[0]!.agentId,
          selectedSkillIds: [],
          selectedKnowledgeIds: [],
          workspaceGrantId: workspace.workspaceGrantId,
        },
      },
    )) as {
      status: string;
      runtimeSelectionSummary?: {
        allowedTools: ReadonlyArray<{ id: string }>;
        workspaceGrantId?: string;
      };
    };
    expect(receipt.status).toBe("accepted");
    expect(receipt.runtimeSelectionSummary?.allowedTools.map((tool) => tool.id)).toEqual([
      "tool.document.pdf.extract_text",
      "tool.document.pdf.extract_tables",
      "tool.document.xlsx.read",
      "tool.document.docx.read",
      "tool.document.xlsx.write",
      "tool.document.pptx.write",
    ]);
    expect(receipt.runtimeSelectionSummary?.workspaceGrantId).toBe(workspace.workspaceGrantId);

    const snapshot = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.conversationSnapshot,
      {
        contractVersion: "v1alpha1",
        type: "conversation_snapshot",
        queryId: id("10"),
        correlationId: id("11"),
        clientInstanceId,
        sessionId: session.sessionId,
        limit: 200,
      },
    )) as { messages: ReadonlyArray<{ role: string; content: string }> };
    expect(snapshot.messages.map((message) => message.role))
      .toEqual(["user", "assistant"]);
    expect(snapshot.messages[1]?.content)
      .toBe("RoboThree Desktop scripted response.");

    const tasks = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.listTasks,
      {
        contractVersion: "v1alpha1",
        type: "list_tasks",
        queryId: id("12"),
        correlationId: id("13"),
        clientInstanceId,
        sessionId: session.sessionId,
      },
    )) as ReadonlyArray<{ taskId: string; displayStatus: string }>;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.displayStatus).toBe("completed");

    const detail = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.taskDetail,
      {
        contractVersion: "v1alpha1",
        type: "task_detail",
        queryId: id("14"),
        correlationId: id("15"),
        clientInstanceId,
        taskId: tasks[0]!.taskId,
      },
    )) as {
      summary: { displayStatus: string };
      runs: ReadonlyArray<{ displayStatus: string }>;
      toolActivities: readonly unknown[];
    };
    expect(detail).toMatchObject({
      summary: { displayStatus: "completed" },
      runs: [{ displayStatus: "completed" }],
      toolActivities: [],
    });
  });
});

function success(result: { ok: boolean; value?: unknown; error?: unknown }): unknown {
  if (!result.ok) throw new Error(`Expected success: ${JSON.stringify(result.error)}`);
  return result.value;
}
