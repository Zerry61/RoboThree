<template>
  <section class="settings-gate-page" :aria-labelledby="`${config.key}-settings-title`">
    <R3PageHeader
      :eyebrow="config.eyebrow"
      :title="config.title"
      :description="config.description"
    />

    <SettingsSectionLayout>
      <template #nav>
        <SettingsSectionNav />
      </template>

      <R3InlineNotice tone="warning" :title="config.noticeTitle">
        {{ config.noticeText }}
      </R3InlineNotice>

      <R3Card>
        <template #header>
          <div class="settings-gate-page__section-header">
            <div>
              <h2 :id="`${config.key}-settings-title`">接入状态</h2>
              <p>运行状态和功能接入状态分开展示，避免把页面可用误认为能力已接入。</p>
            </div>
            <R3Tag tone="warning">{{ config.capabilityLabel }}</R3Tag>
          </div>
        </template>

        <dl class="settings-gate-page__facts">
          <div>
            <dt>运行状态</dt>
            <dd>{{ config.runtimeStatusLabel }}</dd>
          </div>
          <div>
            <dt>功能状态</dt>
            <dd>{{ config.capabilityLabel }}</dd>
          </div>
          <div>
            <dt>页面说明</dt>
            <dd>静态说明，不会保存或提交</dd>
          </div>
        </dl>
      </R3Card>

      <R3Card>
        <template #header>
          <div class="settings-gate-page__section-header">
            <div>
              <h2>未来配置项</h2>
              <p>以下为静态产品文案，不读取后端状态，也不写入本地持久化。</p>
            </div>
            <R3Tag tone="neutral">静态文案</R3Tag>
          </div>
        </template>

        <dl class="settings-gate-page__fields">
          <div v-for="field in config.fields" :key="field.label">
            <dt>{{ field.label }}</dt>
            <dd>{{ field.value }}</dd>
          </div>
        </dl>
      </R3Card>

      <R3Card>
        <template #header>
          <div class="settings-gate-page__section-header">
            <div>
              <h2>业务操作</h2>
              <p>导航允许进入页面；禁用的是尚未接入的业务操作。</p>
            </div>
            <R3Tag tone="warning">不可操作</R3Tag>
          </div>
        </template>

        <R3InlineNotice tone="info" title="禁用原因">
          {{ config.disabledReason }}
        </R3InlineNotice>

        <div class="settings-gate-page__actions" aria-label="待接入操作">
          <R3Button
            v-for="action in config.disabledActions"
            :key="action"
            variant="secondary"
            disabled
          >
            {{ action }}
          </R3Button>
        </div>
      </R3Card>
    </SettingsSectionLayout>
  </section>
</template>

<script setup lang="ts">
import {
  R3Button,
  R3Card,
  R3InlineNotice,
  R3PageHeader,
  R3Tag,
} from "../../components/ui";
import SettingsSectionLayout from "./SettingsSectionLayout.vue";
import SettingsSectionNav from "./SettingsSectionNav.vue";
import type { SettingsCapabilityGateConfig } from "./settings-section-model.js";

defineOptions({ name: "RoboThreeSettingsCapabilityGatePage" });

defineProps<{
  config: SettingsCapabilityGateConfig;
}>();
</script>

<style scoped>
.settings-gate-page {
  display: grid;
  align-content: start;
  gap: 14px;
  width: min(100%, 1080px);
  margin: 0 auto;
  padding: 24px;
  min-width: 0;
}

.settings-gate-page__section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.settings-gate-page__section-header h2,
.settings-gate-page__section-header p {
  margin: 0;
}

.settings-gate-page__section-header p,
.settings-gate-page__facts dd,
.settings-gate-page__fields dd {
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-sm);
}

.settings-gate-page__facts,
.settings-gate-page__fields {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.settings-gate-page__facts div,
.settings-gate-page__fields div {
  min-width: 0;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 12px;
}

.settings-gate-page__facts dt,
.settings-gate-page__fields dt {
  margin-bottom: 4px;
  font-weight: 700;
}

.settings-gate-page__facts dd,
.settings-gate-page__fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.settings-gate-page__actions {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 980px) {
  .settings-gate-page__facts,
  .settings-gate-page__fields {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .settings-gate-page {
    padding: 18px 14px;
  }
}
</style>
