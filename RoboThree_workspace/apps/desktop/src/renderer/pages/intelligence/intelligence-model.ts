import type {
  CatalogAvailability,
  CatalogResourceSummaryV1Alpha2,
  CatalogRestrictionState,
  CatalogUnavailableReason,
  RobotCatalogDetail,
  RobotCatalogSummary,
  ToolCatalogDetail,
  ToolCatalogSummary,
  ToolRiskFactKind,
} from "@robothree/contracts";

export type IntelligenceSection = "robots" | "skills" | "tools";

export type RobotCatalogSource = RobotCatalogSummary["source"];
export type ToolCatalogSource = ToolCatalogSummary["source"];
export type RobotRestrictionSummary = RobotCatalogSummary["restrictionSummary"];

export type RobotSummaryCard = Readonly<{
  section: "robots";
  id: string;
  name: string;
  sourceLabel: string;
  description: string;
  runnableLabel: string;
  restrictionLabels: readonly string[];
  detailPath: string;
}>;

export type ToolSummaryCard = Readonly<{
  section: "tools";
  id: string;
  name: string;
  sourceLabel: string;
  description: string;
  readOnlyLabel: string;
  riskLabels: readonly string[];
  availabilityLabel: string;
  detailPath: string;
}>;

export type IntelligenceCard = RobotSummaryCard | ToolSummaryCard;

export type RobotDetailView = Readonly<{
  section: "robots";
  id: string;
  name: string;
  sourceLabel: string;
  description: string;
  runnableLabel: string;
  defaultModel: ResourceView;
  allowModelOverrideLabel: string;
  eligibleModels: readonly ResourceView[];
  skills: readonly ResourceView[];
  tools: readonly ResourceView[];
  knowledge: readonly ResourceView[];
}>;

export type ToolDetailView = Readonly<{
  section: "tools";
  id: string;
  name: string;
  sourceLabel: string;
  description: string;
  readOnlyLabel: string;
  riskLabels: readonly string[];
  availabilityLabel: string;
  inputShapeLabel: string;
  outputShapeLabel: string;
}>;

export type ResourceView = Readonly<{
  name: string;
  availabilityLabel: string;
}>;

export type SkillGateView = Readonly<{
  title: string;
  description: string;
  capabilityState: "gated";
}>;

export type LoadedCatalogSummary = Readonly<{
  loadedRobots: number;
  loadedTools: number;
  availableTools: number;
  robotsComplete: boolean;
  toolsComplete: boolean;
}>;

export type CatalogMessageState =
  | "loading"
  | "empty"
  | "ready"
  | "unavailable"
  | "permission_denied"
  | "error"
  | "partial";

export const intelligenceSectionTabs = Object.freeze([
  { label: "机器人", value: "robots" },
  { label: "技能", value: "skills" },
  { label: "工具", value: "tools" },
]);

export const skillGateView: SkillGateView = Object.freeze({
  title: "技能目录待接入",
  description: "当前版本尚未提供技能数据服务，这里不会展示示例技能。",
  capabilityState: "gated",
});

const robotSourceLabels = {
  local_trusted: "本地可信",
  enterprise_published: "企业发布",
  official_builtin: "平台内置",
} satisfies Record<RobotCatalogSource, string>;

const toolSourceLabels = {
  enterprise_package: "企业工具包",
  official_package: "平台工具包",
} satisfies Record<ToolCatalogSource, string>;

const restrictionLabels = {
  unrestricted: "不限制",
  restricted_nonempty: "已限制可用范围",
  restricted_empty: "明确不允许使用任何此类资源",
} satisfies Record<CatalogRestrictionState, string>;

const availabilityLabels = {
  available: "可用",
  unavailable: "不可用",
  unknown: "状态未知",
} satisfies Record<CatalogAvailability, string>;

const unavailableReasonLabels = {
  "catalog.availability_unknown": "目录暂时无法确认可用性",
  "catalog.credential_unavailable": "凭证不可用",
  "catalog.disabled": "已停用",
  "catalog.health_unavailable": "健康状态不可用",
  "catalog.model_unavailable": "模型不可用",
  "catalog.revision_unavailable": "指定版本不可用",
  "catalog.revoked": "已撤销",
} satisfies Record<CatalogUnavailableReason, string>;

const riskLabels = {
  routine_file: "常规文件操作",
  destructive_file: "可能修改或删除文件",
  protected_resource: "涉及受保护资源",
  local_execution: "可在本地执行操作",
  external_send: "可向外部发送数据",
  unknown: "风险状态未知",
} satisfies Record<ToolRiskFactKind, string>;

