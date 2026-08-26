import { contextBridge, ipcRenderer } from "electron";

import {
  type RoboThreeDesktopApiV1Alpha1,
  type RoboThreeDesktopApiV1Alpha2,
} from "../shared/foundation-api.js";
import {
  createDesktopApiV1Alpha1,
  createDesktopApiV1Alpha2,
} from "./create-desktop-api.js";
import {
  PersonalCredentialTransportPreloadReceiver,
  type PersonalCredentialTransportPortOfferEvent,
} from "./personal-credential-transport-receiver.js";

const personalCredentialTransport = new PersonalCredentialTransportPreloadReceiver({
  foundationEnabled: false,
  subscribe: (channel, listener) => {
    const wrapped = (event: Electron.IpcRendererEvent, value: unknown): void => {
      listener(
        { ports: event.ports as unknown[] } satisfies PersonalCredentialTransportPortOfferEvent,
        value,
      );
    };
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
personalCredentialTransport.start();

const preloadLifecycle = globalThis as unknown as Readonly<{
  addEventListener?: (
    type: "unload",
    listener: () => void,
    options: Readonly<{ once: true }>,
  ) => void;
}>;
preloadLifecycle.addEventListener?.(
  "unload",
  () => personalCredentialTransport.close(),
  { once: true },
);

const api = createDesktopApiV1Alpha1({
  invoke: (channel, input) => ipcRenderer.invoke(channel, input) as Promise<unknown>,
  subscribe: (channel, listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      listener(value);
    };
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
contextBridge.exposeInMainWorld("robothreeDesktop", api);
const apiV1Alpha2 = createDesktopApiV1Alpha2(
  (channel, input) => ipcRenderer.invoke(channel, input) as Promise<unknown>,
);
contextBridge.exposeInMainWorld("robothreeDesktopV1Alpha2", apiV1Alpha2);

declare global {
  interface Window {
    readonly robothreeDesktop: RoboThreeDesktopApiV1Alpha1;
    readonly robothreeDesktopV1Alpha2: RoboThreeDesktopApiV1Alpha2;
  }
}
