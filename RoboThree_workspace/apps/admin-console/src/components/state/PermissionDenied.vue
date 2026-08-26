<template>
  <PageState status="permissionDenied" />
</template>

<script lang="ts">
import Vue from 'vue';
import PageState from './PageState.vue';

export default Vue.extend({
  name: 'PermissionDenied',
  components: {
    PageState
  }
});
</script>