const catalogErrorLabels = {
  "catalog.invalid_query": "目录请求无效，请刷新后重试。",
  "catalog.cursor_invalid": "当前分页位置已失效，请刷新。",
  "catalog.stale_cursor": "目录已变化，请刷新。",
  "catalog.registry_unavailable": "目录暂时不可用。",
  "catalog.integrity_violation": "受信目录完整性校验失败。",
  "catalog.response_too_large": "目录响应超出安全大小限制。",
  "catalog.robot_not_found": "机器人不存在或已不可见。",
  "catalog.tool_not_found": "工具不存在或已不可见。",
  "catalog.client_mismatch": "当前窗口与智能资源服务连接不一致，请刷新。",
  "catalog.runtime_changed": "应用服务已重新连接，请刷新智能资源。",
  "contract.feature_unavailable": "目录能力暂不可用。",
  "runtime.request_aborted": "请求已被取消或被较新的页面状态取代。",
} as const;

const builtInToolPresentations: Readonly<Record<string, { name: string; description: string }>> = Object.freeze({
  "tool.document.docx.read": {
    name: "DOCX 读取",
    description: "读取 DOCX 文档中的标题、段落、列表、表格和定位信息。",
  },
  "tool.document.pdf.extract_tables": {
    name: "PDF 表格提取",
    description: "从带文本层的 PDF 中提取表格。扫描件、图片型 PDF 和 OCR 不在当前能力范围内。",
  },
  "tool.document.pdf.extract_text": {
    name: "PDF 文本提取",
    description: "从授权工作区内的 PDF 文件中只读提取文本。",
  },
  "tool.document.pptx.write": {
    name: "PPTX 生成",
    description: "在授权工作区内创建新的 PPTX 演示文稿；远程图片由受控资源解析器处理。",
  },
  "tool.document.xlsx.read": {
    name: "XLSX 读取",
    description: "读取 XLSX 工作簿中的工作表、行列、单元格、公式表达式和定位信息。",
  },
  "tool.document.xlsx.write": {
    name: "XLSX 写入",
    description: "创建新的 XLSX 文件；覆盖已有文件时必须经过精确用户确认。",
  },
});

export function buildRobotSummaryCard(robot: RobotCatalogSummary): RobotSummaryCard {
  return {
    section: "robots",
    id: robot.robotId,
    name: robot.displayName,
    sourceLabel: robotSourceLabels[robot.source],
    description: safeSummary(robot.description),
    runnableLabel: robot.runnable
      ? "可运行"
      : presentUnavailableReason(robot.unavailableReason),
    restrictionLabels: presentRestrictionSummary(robot.restrictionSummary),
    detailPath: `/intelligence/robots/${encodeURIComponent(robot.robotId)}`,
  };
}

export function buildToolSummaryCard(tool: ToolCatalogSummary): ToolSummaryCard {
  const display = presentToolDisplay(tool);
  return {
    section: "tools",
    id: tool.toolId,
    name: display.name,
    sourceLabel: toolSourceLabels[tool.source],
    description: safeSummary(display.description),
    readOnlyLabel: tool.readOnly ? "只读" : "可产生变更",
    riskLabels: tool.riskSummary.length === 0
      ? ["风险状态未知"]
      : tool.riskSummary.map((risk) => riskLabels[risk]),
    availabilityLabel: presentAvailability(tool.availability, tool.unavailableReason),
    detailPath: `/intelligence/tools/${encodeURIComponent(tool.toolId)}`,
  };
}

export function buildRobotDetailView(robot: RobotCatalogDetail): RobotDetailView {
  return {
    section: "robots",
    id: robot.robotId,
    name: robot.displayName,
    sourceLabel: robotSourceLabels[robot.source],
    description: safeSummary(robot.description),
    runnableLabel: robot.runnable
      ? "可运行"
      : presentUnavailableReason(robot.unavailableReason),
    defaultModel: buildResourceView(robot.defaultModel),
    allowModelOverrideLabel: robot.allowModelOverride ? "允许任务临时切换模型" : "使用默认模型",
    eligibleModels: robot.eligibleModels.map(buildResourceView),
    skills: robot.skills.map(buildResourceView),
    tools: robot.tools.map(buildResourceView),
    knowledge: robot.knowledge.map(buildResourceView),
  };
}

