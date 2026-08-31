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
  gap: 20px;
  border-bottom: 1px solid var(--r3-color-border);
}

.r3-tabs__item {
  min-height: 36px;
  position: relative;
  border: 0;
  padding: 0 1px;
  background: transparent;
  color: var(--r3-color-text-secondary);
  cursor: pointer;
}

.r3-tabs__item--active {
  color: var(--r3-color-text);
  font-weight: 680;
}

.r3-tabs__item--active::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--r3-color-primary);
}
</style>
