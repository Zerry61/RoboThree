<template>
  <div class="feedback-form">
    <R3InlineNotice tone="warning" title="反馈接收系统尚未接入">
      当前无法发送反馈或上传截图。以下字段仅用于展示未来反馈流程。
    </R3InlineNotice>
    <R3Card>
      <div class="feedback-form__fields">
        <R3Textarea
          v-model="description"
          label="问题描述（必填）"
          placeholder="发生了什么？你期望的结果是什么？"
          :rows="7"
          :disabled="!fixtureMode"
        />
        <div class="feedback-form__attachment">
          <strong>截图（可选）</strong>
          <span>请确认截图中不包含密码、API Key 等敏感信息。</span>
          <input v-if="fixtureMode" type="file" accept="image/png,image/jpeg" aria-label="选择反馈截图">
          <R3Button v-else variant="secondary" disabled>添加截图</R3Button>
        </div>
        <div class="feedback-form__actions">
          <span>提交能力开放后才能发送。</span>
          <R3Button variant="primary" :disabled="!fixtureMode">提交反馈</R3Button>
        </div>
      </div>
    </R3Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { R3Button, R3Card, R3InlineNotice, R3Textarea } from "../../components/ui";
withDefaults(defineProps<{ fixtureMode?: boolean }>(), { fixtureMode: false });
const description = ref("");
</script>

<style scoped>
.feedback-form, .feedback-form__fields, .feedback-form__attachment { display: grid; gap: 12px; }
.feedback-form__attachment strong { font-size: var(--r3-font-size-sm); }
.feedback-form__attachment span, .feedback-form__actions span { color: var(--r3-color-text-secondary); font-size: var(--r3-font-size-sm); }
.feedback-form__attachment :deep(.r3-button) { justify-self: start; }
.feedback-form__actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-top: 1px solid var(--r3-color-border); padding-top: 14px; }
@media (max-width: 760px) { .feedback-form__actions { align-items: stretch; flex-direction: column; } }
</style>

