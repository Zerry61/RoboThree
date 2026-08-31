export type KnowledgeCenterState =
  | "unconfigured_gated"
  | "loading"
  | "empty"
  | "ready"
  | "unavailable"
  | "permission_denied"
  | "error"
  | "partial";

export type KnowledgeDataOrigin = "system" | "prototype";
export type KnowledgeCapabilityState = "gated";

export type KnowledgeSampleResult = {
  id: string;
  dataOrigin: "prototype";
  capabilityState: "gated";
  title: string;
  sourceLabel: string;
  locationLabel: string;
};

export type KnowledgeSourceFixture = {
  id: string;
  dataOrigin: "prototype";
  capabilityState: "gated";
  name: string;
  description: string;
  sourceLabel: string;
  visibilitySummary: string;
  updatedLabel: string;
  status: Exclude<KnowledgeCenterState, "unconfigured_gated" | "loading" | "empty" | "error">;
  sampleResults: readonly KnowledgeSampleResult[];
};

export type KnowledgeSourceCard = {
  id: string;
  name: string;
  description: string;
  sourceLabel: string;
  visibilitySummary: string;
  updatedLabel: string;
  statusLabel: string;
  statusHelp: string;
  dataOriginLabel: string;
  capabilityStateLabel: string;
  sampleResults: readonly KnowledgeSampleResult[];
};

export type KnowledgeCenterView = {
  state: KnowledgeCenterState;
  title: string;
  description: string;
  noticeTitle: string;
  noticeText: string;
  showSearch: boolean;
  showList: boolean;
  emptyTitle: string;
  emptyDescription: string;
  filteredSources: readonly KnowledgeSourceCard[];
};

export type KnowledgeDetailView =
  | {
    state: "found";
    source: KnowledgeSourceCard;
    filteredResults: readonly KnowledgeSampleResult[];
    noticeTitle: string;
    noticeText: string;
    showSearch: boolean;
  }
  | {
    state: "unconfigured_gated" | "unavailable" | "permission_denied" | "error" | "not_found";
    title: string;
    description: string;
    noticeTitle: string;
    noticeText: string;
    showSearch: false;
  };

const safeIdPattern = /^[a-z][a-z0-9-]{2,63}$/;

export function isSafeKnowledgeId(value: string): boolean {
  return safeIdPattern.test(value);
}

export function presentKnowledgeCenter(
  state: KnowledgeCenterState,
  sources: readonly KnowledgeSourceFixture[],
  query: string,
): KnowledgeCenterView {
  if (state === "unconfigured_gated") {
    return {
      state,
      title: "企业知识能力尚未配置",
      description: "企业知识检索能力尚未接入；当前不会读取外部服务、索引或本地文件。",
      noticeTitle: "真实检索待接入",
      noticeText: "知识服务尚未配置，当前不展示示例知识源、搜索框或结果卡片。",
      showSearch: false,
      showList: false,
      emptyTitle: "知识中心未接入",
      emptyDescription: "企业知识能力尚未配置，不影响工作区中的普通文档任务。",
      filteredSources: [],
    };
  }

  if (state === "error") {
    return nonListCenterView(state, "知识中心暂不可用", "知识中心暂不可用，请稍后重试。");
  }

  if (state === "permission_denied") {
    return nonListCenterView(state, "无权查看示例知识源", "当前用户无权查看该示例知识源集合。");
  }

  if (state === "unavailable") {
    return nonListCenterView(state, "知识能力不可用", "该状态仅用于界面测试，不代表真实知识服务故障。");
  }

  if (state === "empty") {
    return nonListCenterView(state, "暂无示例知识源", "这只表示界面测试中的示例集合为空，不代表真实知识服务状态。");
  }

  const cards = sources.map(presentKnowledgeSource);
  const filteredSources = filterKnowledgeSources(cards, query);
  return {
    state,
    title: "知识中心示例",
    description: "以下内容仅用于前端布局验证，真实知识库检索能力待接入。",
    noticeTitle: "示例数据",
    noticeText: "当前搜索仅过滤示例数据，不代表真实知识检索。",
    showSearch: true,
    showList: true,
    emptyTitle: "没有匹配的示例知识源",
    emptyDescription: "这只表示界面测试中的示例集合为空，不代表真实知识服务状态。",
    filteredSources,
  };
}

