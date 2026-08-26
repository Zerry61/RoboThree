import type { InjectionKey } from "vue";

import type {
  KnowledgeCenterState,
  KnowledgeSourceFixture,
} from "../pages/knowledge/knowledge-model.js";

export type KnowledgeAdapterData = {
  state: KnowledgeCenterState;
  sources: readonly KnowledgeSourceFixture[];
};

export type KnowledgeAdapter = {
  loadKnowledgeSources(): Promise<KnowledgeAdapterData>;
};

export const knowledgeAdapterKey: InjectionKey<KnowledgeAdapter> =
  Symbol("RoboThreeKnowledgeAdapter");

export const gatedKnowledgeAdapter: KnowledgeAdapter = Object.freeze({
  async loadKnowledgeSources(): Promise<KnowledgeAdapterData> {
    return {
      state: "unconfigured_gated",
      sources: [],
    };
  },
});

export const fixtureKnowledgeAdapter: KnowledgeAdapter = Object.freeze({
  async loadKnowledgeSources(): Promise<KnowledgeAdapterData> {
    return {
      state: "ready",
      sources: knowledgeFixtureSources,
    };
  },
});

export const knowledgeFixtureSources: readonly KnowledgeSourceFixture[] = Object.freeze([
  {
    id: "enterprise-policy-demo",
    dataOrigin: "prototype",
    capabilityState: "gated",
    name: "企业制度知识源示例",
    description: "用于展示知识中心布局的示例条目，真实企业知识能力尚未配置。",
    sourceLabel: "企业知识源示例",
    visibilitySummary: "示例部门可见",
    updatedLabel: "示例更新时间 2026-08-20",
    status: "ready",
    sampleResults: [
      {
        id: "policy-result-1",
        dataOrigin: "prototype",
        capabilityState: "gated",
        title: "检索结果样例：报销制度",
        sourceLabel: "制度手册示例",
        locationLabel: "示例章节 2.1",
      },
      {
        id: "policy-result-2",
        dataOrigin: "prototype",
        capabilityState: "gated",
        title: "检索结果样例：差旅申请",
        sourceLabel: "流程说明示例",
        locationLabel: "示例章节 4.3",
      },
    ],
  },
  {
    id: "product-faq-demo",
    dataOrigin: "prototype",
    capabilityState: "gated",
    name: "产品问答知识源示例",
    description: "展示列表过滤和详情卡片的本地 Fixture，不代表真实知识检索。",
    sourceLabel: "产品资料示例",
    visibilitySummary: "示例项目组可见",
    updatedLabel: "示例更新时间 2026-08-19",
    status: "partial",
    sampleResults: [
      {
        id: "faq-result-1",
        dataOrigin: "prototype",
        capabilityState: "gated",
        title: "示例结果卡片：功能边界",
        sourceLabel: "FAQ 示例",
        locationLabel: "示例条目 7",
      },
    ],
  },
]);
