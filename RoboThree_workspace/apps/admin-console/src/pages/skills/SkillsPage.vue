<template>
  <section class="page-scaffold inventory-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">技能管理</p>
      <h2>技能审核</h2>
      <p>处理用户提交的技能发布审核，并从真实技能生命周期服务读取审核列表。</p>
      <div class="skill-page-actions">
        <SelectShell id="skill-review-state" label="审核状态" :value="stateFilter" :options="stateOptions" @change="onStateChange" />
        <AdminButton variant="secondary" :disabled="loading" :loading="loading" label="刷新技能审核列表" @click="refreshList">{{ loading ? '刷新中' : '刷新' }}</AdminButton>
        <a class="admin-link-button" href="#/skills/new" aria-label="上传企业技能包">上传企业技能包</a>
      </div>
    </header>
    <InlineNotice>测试身份 / 非生产环境：当前页面只展示服务端允许的技能生命周期事实，不代表生产管理能力已就绪。</InlineNotice>
    <PageState v-if="status !== 'ready' && safeError" :status="status" :safe-error="safeError" />
    <PageState v-else-if="status !== 'ready'" :status="status" />
    <template v-else>
      <AdminTable :columns="columns" :empty="rows.length === 0" caption="技能审核列表" :loading="loading && rows.length === 0">
        <template #empty>
          <TableEmptyState title="暂无技能审核记录" message="当前筛选条件下没有可展示的技能提交。" />
        </template>
        <tr v-for="row in rows" :key="row.id">
          <td><a :href="`#${row.detailPath}`" :aria-label="`查看${row.title}审核详情`">{{ row.title }}</a></td>
          <td>{{ row.summary }}</td>
          <td>
            <span v-for="item in row.meta" :key="`${row.id}-${item.label}`" class="inventory-meta">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </span>
          </td>
          <td><AdminBadge :tone="row.stateTone">{{ row.stateLabel }}</AdminBadge></td>
        </tr>
      </AdminTable>
      <div v-if="nextCursor" class="inventory-pagination" aria-label="技能审核分页">
        <AdminButton variant="secondary" :disabled="loading" :loading="loading" :label="loading ? '正在加载下一页技能审核' : '加载下一页技能审核'" @click="loadNext">{{ loading ? '正在加载' : '加载更多' }}</AdminButton>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AdminPageStatus, SafeErrorSummary } from '../../adapters/admin-adapter';
import { AdminApiError } from '../../adapters/admin-api-error';
import { getAdminAdapter } from '../../app/admin-runtime';
import { presentInventoryError } from '../../presentation/read-only-inventory';
import { presentSkillLifecycleError, presentSkillSubmissionRow, skillSubmissionColumns, skillSubmissionStateOptions } from '../../presentation/skill-lifecycle-presentation';
import type { SkillSubmissionRow } from '../../presentation/skill-lifecycle-presentation';
import AdminBadge from '../../components/ui/AdminBadge.vue';
import AdminButton from '../../components/ui/AdminButton.vue';
import AdminTable from '../../components/ui/AdminTable.vue';
import SelectShell from '../../components/ui/SelectShell.vue';
import InlineNotice from '../../components/state/InlineNotice.vue';
import PageState from '../../components/state/PageState.vue';
import TableEmptyState from '../../components/ui/TableEmptyState.vue';
import type { SkillSubmissionDetail } from '@robothree/contracts/skill-lifecycle/v1alpha1';

type SkillSubmissionState = SkillSubmissionDetail['state'];

const status = ref<AdminPageStatus>('loading');
const rows = ref<SkillSubmissionRow[]>([]);
const nextCursor = ref<string>();
const loading = ref(false);
const stateFilter = ref<SkillSubmissionState | ''>('');
const safeError = ref<SafeErrorSummary>();
const columns = skillSubmissionColumns;
const stateOptions = skillSubmissionStateOptions;
const selectedState = computed(() => stateFilter.value === '' ? undefined : stateFilter.value);

async function loadPage(cursor?: string): Promise<void> {
  loading.value = true;
  if (cursor === undefined) {
    status.value = 'loading';
    safeError.value = undefined;
  }
  try {
    const page = await getAdminAdapter().listSkillSubmissions({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'list_skill_submissions',
      queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      ...(selectedState.value === undefined ? {} : { state: selectedState.value }),
      ...(cursor === undefined ? {} : { cursor }),
      limit: 50
    });
    const mapped = page.items.map(presentSkillSubmissionRow);
    rows.value = cursor === undefined ? mapped : [...rows.value, ...mapped];
    nextCursor.value = page.nextCursor;
    status.value = rows.value.length === 0 ? 'empty' : 'ready';
    safeError.value = rows.value.length === 0 ? { title: '暂无技能审核记录', message: '当前筛选条件下没有可展示的技能提交。' } : undefined;
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    const presented = presentInventoryError(apiError ?? {}, cursor === undefined ? 'list' : 'pagination');
    status.value = cursor === undefined ? presented.status : 'ready';
    safeError.value = cursor === undefined ? { title: '无法读取技能审核', message: presentSkillLifecycleError(apiError ?? {}) } : undefined;
    nextCursor.value = undefined;
  } finally {
    loading.value = false;
  }
}

async function loadNext(): Promise<void> {
  if (!nextCursor.value || loading.value) return;
  await loadPage(nextCursor.value);
}

async function refreshList(): Promise<void> {
  if (loading.value) return;
  await loadPage();
}

async function onStateChange(value: string): Promise<void> {
  stateFilter.value = value as SkillSubmissionState | '';
  await loadPage();
}

onMounted(() => loadPage());
</script>
