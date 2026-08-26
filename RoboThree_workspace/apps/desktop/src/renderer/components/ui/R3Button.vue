<template>
  <button
    class="r3-button"
    :class="[`r3-button--${variant}`, { 'r3-button--loading': loading }]"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : undefined"
    type="button"
  >
    <span v-if="loading" class="r3-button__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
}>(), {
  variant: "secondary",
  disabled: false,
  loading: false,
});
</script>

<style scoped>
.r3-button {
  min-height: 34px;
  border: 1px solid var(--r3-color-border-strong);
  border-radius: var(--r3-radius-md);
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
  cursor: pointer;
  transition: background var(--r3-motion-fast), border-color var(--r3-motion-fast);
}

.r3-button:hover:not(:disabled) {
  background: var(--r3-color-surface-hover);
}

.r3-button:active:not(:disabled) {
  background: var(--r3-color-surface-active);
}

.r3-button--primary {
  border-color: var(--r3-color-primary);
  background: var(--r3-color-primary);
  color: #fff;
}

.r3-button--primary:hover:not(:disabled) {
  background: var(--r3-color-primary-hover);
}

.r3-button--danger {
  border-color: var(--r3-color-danger);
  color: var(--r3-color-danger);
  background: var(--r3-color-danger-subtle);
}

.r3-button__spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: r3-spin 0.8s linear infinite;
}

@keyframes r3-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
