import type { ModelProjection } from "@robothree/contracts";
import type { PersonalModelSafeProjectionV1Alpha1 } from
  "@robothree/contracts/desktop-local/personal-model-management/v1alpha1";

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

export type PersonalModelSettingsRow = Readonly<{
  personalModelId: string;
  displayName: string;
  providerLabel: string;
  providerModelId: string;
  endpointDisplayHost: string;
  capabilityLabel: string;
  statusLabel: string;
  statusHelp: string;
  preferenceSelected: boolean;
}>;

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
      description: "个人模型管理将在安全凭据服务接入后开放。",
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
      description: "添加、编辑、查看密钥、删除和设为默认都需要安全的凭据管理服务。当前页面不接收真实 API Key，也不会显示任何虚假的保存、删除或默认设置结果。",
      actionsDisabledReason: "个人模型与安全凭据管理服务尚未开放。",
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
      ? "当前只提供基础可用性；更详细的模型状态将在真实服务接入后显示。"
      : model.unavailableReason ?? "当前模型不可用。",
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
        helpText: "模型服务拒绝凭据，需要更换 API Key。",
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
        helpText: "响应不符合已支持协议，需要检查模型服务或访问地址。",
      };
    case "model_not_found":
      return {
        label: "模型不存在",
        selectable: false,
        helpText: "模型服务不识别该模型标识，需要修改模型标识。",
      };
    case "unavailable":
      return {
        label: "不可用",
        selectable: false,
        helpText: "模型服务、模型或本机安全凭据服务当前不可用。",
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
  return "当前仅提供模型显示名称；模型服务使用的精确标识尚未开放，不能用显示名称代替。";
}

export function presentPersonalModelRow(
  model: PersonalModelSafeProjectionV1Alpha1,
): PersonalModelSettingsRow {
  const status = presentDetailedModelStatus(model.status);
  return {
    personalModelId: model.personalModelId,
    displayName: model.displayName,
    providerLabel: personalProviderLabel(model.provider),
    providerModelId: model.providerModelId,
    endpointDisplayHost: model.endpointDisplayHost,
    capabilityLabel: capabilitiesLabel(model.capabilities),
    statusLabel: status.label,
    statusHelp: status.helpText,
    preferenceSelected: model.preferenceSelected,
  };
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
    if (capability === "tool_calling") return "工具调用";
    if (capability === "streaming") return "流式响应";
    if (capability === "vision") return "图像理解";
    return "文本";
  });
  return labels.join(" / ");
}

function personalProviderLabel(provider: PersonalModelSafeProjectionV1Alpha1["provider"]): string {
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "zhipu") return "智谱";
  if (provider === "kimi") return "Kimi";
  return "自定义服务";
}
