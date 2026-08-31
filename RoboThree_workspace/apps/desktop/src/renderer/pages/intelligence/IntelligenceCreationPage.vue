<template>
  <section class="intelligence-create" aria-label="智能资源创建">
    <R3PageHeader
      eyebrow="智能中心"
      :title="pageTitle"
      :description="pageDescription"
    >
      <template #actions>
        <R3Button variant="secondary" @click="void router.push('/intelligence')">返回智能中心</R3Button>
      </template>
    </R3PageHeader>

    <R3InlineNotice v-if="mode === 'skill'" tone="warning" title="当前仅可预览">
      技能创建服务尚未接入；这里填写的内容不会被保存或发布。
    </R3InlineNotice>
    <div v-else class="intelligence-create__service-state">
      <R3InlineNotice
        :tone="lifecycleAvailability === 'unavailable' || lifecycleError ? 'danger' : 'info'"
        :title="lifecycleAvailability === 'checking'
          ? '正在连接机器人服务'
          : lifecycleAvailability === 'unavailable'
            ? '机器人生命周期服务不可用'
            : lifecycleError ? '操作未完成' : '个人机器人草稿'"
      >
        {{ lifecycleAvailability === "checking"
          ? "正在通过真实 Central 服务检查草稿能力。"
          : lifecycleAvailability === "unavailable"
            ? `${lifecycleError || "当前没有连接到机器人生命周期服务。"} 不会使用本地假数据代替。`
            : lifecycleError || lifecycleNotice || "草稿会保存到 Central；只有当前保存版本通过真实任务测试后才能提交审核。" }}
      </R3InlineNotice>
      <R3Button
        v-if="lifecycleAvailability === 'unavailable'"
        variant="secondary"
        :loading="lifecycleBusy"
        @click="void reconnectLifecycleService()"
      >重新连接</R3Button>
    </div>

    <div v-if="mode === 'robot'" class="intelligence-create__layout">
      <R3Card>
        <template #header>
          <div class="intelligence-create__section-title">
            <h3>机器人基础信息</h3>
            <R3Tag tone="neutral">本地草稿</R3Tag>
          </div>
        </template>

        <form class="intelligence-create__form" @submit.prevent>
          <section class="intelligence-create__avatar" aria-label="机器人头像">
            <div class="intelligence-create__avatar-preview">
              <span
                class="intelligence-create__avatar-circle"
                :style="avatarStyle"
                aria-hidden="true"
              >
                <span v-if="robotDraft.avatar.previewUrl === undefined">{{ robotDraft.avatar.label }}</span>
              </span>
              <button
                v-if="robotDraft.avatar.source === 'upload'"
                class="intelligence-create__avatar-remove"
                type="button"
                aria-label="移除上传头像"
                @click="removeUploadedAvatar"
              >
                x
              </button>
            </div>
            <div class="intelligence-create__avatar-controls">
              <button
                class="intelligence-create__avatar-option"
                type="button"
                :aria-pressed="robotDraft.avatar.source === 'system'"
                :disabled="!canEditDraft"
                @click="resetSystemAvatar"
              >
                默认
              </button>
              <button
                v-for="preset in robotAvatarPresets"
                :key="preset.id"
                class="intelligence-create__avatar-option"
                  type="button"
                  :aria-pressed="robotDraft.avatar.source === 'preset' && robotDraft.avatar.label === preset.label"
                  :disabled="!canEditDraft"
                @click="choosePresetAvatar(preset.id)"
              >
                {{ preset.label }}
              </button>
              <label class="intelligence-create__upload">
                上传头像
                <input type="file" accept="image/png,image/jpeg" :disabled="!canEditDraft" @change="handleAvatarUpload">
              </label>
              <span v-if="robotDraft.uploadError" class="intelligence-create__error">
                {{ robotDraft.uploadError }}
              </span>
            </div>
          </section>

          <R3Input
            v-model="robotDraft.name"
            label="机器人名称"
            placeholder="例如：合同审阅助手"
            :error="robotErrors.name"
            :disabled="!canEditDraft"
            @focusout="robotTouched.name = true"
          />
          <R3Input
            v-model="robotDraft.tags"
            label="标签"
            placeholder="例如：文档、审阅、项目管理"
            :disabled="!canEditDraft"
          />
          <R3Textarea
            v-model="robotDraft.intro"
            label="简介"
            placeholder="说明这个机器人适合处理的任务。"
            :rows="3"
            :error="robotErrors.intro"
            :disabled="!canEditDraft"
            @focusout="robotTouched.intro = true"
          />
          <R3Textarea
            v-model="robotDraft.behaviorRules"
            label="行为与规则"
            placeholder="约束语气、边界、输出方式和禁止事项。"
            :rows="4"
            :disabled="!canEditDraft"
          />

          <section class="intelligence-create__capabilities" aria-label="机器人能力">
            <article
              v-for="capabilityKey in robotCapabilityKeys"
              :key="capabilityKey"
              class="intelligence-create__capability"
            >
              <button
                class="intelligence-create__capability-toggle"
                type="button"
                role="switch"
                :aria-checked="robotDraft.capabilities[capabilityKey].enabled"
                :aria-label="`${robotCapabilityLabels[capabilityKey]}限制开关`"
                :disabled="!canEditDraft"
                @click="toggleCapability(capabilityKey)"
              >
                <span>{{ robotCapabilityLabels[capabilityKey] }}</span>
                <R3Tag :tone="robotDraft.capabilities[capabilityKey].enabled ? 'success' : 'neutral'">
                  {{ robotDraft.capabilities[capabilityKey].enabled ? "已启用" : "未启用" }}
                </R3Tag>
              </button>
              <div v-if="robotDraft.capabilities[capabilityKey].enabled" class="intelligence-create__capability-body">
                <template v-if="capabilityKey === 'model'">
                  <span v-if="modelOptions.length === 0">当前没有可用模型。</span>
                  <label
                    v-for="model in modelOptions"
                    :key="model.modelId"
                    class="intelligence-create__model-option"
                  >
                    <input
                      type="checkbox"
                      :checked="robotDraft.capabilities.model.selectedIds.includes(model.modelId)"
                      :disabled="lifecycleBusy || !canEditDraft"
                      @change="toggleModelSelection(model.modelId)"
                    >
                    <span>{{ model.name }}</span>
                  </label>
                </template>
                <template v-else>
                  <span>
                    {{ robotDraft.capabilities[capabilityKey].selectedIds.length === 0
                      ? "尚未选择（0 项）"
                      : `${robotDraft.capabilities[capabilityKey].selectedIds.length} 项已选择` }}
                  </span>
                  <span v-if="capabilityKey === 'skills'" class="intelligence-create__capability-note">
                    本地技能只用于个人测试，不会自动进入企业发布包。
                  </span>
                  <R3Button variant="secondary" disabled>添加{{ robotCapabilityLabels[capabilityKey] }}</R3Button>
                </template>
              </div>
            </article>
          </section>

          <div class="intelligence-create__actions">
            <R3Button variant="primary" :disabled="lifecycleBusy || !canEditDraft" @click="saveRobotDraft()">保存草稿</R3Button>
            <R3Button variant="secondary" :disabled="testDisabled" @click="startRobotTest()">运行测试</R3Button>
            <R3Button variant="secondary" :disabled="submitDisabled" @click="submitRobotDraft()">提交发布</R3Button>
            <R3Button v-if="savedDraft" variant="secondary" :disabled="lifecycleBusy" @click="refreshRobotDraft()">刷新状态</R3Button>
            <R3Button v-if="savedDraft?.submissionState === 'pending_review'" variant="secondary" disabled>撤回提交</R3Button>
          </div>
          <R3InlineNotice v-if="modelRestrictionBlocked" tone="warning" title="模型范围为空">
            已启用模型限制但没有可用模型。请关闭该限制后再运行测试或提交发布。
          </R3InlineNotice>
          <R3InlineNotice v-if="knowledgePublicationBlocked" tone="warning" title="知识资源暂不支持发布">
            当前版本不能提交带知识资源的个人机器人，请清空知识范围后再测试或提交。
          </R3InlineNotice>
          <R3InlineNotice v-if="localSkillPublicationBlocked" tone="warning" title="本地技能仅用于个人测试">
            当前选择的本地技能不会自动进入企业发布包。提交发布前请清空本地技能范围。
          </R3InlineNotice>
          <R3InlineNotice v-if="savedDraft?.submissionState === 'pending_review'" tone="neutral" title="撤回暂不可用">
            当前接口未返回撤回所需的提交标识；不会在前端猜测或伪造该标识。
          </R3InlineNotice>
        </form>
      </R3Card>

      <R3Card>
        <template #header>
          <h3>草稿预览</h3>
        </template>
        <dl class="intelligence-create__preview">
          <div>
            <dt>名称</dt>
            <dd>{{ robotDraft.name || "未命名机器人" }}</dd>
          </div>
          <div>
            <dt>标签</dt>
            <dd>{{ robotDraft.tags || "未填写" }}</dd>
          </div>
          <div>
            <dt>启用能力</dt>
            <dd>{{ enabledCapabilitySummary }}</dd>
          </div>
          <div><dt>保存状态</dt><dd>{{ savedDraft === undefined ? "尚未保存" : robotDraftDirty ? "有未保存修改" : "已保存" }}</dd></div>
          <div v-if="savedDraft"><dt>测试状态</dt><dd>{{ testStatus.label }}</dd></div>
          <div v-if="submissionStatus"><dt>审核状态</dt><dd>{{ submissionStatus.label }}</dd></div>
          <div v-if="savedDraft?.testFact?.safeReason"><dt>测试结果</dt><dd>{{ savedDraft.testFact.safeReason }}</dd></div>
          <div v-if="savedDraft?.rejectionReason"><dt>驳回原因</dt><dd>{{ savedDraft.rejectionReason }}</dd></div>
        </dl>
        <R3Textarea v-model="testInput" label="测试任务" placeholder="输入一条真实任务，用于验证当前保存版本。" :rows="4" />
        <R3Input v-model="semanticVersion" label="发布版本" placeholder="例如：1.0.0" />
        <R3Textarea v-model="changeSummary" label="变更说明" placeholder="说明这个版本解决了什么问题。" :rows="3" />
        <R3Button
          v-if="savedDraft?.submissionState === 'approved'"
          variant="secondary"
          @click="void router.push({ path: '/intelligence', query: { section: 'robots' } })"
        >刷新企业机器人目录</R3Button>
      </R3Card>
    </div>

    <div v-else class="intelligence-create__layout intelligence-create__layout--single">
      <R3Card>
        <template #header>
          <div class="intelligence-create__section-title">
            <h3>{{ skillStage === 'form' ? '创建技能' : '技能创建对话' }}</h3>
            <R3Tag tone="neutral">尚未保存</R3Tag>
          </div>
        </template>

        <form v-if="skillStage === 'form'" class="intelligence-create__form" @submit.prevent="startSkillConversation()">
          <R3Input
            v-model="skillForm.name"
            label="技能名称"
            placeholder="例如：周报整理技能"
            :error="skillErrors.name"
          />
          <R3Textarea
            v-model="skillForm.description"
            label="描述"
            placeholder="描述这个技能解决的问题。"
            :rows="3"
            :error="skillErrors.description"
          />
          <R3Textarea
            v-model="skillForm.capabilities"
            label="技能主要功能"
            placeholder="写下输入、处理步骤和输出结果。"
            :rows="4"
            :error="skillErrors.capabilities"
          />

          <R3InlineNotice v-if="skillForm.attemptStatus === 'failed'" tone="danger" title="创建会话失败">
            创建技能对话未能启动。点击重试会重新发起本次创建尝试。
          </R3InlineNotice>

          <div class="intelligence-create__actions">
            <R3Button variant="primary" @click="startSkillConversation()">进入创建对话</R3Button>
            <R3Button
              v-if="skillForm.attemptStatus === 'failed'"
              variant="secondary"
              @click="startSkillConversation()"
            >
              重试
            </R3Button>
          </div>
        </form>

        <section v-else class="intelligence-create__conversation" aria-label="技能创建对话">
          <header>
            <span class="intelligence-create__assistant" aria-hidden="true">S</span>
            <div>
              <h3>技能创建对话尚未接入</h3>
              <p>真实对话服务可用后，才会根据你的需求生成技能草稿。</p>
            </div>
          </header>
          <article class="intelligence-create__message">
            {{ skillConversation?.firstUserMessage }}
          </article>
          <R3InlineNotice tone="warning" title="暂不可继续">
            当前不会生成文件、保存草稿或提交发布。
          </R3InlineNotice>
        </section>
      </R3Card>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ModelProjection } from "@robothree/contracts";
