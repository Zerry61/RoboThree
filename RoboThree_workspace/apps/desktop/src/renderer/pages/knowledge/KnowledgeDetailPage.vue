<template>
  <section class="knowledge-detail-page" aria-labelledby="knowledge-detail-title">
    <R3PageHeader
      eyebrow="知识中心"
      :title="detailTitle"
      :description="detailDescription"
    >
      <template #actions>
        <RouterLink class="knowledge-detail-page__back" :to="{ name: productionRouteNames.knowledge }">
          返回知识中心
        </RouterLink>
      </template>
    </R3PageHeader>

    <R3InlineNotice tone="warning" :title="view.noticeTitle">
      {{ view.noticeText }}
    </R3InlineNotice>

    <section v-if="loading" class="knowledge-detail-page__stack" aria-label="知识源详情加载中">
      <R3Skeleton height="18px" />
      <R3Skeleton height="120px" />
    </section>

    <R3EmptyState
      v-else-if="view.state !== 'found'"
      :title="view.title"
      :description="view.description"
      icon="K"
    />

    <section v-else class="knowledge-detail-page__stack" aria-label="知识源详情">
      <R3Card>
        <template #header>
          <div class="knowledge-detail-page__header">
            <div>
              <h2>{{ view.source.name }}</h2>
              <p>{{ view.source.description }}</p>
            </div>
            <div class="knowledge-detail-page__tags">
              <R3Tag tone="neutral">{{ view.source.dataOriginLabel }}</R3Tag>
              <R3Tag tone="neutral">{{ view.source.capabilityStateLabel }}</R3Tag>
              <R3Tag tone="neutral">{{ view.source.statusLabel }}</R3Tag>
            </div>
          </div>
        </template>

        <dl class="knowledge-detail-page__facts">
          <div>
            <dt>来源类型</dt>
            <dd>{{ view.source.sourceLabel }}</dd>
          </div>
          <div>
            <dt>使用范围</dt>
            <dd>{{ view.source.visibilitySummary }}</dd>
          </div>
          <div>
            <dt>示例更新时间</dt>
            <dd>{{ view.source.updatedLabel }}</dd>
          </div>
          <div>
            <dt>状态说明</dt>
            <dd>{{ view.source.statusHelp }}</dd>
          </div>
        </dl>
      </R3Card>

      <R3Card>
        <template #header>
          <div class="knowledge-detail-page__header">
            <div>
              <h2>检索结果样例</h2>
              <p>这些卡片只验证布局，不代表真实知识能力已接入。</p>
            </div>
          </div>
        </template>

        <R3SearchField
          v-if="view.showSearch"
          v-model="query"
          accessible-label="过滤示例结果卡片"
          placeholder="过滤示例结果卡片"
        />

        <R3EmptyState
          v-if="view.filteredResults.length === 0"
          title="没有匹配的示例结果"
          description="当前过滤只作用于界面测试结果。"
          icon="K"
        />

        <ul v-else class="knowledge-detail-page__results">
          <li v-for="result in view.filteredResults" :key="result.id">
            <strong>{{ result.title }}</strong>
            <span>{{ result.sourceLabel }} · {{ result.locationLabel }}</span>
            <R3Tag tone="neutral">示例数据</R3Tag>
          </li>
        </ul>
      </R3Card>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";

import {
  R3Card,
  R3EmptyState,
  R3InlineNotice,
  R3PageHeader,
  R3SearchField,
  R3Skeleton,
  R3Tag,
} from "../../components/ui";
import {
  gatedKnowledgeAdapter,
  knowledgeAdapterKey,
  type KnowledgeAdapter,
} from "../../adapters/knowledge-adapter.js";
import { productionRouteNames } from "../../app/router.js";
import {
  presentKnowledgeDetail,
  type KnowledgeCenterState,
  type KnowledgeSourceFixture,
} from "./knowledge-model.js";

defineOptions({ name: "RoboThreeKnowledgeDetailPage" });

const route = useRoute();
const adapter = inject<KnowledgeAdapter>(knowledgeAdapterKey, gatedKnowledgeAdapter);

const sources = ref<readonly KnowledgeSourceFixture[]>([]);
const state = ref<KnowledgeCenterState>("unconfigured_gated");
const query = ref("");
const loading = ref(true);

const knowledgeId = computed(() => {
  const raw = route.params.knowledgeId;
  return typeof raw === "string" ? raw : "";
});

const view = computed(() => presentKnowledgeDetail(
  state.value,
  sources.value,
  knowledgeId.value,
  query.value,
));
const detailTitle = computed(() => view.value.state === "found" ? view.value.source.name : "知识源详情");
const detailDescription = computed(() => view.value.state === "found"
  ? "示例详情仅用于前端布局验证，真实知识检索待接入。"
  : "真实知识能力尚未配置，详情页保持失败关闭。");

onMounted(() => {
  void loadKnowledge();
});

async function loadKnowledge(): Promise<void> {
  loading.value = true;
  try {
    const data = await adapter.loadKnowledgeSources();
    state.value = data.state;
    sources.value = data.sources;
  } catch {
    state.value = "error";
    sources.value = [];
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.knowledge-detail-page {
  display: grid;
  gap: 20px;
  padding: 24px;
}

.knowledge-detail-page__back {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-sm);
  padding: 0 12px;
  color: var(--r3-color-text);
  text-decoration: none;
  background: var(--r3-color-surface);
}

.knowledge-detail-page__back:focus-visible {
  outline: 2px solid var(--r3-color-focus);
  outline-offset: 2px;
}

.knowledge-detail-page__stack {
  display: grid;
  gap: 12px;
}

.knowledge-detail-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.knowledge-detail-page__header h2,
.knowledge-detail-page__header p {
  margin: 0;
}

.knowledge-detail-page__header p,
.knowledge-detail-page__facts dd,
.knowledge-detail-page__results span {
  color: var(--r3-color-text-secondary);
}

.knowledge-detail-page__tags,
.knowledge-detail-page__results {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.knowledge-detail-page__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.knowledge-detail-page__facts div,
.knowledge-detail-page__results li {
  display: grid;
  gap: 6px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-sm);
  padding: 12px;
}

.knowledge-detail-page__facts dt {
  font-size: 12px;
  font-weight: 700;
  color: var(--r3-color-text-tertiary);
}

.knowledge-detail-page__facts dd {
  margin: 0;
}

.knowledge-detail-page__results {
  list-style: none;
  margin: 0;
  padding: 0;
}

.knowledge-detail-page__results li {
  flex: 1 1 220px;
}

@media (max-width: 760px) {
  .knowledge-detail-page__header,
  .knowledge-detail-page__facts {
    grid-template-columns: 1fr;
  }

  .knowledge-detail-page__header {
    display: grid;
  }
}
</style>
