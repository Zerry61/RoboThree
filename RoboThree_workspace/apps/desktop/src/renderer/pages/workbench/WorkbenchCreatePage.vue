<template>
  <section class="workbench-page" aria-labelledby="workbench-title">
    <header class="workbench-page__header">
      <div>
        <p class="workbench-page__eyebrow">Agent Workbench</p>
        <h2 id="workbench-title">新建任务</h2>
      </div>
      <R3StatusBadge :tone="loading ? 'neutral' : 'success'">
        {{ loading ? "Syncing" : "Ready" }}
      </R3StatusBadge>
    </header>

    <R3InlineNotice v-if="error" tone="danger" title="提交失败">
      {{ error }}
    </R3InlineNotice>
    <R3InlineNotice v-else-if="notice" tone="success" title="任务已提交">
      {{ notice }}
    </R3InlineNotice>

    <div class="workbench-page__layout">
      <section class="workbench-page__primary">
        <R3Card>
          <template #header>
            <div class="workbench-page__card-header">
              <div>
                <h3>任务输入</h3>
                <p>{{ composerState.selectionSummary }}</p>
              </div>
              <R3Button variant="secondary" :disabled="busy" @click="void refresh()">
                刷新
              </R3Button>
            </div>
          </template>

          <div class="workbench-page__composer">
            <R3Textarea
              v-model="composer"
              label="任务"
              :rows="7"
              placeholder="描述你希望 RoboThree 完成的工作"
              :disabled="busy"
            />

            <div class="workbench-page__grid">
              <R3Select
                v-model="selection.workspaceGrantId"
                label="工作区"
                :options="workspaceOptions"
                :disabled="busy || workspaceOptions.length === 0"
              />
              <R3Select
                v-model="selection.sessionId"
                label="会话"
                :options="sessionOptions"
                :disabled="busy"
              />
              <R3Select
                v-model="selection.agentId"
                label="机器人"
                :options="agentOptions"
                :disabled="busy || agentOptions.length === 0"
              />
              <R3Select
                v-model="selection.requestedModelId"
                label="模型"
                :options="modelOptions"
                :disabled="busy || modelOptions.length === 0"
              />
            </div>

            <section class="workbench-page__modes" aria-label="授权模式说明">
              <article
                v-for="mode in authorizationModes"
                :key="mode.value"
                class="workbench-page__mode"
              >
                <div class="workbench-page__mode-title">
                  <strong>{{ mode.label }}</strong>
                  <R3Tag tone="warning">{{ mode.status }}</R3Tag>
                </div>
                <span>{{ mode.description }}</span>
                <small>授权策略 Feature Spec 冻结后接入；当前不改变任务执行。</small>
              </article>
            </section>

            <section class="workbench-page__chips" aria-label="技能选择">
              <label
                v-for="skill in selectedAgent?.skills ?? []"
                :key="skill.id"
                class="workbench-page__chip"
                :class="{ 'workbench-page__chip--disabled': !skill.available }"
              >
                <input
                  type="checkbox"
                  :checked="selection.selectedSkillIds.includes(skill.id)"
                  :disabled="busy || !skill.available"
                  @change="toggleSkill(skill.id)"
                >
                <span>{{ skill.name }}</span>
              </label>
              <span v-if="selectedAgent === undefined" class="workbench-page__muted">
                暂无可用技能。
              </span>
            </section>

            <section class="workbench-page__chips" aria-label="知识库选择">
              <label
                v-for="knowledge in selectedAgent?.knowledge ?? []"
                :key="knowledge.id"
                class="workbench-page__chip"
                :class="{ 'workbench-page__chip--disabled': !knowledge.available }"
              >
                <input
                  type="checkbox"
                  :checked="selection.selectedKnowledgeIds.includes(knowledge.id)"
                  :disabled="busy || !knowledge.available"
                  @change="toggleKnowledge(knowledge.id)"
                >
                <span>{{ knowledge.name }}</span>
              </label>
              <span
                v-if="selectedAgent === undefined || selectedAgent.knowledge.length === 0"
                class="workbench-page__muted"
              >
                暂无已选择知识库。
              </span>
            </section>

            <section class="workbench-page__attachments" aria-label="附件">
              <div>
                <strong>附件</strong>
                <span>当前没有附件</span>
              </div>
              <R3Tag tone="neutral">Artifact-ready</R3Tag>
            </section>

            <footer class="workbench-page__actions">
              <span>{{ composerState.disabledReason }}</span>
              <R3Button
                variant="primary"
                :loading="busy"
                :disabled="composerState.sendDisabled"
                @click="void submitTask()"
              >
                提交任务
              </R3Button>
            </footer>
          </div>
        </R3Card>

        <R3Card title="最近任务">
          <ul class="workbench-page__list">
            <li v-for="task in catalog.recentTasks" :key="task.taskId">
              <span>{{ task.displayStatus }}</span>
              <strong>{{ shortId(task.taskId) }}</strong>
              <time>{{ formatTime(task.updatedAt) }}</time>
            </li>
          </ul>
          <R3EmptyState
            v-if="catalog.recentTasks.length === 0"
            title="暂无任务"
            description="提交后会显示最近任务状态。"
          />
        </R3Card>
      </section>

      <aside class="workbench-page__side">
        <R3Card title="工作区概览">
          <div class="workbench-page__metric">
            <strong>{{ catalog.workspaces.length }}</strong>
            <span>已授权工作区</span>
          </div>
          <ul class="workbench-page__stack">
            <li v-for="workspace in catalog.workspaces.slice(0, 4)" :key="workspace.workspaceGrantId">
              <span>{{ workspace.displayName }}</span>
              <R3StatusBadge :tone="workspace.accessMode === 'read_write' ? 'success' : 'neutral'">
                {{ workspace.accessMode }}
              </R3StatusBadge>
            </li>
          </ul>
          <R3Button variant="secondary" :disabled="busy" @click="void chooseWorkspace()">
            选择工作区
          </R3Button>
        </R3Card>

        <R3Card title="机器人能力">
          <div class="workbench-page__metric">
            <strong>{{ composerState.selectedSkillCount }}/{{ composerState.availableSkillCount }}</strong>
            <span>已选技能</span>
          </div>
          <ul class="workbench-page__stack">
            <li v-for="tool in selectedAgent?.tools ?? []" :key="tool.id">
              <span>{{ tool.name }}</span>
              <R3StatusBadge :tone="tool.available ? 'success' : 'warning'">
                {{ tool.available ? "ready" : "blocked" }}
              </R3StatusBadge>
            </li>
          </ul>
        </R3Card>

        <R3Card title="最近产物">
          <ul class="workbench-page__stack">
            <li v-for="artifact in catalog.recentArtifacts" :key="artifact.artifactId">
              <span>{{ artifact.displayName }}</span>
              <R3Tag tone="neutral">{{ artifact.kind }}</R3Tag>
            </li>
          </ul>
          <R3EmptyState
            v-if="catalog.recentArtifacts.length === 0"
            title="暂无产物"
            description="任务产生的文件和预览会显示在这里。"
          />
        </R3Card>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref, watch } from "vue";