export function presentKnowledgeDetail(
  state: KnowledgeCenterState,
  sources: readonly KnowledgeSourceFixture[],
  knowledgeId: string,
  query: string,
): KnowledgeDetailView {
  if (state === "unconfigured_gated") {
    return {
      state,
      title: "知识能力未配置",
      description: "企业知识能力尚未配置/接入，详情页不会展示知识源字段或示例结果。",
      noticeTitle: "真实检索待接入",
      noticeText: "知识服务尚未配置；当前不展示搜索框，也不会把页面参数当作知识源名称。",
      showSearch: false,
    };
  }

  if (state === "error") {
    return nonDetailView(
      state,
      "知识中心暂不可用",
      "知识中心暂不可用，请稍后重试。",
      "无法展示详情",
      "错误详情已脱敏，不展示内部对象、服务响应或异常栈。",
    );
  }

  if (state === "permission_denied") {
    return nonDetailView(
      state,
      "无权查看该示例知识源",
      "当前用户无权查看该示例知识源详情。",
      "权限不足",
      "该状态仅用于界面测试，不代表真实权限事实。",
    );
  }

  if (state === "unavailable") {
    return nonDetailView(
      state,
      "知识能力不可用",
      "该状态仅用于界面测试，不代表真实知识服务故障。",
      "详情不可用",
      "真实知识能力仍待接入，当前不会发起外部服务请求。",
    );
  }

  if (!isSafeKnowledgeId(knowledgeId)) {
    return notFoundDetail();
  }
  const source = sources.find((candidate) => candidate.id === knowledgeId);
  if (source === undefined) {
    return notFoundDetail();
  }
  const card = presentKnowledgeSource(source);
  return {
    state: "found",
    source: card,
    filteredResults: filterSampleResults(card.sampleResults, query),
    noticeTitle: "检索结果样例",
    noticeText: "结果卡片仅为界面测试数据，不代表真实知识能力已接入。",
    showSearch: true,
  };
}

export function presentKnowledgeSource(source: KnowledgeSourceFixture): KnowledgeSourceCard {
  return {
    id: source.id,
    name: source.name,
    description: source.description,
    sourceLabel: source.sourceLabel,
    visibilitySummary: source.visibilitySummary,
    updatedLabel: source.updatedLabel,
    statusLabel: statusLabel(source.status),
    statusHelp: statusHelp(source.status),
    dataOriginLabel: "示例数据",
    capabilityStateLabel: "真实检索待接入",
    sampleResults: source.sampleResults,
  };
}

export function filterKnowledgeSources(
  sources: readonly KnowledgeSourceCard[],
  query: string,
): readonly KnowledgeSourceCard[] {
  const normalized = normalizeQuery(query);
  if (normalized.length === 0) return sources;
  return sources.filter((source) => [
    source.name,
    source.description,
    source.sourceLabel,
    ...source.sampleResults.map((result) => result.title),
  ].some((value) => normalizeQuery(value).includes(normalized)));
}

export function filterSampleResults(
  results: readonly KnowledgeSampleResult[],
  query: string,
): readonly KnowledgeSampleResult[] {
  const normalized = normalizeQuery(query);
  if (normalized.length === 0) return results;
  return results.filter((result) => [
    result.title,
    result.sourceLabel,
    result.locationLabel,
  ].some((value) => normalizeQuery(value).includes(normalized)));
}

function notFoundDetail(): KnowledgeDetailView {
  return {
    state: "not_found",
    title: "未找到该示例知识源",
    description: "该详情页只允许打开预定义的安全测试条目；不会把未匹配的页面参数显示为知识源。",
    noticeTitle: "没有可展示详情",
    noticeText: "返回知识中心列表查看当前可用的示例入口。",
    showSearch: false,
  };
}

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function nonListCenterView(
  state: KnowledgeCenterState,
  emptyTitle: string,
  emptyDescription: string,
): KnowledgeCenterView {
  return {
    state,
    title: "知识中心示例",
    description: "真实知识库检索能力待接入。",
    noticeTitle: "真实检索待接入",
    noticeText: "当前不会读取外部服务、索引或本地文件。",
    showSearch: false,
    showList: false,
    emptyTitle,
    emptyDescription,
    filteredSources: [],
  };
}

function nonDetailView(
  state: "unavailable" | "permission_denied" | "error",
  title: string,
  description: string,
  noticeTitle: string,
  noticeText: string,
): KnowledgeDetailView {
  return {
    state,
    title,
    description,
    noticeTitle,
    noticeText,
    showSearch: false,
  };
}

function statusLabel(status: KnowledgeSourceFixture["status"]): string {
  if (status === "ready") return "待接入";
  if (status === "unavailable") return "不可用示例";
  if (status === "permission_denied") return "权限不足示例";
  return "局部示例";
}

function statusHelp(status: KnowledgeSourceFixture["status"]): string {
  if (status === "ready") return "测试数据可展示，但真实知识服务尚未接入。";
  if (status === "unavailable") return "仅用于视觉测试，不代表真实知识服务故障。";
  if (status === "permission_denied") return "仅用于组件测试，不代表真实权限事实。";
  return "部分示例区域可展示，完整的局部可用规则仍待产品确认。";
}
