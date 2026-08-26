<template>
  <div class="operation-gate" :aria-disabled="presentation.disabled ? 'true' : 'false'">
    <slot :disabled="presentation.disabled" :reason="presentation.reason" />
    <p v-if="presentation.disabled" class="operation-gate__reason">{{ presentation.reason }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { presentOperationGate } from '../../presentation/admin-ui-presentation';
import type { AdminActionState } from '../../types/admin-ui';

const props = defineProps<{
  action: AdminActionState;
}>();

const presentation = computed(() => presentOperationGate(props.action));
</script>
