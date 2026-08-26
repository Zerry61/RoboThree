<template>
  <aside v-if="open" class="drawer-shell" role="dialog" aria-modal="true" :aria-labelledby="titleId" @keydown.esc="requestClose">
    <header class="drawer-shell__header">
      <h3 :id="titleId">{{ title }}</h3>
      <button class="drawer-shell__close" type="button" aria-label="关闭" @click="requestClose">×</button>
    </header>
    <div class="drawer-shell__body">
      <slot />
    </div>
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean;
  title: string;
  titleId: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

function requestClose(): void {
  emit('close');
}
</script>