import type { RobotDraftDetail, RobotDraftMaterial } from "@robothree/contracts/agent-lifecycle/v1alpha1";
import { computed, inject, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import {
  R3Button,
  R3Card,
  R3InlineNotice,
  R3Input,
  R3PageHeader,
  R3Tag,
  R3Textarea,
} from "../../components/ui";
import {
  agentLifecycleAdapterKey,
  AgentLifecycleAdapterError,
  desktopAgentLifecycleAdapter,
} from "../../adapters/agent-lifecycle-adapter.js";
import {
  desktopWorkbenchAdapter,
  workbenchAdapterKey,
} from "../../adapters/workbench-adapter.js";
import {
  presentAgentLifecycleError,
  presentRobotSubmissionState,
  presentRobotTestState,
} from "../../presentation/agent-lifecycle-presentation.js";
import {
  buildSkillCreatorConversation,
  clearUploadedAvatar,
  createDefaultRobotDraft,
  hasValidationErrors,
  robotAvatarPresets,
  robotCapabilityLabels,
  selectPresetAvatar,
  selectSystemAvatar,
  setRobotAvatarUploadError,
  setUploadedAvatarPreview,
  toggleRobotCapability,
  validateRobotDraft,
  validateSkillCreatorForm,
  type RobotCapabilityKey,
  type SkillCreatorConversation,
  type SkillCreatorFormState,
  type SkillCreatorValidation,
} from "./intelligence-creation-model.js";

const route = useRoute();
const router = useRouter();
const lifecycleAdapter = inject(agentLifecycleAdapterKey, desktopAgentLifecycleAdapter);
const workbenchAdapter = inject(workbenchAdapterKey, desktopWorkbenchAdapter);

const mode = computed(() => route.name === "intelligenceCreateSkill" ? "skill" : "robot");
const pageTitle = computed(() => mode.value === "robot" ? "创建机器人" : "创建技能");
const pageDescription = computed(() => (
  mode.value === "robot"
    ? "整理机器人身份、头像、规则和能力开关。"
    : "填写技能意图后进入技能创建对话，本批不提供测试或发布入口。"
));

const robotCapabilityKeys: readonly RobotCapabilityKey[] = ["model", "skills", "tools", "knowledge"];
const robotDraft = ref(createDefaultRobotDraft());
const savedDraft = ref<RobotDraftDetail>();
const availableModels = ref<ModelProjection[]>([]);
const lifecycleBusy = ref(false);
const lifecycleAvailability = ref<"checking" | "available" | "unavailable">("checking");
const lifecycleNotice = ref("");
const lifecycleError = ref("");
const testInput = ref("请根据你的行为规则，简要说明你会如何帮助我完成一项工作任务。");
const semanticVersion = ref("1.0.0");
const changeSummary = ref("首次提交企业发布审核");
const robotTouched = reactive({ name: false, intro: false });
const robotErrors = computed(() => {
  const errors = validateRobotDraft(robotDraft.value);
  return {
    name: robotTouched.name ? errors.name : undefined,
    intro: robotTouched.intro ? errors.intro : undefined,
  };
});
const avatarStyle = computed(() => {
  if (robotDraft.value.avatar.previewUrl === undefined) return undefined;
  return {
    backgroundImage: `url("${robotDraft.value.avatar.previewUrl}")`,
  };
});
const enabledCapabilitySummary = computed(() => {
  const enabled = robotCapabilityKeys
    .filter((key) => robotDraft.value.capabilities[key].enabled)
    .map((key) => robotCapabilityLabels[key]);
  return enabled.length === 0 ? "未启用" : enabled.join("、");
});
const modelRestrictionBlocked = computed(() => robotDraft.value.capabilities.model.enabled
  && robotDraft.value.capabilities.model.selectedIds.length === 0);
const knowledgePublicationBlocked = computed(() => robotDraft.value.capabilities.knowledge.enabled
  && robotDraft.value.capabilities.knowledge.selectedIds.length > 0);
const localSkillPublicationBlocked = computed(() => robotDraft.value.capabilities.skills.enabled
  && robotDraft.value.capabilities.skills.selectedIds.length > 0);
const canEditDraft = computed(() => lifecycleAvailability.value === "available"
  && savedDraft.value?.submissionState !== "pending_review"
  && savedDraft.value?.submissionState !== "approved");
const modelOptions = computed(() => {
  const byId = new Map(availableModels.value
    .filter((model) => model.available)
    .map((model) => [model.modelId, model]));
  for (const reference of savedDraft.value?.material.modelRestriction.selectedReferences ?? []) {
    if (!byId.has(reference.modelId)) {
      byId.set(reference.modelId, {
        modelId: reference.modelId,
        revision: reference.revision,
        name: reference.modelId,
        source: "official",
        capabilities: [],
        available: false,
        unavailableReason: "当前目录未返回该模型",
      });
    }
  }
  return [...byId.values()];
});
const robotDraftDirty = computed(() => {
  const saved = savedDraft.value;
  if (saved === undefined) return false;
  const material = saved.material;
  return robotDraft.value.name.trim() !== material.name
    || robotDraft.value.intro.trim() !== (material.description ?? "")
    || robotDraft.value.behaviorRules.trim() !== (material.behaviorRules ?? "")
    || robotDraft.value.tags.split(/[，,]/u).map((tag) => tag.trim()).filter(Boolean).slice(0, 12).join("\u0000") !== material.tags.join("\u0000")
    || capabilityChanged("model", material.modelRestriction.enabled, material.modelRestriction.selectedReferences.map((item) => item.modelId))
    || capabilityChanged("skills", material.skillRestriction.enabled, material.skillRestriction.selectedReferences.map((item) => item.skillId))
    || capabilityChanged("tools", material.toolRestriction.enabled, material.toolRestriction.selectedReferences.map((item) => item.capabilityId))
    || capabilityChanged("knowledge", material.knowledgeRestriction.enabled, material.knowledgeRestriction.selectedReferences.map((item) => item.knowledgeId));
});
const testStatus = computed(() => presentRobotTestState(savedDraft.value?.testState ?? "untested"));
const submissionStatus = computed(() => presentRobotSubmissionState(savedDraft.value?.submissionState));
const currentRevisionTestPassed = computed(() => savedDraft.value?.testFact?.state === "passed"
  && savedDraft.value.testFact.draftRevision === savedDraft.value.draftRevision);
const testDisabled = computed(() => lifecycleBusy.value || savedDraft.value === undefined
  || robotDraftDirty.value || modelRestrictionBlocked.value
  || knowledgePublicationBlocked.value || !canEditDraft.value);
const submitDisabled = computed(() => testDisabled.value || !currentRevisionTestPassed.value
  || localSkillPublicationBlocked.value
  || semanticVersion.value.trim() === "" || changeSummary.value.trim() === "");

const skillStage = ref<"form" | "conversation">("form");
const skillForm = ref<SkillCreatorFormState>({
  name: "",
  description: "",
  capabilities: "",
  attemptStatus: "idle",
});
const skillErrors = ref<SkillCreatorValidation>({});
const skillConversation = ref<SkillCreatorConversation | undefined>(undefined);

onMounted(async () => {
  if (mode.value !== "robot") return;
  void loadModelOptions();
  const connected = await checkLifecycleService();
  if (connected && typeof route.query.robotId === "string") {
    await loadRobotDraft(route.query.robotId);
  }
});

async function checkLifecycleService(): Promise<boolean> {
  lifecycleAvailability.value = "checking";
  lifecycleError.value = "";
  try {
    await lifecycleAdapter.listDrafts();
    lifecycleAvailability.value = "available";
    return true;
  } catch (caught) {
    lifecycleAvailability.value = "unavailable";
    lifecycleError.value = caught instanceof AgentLifecycleAdapterError
      ? presentAgentLifecycleError(caught.code, caught.message)
      : "机器人生命周期服务暂时不可用，请重新连接。";
    return false;
  }
}

async function reconnectLifecycleService(): Promise<void> {
  if (lifecycleBusy.value) return;
  lifecycleBusy.value = true;
  let connected = false;
  try {
    connected = await checkLifecycleService();
  } finally {
    lifecycleBusy.value = false;
  }
  if (connected && typeof route.query.robotId === "string") {
    await loadRobotDraft(route.query.robotId);
  } else if (connected) {
    lifecycleNotice.value = "机器人生命周期服务已重新连接。";
  }
}

async function loadModelOptions(): Promise<void> {
  try {
    const data = await workbenchAdapter.loadWorkbenchData();
    availableModels.value = [...data.models];
  } catch {
    availableModels.value = [];
  }
}

async function loadRobotDraft(robotId: string): Promise<void> {
  await runLifecycle(async () => {
    const detail = await lifecycleAdapter.getDraft(robotId);
    applyRobotDetail(detail);
    lifecycleNotice.value = "已加载当前草稿。";
  });
}

function applyRobotDetail(detail: RobotDraftDetail): void {
  savedDraft.value = detail;
  const material = detail.material;
  const avatar = material.avatar.source === "system" ? { source: "system" as const, label: "默认" }
    : material.avatar.source === "preset" ? { source: "preset" as const, label: robotAvatarPresets.find((item) => `robot-avatar.${item.id}` === material.avatar.assetId)?.label ?? "N" }
      : { source: "upload" as const, label: "U" };
  robotDraft.value = {
    avatar, name: material.name, tags: material.tags.join("、"), intro: material.description ?? "",
    behaviorRules: material.behaviorRules ?? "", uploadError: "",
    capabilities: {
      model: { enabled: material.modelRestriction.enabled, selectedIds: material.modelRestriction.selectedReferences.map((item) => item.modelId) },
      skills: { enabled: material.skillRestriction.enabled, selectedIds: material.skillRestriction.selectedReferences.map((item) => item.skillId) },
      tools: { enabled: material.toolRestriction.enabled, selectedIds: material.toolRestriction.selectedReferences.map((item) => item.capabilityId) },
      knowledge: { enabled: material.knowledgeRestriction.enabled, selectedIds: material.knowledgeRestriction.selectedReferences.map((item) => item.knowledgeId) },
    },
  };
}

function choosePresetAvatar(presetId: string): void {
  robotDraft.value = selectPresetAvatar(robotDraft.value, presetId);
}

function resetSystemAvatar(): void {
  robotDraft.value = selectSystemAvatar(robotDraft.value);
}

function removeUploadedAvatar(): void {
  robotDraft.value = clearUploadedAvatar(robotDraft.value);
}

function toggleCapability(key: RobotCapabilityKey): void {
  if (!canEditDraft.value) return;
  robotDraft.value = toggleRobotCapability(robotDraft.value, key);
}

function toggleModelSelection(modelId: string): void {
  if (!canEditDraft.value) return;
  const selected = new Set(robotDraft.value.capabilities.model.selectedIds);
  if (selected.has(modelId)) selected.delete(modelId);
  else selected.add(modelId);
  robotDraft.value = {
    ...robotDraft.value,
    capabilities: {
      ...robotDraft.value.capabilities,
      model: {
        ...robotDraft.value.capabilities.model,
        selectedIds: [...selected],
      },
    },
  };
}

function handleAvatarUpload(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file === undefined) return;
  if (!["image/png", "image/jpeg"].includes(file.type)) {
    robotDraft.value = setRobotAvatarUploadError(robotDraft.value, "头像仅支持 PNG 或 JPG");
    input.value = "";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    robotDraft.value = setRobotAvatarUploadError(robotDraft.value, "头像不能超过 2 MiB");
    input.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") {
      robotDraft.value = setUploadedAvatarPreview(robotDraft.value, file.name, reader.result, file.type as "image/png" | "image/jpeg");
    }
  };
  reader.onerror = () => {
    robotDraft.value = setRobotAvatarUploadError(robotDraft.value, "头像预览生成失败");
  };
  reader.readAsDataURL(file);
}

