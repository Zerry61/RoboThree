<template>
  <PageScaffold
    page-key="system-users"
    eyebrow="系统管理"
    title="用户与权限"
    description="用户与权限壳层已建立，真实权限 Projection 待接入。"
    status="partial"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'SystemUsersPage',
  components: {
    PageScaffold
  }
});
</script>
