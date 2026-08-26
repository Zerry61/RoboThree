<template>
  <section class="knowledge-page" aria-labelledby="knowledge-center-title">
    <R3PageHeader
      eyebrow="Knowledge"
      title="知识中心"
      description="查看知识能力接入状态。真实知识库检索能力仍待接入。"
    />

    <R3InlineNotice tone="warning" :title="view.noticeTitle">
      {{ view.noticeText }}
    </R3InlineNotice>

    <R3InlineNotice v-if="error" tone="danger" title="知识中心暂不可用">
      {{ error }}
    </R3InlineNotice>

    <section v-if="loading" class="knowledge-page__stack" aria-label="知识中心加载中">
      <R3Skeleton height="18px" />
      <R3Skeleton height="96px" />
      <R3Skeleton height="96px" />
    </section>

    <R3EmptyState
      v-else-if="!view.showList"
      :title="view.emptyTitle"
      :description="view.emptyDescription"
      icon="K"
    />

    <section v-else class="knowledge-page__layout" aria-label="知识源示例列表">
      <div class="knowledge-page__toolbar">
        <R3SearchField
          v-if="view.showSearch"
          v-model="query"
          accessible-label="搜索知识源示例"
          placeholder="搜索知识源示例"
        />
      </div>

      <R3EmptyState
        v-if="view.filteredSources.length === 0"
        :title="view.emptyTitle"
        :description="view.emptyDescription"
        icon="K"
      />

      <ul v-else class="knowledge-page__list">
        <li v-for="source in view.filteredSources" :key="source.id">
          <RouterLink
            class="knowledge-page__source"
            :to="{ name: productionRouteNames.knowledgeDetail, params: { knowledgeId: source.id } }"
          >
            <div>
              <strong>{{ source.name }}</strong>
              <p>{{ source.description }}</p>
            </div>
            <div class="knowledge-page__meta">
              <R3Tag tone="neutral">{{ source.dataOriginLabel }}</R3Tag>
              <R3Tag tone="neutral">{{ source.capabilityStateLabel }}</R3Tag>
              <R3Tag tone="neutral">{{ source.statusLabel }}</R3Tag>
            </div>
            <small>{{ source.sourceLabel }} · {{ source.visibilitySummary }} · {{ source.updatedLabel }}</small>
          </RouterLink>
        </li>
      </ul>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";

import {
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
import {
  presentKnowledgeCenter,
  type KnowledgeCenterState,
  type KnowledgeSourceFixture,
} from "./knowledge-model.js";
import { productionRouteNames } from "../../app/router.js";

defineOptions({ name: "RoboThreeKnowledgeCenterPage" });

const adapter = inject<KnowledgeAdapter>(knowledgeAdapterKey, gatedKnowledgeAdapter);

const sources = ref<readonly KnowledgeSourceFixture[]>([]);
const state = ref<KnowledgeCenterState>("unconfigured_gated");
const query = ref("");
const loading = ref(true);
const error = ref("");

const view = computed(() => presentKnowledgeCenter(state.value, sources.value, query.value));

onMounted(() => {
  void loadKnowledge();
});

async function loadKnowledge(): Promise<void> {
  loading.value = true;
  try {
    const data = await adapter.loadKnowledgeSources();
    state.value = data.state;
    sources.value = data.sources;
    error.value = "";
  } catch {
    state.value = "error";
    sources.value = [];
    error.value = "知识中心暂不可用，请稍后重试。";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.knowledge-page {
  display: grid;
  gap: 20px;
  padding: 24px;
}

.knowledge-page__stack,
.knowledge-page__layout,
.knowledge-page__list {
  display: grid;
  gap: 12px;
}

.knowledge-page__toolbar {
  max-width: 420px;
}

.knowledge-page__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.knowledge-page__source {
  min-height: 112px;
  display: grid;
  gap: 10px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 14px;
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
  text-decoration: none;
}

.knowledge-page__source:focus-visible {
  outline: 2px solid var(--r3-color-focus);
  outline-offset: 2px;
}

.knowledge-page__source strong,
.knowledge-page__source p,
.knowledge-page__source small {
  margin: 0;
}

.knowledge-page__source p,
.knowledge-page__source small {
  color: var(--r3-color-text-secondary);
}

.knowledge-page__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
