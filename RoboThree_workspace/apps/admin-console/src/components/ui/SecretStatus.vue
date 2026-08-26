<template>
  <AdminBadge :tone="presentation.tone">{{ presentation.label }}</AdminBadge>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AdminBadge from './AdminBadge.vue';
import { presentSecretStatus } from '../../presentation/admin-ui-presentation';
import type { SecretDisplayStatus } from '../../types/admin-ui';

const props = defineProps<{
  status: SecretDisplayStatus;
}>();

const presentation = computed(() => presentSecretStatus(props.status));
</script>

