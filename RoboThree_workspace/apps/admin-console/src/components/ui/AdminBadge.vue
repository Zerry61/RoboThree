<template>
  <span :class="presentation.className">
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { presentBadge } from '../../presentation/admin-ui-presentation';
import type { AdminBadgeTone } from '../../types/admin-ui';

const props = withDefaults(
  defineProps<{
    tone?: AdminBadgeTone;
  }>(),
  {
    tone: 'neutral'
  }
);

const presentation = computed(() => presentBadge(props.tone));
</script>
