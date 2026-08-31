<template>
  <section
    class="workbench-page"
    :class="{
      'workbench-page--conversation': conversationActive,
      'workbench-page--results-open': conversationActive && resultsPanelOpen,
    }"
    aria-labelledby="workbench-title"
  >
    <header v-if="!conversationActive" class="workbench-page__header">
      <div>
        <p class="workbench-page__kicker">RoboThree · 新建任务</p>
        <h2 id="workbench-title">今天想完成什么？</h2>
        <p class="workbench-page__eyebrow">直接描述目标，RoboThree 会在你授权的范围内完成任务。</p>
      </div>
      <span class="workbench-page__sync">{{ loading ? "正在同步可用资源…" : "" }}</span>
    </header>

    <section v-if="!conversationActive" class="workbench-page__capabilities" aria-label="任务类型">
      <span v-for="category in taskCategories" :key="category.label">
        <span aria-hidden="true">{{ category.mark }}</span>{{ category.label }}
      </span>
    </section>

    <section v-if="!conversationActive" class="workbench-page__quick-actions" aria-label="快捷任务模板">
      <button
        v-for="action in quickActions"
        :key="action.title"
        type="button"
        :disabled="busy"
        @click="applyQuickAction(action.prompt)"
      >
        <span aria-hidden="true">{{ action.mark }}</span>
        <span class="workbench-page__quick-copy">
          <strong>{{ action.title }}</strong>
          <small>{{ action.description }}</small>
        </span>
        <span aria-hidden="true">↑</span>
      </button>
    </section>

    <R3InlineNotice v-if="error" class="workbench-page__feedback" tone="danger" title="提交失败">
      {{ error }}
      <R3Button
        v-if="defaultWorkspaceUnavailable"
        variant="secondary"
        :disabled="busy"
        data-select-workspace-recovery
        @click="void chooseWorkspace()"
      >选择工作区</R3Button>
    </R3InlineNotice>
    <R3InlineNotice
      v-if="followUpIntent"
      class="workbench-page__feedback"
      :tone="followUpIntent.previousArtifact === undefined ? 'warning' : 'neutral'"
      title="继续修改上一成果"
      data-follow-up-context
    >
      <template v-if="followUpIntent.previousArtifact === undefined">
        上一成果当前不可用。你仍可在同一对话中创建新任务，请重新说明目标并选择本次资源。
      </template>
      <template v-else>
        上一成果：{{ followUpIntent.previousArtifact.displayName }}
        （{{ followUpIntent.previousArtifact.relativePath }}）。将在同一对话中创建新任务，
        上一任务和成果不会被修改；请为修订版指定新的文件名。
      </template>
    </R3InlineNotice>

    <div class="workbench-page__layout">
      <section class="workbench-page__conversation-workspace">
        <div class="workbench-page__primary">
          <header v-if="conversationActive" class="workbench-page__conversation-header">
            <div>
              <span class="workbench-page__conversation-mark" aria-hidden="true">R3</span>
              <h2 id="workbench-title">{{ conversationTitle }}</h2>
            </div>
            <R3IconButton
              :label="resultsPanelOpen ? '收起成果面板' : '展开成果面板'"
              :aria-expanded="resultsPanelOpen"
              aria-controls="workbench-results-panel"
              data-results-panel-toggle
              @click="resultsPanelOpen = !resultsPanelOpen"
            >
              <span aria-hidden="true">▣</span>
            </R3IconButton>
          </header>

          <section
            v-if="conversationActive"
            ref="conversationStream"
            class="workbench-page__conversation-stream"
            aria-label="对话"
            aria-live="polite"
            data-workbench-conversation
          >
            <R3EmptyState
              v-if="conversationMessages.length === 0"
              title="RoboThree 正在回复"
              description="回复会在这里持续显示。"
            />
            <ul v-else class="workbench-page__messages">
              <li
                v-for="message in conversationMessages"
                :key="message.id"
                class="workbench-page__message"
                :class="message.presentation.roleClass"
              >
                <span class="workbench-page__message-avatar" aria-hidden="true">
                  {{ message.presentation.avatar }}
                </span>
                <div class="workbench-page__message-body">
                  <strong>{{ message.presentation.authorName }}</strong>
                  <p>{{ message.presentation.content }}</p>
                </div>
              </li>
            </ul>

            <section
              v-if="taskProgressVisible"
              class="workbench-page__task-progress"
              role="status"
              aria-live="polite"
              data-task-progress
            >
              <span class="workbench-page__task-progress-indicator" aria-hidden="true">
                <i /><i /><i />
              </span>
              <div>
                <strong>{{ taskProgressTitle }}</strong>
                <span>{{ taskProgressDescription }}</span>
              </div>
              <time>{{ taskElapsedLabel }}</time>
            </section>

            <section
              v-if="taskTerminationVisible"
              class="workbench-page__task-outcome"
              role="status"
              aria-live="polite"
              data-task-termination
            >
              <span class="workbench-page__task-outcome-mark" aria-hidden="true">■</span>
              <div>
                <strong>任务已终止</strong>
                <span>当前任务已停止。你可以继续输入新的消息。</span>
              </div>
            </section>
          </section>

        <R3Card class="workbench-page__composer-card">
          <template #header>
            <div class="workbench-page__card-header">
              <div>
                <h3>任务内容</h3>
                <p>{{ composerState.selectionSummary }}</p>
              </div>
              <div class="workbench-page__card-actions">
                <R3Button variant="secondary" :disabled="busy" @click="void refresh()">刷新资源</R3Button>
                <R3Button variant="secondary" :disabled="busy" @click="void chooseWorkspace()">选择空间</R3Button>
              </div>
            </div>
          </template>

          <div class="workbench-page__composer">
            <R3Textarea
              v-model="composer"
              label="任务"
              :rows="4"
              :placeholder="composerPlaceholder"
              :disabled="busy"
              @keydown="handleComposerKeydown"
            />

            <div class="workbench-page__composer-toolbar" aria-label="任务输入工具栏">
              <div class="workbench-page__composer-tools">
                <div ref="resourceMenuRoot" class="workbench-page__popover-anchor">
                  <button
                    type="button"
                    class="workbench-page__icon-trigger"
                    aria-label="添加文件或选择资源"
                    aria-controls="workbench-resource-menu"
                    :aria-expanded="resourceMenuOpen"
                    :disabled="busy"
                    @click="toggleResourceMenu"
                  ><span aria-hidden="true">＋</span></button>
                  <section
                    v-if="resourceMenuOpen"
                    id="workbench-resource-menu"
                    class="workbench-page__popover workbench-page__resource-popover"
                    aria-label="添加文件或选择资源"
                  >
                    <template v-if="resourceMenuView === 'root'">
                      <button
                        type="button"
                        class="workbench-page__menu-item"
                        :disabled="selection.workspaceGrantId === '' || attachments.length >= 4"
                        @click="void chooseAttachmentFromMenu()"
                      ><span aria-hidden="true">▱</span><strong>添加文件</strong></button>
                      <div class="workbench-page__menu-divider" />
                      <button type="button" class="workbench-page__menu-item" @click="resourceMenuView = 'agents'">
                        <span aria-hidden="true">◇</span><strong>机器人</strong><span aria-hidden="true">›</span>
                      </button>
                      <button type="button" class="workbench-page__menu-item" @click="resourceMenuView = 'skills'">
                        <span aria-hidden="true">⚡</span><strong>技能</strong><span aria-hidden="true">›</span>
                      </button>
                      <button type="button" class="workbench-page__menu-item" @click="resourceMenuView = 'knowledge'">
                        <span aria-hidden="true">▤</span><strong>知识</strong><span aria-hidden="true">›</span>
                      </button>
                    </template>
                    <template v-else>
                      <header class="workbench-page__popover-header">
                        <button type="button" aria-label="返回资源菜单" @click="resourceMenuView = 'root'">‹</button>
                        <strong>{{ resourceMenuTitle }}</strong>
                      </header>
                      <div v-if="resourceMenuView === 'agents'" class="workbench-page__option-list" aria-label="机器人选择">
                        <button
                          v-for="option in agentOptions"
                          :key="option.value || 'general'"
                          type="button"
                          :disabled="busy || option.disabled"
                          :aria-current="isAgentOptionSelected(option.value) ? 'true' : undefined"
                          @click="selectAgentFromMenu(option.value)"
                        >
                          <span>{{ option.label }}</span><span v-if="isAgentOptionSelected(option.value)" aria-hidden="true">✓</span>
                        </button>
                      </div>
                      <div v-else-if="resourceMenuView === 'skills'" class="workbench-page__option-list" aria-label="技能选择">
                        <label
                          v-for="skill in selectedAgent?.skills ?? []"
                          :key="skill.id"
                          :class="{ 'workbench-page__option--disabled': !skill.available }"
                        >
                          <input
                            type="checkbox"
                            :checked="selection.selectedSkillIds.includes(skill.id)"
                            :disabled="busy || !skill.available"
                            @change="toggleSkill(skill.id)"
                          >
                          <span>{{ skill.name }}</span>
                        </label>
                        <p v-if="selectedAgent === undefined || selectedAgent.skills.length === 0">当前机器人没有可选技能。</p>
                      </div>
                      <div v-else class="workbench-page__option-list" aria-label="知识选择">
                        <label
                          v-for="knowledge in selectedAgent?.knowledge ?? []"
                          :key="knowledge.id"
                          :class="{ 'workbench-page__option--disabled': !knowledge.available }"
                        >
                          <input
                            type="checkbox"
                            :checked="selection.selectedKnowledgeIds.includes(knowledge.id)"
                            :disabled="busy || !knowledge.available"
                            @change="toggleKnowledge(knowledge.id)"
                          >
                          <span>{{ knowledge.name }}</span>
                        </label>
                        <p v-if="selectedAgent === undefined || selectedAgent.knowledge.length === 0">当前机器人没有可选知识。</p>
                      </div>
                    </template>
                  </section>
                </div>
                <button
                  type="button"
                  class="workbench-page__workspace-trigger"
                  :disabled="busy"
                  @click="void chooseWorkspace()"
                >
                  <span aria-hidden="true">▱</span> {{ selectedWorkspaceLabel }}
                </button>
              </div>
              <div class="workbench-page__composer-submit">
                <div ref="modelMenuRoot" class="workbench-page__popover-anchor workbench-page__model-anchor">
                  <button
                    type="button"
                    class="workbench-page__model-trigger"
                    aria-controls="workbench-model-menu"
                    :aria-expanded="modelMenuOpen"
                    :disabled="busy"
                    @click="toggleModelMenu"
                  ><span aria-hidden="true">◉</span><strong>{{ selectedModelLabel }}</strong><span aria-hidden="true">⌄</span></button>
                  <section
                    v-if="modelMenuOpen"
                    id="workbench-model-menu"
                    class="workbench-page__popover workbench-page__model-popover"
                    aria-label="模型选择"
                  >
                    <section class="workbench-page__max-option" aria-labelledby="max-reasoning-label">
                      <div><strong id="max-reasoning-label">Max 模式</strong><small>{{ reasoningStatus }}</small></div>
                      <button
                        class="workbench-page__switch"
                        type="button"
                        role="switch"
                        :aria-checked="reasoningDraftMode === 'max'"
                        :disabled="busy || reasoningCompatibility !== 'available' || reasoningPreviewState === 'loading'"
                        @click="toggleReasoningMode"
                        @keydown.enter.prevent="toggleReasoningMode"
                        @keydown.space.prevent="toggleReasoningMode"
                      >
                        <span aria-hidden="true" />
                        <span class="sr-only">{{ reasoningDraftMode === "max" ? "关闭 Max" : "开启 Max" }}</span>
                      </button>
                    </section>
                    <div class="workbench-page__menu-divider" />
                    <div class="workbench-page__option-list workbench-page__model-list">
                      <button
                        v-for="option in modelOptions"
                        :key="option.value || 'automatic'"
                        type="button"
                        :disabled="busy || option.disabled"
                        :aria-current="selection.requestedModelId === option.value ? 'true' : undefined"
                        @click="selectModelFromMenu(option.value)"
                      >
                        <span>{{ option.label }}</span><span v-if="selection.requestedModelId === option.value" aria-hidden="true">✓</span>
                      </button>
                    </div>
                  </section>
                </div>
                <R3Button
                  v-if="taskStopControlVisible"
                  variant="danger"
                  :loading="taskControlBusy"
                  :disabled="taskControlBusy || cancellationPending || !activeTaskCanCancel"
                  :title="activeTaskCanCancel ? (cancellationPending ? '正在终止任务' : '终止任务') : '正在同步任务状态'"
                  data-stop-task
                  @click="void cancelActiveTask()"
                ><span aria-hidden="true">■</span><span class="sr-only">{{ cancellationPending ? "正在终止任务" : "终止任务" }}</span></R3Button>
                <R3Button
                  v-else
                  variant="primary"
                  :loading="busy"
                  :disabled="sendDisabled"
                  :title="sendDisabledReason || (conversationActive ? '发送消息' : '提交任务')"
                  @click="void submitTask()"
                ><span aria-hidden="true">↑</span><span class="sr-only">{{ conversationActive ? "发送消息" : "提交任务" }}</span></R3Button>
              </div>
            </div>

            <div class="workbench-page__composer-meta">
              <button type="button" :disabled="busy" @click="void chooseWorkspace()">
                <span aria-hidden="true">▱</span> {{ selectedWorkspaceLabel }}
              </button>
              <span>{{ selectedAgentLabel }}<template v-if="selectedResourceCount > 0"> · {{ selectedResourceCount }} 项资源</template></span>
            </div>

            <R3InlineNotice
              v-if="needsGenericRecovery"
              tone="warning"
              title="原机器人已不可用"
            >
              原机器人已从目录中移除。你可以重新选择专项机器人，或明确改用通用机器人。
              <R3Button
                variant="secondary"
                :disabled="busy"
                data-use-general-agent
                @click="useGeneralAgent"
              >
                切换为通用机器人
              </R3Button>
            </R3InlineNotice>

            <R3InlineNotice
              v-if="reasoningPreferenceNotice"
              tone="warning"
              title="Max 默认偏好"
            >
              {{ reasoningPreferenceNotice }}
              <button
                v-if="reasoningPreferenceState === 'uncertain'"
                type="button"
                @click="confirmPreferenceSave"
              >确认保存结果</button>
            </R3InlineNotice>

            <R3InlineNotice
              v-if="uncertainSubmitCommandId"
              tone="warning"
              title="提交结果待确认"
            >
              请求可能已经被系统接收。请先确认原请求结果，不会自动创建第二个任务。
              <button type="button" @click="confirmSubmitResult">确认提交结果</button>
            </R3InlineNotice>

            <section v-if="attachments.length > 0 || attachmentNotice" class="workbench-page__attachments" aria-label="附件资料">
              <ul v-if="attachments.length > 0" class="workbench-page__attachment-list">
                <li v-for="attachment in attachments" :key="attachment.artifactId">
                  <div>
                    <strong>{{ attachment.displayName }}</strong>
                    <span>{{ attachmentTypeLabel(attachment.mediaType) }} · {{ attachment.relativePath }}</span>
                  </div>
                  <button
                    type="button"
                    :aria-label="`移除资料 ${attachment.displayName}`"
                    :disabled="busy"
                    @click="removeAttachment(attachment.artifactId)"
                  >移除</button>
                </li>
              </ul>
              <small v-if="attachmentNotice" role="status">{{ attachmentNotice }}</small>
            </section>
            <p v-if="composerState.disabledReason" class="workbench-page__composer-error" role="status">{{ composerState.disabledReason }}</p>
            <span class="sr-only">{{ composerState.selectionSummary }}</span>
          </div>
        </R3Card>

        </div>

        <aside
          v-if="conversationActive && resultsPanelOpen"
          id="workbench-results-panel"
          class="workbench-page__results-panel"
          aria-label="成果面板"
        >
          <header>
            <div>
              <span>成果</span>
              <small>{{ conversationArtifacts.length }} 项</small>
            </div>
            <R3IconButton label="收起成果面板" @click="resultsPanelOpen = false">
              <span aria-hidden="true">›</span>
            </R3IconButton>
          </header>
          <R3EmptyState
            v-if="conversationArtifacts.length === 0"
            title="暂无成果"
            description="生成的文档、表格和演示会显示在这里。"
          />
          <ul v-else class="workbench-page__artifact-list">
            <li v-for="artifact in conversationArtifacts" :key="artifact.artifactId">
              <span class="workbench-page__artifact-icon" aria-hidden="true">▱</span>
              <div>
                <strong>{{ artifact.displayName }}</strong>
                <small>{{ artifactKindLabel(artifact.kind) }}</small>
              </div>
              <R3Button variant="secondary" @click="void openArtifact(artifact.artifactId)">
                打开
              </R3Button>
            </li>
          </ul>
        </aside>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  inject,
  onActivated,
  onBeforeUnmount,
  onMounted,
  nextTick,
  reactive,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";

