<template>
  <section class="page-scaffold inventory-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">{{ copy.eyebrow }}</p>
      <h2>{{ copy.title }}</h2>
      <p>{{ copy.description }}</p>
    </header>
    <InlineNotice>{{ nonProductionNotice }}</InlineNotice>
    <PageState v-if="status !== 'ready' && safeError" :status="status" :safe-error="safeError" />
    <PageState v-else-if="status !== 'ready'" :status="status" />
    <template v-else>
      <div v-if="inlineNotices.length > 0" class="inventory-notices" aria-label="页面提示">
        <InlineNotice v-for="notice in inlineNotices" :key="notice">{{ notice }}</InlineNotice>
      </div>
      <AdminTable :columns="columns" :empty="rows.length === 0" :caption="copy.title" :loading="paginationLoading && rows.length === 0">
        <template #empty>
          <TableEmptyState :title="copy.emptyTitle" :message="copy.emptyMessage" />
        </template>
        <tr v-for="row in rows" :key="row.id">
          <td>
            <a v-if="row.detailPath" :href="`#${row.detailPath}`" :aria-label="`查看${row.title}详情`">{{ row.title }}</a>
            <span v-else>{{ row.title }}</span>
          </td>
          <td>{{ row.summary }}</td>
          <td>
            <span v-for="item in row.meta" :key="`${row.id}-${item.label}`" class="inventory-meta">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </span>
          </td>
          <td><AdminBadge :tone="row.stateTone">{{ row.state }}</AdminBadge></td>
        </tr>
      </AdminTable>
      <div v-if="nextCursor" class="inventory-pagination" aria-label="列表分页">
        <AdminButton variant="secondary" :disabled="paginationLoading" :loading="paginationLoading" :label="paginationLoading ? '正在加载下一页' : '加载下一页'" @click="loadNext">{{ paginationLoading ? '正在加载' : '加载更多' }}</AdminButton>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AdminPageStatus, SafeErrorSummary } from '../../adapters/admin-adapter';
import { AdminApiError } from '../../adapters/admin-api-error';
import { getAdminAdapter } from '../../app/admin-runtime';
import { inventoryColumns, inventoryCopy, nonProductionNotice, presentInventoryError, presentInventoryItem, presentInventoryNotices } from '../../presentation/read-only-inventory';
import type { InventoryRow, ReadOnlyInventoryModule } from '../../presentation/read-only-inventory';
import AdminBadge from '../ui/AdminBadge.vue';
import AdminButton from '../ui/AdminButton.vue';
import AdminTable from '../ui/AdminTable.vue';
import PageState from '../state/PageState.vue';
import InlineNotice from '../state/InlineNotice.vue';
import TableEmptyState from '../ui/TableEmptyState.vue';

type PageResult = Readonly<{ items: readonly unknown[]; nextCursor?: string | undefined }>;
const props = defineProps<{ inventoryModule: ReadOnlyInventoryModule }>();
const status = ref<AdminPageStatus>('loading');
const rows = ref<InventoryRow[]>([]);
const nextCursor = ref<string>();
const paginationLoading = ref(false);
const safeError = ref<SafeErrorSummary>();
const paginationError = ref<SafeErrorSummary>();
const copy = computed(() => inventoryCopy[props.inventoryModule]);
const columns = inventoryColumns;
const inlineNotices = computed(() => [
  ...presentInventoryNotices(rows.value),
  ...(paginationError.value === undefined ? [] : [paginationError.value.message])
]);

async function request(cursor?: string): Promise<PageResult> {
  const adapter = getAdminAdapter();
  const options = cursor === undefined ? { limit: 50 } : { limit: 50, cursor };
  switch (props.inventoryModule) {
    case 'models': return adapter.listModels(options);
    case 'robots': return adapter.listRobots(options);
    case 'skills': return adapter.listSkills(options);
    case 'tools': return adapter.listTools(options);
    case 'knowledge': return adapter.listKnowledge(options);
    case 'audit': return adapter.listAuditEvents(options);
  }
}

async function loadPage(cursor?: string): Promise<void> {
  if (cursor === undefined) {
    status.value = 'loading';
    safeError.value = undefined;
    paginationError.value = undefined;
  }
  try {
    const page = await request(cursor);
    const mapped = page.items.map((item) => presentInventoryItem(props.inventoryModule, item));
    rows.value = cursor === undefined ? mapped : [...rows.value, ...mapped];
    nextCursor.value = page.nextCursor;
    status.value = rows.value.length === 0 ? 'empty' : 'ready';
    safeError.value = rows.value.length === 0 ? { title: copy.value.emptyTitle, message: copy.value.emptyMessage } : undefined;
    paginationError.value = undefined;
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    const presented = presentInventoryError(apiError ?? {}, cursor === undefined ? 'list' : 'pagination');
    if (presented.keepRows && rows.value.length > 0) {
      status.value = 'ready';
      nextCursor.value = undefined;
      paginationError.value = presented.safeError;
      return;
    }
    status.value = presented.status;
    safeError.value = presented.safeError;
  }
}

async function loadNext(): Promise<void> {
  if (!nextCursor.value || paginationLoading.value) return;
  paginationLoading.value = true;
  try { await loadPage(nextCursor.value); } finally { paginationLoading.value = false; }
}

onMounted(() => loadPage());
</script>
