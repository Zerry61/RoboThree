<template>
  <PageScaffold
    page-key="login"
    eyebrow="登录"
    title="登录待接入"
    description="真实企业登录和会话能力待接入；浏览器侧不保存 bearer。"
    status="unavailable"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'LoginPage',
  components: {
    PageScaffold
  }
});
</script>
