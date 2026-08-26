<template>
  <span class="r3-skeleton" :style="{ width, height }" aria-hidden="true" />
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  width?: string;
  height?: string;
}>(), {
  width: "100%",
  height: "16px",
});
</script>

<style scoped>
.r3-skeleton {
  display: inline-block;
  border-radius: var(--r3-radius-sm);
  background: linear-gradient(
    90deg,
    var(--r3-color-surface-hover),
    var(--r3-color-surface-active),
    var(--r3-color-surface-hover)
  );
  background-size: 200% 100%;
  animation: r3-skeleton 1.2s ease-in-out infinite;
}

@keyframes r3-skeleton {
  to {
    background-position-x: -200%;
  }
}
</style>
