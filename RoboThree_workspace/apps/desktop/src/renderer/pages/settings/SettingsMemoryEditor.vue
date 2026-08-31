<template>
  <div class="memory-editor">
    <R3InlineNotice :tone="editable ? 'info' : 'warning'" title="真实记忆能力未接入">
      {{ editable
        ? "当前内容只用于本页预览，离开页面后清除，不会进入任务或长期记忆。"
        : "当前页面只展示个人记忆字段，不读取或保存任何个人事实。" }}
    </R3InlineNotice>
    <R3Card>
      <template #header>
        <div class="memory-editor__header">
          <div><h2>个人记忆（Markdown）</h2><p>支持标题、列表和普通段落的安全预览。</p></div>
          <R3Button v-if="editable && !editing" variant="secondary" @click="startEditing">编辑</R3Button>
        </div>
      </template>
      <div v-if="editing" class="memory-editor__form">
        <R3Textarea v-model="draft" label="个人记忆（Markdown）" placeholder="# 我的偏好\n\n- 偏好简洁的中文回复" :rows="10" />
        <div class="memory-editor__actions">
          <R3Button variant="secondary" @click="cancelEditing">取消</R3Button>
          <R3Button variant="primary" @click="updatePreview">更新本页预览</R3Button>
        </div>
      </div>
      <div v-else-if="blocks.length === 0" class="memory-editor__empty">尚无本页预览内容</div>
      <div v-else class="memory-editor__preview" aria-label="个人记忆安全预览">
        <template v-for="(block, index) in blocks" :key="`${block.kind}-${index}`">
          <h3 v-if="block.kind === 'heading'">{{ block.text }}</h3>
          <p v-else-if="block.kind === 'paragraph'">{{ block.text }}</p>
          <ul v-else><li>{{ block.text }}</li></ul>
        </template>
      </div>
      <div v-if="editable && !editing && blocks.length > 0" class="memory-editor__actions">
        <R3Button variant="secondary" @click="clearPreview">清空本页预览</R3Button>
      </div>
    </R3Card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { R3Button, R3Card, R3InlineNotice, R3Textarea } from "../../components/ui";

defineProps<{ editable: boolean }>();
type MemoryBlock = Readonly<{ kind: "heading" | "paragraph" | "list"; text: string }>;
const content = ref("");
const draft = ref("");
const editing = ref(false);
const blocks = computed<readonly MemoryBlock[]>(() => content.value
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(0, 80)
  .map((line) => {
    if (line.startsWith("#")) return { kind: "heading", text: line.replace(/^#{1,6}\s*/u, "") };
    if (/^[-*]\s+/u.test(line)) return { kind: "list", text: line.replace(/^[-*]\s+/u, "") };
    return { kind: "paragraph", text: line };
  }));

function startEditing(): void { draft.value = content.value; editing.value = true; }
function cancelEditing(): void { editing.value = false; }
function updatePreview(): void { content.value = draft.value.slice(0, 8_000); editing.value = false; }
function clearPreview(): void { content.value = ""; draft.value = ""; }
</script>

<style scoped>
.memory-editor, .memory-editor__form, .memory-editor__preview { display: grid; gap: 14px; }
.memory-editor__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.memory-editor h2, .memory-editor p, .memory-editor__preview ul { margin: 0; }
.memory-editor__header p, .memory-editor__empty { color: var(--r3-color-text-secondary); font-size: var(--r3-font-size-sm); }
.memory-editor__preview { min-height: 180px; border-radius: var(--r3-radius-md); padding: 16px; background: var(--r3-color-surface-muted); }
.memory-editor__preview h3 { margin: 0; font-size: var(--r3-font-size-xl); }
.memory-editor__preview ul { padding-left: 20px; }
.memory-editor__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>

