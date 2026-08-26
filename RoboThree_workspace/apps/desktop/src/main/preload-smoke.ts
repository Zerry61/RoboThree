import { fileURLToPath } from "node:url";

import electron from "electron";

import { createSecureWindowOptions } from "./window-security.js";

const { app, BrowserWindow } = electron;

type PreloadSmokeProjection = Readonly<{
  contractVersion?: unknown;
  hasRuntimeStatus: boolean;
  hasDesktopEvents: boolean;
  sidecarContractVersion?: unknown;
  hasRobotCatalog: boolean;
  hasToolCatalog: boolean;
  hasWorkspaceBrowser: boolean;
  hasWorkspaceReveal: boolean;
}>;

void app.whenReady()
  .then(runPreloadSmoke)
  .then((projection) => {
    process.stdout.write(`${JSON.stringify({
      status: "ready",
      sandbox: true,
      preload: projection,
    })}\n`);
    app.quit();
  })
  .catch((error: unknown) => {
    const summary = error instanceof Error ? error.message : "unknown preload smoke failure";
    process.stderr.write(`Desktop Preload smoke failed: ${summary}\n`);
    process.exitCode = 1;
    app.quit();
  });

async function runPreloadSmoke(): Promise<PreloadSmokeProjection> {
  const preloadPath = fileURLToPath(new URL("../preload/index.cjs", import.meta.url));
  const window = new BrowserWindow({
    ...createSecureWindowOptions(preloadPath),
    show: false,
  });
  try {
    await window.loadURL("data:text/html;charset=utf-8,<main>RoboThree Preload Smoke</main>");
    const projection = await window.webContents.executeJavaScript(`
      (() => {
        const api = globalThis.robothreeDesktop;
        const sidecar = globalThis.robothreeDesktopV1Alpha2;
        return {
          contractVersion: api?.contractVersion,
          hasRuntimeStatus: typeof api?.getRuntimeStatus === "function",
          hasDesktopEvents: typeof api?.onDesktopEvent === "function",
          sidecarContractVersion: sidecar?.contractVersion,
          hasRobotCatalog: typeof sidecar?.listRobotCatalog === "function"
            && typeof sidecar?.getRobotCatalog === "function",
          hasToolCatalog: typeof sidecar?.listToolCatalog === "function"
            && typeof sidecar?.getToolCatalog === "function",
          hasWorkspaceBrowser: typeof sidecar?.listWorkspaceEntries === "function",
          hasWorkspaceReveal: typeof sidecar?.openTaskWorkspaceLocation === "function"
        };
      })()
    `) as PreloadSmokeProjection;
    if (
      projection.contractVersion !== "v1alpha1"
      || !projection.hasRuntimeStatus
      || !projection.hasDesktopEvents
      || projection.sidecarContractVersion !== "v1alpha2"
      || !projection.hasRobotCatalog
      || !projection.hasToolCatalog
      || !projection.hasWorkspaceBrowser
      || !projection.hasWorkspaceReveal
    ) {
      throw new Error("sandboxed Preload did not expose the frozen Desktop API");
    }
    return projection;
  } finally {
    window.destroy();
  }
}
