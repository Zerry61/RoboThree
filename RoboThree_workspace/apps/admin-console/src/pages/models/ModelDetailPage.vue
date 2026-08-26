<template>
  <PageScaffold
    page-key="model-detail"
    eyebrow="模型详情"
    title="模型详情"
    description="详情壳层已建立，真实详情 Projection 待接入。"
    status="unavailable"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'ModelDetailPage',
  components: {
    PageScaffold
  }
});
</script>