import {
  R3Button,
  R3Card,
  R3EmptyState,
  R3IconButton,
  R3InlineNotice,
  R3Textarea,
} from "../../components/ui";
import {
  desktopTasksAdapter,
  tasksAdapterKey,
  type TasksAdapter,
} from "../../adapters/tasks-adapter.js";
import {
  DesktopWorkbenchAdapterError,
  DesktopWorkbenchSubmitUncertainError,
  desktopWorkbenchAdapter,
  workbenchAdapterKey,
  type WorkbenchAdapter,
} from "../../adapters/workbench-adapter.js";
import {
  desktopReasoningModeAdapter,
  reasoningModeAdapterKey,
  ReasoningModeAdapterError,
} from "../../adapters/reasoning-mode-adapter.js";
import type { ReasoningModePreviewV1Alpha5 } from
  "@robothree/contracts/desktop-local/v1alpha5";
import type {
  ArtifactCatalogItemProjection,
  ArtifactProjection,
  ConversationSnapshot,
  TaskDetailProjection,
} from "@robothree/contracts";
import {
  conversationSelection,
  rememberConversationSelection,
} from "../../app/conversation-selection-store.js";
import {
  notifyShellNavigationChanged,
  subscribeWorkbenchNewTaskRequested,
} from "../../app/shell-navigation-events.js";
import type { DesktopRendererEvent } from "../../../shared/foundation-api.js";
import { presentDurableMessage, presentStreamingAssistant } from
  "../../presentation/message-presentation.js";
