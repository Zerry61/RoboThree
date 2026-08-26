<template>
  <p class="action-summary" :class="`action-summary--${allowed ? 'allowed' : 'disabled'}`">
    {{ allowed ? readyText : safeReason }}
  </p>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    allowed: boolean;
    reason?: string;
    readyText?: string;
  }>(),
  {
    reason: '当前操作待接入',
    readyText: '操作入口可显示'
  }
);

const safeReason = props.reason;
</script>

