import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CorePrivateClient } from "../../apps/desktop/src/main/core-private-client.js";
import { DesktopIpcRouter } from "../../apps/desktop/src/main/desktop-ipc-router.js";
import { DESKTOP_IPC_CHANNELS } from "../../apps/desktop/src/shared/foundation-api.js";
import { createDesktopPrivateRuntime } from "../../services/core/src/bootstrap/create-desktop-private-runtime.js";

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

describe("PTX-4 PPTX visual preview productization", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const item of cleanup.splice(0).reverse()) await item();
  });

  it("serves a generated PPTX artifact as a sandboxed local SVG slide preview", async () => {
    const directory = await mkdtemp(join(tmpdir(), "robothree-ptx4-"));
    const workspacePath = join(directory, "workspace");
    await mkdir(join(workspacePath, "reports"), { recursive: true });
    const runtime = createDesktopPrivateRuntime({
      databasePath: join(directory, "robothree.sqlite"),
      authorizationToken: "q".repeat(48),
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
          authorizationToken: "q".repeat(48),
        }),
      },
      chooseWorkspaceDirectory: async () => workspacePath,
    });
    const clientInstanceId = id("801");

    const workspace = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.createWorkspaceGrantFromPicker,
      {
        commandId: id("802"),
        correlationId: id("803"),
        clientInstanceId,
        displayName: "PTX-4 Workspace",
        accessMode: "read_write",
      },
    )) as { workspaceGrantId: string };
    const session = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.createSession,
      {
        contractVersion: "v1alpha1",
        type: "create_session",
        commandId: id("804"),
        correlationId: id("805"),
        clientInstanceId,
        title: "PTX-4 PPTX Preview",
      },
    )) as { sessionId: string };
    const agents = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.listAgents,
      {
        contractVersion: "v1alpha1",
        type: "list_agents",
        queryId: id("806"),
        correlationId: id("807"),
        clientInstanceId,
      },
    )) as ReadonlyArray<{ agentId: string }>;

    success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.submitTurn,
      {
        contractVersion: "v1alpha1",
        type: "submit_turn",
        commandId: id("808"),
        correlationId: id("809"),
        clientInstanceId,
        clientTurnId: "turn:ptx4-pptx",
        sessionId: session.sessionId,
        userInput: "Create reports/deck.pptx",
        selectionRequest: {
          agentId: agents[0]!.agentId,
          selectedSkillIds: [],
          selectedKnowledgeIds: [],
          workspaceGrantId: workspace.workspaceGrantId,
        },
      },
    ));

    const task = await waitForCompletedTask(router, {
      clientInstanceId,
      sessionId: session.sessionId,
    });
    const detail = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.taskDetail,
      {
        contractVersion: "v1alpha1",
        type: "task_detail",
        queryId: id("810"),
        correlationId: id("811"),
        clientInstanceId,
        taskId: task.taskId,
      },
    )) as {
      artifacts: ReadonlyArray<{
        artifactId: string;
        displayName: string;
        mediaType: string;
        previewState: string;
      }>;
    };
    const artifact = detail.artifacts[0];
    expect(artifact).toMatchObject({
      displayName: "deck.pptx",
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      previewState: "available",
    });
    expect(existsSync(join(workspacePath, "reports", "deck.pptx"))).toBe(true);

    const preview = await waitForHtmlPreview(router, {
      clientInstanceId,
      artifactId: artifact!.artifactId,
    });
    cleanup.push(async () => {
      await router.dispatch(DESKTOP_IPC_CHANNELS.closeArtifactPreview, {
        contractVersion: "v1alpha1",
        type: "close_artifact_preview",
        commandId: id("814"),
        correlationId: id("815"),
        clientInstanceId,
        previewSessionId: preview.previewSessionId,
      });
    });

    expect(preview.localOrigin).toBe("http://127.0.0.1");
    expect(preview.previewUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/preview:/u);
    expect(preview.csp).toContain("default-src 'none'");
    expect(preview.csp).toContain("script-src 'none'");
    expect(preview.csp).toContain("style-src 'none'");

    const response = await fetch(preview.previewUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await response.text();
    expect(html).toContain("PPTX visual preview");
    expect(html).toContain("<svg");
    expect(html).toContain("Generated by RoboThree");
    expect(html).toContain("Summary");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<style");
    expect(html).not.toContain(workspacePath);
    expect(html).not.toContain("workspaceRoot");
    expect(html).not.toContain("rootRealPath");
  });
});

async function waitForCompletedTask(
  router: DesktopIpcRouter,
  input: {
    clientInstanceId: string;
    sessionId: string;
  },
): Promise<{ taskId: string; displayStatus: string }> {
  let latest: ReadonlyArray<{ taskId: string; displayStatus: string }> = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    latest = success(await router.dispatch(
      DESKTOP_IPC_CHANNELS.listTasks,
      {
        contractVersion: "v1alpha1",
        type: "list_tasks",
        queryId: id(`82${attempt}`),
        correlationId: id(`83${attempt}`),
        clientInstanceId: input.clientInstanceId,
        sessionId: input.sessionId,
        limit: 10,
      },
    )) as ReadonlyArray<{ taskId: string; displayStatus: string }>;
    const task = latest.find((item) => item.displayStatus === "completed");
    if (task !== undefined) return task;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`PTX-4 task did not complete: ${JSON.stringify(latest)}`);
}

async function waitForHtmlPreview(
  router: DesktopIpcRouter,
  input: {
    clientInstanceId: string;
    artifactId: string;
  },
): Promise<{
  previewSessionId: string;
  localOrigin: string;
  previewUrl: string;
  csp: string;
}> {
  let latest: { ok: boolean; value?: unknown; error?: unknown } | undefined;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    latest = await router.dispatch(
      DESKTOP_IPC_CHANNELS.artifactHtmlPreview,
      {
        contractVersion: "v1alpha1",
        type: "artifact_html_preview",
        queryId: id(`84${attempt}`),
        correlationId: id(`85${attempt}`),
        clientInstanceId: input.clientInstanceId,
        artifactId: input.artifactId,
        maxBytes: 16 * 1024,
        ttlMs: 60_000,
      },
    );
    if (latest.ok) return latest.value as {
      previewSessionId: string;
      localOrigin: string;
      previewUrl: string;
      csp: string;
    };
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return success(latest ?? { ok: false, error: "missing preview" }) as {
    previewSessionId: string;
    localOrigin: string;
    previewUrl: string;
    csp: string;
  };
}

function success(result: { ok: boolean; value?: unknown; error?: unknown }): unknown {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