import { artifactKindLabel } from "../../presentation/artifact-presentation.js";
import { presentTaskStatus } from "../../presentation/task-presentation.js";
import type { StreamingAssistantState } from "../tasks/task-detail-model.js";
import {
  canSubmitConversationTurn,
  findSelectedAgent,
  normalizeKnowledgeIds,
  normalizeSkillIds,
  normalizeWorkbenchSelection,
  presentWorkbenchComposer,
  selectModelId,
  type WorkbenchCatalog,
  type WorkbenchSelection,
} from "./workbench-model.js";
import {
  consumeFollowUpIntent,
  type WorkbenchFollowUpIntent,
} from "./follow-up-intent.js";

defineOptions({ name: "RoboThreeWorkbench" });

const adapter = inject<WorkbenchAdapter>(workbenchAdapterKey, desktopWorkbenchAdapter);
const reasoningAdapter = inject(reasoningModeAdapterKey, desktopReasoningModeAdapter);
const tasksAdapter = inject<TasksAdapter | undefined>(tasksAdapterKey, undefined)
  ?? (typeof window !== "undefined" && "robothreeDesktop" in window
    ? desktopTasksAdapter
    : undefined);
const route = useRoute();
const router = useRouter();
const followUpIntent = ref<WorkbenchFollowUpIntent | undefined>(consumeFollowUpIntent());

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

const quickActions = [
  {
    mark: "表",
    title: "分析表格",
    description: "读取数据并整理结论",
    prompt: "分析工作区中的表格数据，整理关键指标、异常项和可执行结论。",
  },
  {
    mark: "文",
    title: "整理文档",
    description: "提取重点并形成摘要",
    prompt: "阅读工作区中的文档，提取重点、风险和后续行动，并输出结构化摘要。",
  },
  {
    mark: "报",
    title: "生成报告",
    description: "汇总材料并输出报告",
    prompt: "根据工作区中的材料生成一份结构清晰的业务报告，包含结论和后续建议。",
  },
  {
    mark: "演",
    title: "制作演示",
    description: "生成可编辑的 PPTX",
    prompt: "根据工作区中的材料制作一份简洁专业的演示文稿，并输出可编辑的 PPTX。",
  },
] as const;

const taskCategories = [
  { mark: "演", label: "PPT" },
  { mark: "文", label: "文档" },
  { mark: "表", label: "数据分析" },
  { mark: "研", label: "研究报告" },
] as const;

const catalog = reactive<WorkbenchCatalog>({ ...emptyCatalog });
const selection = reactive<WorkbenchSelection>(
  normalizeWorkbenchSelection(emptyCatalog),
);
const composer = ref("");
const resourceMenuOpen = ref(false);
const resourceMenuView = ref<"root" | "agents" | "skills" | "knowledge">("root");
const modelMenuOpen = ref(false);
const resourceMenuRoot = ref<HTMLElement>();
const modelMenuRoot = ref<HTMLElement>();
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const defaultWorkspaceUnavailable = ref(false);
const notice = ref("");
const attachmentNotice = ref("");
const attachments = ref<ArtifactCatalogItemProjection[]>([]);
const reasoningCompatibility = ref<"loading" | "available" | "unavailable" | "error">("loading");
const reasoningPreviewState = ref<"idle" | "loading" | "supported" | "unsupported" | "unknown" | "error">("idle");
const reasoningDraftMode = ref<"default" | "max">("default");
const reasoningPreview = ref<ReasoningModePreviewV1Alpha5>();
const reasoningPreferenceState = ref<
  "loading" | "available" | "saving" | "saved" | "save_failed" | "uncertain" | "unavailable"
>("loading");
const reasoningPreferenceRevision = ref(0);
const pendingPreferenceSave = ref<Readonly<{
  requestedMode: "default" | "max";
  expectedRevision: number;
  commandId: string;
}>>();
const uncertainSubmitCommandId = ref("");
const activeSessionId = ref("");
const activeTaskId = ref("");
const conversationTitle = ref("新对话");
const conversationSnapshot = ref<ConversationSnapshot>();
const activeTaskDetail = ref<TaskDetailProjection>();
const streamingAssistant = ref<StreamingAssistantState>();
const conversationStream = ref<HTMLElement>();
const resultsPanelOpen = ref(false);
const taskControlBusy = ref(false);
const cancellationRequestedTaskId = ref("");
const elapsedNow = ref(Date.now());
let previewSequence = 0;
let conversationRequestSequence = 0;
let elapsedTimer: ReturnType<typeof setInterval> | undefined;
let unsubscribeTasks: (() => void) | undefined;
let unsubscribeNewTaskRequested: (() => void) | undefined;
let followUpSelectionApplied = false;
let hasActivated = false;

function applyQuickAction(prompt: string): void {
  composer.value = prompt;
}

const composerPlaceholder = computed(() => followUpIntent.value === undefined
  ? "描述你想完成的任务…"
  : "例如：将第 3 页改为风险与下一步，并生成项目汇报-v2.pptx，不覆盖原文件…");
const reasoningStatus = computed(() => {
  if (reasoningCompatibility.value === "loading") return "正在检查 Max 可用性…";
  if (reasoningCompatibility.value !== "available") return "Max 当前不可用，任务仍可使用模型默认模式";
  if (reasoningPreviewState.value === "loading") return "正在检查当前模型…";
  if (reasoningPreviewState.value === "supported") return "当前模型支持 Max";
  if (reasoningPreviewState.value === "unsupported") return "当前模型不支持 Max，将按模型默认模式运行";
  if (reasoningPreviewState.value === "unknown") return "当前模型的 Max 支持状态尚未验证，将按模型默认模式运行";
  if (reasoningPreviewState.value === "error") return "暂时无法确认 Max 支持状态，可继续使用模型默认模式";
  return "选择模型后检查 Max 支持状态";
});
const reasoningPreferenceNotice = computed(() => {
  if (reasoningPreferenceState.value === "saving") return "正在保存为后续任务的默认选择…";
  if (reasoningPreferenceState.value === "saved") return "已保存为后续新任务的默认选择。";
  if (reasoningPreferenceState.value === "save_failed") return "本次选择仍可使用，但未保存为后续默认。";
  if (reasoningPreferenceState.value === "uncertain") return "保存结果暂时无法确认；本次选择仍保留。";
  if (reasoningPreferenceState.value === "unavailable") return "偏好保存暂不可用；本次选择仍可使用。";
  return "";
});

const selectedAgent = computed(() => findSelectedAgent(catalog, selection));
const needsGenericRecovery = computed(() => (
  selectedAgent.value === undefined
  && selection.agentId === ""
  && selection.agentSelectionInitialized
));
const composerState = computed(() => presentWorkbenchComposer({
  catalog,
  selection,
  composerText: composer.value,
  busy: busy.value,
}));
const conversationActive = computed(() => activeSessionId.value !== "");
const activeTaskAcceptsInput = computed(() => {
  if (activeTaskDetail.value?.summary.taskId !== activeTaskId.value) return false;
  return canSubmitConversationTurn(activeTaskDetail.value.summary.displayStatus);
});
const activeTaskSummary = computed(() => {
  const summary = activeTaskDetail.value?.summary;
  return summary?.taskId === activeTaskId.value ? summary : undefined;
});
const activeTaskPresentation = computed(() => {
  const status = activeTaskSummary.value?.displayStatus;
  return status === undefined ? undefined : presentTaskStatus(status);
});
const taskStopControlVisible = computed(() => conversationActive.value
  && activeTaskId.value !== ""
  && !activeTaskAcceptsInput.value);
const activeTaskCanCancel = computed(() => tasksAdapter !== undefined
  && activeTaskPresentation.value?.controls.canCancel === true);
const cancellationPending = computed(() => cancellationRequestedTaskId.value !== ""
  && cancellationRequestedTaskId.value === activeTaskId.value);
const taskProgressVisible = computed(() => taskStopControlVisible.value);
const taskTerminationVisible = computed(() => (
  conversationActive.value
  && activeTaskSummary.value?.displayStatus === "cancelled"
));
const taskProgressTitle = computed(() => {
  if (cancellationPending.value) return "正在终止任务";
  switch (activeTaskSummary.value?.displayStatus) {
    case "preparing": return "正在准备任务";
    case "queued": return "任务正在排队";
    case "running": return "RoboThree 正在处理";
    case "waiting_confirmation": return "等待你的确认";
    case "recovering": return "正在恢复任务";
    case "manual_attention": return "任务需要你处理";
    default: return "正在同步任务状态";
  }
});
const taskProgressDescription = computed(() => {
  if (cancellationPending.value) return "停止请求已提交，正在等待 Core 确认。";
  switch (activeTaskSummary.value?.displayStatus) {
    case "waiting_confirmation": return "请检查待确认操作，或终止当前任务。";
    case "recovering": return "正在从持久记录恢复，请勿重复提交。";
    case "manual_attention": return "请检查当前结果，或终止当前任务。";
    default: return "执行状态和回复会在这里实时更新。";
  }
});
const taskElapsedLabel = computed(() => {
  const startedAt = activeTaskSummary.value?.createdAt;
  if (startedAt === undefined) return "正在连接";
  return `已处理 ${formatElapsed(Math.max(0, elapsedNow.value - Date.parse(startedAt)))}`;
});
const sendDisabledReason = computed(() => {
  if (conversationActive.value && !activeTaskAcceptsInput.value) return "RoboThree 正在回复";
  return composerState.value.disabledReason;
});
const sendDisabled = computed(() => (
  sendDisabledReason.value !== "" || composerState.value.sendDisabled
));
const conversationMessages = computed(() => {
  const items = (conversationSnapshot.value?.messages ?? [])
    .slice()
    .sort((left, right) => left.sequence - right.sequence)
    .map((message) => ({
      id: message.messageId,
      presentation: presentDurableMessage(message),
    }));
  if (streamingAssistant.value !== undefined) {
    items.push({
      id: streamingAssistant.value.messageId,
      presentation: presentStreamingAssistant(streamingAssistant.value),
    });
  }
  return items;
});
const conversationArtifacts = computed<readonly ArtifactProjection[]>(() =>
  (activeTaskDetail.value?.artifacts ?? []).filter((artifact) =>
    !artifact.lifecycle.deleted && !artifact.lifecycle.sourceDeleted));

