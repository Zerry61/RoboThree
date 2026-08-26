<template>
  <label class="r3-search-field">
    <span class="r3-search-field__icon" aria-hidden="true">/</span>
    <input
      class="r3-search-field__input"
      type="search"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="accessibleLabel"
      :disabled="disabled"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
  </label>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  accessibleLabel?: string;
  disabled?: boolean;
}>(), {
  placeholder: "Search",
  accessibleLabel: "Search",
  disabled: false,
});

defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>

<style scoped>
.r3-search-field {
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--r3-color-border);
  border-radius: var(--r3-radius-md);
  padding: 0 10px;
  background: var(--r3-color-surface);
}

.r3-search-field__icon {
  color: var(--r3-color-text-tertiary);
  font-weight: 700;
}

.r3-search-field__input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--r3-color-text);
}
</style>
