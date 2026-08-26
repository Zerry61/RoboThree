<template>
  <details class="technical-details">
    <summary>{{ title }}</summary>
    <dl>
      <template v-for="row in rows">
        <dt :key="`${row.label}-label`">{{ row.label }}</dt>
        <dd :key="`${row.label}-value`">{{ row.value }}</dd>
      </template>
    </dl>
  </details>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  rows: readonly Readonly<{ label: string; value: string }>[];
}>();
</script>