const agentOptions = computed<SelectOption[]>(() => {
  const options = catalog.agents.map((agent) => ({
    label: agent.name,
    value: agent.agentId,
    disabled: !agent.runnable,
  }));
  return [{ label: "通用机器人（默认）", value: "" }, ...options];
});

const modelOptions = computed<SelectOption[]>(() => {
  if (selectedAgent.value === undefined) {
    return catalog.models
      .filter((model) => model.available)
      .map((model) => ({
        label: model.name,
        value: model.modelId,
      }));
  }
  const eligibleIds = new Set(selectedAgent.value.eligibleModels.map((model) =>
    model.modelId));
  return catalog.models
    .filter((model) => eligibleIds.has(model.modelId) && model.available)
    .map((model) => ({
      label: model.name,
      value: model.modelId,
    }));
});

const selectedWorkspaceLabel = computed(() => catalog.workspaces.find((workspace) =>
  workspace.workspaceGrantId === selection.workspaceGrantId)?.displayName ?? "RoboThree 默认工作区");
const selectedAgentLabel = computed(() => {
  if (needsGenericRecovery.value) return "请选择机器人";
  return selectedAgent.value?.name ?? "通用机器人";
});
const selectedModelLabel = computed(() => catalog.models.find((model) =>
  model.modelId === selection.requestedModelId)?.name ?? "选择模型");
const selectedResourceCount = computed(() => (
  selection.selectedSkillIds.length
  + selection.selectedKnowledgeIds.length
  + attachments.value.length
));
const resourceMenuTitle = computed(() => ({
  agents: "选择机器人",
  skills: "选择技能",
  knowledge: "选择知识",
  root: "添加资源",
})[resourceMenuView.value]);

function toggleResourceMenu(): void {
  resourceMenuOpen.value = !resourceMenuOpen.value;
  resourceMenuView.value = "root";
  if (resourceMenuOpen.value) modelMenuOpen.value = false;
}

function toggleModelMenu(): void {
  modelMenuOpen.value = !modelMenuOpen.value;
  if (modelMenuOpen.value) resourceMenuOpen.value = false;
}

function closeComposerMenus(): void {
  resourceMenuOpen.value = false;
  modelMenuOpen.value = false;
  resourceMenuView.value = "root";
}

function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (resourceMenuOpen.value && !resourceMenuRoot.value?.contains(target)) {
    resourceMenuOpen.value = false;
    resourceMenuView.value = "root";
  }
  if (modelMenuOpen.value && !modelMenuRoot.value?.contains(target)) {
    modelMenuOpen.value = false;
  }
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") closeComposerMenus();
}

function handleComposerKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void submitTask();
}

function isAgentOptionSelected(agentId: string): boolean {
  return agentId === ""
    ? selection.agentId === "" && !needsGenericRecovery.value
    : selection.agentId === agentId;
}

function selectAgentFromMenu(agentId: string): void {
  selection.agentId = agentId;
  handleAgentSelection(agentId);
  closeComposerMenus();
}

function selectModelFromMenu(modelId: string): void {
  selection.requestedModelId = modelId;
  modelMenuOpen.value = false;
}

async function chooseAttachmentFromMenu(): Promise<void> {
  await chooseAttachment();
  closeComposerMenus();
}

function handleAgentSelection(agentId: string): void {
  selection.agentSelectionInitialized = agentId !== "";
  if (agentId === "") {
    selection.requestedModelId = "";
    selection.selectedSkillIds = [];
    selection.selectedKnowledgeIds = [];
    void refreshReasoningPreview();
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
  void refreshReasoningPreview();
}

function useGeneralAgent(): void {
  selection.agentId = "";
  selection.agentSelectionInitialized = false;
  selection.requestedModelId = selectModelId(catalog.models, undefined, "");
  selection.selectedSkillIds = [];
  selection.selectedKnowledgeIds = [];
  void refreshReasoningPreview();
}

watch(() => selection.requestedModelId, () => {
  void refreshReasoningPreview();
});

watch(() => selection.workspaceGrantId, (next, previous) => {
  if (previous !== undefined && previous !== "" && next !== previous) {
    attachments.value = [];
    attachmentNotice.value = "工作区已切换，请重新选择资料。";
  }
});

watch(
  () => [singleQueryValue(route?.query.sessionId), singleQueryValue(route?.query.taskId)] as const,
  ([sessionId, taskId], [previousSessionId, previousTaskId]) => {
    if (
      sessionId === ""
      || taskId === ""
      || (sessionId === previousSessionId && taskId === previousTaskId)
    ) return;
    void activateRouteConversation();
  },
);

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleDocumentKeydown);
  void initialize();
  if (tasksAdapter !== undefined) unsubscribeTasks = tasksAdapter.subscribe(handleDesktopEvent);
  unsubscribeNewTaskRequested = subscribeWorkbenchNewTaskRequested(() => {
    void startFreshConversation();
  });
  elapsedTimer = setInterval(() => {
    elapsedNow.value = Date.now();
  }, 1_000);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  document.removeEventListener("keydown", handleDocumentKeydown);
  unsubscribeTasks?.();
  unsubscribeNewTaskRequested?.();
  if (elapsedTimer !== undefined) clearInterval(elapsedTimer);
});

onActivated(() => {
  const intent = consumeFollowUpIntent();
  if (!hasActivated) {
    hasActivated = true;
    return;
  }
  if (routeConversationIds() !== undefined) {
    void activateRouteConversation();
    return;
  }
  if (intent === undefined) {
    resetForNewTask();
    void refresh();
    return;
  }
  followUpIntent.value = intent;
  followUpSelectionApplied = false;
  composer.value = "";
  notice.value = "";
  error.value = "";
  void refresh();
});

async function initialize(): Promise<void> {
  await refresh();
  await activateRouteConversation();
  try {
    const compatibility = await reasoningAdapter.negotiate();
    reasoningCompatibility.value = compatibility.state;
    if (compatibility.state === "available") {
      try {
        const preference = await reasoningAdapter.loadPreference();
        reasoningDraftMode.value = preference.requestedMode;
        reasoningPreferenceRevision.value = preference.preferenceRevision ?? 0;
        reasoningPreferenceState.value = preference.preferencePersistence === "available"
          ? "available"
          : "unavailable";
      } catch {
        reasoningDraftMode.value = "default";
        reasoningPreferenceState.value = "unavailable";
      }
      await refreshReasoningPreview();
    }
  } catch {
    reasoningCompatibility.value = "error";
  }
}

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const next = await adapter.loadWorkbenchData();
    const previousWorkspaceGrantId = selection.workspaceGrantId;
    Object.assign(catalog, next);
    Object.assign(selection, normalizeWorkbenchSelection(catalog, selection));
    applyFollowUpSelection();
    if (followUpIntent.value !== undefined && previousWorkspaceGrantId === "") {
      selection.workspaceGrantId = "";
    }
    const requestedWorkspace = singleQueryValue(route?.query.workspaceGrantId);
    if (catalog.workspaces.some((workspace) =>
      workspace.workspaceGrantId === requestedWorkspace)) {
      selection.workspaceGrantId = requestedWorkspace;
    }
    const requestedSession = singleQueryValue(route?.query.sessionId);
    if (catalog.sessions.some((session) => session.sessionId === requestedSession)) {
      selection.sessionId = requestedSession;
    }
    error.value = followUpIntent.value !== undefined && selection.sessionId === ""
      ? "原对话已不可用，请返回任务页刷新后重试。"
      : "";
  } catch (caught) {
    if (caught instanceof DesktopWorkbenchSubmitUncertainError) {
      uncertainSubmitCommandId.value = caught.commandId;
      selection.sessionId = caught.session.sessionId;
      notice.value = "任务提交结果暂时无法确认。";
      return;
    }
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
      defaultWorkspaceUnavailable.value = false;
      error.value = "";
    }
  } catch (caught) {
    error.value = explainError(caught);
  } finally {
    busy.value = false;
  }
}

async function chooseAttachment(): Promise<void> {
  if (selection.workspaceGrantId === "" || attachments.value.length >= 4) return;
  busy.value = true;
  attachmentNotice.value = "";
  try {
    const attachment = await adapter.pickWorkspaceAttachment(selection.workspaceGrantId);
    if (attachment === undefined) return;
    if (!attachments.value.some((item) => item.artifactId === attachment.artifactId)) {
      attachments.value = [...attachments.value, attachment];
    }
  } catch (caught) {
    attachmentNotice.value = explainError(caught);
  } finally {
    busy.value = false;
  }
}

