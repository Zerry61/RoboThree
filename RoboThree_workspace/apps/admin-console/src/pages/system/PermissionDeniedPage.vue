<template>
  <PageScaffold
    page-key="permission-denied"
    eyebrow="权限"
    title="权限不足"
    description="当前账号没有访问该页面的权限。"
    status="permissionDenied"
  />
</template>

<script lang="ts">
import Vue from 'vue';
import PageScaffold from '../PageScaffold.vue';

export default Vue.extend({
  name: 'PermissionDeniedPage',
  components: {
    PageScaffold
  }
});
</script>