function robotMaterial(): RobotDraftMaterial {
  const preset = robotAvatarPresets.find((candidate) => candidate.label === robotDraft.value.avatar.label);
  const savedUploaded = savedDraft.value?.material.avatar.source === "uploaded" ? savedDraft.value.material.avatar : undefined;
  const avatar = robotDraft.value.avatar.source === "preset"
    ? { source: "preset" as const, assetId: `robot-avatar.${preset?.id ?? "navigator"}` }
    : robotDraft.value.avatar.source === "upload" && robotDraft.value.avatar.contentBase64 === undefined && savedUploaded !== undefined
      ? savedUploaded
      : { source: "system" as const, assetId: "robot-avatar.default" as const };
  const saved = savedDraft.value?.material;
  const modelReferences = robotDraft.value.capabilities.model.selectedIds.flatMap((modelId) => {
    const savedReference = saved?.modelRestriction.selectedReferences.find((item) => item.modelId === modelId);
    if (savedReference !== undefined) return [{ ...savedReference }];
    const model = availableModels.value.find((item) => item.modelId === modelId);
    return model === undefined ? [] : [{
      modelId: model.modelId,
      revision: model.revision,
      digest: model.revision,
    }];
  });
  return {
    robotId: savedDraft.value?.robotId ?? `agent.personal-${crypto.randomUUID().replaceAll("-", "")}`,
    name: robotDraft.value.name.trim(),
    ...(robotDraft.value.intro.trim() === "" ? {} : { description: robotDraft.value.intro.trim() }),
    ...(robotDraft.value.behaviorRules.trim() === "" ? {} : { behaviorRules: robotDraft.value.behaviorRules.trim() }),
    avatar,
    tags: robotDraft.value.tags.split(/[，,]/u).map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
    modelRestriction: { enabled: robotDraft.value.capabilities.model.enabled, selectedReferences: modelReferences },
    skillRestriction: { enabled: robotDraft.value.capabilities.skills.enabled, selectedReferences: saved?.skillRestriction.selectedReferences.map((reference) => ({ ...reference })) ?? [] },
    toolRestriction: { enabled: robotDraft.value.capabilities.tools.enabled, selectedReferences: saved?.toolRestriction.selectedReferences.map((reference) => ({ ...reference })) ?? [] },
    knowledgeRestriction: { enabled: robotDraft.value.capabilities.knowledge.enabled, selectedReferences: saved?.knowledgeRestriction.selectedReferences.map((reference) => ({ ...reference })) ?? [] },
  };
}

