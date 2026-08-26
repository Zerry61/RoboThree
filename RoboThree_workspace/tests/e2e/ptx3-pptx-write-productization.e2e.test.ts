import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { CorePrivateClient } from "../../apps/desktop/src/main/core-private-client.js";
import { DesktopIpcRouter } from "../../apps/desktop/src/main/desktop-ipc-router.js";
import { DESKTOP_IPC_CHANNELS } from "../../apps/desktop/src/shared/foundation-api.js";
import { createDesktopPrivateRuntime } from "../../services/core/src/bootstrap/create-desktop-private-runtime.js";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

describe("PTX-3 PPTX write productization", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const item of cleanup.splice(0).reverse()) await item();
  });

  it("creates a new PPTX from a Desktop turn and projects a safe document artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-ptx3-"));
    const workspacePath = join(directory, "workspace");
    await mkdir(join(workspacePath, "reports"), { recursive: true });
    const runtime = createDesktopPrivateRuntime({
      databasePath: join(directory, "robothree.sqlite"),
      authorizationToken: "p".repeat(48),
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
          authorizationToken: "p".repeat(48),
        }),
      },
      chooseWorkspaceDirectory: async () => workspacePath,
    });
    const clientInstanceId = id("701");

    const workspace = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.createWorkspaceGrantFromPicker,
      {
        commandId: id("702"),
        correlationId: id("703"),
        clientInstanceId,
        displayName: "PTX-3 Workspace",
        accessMode: "read_write",
      },
    )) as { workspaceGrantId: string };
    const session = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.createSession,
      {
        contractVersion: "v1alpha1",
        type: "create_session",
        commandId: id("704"),
        correlationId: id("705"),
        clientInstanceId,
        title: "PTX-3 PPTX Write",
      },
    )) as { sessionId: string };
    const agents = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.listAgents,
      {
        contractVersion: "v1alpha1",
        type: "list_agents",
        queryId: id("706"),
        correlationId: id("707"),
        clientInstanceId,
      },
    )) as ReadonlyArray<{ agentId: string }>;

    const receipt = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.submitTurn,
      {
        contractVersion: "v1alpha1",
        type: "submit_turn",
        commandId: id("708"),
        correlationId: id("709"),
        clientInstanceId,
        clientTurnId: "turn:ptx3-pptx",
        sessionId: session.sessionId,
        userInput: "Create reports/deck.pptx",
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
    expect(snapshot.messages[2]?.content).toContain("Document tool: tool.document.pptx.write");
    expect(snapshot.messages[2]?.content).toContain("Created: reports/deck.pptx");
    expect(snapshot.messages[2]?.content).toContain("Slides: 2");
    expect(snapshot.messages[2]?.content).toContain("Presentation digest:");
    expect(snapshot.messages[3]?.content).toContain("Document tool completed.");
    expect(snapshot.messages[3]?.content).toContain("Document tool: tool.document.pptx.write");
    expect(JSON.stringify(snapshot)).not.toContain(workspacePath);
    expect(JSON.stringify(snapshot)).not.toContain("\"slides\"");
    expect(JSON.stringify(snapshot)).not.toContain("dataBase64");

    const targetPath = join(workspacePath, "reports", "deck.pptx");
    expect(existsSync(targetPath)).toBe(true);
    const bytes = await readFile(targetPath);
    expect(bytes.subarray(0, 2).toString("ascii")).toBe("PK");
    assertPptxSmoke(bytes);
    await expect(readdir(join(workspacePath, "reports"))).resolves.toEqual(["deck.pptx"]);

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
        queryId: id("710"),
        correlationId: id("711"),
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
        kind: string;
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
        displayName: "deck.pptx",
        kind: "document",
        mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        previewState: "available",
        metadata: expect.objectContaining({
          capabilityId: "tool.document.pptx.write",
          slideCount: 2,
        }),
      }),
    ]);
    expect(JSON.stringify(detail)).not.toContain(workspacePath);
    expect(JSON.stringify(detail)).not.toContain("\"slides\"");
    expect(JSON.stringify(detail)).not.toContain("Generated by RoboThree");
  });
});

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
        queryId: id(`72${attempt}`),
        correlationId: id(`73${attempt}`),
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
  for (let attempt = 0; attempt < 40; attempt += 1) {
    latest = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.listTasks,
      {
        contractVersion: "v1alpha1",
        type: "list_tasks",
        queryId: id(`74${attempt}`),
        correlationId: id(`75${attempt}`),
        clientInstanceId: input.clientInstanceId,
        sessionId: input.sessionId,
      },
    )) as ReadonlyArray<{ taskId: string; displayStatus: string }>;
    if (latest.some((task) => task.displayStatus === "completed")) {
      return latest.filter((task) => task.displayStatus === "completed");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return latest;
}

function assertPptxSmoke(bytes: Buffer): void {
  const zip = readZipEntries(bytes);
  expect(zip.has("[Content_Types].xml")).toBe(true);
  expect(zip.has("ppt/presentation.xml")).toBe(true);
  expect(zip.has("ppt/slides/slide1.xml")).toBe(true);
  expect(zip.has("ppt/slides/slide2.xml")).toBe(true);
  expect(inflateZipEntry(zip, "ppt/slides/slide1.xml").toString("utf8"))
    .toContain("Generated by RoboThree");
  expect(inflateZipEntry(zip, "ppt/slides/slide2.xml").toString("utf8"))
    .toContain("Summary");
}

type ZipEntry = Readonly<{
  compression: number;
  compressedSize: number;
  data: Buffer;
}>;

function readZipEntries(bytes: Buffer): Map<string, ZipEntry> {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  let offset = centralDirectoryOffset;
  const entries = new Map<string, ZipEntry>();
  for (let index = 0; index < entryCount; index += 1) {
    expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
    const compression = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const fileNameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    const localNameLength = bytes.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, {
      compression,
      compressedSize,
      data: bytes.subarray(dataOffset, dataOffset + compressedSize),
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function inflateZipEntry(entries: Map<string, ZipEntry>, name: string): Buffer {
  const entry = entries.get(name);
  expect(entry, name).toBeDefined();
  if (entry?.compression === 0) return entry.data;
  if (entry?.compression === 8) return inflateRawSync(entry.data);
  throw new Error(`Unsupported ZIP compression for ${name}: ${entry?.compression}`);
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (bytes.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error("ZIP EOCD not found");
}

function success(result: { ok: boolean; value?: unknown; error?: unknown }): unknown {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
