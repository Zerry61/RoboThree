<template>
  <div class="personalization-form">
    <R3InlineNotice :tone="editable ? 'info' : 'warning'" title="当前能力范围">
      {{ editable
        ? "当前更改只用于本页预览，离开页面后清除，不会影响任务回复。"
        : "个性化能力尚未接入，当前页面仅展示字段结构。" }}
    </R3InlineNotice>

    <R3Card>
      <template #header>
        <div class="personalization-form__header">
          <div><h2>自定义指令</h2><p>描述你偏好的输出方式和日常工作习惯。</p></div>
          <R3Button v-if="editable && !editing" variant="secondary" @click="startEditing">编辑</R3Button>
        </div>
      </template>

      <div v-if="editing" class="personalization-form__fields">
        <R3Textarea v-model="draftOutput" label="输出偏好" placeholder="例如：回答尽量简洁，重要结论放在最前面" :rows="4" />
        <R3Textarea v-model="draftHabit" label="工作习惯" placeholder="例如：我通常在周五整理本周工作进展" :rows="4" />
        <div class="personalization-form__actions">
          <R3Button variant="secondary" @click="cancelEditing">取消</R3Button>
          <R3Button variant="primary" @click="updatePreview">更新本页预览</R3Button>
        </div>
      </div>
      <dl v-else class="personalization-form__preview">
        <div><dt>输出偏好</dt><dd>{{ outputPreview || "尚未填写" }}</dd></div>
        <div><dt>工作习惯</dt><dd>{{ habitPreview || "尚未填写" }}</dd></div>
      </dl>
    </R3Card>

    <R3Card>
      <template #header><div><h2>回复风格</h2><p>仅影响本页预览，不会写入任务配置。</p></div></template>
      <div class="personalization-form__styles" role="radiogroup" aria-label="回复风格">
        <button
          v-for="option in styles"
          :key="option.value"
          type="button"
          role="radio"
          :disabled="!editable"
          :aria-checked="style === option.value"
          :class="{ 'personalization-form__style--selected': style === option.value }"
          @click="style = option.value"
        >
          <strong>{{ option.label }}</strong><span>{{ option.description }}</span>
        </button>
      </div>
    </R3Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { R3Button, R3Card, R3InlineNotice, R3Textarea } from "../../components/ui";

defineProps<{ editable: boolean }>();
const editing = ref(false);
const outputPreview = ref("");
const habitPreview = ref("");
const draftOutput = ref("");
const draftHabit = ref("");
const style = ref("default");
const styles = [
  { value: "default", label: "默认", description: "平衡专业与易读" },
  { value: "professional", label: "专业", description: "严谨、结构化表达" },
  { value: "humorous", label: "幽默", description: "轻松、带一点趣味" },
  { value: "direct", label: "直言不讳", description: "直接指出问题和风险" },
] as const;

function startEditing(): void {
  draftOutput.value = outputPreview.value;
  draftHabit.value = habitPreview.value;
  editing.value = true;
}
function cancelEditing(): void { editing.value = false; }
function updatePreview(): void {
  outputPreview.value = draftOutput.value.trim();
  habitPreview.value = draftHabit.value.trim();
  editing.value = false;
}
</script>

<style scoped>
.personalization-form, .personalization-form__fields { display: grid; gap: 14px; }
.personalization-form__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.personalization-form h2, .personalization-form p { margin: 0; }
.personalization-form p, .personalization-form dd, .personalization-form__style span { color: var(--r3-color-text-secondary); font-size: var(--r3-font-size-sm); }
.personalization-form__preview { margin: 0; display: grid; gap: 16px; }
.personalization-form__preview div { display: grid; gap: 5px; }
.personalization-form__preview dt { font-weight: 700; }
.personalization-form__preview dd { margin: 0; white-space: pre-wrap; }
.personalization-form__actions { display: flex; justify-content: flex-end; gap: 8px; }
.personalization-form__styles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.personalization-form__styles button { min-height: 76px; display: grid; gap: 4px; border: 1px solid var(--r3-color-border); border-radius: var(--r3-radius-md); padding: 12px; background: var(--r3-color-surface); color: var(--r3-color-text); text-align: left; }
.personalization-form__styles button:not(:disabled):hover { background: var(--r3-color-surface-hover); }
.personalization-form__styles button:focus-visible { outline: none; box-shadow: var(--r3-focus-ring); }
.personalization-form__styles .personalization-form__style--selected { border-color: var(--r3-color-primary); background: var(--r3-color-primary-subtle); }
@media (max-width: 760px) { .personalization-form__styles { grid-template-columns: minmax(0, 1fr); } }
</style>

