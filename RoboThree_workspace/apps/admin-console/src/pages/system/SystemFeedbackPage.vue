<template>
  <PageScaffold
    page-key="system-feedback"
    eyebrow="系统管理"
    title="反馈管理"
    description="反馈管理仍为 prototype/gated 壳层，不提交或回复反馈。"
    status="partial"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'SystemFeedbackPage',
  components: {
    PageScaffold
  }
});
</script>
