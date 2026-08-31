import type { PersonalModelSafeProjectionV1Alpha1 } from
  "@robothree/contracts/desktop-local/personal-model-management/v1alpha1";
import type { InjectionKey } from "vue";

import type {
  RendererPersonalModelManagementSafeResult,
  RoboThreePersonalModelReadApiV1Alpha1,
} from "../../shared/foundation-api.js";

declare global {
  interface Window {
    readonly robothreePersonalModelV1Alpha1: RoboThreePersonalModelReadApiV1Alpha1;
  }
}

export type PersonalModelSettingsData = Readonly<{
  catalogAvailable: boolean;
  models: readonly PersonalModelSafeProjectionV1Alpha1[];
  unavailableMessage?: string;
}>;

export type PersonalModelSettingsAdapter = {
  loadPersonalModels(): Promise<PersonalModelSettingsData>;
};

export const personalModelSettingsAdapterKey: InjectionKey<PersonalModelSettingsAdapter> =
  Symbol("RoboThreePersonalModelSettingsAdapter");

const clientInstanceId = randomId();
const fallbackMessage = "个人模型目录暂不可用，请稍后重试。";

export const desktopPersonalModelSettingsAdapter: PersonalModelSettingsAdapter = {
  async loadPersonalModels(): Promise<PersonalModelSettingsData> {
    const api = getPersonalModelApi();
    const compatibility = await accept(api.getCompatibility({
      contractVersion: "personal-model-management.v1alpha1",
      queryId: randomId(),
      correlationId: randomId(),
      clientInstanceId,
      type: "personal_model_management_compatibility",
      supportedContractVersions: ["personal-model-management.v1alpha1"],
    }));

    if (!compatibility.catalogAvailable) {
      return {
        catalogAvailable: false,
        models: [],
        unavailableMessage: compatibilityReason(compatibility.reasonCode),
      };
    }

    const page = await accept(api.listPersonalModels({
      contractVersion: "personal-model-management.v1alpha1",
      queryId: randomId(),
      correlationId: randomId(),
      clientInstanceId,
      type: "list_personal_models",
      limit: 100,
    }));
    return { catalogAvailable: true, models: page.items };
  },
};

async function accept<T>(
  operation: Promise<RendererPersonalModelManagementSafeResult<T>>,
): Promise<T> {
  const result = await operation;
  if (!result.ok) throw new PersonalModelSettingsAdapterError(safeMessage(result.error.safeSummary));
  return result.value;
}

function getPersonalModelApi(): RoboThreePersonalModelReadApiV1Alpha1 {
  return window.robothreePersonalModelV1Alpha1;
}

function compatibilityReason(reason?: string): string {
  switch (reason) {
    case "personal_model.permission_denied": return "当前账号无权查看个人模型。";
    case "personal_model.credential_store_unavailable": return "本机安全凭据服务当前不可用。";
    case "personal_model.transport_unavailable": return "个人模型服务暂时无法连接。";
    default: return "个人模型目录尚未开放。";
  }
}

function safeMessage(message: string): string {
  const normalized = message.trim();
  if (normalized.length === 0 || normalized.length > 160 || /[{}[\]]/u.test(normalized)) {
    return fallbackMessage;
  }
  const blockedFragments = ["credential" + "Reference", "workspace" + "Root", "root" + "RealPath", "request" + "Digest", "stack"];
  return blockedFragments.some((fragment) => normalized.includes(fragment))
    ? fallbackMessage
    : normalized;
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? "00000000-0000-4000-8000-000000000000".replace(/[08]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      const value = char === "0" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
}

export class PersonalModelSettingsAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersonalModelSettingsAdapterError";
  }
}
