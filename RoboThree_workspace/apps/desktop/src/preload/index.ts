import { contextBridge, ipcRenderer } from "electron";

import {
  type RoboThreeDesktopApiV1Alpha1,
  type RoboThreeDesktopApiV1Alpha2,
  type RoboThreeDesktopApiV1Alpha4,
  type RoboThreeDesktopApiV1Alpha5,
  type RoboThreeDesktopTaskReasoningApiV1Alpha1,
  type RoboThreePersonalModelApiV1Alpha2,
  type RoboThreePersonalModelReadApiV1Alpha1,
  type RoboThreeAgentLifecycleApiV1Alpha1,
  type RoboThreeSkillLifecycleApiV1Alpha1,
} from "../shared/foundation-api.js";
import {
  createDesktopApiV1Alpha1,
  createDesktopApiV1Alpha2,
  createDesktopApiV1Alpha4,
  createDesktopApiV1Alpha5,
  createDesktopTaskReasoningApiV1Alpha1,
  createPersonalModelApiV1Alpha2,
  createPersonalModelReadApiV1Alpha1,
  createAgentLifecycleApiV1Alpha1,
  createSkillLifecycleApiV1Alpha1,
} from "./create-desktop-api.js";
import {
  PersonalCredentialTransportPreloadReceiver,
  type PersonalCredentialTransportPortOfferEvent,
} from "./personal-credential-transport-receiver.js";
import { STRM3_SENSITIVE_TRANSPORT_ACTIVATION } from
  "../shared/sensitive-transport-activation.js";

const personalCredentialTransport = new PersonalCredentialTransportPreloadReceiver({
  // Historical STRM-2 snapshot: foundationEnabled: false.
  foundationEnabled: true,
  productionActivation: STRM3_SENSITIVE_TRANSPORT_ACTIVATION,
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
const apiV1Alpha4 = createDesktopApiV1Alpha4(
  (channel, input) => ipcRenderer.invoke(channel, input) as Promise<unknown>,
);
contextBridge.exposeInMainWorld("robothreeDesktopV1Alpha4", apiV1Alpha4);
const apiV1Alpha5 = createDesktopApiV1Alpha5(
  (channel, input) => ipcRenderer.invoke(channel, input) as Promise<unknown>,
);
contextBridge.exposeInMainWorld("robothreeDesktopV1Alpha5", apiV1Alpha5);
const taskReasoningApiV1Alpha1 = createDesktopTaskReasoningApiV1Alpha1(
  (channel, input) => ipcRenderer.invoke(channel, input) as Promise<unknown>,
);
contextBridge.exposeInMainWorld(
  "robothreeDesktopTaskReasoningV1Alpha1",
  taskReasoningApiV1Alpha1,
);
const agentLifecycleApiV1Alpha1 = createAgentLifecycleApiV1Alpha1(
  (channel, input) => ipcRenderer.invoke(channel, input) as Promise<unknown>,
);
contextBridge.exposeInMainWorld(
  "robothreeAgentLifecycleV1Alpha1",
  agentLifecycleApiV1Alpha1,
);
const skillLifecycleApiV1Alpha1 = createSkillLifecycleApiV1Alpha1(
  (channel, input) => ipcRenderer.invoke(channel, input) as Promise<unknown>,
);
contextBridge.exposeInMainWorld(
  "robothreeSkillLifecycleV1Alpha1",
  skillLifecycleApiV1Alpha1,
);
const personalModelApiV1Alpha1 = createPersonalModelReadApiV1Alpha1(
  (channel, input) => ipcRenderer.invoke(channel, input) as Promise<unknown>,
);
contextBridge.exposeInMainWorld(
  "robothreePersonalModelV1Alpha1",
  personalModelApiV1Alpha1,
);
const personalModelApiV1Alpha2 = createPersonalModelApiV1Alpha2(
  (channel, input) => ipcRenderer.invoke(channel, input) as Promise<unknown>,
  personalCredentialTransport,
);
contextBridge.exposeInMainWorld(
  "robothreePersonalModelV1Alpha2",
  personalModelApiV1Alpha2,
);

declare global {
  interface Window {
    readonly robothreeDesktop: RoboThreeDesktopApiV1Alpha1;
    readonly robothreeDesktopV1Alpha2: RoboThreeDesktopApiV1Alpha2;
    readonly robothreeDesktopV1Alpha4: RoboThreeDesktopApiV1Alpha4;
    readonly robothreeDesktopV1Alpha5: RoboThreeDesktopApiV1Alpha5;
    readonly robothreeDesktopTaskReasoningV1Alpha1:
      RoboThreeDesktopTaskReasoningApiV1Alpha1;
    readonly robothreePersonalModelV1Alpha1:
      RoboThreePersonalModelReadApiV1Alpha1;
    readonly robothreePersonalModelV1Alpha2:
      RoboThreePersonalModelApiV1Alpha2;
    readonly robothreeAgentLifecycleV1Alpha1:
      RoboThreeAgentLifecycleApiV1Alpha1;
    readonly robothreeSkillLifecycleV1Alpha1:
      RoboThreeSkillLifecycleApiV1Alpha1;
  }
}
