<template>
  <BadTypedButton :count="'not-a-number'" />
</template>

<script lang="ts">
import Vue from 'vue';

const badNumber: number = 'not-a-number';

const BadTypedButton = Vue.extend({
  props: {
    count: {
      type: Number,
      required: true
    }
  },
  template: '<button>{{ count }}</button>'
});

export default Vue.extend({
  name: 'BadProps',
  components: {
    BadTypedButton
  },
  data() {
    return {
      badNumber
    };
  }
});
</script>
