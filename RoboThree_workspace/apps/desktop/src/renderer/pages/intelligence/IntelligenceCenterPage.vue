<template>
  <section class="intelligence-page" aria-label="智能中心">
    <R3PageHeader
      eyebrow="智能资源"
      title="智能中心"
      description="浏览可用的机器人、技能和工具。"
    >
      <template #actions>
        <R3Button
          v-if="activeSection === 'robots'"
          variant="primary"
          @click="void router.push('/intelligence/create-robot')"
        >创建机器人</R3Button>
        <R3Button
          v-else-if="activeSection === 'skills'"
          variant="primary"
          @click="void router.push('/intelligence/create-skill')"
        >创建技能</R3Button>
      </template>
    </R3PageHeader>

    <R3InlineNotice
      v-if="persistentNotice"
      tone="warning"
      title="目录需要刷新"
    >
      {{ persistentNotice }}
    </R3InlineNotice>

    <div class="intelligence-page__layout">
      <R3Card>
        <template #header>
          <div class="intelligence-page__toolbar">
            <R3Tabs
              v-model="activeSectionModel"
              label="智能资源"
              :tabs="sectionTabs"
            />
            <span v-if="activeSection !== 'skills'" class="intelligence-page__loaded-summary">
              {{ activeSection === "robots"
                ? `${summaryMetrics[0]?.label} ${summaryMetrics[0]?.value}`
                : `${summaryMetrics[1]?.label} ${summaryMetrics[1]?.value}` }}
            </span>
            <R3SearchField
              v-model="searchQuery"
              accessible-label="筛选已加载内容"
              placeholder="筛选已加载内容"
              :disabled="activeSection === 'skills'"
            />
            <R3Button variant="secondary" @click="void refreshCatalog()">
              刷新
            </R3Button>
          </div>
        </template>

        <nav v-if="activeSection === 'robots'" class="intelligence-page__subnav" aria-label="机器人分类">
          <button type="button" :aria-current="robotViewMode === 'catalog' ? 'page' : undefined" @click="robotViewMode = 'catalog'">全部</button>
          <button type="button" :aria-current="robotViewMode === 'mine' ? 'page' : undefined" @click="void showMyRobotDrafts()">我创建的</button>
        </nav>

        <R3InlineNotice
          v-if="activeSection === 'robots' && robotListState.messageTitle"
          :tone="robotListState.status === 'error' ? 'danger' : 'warning'"
          :title="robotListState.messageTitle"
        >
          {{ robotListState.messageDescription }}
        </R3InlineNotice>

        <R3InlineNotice
          v-if="activeSection === 'tools' && toolListState.messageTitle"
          :tone="toolListState.status === 'error' ? 'danger' : 'warning'"
          :title="toolListState.messageTitle"
        >
          {{ toolListState.messageDescription }}
        </R3InlineNotice>

        <section v-if="activeSection === 'robots' && robotViewMode === 'mine'" class="intelligence-page__gate" aria-label="我创建的机器人">
          <div v-if="draftsError" class="intelligence-page__lifecycle-reconnect">
            <R3InlineNotice tone="danger" title="机器人生命周期服务不可用">
              {{ draftsError }} 当前不会使用本地假数据代替。
            </R3InlineNotice>
            <R3Button variant="secondary" :loading="draftsLoading" @click="void showMyRobotDrafts()">
              重新连接
            </R3Button>
          </div>
          <R3EmptyState v-else-if="myRobotDrafts.length === 0" icon="R" title="还没有个人机器人" description="创建并保存第一个机器人后，它会显示在这里。" />
          <ul v-else class="intelligence-page__cards" aria-label="个人机器人草稿">
            <li v-for="draft in myRobotDrafts" :key="draft.robotId" class="intelligence-page__card">
              <button class="intelligence-page__card-button" type="button" @click="void router.push({ path: '/intelligence/create-robot', query: { robotId: draft.robotId } })">
                <span class="intelligence-page__icon" aria-hidden="true">R</span>
                <span class="intelligence-page__card-body">
                  <strong>{{ draft.name }}</strong>
                  <small>{{ draft.submissionState === 'approved' ? '已发布到企业机器人目录' : '个人草稿' }}</small>
                  <span>{{ draft.description || '发布前补充简介' }}</span>
                  <span class="intelligence-page__tags">
                    <R3Tag :tone="presentRobotTestState(draft.testState).tone">
                      {{ presentRobotTestState(draft.testState).label }}
                    </R3Tag>
                    <R3Tag
                      v-if="presentRobotSubmissionState(draft.submissionState)"
                      :tone="presentRobotSubmissionState(draft.submissionState)?.tone"
                    >
                      {{ presentRobotSubmissionState(draft.submissionState)?.label }}
                    </R3Tag>
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </section>

        <SkillCatalogPanel v-else-if="activeSection === 'skills'" />

        <div v-else-if="activeListState.status === 'loading'" class="intelligence-page__loading">
          <R3Skeleton />
          <R3Skeleton />
          <R3Skeleton />
        </div>

        <R3EmptyState
          v-else-if="visibleCards.length === 0"
          :title="activeListState.status === 'empty' ? '暂无已加载内容' : '没有匹配内容'"
          :description="activeListState.status === 'empty'
            ? '目录当前没有返回可展示条目。'
            : '搜索只筛选已加载内容；请调整关键词或加载更多页面。'"
        />

        <template v-else>
          <ul class="intelligence-page__cards" :aria-label="activeSection === 'robots' ? '机器人目录' : '工具目录'">
            <li
              v-for="card in visibleCards"
              :key="card.id"
              class="intelligence-page__card"
              :class="{ 'intelligence-page__card--active': selectedId === card.id }"
            >
              <button
                class="intelligence-page__card-button"
                type="button"
                :data-intelligence-card="card.section"
                @click="void openCard(card)"
              >
                <span class="intelligence-page__icon" aria-hidden="true">
                  {{ iconFor(card.section) }}
                </span>
                <span class="intelligence-page__card-body">
                  <strong>{{ card.name }}</strong>
                  <small>{{ card.sourceLabel }}</small>
                  <span>{{ card.description }}</span>
                  <span v-if="card.section === 'robots'" class="intelligence-page__tags">
                    <R3Tag tone="neutral">{{ card.runnableLabel }}</R3Tag>
                    <R3Tag
                      v-for="label in card.restrictionLabels"
                      :key="label"
                      tone="neutral"
                    >
                      {{ label }}
                    </R3Tag>
                  </span>
                  <span v-else class="intelligence-page__tags">
                    <R3Tag tone="neutral">{{ card.availabilityLabel }}</R3Tag>
                    <R3Tag tone="neutral">{{ card.readOnlyLabel }}</R3Tag>
                    <R3Tag v-for="label in card.riskLabels" :key="label" tone="neutral">
                      {{ label }}
                    </R3Tag>
                  </span>
                </span>
              </button>
            </li>
          </ul>

          <div v-if="activeNextCursor" class="intelligence-page__pagination">
            <R3Button
              variant="secondary"
              :loading="activeListState.loadingMore"
              @click="void loadMoreActiveSection()"
            >
              加载更多已加载目录
            </R3Button>
          </div>
        </template>
      </R3Card>

      <R3Card v-if="selectedSection !== undefined">
        <template #header>
          <div class="intelligence-page__detail-title">
            <div>
              <h3>详情</h3>
              <p>{{ detailSubtitle }}</p>
            </div>
          </div>
        </template>

        <div v-if="detailState.status === 'loading'" class="intelligence-page__loading">
          <R3Skeleton />
          <R3Skeleton />
        </div>

        <R3InlineNotice
          v-else-if="detailState.status === 'error' || detailState.status === 'unavailable'"
          :tone="detailState.status === 'error' ? 'danger' : 'warning'"
          :title="detailState.messageTitle"
        >
          {{ detailState.messageDescription }}
        </R3InlineNotice>

        <R3EmptyState
          v-else-if="selectedSection === undefined || selectedId === undefined"
          title="选择一个资源"
          description="从左侧列表打开机器人或工具详情。"
        />

        <article
          v-else-if="detailState.robot"
          class="intelligence-page__detail"
          data-intelligence-detail="robots"
        >
          <header>
            <span class="intelligence-page__icon" aria-hidden="true">R</span>
            <div>
              <h3>{{ detailState.robot.name }}</h3>
              <p>{{ detailState.robot.sourceLabel }} · {{ detailState.robot.runnableLabel }}</p>
            </div>
          </header>
          <p>{{ detailState.robot.description }}</p>
          <dl class="intelligence-page__facts">
            <div>
              <dt>默认模型</dt>
              <dd>{{ detailState.robot.defaultModel.name }} · {{ detailState.robot.defaultModel.availabilityLabel }}</dd>
            </div>
            <div>
              <dt>模型切换</dt>
              <dd>{{ detailState.robot.allowModelOverrideLabel }}</dd>
            </div>
            <div>
              <dt>可用模型</dt>
              <dd>{{ resourceNames(detailState.robot.eligibleModels) }}</dd>
            </div>
            <div>
              <dt>技能</dt>
              <dd>{{ resourceNames(detailState.robot.skills) }}</dd>
            </div>
            <div>
              <dt>工具</dt>
              <dd>{{ resourceNames(detailState.robot.tools) }}</dd>
            </div>
            <div>
              <dt>知识</dt>
              <dd>{{ resourceNames(detailState.robot.knowledge) }}</dd>
            </div>
          </dl>
        </article>

        <article
          v-else-if="detailState.tool"
          class="intelligence-page__detail"
          data-intelligence-detail="tools"
        >
          <header>
            <span class="intelligence-page__icon" aria-hidden="true">T</span>
            <div>
              <h3>{{ detailState.tool.name }}</h3>
              <p>{{ detailState.tool.sourceLabel }} · {{ detailState.tool.availabilityLabel }}</p>
            </div>
          </header>
          <p>{{ detailState.tool.description }}</p>
          <dl class="intelligence-page__facts">
            <div>
              <dt>读写边界</dt>
              <dd>{{ detailState.tool.readOnlyLabel }}</dd>
            </div>
            <div>
              <dt>风险摘要</dt>
              <dd>{{ detailState.tool.riskLabels.join("，") }}</dd>
            </div>
            <div>
              <dt>输入</dt>
              <dd>{{ detailState.tool.inputShapeLabel }}</dd>
            </div>
            <div>
              <dt>输出</dt>
              <dd>{{ detailState.tool.outputShapeLabel }}</dd>
            </div>
          </dl>
        </article>

        <R3EmptyState
          v-else
          title="详情未加载"
          description="该资源详情还没有返回，或者已被新的页面状态取代。"
        />
      </R3Card>
    </div>
  </section>
