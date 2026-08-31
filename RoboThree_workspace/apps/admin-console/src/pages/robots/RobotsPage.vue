<template>
  <section class="page-scaffold robot-review-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">机器人管理</p>
      <h2>发布审核</h2>
      <p>审核用户已测试并提交的机器人版本。审核通过后，该精确版本才会进入企业机器人目录。</p>
    </header>
    <InlineNotice>测试身份 / 非生产环境：本页不创建机器人，只处理用户提交的不可变版本。</InlineNotice>
    <PageState v-if="status !== 'ready' && safeError" :status="status" :safe-error="safeError" />
    <PageState v-else-if="status !== 'ready'" :status="status" />
    <template v-else>
      <SelectShell id="robot-review-state" label="审核状态" :value="stateFilter" :options="stateOptions" @change="changeState" />
      <AdminTable :columns="columns" :empty="reviews.length === 0" caption="机器人发布审核">
        <template #empty><TableEmptyState title="暂无审核记录" message="当前状态下没有机器人提交记录。" /></template>
        <tr v-for="review in reviews" :key="review.submissionId">
          <td><a :href="`#/robots/${review.submissionId}`">{{ review.name }}</a><small class="robot-review-id">{{ review.robotId }}</small></td>
          <td>{{ review.creatorDisplayName }}</td><td>{{ review.semanticVersion }}</td>
          <td><AdminBadge :tone="review.state.tone">{{ review.state.label }}</AdminBadge></td>
          <td>{{ formatTime(review.submittedAt) }}</td><td><a :href="`#/robots/${review.submissionId}`" :aria-label="`查看 ${review.name} 的审核详情`">查看审核</a></td>
        </tr>
      </AdminTable>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { RobotReviewSummary } from '@robothree/contracts/agent-lifecycle/v1alpha1';
import type { AdminPageStatus, SafeErrorSummary } from '../../adapters/admin-adapter';
import { AdminApiError } from '../../adapters/admin-api-error';
import { getAdminAdapter } from '../../app/admin-runtime';
import { presentInventoryError } from '../../presentation/read-only-inventory';
import { presentRobotReviewSummary, robotReviewStateOptions } from '../../presentation/robot-review-presentation';
import type { TableColumn } from '../../types/admin-ui';
import AdminBadge from '../../components/ui/AdminBadge.vue';
import AdminTable from '../../components/ui/AdminTable.vue';
import InlineNotice from '../../components/state/InlineNotice.vue';
import PageState from '../../components/state/PageState.vue';
import SelectShell from '../../components/ui/SelectShell.vue';
import TableEmptyState from '../../components/ui/TableEmptyState.vue';

type ReviewState = 'pending_review' | 'approved' | 'rejected' | 'withdrawn';
type PresentedReview = ReturnType<typeof presentRobotReviewSummary>;
const columns: readonly TableColumn[] = [
  { key: 'robot', label: '机器人' }, { key: 'creator', label: '创建者' }, { key: 'version', label: '版本' },
  { key: 'state', label: '状态' }, { key: 'submitted', label: '提交时间' }, { key: 'action', label: '操作' },
];
const stateOptions = robotReviewStateOptions;
const status = ref<AdminPageStatus>('loading');
const safeError = ref<SafeErrorSummary>();
const reviews = ref<PresentedReview[]>([]);
const stateFilter = ref<ReviewState>('pending_review');
onMounted(loadReviews);

async function loadReviews(): Promise<void> {
  status.value = 'loading'; safeError.value = undefined;
  try {
    const page = await getAdminAdapter().listRobotReviews(stateFilter.value);
    reviews.value = page.items.map((item: RobotReviewSummary) => presentRobotReviewSummary(item)); status.value = 'ready';
  } catch (error) {
    const presented = presentInventoryError(error instanceof AdminApiError ? error : {}, 'list');
    status.value = presented.status; safeError.value = presented.safeError;
  }
}
function changeState(value: string): void { stateFilter.value = value as ReviewState; void loadReviews(); }
function formatTime(value: string): string { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
</script>

<style scoped>.robot-review-id { display: block; margin-top: 0.25rem; color: var(--admin-color-text-muted); }</style>
