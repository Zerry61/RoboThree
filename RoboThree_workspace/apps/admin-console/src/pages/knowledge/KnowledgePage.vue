<template>
  <PageScaffold
    page-key="knowledge"
    eyebrow="知识管理"
    title="知识管理"
    description="知识管理壳层已建立，真实连接和检索能力待接入。"
    status="unavailable"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'KnowledgePage',
  components: {
    PageScaffold
  }
});
</script>
