<template>
  <section class="page-scaffold inventory-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">{{ copy.eyebrow }}</p>
      <h2>{{ detailPresentation?.title ?? `${copy.title}详情` }}</h2>
      <p>{{ detailPresentation?.description ?? '仅展示服务端允许投影的安全字段。' }}</p>
      <a class="inventory-back-link" :href="`#${listPath}`">返回{{ copy.title }}</a>
    </header>
    <InlineNotice>{{ nonProductionNotice }}</InlineNotice>
    <PageState v-if="status !== 'ready' && safeError" :status="status" :safe-error="safeError" />
    <PageState v-else-if="status !== 'ready'" :status="status" />
    <template v-else-if="detailPresentation">
      <div v-if="detailPresentation.notices.length > 0" class="inventory-notices" aria-label="详情提示">
        <InlineNotice v-for="notice in detailPresentation.notices" :key="notice">{{ notice }}</InlineNotice>
      </div>
      <section v-for="section in detailPresentation.sections" :key="section.title" class="inventory-detail-section" :aria-label="section.title">
        <h3>{{ section.title }}</h3>
        <dl class="inventory-detail"><template v-for="row in section.rows"><dt :key="`${section.title}-${row.label}-label`">{{ row.label }}</dt><dd :key="`${section.title}-${row.label}-value`">{{ row.value }}</dd></template></dl>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AdminPageStatus, SafeErrorSummary } from '../../adapters/admin-adapter';
import { AdminApiError } from '../../adapters/admin-api-error';
import { getAdminAdapter } from '../../app/admin-runtime';
import { inventoryCopy, nonProductionNotice, presentDetail, presentInventoryError } from '../../presentation/read-only-inventory';
import type { DetailPresentation, ReadOnlyInventoryModule } from '../../presentation/read-only-inventory';
import PageState from '../state/PageState.vue';
import InlineNotice from '../state/InlineNotice.vue';

type DetailModule = Exclude<ReadOnlyInventoryModule, 'audit'>;
const props = defineProps<{ inventoryModule: DetailModule; resourceId: string }>();
const status = ref<AdminPageStatus>('loading');
const detailPresentation = ref<DetailPresentation>();
const safeError = ref<SafeErrorSummary>();
const copy = computed(() => inventoryCopy[props.inventoryModule]);
const listPath = computed(() => {
  switch (props.inventoryModule) {
    case 'models': return '/models';
    case 'robots': return '/robots';
    case 'skills': return '/skills';
    case 'tools': return '/tools';
    case 'knowledge': return '/knowledge';
  }
});

onMounted(async () => {
  try {
    const adapter = getAdminAdapter();
    const detail = props.inventoryModule === 'models' ? await adapter.getModel(props.resourceId) : props.inventoryModule === 'robots' ? await adapter.getRobot(props.resourceId) : props.inventoryModule === 'skills' ? await adapter.getSkill(props.resourceId) : props.inventoryModule === 'tools' ? await adapter.getTool(props.resourceId) : await adapter.getKnowledge(props.resourceId);
    detailPresentation.value = presentDetail(props.inventoryModule, detail);
    status.value = 'ready';
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    const presented = presentInventoryError(apiError ?? {}, 'detail');
    status.value = presented.status;
    safeError.value = presented.safeError;
  }
});
</script>