function capabilityChanged(key: RobotCapabilityKey, enabled: boolean, selectedIds: readonly string[]): boolean {
  const current = robotDraft.value.capabilities[key];
  return current.enabled !== enabled || current.selectedIds.join("\u0000") !== selectedIds.join("\u0000");
}

async function saveRobotDraft(): Promise<RobotDraftDetail | undefined> {
  robotTouched.name = true;
  robotTouched.intro = true;
  if (!canEditDraft.value || hasValidationErrors(validateRobotDraft(robotDraft.value))) return undefined;
  return runLifecycle(async () => {
    const material = robotMaterial();
    const avatarUpload = robotDraft.value.avatar.source === "upload" && robotDraft.value.avatar.contentBase64 && robotDraft.value.avatar.mediaType
      ? { mediaType: robotDraft.value.avatar.mediaType, contentBase64: robotDraft.value.avatar.contentBase64 }
      : undefined;
    if (savedDraft.value === undefined) {
      await lifecycleAdapter.createDraft({ material, ...(avatarUpload ? { avatarUpload } : {}) });
    } else {
      await lifecycleAdapter.updateDraft({
        robotId: savedDraft.value.robotId,
        expectedDraftRevision: savedDraft.value.draftRevision,
        material,
        ...(avatarUpload ? { avatarUpload } : {}),
      });
    }
    const detail = await lifecycleAdapter.getDraft(material.robotId);
    applyRobotDetail(detail);
    if (robotDraft.value.avatar.source === "upload") robotDraft.value.avatar.contentBase64 = undefined;
    lifecycleNotice.value = "草稿已保存。";
    await router.replace({ path: "/intelligence/create-robot", query: { robotId: material.robotId } });
    return detail;
  });
}