function removeAttachment(artifactId: string): void {
  attachments.value = attachments.value.filter((item) => item.artifactId !== artifactId);
  attachmentNotice.value = "";
}

async function submitTask(): Promise<void> {
  if (sendDisabled.value) return;
  busy.value = true;
  notice.value = "";
  error.value = "";
  defaultWorkspaceUnavailable.value = false;
  try {
    const text = composer.value.trim();
    const result = await adapter.submitTask({
      sessionId: selection.sessionId,
      sessionTitle: text.slice(0, 48) || "新任务",
      userInput: text,
      agentId: selectedAgent.value?.agentId ?? "",
      requestedModelId: selection.requestedModelId,
      selectedSkillIds: selection.selectedSkillIds,
      selectedKnowledgeIds: selection.selectedKnowledgeIds,
      ...(selection.workspaceGrantId === ""
        ? {}
        : { workspaceGrantId: selection.workspaceGrantId }),
      attachments: attachments.value,
      reasoning: {
        requestedMode: reasoningDraftMode.value,
        ...(reasoningPreview.value === undefined
          ? {}
          : { preview: reasoningPreview.value }),
      },
    });
    composer.value = "";
    attachments.value = [];
    notice.value = "";
    selection.sessionId = result.session.sessionId;
    activeSessionId.value = result.session.sessionId;
    activeTaskId.value = result.receipt.taskId;
    conversationTitle.value = result.session.title;
    followUpIntent.value = undefined;
    rememberConversationSelection(result.session.sessionId, currentConversationSelection());
    await router?.replace({
      name: "workbench",
      query: {
        sessionId: result.session.sessionId,
        taskId: result.receipt.taskId,
      },
    });
    notifyShellNavigationChanged();
    await refresh();
    // The submit receipt is authoritative even if the list projection is one tick behind.
    selection.sessionId = result.session.sessionId;
    await refreshActiveConversation();
  } catch (caught) {
    defaultWorkspaceUnavailable.value = isDefaultWorkspaceUnavailable(caught);
    error.value = explainError(caught);
  } finally {
    busy.value = false;
  }
}

async function cancelActiveTask(): Promise<void> {
  const summary = activeTaskSummary.value;
  if (tasksAdapter === undefined || summary === undefined
    || !presentTaskStatus(summary.displayStatus).controls.canCancel
    || taskControlBusy.value || cancellationPending.value) return;
  taskControlBusy.value = true;
  error.value = "";
  try {
    const receipt = await tasksAdapter.cancelTask({
      taskId: summary.taskId,
      expectedTaskRevision: summary.revision,
    });
    if (receipt.status === "rejected") {
      error.value = "任务状态已经变化，当前无法终止。已为你刷新最新状态。";
      await refreshActiveConversation();
      return;
    }
    cancellationRequestedTaskId.value = summary.taskId;
    await refreshActiveConversation();
    notifyShellNavigationChanged();
  } catch {
    error.value = "任务暂时无法终止，请等待状态更新后重试。";
  } finally {
    taskControlBusy.value = false;
  }
}

function applyFollowUpSelection(): void {
  const intent = followUpIntent.value;
  if (intent === undefined || followUpSelectionApplied) return;
  followUpSelectionApplied = true;
  const sessionAvailable = catalog.sessions.some((session) =>
    session.sessionId === intent.sessionId && !session.tombstoned);
  selection.sessionId = sessionAvailable ? intent.sessionId : "";
  selection.workspaceGrantId = "";
  selection.selectedSkillIds = [];
  selection.selectedKnowledgeIds = [];
  attachments.value = [];
  const agent = catalog.agents.find((candidate) =>
    candidate.agentId === intent.candidateAgentId && candidate.runnable);
  selection.agentSelectionInitialized = true;
  selection.agentId = agent?.agentId ?? "";
  selection.requestedModelId = agent === undefined
    ? ""
    : selectModelId(catalog.models, agent, intent.candidateModelId);
  if (!sessionAvailable) {
    error.value = "原对话已不可用，请返回任务页刷新后重试。";
  }
}

function attachmentTypeLabel(mediaType: string): string {
  if (mediaType === "application/pdf") return "PDF";
  if (mediaType.includes("wordprocessingml")) return "DOCX";
  if (mediaType.includes("spreadsheetml")) return "XLSX";
  return "文件";
}

function toggleReasoningMode(): void {
  if (reasoningCompatibility.value !== "available") return;
  if (reasoningDraftMode.value === "default") {
    if (reasoningPreview.value === undefined
      || reasoningPreview.value.effectiveModelId !== selection.requestedModelId) return;
    reasoningDraftMode.value = "max";
  } else {
    reasoningDraftMode.value = "default";
  }
  void saveReasoningPreference();
}

async function saveReasoningPreference(existing = pendingPreferenceSave.value): Promise<void> {
  const material = existing ?? {
    requestedMode: reasoningDraftMode.value,
    expectedRevision: reasoningPreferenceRevision.value,
    commandId: crypto.randomUUID(),
  };
  pendingPreferenceSave.value = material;
  reasoningPreferenceState.value = "saving";
  try {
    const receipt = await reasoningAdapter.savePreference(material);
    reasoningPreferenceRevision.value = receipt.committedPreferenceRevision;
    reasoningPreferenceState.value = "saved";
    pendingPreferenceSave.value = undefined;
  } catch (caught) {
    reasoningPreferenceState.value = caught instanceof ReasoningModeAdapterError
      && (caught.code === "runtime.request_aborted"
        || caught.code === "reasoning.runtime_changed")
      ? "uncertain"
      : "save_failed";
  }
}

function confirmPreferenceSave(): void {
  if (pendingPreferenceSave.value !== undefined) void saveReasoningPreference();
}

async function confirmSubmitResult(): Promise<void> {
  const commandId = uncertainSubmitCommandId.value;
  if (commandId === "") return;
  busy.value = true;
  try {
    const receipt = await adapter.recoverReasoningSubmit(commandId);
    uncertainSubmitCommandId.value = "";
    notice.value = receipt.status === "replayed"
      ? "该任务已从持久记录恢复。"
      : "已确认原任务提交成功。";
    if (selection.sessionId !== "") {
      rememberConversationSelection(selection.sessionId, currentConversationSelection());
    }
    await refresh();
  } catch (caught) {
    error.value = explainError(caught);
  } finally {
    busy.value = false;
  }
}

async function refreshReasoningPreview(): Promise<void> {
  const agentId = selection.agentId === "" && !needsGenericRecovery.value
    ? "agent.general"
    : selection.agentId;
  const requestedModelId = selection.requestedModelId;
  const sequence = ++previewSequence;
  reasoningAdapter.invalidatePreview();
  reasoningPreview.value = undefined;
  if (reasoningCompatibility.value !== "available"
    || agentId === "" || requestedModelId === "") {
    reasoningPreviewState.value = "idle";
    return;
  }
  reasoningPreviewState.value = "loading";
  try {
    const result = await reasoningAdapter.preview({
      agentId,
      requestedModelId,
    });
    if (sequence !== previewSequence || result.stale || result.value === undefined
      || result.value.effectiveModelId !== selection.requestedModelId) return;
    reasoningPreview.value = result.value;
    reasoningPreviewState.value = result.value.maxSupport;
  } catch (caught) {
    if (sequence !== previewSequence) return;
    reasoningPreviewState.value = "error";
    if (caught instanceof ReasoningModeAdapterError
      && caught.code === "reasoning.runtime_changed") {
      reasoningCompatibility.value = "unavailable";
    }
  }
}

function currentConversationSelection() {
  return {
    agentId: selectedAgent.value?.agentId ?? "",
    requestedModelId: selection.requestedModelId,
    selectedSkillIds: selection.selectedSkillIds,
    selectedKnowledgeIds: selection.selectedKnowledgeIds,
    ...(selection.workspaceGrantId === ""
      ? {}
      : { workspaceGrantId: selection.workspaceGrantId }),
  };
}

function resetForNewTask(): void {
  followUpIntent.value = undefined;
  followUpSelectionApplied = false;
  selection.sessionId = "";
  composer.value = "";
  attachments.value = [];
  attachmentNotice.value = "";
  notice.value = "";
  error.value = "";
  uncertainSubmitCommandId.value = "";
  activeSessionId.value = "";
  activeTaskId.value = "";
  conversationTitle.value = "新对话";
  conversationSnapshot.value = undefined;
  activeTaskDetail.value = undefined;
  streamingAssistant.value = undefined;
  cancellationRequestedTaskId.value = "";
  resultsPanelOpen.value = false;
  conversationRequestSequence += 1;
  closeComposerMenus();
}

async function startFreshConversation(): Promise<void> {
  resetForNewTask();
  await router?.replace({ name: "workbench" });
  await refresh();
  // The explicit new-task action wins over any lagging Session projection.
  selection.sessionId = "";
}

function routeConversationIds(): { sessionId: string; taskId: string } | undefined {
  const sessionId = singleQueryValue(route?.query.sessionId);
  const taskId = singleQueryValue(route?.query.taskId);
  return sessionId === "" || taskId === "" ? undefined : { sessionId, taskId };
}

