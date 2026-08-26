<template>
  <span class="r3-tag" :class="`r3-tag--${tone}`">
    <slot />
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  tone?: "neutral" | "success" | "warning" | "danger" | "primary";
}>(), {
  tone: "neutral",
});
</script>

<style scoped>
.r3-tag {
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  border-radius: var(--r3-radius-pill);
  padding: 0 8px;
  font-size: var(--r3-font-size-xs);
  font-weight: 650;
  background: var(--r3-color-surface-hover);
  color: var(--r3-color-text-secondary);
}

.r3-tag--primary {
  background: var(--r3-color-primary-subtle);
  color: var(--r3-color-primary);
}

.r3-tag--success {
  background: var(--r3-color-success-subtle);
  color: var(--r3-color-success);
}

.r3-tag--warning {
  background: var(--r3-color-warning-subtle);
  color: var(--r3-color-warning);
}

.r3-tag--danger {
  background: var(--r3-color-danger-subtle);
  color: var(--r3-color-danger);
}
</style>
