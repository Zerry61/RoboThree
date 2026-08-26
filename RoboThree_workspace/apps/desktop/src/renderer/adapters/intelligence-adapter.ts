import type {
  CompatibilityProjectionV1Alpha2,
  DesktopErrorEnvelopeV1Alpha2,
  GetRobotCatalogQuery,
  GetToolCatalogQuery,
  ListRobotCatalogQuery,
  ListToolCatalogQuery,
  RobotCatalogDetail,
  RobotCatalogPage,
  ToolCatalogDetail,
  ToolCatalogPage,
} from "@robothree/contracts";
import type { InjectionKey } from "vue";

import type {
  RendererSafeResultV1Alpha2,
  RoboThreeDesktopApiV1Alpha2,
} from "../../shared/foundation-api.js";

declare global {
  interface Window {
    readonly robothreeDesktopV1Alpha2?: RoboThreeDesktopApiV1Alpha2;
  }
}

export type CatalogNegotiation = Readonly<{
  contractVersion: "v1alpha2";
  runtimeInstanceId: string;
  available: boolean;
  reasonCode: string | undefined;
  safeSummary: string | undefined;
}>;

export type IntelligenceCatalogAdapter = {
  negotiateCatalog(): Promise<CatalogNegotiation>;
  listRobots(input: { cursor?: string; limit?: number }): Promise<RobotCatalogPage>;
  getRobot(input: { robotId: string }): Promise<RobotCatalogDetail>;
  listTools(input: { cursor?: string; limit?: number }): Promise<ToolCatalogPage>;
  getTool(input: { toolId: string }): Promise<ToolCatalogDetail>;
};

export const intelligenceAdapterKey: InjectionKey<IntelligenceCatalogAdapter> =
  Symbol("RoboThreeIntelligenceCatalogAdapter");

const clientInstanceId = randomUuid();

export const desktopIntelligenceAdapter: IntelligenceCatalogAdapter = {
  async negotiateCatalog(): Promise<CatalogNegotiation> {
    const api = getDesktopApi();
    if (api === undefined) {
      return unavailableCompatibility("contract.feature_unavailable", "智能目录接口不可用。");
    }
    const compatibility = await accept(api.getCompatibility({
      ...queryMeta(),
      supportedContractVersions: ["v1alpha2", "v1alpha1"],
    }));
    return presentCompatibility(compatibility);
  },

  async listRobots(input): Promise<RobotCatalogPage> {
    const query: ListRobotCatalogQuery = {
      ...queryMeta(),
      type: "list_robot_catalog",
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    };
    return accept(requireDesktopApi().listRobotCatalog(query));
  },

  async getRobot(input): Promise<RobotCatalogDetail> {
    const query: GetRobotCatalogQuery = {
      ...queryMeta(),
      type: "get_robot_catalog",
      robotId: input.robotId,
    };
    return accept(requireDesktopApi().getRobotCatalog(query));
  },

  async listTools(input): Promise<ToolCatalogPage> {
    const query: ListToolCatalogQuery = {
      ...queryMeta(),
      type: "list_tool_catalog",
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    };
    return accept(requireDesktopApi().listToolCatalog(query));
  },

  async getTool(input): Promise<ToolCatalogDetail> {
    const query: GetToolCatalogQuery = {
      ...queryMeta(),
      type: "get_tool_catalog",
      toolId: input.toolId,
    };
    return accept(requireDesktopApi().getToolCatalog(query));
  },
};

function presentCompatibility(
  compatibility: CompatibilityProjectionV1Alpha2,
): CatalogNegotiation {
  const selected = compatibility.selectedContractVersion === "v1alpha2";
  const available = selected && compatibility.features.includes("robot_tool_catalog");
  return {
    contractVersion: "v1alpha2",
    runtimeInstanceId: compatibility.runtimeInstanceId,
    available,
    reasonCode: available ? undefined : "contract.feature_unavailable",
    safeSummary: available ? undefined : "机器人和工具目录能力尚未启用。",
  };
}

function unavailableCompatibility(
  reasonCode: string,
  safeSummary: string,
): CatalogNegotiation {
  return {
    contractVersion: "v1alpha2",
    runtimeInstanceId: "",
    available: false,
    reasonCode,
    safeSummary,
  };
}

async function accept<T>(
  operation: Promise<RendererSafeResultV1Alpha2<T>>,
): Promise<T> {
  const result = await operation;
  if (!result.ok) {
    throw new DesktopIntelligenceAdapterError(result.error);
  }
  return result.value;
}

function getDesktopApi(): RoboThreeDesktopApiV1Alpha2 | undefined {
  return window.robothreeDesktopV1Alpha2;
}

function requireDesktopApi(): RoboThreeDesktopApiV1Alpha2 {
  const api = getDesktopApi();
  if (api === undefined) {
    throw new DesktopIntelligenceAdapterError({
      contractVersion: "v1alpha2",
      code: "contract.feature_unavailable",
      category: "compatibility",
      safeSummary: "智能目录接口不可用。",
      retryable: false,
      correlationId: randomUuid(),
    });
  }
  return api;
}

function queryMeta() {
  return {
    contractVersion: "v1alpha2" as const,
    queryId: randomUuid(),
    correlationId: randomUuid(),
    clientInstanceId,
  };
}

function randomUuid(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? "00000000-0000-4000-8000-000000000000".replace(/[08]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      const value = char === "0" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
}

export class DesktopIntelligenceAdapterError extends Error {
  readonly code: string;
  readonly category: DesktopErrorEnvelopeV1Alpha2["category"];
  readonly retryable: boolean;
  readonly safeSummary: string;

  constructor(error: DesktopErrorEnvelopeV1Alpha2) {
    super(error.safeSummary);
    this.name = "DesktopIntelligenceAdapterError";
    this.code = error.code;
    this.category = error.category;
    this.retryable = error.retryable;
    this.safeSummary = error.safeSummary;
  }
}
