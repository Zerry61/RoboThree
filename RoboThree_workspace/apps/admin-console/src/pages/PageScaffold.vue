<template>
  <section class="page-scaffold">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">{{ eyebrow }}</p>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </header>
    <PageState :status="status" />
    <slot />
  </section>
</template>

<script setup lang="ts">
import PageState from '../components/state/PageState.vue';
import type { AdminPageStatus } from '../adapters/admin-adapter';

defineProps<{
  pageKey: string;
  eyebrow: string;
  title: string;
  description: string;
  status: AdminPageStatus;
}>();
</script>