async function startRobotTest(): Promise<void> {
  robotTouched.intro = true;
  if (!robotDraft.value.intro.trim() || !robotDraft.value.behaviorRules.trim() || !testInput.value.trim()) {
    lifecycleError.value = "运行测试前请补充简介、行为与规则和测试任务。"; return;
  }
  const draft = savedDraft.value;
  if (draft === undefined || robotDraftDirty.value) {
    lifecycleError.value = "请先保存当前修改，再运行测试。";
    return;
  }
  await runLifecycle(async () => {
    await lifecycleAdapter.startTest({
      robotId: draft.robotId,
      expectedDraftRevision: draft.draftRevision,
      testInput: testInput.value.trim(),
    });
    applyRobotDetail(await lifecycleAdapter.getDraft(draft.robotId));
    lifecycleNotice.value = "真实测试已启动。请使用“刷新状态”查看安全结果。";
  });
}

async function submitRobotDraft(): Promise<void> {
  const draft = savedDraft.value;
  if (draft === undefined || submitDisabled.value) return;
  await runLifecycle(async () => {
    await lifecycleAdapter.submitDraft({
      robotId: draft.robotId,
      expectedDraftRevision: draft.draftRevision,
      semanticVersion: semanticVersion.value.trim(),
      changeSummary: changeSummary.value.trim(),
    });
    applyRobotDetail(await lifecycleAdapter.getDraft(draft.robotId));
    lifecycleNotice.value = "已提交企业发布审核。";
  });
}

