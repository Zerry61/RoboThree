<template>
  <ModalShell :open="open" :title="title" :title-id="titleId" @close="$emit('cancel')">
    <p class="confirm-dialog__message">{{ message }}</p>
    <footer class="confirm-dialog__actions">
      <AdminButton variant="secondary" @click="$emit('cancel')">取消</AdminButton>
      <AdminButton variant="danger" :disabled="confirmDisabled" @click="$emit('confirm')">{{ confirmLabel }}</AdminButton>
    </footer>
  </ModalShell>
</template>

<script setup lang="ts">
import AdminButton from './AdminButton.vue';
import ModalShell from './ModalShell.vue';

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    titleId: string;
    message: string;
    confirmLabel?: string;
    confirmDisabled?: boolean;
  }>(),
  {
    confirmLabel: '确认',
    confirmDisabled: true
  }
);

defineEmits<{
  (event: 'cancel'): void;
  (event: 'confirm'): void;
}>();
</script>

