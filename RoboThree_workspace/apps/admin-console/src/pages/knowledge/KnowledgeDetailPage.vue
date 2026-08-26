<template>
  <PageScaffold
    page-key="knowledge-detail"
    eyebrow="知识详情"
    title="知识详情"
    description="详情壳层已建立，真实知识事实待接入。"
    status="unavailable"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'KnowledgeDetailPage',
  components: {
    PageScaffold
  }
});
</script>
