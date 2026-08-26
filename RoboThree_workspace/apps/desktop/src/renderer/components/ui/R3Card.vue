<template>
  <section class="r3-card">
    <header v-if="$slots.header || title" class="r3-card__header">
      <slot name="header">
        <h2 class="r3-card__title">{{ title }}</h2>
      </slot>
    </header>
    <div class="r3-card__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
}>();
</script>

<style scoped>
.r3-card {
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  background: var(--r3-color-surface);
}

.r3-card__header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--r3-color-border);
}

.r3-card__title {
  margin: 0;
  font-size: var(--r3-font-size-lg);
  font-weight: 650;
}

.r3-card__body {
  padding: 16px;
}
</style>
