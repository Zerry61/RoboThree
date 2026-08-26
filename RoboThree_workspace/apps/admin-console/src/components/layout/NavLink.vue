<template>
  <a :href="href" @click.prevent="navigate">
    <slot />
  </a>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
  name: 'NavLink',
  props: {
    to: {
      type: String,
      required: true
    }
  },
  computed: {
    href(): string {
      return `#${this.to}`;
    }
  },
  methods: {
    navigate() {
      if (this.$route.path !== this.to) {
        this.$router.push(this.to).catch(() => undefined);
      }
    }
  }
});
</script>
