<template>
  <div class="r3-tabs" role="tablist" :aria-label="label">
    <button
      v-for="tab in tabs"
      :key="tab.value"
      class="r3-tabs__item"
      :class="{ 'r3-tabs__item--active': tab.value === modelValue }"
      type="button"
      role="tab"
      :aria-selected="tab.value === modelValue"
      :disabled="tab.disabled"
      @click="$emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
export type R3TabItem = {
  label: string;
  value: string;
  disabled?: boolean;
};

defineProps<{
  modelValue: string;
  tabs: R3TabItem[];
  label?: string;
}>();

defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>

<style scoped>
.r3-tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  background: var(--r3-color-surface-hover);
}

.r3-tabs__item {
  min-height: 28px;
  border: 0;
  border-radius: var(--r3-radius-sm);
  padding: 0 12px;
  background: transparent;
  color: var(--r3-color-text-secondary);
  cursor: pointer;
}

.r3-tabs__item--active {
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
  box-shadow: 0 1px 2px rgba(26, 29, 46, 0.08);
}
</style>
