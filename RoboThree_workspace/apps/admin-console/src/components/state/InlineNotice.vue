<template>
  <p class="inline-notice" role="note">
    <slot />
  </p>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
  name: 'InlineNotice'
});
</script>
