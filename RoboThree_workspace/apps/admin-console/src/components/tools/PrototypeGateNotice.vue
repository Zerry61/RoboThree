<template>
  <InlineNotice class="prototype-gate-notice">
    {{ message }}
  </InlineNotice>
</template>

<script setup lang="ts">
import InlineNotice from '../state/InlineNotice.vue';

withDefaults(
  defineProps<{
    message?: string;
  }>(),
  {
    message: '当前页面使用演示数据；真实管理能力待接入。'
  }
);
</script>

