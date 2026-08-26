<template>
  <PageScaffold
    page-key="skill-detail"
    eyebrow="技能详情"
    title="技能详情"
    description="详情壳层已建立，真实技能事实待接入。"
    status="partial"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'SkillDetailPage',
  components: {
    PageScaffold
  }
});
</script>
