<template>
  <AdminShell :permission-projection="permissionProjection">
    <RouterOutlet />
  </AdminShell>
</template>

<script setup lang="ts">
import AdminShell from '../components/layout/AdminShell.vue';
import RouterOutlet from '../components/layout/RouterOutlet.vue';
import type { PermissionProjection } from './permission-shell';

defineProps<{
  permissionProjection: PermissionProjection;
}>();
</script>
