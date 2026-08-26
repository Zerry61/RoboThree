<template>
  <aside class="r3-inline-notice" :class="`r3-inline-notice--${tone}`">
    <strong v-if="title" class="r3-inline-notice__title">{{ title }}</strong>
    <span class="r3-inline-notice__body"><slot /></span>
  </aside>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
}>(), {
  tone: "info",
});
</script>

<style scoped>
.r3-inline-notice {
  display: grid;
  gap: 4px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 10px 12px;
  color: var(--r3-color-text-secondary);
  background: var(--r3-color-surface-hover);
}

.r3-inline-notice--success {
  border-color: rgba(47, 122, 79, 0.28);
  background: var(--r3-color-success-subtle);
}

.r3-inline-notice--warning {
  border-color: rgba(160, 93, 0, 0.28);
  background: var(--r3-color-warning-subtle);
}

.r3-inline-notice--danger {
  border-color: rgba(196, 61, 75, 0.28);
  background: var(--r3-color-danger-subtle);
}

.r3-inline-notice__title {
  color: var(--r3-color-text);
}
</style>