</template>

<script setup lang="ts">
import type {
  RobotCatalogSummary,
  ToolCatalogSummary,
} from "@robothree/contracts";
import type { RobotDraftSummary } from "@robothree/contracts/agent-lifecycle/v1alpha1";
import { computed, inject, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import {
  R3Button,
  R3Card,
  R3EmptyState,
  R3InlineNotice,
  R3PageHeader,
  R3SearchField,
  R3Skeleton,
  R3Tabs,
  R3Tag,
} from "../../components/ui";
import {
  agentLifecycleAdapterKey,
  AgentLifecycleAdapterError,
  desktopAgentLifecycleAdapter,
} from "../../adapters/agent-lifecycle-adapter.js";
import {
  desktopIntelligenceAdapter,
  DesktopIntelligenceAdapterError,
  intelligenceAdapterKey,
} from "../../adapters/intelligence-adapter.js";
import {
  buildLoadedCatalogSummary,
  buildRobotDetailView,
  buildRobotSummaryCard,
  buildToolDetailView,
  buildToolSummaryCard,
  filterCards,
  intelligenceSectionTabs,
  presentCatalogError,
  type CatalogMessageState,
  type IntelligenceCard,
  type IntelligenceSection,
  type ResourceView,
  type RobotDetailView,
  type ToolDetailView,
} from "./intelligence-model.js";
import SkillCatalogPanel from "./SkillCatalogPanel.vue";
import {
  presentAgentLifecycleError,
  presentRobotSubmissionState,
  presentRobotTestState,
} from "../../presentation/agent-lifecycle-presentation.js";

type ListState = {
  status: CatalogMessageState;
  messageTitle: string;
  messageDescription: string;
  retryable: boolean;
  loadingMore: boolean;
  queryRevision?: string;
  nextCursor?: string;
};

type DetailState = {
  status: CatalogMessageState;
  messageTitle: string;
  messageDescription: string;
  retryable: boolean;
  robot?: RobotDetailView;
  tool?: ToolDetailView;
};

const adapter = inject(intelligenceAdapterKey, desktopIntelligenceAdapter);
const lifecycleAdapter = inject(agentLifecycleAdapterKey, desktopAgentLifecycleAdapter);
const route = useRoute();
const router = useRouter();

const activeSection = ref<IntelligenceSection>(sectionFromQuery(route.query.section));
const searchQuery = ref("");
const persistentNotice = ref("");
const runtimeInstanceId = ref("");
const robots = ref<RobotCatalogSummary[]>([]);
const robotViewMode = ref<"catalog" | "mine">("catalog");
const myRobotDrafts = ref<RobotDraftSummary[]>([]);
const draftsError = ref("");
const draftsLoading = ref(false);
const tools = ref<ToolCatalogSummary[]>([]);
const robotListState = reactive<ListState>(createListState());
const toolListState = reactive<ListState>(createListState());
const detailState = reactive<DetailState>(createDetailState());
let catalogRequestEpoch = 0;
let detailRequestEpoch = 0;

const sectionTabs = intelligenceSectionTabs.map((tab) => ({ ...tab }));
const selectedSection = computed<IntelligenceSection | undefined>(() => {
  switch (route.name) {
    case "intelligenceRobotDetail":
      return "robots";
    case "intelligenceSkillDetail":
      return "skills";
    case "intelligenceToolDetail":
      return "tools";
    default:
      return undefined;
  }
});

const selectedId = computed(() => {
  const value = route.params.robotId ?? route.params.skillId ?? route.params.toolId;
  return typeof value === "string" ? decodeURIComponent(value) : undefined;
});

const activeSectionModel = computed({
  get: () => activeSection.value,
  set: (value: string) => {
    activeSection.value = value as IntelligenceSection;
    void router.push("/intelligence");
  },
});

const robotCards = computed(() => robots.value.map(buildRobotSummaryCard));
const toolCards = computed(() => tools.value.map(buildToolSummaryCard));
const activeCards = computed<readonly IntelligenceCard[]>(() => (
  activeSection.value === "robots" ? robotCards.value
    : activeSection.value === "tools" ? toolCards.value
      : []
));
const visibleCards = computed(() => filterCards(activeCards.value, searchQuery.value));
const activeListState = computed(() => (
  activeSection.value === "robots" ? robotListState : toolListState
));
const activeNextCursor = computed(() => (
  activeSection.value === "robots" ? robotListState.nextCursor : toolListState.nextCursor
));
const catalogSummary = computed(() => buildLoadedCatalogSummary({
  robots: robots.value,
  tools: tools.value,
  robotNextCursor: robotListState.nextCursor,
  toolNextCursor: toolListState.nextCursor,
}));
const summaryMetrics = computed(() => [
  {
    label: catalogSummary.value.robotsComplete ? "全部已加载机器人" : "已加载机器人",
    value: catalogSummary.value.loadedRobots,
  },
  {
    label: catalogSummary.value.toolsComplete ? "全部已加载工具" : "已加载工具",
    value: catalogSummary.value.loadedTools,
  },
  { label: "可用工具", value: catalogSummary.value.availableTools },
]);
const detailSubtitle = computed(() => {
  if (activeSection.value === "skills") return "技能详情尚未接入。";
  if (selectedSection.value === "robots") return "机器人可用范围和资源信息。";
  if (selectedSection.value === "tools") return "工具用途、读写边界和风险摘要。";
  return "资源详情会在这里显示。";
});

watch(selectedSection, (section) => {
  if (section !== undefined) activeSection.value = section;
}, { immediate: true });

watch(() => route.query.section, (value) => {
  if (selectedSection.value === undefined) activeSection.value = sectionFromQuery(value);
});

watch([selectedSection, selectedId], () => {
  void loadSelectedDetail();
}, { immediate: true });

onMounted(() => {
  void refreshCatalog();
});

async function showMyRobotDrafts(): Promise<void> {
  if (draftsLoading.value) return;
  robotViewMode.value = "mine";
  draftsError.value = "";
  draftsLoading.value = true;
  try {
    const page = await lifecycleAdapter.listDrafts();
    myRobotDrafts.value = [...page.items];
  } catch (caught) {
    myRobotDrafts.value = [];
    draftsError.value = caught instanceof AgentLifecycleAdapterError
      ? presentAgentLifecycleError(caught.code, caught.message)
      : "个人机器人草稿暂时不可用，请稍后重试。";
  } finally {
    draftsLoading.value = false;
  }
}

async function refreshCatalog(): Promise<void> {
  const epoch = ++catalogRequestEpoch;
  persistentNotice.value = "";
  clearCatalogState();
  robotListState.status = "loading";
  toolListState.status = "loading";

  try {
    const compatibility = await adapter.negotiateCatalog();
    if (!isCurrentCatalogResponse(epoch)) return;
    runtimeInstanceId.value = compatibility.runtimeInstanceId;
    if (!compatibility.available) {
      applyListUnavailable(robotListState, compatibility.safeSummary ?? "机器人目录能力暂不可用。");
      applyListUnavailable(toolListState, compatibility.safeSummary ?? "工具目录能力暂不可用。");
      return;
    }
    await Promise.allSettled([
      loadRobotPage({ reset: true, epoch }),
      loadToolPage({ reset: true, epoch }),
    ]);
    if (isCurrentCatalogResponse(epoch)) {
      await loadSelectedDetail();
    }
  } catch (caught) {
    if (!isCurrentCatalogResponse(epoch)) return;
    applyListError(robotListState, caught);
    applyListError(toolListState, caught);
  }
}

async function loadRobotPage(input: { reset: boolean; epoch: number }): Promise<void> {
  if (!input.reset && robotListState.nextCursor === undefined) return;
  if (input.reset) {
    robotListState.status = "loading";
  } else {
    robotListState.loadingMore = true;
  }
  try {
    const page = await adapter.listRobots({
      cursor: input.reset ? undefined : robotListState.nextCursor,
      limit: 50,
    });
    if (!isCurrentCatalogResponse(input.epoch)) return;
    if (!input.reset && robotListState.queryRevision !== page.queryRevision) {
      throw new DesktopIntelligenceAdapterError({
        contractVersion: "v1alpha2",
        code: "catalog.stale_cursor",
        category: "conflict",
        safeSummary: "目录已变化，请刷新。",
        retryable: true,
        correlationId: "00000000-0000-4000-8000-000000000000",
      });
    }
    robots.value = input.reset ? [...page.items] : [...robots.value, ...page.items];
    robotListState.queryRevision = page.queryRevision;
    robotListState.nextCursor = page.nextCursor;
    robotListState.status = robots.value.length === 0 ? "empty" : "ready";
    clearListMessage(robotListState);
  } catch (caught) {
    if (!isCurrentCatalogResponse(input.epoch)) return;
    applyListError(robotListState, caught);
  } finally {
    if (isCurrentCatalogResponse(input.epoch)) {
      robotListState.loadingMore = false;
    }
  }
}

async function loadToolPage(input: { reset: boolean; epoch: number }): Promise<void> {
  if (!input.reset && toolListState.nextCursor === undefined) return;
  if (input.reset) {
    toolListState.status = "loading";
  } else {
    toolListState.loadingMore = true;
  }
  try {
    const page = await adapter.listTools({
      cursor: input.reset ? undefined : toolListState.nextCursor,
      limit: 50,
    });
    if (!isCurrentCatalogResponse(input.epoch)) return;
    if (!input.reset && toolListState.queryRevision !== page.queryRevision) {
      throw new DesktopIntelligenceAdapterError({
        contractVersion: "v1alpha2",
        code: "catalog.stale_cursor",
        category: "conflict",
        safeSummary: "目录已变化，请刷新。",
        retryable: true,
        correlationId: "00000000-0000-4000-8000-000000000000",
      });
    }
    tools.value = input.reset ? [...page.items] : [...tools.value, ...page.items];
    toolListState.queryRevision = page.queryRevision;
    toolListState.nextCursor = page.nextCursor;
    toolListState.status = tools.value.length === 0 ? "empty" : "ready";
    clearListMessage(toolListState);
  } catch (caught) {
    if (!isCurrentCatalogResponse(input.epoch)) return;
    applyListError(toolListState, caught);
  } finally {
    if (isCurrentCatalogResponse(input.epoch)) {
      toolListState.loadingMore = false;
    }
  }
}

async function loadMoreActiveSection(): Promise<void> {
  const epoch = catalogRequestEpoch;
  if (activeSection.value === "robots") {
    await loadRobotPage({ reset: false, epoch });
  } else if (activeSection.value === "tools") {
    await loadToolPage({ reset: false, epoch });
  }
}

async function loadSelectedDetail(): Promise<void> {
  const section = selectedSection.value;
  const id = selectedId.value;
  const epoch = ++detailRequestEpoch;
  detailState.robot = undefined;
  detailState.tool = undefined;
  clearDetailMessage();
  if (section === undefined || id === undefined || section === "skills") {
    detailState.status = "empty";
    return;
  }
  detailState.status = "loading";
  try {
    if (section === "robots") {
      const robot = await adapter.getRobot({ robotId: id });
      if (!isCurrentDetailResponse(epoch, section, id)) return;
      detailState.robot = buildRobotDetailView(robot);
      detailState.status = "ready";
      return;
    }
    const tool = await adapter.getTool({ toolId: id });
    if (!isCurrentDetailResponse(epoch, section, id)) return;
    detailState.tool = buildToolDetailView(tool);
    detailState.status = "ready";
  } catch (caught) {
    if (!isCurrentDetailResponse(epoch, section, id)) return;
    applyDetailError(caught);
  }
}

async function openCard(card: IntelligenceCard): Promise<void> {
  await router.push({ path: card.detailPath, query: { from: activeSection.value } });
}

function sectionFromQuery(value: unknown): IntelligenceSection {
  return value === "skills" || value === "tools" ? value : "robots";
}

function applyListError(state: ListState, caught: unknown): void {
  if (caught instanceof DesktopIntelligenceAdapterError
    && caught.code === "runtime.request_aborted") {
    return;
  }
  if (caught instanceof DesktopIntelligenceAdapterError
    && caught.code === "catalog.runtime_changed") {
    handleRuntimeChanged();
    return;
  }
  const view = presentCatalogError(errorInput(caught));
  state.status = view.state;
  state.messageTitle = view.title;
  state.messageDescription = view.description;
  state.retryable = view.retryable;
  state.nextCursor = undefined;
}

function applyDetailError(caught: unknown): void {
  if (caught instanceof DesktopIntelligenceAdapterError
    && caught.code === "runtime.request_aborted") {
    detailState.status = "empty";
    return;
  }
  if (caught instanceof DesktopIntelligenceAdapterError
    && caught.code === "catalog.runtime_changed") {
    handleRuntimeChanged();
    return;
  }
  const view = presentCatalogError(errorInput(caught));
  detailState.status = view.state;
  detailState.messageTitle = view.title;
  detailState.messageDescription = view.description;
  detailState.retryable = view.retryable;
  detailState.robot = undefined;
  detailState.tool = undefined;
}

function handleRuntimeChanged(): void {
  ++catalogRequestEpoch;
  ++detailRequestEpoch;
  clearCatalogState();
  persistentNotice.value = "本地 Core 已重启。目录内容已清空，请点击刷新重新协商并加载。";
  applyListUnavailable(robotListState, "本地 Core 已重启，请刷新机器人目录。");
  applyListUnavailable(toolListState, "本地 Core 已重启，请刷新工具目录。");
  detailState.status = "unavailable";
  detailState.messageTitle = "详情需要刷新";
  detailState.messageDescription = "本地 Core 已重启，请刷新目录后重新打开详情。";
}

function clearCatalogState(): void {
  robots.value = [];
  tools.value = [];
  resetListState(robotListState);
  resetListState(toolListState);
  detailState.robot = undefined;
  detailState.tool = undefined;
  clearDetailMessage();
}

function createListState(): ListState {
  return {
    status: "loading",
    messageTitle: "",
    messageDescription: "",
    retryable: false,
    loadingMore: false,
  };
}

function createDetailState(): DetailState {
  return {
    status: "empty",
    messageTitle: "",
    messageDescription: "",
    retryable: false,
  };
}

function resetListState(state: ListState): void {
  state.status = "loading";
  state.messageTitle = "";
  state.messageDescription = "";
  state.retryable = false;
  state.loadingMore = false;
  state.queryRevision = undefined;
  state.nextCursor = undefined;
}

function clearListMessage(state: ListState): void {
  state.messageTitle = "";
  state.messageDescription = "";
  state.retryable = false;
}

function clearDetailMessage(): void {
  detailState.status = "empty";
  detailState.messageTitle = "";
  detailState.messageDescription = "";
  detailState.retryable = false;
}

function applyListUnavailable(state: ListState, message: string): void {
  state.status = "unavailable";
  state.messageTitle = "目录能力不可用";
  state.messageDescription = message;
  state.retryable = false;
  state.loadingMore = false;
  state.nextCursor = undefined;
}

function errorInput(caught: unknown): { code: string; safeSummary?: string; retryable?: boolean } {
  if (caught instanceof DesktopIntelligenceAdapterError) {
    return {
      code: caught.code,
      safeSummary: caught.safeSummary,
      retryable: caught.retryable,
    };
  }
  return {
    code: "catalog.registry_unavailable",
    safeSummary: "目录暂不可用。",
    retryable: false,
  };
}

function isCurrentCatalogResponse(epoch: number): boolean {
  return epoch === catalogRequestEpoch;
}

function isCurrentDetailResponse(
  epoch: number,
  section: IntelligenceSection,
  id: string,
): boolean {
  return epoch === detailRequestEpoch
    && selectedSection.value === section
    && selectedId.value === id;
}

function resourceNames(resources: readonly ResourceView[]): string {
  return resources.length === 0
    ? "未提供"
    : resources.map((resource) => `${resource.name}（${resource.availabilityLabel}）`).join("，");
}

function iconFor(section: IntelligenceSection): string {
  if (section === "robots") return "R";
  if (section === "skills") return "S";
  return "T";
}
</script>

<style scoped>
.intelligence-page {
  display: grid;
  align-content: start;
  gap: 14px;
  width: min(100%, 1120px);
  margin: 0 auto;
  padding: 24px;
}

.intelligence-page__detail-title p,
.intelligence-page__card-body small,
.intelligence-page__detail header p,
.intelligence-page__facts dt {
  color: var(--r3-color-text-secondary);
}

.intelligence-page__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.intelligence-page__layout > :deep(.r3-card) {
  min-width: 0;
}

.intelligence-page__toolbar,
.intelligence-page__detail-title,
.intelligence-page__pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.intelligence-page__toolbar > .r3-search-field {
  flex: 1;
  min-width: 180px;
}

.intelligence-page__loaded-summary {
  color: var(--r3-color-text-tertiary);
  font-size: var(--r3-font-size-xs);
  white-space: nowrap;
}

.intelligence-page__loading,
.intelligence-page__cards,
.intelligence-page__gate {
  margin-top: 14px;
}

.intelligence-page__lifecycle-reconnect {
  display: flex;
  gap: var(--r3-space-3);
  align-items: center;
}

.intelligence-page__lifecycle-reconnect .r3-inline-notice {
  flex: 1;
}

.intelligence-page__subnav {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.intelligence-page__subnav button {
  min-height: 28px;
  border: 0;
  border-radius: var(--r3-radius-sm);
  padding: 0 9px;
  background: var(--r3-color-surface-hover);
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-xs);
}

.intelligence-page__subnav button[aria-current="page"] {
  background: #e9edf6;
  color: var(--r3-color-text);
  font-weight: 700;
}

.intelligence-page__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
  padding: 0;
  list-style: none;
}

