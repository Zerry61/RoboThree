<template>
  <PageScaffold
    page-key="skills"
    eyebrow="技能管理"
    title="技能管理"
    description="技能管理壳层已建立，上传解析和审核能力待接入。"
    status="partial"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'SkillsPage',
  components: {
    PageScaffold
  }
});
</script>
