<template>
  <label class="r3-field">
    <span v-if="label" class="r3-field__label">{{ label }}</span>
    <select
      class="r3-select"
      :class="{ 'r3-select--error': error }"
      :value="modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
    <span v-if="error" class="r3-field__error">{{ error }}</span>
  </label>
</template>

<script setup lang="ts">
export type R3SelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

defineProps<{
  modelValue: string;
  options: R3SelectOption[];
  label?: string;
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

.r3-select {
  min-height: 34px;
  width: 100%;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 0 32px 0 10px;
  background: var(--r3-color-surface);
  color: var(--r3-color-text);
}

.r3-select--error {
  border-color: var(--r3-color-danger);
}
</style>
