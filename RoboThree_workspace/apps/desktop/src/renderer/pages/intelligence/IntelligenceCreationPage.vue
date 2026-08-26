<template>
  <section class="intelligence-create" aria-label="智能资源创建">
    <R3PageHeader
      eyebrow="Intelligence Builder"
      :title="pageTitle"
      :description="pageDescription"
    >
      <template #actions>
        <R3Button variant="secondary" @click="void router.push('/intelligence')">返回智能中心</R3Button>
      </template>
    </R3PageHeader>

    <R3InlineNotice tone="warning" title="创建接入边界">
      当前页面只提供本地草稿预览和表单流程；真实保存、测试、发布和目录写入等待 Agent/Skill Feature Spec 的后续接入。
    </R3InlineNotice>

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
                @click="choosePresetAvatar(preset.id)"
              >
                {{ preset.label }}
              </button>
              <label class="intelligence-create__upload">
                上传头像
                <input type="file" accept="image/png,image/jpeg,image/webp" @change="handleAvatarUpload">
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
          />
          <R3Input
            v-model="robotDraft.tags"
            label="标签"
            placeholder="例如：文档、审阅、项目管理"
          />
          <R3Textarea
            v-model="robotDraft.intro"
            label="机器人介绍"
            placeholder="说明这个机器人适合处理的任务。"
            :rows="3"
            :error="robotErrors.intro"
          />
          <R3Textarea
            v-model="robotDraft.behaviorRules"
            label="行为与规则"
            placeholder="约束语气、边界、输出方式和禁止事项。"
            :rows="4"
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
                :aria-expanded="robotDraft.capabilities[capabilityKey].enabled"
                @click="toggleCapability(capabilityKey)"
              >
                <span>{{ robotCapabilityLabels[capabilityKey] }}</span>
                <R3Tag :tone="robotDraft.capabilities[capabilityKey].enabled ? 'success' : 'neutral'">
                  {{ robotDraft.capabilities[capabilityKey].enabled ? "已启用" : "未启用" }}
                </R3Tag>
              </button>
              <div v-if="robotDraft.capabilities[capabilityKey].enabled" class="intelligence-create__capability-body">
                <span>{{ robotDraft.capabilities[capabilityKey].selectedIds.length }} 项已保留</span>
                <R3Button variant="secondary" disabled>添加{{ robotCapabilityLabels[capabilityKey] }}</R3Button>
              </div>
            </article>
          </section>

          <div class="intelligence-create__actions">
            <R3Button variant="primary" disabled>保存草稿</R3Button>
            <R3Button variant="secondary" disabled>保存并测试</R3Button>
            <R3Button variant="secondary" disabled>提交发布</R3Button>
          </div>
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
        </dl>
      </R3Card>
    </div>

    <div v-else class="intelligence-create__layout intelligence-create__layout--single">
      <R3Card>
        <template #header>
          <div class="intelligence-create__section-title">
            <h3>{{ skillStage === 'form' ? '创建技能' : '技能创建对话' }}</h3>
            <R3Tag tone="neutral">本地预览</R3Tag>
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
            label="技能说明"
            placeholder="描述这个技能解决的问题。"
            :rows="3"
            :error="skillErrors.description"
          />
          <R3Textarea
            v-model="skillForm.capabilities"
            label="希望技能完成的任务"
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
              <h3>{{ skillConversation?.assistantName }}</h3>
              <p>根据表单内容生成技能草稿结构。</p>
            </div>
          </header>
          <article class="intelligence-create__message">
            {{ skillConversation?.firstUserMessage }}
          </article>
          <ul class="intelligence-create__files" aria-label="技能草稿文件">
            <li v-for="file in skillConversation?.draftFiles" :key="file">{{ file }}</li>
          </ul>
        </section>
      </R3Card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
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

const mode = computed(() => route.name === "intelligenceCreateSkill" ? "skill" : "robot");
const pageTitle = computed(() => mode.value === "robot" ? "创建机器人" : "创建技能");
const pageDescription = computed(() => (
  mode.value === "robot"
    ? "整理机器人身份、头像、规则和能力开关。"
    : "填写技能意图后进入技能创建对话，本批不提供测试或发布入口。"
));

const robotCapabilityKeys: readonly RobotCapabilityKey[] = ["model", "skills", "tools", "knowledge"];
const robotDraft = ref(createDefaultRobotDraft());
const robotErrors = computed(() => validateRobotDraft(robotDraft.value));
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

const skillStage = ref<"form" | "conversation">("form");
const skillForm = ref<SkillCreatorFormState>({
  name: "",
  description: "",
  capabilities: "",
  attemptStatus: "idle",
});
const skillErrors = ref<SkillCreatorValidation>({});
const skillConversation = ref<SkillCreatorConversation | undefined>(undefined);

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
  robotDraft.value = toggleRobotCapability(robotDraft.value, key);
}

function handleAvatarUpload(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file === undefined) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    robotDraft.value = setRobotAvatarUploadError(robotDraft.value, "头像仅支持 PNG、JPG 或 WebP");
    input.value = "";
    return;
  }
  if (file.size > 1024 * 1024) {
    robotDraft.value = setRobotAvatarUploadError(robotDraft.value, "头像不能超过 1 MiB");
    input.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") {
      robotDraft.value = setUploadedAvatarPreview(robotDraft.value, file.name, reader.result);
    }
  };
  reader.onerror = () => {
    robotDraft.value = setRobotAvatarUploadError(robotDraft.value, "头像预览生成失败");
  };
  reader.readAsDataURL(file);
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
.intelligence-create,
.intelligence-create__form,
.intelligence-create__conversation {
  display: grid;
  gap: 18px;
}

.intelligence-create__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 16px;
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
  padding: 12px;
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
</style>
