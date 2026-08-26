<template>
  <AdminBadge :tone="tone">{{ label }}</AdminBadge>
</template>

<script setup lang="ts">
import AdminBadge from './AdminBadge.vue';
import type { AdminBadgeTone } from '../../types/admin-ui';

defineProps<{
  label: string;
  tone: AdminBadgeTone;
}>();
</script>
