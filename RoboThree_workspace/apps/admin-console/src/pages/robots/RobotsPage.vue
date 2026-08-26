<template>
  <PageScaffold
    page-key="robots"
    eyebrow="机器人管理"
    title="机器人管理"
    description="机器人管理壳层已建立，草稿与审核能力待接入。"
    status="partial"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'RobotsPage',
  components: {
    PageScaffold
  }
});
</script>
