<template>
  <section class="intelligence-detail" aria-label="智能资源详情">
    <button type="button" class="intelligence-detail__back" @click="void returnToCatalog()">
      <span aria-hidden="true">←</span> 返回智能中心
    </button>

    <header class="intelligence-detail__page-header">
      <div>
        <p>{{ sectionLabel }}</p>
        <h2>{{ pageTitle }}</h2>
        <span>{{ pageDescription }}</span>
      </div>
      <R3Button v-if="state.status === 'error' || state.status === 'unavailable'" variant="secondary" @click="void loadDetail()">
        重新加载
      </R3Button>
    </header>

    <div v-if="state.status === 'loading'" class="intelligence-detail__loading" aria-label="正在加载详情">
      <R3Skeleton />
      <R3Skeleton />
      <R3Skeleton />
    </div>

    <R3InlineNotice
      v-else-if="state.status === 'error' || state.status === 'unavailable'"
      :tone="state.status === 'error' ? 'danger' : 'warning'"
      :title="state.messageTitle"
    >
      {{ state.messageDescription }}
    </R3InlineNotice>

    <R3Card v-else-if="section === 'skills'">
      <R3EmptyState
        icon="S"
        title="技能详情待接入"
        description="当前版本尚未提供真实技能目录和详情，暂不展示示例数据。"
      />
    </R3Card>

    <template v-else-if="state.robot">
      <R3Card>
        <article class="intelligence-detail__hero" data-intelligence-detail="robots">
          <span class="intelligence-detail__avatar" aria-hidden="true">R</span>
          <div>
            <div class="intelligence-detail__identity">
              <h3>{{ state.robot.name }}</h3>
              <R3Tag tone="neutral">{{ state.robot.sourceLabel }}</R3Tag>
              <R3Tag tone="neutral">{{ state.robot.runnableLabel }}</R3Tag>
            </div>
            <p>{{ state.robot.description }}</p>
          </div>
        </article>
      </R3Card>

      <div class="intelligence-detail__sections">
        <R3Card>
          <template #header><h3>运行配置</h3></template>
          <dl class="intelligence-detail__facts">
            <div><dt>默认模型</dt><dd>{{ state.robot.defaultModel.name }} · {{ state.robot.defaultModel.availabilityLabel }}</dd></div>
            <div><dt>模型切换</dt><dd>{{ state.robot.allowModelOverrideLabel }}</dd></div>
            <div><dt>可用模型</dt><dd>{{ resourceNames(state.robot.eligibleModels) }}</dd></div>
          </dl>
        </R3Card>
        <R3Card>
          <template #header><h3>可用资源</h3></template>
          <dl class="intelligence-detail__facts">
            <div><dt>技能</dt><dd>{{ resourceNames(state.robot.skills) }}</dd></div>
            <div><dt>工具</dt><dd>{{ resourceNames(state.robot.tools) }}</dd></div>
            <div><dt>知识</dt><dd>{{ resourceNames(state.robot.knowledge) }}</dd></div>
          </dl>
        </R3Card>
      </div>
    </template>

    <template v-else-if="state.tool">
      <R3Card>
        <article class="intelligence-detail__hero" data-intelligence-detail="tools">
          <span class="intelligence-detail__avatar" aria-hidden="true">T</span>
          <div>
            <div class="intelligence-detail__identity">
              <h3>{{ state.tool.name }}</h3>
              <R3Tag tone="neutral">{{ state.tool.sourceLabel }}</R3Tag>
              <R3Tag tone="neutral">{{ state.tool.availabilityLabel }}</R3Tag>
            </div>
            <p>{{ state.tool.description }}</p>
          </div>
        </article>
      </R3Card>

      <div class="intelligence-detail__sections">
        <R3Card>
          <template #header><h3>使用边界</h3></template>
          <dl class="intelligence-detail__facts">
            <div><dt>读写边界</dt><dd>{{ state.tool.readOnlyLabel }}</dd></div>
            <div><dt>风险摘要</dt><dd>{{ state.tool.riskLabels.join("，") }}</dd></div>
          </dl>
        </R3Card>
        <R3Card>
          <template #header><h3>数据形态</h3></template>
          <dl class="intelligence-detail__facts">
            <div><dt>输入</dt><dd>{{ state.tool.inputShapeLabel }}</dd></div>
            <div><dt>输出</dt><dd>{{ state.tool.outputShapeLabel }}</dd></div>
          </dl>
        </R3Card>
      </div>
    </template>

    <R3EmptyState
      v-else
      title="没有找到该资源"
      description="资源可能已移除或当前目录不可用，请返回智能中心刷新。"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, inject, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import {
  R3Button,
  R3Card,
  R3EmptyState,
  R3InlineNotice,
  R3Skeleton,
  R3Tag,
} from "../../components/ui";
import {
  desktopIntelligenceAdapter,
  DesktopIntelligenceAdapterError,
  intelligenceAdapterKey,
} from "../../adapters/intelligence-adapter.js";
import {
  buildRobotDetailView,
  buildToolDetailView,
  presentCatalogError,
  type CatalogMessageState,
  type ResourceView,
  type RobotDetailView,
  type ToolDetailView,
} from "./intelligence-model.js";

type DetailSection = "robots" | "skills" | "tools";

type DetailState = {
  status: CatalogMessageState;
  messageTitle: string;
  messageDescription: string;
  robot?: RobotDetailView;
  tool?: ToolDetailView;
};

const route = useRoute();
const router = useRouter();
const adapter = inject(intelligenceAdapterKey, desktopIntelligenceAdapter);
const state = reactive<DetailState>({
  status: "loading",
  messageTitle: "",
  messageDescription: "",
});
let requestEpoch = 0;

