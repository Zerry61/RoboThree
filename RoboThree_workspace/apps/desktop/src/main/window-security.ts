import type { BrowserWindowConstructorOptions } from "electron";

export function createSecureWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1_180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#0b0d12",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: preloadPath,
    },
  };
}