async function activateRouteConversation(): Promise<void> {
  const ids = routeConversationIds();
  if (ids === undefined || tasksAdapter === undefined) return;
  if (
    activeSessionId.value === ids.sessionId
    && activeTaskId.value === ids.taskId
    && conversationSnapshot.value !== undefined
  ) return;

  const session = catalog.sessions.find((candidate) => candidate.sessionId === ids.sessionId);
  if (session === undefined) {
    error.value = "该对话已不可用，请返回新建任务。";
    return;
  }

  const remembered = conversationSelection(ids.sessionId);
  if (remembered !== undefined) {
    Object.assign(selection, normalizeWorkbenchSelection(catalog, {
      ...selection,
      sessionId: ids.sessionId,
      agentId: remembered.agentId,
      agentSelectionInitialized: remembered.agentId !== "",
      requestedModelId: remembered.requestedModelId,
      selectedSkillIds: remembered.selectedSkillIds,
      selectedKnowledgeIds: remembered.selectedKnowledgeIds,
      ...(remembered.workspaceGrantId === undefined
        ? {}
        : { workspaceGrantId: remembered.workspaceGrantId }),
    }));
  }
  selection.sessionId = ids.sessionId;
  activeSessionId.value = ids.sessionId;
  activeTaskId.value = ids.taskId;
  conversationTitle.value = session.title;
  conversationSnapshot.value = undefined;
  activeTaskDetail.value = undefined;
  streamingAssistant.value = undefined;
  notice.value = "";
  error.value = "";
  await refreshActiveConversation();

  if (remembered === undefined && activeTaskDetail.value !== undefined) {
    const resolvedAgentId = activeTaskDetail.value.summary.resolvedAgentId;
    selection.agentId = resolvedAgentId === "agent.general" ? "" : resolvedAgentId;
    selection.agentSelectionInitialized = selection.agentId !== "";
    selection.requestedModelId = activeTaskDetail.value.summary.resolvedModelId;
    selection.selectedSkillIds = [];
    selection.selectedKnowledgeIds = [];
  }
  void refreshReasoningPreview();
}

async function refreshActiveConversation(): Promise<void> {
  if (tasksAdapter === undefined || activeSessionId.value === "" || activeTaskId.value === "") return;
  const sessionId = activeSessionId.value;
  const taskId = activeTaskId.value;
  const sequence = ++conversationRequestSequence;
  try {
    const [snapshot, detail] = await Promise.all([
      tasksAdapter.loadConversation(sessionId),
      tasksAdapter.loadTaskDetail(taskId),
    ]);
    if (sequence !== conversationRequestSequence
      || sessionId !== activeSessionId.value
      || taskId !== activeTaskId.value) return;
    conversationSnapshot.value = snapshot;
    activeTaskDetail.value = detail;
    if (presentTaskStatus(detail.summary.displayStatus).isTerminal) {
      cancellationRequestedTaskId.value = "";
    }
    await scrollConversationToBottom();
  } catch {
    if (sequence !== conversationRequestSequence) return;
    // Submit errors remain separate. Event replay can still recover the durable view.
  }
}

function handleDesktopEvent(event: DesktopRendererEvent): void {
  if (!conversationActive.value) return;
  if (!("deliveryKind" in event)) {
    streamingAssistant.value = undefined;
    void refreshActiveConversation();
    return;
  }
  if (event.deliveryKind === "ephemeral"
    && event.payload.type === "assistant_token_delta"
    && event.payload.sessionId === activeSessionId.value) {
    const current = streamingAssistant.value;
    if (current === undefined
      || current.messageId !== event.payload.messageId
      || current.runtimeInstanceId !== event.runtimeInstanceId) {
      if (event.payload.deltaSequence !== 0) return;
      streamingAssistant.value = {
        sessionId: event.payload.sessionId,
        messageId: event.payload.messageId,
        runtimeInstanceId: event.runtimeInstanceId,
        lastDeltaSequence: 0,
        text: event.payload.delta,
      };
    } else if (event.payload.deltaSequence === current.lastDeltaSequence + 1) {
      streamingAssistant.value = {
        ...current,
        lastDeltaSequence: event.payload.deltaSequence,
        text: current.text + event.payload.delta,
      };
    }
    void scrollConversationToBottom();
    return;
  }
  if (event.deliveryKind === "durable"
    && event.payload.type === "message_committed"
    && event.payload.sessionId === activeSessionId.value) {
    if (streamingAssistant.value?.messageId === event.payload.messageId) {
      streamingAssistant.value = undefined;
    }
    void refreshActiveConversation();
    return;
  }
  if (event.deliveryKind === "durable"
    && event.payload.type === "task_status_changed"
    && event.payload.taskId === activeTaskId.value) {
    void refreshActiveConversation();
    notifyShellNavigationChanged();
    return;
  }
  if (event.deliveryKind === "durable"
    && event.payload.type === "tool_activity_changed"
    && event.payload.taskId === activeTaskId.value) {
    void refreshActiveConversation();
  }
}

async function scrollConversationToBottom(): Promise<void> {
  await nextTick();
  const element = conversationStream.value;
  if (element !== undefined) element.scrollTop = element.scrollHeight;
}