.intelligence-page__card {
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  background: var(--r3-color-surface);
  overflow: hidden;
}

.intelligence-page__card--active {
  border-color: var(--r3-color-primary);
  box-shadow: inset 3px 0 0 var(--r3-color-primary);
}

.intelligence-page__card-button {
  width: 100%;
  border: 0;
  display: flex;
  gap: 10px;
  padding: 11px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.intelligence-page__card-button:hover {
  background: var(--r3-color-surface-hover);
}

.intelligence-page__icon {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: #edf1f5;
  color: #4c5869;
  font-weight: 700;
}

.intelligence-page__card-body {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.intelligence-page__card-body strong,
.intelligence-page__detail h3 {
  margin: 0;
}

.intelligence-page__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.intelligence-page__detail {
  display: grid;
  gap: 14px;
}

.intelligence-page__detail header {
  display: flex;
  gap: 12px;
  align-items: center;
}

.intelligence-page__facts {
  display: grid;
  gap: 10px;
  margin: 0;
}

.intelligence-page__facts div {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 10px;
}

.intelligence-page__facts dt,
.intelligence-page__facts dd {
  margin: 0;
}

.intelligence-page__facts dd {
  overflow-wrap: anywhere;
}

@media (max-width: 920px) {
  .intelligence-page__layout {
    grid-template-columns: 1fr;
  }

  .intelligence-page__toolbar {
    align-items: center;
    flex-wrap: wrap;
  }

  .intelligence-page__toolbar > .r3-search-field {
    width: 100%;
  }
}

@media (max-width: 680px) {
  .intelligence-page {
    padding: 18px 14px;
  }

  .intelligence-page__toolbar {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
