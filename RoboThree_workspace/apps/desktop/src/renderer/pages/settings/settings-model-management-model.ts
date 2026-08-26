import type { ModelProjection } from "@robothree/contracts";

export type SettingsModelSource = ModelProjection["source"];

export type SettingsModelAvailability =
  | "available"
  | "unavailable";

export type SettingsDetailedModelStatus =
  | "unverified"
  | "available"
  | "authentication_failed"
  | "network_failed"
  | "protocol_incompatible"
  | "model_not_found"
  | "unavailable"
  | "permission_denied";

export type SettingsModelRow = {
  modelId: string;
  displayName: string;
  source: SettingsModelSource;
  sourceLabel: string;
  section: "enterprise" | "personal" | "platform";
  capabilitiesLabel: string;
  availability: SettingsModelAvailability;
  statusLabel: string;
  statusHelp: string;
};

export type SettingsModelSection = {
  key: "enterprise" | "personal" | "platform";
  title: string;
  description: string;
  rows: readonly SettingsModelRow[];
};

export type SettingsModelManagementView = {
  sections: readonly SettingsModelSection[];
  totalModelCount: number;
  empty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  personalGate: {
    title: string;
    statusLabel: string;
    description: string;
    actionsDisabledReason: string;
  };
};

export type DetailedStatusPresentation = {
  label: string;
  selectable: boolean;
  helpText: string;
};

export function presentModelManagement(
  models: readonly ModelProjection[],
): SettingsModelManagementView {
  const rows = models.map(presentModelRow);
  const rawSections: readonly SettingsModelSection[] = [
    {
      key: "enterprise",
      title: "企业模型",
      description: "来自后台配置和授权的模型。当前客户端只读取安全摘要，不接收企业凭证。",
      rows: rows.filter((row) => row.section === "enterprise"),
    },
    {
      key: "personal",
      title: "个人模型",
      description: "真实个人模型管理仍待 Personal Model 与 Credential 链路接入。",
      rows: rows.filter((row) => row.section === "personal"),
    },
    {
      key: "platform",
      title: "平台基线模型",
      description: "平台或本地基线能力，不静默归入企业模型。",
      rows: rows.filter((row) => row.section === "platform"),
    },
  ];
  const sections = rawSections.filter((section) => section.rows.length > 0);

  return {
    sections,
    totalModelCount: rows.length,
    empty: rows.length === 0,
    emptyTitle: "当前没有可展示模型",
    emptyDescription: "企业模型由后台配置；个人模型管理待接入。两类模型均不可用时，新任务需要等待管理员配置或后续个人模型链路。",
    personalGate: {
      title: "个人模型管理待接入",
      statusLabel: "待接入",
      description: "添加、编辑、查看 Key、删除和设为默认都需要受控 Credential 链路与 Core Projection。当前页面不接收真实 API Key，也不声明任何已保存、已删除或已设默认结果。",
      actionsDisabledReason: "Personal Model / Credential 后端链路尚未授权实现。",
    },
  };
}

export function presentModelRow(model: ModelProjection): SettingsModelRow {
  return {
    modelId: model.modelId,
    displayName: model.name,
    source: model.source,
    sourceLabel: sourceLabel(model.source),
    section: sectionForSource(model.source),
    capabilitiesLabel: capabilitiesLabel(model.capabilities),
    availability: model.available ? "available" : "unavailable",
    statusLabel: model.available ? "可用" : "不可用",
    statusHelp: model.available
      ? "当前 Projection 只表示粗粒度可用性；详细模型状态由后续真实状态链路提供。"
      : model.unavailableReason ?? "当前 Projection 标记此模型不可用。",
  };
}

export function presentDetailedModelStatus(
  status: SettingsDetailedModelStatus,
): DetailedStatusPresentation {
  switch (status) {
    case "unverified":
      return {
        label: "未验证",
        selectable: true,
        helpText: "新增或关键字段修改后尚无成功调用事实，首次真实调用可能失败。",
      };
    case "available":
      return {
        label: "可用",
        selectable: true,
        helpText: "最近一次受支持的真实调用成功。",
      };
    case "authentication_failed":
      return {
        label: "认证失败",
        selectable: false,
        helpText: "Provider 拒绝凭证，需要更换 Key。",
      };
    case "network_failed":
      return {
        label: "网络失败",
        selectable: true,
        helpText: "保留最近失败警告，但允许再次选择并通过未来真实调用重试。",
      };
    case "protocol_incompatible":
      return {
        label: "协议不兼容",
        selectable: false,
        helpText: "响应不符合已支持协议，需要修改 Provider 或 Endpoint。",
      };
    case "model_not_found":
      return {
        label: "模型不存在",
        selectable: false,
        helpText: "Provider 不识别模型标识，需要修改模型标识。",
      };
    case "unavailable":
      return {
        label: "不可用",
        selectable: false,
        helpText: "Provider、模型或本机 Credential Store 当前不可用。",
      };
    case "permission_denied":
      return {
        label: "权限不足",
        selectable: false,
        helpText: "后台权限或资源授权不允许使用。",
      };
  }
}

export function modelIdentifierExplanation(): string {
  return "显示名称来自当前兼容 Projection 的 name 字段；Provider 模型标识尚无真实字段，不能用显示名称伪装。";
}

function sectionForSource(source: SettingsModelSource): SettingsModelRow["section"] {
  if (source === "enterprise") return "enterprise";
  if (source === "personal") return "personal";
  return "platform";
}

function sourceLabel(source: SettingsModelSource): string {
  if (source === "enterprise") return "企业模型";
  if (source === "personal") return "个人模型";
  return "平台基线模型";
}

function capabilitiesLabel(capabilities: readonly ModelProjection["capabilities"][number][]): string {
  if (capabilities.length === 0) return "未声明能力";
  const labels = capabilities.map((capability) => {
    if (capability === "tool_calling") return "Tool Calling";
    if (capability === "streaming") return "Streaming";
    if (capability === "vision") return "Vision";
    return "Text";
  });
  return labels.join(" / ");
}
