<template>
  <div class="field-shell" :class="{ 'field-shell--invalid': invalid, 'field-shell--disabled': disabled }">
    <label v-if="label" class="field-shell__label" :for="inputId">
      {{ label }}
      <span v-if="required" aria-hidden="true">*</span>
    </label>
    <slot :input-id="inputId" :described-by="describedBy" />
    <p v-if="help" :id="helpId" class="field-shell__help">{{ help }}</p>
    <p v-if="error" :id="errorId" class="field-shell__error" role="alert">{{ error }}</p>
    <p v-if="disabledReason" class="field-shell__disabled">{{ disabledReason }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    inputId: string;
    label?: string;
    help?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    disabledReason?: string;
  }>(),
  {
    label: '',
    help: '',
    error: '',
    disabledReason: ''
  }
);

const invalid = computed(() => props.error.length > 0);
const helpId = computed(() => `${props.inputId}-help`);
const errorId = computed(() => `${props.inputId}-error`);
const describedBy = computed(() => [props.help ? helpId.value : '', props.error ? errorId.value : ''].filter(Boolean).join(' '));
</script>

