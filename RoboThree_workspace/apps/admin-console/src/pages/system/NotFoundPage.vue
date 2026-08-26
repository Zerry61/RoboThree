<template>
  <PageScaffold
    page-key="not-found"
    eyebrow="路由"
    title="页面不存在"
    description="没有找到对应页面。"
    status="empty"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'NotFoundPage',
  components: {
    PageScaffold
  }
});
</script>