async function refreshRobotDraft(): Promise<void> {
  const robotId = savedDraft.value?.robotId;
  if (robotId === undefined) return;
  await runLifecycle(async () => {
    applyRobotDetail(await lifecycleAdapter.getDraft(robotId));
    lifecycleNotice.value = "状态已刷新。";
  });
}

async function runLifecycle<T>(operation: () => Promise<T>): Promise<T | undefined> {
  if (lifecycleBusy.value) return undefined;
  lifecycleBusy.value = true;
  lifecycleError.value = "";
  try {
    return await operation();
  } catch (caught) {
    if (caught instanceof AgentLifecycleAdapterError) {
      lifecycleError.value = presentAgentLifecycleError(caught.code, caught.message);
      if (caught.code === "agentlifecycle.service_unavailable"
        || caught.code === "agentlifecycle.unauthorized") {
        lifecycleAvailability.value = "unavailable";
      }
      if ((caught.code === "agentlifecycle.revision_conflict"
        || caught.code === "agentlifecycle.submission_conflict")
        && savedDraft.value !== undefined) {
        try {
          applyRobotDetail(await lifecycleAdapter.getDraft(savedDraft.value.robotId));
        } catch {
          // Keep the original conflict message; no mutation is retried.
        }
      }
    } else {
      lifecycleError.value = "机器人操作暂不可用，请稍后重试。";
    }
    return undefined;
  } finally {
    lifecycleBusy.value = false;
  }
}

