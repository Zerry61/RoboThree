<template>
  <nav class="table-pagination" aria-label="分页">
    <AdminButton variant="secondary" size="sm" :disabled="!presentation.canGoPrevious" @click="$emit('previous')">
      上一页
    </AdminButton>
    <span>{{ presentation.summary }}</span>
    <AdminButton variant="secondary" size="sm" :disabled="!presentation.canGoNext" @click="$emit('next')">
      下一页
    </AdminButton>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AdminButton from './AdminButton.vue';
import { presentPagination } from '../../presentation/admin-ui-presentation';

const props = defineProps<{
  page: number;
  pageSize: number;
  total: number;
}>();

defineEmits<{
  (event: 'previous'): void;
  (event: 'next'): void;
}>();

const presentation = computed(() =>
  presentPagination({
    page: props.page,
    pageSize: props.pageSize,
    total: props.total
  })
);
</script>

