<template>
  <span class="r3-tooltip">
    <slot />
    <span class="r3-tooltip__bubble" role="tooltip">{{ text }}</span>
  </span>
</template>

<script setup lang="ts">
defineProps<{
  text: string;
}>();
</script>

<style scoped>
.r3-tooltip {
  position: relative;
  display: inline-flex;
}

.r3-tooltip__bubble {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  z-index: 20;
  width: max-content;
  max-width: 220px;
  padding: 6px 8px;
  border-radius: var(--r3-radius-sm);
  background: var(--r3-color-text);
  color: #fff;
  font-size: var(--r3-font-size-xs);
  transform: translateX(-50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--r3-motion-fast);
}

.r3-tooltip:focus-within .r3-tooltip__bubble,
.r3-tooltip:hover .r3-tooltip__bubble {
  opacity: 1;
}
</style>
