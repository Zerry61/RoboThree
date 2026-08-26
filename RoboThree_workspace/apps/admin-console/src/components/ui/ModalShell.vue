<template>
  <div v-if="open" class="modal-shell" role="presentation" @keydown.esc="requestClose">
    <div class="modal-shell__backdrop" aria-hidden="true"></div>
    <section
      ref="dialog"
      class="modal-shell__dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
    >
      <header class="modal-shell__header">
        <h3 :id="titleId">{{ title }}</h3>
        <button class="modal-shell__close" type="button" aria-label="关闭" @click="requestClose">×</button>
      </header>
      <div class="modal-shell__body">
        <slot />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  titleId: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const dialog = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      dialog.value?.focus();
      return;
    }
    previousFocus?.focus();
    previousFocus = null;
  }
);

function requestClose(): void {
  emit('close');
}
</script>

