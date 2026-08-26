<template>
  <span class="tooltip-shell">
    <span :aria-describedby="tooltipId">
      <slot />
    </span>
    <span :id="tooltipId" class="tooltip-shell__content" role="tooltip">{{ text }}</span>
  </span>
</template>

<script setup lang="ts">
defineProps<{
  tooltipId: string;
  text: string;
}>();
</script>
