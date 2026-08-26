<template>
  <PageState status="error" :safe-error="safeError" />
</template>

<script lang="ts">
import Vue from 'vue';
import type { SafeErrorSummary } from '../../adapters/admin-adapter';

import PageState from './PageState.vue';

export default Vue.extend({
  name: 'SafeErrorState',
  components: {
    PageState
  },
  props: {
    safeError: {
      type: Object,
      required: true
    }
  },
  computed: {
    typedSafeError(): SafeErrorSummary {
      return this.safeError as SafeErrorSummary;
    }
  }
});
</script>
