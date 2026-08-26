<template>
  <FieldShell :input-id="id" :label="label" :help="help" :error="error" :disabled="disabled">
    <template #default="{ inputId, describedBy }">
      <select
        :id="inputId"
        class="select-shell"
        :value="value"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : 'false'"
        :aria-describedby="describedBy"
        @change="onChange"
      >
        <option value="" disabled>{{ placeholder }}</option>
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </template>
  </FieldShell>
</template>

<script setup lang="ts">
import FieldShell from './FieldShell.vue';

withDefaults(
  defineProps<{
    id: string;
    label: string;
    value: string;
    options: readonly Readonly<{ value: string; label: string }>[];
    placeholder?: string;
    help?: string;
    error?: string;
    disabled?: boolean;
  }>(),
  {
    placeholder: '请选择',
    help: '',
    error: '',
    disabled: false
  }
);

const emit = defineEmits<{
  (event: 'change', value: string): void;
}>();

function onChange(event: Event): void {
  emit('change', (event.target as HTMLSelectElement).value);
}
</script>
