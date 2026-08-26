<template>
  <FieldShell
    :input-id="id"
    :label="label"
    :help="help"
    :error="error"
    :required="required"
    :disabled="disabled"
    :disabled-reason="disabledReason"
  >
    <template #default="{ inputId, describedBy }">
      <input
        :id="inputId"
        class="text-input"
        type="text"
        :value="value"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :aria-invalid="error ? 'true' : 'false'"
        :aria-describedby="describedBy"
        @input="onInput"
      />
    </template>
  </FieldShell>
</template>

<script setup lang="ts">
import FieldShell from './FieldShell.vue';

withDefaults(
  defineProps<{
    id: string;
    label: string;
    value?: string;
    placeholder?: string;
    help?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    disabledReason?: string;
  }>(),
  {
    value: '',
    placeholder: '',
    help: '',
    error: '',
    required: false,
    disabled: false,
    readonly: false,
    disabledReason: ''
  }
);

const emit = defineEmits<{
  (event: 'input', value: string): void;
}>();

function onInput(event: Event): void {
  emit('input', (event.target as HTMLInputElement).value);
}
</script>
