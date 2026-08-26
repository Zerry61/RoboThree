<template>
  <PageScaffold
    page-key="robot-detail"
    eyebrow="机器人详情"
    title="机器人详情"
    description="详情壳层已建立，真实机器人配置待接入。"
    status="partial"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'RobotDetailPage',
  components: {
    PageScaffold
  }
});
</script>