const section = computed<DetailSection>(() => {
  if (route.name === "intelligenceRobotDetail") return "robots";
  if (route.name === "intelligenceSkillDetail") return "skills";
  return "tools";
});
const resourceId = computed(() => {
  const value = route.params.robotId ?? route.params.skillId ?? route.params.toolId;
  return typeof value === "string" && value.length <= 256 && !value.includes("\0") ? value : "";
});
const sectionLabel = computed(() => ({ robots: "机器人", skills: "技能", tools: "工具" })[section.value]);
const pageTitle = computed(() => state.robot?.name ?? state.tool?.name ?? `${sectionLabel.value}详情`);
const pageDescription = computed(() => {
  if (section.value === "robots") return "查看机器人的模型与任务资源范围。";
  if (section.value === "tools") return "查看工具用途、读写边界和风险摘要。";
  return "查看技能说明、行为规则与可用状态。";
});

watch([section, resourceId], () => {
  void loadDetail();
}, { immediate: true });

async function loadDetail(): Promise<void> {
  const epoch = ++requestEpoch;
  const currentSection = section.value;
  const currentId = resourceId.value;
  state.robot = undefined;
  state.tool = undefined;
  state.messageTitle = "";
  state.messageDescription = "";

  if (currentSection === "skills") {
    state.status = "empty";
    return;
  }
  if (currentId === "") {
    state.status = "empty";
    return;
  }

  state.status = "loading";
  try {
    const compatibility = await adapter.negotiateCatalog();
    if (!isCurrent(epoch, currentSection, currentId)) return;
    if (!compatibility.available) {
      state.status = "unavailable";
      state.messageTitle = "目录能力不可用";
      state.messageDescription = compatibility.safeSummary ?? "智能资源目录暂不可用。";
      return;
    }
    if (currentSection === "robots") {
      state.robot = buildRobotDetailView(await adapter.getRobot({ robotId: currentId }));
    } else {
      state.tool = buildToolDetailView(await adapter.getTool({ toolId: currentId }));
    }
    if (!isCurrent(epoch, currentSection, currentId)) {
      state.robot = undefined;
      state.tool = undefined;
      return;
    }
    state.status = "ready";
  } catch (caught) {
    if (!isCurrent(epoch, currentSection, currentId)) return;
    const message = presentCatalogError(caught instanceof DesktopIntelligenceAdapterError
      ? { code: caught.code, safeSummary: caught.safeSummary, retryable: caught.retryable }
      : { code: "catalog.registry_unavailable", safeSummary: "目录暂不可用。" });
    state.status = message.state;
    state.messageTitle = message.title;
    state.messageDescription = message.description;
  }
}

function isCurrent(epoch: number, currentSection: DetailSection, currentId: string): boolean {
  return epoch === requestEpoch && section.value === currentSection && resourceId.value === currentId;
}

async function returnToCatalog(): Promise<void> {
  await router.push({ name: "intelligence", query: { section: section.value } });
}

function resourceNames(resources: readonly ResourceView[]): string {
  return resources.length === 0
    ? "未提供"
    : resources.map((resource) => `${resource.name}（${resource.availabilityLabel}）`).join("，");
}
</script>

<style scoped>
.intelligence-detail {
  width: min(100%, 1040px);
  margin: 0 auto;
  padding: 30px 28px 48px;
  display: grid;
  align-content: start;
  gap: 16px;
}

.intelligence-detail__back {
  justify-self: start;
  min-height: 34px;
  border: 0;
  border-radius: 8px;
  padding: 0 8px;
  background: transparent;
  color: var(--r3-color-text-secondary);
}
.intelligence-detail__back:hover { background: var(--r3-color-surface-hover); color: var(--r3-color-text); }
.intelligence-detail__back:focus-visible { outline: 2px solid var(--r3-color-focus); outline-offset: 2px; }

.intelligence-detail__page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 8px 2px 12px;
}
.intelligence-detail__page-header > div { display: grid; gap: 5px; }
.intelligence-detail__page-header p { margin: 0; color: var(--r3-color-primary); font-size: 12px; font-weight: 700; }
.intelligence-detail__page-header h2 { margin: 0; font-size: 28px; font-weight: 650; }
.intelligence-detail__page-header span { color: var(--r3-color-text-secondary); font-size: 13px; }
.intelligence-detail__loading { display: grid; gap: 12px; }

.intelligence-detail__hero { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 16px; align-items: start; }
.intelligence-detail__avatar { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 12px; background: #edf1f7; color: #43516a; font-weight: 750; }
.intelligence-detail__identity { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.intelligence-detail__identity h3 { margin: 0 4px 0 0; font-size: 19px; }
.intelligence-detail__hero p { margin: 8px 0 0; color: var(--r3-color-text-secondary); line-height: 1.7; }
.intelligence-detail__sections { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
.intelligence-detail__sections h3 { margin: 0; font-size: 14px; }
.intelligence-detail__facts { display: grid; gap: 0; margin: 0; }
.intelligence-detail__facts div { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 14px; padding: 11px 0; border-bottom: 1px solid var(--r3-color-border); }
.intelligence-detail__facts div:last-child { border-bottom: 0; }
.intelligence-detail__facts dt { color: var(--r3-color-text-secondary); }
.intelligence-detail__facts dt, .intelligence-detail__facts dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; }

@media (max-width: 800px) {
  .intelligence-detail { padding: 22px 18px 36px; }
  .intelligence-detail__sections { grid-template-columns: 1fr; }
}
</style>
