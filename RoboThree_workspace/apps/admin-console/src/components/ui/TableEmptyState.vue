<template>
  <section class="table-empty-state" role="note">
    <p class="table-empty-state__title">{{ title }}</p>
    <p>{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  message: string;
}>();
</script>

