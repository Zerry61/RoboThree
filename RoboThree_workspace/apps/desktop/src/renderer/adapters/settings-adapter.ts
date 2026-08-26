import type { ModelProjection } from "@robothree/contracts";
import type { InjectionKey } from "vue";

import type {
  RendererSafeResult,
  RoboThreeDesktopApiV1Alpha1,
} from "../../shared/foundation-api.js";

declare global {
  interface Window {
    readonly robothreeDesktop: RoboThreeDesktopApiV1Alpha1;
  }
}

export type SettingsModelsData = {
  models: readonly ModelProjection[];
};

export type SettingsAdapter = {
  loadSettingsModels(): Promise<SettingsModelsData>;
};

export const settingsAdapterKey: InjectionKey<SettingsAdapter> =
  Symbol("RoboThreeSettingsAdapter");

const clientInstanceId = `renderer:dfe5a1:${randomId()}`;

export const desktopSettingsAdapter: SettingsAdapter = {
  async loadSettingsModels(): Promise<SettingsModelsData> {
    const models = await accept(getDesktopApi().listModels({
      contractVersion: "v1alpha1",
      queryId: randomId(),
      correlationId: randomId(),
      clientInstanceId,
      type: "list_models",
    }));
    return { models };
  },
};

async function accept<T>(operation: Promise<RendererSafeResult<T>>): Promise<T> {
  const result = await operation;
  if (!result.ok) {
    throw new DesktopSettingsAdapterError(result.error.safeSummary);
  }
  return result.value;
}

function getDesktopApi(): RoboThreeDesktopApiV1Alpha1 {
  return window.robothreeDesktop;
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? "00000000-0000-4000-8000-000000000000".replace(/[08]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      const value = char === "0" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
}

export class DesktopSettingsAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesktopSettingsAdapterError";
  }
}
