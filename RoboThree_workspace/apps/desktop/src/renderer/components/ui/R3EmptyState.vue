<template>
  <section class="r3-empty-state">
    <div v-if="icon" class="r3-empty-state__icon" aria-hidden="true">{{ icon }}</div>
    <h2 class="r3-empty-state__title">{{ title }}</h2>
    <p v-if="description" class="r3-empty-state__description">{{ description }}</p>
    <div v-if="$slots.actions" class="r3-empty-state__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
  icon?: string;
}>();
</script>

<style scoped>
.r3-empty-state {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 40px 20px;
  text-align: center;
}

.r3-empty-state__icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: var(--r3-radius-md);
  background: var(--r3-color-primary-subtle);
  color: var(--r3-color-primary);
  font-weight: 700;
}

.r3-empty-state__title {
  margin: 0;
  font-size: var(--r3-font-size-xl);
}

.r3-empty-state__description {
  max-width: 420px;
  margin: 0;
  color: var(--r3-color-text-secondary);
}

.r3-empty-state__actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
</style>
