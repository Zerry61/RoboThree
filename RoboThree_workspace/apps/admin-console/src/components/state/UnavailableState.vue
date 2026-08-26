<template>
  <PageState status="unavailable" />
</template>

<script lang="ts">
import Vue from 'vue';
import PageState from './PageState.vue';

export default Vue.extend({
  name: 'UnavailableState',
  components: {
    PageState
  }
});
</script>
