<template>
  <R3Tag :tone="tone">
    <span class="r3-status-badge__dot" aria-hidden="true" />
    <slot />
  </R3Tag>
</template>

<script setup lang="ts">
import R3Tag from "./R3Tag.vue";

withDefaults(defineProps<{
  tone?: "neutral" | "success" | "warning" | "danger" | "primary";
}>(), {
  tone: "neutral",
});
</script>

<style scoped>
.r3-status-badge__dot {
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border: 1px solid var(--r3-color-surface);
  border-radius: 50%;
  background: currentColor;
}
</style>
