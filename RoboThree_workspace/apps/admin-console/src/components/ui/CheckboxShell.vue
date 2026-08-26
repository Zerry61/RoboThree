<template>
  <label class="checkbox-shell" :class="{ 'checkbox-shell--disabled': disabled }">
    <input type="checkbox" :checked="checked" :disabled="disabled" @change="onChange" />
    <span>{{ label }}</span>
  </label>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    checked: boolean;
    disabled?: boolean;
  }>(),
  {
    disabled: false
  }
);

const emit = defineEmits<{
  (event: 'change', checked: boolean): void;
}>();

function onChange(event: Event): void {
  emit('change', (event.target as HTMLInputElement).checked);
}
</script>
