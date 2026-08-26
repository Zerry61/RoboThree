<template>
  <section class="admin-table" :aria-busy="loading ? 'true' : 'false'">
    <table>
      <caption v-if="caption">
        {{ caption }}
      </caption>
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.key" scope="col">{{ column.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td :colspan="columns.length || 1">
            <SkeletonBlock />
          </td>
        </tr>
        <tr v-else-if="empty">
          <td :colspan="columns.length || 1">
            <slot name="empty">
              <TableEmptyState title="暂无数据" message="当前能力可用，但还没有可展示的数据" />
            </slot>
          </td>
        </tr>
        <slot v-else />
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import SkeletonBlock from '../state/SkeletonBlock.vue';
import TableEmptyState from './TableEmptyState.vue';
import type { TableColumn } from '../../types/admin-ui';

withDefaults(
  defineProps<{
    columns: readonly TableColumn[];
    caption?: string;
    loading?: boolean;
    empty?: boolean;
  }>(),
  {
    caption: ''
  }
);
</script>

