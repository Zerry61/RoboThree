<template>
  <section class="settings-model-page" aria-labelledby="settings-model-title">
    <R3PageHeader
      eyebrow="Settings"
      title="模型管理"
      description="查看当前可用的模型安全摘要。个人模型管理和 Credential 链路仍待接入。"
    >
      <template #actions>
        <R3Button variant="secondary" :disabled="loading" @click="void refresh()">
          刷新
        </R3Button>
      </template>
    </R3PageHeader>

    <SettingsSectionLayout>
      <template #nav>
        <SettingsSectionNav />
      </template>

      <div class="settings-model-page__content">
        <R3InlineNotice tone="warning" title="Credential 安全边界">
          当前页面不会接收真实 API Key，不会显示 Credential Reference，也不会声明任何添加、保存、删除或设为默认结果。
        </R3InlineNotice>

        <R3InlineNotice v-if="error" tone="danger" title="模型管理加载失败">
          {{ error }}
        </R3InlineNotice>

        <section v-if="loading" class="settings-model-page__stack" aria-label="模型加载中">
          <R3Skeleton height="18px" />
          <R3Skeleton height="64px" />
          <R3Skeleton height="64px" />
        </section>

        <R3EmptyState
          v-else-if="view.empty"
          :title="view.emptyTitle"
          :description="view.emptyDescription"
          icon="M"
        />

        <section v-else class="settings-model-page__stack" aria-label="模型列表">
          <R3Card
            v-for="section in view.sections"
            :key="section.key"
          >
            <template #header>
              <div class="settings-model-page__section-header">
                <div>
                  <h2>{{ section.title }}</h2>
                  <p>{{ section.description }}</p>
                </div>
                <R3Tag tone="neutral">{{ section.rows.length }} 项</R3Tag>
              </div>
            </template>

            <ul class="settings-model-page__model-list">
              <li
                v-for="row in section.rows"
                :key="row.modelId"
                class="settings-model-page__model-row"
              >
                <div class="settings-model-page__model-main">
                  <strong>{{ row.displayName }}</strong>
                  <span>{{ row.sourceLabel }} · {{ row.capabilitiesLabel }}</span>
                  <small>{{ modelIdentifierExplanation() }}</small>
                </div>
                <div class="settings-model-page__model-state">
                  <R3StatusBadge :tone="row.availability === 'available' ? 'neutral' : 'warning'">
                    {{ row.statusLabel }}
                  </R3StatusBadge>
                  <span>{{ row.statusHelp }}</span>
                </div>
              </li>
            </ul>
          </R3Card>
        </section>

        <R3Card>
          <template #header>
            <div class="settings-model-page__section-header">
              <div>
                <h2>{{ view.personalGate.title }}</h2>
                <p>{{ view.personalGate.description }}</p>
              </div>
              <R3Tag tone="warning">{{ view.personalGate.statusLabel }}</R3Tag>
            </div>
          </template>

          <div class="settings-model-page__gate">
            <dl>
              <div>
                <dt>Provider</dt>
                <dd>DeepSeek、智谱、Kimi、自定义；真实默认 Endpoint 由后续受控配置提供。</dd>
              </div>
              <div>
                <dt>模型标识</dt>
                <dd>提交给 Provider 的精确 Model ID；当前真实 Projection 尚未提供该字段。</dd>
              </div>
              <div>
                <dt>显示名称</dt>
                <dd>用户在列表和任务选择器看到的名称；当前兼容期只来自安全显示字段。</dd>
              </div>
            </dl>

            <R3InlineNotice tone="info" title="禁用原因">
              {{ view.personalGate.actionsDisabledReason }}
            </R3InlineNotice>

            <div class="settings-model-page__actions" aria-label="个人模型待接入操作">
              <R3Button variant="secondary" disabled>添加个人模型</R3Button>
              <R3Button variant="secondary" disabled>查看 Key</R3Button>
              <R3Button variant="secondary" disabled>设为默认</R3Button>
              <R3Button variant="danger" disabled>删除</R3Button>
            </div>
          </div>
        </R3Card>
      </div>
    </SettingsSectionLayout>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";

import {
  R3Button,
  R3Card,
  R3EmptyState,
  R3InlineNotice,
  R3PageHeader,
  R3Skeleton,
  R3StatusBadge,
  R3Tag,
} from "../../components/ui";
import {
  desktopSettingsAdapter,
  settingsAdapterKey,
  type SettingsAdapter,
} from "../../adapters/settings-adapter.js";
import SettingsSectionLayout from "./SettingsSectionLayout.vue";
import SettingsSectionNav from "./SettingsSectionNav.vue";
import {
  modelIdentifierExplanation,
  presentModelManagement,
} from "./settings-model-management-model.js";

defineOptions({ name: "RoboThreeSettingsModelPage" });

const adapter = inject<SettingsAdapter>(settingsAdapterKey, desktopSettingsAdapter);
const models = ref<Awaited<ReturnType<SettingsAdapter["loadSettingsModels"]>>["models"]>([]);
const loading = ref(true);
const error = ref("");

const view = computed(() => presentModelManagement(models.value));

onMounted(() => {
  void refresh();
});

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const data = await adapter.loadSettingsModels();
    models.value = data.models;
    error.value = "";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "未知错误。";
    models.value = [];
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.settings-model-page {
  display: grid;
  gap: 20px;
  padding: 24px;
}

.settings-model-page__content,
.settings-model-page__stack,
.settings-model-page__gate {
  display: grid;
  gap: 12px;
}

.settings-model-page__section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.settings-model-page__section-header h2,
.settings-model-page__section-header p {
  margin: 0;
}

.settings-model-page__section-header p,
.settings-model-page__model-main span,
.settings-model-page__model-main small,
.settings-model-page__model-state span,
.settings-model-page__gate dd {
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-sm);
}

.settings-model-page__model-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.settings-model-page__model-row {
  min-width: 0;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 340px);
  gap: 12px;
  align-items: start;
}

.settings-model-page__model-main,
.settings-model-page__model-state {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.settings-model-page__model-main strong {
  overflow-wrap: anywhere;
}

.settings-model-page__gate dl {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.settings-model-page__gate dt {
  margin-bottom: 4px;
  font-weight: 700;
}

.settings-model-page__gate dd {
  margin: 0;
}

.settings-model-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 980px) {
  .settings-model-page__model-row,
  .settings-model-page__gate dl {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