function startSkillConversation(): void {
  const errors = validateSkillCreatorForm(skillForm.value);
  skillErrors.value = errors;
  if (hasValidationErrors(errors)) return;
  skillForm.value = {
    ...skillForm.value,
    attemptStatus: "idle",
  };
  skillConversation.value = buildSkillCreatorConversation(skillForm.value);
  skillStage.value = "conversation";
}

function previewSkillCreateFailure(): void {
  skillForm.value = {
    ...skillForm.value,
    attemptStatus: "failed",
  };
  skillStage.value = "form";
}

defineExpose({
  previewSkillCreateFailure,
});
</script>

<style scoped>
.intelligence-create__service-state {
  display: flex;
  gap: var(--r3-space-3);
  align-items: center;
}

.intelligence-create__service-state .r3-inline-notice {
  flex: 1;
}

.intelligence-create,
.intelligence-create__form,
.intelligence-create__conversation {
  display: grid;
  gap: 14px;
}

.intelligence-create {
  align-content: start;
  width: min(100%, 1080px);
  margin: 0 auto;
  padding: 24px;
}

.intelligence-create__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 12px;
  align-items: start;
}

.intelligence-create__layout--single {
  grid-template-columns: minmax(0, 760px);
}

.intelligence-create__section-title,
.intelligence-create__actions,
.intelligence-create__capability-toggle,
.intelligence-create__capability-body {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.intelligence-create__model-option {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  color: var(--r3-color-text);
}

.intelligence-create__capability-note {
  max-width: 320px;
  font-size: var(--r3-font-size-sm);
}

.intelligence-create__section-title h3,
.intelligence-create__conversation h3 {
  margin: 0;
}

.intelligence-create__avatar {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
}

.intelligence-create__avatar-preview {
  position: relative;
  width: 72px;
  height: 72px;
}

.intelligence-create__avatar-circle {
  width: 72px;
  height: 72px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--r3-color-primary-subtle);
  background-position: center;
  background-size: cover;
  color: var(--r3-color-primary);
  font-size: var(--r3-font-size-xl);
  font-weight: 750;
}

