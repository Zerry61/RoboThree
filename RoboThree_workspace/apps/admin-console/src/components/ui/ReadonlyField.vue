<template>
  <div class="readonly-field">
    <span class="readonly-field__label">{{ label }}</span>
    <span class="readonly-field__value">{{ value || fallback }}</span>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value?: string;
    fallback?: string;
  }>(),
  {
    value: '',
    fallback: '暂不可用'
  }
);
</script>

