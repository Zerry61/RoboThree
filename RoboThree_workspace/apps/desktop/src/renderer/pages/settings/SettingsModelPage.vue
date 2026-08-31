<template>
  <SettingsPageFrame title="模型管理" description="查看企业、平台和个人模型的安全只读信息。">
      <template #actions>
        <R3Button variant="secondary" :disabled="loading" @click="void refresh()">
          刷新
        </R3Button>
      </template>

      <div class="settings-model-page__content" aria-label="模型管理内容">
        <R3InlineNotice tone="warning" title="凭证安全说明">
          当前页面不会接收或显示真实密钥，也不会声明任何添加、保存、删除或设为默认结果。
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
          v-else-if="view.empty && personalRows.length === 0"
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
                <h2>个人模型</h2>
                <p>只读展示已通过安全凭据链路注册的个人模型。</p>
              </div>
              <R3Tag :tone="personalCatalogAvailable ? 'neutral' : 'warning'">
                {{ personalCatalogAvailable ? `${personalRows.length} 项` : "待接入" }}
              </R3Tag>
            </div>
          </template>

          <div class="settings-model-page__gate">
            <R3Skeleton v-if="personalLoading" height="64px" />
            <R3InlineNotice v-else-if="personalError" tone="danger" title="个人模型加载失败">{{ personalError }}</R3InlineNotice>
            <R3InlineNotice v-else-if="!personalCatalogAvailable" tone="warning" title="个人模型目录不可用">{{ personalUnavailableMessage }}</R3InlineNotice>
            <p v-else-if="personalRows.length === 0" class="settings-model-page__empty-copy">当前没有个人模型。</p>
            <ul v-else class="settings-model-page__model-list" aria-label="个人模型列表">
              <li v-for="row in personalRows" :key="row.personalModelId" class="settings-model-page__model-row">
                <div class="settings-model-page__model-main">
                  <span class="settings-model-page__name-line"><strong>{{ row.displayName }}</strong><R3Tag v-if="row.preferenceSelected" tone="neutral">个人默认</R3Tag></span>
                  <span>{{ row.providerLabel }} · {{ row.endpointDisplayHost }}</span>
                  <small>模型标识：{{ row.providerModelId }}</small>
                  <small>{{ row.capabilityLabel }}</small>
                </div>
                <div class="settings-model-page__model-state">
                  <R3StatusBadge tone="neutral">{{ row.statusLabel }}</R3StatusBadge>
                  <span>{{ row.statusHelp }}</span>
                </div>
              </li>
            </ul>

            <R3InlineNotice tone="info" title="禁用原因">
              个人模型添加与凭证管理尚未开放。本页不会接收或显示 API Key。
            </R3InlineNotice>

            <div class="settings-model-page__actions">
              <R3Button variant="secondary" disabled>添加个人模型</R3Button>
            </div>
          </div>
        </R3Card>
      </div>
  </SettingsPageFrame>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";

import {
  R3Button,
  R3Card,
  R3EmptyState,
  R3InlineNotice,
  R3Skeleton,
  R3StatusBadge,
  R3Tag,
} from "../../components/ui";
import {
  desktopPersonalModelSettingsAdapter,
  personalModelSettingsAdapterKey,
  type PersonalModelSettingsAdapter,
} from "../../adapters/personal-model-settings-adapter.js";
import {
  DesktopSettingsAdapterError,
  desktopSettingsAdapter,
  safeSettingsErrorMessage,
  settingsAdapterKey,
  type SettingsAdapter,
} from "../../adapters/settings-adapter.js";
import SettingsPageFrame from "./SettingsPageFrame.vue";
import {
  modelIdentifierExplanation,
  presentModelManagement,
  presentPersonalModelRow,
} from "./settings-model-management-model.js";

defineOptions({ name: "RoboThreeSettingsModelPage" });

const adapter = inject<SettingsAdapter>(settingsAdapterKey, desktopSettingsAdapter);
const personalAdapter = inject<PersonalModelSettingsAdapter>(personalModelSettingsAdapterKey, desktopPersonalModelSettingsAdapter);
const models = ref<Awaited<ReturnType<SettingsAdapter["loadSettingsModels"]>>["models"]>([]);
const personalModels = ref<Awaited<ReturnType<PersonalModelSettingsAdapter["loadPersonalModels"]>>["models"]>([]);
const loading = ref(true);
const error = ref("");
const personalLoading = ref(true);
const personalError = ref("");
const personalCatalogAvailable = ref(false);
const personalUnavailableMessage = ref("个人模型目录尚未开放。");

const view = computed(() => presentModelManagement(models.value.filter((model) => model.source !== "personal")));
const personalRows = computed(() => personalModels.value.map(presentPersonalModelRow));

onMounted(() => {
  void refresh();
});

async function refresh(): Promise<void> {
  loading.value = true;
  personalLoading.value = true;
  await Promise.all([loadSharedModels(), loadPersonalModels()]);
}

async function loadSharedModels(): Promise<void> {
  try { models.value = (await adapter.loadSettingsModels()).models; error.value = ""; }
  catch (caught) {
    error.value = caught instanceof DesktopSettingsAdapterError ? safeSettingsErrorMessage(caught.message) : "模型管理暂不可用，请稍后重试。";
    models.value = [];
  } finally { loading.value = false; }
}

async function loadPersonalModels(): Promise<void> {
  try {
    const data = await personalAdapter.loadPersonalModels();
    personalModels.value = data.models;
    personalCatalogAvailable.value = data.catalogAvailable;
    personalUnavailableMessage.value = data.unavailableMessage ?? "个人模型目录尚未开放。";
    personalError.value = "";
  } catch {
    personalModels.value = [];
    personalCatalogAvailable.value = false;
    personalError.value = "个人模型目录暂不可用，请稍后重试。";
  } finally { personalLoading.value = false; }
}
</script>

<style scoped>
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
  gap: 0;
}

.settings-model-page__model-row {
  min-width: 0;
  border-bottom: 1px solid var(--r3-color-border);
  padding: 11px 2px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 340px);
  gap: 12px;
  align-items: start;
}

.settings-model-page__model-row:last-child {
  border-bottom: 0;
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

.settings-model-page__name-line { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.settings-model-page__empty-copy { margin: 0; color: var(--r3-color-text-secondary); font-size: var(--r3-font-size-sm); }

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