export function buildToolDetailView(tool: ToolCatalogDetail): ToolDetailView {
  const display = presentToolDisplay(tool);
  return {
    section: "tools",
    id: tool.toolId,
    name: display.name,
    sourceLabel: toolSourceLabels[tool.source],
    description: safeSummary(display.description),
    readOnlyLabel: tool.readOnly ? "只读" : "可产生变更",
    riskLabels: tool.riskSummary.length === 0
      ? ["风险状态未知"]
      : tool.riskSummary.map((risk) => riskLabels[risk]),
    availabilityLabel: presentAvailability(tool.availability, tool.unavailableReason),
    inputShapeLabel: "结构化输入",
    outputShapeLabel: tool.outputShape === "structured_object"
      ? "结构化输出"
      : "输出形态未声明",
  };
}

export function filterCards(
  cards: readonly IntelligenceCard[],
  searchQuery: string,
): readonly IntelligenceCard[] {
  const query = normalizeSearch(searchQuery);
  if (query === "") return cards;
  return cards.filter((card) => searchableCardText(card).includes(query));
}

export function buildLoadedCatalogSummary(input: {
  robots: readonly RobotCatalogSummary[];
  tools: readonly ToolCatalogSummary[];
  robotNextCursor?: string;
  toolNextCursor?: string;
}): LoadedCatalogSummary {
  return {
    loadedRobots: input.robots.length,
    loadedTools: input.tools.length,
    availableTools: input.tools.filter((tool) => tool.availability === "available").length,
    robotsComplete: input.robotNextCursor === undefined,
    toolsComplete: input.toolNextCursor === undefined,
  };
}

export function presentCatalogError(input: {
  code: string;
  safeSummary?: string;
  retryable?: boolean;
}): {
  state: CatalogMessageState;
  title: string;
  description: string;
  retryable: boolean;
} {
  if (input.code === "runtime.request_aborted") {
    return {
      state: "error",
      title: "请求已取消",
      description: catalogErrorLabels["runtime.request_aborted"],
      retryable: false,
    };
  }
  if (input.code === "catalog.runtime_changed") {
    return {
      state: "unavailable",
      title: "目录需要刷新",
      description: catalogErrorLabels["catalog.runtime_changed"],
      retryable: true,
    };
  }
  if (input.code === "contract.feature_unavailable") {
    return {
      state: "unavailable",
      title: "目录能力不可用",
      description: catalogErrorLabels["contract.feature_unavailable"],
      retryable: false,
    };
  }
  if (input.code.includes("credential") || input.code.includes("permission")) {
    return {
      state: "permission_denied",
      title: "无法查看目录",
      description: input.safeSummary ?? "当前用户无权查看该目录。",
      retryable: input.retryable ?? false,
    };
  }
  return {
    state: "error",
    title: "目录暂不可用",
    description: catalogErrorLabels[input.code as keyof typeof catalogErrorLabels]
      ?? input.safeSummary
      ?? "目录请求无法安全完成。",
    retryable: input.retryable ?? false,
  };
}

export function presentAvailability(
  availability: CatalogAvailability,
  unavailableReason?: CatalogUnavailableReason,
): string {
  if (availability === "available") return availabilityLabels.available;
  if (unavailableReason !== undefined) return unavailableReasonLabels[unavailableReason];
  return availabilityLabels[availability];
}

export function presentUnavailableReason(reason: CatalogUnavailableReason | undefined): string {
  return reason === undefined ? "不可用" : unavailableReasonLabels[reason];
}

function presentRestrictionSummary(summary: RobotRestrictionSummary): readonly string[] {
  return [
    `模型：${restrictionLabels[summary.models]}`,
    `技能：${restrictionLabels[summary.skills]}`,
    `工具：${restrictionLabels[summary.tools]}`,
    `知识：${restrictionLabels[summary.knowledge]}`,
  ];
}

function buildResourceView(resource: CatalogResourceSummaryV1Alpha2): ResourceView {
  return {
    name: resource.displayName,
    availabilityLabel: presentAvailability(resource.availability, resource.unavailableReason),
  };
}

function presentToolDisplay(tool: Pick<ToolCatalogSummary, "toolId" | "displayName" | "description">): {
  name: string;
  description: string;
} {
  return builtInToolPresentations[tool.toolId] ?? {
    name: tool.displayName,
    description: tool.description,
  };
}

function searchableCardText(card: IntelligenceCard): string {
  const values = card.section === "tools"
    ? [
        card.name,
        card.id,
        card.sourceLabel,
        card.description,
        card.readOnlyLabel,
        ...card.riskLabels,
        card.availabilityLabel,
      ]
    : [
        card.name,
        card.sourceLabel,
        card.description,
        card.runnableLabel,
        ...card.restrictionLabels,
      ];
  return normalizeSearch(values.join(" "));
}

function safeSummary(value: string): string {
  return value.length > 220 ? `${value.slice(0, 217)}...` : value;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}