async function openArtifact(artifactId: string): Promise<void> {
  if (tasksAdapter === undefined) return;
  try {
    await tasksAdapter.openArtifactLocation({ artifactId });
  } catch {
    error.value = "成果暂时无法打开，请稍后重试。";
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
  if (isDefaultWorkspaceUnavailable(caught)) {
    return "默认工作目录暂时不可用，请选择一个工作区后重试。";
  }
  if (caught instanceof DesktopWorkbenchAdapterError
    || caught instanceof ReasoningModeAdapterError) return caught.message;
  return "任务资源暂时不可用，请稍后重试。";
}

function isDefaultWorkspaceUnavailable(caught: unknown): boolean {
  return (caught instanceof DesktopWorkbenchAdapterError
      || caught instanceof ReasoningModeAdapterError)
    && caught.code === "workspace.default_unavailable";
}

function singleQueryValue(value: unknown): string {
  return typeof value === "string" ? value : "";
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

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}小时 ${minutes}分`;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
}
</script>

<style scoped>
.workbench-page {
  display: grid;
  align-content: start;
  gap: 14px;
  width: min(100%, 860px);
  margin: 0 auto;
  padding: clamp(28px, 6vh, 64px) 24px 36px;
}

.workbench-page__header,
.workbench-page__card-header,
.workbench-page__card-actions,
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

.workbench-page__header {
  align-items: flex-start;
}

.workbench-page__header h2 {
  margin-top: 2px;
  font-size: clamp(24px, 3vw, 30px);
  line-height: 1.25;
  letter-spacing: 0;
}

.workbench-page__kicker {
  margin: 0;
  color: var(--r3-color-primary);
  font-size: var(--r3-font-size-xs);
  font-weight: 700;
}

.workbench-page__sync {
  min-width: 126px;
  color: var(--r3-color-text-tertiary);
  font-size: var(--r3-font-size-xs);
  text-align: right;
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

.workbench-page__eyebrow {
  margin: 6px 0 0;
}

.workbench-page__quick-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.workbench-page__quick-actions button {
  min-width: 0;
  min-height: 82px;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  grid-template-rows: auto auto;
  column-gap: 9px;
  align-content: center;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 12px;
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
  text-align: left;
  box-shadow: var(--r3-shadow-sm);
  transition: border-color var(--r3-motion-fast), box-shadow var(--r3-motion-fast), transform var(--r3-motion-fast);
}

.workbench-page__quick-actions button:hover:not(:disabled) {
  border-color: var(--r3-color-border-strong);
  box-shadow: var(--r3-shadow-md);
  transform: translateY(-1px);
}

.workbench-page__quick-actions button > span {
  grid-row: 1 / span 2;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: #edf1f7;
  color: #495467;
  font-size: 11px;
  font-weight: 750;
}

.workbench-page__quick-actions strong,
.workbench-page__quick-actions small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-page__quick-actions strong {
  font-size: var(--r3-font-size-sm);
}

.workbench-page__quick-actions small {
  color: var(--r3-color-text-tertiary);
  font-size: 11px;
}

.workbench-page__layout { width: 100%; }

.workbench-page__layout :deep(.r3-card) {
  border-color: var(--r3-color-border-strong);
  box-shadow: var(--r3-shadow-md);
}

.workbench-page__layout :deep(.r3-card__header) {
  padding: 11px 14px;
}

.workbench-page__layout :deep(.r3-card__body) {
  padding: 14px;
}

.workbench-page__primary,
.workbench-page__side,
.workbench-page__composer {
  display: grid;
  gap: 12px;
}

.workbench-page__composer :deep(.r3-field:first-child .r3-field__label) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.workbench-page__composer :deep(.r3-textarea) {
  min-height: 104px;
  resize: none;
  border-color: transparent;
  border-radius: var(--r3-radius-md);
  padding: 12px 13px;
  background: var(--r3-color-surface-muted);
  line-height: 1.65;
}

.workbench-page__composer :deep(.r3-textarea:focus) {
  border-color: var(--r3-color-primary);
  outline: none;
  box-shadow: var(--r3-focus-ring);
}

.workbench-page__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  padding-top: 2px;
}

.workbench-page__reasoning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 10px 11px;
  background: var(--r3-color-surface-muted);
}

.workbench-page__reasoning p,
.workbench-page__reasoning small {
  margin: 4px 0 0;
  color: var(--r3-color-text-secondary);
}

.workbench-page__switch {
  width: 44px;
  min-width: 44px;
  height: 24px;
  border: 1px solid var(--r3-color-border);
  border-radius: 999px;
  padding: 2px;
  background: var(--r3-color-surface-muted);
  cursor: pointer;
}

.workbench-page__switch > span:first-child {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--r3-color-text-secondary);
  transition: transform 120ms ease, background 120ms ease;
}

.workbench-page__switch[aria-checked="true"] > span:first-child {
  transform: translateX(18px);
  background: var(--r3-color-accent);
}

.workbench-page__switch:focus-visible {
  outline: 3px solid var(--r3-color-focus);
  outline-offset: 2px;
}

.workbench-page__switch:disabled {
  cursor: not-allowed;
  opacity: 0.55;
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
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.workbench-page__chips-label {
  min-width: 40px;
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-xs);
}

.workbench-page__chip {
  min-height: 28px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-sm);
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--r3-color-surface-muted);
  font-size: var(--r3-font-size-xs);
}

.workbench-page__chip--disabled {
  color: var(--r3-color-text-secondary);
}

.workbench-page__attachments {
  display: grid;
  align-items: stretch;
  justify-content: initial;
  border: 1px dashed var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 9px 11px;
  background: var(--r3-color-surface-muted);
}

.workbench-page__attachments-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.workbench-page__attachments-heading > div,
.workbench-page__metric {
  display: grid;
  gap: 4px;
}

.workbench-page__attachment-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.workbench-page__attachment-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-sm);
  padding: 8px 10px;
  background: var(--r3-color-surface);
}

.workbench-page__attachment-list li > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.workbench-page__attachment-list span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-page__attachment-list button {
  border: 0;
  background: transparent;
  color: var(--r3-color-primary);
  cursor: pointer;
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
  .workbench-page__quick-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .workbench-page {
    padding: 22px 16px 28px;
  }

  .workbench-page__grid,
  .workbench-page__modes {
    grid-template-columns: 1fr;
  }

  .workbench-page__card-header {
    align-items: flex-start;
    flex-direction: column;
  }
}

/* Conversation-first Workbench composition. Existing classes above retain
   compatibility for focused tests while these rules define the product surface. */
.workbench-page {
  width: min(100%, 900px);
  min-height: 100%;
  gap: 14px;
  padding: clamp(72px, 15vh, 156px) 28px 48px;
}

.workbench-page__header { order: 1; display: grid; justify-items: center; text-align: center; }
.workbench-page__header > div { display: grid; justify-items: center; }
.workbench-page__header h2 { margin: 4px 0 0; font-size: 36px; line-height: 1.25; font-weight: 620; }
.workbench-page__header .workbench-page__kicker { color: var(--r3-color-text-tertiary); font-weight: 600; }
.workbench-page__header .workbench-page__eyebrow { max-width: 560px; margin-top: 8px; }
.workbench-page__sync { min-height: 18px; min-width: 0; margin-top: 5px; text-align: center; }

.workbench-page__feedback { order: 2; }
.workbench-page__layout { order: 3; }
.workbench-page__capabilities { order: 4; }
.workbench-page__quick-actions { order: 5; }

.workbench-page__layout :deep(.r3-card) {
  overflow: visible;
  border: 1px solid #dfe2e8;
  border-radius: 16px;
  background: var(--r3-color-surface);
  box-shadow: 0 10px 32px rgba(20, 27, 45, 0.07);
  transition: border-color var(--r3-motion-fast), box-shadow var(--r3-motion-fast);
}

.workbench-page__layout :deep(.r3-card:focus-within) {
  border-color: #b9c6ed;
  box-shadow: 0 14px 38px rgba(49, 94, 231, 0.1);
}

.workbench-page__layout :deep(.r3-card__header) { display: none; }
.workbench-page__layout :deep(.r3-card__body) { padding: 0; }
.workbench-page__composer { gap: 0; }

.workbench-page__composer :deep(.r3-textarea) {
  min-height: 126px;
  border: 0;
  border-radius: 16px 16px 0 0;
  padding: 18px 20px 10px;
  background: #fff;
  font-size: 15px;
  line-height: 1.65;
}

.workbench-page__composer :deep(.r3-textarea:focus) { border: 0; box-shadow: none; }

.workbench-page__composer-toolbar {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px 8px 14px;
  border-top: 1px solid #f0f1f3;
}

.workbench-page__composer-tools,
.workbench-page__composer-submit {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.workbench-page__composer-toolbar :deep(.r3-button),
.workbench-page__workspace-trigger,
.workbench-page__icon-trigger,
.workbench-page__model-trigger {
  min-height: 32px;
  border: 0;
  border-radius: 8px;
  padding: 0 9px;
  background: transparent;
  color: var(--r3-color-text-secondary);
  font-size: 12px;
}

.workbench-page__composer-toolbar :deep(.r3-button:hover:not(:disabled)),
.workbench-page__workspace-trigger:hover:not(:disabled),
.workbench-page__icon-trigger:hover:not(:disabled),
.workbench-page__model-trigger:hover:not(:disabled) { background: var(--r3-color-surface-hover); color: var(--r3-color-text); }

.workbench-page__icon-trigger {
  width: 32px;
  padding: 0;
  font-size: 21px;
  line-height: 1;
}

.workbench-page__model-trigger {
  max-width: 240px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid #d8deee;
  border-radius: 999px;
  padding: 0 12px;
  background: #f8faff;
  color: var(--r3-color-primary);
  white-space: nowrap;
}

.workbench-page__model-trigger strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 620;
}

.workbench-page__popover-anchor { position: relative; }

.workbench-page__popover {
  position: absolute;
  z-index: 30;
  bottom: calc(100% + 10px);
  min-width: 248px;
  max-width: min(360px, calc(100vw - 56px));
  border: 1px solid #dfe3eb;
  border-radius: 12px;
  padding: 10px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(20, 27, 45, 0.16);
}

.workbench-page__resource-popover { left: -4px; }
.workbench-page__model-popover { right: 0; width: 330px; }

.workbench-page__menu-item,
.workbench-page__option-list > button,
.workbench-page__option-list > label {
  width: 100%;
  min-height: 40px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 8px;
  padding: 0 10px;
  background: transparent;
  color: var(--r3-color-text);
  text-align: left;
}

.workbench-page__menu-item:hover:not(:disabled),
.workbench-page__option-list > button:hover:not(:disabled),
.workbench-page__option-list > label:hover { background: var(--r3-color-surface-hover); }

.workbench-page__menu-item strong { font-weight: 620; }
.workbench-page__menu-item > span:last-child { color: var(--r3-color-text-tertiary); }
.workbench-page__menu-divider { height: 1px; margin: 7px 2px; background: var(--r3-color-border); }

.workbench-page__popover-header {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 4px;
  padding: 0 2px 8px;
}

.workbench-page__popover-header button {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  font-size: 20px;
}

.workbench-page__popover-header button:hover { background: var(--r3-color-surface-hover); }
.workbench-page__option-list { max-height: 300px; overflow-y: auto; }
.workbench-page__option-list > button { grid-template-columns: minmax(0, 1fr) auto; }
.workbench-page__option-list > button[aria-current="true"] { background: #eef3ff; color: var(--r3-color-primary); }
.workbench-page__option-list > label { grid-template-columns: 20px minmax(0, 1fr); cursor: pointer; }
.workbench-page__option-list > p { margin: 10px; color: var(--r3-color-text-secondary); font-size: 12px; }
.workbench-page__option--disabled { opacity: 0.55; cursor: not-allowed; }

.workbench-page__max-option {
  min-height: 62px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 5px 8px;
}

.workbench-page__max-option > div { min-width: 0; display: grid; gap: 5px; }
.workbench-page__max-option small { color: var(--r3-color-text-secondary); font-size: 11px; line-height: 1.35; }

.workbench-page__composer-meta {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid #f0f1f3;
  border-radius: 0 0 16px 16px;
  padding: 6px 14px;
  background: #f7f7f8;
  color: var(--r3-color-text-secondary);
  font-size: 12px;
}

.workbench-page__composer-meta button {
  min-width: 0;
  border: 0;
  border-radius: 7px;
  padding: 6px 8px;
  background: transparent;
  color: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-page__composer-meta button:hover:not(:disabled) { background: #eceef2; color: var(--r3-color-text); }
.workbench-page__composer-meta > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.workbench-page__attachments {
  display: grid;
  margin: 9px 12px 0;
}

.workbench-page__composer-error {
  margin: 0;
  padding: 7px 14px 10px;
  color: var(--r3-color-danger);
  font-size: 12px;
}

.workbench-page__composer-submit :deep(.r3-button) {
  width: 38px;
  min-width: 38px;
  height: 38px;
  min-height: 38px;
  border-radius: 50%;
  padding: 0;
  font-size: 20px;
}

.workbench-page__composer-submit :deep(.r3-button:disabled) {
  border-color: #d8dce6;
  background: #e5e8f0;
  color: #667085;
  opacity: 1;
}

.workbench-page__composer-submit :deep(.r3-button--danger) {
  border-color: #d92d20;
  background: #d92d20;
  color: #fff;
}

.workbench-page__composer-submit :deep(.r3-button--danger:hover:not(:disabled)) {
  background: #b42318;
}

.workbench-page__capabilities {
  display: flex;
  justify-content: center;
  gap: 8px;
  overflow-x: auto;
  padding: 1px 0;
  scrollbar-width: none;
}

.workbench-page__capabilities > span {
  min-height: 34px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--r3-color-border);
  border-radius: 999px;
  padding: 0 13px;
  background: #fff;
  color: var(--r3-color-text-secondary);
  font-size: 12px;
}

.workbench-page__capabilities > span > span { color: var(--r3-color-primary); font-weight: 700; }

.workbench-page__quick-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  padding: 0 26px;
}

.workbench-page__quick-actions button {
  min-height: 42px;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 24px;
  grid-template-rows: 1fr;
  align-items: center;
  gap: 8px;
  border: 0;
  border-bottom: 1px solid #eceef1;
  border-radius: 0;
  padding: 0 8px;
  background: transparent;
  box-shadow: none;
}

.workbench-page__quick-actions button:hover:not(:disabled) { border-color: #e5e7eb; background: #f7f8fa; box-shadow: none; transform: none; }
.workbench-page__quick-actions button > span:first-child {
  grid-column: 1;
  grid-row: 1;
  width: 24px;
  height: 24px;
  border-radius: 6px;
}
.workbench-page__quick-actions button > strong { font-size: 13px; }
.workbench-page__quick-actions button > small { display: inline; color: var(--r3-color-text-secondary); font-size: 12px; }
.workbench-page__quick-actions button > .workbench-page__quick-copy {
  grid-column: 2;
  grid-row: 1;
  width: auto;
  height: auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  place-items: initial;
  gap: 8px;
  border-radius: 0;
  background: transparent;
  color: var(--r3-color-text);
  font-size: inherit;
  font-weight: inherit;
}
.workbench-page__quick-copy strong,
.workbench-page__quick-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workbench-page__quick-actions button > span:last-child {
  grid-column: 3;
  grid-row: 1;
  color: var(--r3-color-text-tertiary);
  text-align: center;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-height: 700px) {
  .workbench-page { padding-top: 48px; }
}

@media (max-width: 900px) {
  .workbench-page { padding: 64px 20px 36px; }
  .workbench-page__header h2 { font-size: 31px; }
  .workbench-page__composer-toolbar { align-items: flex-end; }
  .workbench-page__quick-actions { padding: 0 8px; }
}

@media (max-width: 720px) {
  .workbench-page { padding: 38px 14px 28px; }
  .workbench-page__header h2 { font-size: 27px; }
  .workbench-page__header .workbench-page__eyebrow { font-size: 12px; }
  .workbench-page__composer-toolbar { align-items: center; }
  .workbench-page__workspace-trigger { display: none; }
  .workbench-page__model-trigger { max-width: 170px; }
  .workbench-page__model-popover { right: -48px; }
  .workbench-page__composer-meta > span { display: none; }
  .workbench-page__capabilities { justify-content: flex-start; }
}

.workbench-page--conversation {
  width: 100%;
  height: 100%;
  min-height: 560px;
  align-content: stretch;
  gap: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

.workbench-page--conversation > .workbench-page__feedback {
  position: absolute;
  z-index: 20;
  top: 16px;
  left: 50%;
  width: min(720px, calc(100% - 48px));
  transform: translateX(-50%);
}

.workbench-page--conversation .workbench-page__layout,
.workbench-page__conversation-workspace,
.workbench-page--conversation .workbench-page__primary {
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.workbench-page__conversation-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  background: var(--r3-color-surface);
}

.workbench-page--results-open .workbench-page__conversation-workspace {
  grid-template-columns: minmax(520px, 1fr) minmax(280px, 340px);
}

.workbench-page--conversation .workbench-page__primary {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.workbench-page__conversation-header {
  min-height: 62px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--r3-color-border);
  padding: 10px 18px;
  background: rgba(255, 255, 255, 0.96);
}

.workbench-page__conversation-header > div {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.workbench-page__conversation-header h2 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--r3-color-text);
  font-size: 15px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-page__conversation-mark,
.workbench-page__message-avatar {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #edf2ff;
  color: var(--r3-color-primary);
  font-size: 11px;
  font-weight: 750;
}

.workbench-page__conversation-mark {
  width: 30px;
  height: 30px;
}

.workbench-page__conversation-stream {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  padding: 28px clamp(18px, 6vw, 72px) 30px;
  scroll-behavior: smooth;
  overscroll-behavior: contain;
}

.workbench-page__messages {
  width: min(820px, 100%);
  margin: 0 auto;
  padding: 0;
  display: grid;
  gap: 24px;
  list-style: none;
}

.workbench-page__message {
  min-width: 0;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
}

.workbench-page__message-avatar {
  width: 34px;
  height: 34px;
}

.workbench-page__message-body {
  min-width: 0;
  padding: 5px 0;
}

.workbench-page__message-body strong {
  display: block;
  margin-bottom: 7px;
  font-size: 13px;
}

.workbench-page__message-body p {
  margin: 0;
  color: var(--r3-color-text);
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.workbench-page__message.message-user {
  grid-template-columns: minmax(0, 1fr) 34px;
}

.workbench-page__message.message-user .workbench-page__message-avatar {
  grid-column: 2;
  background: #eef1f6;
  color: var(--r3-color-text-secondary);
}

.workbench-page__message.message-user .workbench-page__message-body {
  grid-column: 1;
  grid-row: 1;
  justify-self: end;
  max-width: min(620px, 88%);
  border-radius: 12px;
  padding: 11px 14px;
  background: #eef3ff;
}

.workbench-page__message.message-user .workbench-page__message-body strong {
  display: none;
}

.workbench-page__task-progress {
  width: min(820px, 100%);
  margin: 24px auto 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--r3-color-border);
  padding: 18px 2px 0;
  color: var(--r3-color-text-secondary);
}

.workbench-page__task-outcome {
  width: min(820px, 100%);
  margin: 24px auto 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--r3-color-border);
  padding: 18px 2px 0;
  color: var(--r3-color-text-secondary);
}

.workbench-page__task-outcome > div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.workbench-page__task-outcome strong {
  color: var(--r3-color-text);
  font-size: var(--r3-font-size-sm);
}

.workbench-page__task-outcome span {
  font-size: var(--r3-font-size-xs);
}

.workbench-page__task-outcome-mark {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--r3-color-surface-muted);
  color: var(--r3-color-text-secondary);
  font-size: 8px;
}

.workbench-page__task-progress > div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.workbench-page__task-progress strong {
  color: var(--r3-color-text);
  font-size: var(--r3-font-size-sm);
}

.workbench-page__task-progress span,
.workbench-page__task-progress time {
  font-size: var(--r3-font-size-xs);
}

.workbench-page__task-progress time {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.workbench-page__task-progress-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #edf2ff;
}

.workbench-page__task-progress-indicator i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--r3-color-primary);
  animation: workbench-progress-pulse 1.2s ease-in-out infinite;
}

.workbench-page__task-progress-indicator i:nth-child(2) { animation-delay: 0.15s; }
.workbench-page__task-progress-indicator i:nth-child(3) { animation-delay: 0.3s; }

@keyframes workbench-progress-pulse {
  0%, 70%, 100% { opacity: 0.35; transform: translateY(0); }
  35% { opacity: 1; transform: translateY(-2px); }
}

.workbench-page--conversation .workbench-page__composer-card {
  flex: 0 0 auto;
  width: min(820px, calc(100% - 36px));
  margin: 0 auto 18px;
}

.workbench-page--conversation .workbench-page__composer :deep(.r3-textarea) {
  min-height: 86px;
}

.workbench-page__results-panel {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  border-left: 1px solid var(--r3-color-border);
  background: #fafbfc;
}

.workbench-page__results-panel > header {
  position: sticky;
  z-index: 2;
  top: 0;
  min-height: 62px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--r3-color-border);
  padding: 10px 14px 10px 18px;
  background: rgba(250, 251, 252, 0.96);
}

.workbench-page__results-panel > header > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.workbench-page__results-panel > header span { font-weight: 650; }
.workbench-page__results-panel > header small { color: var(--r3-color-text-tertiary); }

.workbench-page__artifact-list {
  margin: 0;
  padding: 14px;
  display: grid;
  gap: 8px;
  list-style: none;
}

.workbench-page__artifact-list li {
  min-width: 0;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--r3-color-border);
  border-radius: 8px;
  padding: 10px;
  background: var(--r3-color-surface);
}

.workbench-page__artifact-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: #edf2ff;
  color: var(--r3-color-primary);
}

.workbench-page__artifact-list li > div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.workbench-page__artifact-list strong,
.workbench-page__artifact-list small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-page__artifact-list strong { font-size: 13px; }
.workbench-page__artifact-list small { color: var(--r3-color-text-tertiary); font-size: 11px; }

@media (max-width: 980px) {
  .workbench-page--results-open .workbench-page__conversation-workspace {
    grid-template-columns: minmax(0, 1fr) minmax(260px, 310px);
  }
}

@media (max-width: 760px) {
  .workbench-page--conversation { min-height: 520px; padding: 0; }
  .workbench-page--results-open .workbench-page__conversation-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .workbench-page__results-panel {
    position: absolute;
    z-index: 15;
    inset: 62px 0 0 74px;
    border-left: 1px solid var(--r3-color-border);
    box-shadow: -12px 0 30px rgba(20, 27, 45, 0.12);
  }
  .workbench-page__conversation-stream { padding: 22px 16px 24px; }
  .workbench-page--conversation .workbench-page__composer-card {
    width: calc(100% - 24px);
    margin-bottom: 12px;
  }
}
</style>
