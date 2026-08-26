<template>
  <section
    class="page-state"
    :class="`page-state--${presentation.tone}`"
    :role="presentation.role"
    :aria-busy="presentation.busy"
  >
    <div v-if="presentation.busy" class="page-state__skeleton" aria-hidden="true"></div>
    <p class="page-state__title">{{ presentation.title }}</p>
    <p class="page-state__message">{{ presentation.message }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { presentPageState } from '../../presentation/page-state-presentation';
import type { AdminPageStatus, SafeErrorSummary } from '../../adapters/admin-adapter';

const props = defineProps<{
  status: AdminPageStatus;
  safeError?: SafeErrorSummary;
}>();

const presentation = computed(() => presentPageState(props.status, props.safeError));
</script>