import {
  R3Button,
  R3Card,
  R3EmptyState,
  R3InlineNotice,
  R3Select,
  R3StatusBadge,
  R3Tag,
  R3Textarea,
} from "../../components/ui";
import {
  desktopWorkbenchAdapter,
  workbenchAdapterKey,
  type WorkbenchAdapter,
} from "../../adapters/workbench-adapter.js";
import {
  authorizationModes,
  findSelectedAgent,
  normalizeKnowledgeIds,
  normalizeSkillIds,
  normalizeWorkbenchSelection,
  presentWorkbenchComposer,
  selectModelId,
  type WorkbenchCatalog,
  type WorkbenchSelection,
} from "./workbench-model.js";

defineOptions({ name: "RoboThreeWorkbench" });

const adapter = inject<WorkbenchAdapter>(workbenchAdapterKey, desktopWorkbenchAdapter);

type SelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

const emptyCatalog: WorkbenchCatalog = {
  workspaces: [],
  sessions: [],
  agents: [],
  models: [],
  recentTasks: [],
  recentArtifacts: [],
};

const catalog = reactive<WorkbenchCatalog>({ ...emptyCatalog });
const selection = reactive<WorkbenchSelection>(
  normalizeWorkbenchSelection(emptyCatalog),
);
const composer = ref("");
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const notice = ref("");

const selectedAgent = computed(() => findSelectedAgent(catalog, selection));
const composerState = computed(() => presentWorkbenchComposer({
  catalog,
  selection,
  composerText: composer.value,
  busy: busy.value,
}));

const workspaceOptions = computed<SelectOption[]>(() =>
  catalog.workspaces.map((workspace) => ({
    label: workspace.displayName,
    value: workspace.workspaceGrantId,
  })));

const sessionOptions = computed<SelectOption[]>(() => [
  { label: "新会话", value: "" },
  ...catalog.sessions.map((session) => ({
    label: session.title,
    value: session.sessionId,
  })),
]);

const agentOptions = computed<SelectOption[]>(() => {
  const options = catalog.agents.map((agent) => ({
    label: agent.name,
    value: agent.agentId,
    disabled: !agent.runnable,
  }));
  return selection.agentId === ""
    ? [{ label: "请选择机器人", value: "" }, ...options]
    : options;
});

const modelOptions = computed<SelectOption[]>(() => {
  if (selectedAgent.value === undefined) return [];
  const eligibleIds = new Set(selectedAgent.value.eligibleModels.map((model) =>
    model.modelId));
  return catalog.models
    .filter((model) => eligibleIds.has(model.modelId))
    .map((model) => ({
      label: model.name,
      value: model.modelId,
      disabled: !model.available,
    }));
});