.intelligence-create__avatar-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 24px;
  height: 24px;
  border: 1px solid var(--r3-color-border-strong);
  border-radius: 50%;
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
  cursor: pointer;
}

.intelligence-create__avatar-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.intelligence-create__avatar-option,
.intelligence-create__upload {
  min-height: 32px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
  cursor: pointer;
}

.intelligence-create__avatar-option[aria-pressed="true"] {
  border-color: var(--r3-color-primary);
  color: var(--r3-color-primary);
}

.intelligence-create__upload input {
  width: 1px;
  height: 1px;
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.intelligence-create__error {
  color: var(--r3-color-danger);
  font-size: var(--r3-font-size-sm);
}

.intelligence-create__capabilities,
.intelligence-create__preview,
.intelligence-create__files {
  display: grid;
  gap: 10px;
}

.intelligence-create__capability {
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  background: var(--r3-color-surface);
}

.intelligence-create__capability-toggle {
  width: 100%;
  border: 0;
  padding: 10px 12px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.intelligence-create__capability-body {
  border-top: 1px solid var(--r3-color-border);
  padding: 12px;
  color: var(--r3-color-text-secondary);
}

.intelligence-create__preview {
  margin: 0;
}

.intelligence-create__preview div {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 10px;
}

.intelligence-create__preview dt,
.intelligence-create__preview dd {
  margin: 0;
}

.intelligence-create__preview dt,
.intelligence-create__conversation p {
  color: var(--r3-color-text-secondary);
}

.intelligence-create__conversation header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.intelligence-create__assistant {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r3-radius-md);
  background: var(--r3-color-primary-subtle);
  color: var(--r3-color-primary);
  font-weight: 750;
}

.intelligence-create__message {
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 12px;
  background: var(--r3-color-surface);
}

.intelligence-create__files {
  margin: 0;
  padding-left: 18px;
}

@media (max-width: 980px) {
  .intelligence-create__layout,
  .intelligence-create__avatar {
    grid-template-columns: 1fr;
  }
}


@media (max-width: 720px) {
  .intelligence-create {
    padding: 18px 14px;
  }
}
</style>
