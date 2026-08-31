import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CorePrivateClient } from "../../apps/desktop/src/main/core-private-client.js";
import { DesktopIpcRouter } from "../../apps/desktop/src/main/desktop-ipc-router.js";
import { DESKTOP_IPC_CHANNELS } from "../../apps/desktop/src/shared/foundation-api.js";
import { createDesktopPrivateRuntime } from "../../services/core/src/bootstrap/create-desktop-private-runtime.js";
import { makeDocxSpikeFixture } from "../../services/document-worker/tests/fixtures/docx-fixtures.js";
import { makeXlsxFixture } from "../../services/document-worker/tests/fixtures/xlsx-fixtures.js";
import {
  computeXlsxWriteRequestDigest,
  normalizeXlsxWriteOptions,
  readXlsx,
  writeXlsx,
} from "../../services/document-worker/src/xlsx/index.js";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

describe("DWE-3 XLSX write productization", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const item of cleanup.splice(0).reverse()) await item();
  });

  it("creates a new XLSX from a Desktop turn and preserves the completed result after Core reopen", async () => {
    const harness = await startHarness("create");
    cleanup.push(harness.cleanup);
    await mkdir(join(harness.workspacePath, "reports"));

    const workspace = await harness.createWorkspace("DWE-3 Workspace");
    const session = await harness.createSession("DWE-3 XLSX Write");
    const agentId = await harness.firstAgentId();

    const receipt = await harness.submitTurn({
      sessionId: session.sessionId,
      agentId,
      workspaceGrantId: workspace.workspaceGrantId,
      userInput: "Create reports/out.xlsx",
      clientTurnId: "turn:dwe3-create-xlsx",
      commandSuffix: "110",
    });
    expect(receipt.status).toBe("accepted");

    const snapshot = await waitForSnapshot(harness.router, {
      clientInstanceId: harness.clientInstanceId,
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
    expect(snapshot.messages[2]?.content).toContain("Document tool: tool.document.xlsx.write");
    expect(snapshot.messages[2]?.content).toContain("Created: reports/out.xlsx");
    expect(snapshot.messages[3]?.content).toContain("Document tool completed.");
    expect(JSON.stringify(snapshot)).not.toContain(harness.workspacePath);

    const targetPath = join(harness.workspacePath, "reports", "out.xlsx");
    expect(existsSync(targetPath)).toBe(true);
    assertWorkbookSmoke(await readFile(targetPath));
    await expect(readdir(join(harness.workspacePath, "reports"))).resolves.not.toContain(
      expect.stringContaining(".robothree-dwe-"),
    );

    const tasks = await waitForCompletedTasks(harness.router, {
      clientInstanceId: harness.clientInstanceId,
      sessionId: session.sessionId,
    });
    expect(tasks).toEqual([expect.objectContaining({ displayStatus: "completed" })]);
    const detail = await harness.taskDetail(tasks[0]!.taskId);
    expect(detail.toolActivities).toEqual([
      expect.objectContaining({
        toolName: "adapter.tool.document-worker",
        status: "completed",
        statusSummary: "Tool action completed.",
      }),
    ]);
    expect(JSON.stringify(detail)).not.toContain(harness.workspacePath);

    const reopened = await harness.reopen("create-reopen");
    cleanup.push(reopened.cleanup);
    const reopenedSnapshot = await waitForSnapshot(reopened.router, {
      clientInstanceId: reopened.clientInstanceId,
      sessionId: session.sessionId,
      minMessageCount: 4,
    });
    expect(reopenedSnapshot.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(reopenedSnapshot.messages[2]?.content).toContain("Created: reports/out.xlsx");
    expect(await readdir(join(harness.workspacePath, "reports"))).toEqual(["out.xlsx"]);
  });

  it("returns a typed target_exists failure from Desktop without modifying the existing file", async () => {
    const harness = await startHarness("target");
    cleanup.push(harness.cleanup);
    await writeFile(join(harness.workspacePath, "exists.xlsx"), "original-xlsx-placeholder");

    const workspace = await harness.createWorkspace("DWE-3 Exists Workspace");
    const session = await harness.createSession("DWE-3 Target Exists");
    const agentId = await harness.firstAgentId();

    await harness.submitTurn({
      sessionId: session.sessionId,
      agentId,
      workspaceGrantId: workspace.workspaceGrantId,
      userInput: "Create exists.xlsx",
      clientTurnId: "turn:dwe3-target-exists",
      commandSuffix: "210",
    });
    const snapshot = await waitForSnapshot(harness.router, {
      clientInstanceId: harness.clientInstanceId,
      sessionId: session.sessionId,
      minMessageCount: 4,
    });

    expect(snapshot.messages[2]?.role).toBe("tool");
    expect(snapshot.messages[2]?.content).toContain("XLSX target already exists");
    await expect(readFile(join(harness.workspacePath, "exists.xlsx"), "utf8"))
      .resolves.toBe("original-xlsx-placeholder");
    await expect(readdir(harness.workspacePath)).resolves.toEqual(["exists.xlsx"]);
  });

  it("keeps the real DOCX read Desktop flow working without changing the parser", async () => {
    const harness = await startHarness("docx");
    cleanup.push(harness.cleanup);
    await writeFile(
      join(harness.workspacePath, "sample.docx"),
      makeDocxSpikeFixture({ includeSectionBreak: true }),
    );

    const workspace = await harness.createWorkspace("DWE-3 DOCX Workspace");
    const session = await harness.createSession("DWE-3 DOCX Read");
    const agentId = await harness.firstAgentId();

    await harness.submitTurn({
      sessionId: session.sessionId,
      agentId,
      workspaceGrantId: workspace.workspaceGrantId,
      userInput: "Read sample.docx",
      clientTurnId: "turn:dwe3-docx-read",
      commandSuffix: "310",
    });
    const snapshot = await waitForSnapshot(harness.router, {
      clientInstanceId: harness.clientInstanceId,
      sessionId: session.sessionId,
      minMessageCount: 4,
    });

    expect(snapshot.messages[2]?.content).toContain("Document tool: tool.document.docx.read");
    expect(snapshot.messages[2]?.content).toContain("heading: 标题 Alpha");
    expect(snapshot.messages[2]?.content).toContain("paragraph: 段落 Unicode 你好 β");
    expect(snapshot.messages[3]?.content).toContain("Document tool completed.");
    expect(JSON.stringify(snapshot)).not.toContain(harness.workspacePath);
  });

  it("overwrites an existing XLSX only after explicit Desktop confirmation", async () => {
    const harness = await startHarness("overwrite");
    cleanup.push(harness.cleanup);
    await mkdir(join(harness.workspacePath, "reports"));
    const targetPath = join(harness.workspacePath, "reports", "out.xlsx");
    const oldBytes = Buffer.from(makeXlsxFixture());
    await writeFile(targetPath, oldBytes);

    const workspace = await harness.createWorkspace("DWO-3 Overwrite Workspace");
    const session = await harness.createSession("DWO-3 XLSX Overwrite");
    const agentId = await harness.firstAgentId();

    await harness.submitTurn({
      sessionId: session.sessionId,
      agentId,
      workspaceGrantId: workspace.workspaceGrantId,
      userInput: "Overwrite reports/out.xlsx",
      clientTurnId: "turn:dwo3-overwrite-xlsx",
      commandSuffix: "410",
    });

    const waiting = (await waitForTasks(harness.router, {
      clientInstanceId: harness.clientInstanceId,
      sessionId: session.sessionId,
      displayStatus: "waiting_confirmation",
    }))[0]!;
    const detail = await harness.taskDetail(waiting.taskId);
    expect(detail.userConfirmations).toEqual([
      expect.objectContaining({
        status: "pending",
        reasonSummary: "Overwrite one existing XLSX file.",
        riskSummary: "Destructive file change.",
        targetSummary: "reports/out.xlsx",
        consequenceSummary: expect.stringContaining("cannot undo"),
      }),
    ]);
    expect(detail.toolActivities).toEqual([]);
    expect(JSON.stringify(detail)).not.toContain(harness.workspacePath);
    expect(JSON.stringify(detail)).not.toContain("confirmedOldSha256");

    const confirmation = detail.userConfirmations[0]!;
    const decided = success(await harness.router.dispatch(
      DESKTOP_IPC_CHANNELS.taskControl,
      {
        contractVersion: "v1alpha1",
        type: "decide_user_confirmation",
        commandId: id("411"),
        correlationId: id("412"),
        clientInstanceId: harness.clientInstanceId,
        taskId: waiting.taskId,
        expectedTaskRevision: waiting.revision,
        confirmationId: confirmation.confirmationId,
        requestDigest: confirmation.requestDigest,
        decision: "confirmed",
      },
    )) as { status: string };
    expect(decided.status).toBe("accepted");

    const snapshot = await waitForSnapshot(harness.router, {
      clientInstanceId: harness.clientInstanceId,
      sessionId: session.sessionId,
      minMessageCount: 4,
    });
    expect(snapshot.messages[2]?.content).toContain("Document tool: tool.document.xlsx.write");
    expect(snapshot.messages[3]?.content).toContain("Document tool completed.");
    const nextBytes = await readFile(targetPath);
    expect(nextBytes.equals(oldBytes)).toBe(false);
    await assertWorkbookSmoke(nextBytes);
    await expect(readdir(join(harness.workspacePath, "reports"))).resolves.toEqual(["out.xlsx"]);
  });

  it("shows a failed Desktop result when an XLSX overwrite target drifts during confirmation", async () => {
    const harness = await startHarness("conflict");
    cleanup.push(harness.cleanup);
    await mkdir(join(harness.workspacePath, "reports"));
    const targetPath = join(harness.workspacePath, "reports", "out.xlsx");
    await writeFile(targetPath, makeXlsxFixture());

    const workspace = await harness.createWorkspace("DWO-3 Conflict Workspace");
    const session = await harness.createSession("DWO-3 XLSX Conflict");
    const agentId = await harness.firstAgentId();

    await harness.submitTurn({
      sessionId: session.sessionId,
      agentId,
      workspaceGrantId: workspace.workspaceGrantId,
      userInput: "Overwrite reports/out.xlsx",
      clientTurnId: "turn:dwo3-overwrite-conflict",
      commandSuffix: "510",
    });

    const waiting = (await waitForTasks(harness.router, {
      clientInstanceId: harness.clientInstanceId,
      sessionId: session.sessionId,
      displayStatus: "waiting_confirmation",
    }))[0]!;
    const driftBytes = await makeDifferentXlsxFixture(harness.workspacePath);
    await writeFile(targetPath, driftBytes);
    const confirmation = (await harness.taskDetail(waiting.taskId)).userConfirmations[0]!;
    const decided = success(await harness.router.dispatch(
      DESKTOP_IPC_CHANNELS.taskControl,
      {
        contractVersion: "v1alpha1",
        type: "decide_user_confirmation",
        commandId: id("511"),
        correlationId: id("512"),
        clientInstanceId: harness.clientInstanceId,
        taskId: waiting.taskId,
        expectedTaskRevision: waiting.revision,
        confirmationId: confirmation.confirmationId,
        requestDigest: confirmation.requestDigest,
        decision: "confirmed",
      },
    )) as { status: string };
    expect(decided.status).toBe("accepted");

    const failed = (await waitForTasks(harness.router, {
      clientInstanceId: harness.clientInstanceId,
      sessionId: session.sessionId,
      displayStatus: "failed",
    }))[0]!;
    const failedDetail = await harness.taskDetail(failed.taskId);
    expect(failedDetail.toolActivities).toEqual([
      expect.objectContaining({
        status: "failed",
        statusSummary: "Tool action failed.",
      }),
    ]);
    const snapshot = await waitForSnapshot(harness.router, {
      clientInstanceId: harness.clientInstanceId,
      sessionId: session.sessionId,
      minMessageCount: 3,
    });
    expect(snapshot.messages[2]?.content).toContain("XLSX overwrite target digest changed");
    if (snapshot.messages[3] !== undefined) {
      expect(snapshot.messages[3].content).toContain("Document tool failed.");
    }
    await expect(readFile(targetPath)).resolves.toEqual(driftBytes);
    await expect(readdir(join(harness.workspacePath, "reports"))).resolves.toEqual(["out.xlsx"]);
  });
});

async function startHarness(label: string) {
  const directory = await mkdtemp(join(tmpdir(), `robothree-dwe3-${label}-`));
  const workspacePath = join(directory, "workspace");
  const databasePath = join(directory, "robothree.sqlite");
  await mkdir(workspacePath);
  let runtime = createDesktopPrivateRuntime({
    databasePath,
    authorizationToken: "c".repeat(48),
    demoMode: "legacy_test",
  });
  await runtime.start();
  let stopped = false;
  const clientInstanceId = id(label === "create-reopen" ? "900" : "100");
  const router = routerFor(runtime.server.baseUrl, workspacePath, clientInstanceId);

  return {
    directory,
    workspacePath,
    databasePath,
    clientInstanceId,
    router,
    async createWorkspace(displayName: string): Promise<{ workspaceGrantId: string }> {
      return success(await router.dispatch(
        DESKTOP_IPC_CHANNELS.createWorkspaceGrantFromPicker,
        {
          commandId: id(`${label.length}01`),
          correlationId: id(`${label.length}02`),
          clientInstanceId,
          displayName,
          accessMode: "read_write",
        },
      )) as { workspaceGrantId: string };
    },
    async createSession(title: string): Promise<{ sessionId: string }> {
      return success(await router.dispatch(
        DESKTOP_IPC_CHANNELS.createSession,
        {
          contractVersion: "v1alpha1",
          type: "create_session",
          commandId: id(`${label.length}03`),
          correlationId: id(`${label.length}04`),
          clientInstanceId,
          title,
        },
      )) as { sessionId: string };
    },
    async firstAgentId(): Promise<string> {
      const agents = success(await router.dispatch(
        DESKTOP_IPC_CHANNELS.listAgents,
        {
          contractVersion: "v1alpha1",
          type: "list_agents",
          queryId: id(`${label.length}05`),
          correlationId: id(`${label.length}06`),
          clientInstanceId,
        },
      )) as ReadonlyArray<{ agentId: string }>;
      return agents[0]!.agentId;
    },
    async submitTurn(input: {
      sessionId: string;
      agentId: string;
      workspaceGrantId: string;
      userInput: string;
      clientTurnId: string;
      commandSuffix: string;
    }): Promise<{ status: string }> {
      return success(await router.dispatch(
        DESKTOP_IPC_CHANNELS.submitTurn,
        {
          contractVersion: "v1alpha1",
          type: "submit_turn",
          commandId: id(input.commandSuffix),
          correlationId: id(`${input.commandSuffix}1`),
          clientInstanceId,
          clientTurnId: input.clientTurnId,
          sessionId: input.sessionId,
          userInput: input.userInput,
          selectionRequest: {
            agentId: input.agentId,
            selectedSkillIds: [],
            selectedKnowledgeIds: [],
            workspaceGrantId: input.workspaceGrantId,
          },
        },
      )) as { status: string };
    },
    async taskDetail(taskId: string): Promise<{
      userConfirmations: ReadonlyArray<{
        confirmationId: string;
        requestDigest: string;
        status: string;
        reasonSummary: string;
        riskSummary: string;
        targetSummary: string;
        consequenceSummary: string;
      }>;
      toolActivities: ReadonlyArray<{
        toolName: string;
        status: string;
        statusSummary: string;
      }>;
    }> {
      return success(await router.dispatch(
        DESKTOP_IPC_CHANNELS.taskDetail,
        {
          contractVersion: "v1alpha1",
          type: "task_detail",
          queryId: id(`${label.length}07`),
          correlationId: id(`${label.length}08`),
          clientInstanceId,
          taskId,
        },
      )) as {
        userConfirmations: ReadonlyArray<{
          confirmationId: string;
          requestDigest: string;
          status: string;
          reasonSummary: string;
          riskSummary: string;
          targetSummary: string;
          consequenceSummary: string;
        }>;
        toolActivities: ReadonlyArray<{
          toolName: string;
          status: string;
          statusSummary: string;
        }>;
      };
    },
    async reopen(reopenLabel: string) {
      if (!stopped) {
        await runtime.stop();
        stopped = true;
      }
      runtime = createDesktopPrivateRuntime({
        databasePath,
        authorizationToken: "c".repeat(48),
        demoMode: "legacy_test",
      });
      await runtime.start();
      stopped = false;
      const reopenedClientInstanceId = id("901");
      return {
        clientInstanceId: reopenedClientInstanceId,
        router: routerFor(runtime.server.baseUrl, workspacePath, reopenedClientInstanceId),
        cleanup: async () => {
          if (!stopped) {
            await runtime.stop();
            stopped = true;
          }
        },
        reopenLabel,
      };
    },
    cleanup: async () => {
      if (!stopped) {
        await runtime.stop();
        stopped = true;
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
}

function routerFor(baseUrl: string, workspacePath: string): DesktopIpcRouter {
  return new DesktopIpcRouter({
    core: {
      client: new CorePrivateClient({
        baseUrl,
        authorizationToken: "c".repeat(48),
      }),
    },
    chooseWorkspaceDirectory: async () => workspacePath,
  });
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
  for (let attempt = 0; attempt < 40; attempt += 1) {
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
  return waitForTasks(router, { ...input, displayStatus: "completed" });
}

async function waitForTasks(
  router: DesktopIpcRouter,
  input: {
    clientInstanceId: string;
    sessionId: string;
    displayStatus: string;
  },
): Promise<ReadonlyArray<{ taskId: string; displayStatus: string; revision: number }>> {
  let latest: ReadonlyArray<{ taskId: string; displayStatus: string; revision: number }> = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
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
    )) as ReadonlyArray<{ taskId: string; displayStatus: string; revision: number }>;
    if (latest.some((task) => task.displayStatus === input.displayStatus)) {
      return latest.filter((task) => task.displayStatus === input.displayStatus);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return latest;
}

async function assertWorkbookSmoke(bytes: Buffer): Promise<void> {
  const result = await readXlsx({
    bytes,
    extension: "xlsx",
    limits: {
      maxFileBytes: 2_000_000,
      maxOutputBytes: 2_000_000,
      maxPageCount: 10,
      maxDecompressionRatio: 100,
    },
    options: {},
  });
  const output = result.output as {
    format: string;
    sheets: ReadonlyArray<{
      name: string;
      rows: ReadonlyArray<{
        cells: ReadonlyArray<{
          address: string;
          type: string;
          value: unknown;
          formula?: string;
        }>;
      }>;
    }>;
  };
  expect(output.format).toBe("xlsx");
  expect(output.sheets.map((sheet) => sheet.name)).toEqual(["Report"]);
  const cells = new Map(output.sheets[0]!.rows.flatMap((row) =>
    row.cells.map((cell) => [cell.address, cell])));
  expect(cells.get("A1")).toMatchObject({ type: "string", value: "Generated by RoboThree" });
  expect(cells.get("B2")).toMatchObject({ type: "number", value: 42 });
  expect(cells.get("A2")).toMatchObject({ type: "string", value: "=SUM(A1:A2)" });
  expect(cells.get("A2")?.formula).toBeUndefined();
}

function success(result: { ok: boolean; value?: unknown; error?: unknown }): unknown {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

async function makeDifferentXlsxFixture(workspaceRoot: string): Promise<Buffer> {
  const relativePath = "reports/drift.xlsx";
  const limits = {
    maxFileBytes: 2_000_000,
    maxOutputBytes: 2_000_000,
    maxPageCount: 10,
    maxDecompressionRatio: 100,
  };
  const options = {
    workbook: {
      sheets: [{
        name: "Drift",
        rows: [{
          rowNumber: 1,
          cells: [{
            column: "A",
            type: "string",
            value: "changed-after-confirmation-material",
          }],
        }],
      }],
    },
  };
  const idempotencyKey = "dwo3-drift-fixture";
  const normalized = normalizeXlsxWriteOptions(options, limits);
  await writeXlsx({
    workspaceRoot,
    relativePath,
    limits,
    idempotencyKey,
    requestDigest: computeXlsxWriteRequestDigest(
      idempotencyKey,
      relativePath,
      normalized.workbook,
    ),
    options,
    signal: new AbortController().signal,
  });
  const bytes = await readFile(join(workspaceRoot, relativePath));
  await rm(join(workspaceRoot, relativePath), { force: true });
  return bytes;
}