watch(() => selection.agentId, () => {
  selection.agentSelectionInitialized = true;
  if (selection.agentId === "") {
    selection.requestedModelId = "";
    selection.selectedSkillIds = [];
    selection.selectedKnowledgeIds = [];
    return;
  }
  selection.requestedModelId = selectModelId(
    catalog.models,
    selectedAgent.value,
    selection.requestedModelId,
  );
  selection.selectedSkillIds = normalizeSkillIds(
    selectedAgent.value,
    selection.selectedSkillIds,
  );
  selection.selectedKnowledgeIds = normalizeKnowledgeIds(
    selectedAgent.value,
    selection.selectedKnowledgeIds,
  );
});

onMounted(() => {
  void refresh();
});

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const next = await adapter.loadWorkbenchData();
    Object.assign(catalog, next);
    Object.assign(selection, normalizeWorkbenchSelection(catalog, selection));
    error.value = "";
  } catch (caught) {
    error.value = explainError(caught);
  } finally {
    loading.value = false;
  }
}

async function chooseWorkspace(): Promise<void> {
  busy.value = true;
  try {
    const grant = await adapter.createWorkspaceGrant();
    if (grant !== undefined) {
      await refresh();
      selection.workspaceGrantId = grant.workspaceGrantId;
    }
  } catch (caught) {
    error.value = explainError(caught);
  } finally {
    busy.value = false;
  }
}

async function submitTask(): Promise<void> {
  if (composerState.value.sendDisabled || selectedAgent.value === undefined) return;
  busy.value = true;
  notice.value = "";
  error.value = "";
  try {
    const text = composer.value.trim();
    const result = await adapter.submitTask({
      sessionId: selection.sessionId,
      sessionTitle: text.slice(0, 48) || "新任务",
      userInput: text,
      agentId: selectedAgent.value.agentId,
      requestedModelId: selection.requestedModelId,
      selectedSkillIds: selection.selectedSkillIds,
      selectedKnowledgeIds: selection.selectedKnowledgeIds,
      workspaceGrantId: selection.workspaceGrantId,
    });
    composer.value = "";
    notice.value = result.receipt.status === "replayed"
      ? "该任务已从持久记录恢复。"
      : `任务 ${shortId(result.receipt.taskId)} 已进入本地运行队列。`;
    selection.sessionId = result.session.sessionId;
    await refresh();
  } catch (caught) {
    error.value = explainError(caught);
  } finally {
    busy.value = false;
  }
}

function toggleSkill(skillId: string): void {
  const current = new Set(selection.selectedSkillIds);
  if (current.has(skillId)) {
    current.delete(skillId);
  } else {
    current.add(skillId);
  }
  selection.selectedSkillIds = normalizeSkillIds(
    selectedAgent.value,
    [...current],
  );
}

function toggleKnowledge(knowledgeId: string): void {
  const current = new Set(selection.selectedKnowledgeIds);
  if (current.has(knowledgeId)) {
    current.delete(knowledgeId);
  } else {
    current.add(knowledgeId);
  }
  selection.selectedKnowledgeIds = normalizeKnowledgeIds(
    selectedAgent.value,
    [...current],
  );
}

function explainError(caught: unknown): string {
  return caught instanceof Error ? caught.message : "未知错误。";
}

function shortId(id: string): string {
  return id.length <= 12 ? id : id.slice(-12);
}

function formatTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}
</script>

<style scoped>
.workbench-page {
  display: grid;
  gap: 18px;
}

.workbench-page__header,
.workbench-page__card-header,
.workbench-page__actions,
.workbench-page__attachments,
.workbench-page__stack li,
.workbench-page__list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.workbench-page__header h2,
.workbench-page__card-header h3 {
  margin: 0;
}

.workbench-page__eyebrow,
.workbench-page__card-header p,
.workbench-page__muted,
.workbench-page__actions span,
.workbench-page__attachments span,
.workbench-page__metric span,
.workbench-page__list time {
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-sm);
}

.workbench-page__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
  gap: 18px;
  align-items: start;
}

.workbench-page__primary,
.workbench-page__side,
.workbench-page__composer {
  display: grid;
  gap: 16px;
}

.workbench-page__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.workbench-page__modes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.workbench-page__mode {
  min-height: 72px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 10px;
  display: grid;
  gap: 4px;
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
  text-align: left;
}

.workbench-page__mode-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.workbench-page__mode span,
.workbench-page__mode small {
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-xs);
}

.workbench-page__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workbench-page__chip {
  min-height: 30px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-sm);
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--r3-color-surface);
  font-size: var(--r3-font-size-sm);
}

.workbench-page__chip--disabled {
  color: var(--r3-color-text-secondary);
}

.workbench-page__attachments {
  border: 1px dashed var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 12px;
}

.workbench-page__attachments div,
.workbench-page__metric {
  display: grid;
  gap: 4px;
}

.workbench-page__metric strong {
  font-size: 24px;
}

.workbench-page__stack,
.workbench-page__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.workbench-page__stack li,
.workbench-page__list li {
  min-width: 0;
  border-bottom: 1px solid var(--r3-color-border);
  padding-bottom: 10px;
}

.workbench-page__stack li:last-child,
.workbench-page__list li:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.workbench-page__stack span,
.workbench-page__list strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .workbench-page__layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .workbench-page__grid,
  .workbench-page__modes {
    grid-template-columns: 1fr;
  }
}
</style>
