<template>
  <span class="r3-spinner" :class="`r3-spinner--${size}`" role="status" :aria-label="label" />
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  size?: "sm" | "md" | "lg";
  label?: string;
}>(), {
  size: "md",
  label: "Loading",
});
</script>

<style scoped>
.r3-spinner {
  display: inline-block;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  color: var(--r3-color-primary);
  animation: r3-spin 0.8s linear infinite;
}

.r3-spinner--sm {
  width: 14px;
  height: 14px;
}

.r3-spinner--md {
  width: 18px;
  height: 18px;
}

.r3-spinner--lg {
  width: 24px;
  height: 24px;
}

@keyframes r3-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
