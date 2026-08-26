<template>
  <PageScaffold
    page-key="system-audit"
    eyebrow="系统管理"
    title="审计日志"
    description="审计日志壳层已建立，仅展示安全页面状态。"
    status="partial"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'SystemAuditPage',
  components: {
    PageScaffold
  }
});
</script>
