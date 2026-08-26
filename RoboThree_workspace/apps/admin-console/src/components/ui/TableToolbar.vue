<template>
  <header class="table-toolbar">
    <div>
      <h3>{{ title }}</h3>
      <p v-if="summary">{{ summary }}</p>
    </div>
    <div class="table-toolbar__controls">
      <slot />
    </div>
  </header>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    summary?: string;
  }>(),
  {
    summary: ''
  }
);
</script>

