import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const rendererRoot = resolve("apps/desktop/src/renderer");
const mainEntry = resolve(rendererRoot, "main.ts");
const legacyWorkbench = resolve(rendererRoot, "legacy/LegacyWorkbench.ts");
const html = resolve(rendererRoot, "index.html");
const sharedApi = resolve("apps/desktop/src/shared/foundation-api.ts");

async function listRendererSources(directory = rendererRoot): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listRendererSources(path);
    }
    if ([".ts", ".vue"].includes(extname(entry.name))) {
      return [path];
    }
    return [];
  }));
  return files.flat();
}

async function readRendererSources(): Promise<Array<{ path: string; relativePath: string; source: string }>> {
  const paths = await listRendererSources();
  return Promise.all(paths.map(async (path) => ({
    path,
    relativePath: relative(rendererRoot, path),
    source: await readFile(path, "utf8"),
  })));
}

describe("DCF-1.2B Renderer boundary", () => {
  it("keeps main.ts as a thin Vue bootstrap entry", async () => {
    const source = await readFile(mainEntry, "utf8");
    expect(source).toContain("createApp(App)");
    expect(source).toContain(".use(createRoboThreeRouter())");
    expect(source).toContain('.mount("#app")');
    expect(source).toContain("./app/App.vue");
    expect(source).toContain("./app/router.js");
    expect(source).not.toContain("window.robothreeDesktop");
    expect(source).not.toContain("h(");
    expect(source).not.toContain("defineComponent(");
  });

  it("isolates existing workbench behavior in the Legacy wrapper", async () => {
    const source = await readFile(legacyWorkbench, "utf8");
    expect(source).toContain("window.robothreeDesktop");
    expect(source).toContain("createWorkspaceGrantFromPicker");
    expect(source).toContain("submitTurn");
    expect(source).toContain("presentToolActivity(activity)");
    expect(source).toContain("presentTaskStatus(task.displayStatus)");
    expect(source).toContain("presentTaskStatus(task.summary.displayStatus)");
    expect(source).toContain("presentUserConfirmation(confirmation)");
    expect(source).toContain("canShowConfirmationDecisionActions(confirmation)");
    expect(source).toContain("presentDurableMessage(message)");
    expect(source).toContain("presentStreamingAssistant(streamingAssistant.value)");
    expect(source).toContain("presentComposer({");
    expect(source).toContain("composerPresentation.value.sendDisabled");
    expect(source).toContain("composerPresentation.value.sendButtonLabel");
    expect(source).toContain("presentShellRuntime(runtime.value)");
    expect(source).toContain("workspaceOptionLabel(workspace)");
    expect(source).toContain("formatDisplayTime(session.updatedAt)");
    expect(source).toContain("formatDisplayTime(activity.updatedAt)");
    expect(source).toContain("shortDisplayId(task.taskId)");
    expect(source).toContain("export default App");
    expect(source).not.toContain("createApp(");
  });

  it("keeps direct system transports unreachable across renderer source", async () => {
    const sources = await readRendererSources();
    for (const { relativePath, source } of sources) {
      for (const forbidden of [
        "ipcRenderer",
        "contextBridge",
        "child_process",
        "node:fs",
        "node:http",
        "node:net",
        "XMLHttpRequest",
        "EventSource",
        "WebSocket",
        ".fetch(",
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "@robothree/contracts/desktop-private/personal-credential-broker-v1",
        "eval(",
        "new Function",
        "innerHTML",
        "document.write",
      ]) {
        expect(source, `${relativePath} contains ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("keeps typed Desktop API access limited to the Legacy wrapper", async () => {
    const sources = await readRendererSources();
    const desktopApiFiles = sources
      .filter(({ source }) => source.includes("window.robothreeDesktop"))
      .map(({ relativePath }) => relativePath)
      .sort();
    expect(desktopApiFiles).toEqual([
      "adapters/intelligence-adapter.ts",
      "adapters/settings-adapter.ts",
      "adapters/task-workspace-adapter.ts",
      "adapters/tasks-adapter.ts",
      "adapters/workbench-adapter.ts",
      "legacy/LegacyWorkbench.ts",
    ]);
  });

  it("keeps the Knowledge adapter prototype-only and transport-free", async () => {
    const source = await readFile(resolve(rendererRoot, "adapters/knowledge-adapter.ts"), "utf8");
    for (const forbidden of [
      "window.robothreeDesktop",
      "ipcRenderer",
      "contextBridge",
      "fetch(",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "providerEndpoint",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("gatedKnowledgeAdapter");
    expect(source).toContain("fixtureKnowledgeAdapter");
    expect(source).toContain("unconfigured_gated");
  });

  it("keeps DFE-5B.2 gated settings pages static and transport-free", async () => {
    const settingsDirectory = resolve(rendererRoot, "pages/settings");
    const files = [
      "SettingsCapabilityGatePage.vue",
      "SettingsPersonalizationPage.vue",
      "SettingsMemoryPage.vue",
      "SettingsFeedbackPage.vue",
      "SettingsIdentityPage.vue",
      "settings-section-model.ts",
    ];
    const sources = await Promise.all(files.map(async (file) => ({
      file,
      source: await readFile(resolve(settingsDirectory, file), "utf8"),
    })));

    for (const { file, source } of sources) {
      for (const forbidden of [
        "window.robothreeDesktop",
        "ipcRenderer",
        "contextBridge",
        "fetch(",
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "credentialReference",
        "workspaceRoot",
        "rootRealPath",
        "requestDigest",
        "providerEndpoint",
      ]) {
        expect(source, `${file} contains ${forbidden}`).not.toContain(forbidden);
      }
    }
    expect(sources.map(({ source }) => source).join("\n")).toContain("static_product_copy");
    expect(sources.map(({ source }) => source).join("\n")).toContain("capabilityState: \"gated\"");
  });

  it("keeps CSP network access disabled and the Renderer-safe API transport-free", async () => {
    const [document, api] = await Promise.all([
      readFile(html, "utf8"),
      readFile(sharedApi, "utf8"),
    ]);
    expect(document).toContain("connect-src 'none'");
    for (const forbidden of [
      "authorizationToken",
      "selectedPath",
      "selectionHandle:",
      "baseUrl:",
      "rootRealPath",
      "ipcRenderer",
    ]) {
      expect(api).not.toContain(forbidden);
    }
  });

  it("does not expose internal sensitive payload fields in renderer source", async () => {
    const sources = await readRendererSources();
    for (const { relativePath, source } of sources) {
      for (const forbidden of [
        "resultPayload",
        "executionReceipt",
        "workspaceCredential",
        "CapabilityLock",
        "checkpoint",
        "rootToken",
        "accessKey",
        "secret",
      ]) {
        expect(source, `${relativePath} contains ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
