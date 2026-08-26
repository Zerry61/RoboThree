<template>
  <Teleport to="body">
    <div v-if="open" class="r3-modal" role="presentation">
      <div class="r3-modal__scrim" @click="$emit('close')" />
      <section
        class="r3-modal__panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
      >
        <header class="r3-modal__header">
          <h2 v-if="title" :id="titleId" class="r3-modal__title">{{ title }}</h2>
          <button class="r3-modal__close" type="button" aria-label="Close" @click="$emit('close')">
            x
          </button>
        </header>
        <div class="r3-modal__body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="r3-modal__footer">
          <slot name="footer" />
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const titleId = `r3-modal-${Math.random().toString(36).slice(2)}`;

defineProps<{
  open: boolean;
  title?: string;
}>();

defineEmits<{
  close: [];
}>();
</script>

<style scoped>
.r3-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
}

.r3-modal__scrim {
  position: absolute;
  inset: 0;
  background: rgba(26, 29, 46, 0.42);
}

.r3-modal__panel {
  position: relative;
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-lg);
  background: var(--r3-color-surface);
  box-shadow: 0 20px 60px rgba(26, 29, 46, 0.18);
}

.r3-modal__header,
.r3-modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--r3-color-border);
}

.r3-modal__footer {
  justify-content: flex-end;
  border-top: 1px solid var(--r3-color-border);
  border-bottom: 0;
}

.r3-modal__title {
  margin: 0;
  font-size: var(--r3-font-size-xl);
}

.r3-modal__close {
  width: 28px;
  height: 28px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-sm);
  background: var(--r3-color-surface);
  color: var(--r3-color-text-secondary);
  cursor: pointer;
}

.r3-modal__body {
  padding: 16px;
}
</style>
