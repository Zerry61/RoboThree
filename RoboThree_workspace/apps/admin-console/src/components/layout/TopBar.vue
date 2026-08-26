<template>
  <header class="top-bar">
    <h1>{{ title }}</h1>
    <span class="top-bar__status">管理端壳层</span>
  </header>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
  name: 'TopBar',
  props: {
    title: {
      type: String,
      required: true
    }
  }
});
</script>
