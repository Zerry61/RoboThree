<template>
  <header class="r3-page-header">
    <div>
      <p v-if="eyebrow" class="r3-page-header__eyebrow">{{ eyebrow }}</p>
      <h1 class="r3-page-header__title">{{ title }}</h1>
      <p v-if="description" class="r3-page-header__description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="r3-page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  eyebrow?: string;
  description?: string;
}>();
</script>

<style scoped>
.r3-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.r3-page-header__eyebrow {
  margin: 0 0 3px;
  color: var(--r3-color-text-tertiary);
  font-size: var(--r3-font-size-xs);
  font-weight: 650;
}

.r3-page-header__title {
  margin: 0;
  font-size: 21px;
  font-weight: 680;
  line-height: 1.25;
}

.r3-page-header__description {
  max-width: 720px;
  margin: 5px 0 0;
  color: var(--r3-color-text-secondary);
  font-size: var(--r3-font-size-sm);
}

.r3-page-header__actions {
  display: flex;
  gap: 8px;
}
</style>
