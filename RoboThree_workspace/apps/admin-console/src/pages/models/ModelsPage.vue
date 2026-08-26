<template>
  <PageScaffold
    page-key="models"
    eyebrow="模型管理"
    title="模型管理"
    description="当前仅建立管理端页面壳层，真实模型配置能力待接入。"
    status="unavailable"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'ModelsPage',
  components: {
    PageScaffold
  }
});
</script>
