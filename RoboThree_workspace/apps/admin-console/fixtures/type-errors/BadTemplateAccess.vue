<template>
  <section>{{ missingField }}</section>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
  name: 'BadTemplateAccess',
  data() {
    return {
      presentField: 'visible'
    };
  }
});
</script>
