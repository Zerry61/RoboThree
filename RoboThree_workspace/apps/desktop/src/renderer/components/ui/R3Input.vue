<template>
  <label class="r3-field">
    <span v-if="label" class="r3-field__label">{{ label }}</span>
    <input
      class="r3-input"
      :class="{ 'r3-input--error': error }"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
    <span v-if="error" class="r3-field__error">{{ error }}</span>
  </label>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}>();

defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>

<style scoped>
.r3-field {
  display: grid;
  gap: 6px;
}

.r3-field__label,
.r3-field__error {
  font-size: var(--r3-font-size-sm);
}

.r3-field__label {
  color: var(--r3-color-text-secondary);
}

.r3-field__error {
  color: var(--r3-color-danger);
}

.r3-input {
  min-height: 34px;
  width: 100%;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 0 10px;
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
}

.r3-input::placeholder {
  color: var(--r3-color-text-placeholder);
}

.r3-input--error {
  border-color: var(--r3-color-danger);
}
</style>
