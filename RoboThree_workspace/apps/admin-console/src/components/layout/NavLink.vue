<template>
  <a :href="href" v-bind="ariaCurrentAttrs" @click.prevent="navigate">
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
    },
    ariaCurrentAttrs(): Readonly<Record<string, string>> {
      return this.$route.path === this.to ? { 'aria-current': 'page' } : {};
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
