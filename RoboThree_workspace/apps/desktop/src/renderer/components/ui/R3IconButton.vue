<template>
  <button
    class="r3-icon-button"
    :disabled="disabled"
    :aria-label="label"
    :title="label"
    type="button"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  disabled?: boolean;
}>();
</script>

<style scoped>
.r3-icon-button {
  width: 34px;
  height: 34px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  display: inline-grid;
  place-items: center;
  background: var(--r3-color-surface);
  color: var(--r3-color-text-secondary);
  cursor: pointer;
}

.r3-icon-button:hover:not(:disabled) {
  background: var(--r3-color-surface-hover);
  color: var(--r3-color-text);
}
</style>
