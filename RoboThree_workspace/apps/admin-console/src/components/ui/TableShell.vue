<template>
  <div class="table-shell" role="table" aria-label="管理对象列表">
    <div class="table-shell__row table-shell__row--head" role="row">
      <span role="columnheader">对象</span>
      <span role="columnheader">状态</span>
      <span role="columnheader">说明</span>
    </div>
    <slot />
  </div>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
  name: 'TableShell'
});
</script>
