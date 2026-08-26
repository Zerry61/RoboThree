<template>
  <button
    :class="presentation.className"
    :disabled="presentation.disabled"
    :aria-disabled="presentation.ariaDisabled"
    :aria-busy="presentation.ariaBusy"
    type="button"
    @click="onClick"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { presentButton } from '../../presentation/admin-ui-presentation';
import type { AdminButtonVariant, AdminComponentSize } from '../../types/admin-ui';

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    loading?: boolean;
    variant?: AdminButtonVariant;
    size?: AdminComponentSize;
  }>(),
  {
    variant: 'primary',
    size: 'md'
  }
);

const emit = defineEmits<{
  (event: 'click'): void;
}>();

const presentation = computed(() =>
  presentButton({
    variant: props.variant,
    size: props.size,
    disabled: props.disabled ?? false,
    loading: props.loading ?? false
  })
);

function onClick(): void {
  if (!presentation.value.disabled) {
    emit('click');
  }
}
</script>
