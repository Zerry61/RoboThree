<template>
  <label class="input-shell">
    <span>{{ label }}</span>
    <input :value="value" :disabled="disabled" />
  </label>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
  name: 'InputShell',
  props: {
    label: {
      type: String,
      required: true
    },
    value: {
      type: String,
      default: ''
    },
    disabled: {
      type: Boolean,
      default: true
    }
  }
});
</script>
