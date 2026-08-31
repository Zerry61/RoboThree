<template>
  <section class="page-scaffold robot-review-detail">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">机器人管理</p><h2>{{ detail?.name ?? '发布审核' }}</h2>
      <p>核对用户已测试的精确版本。审核结果不会改写原草稿或已运行任务。</p><a class="inventory-back-link" href="#/robots">返回发布审核</a>
    </header>
    <InlineNotice>internal-trial：测试输入和模型输出不会进入审核包。</InlineNotice>
    <PageState v-if="status !== 'ready' && safeError" :status="status" :safe-error="safeError" />
    <PageState v-else-if="status !== 'ready'" :status="status" />
    <template v-else-if="detail">
      <div v-if="operationNotice" class="model-operation-notice" role="status">{{ operationNotice }}</div>
      <div v-if="operationError" class="model-operation-error" role="alert">{{ operationError }}</div>
      <section v-if="decision.canDecide" class="model-detail-actions" aria-label="审核操作">
        <AdminButton :disabled="decision.approveDisabled" :loading="operationLoading" label="通过机器人发布审核" @click="approve">通过并发布</AdminButton>
        <AdminButton variant="secondary" :disabled="decision.rejectDisabled" :loading="operationLoading" label="驳回机器人发布审核" @click="showRejectReason">驳回</AdminButton>
      </section>
      <p v-else class="robot-review-terminal-note">{{ decision.disabledReason }}</p>
      <section v-if="rejectReasonVisible && decision.canDecide" class="robot-reject-form" aria-label="驳回原因">
        <label for="robot-reject-reason">安全驳回原因</label>
        <textarea
          id="robot-reject-reason"
          v-model="rejectReason"
          rows="4"
          :disabled="operationLoading"
          aria-describedby="robot-reject-reason-help"
        />
        <p id="robot-reject-reason-help">只填写可展示给创建者的业务原因，不包含测试输入、模型输出或内部错误。</p>
        <p v-if="rejectReasonError" class="field-shell__error" role="alert">{{ rejectReasonError }}</p>
        <div class="model-detail-actions">
          <AdminButton variant="danger" :disabled="operationLoading" :loading="operationLoading" label="确认驳回机器人发布审核" @click="reject">确认驳回</AdminButton>
          <AdminButton variant="secondary" :disabled="operationLoading" label="取消驳回" @click="cancelReject">取消</AdminButton>
        </div>
      </section>
      <section class="inventory-detail-section"><h3>提交信息</h3><dl class="inventory-detail">
        <template v-for="field in presentation.submissionFields"><dt :key="`${field.label}-label`">{{ field.label }}</dt><dd :key="`${field.label}-value`">{{ presentTimeField(field) }}</dd></template>
        <dt>审核状态</dt><dd><AdminBadge :tone="presentation.state.tone">{{ presentation.state.label }}</AdminBadge></dd>
      </dl></section>
      <section class="inventory-detail-section"><h3>机器人定义</h3><dl class="inventory-detail">
        <template v-for="field in presentation.robotFields"><dt :key="`${field.label}-label`">{{ field.label }}</dt><dd :key="`${field.label}-value`">{{ field.value }}</dd></template>
      </dl></section>
      <section class="inventory-detail-section"><h3>测试结果摘要</h3><p>{{ presentation.testSummary }}</p></section>
      <section class="inventory-detail-section"><h3>行为规则</h3><pre class="robot-behavior-rules">{{ presentation.behaviorRules }}</pre></section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, ref } from 'vue';
import type { RobotReviewDetail } from '@robothree/contracts/agent-lifecycle/v1alpha1';
import type { AdminPageStatus, SafeErrorSummary } from '../../adapters/admin-adapter';
import { AdminApiError } from '../../adapters/admin-api-error';
import { getAdminAdapter } from '../../app/admin-runtime';
import { presentInventoryError } from '../../presentation/read-only-inventory';
import {
  presentRobotReviewDecision,
  presentRobotReviewDetail,
  presentRobotReviewOperationError,
  validateRejectionReason,
  type RobotReviewDetailPresentation,
  type RobotReviewField
} from '../../presentation/robot-review-presentation';
import AdminBadge from '../../components/ui/AdminBadge.vue'; import AdminButton from '../../components/ui/AdminButton.vue';
import InlineNotice from '../../components/state/InlineNotice.vue'; import PageState from '../../components/state/PageState.vue';

type RouteLike = Readonly<{ params?: Readonly<Record<string, string | undefined>> }>;
const instance = getCurrentInstance();
const route = computed<RouteLike>(() => (instance?.proxy as unknown as { $route?: RouteLike } | undefined)?.$route ?? {});
const submissionId = computed(() => route.value.params?.robotId ?? '');
const status = ref<AdminPageStatus>('loading'); const safeError = ref<SafeErrorSummary>(); const detail = ref<RobotReviewDetail>();
const operationLoading = ref(false); const operationNotice = ref(''); const operationError = ref('');
const rejectReasonVisible = ref(false); const rejectReason = ref(''); const rejectReasonError = ref('');
const presentation = computed<RobotReviewDetailPresentation>(() => detail.value === undefined
  ? { title: '发布审核', state: { label: '待审核', tone: 'warning', terminal: false }, submissionFields: [], robotFields: [], testSummary: '', behaviorRules: '' }
  : presentRobotReviewDetail(detail.value));
const decision = computed(() => presentRobotReviewDecision(detail.value?.state ?? 'pending_review', operationLoading.value));
onMounted(loadDetail);
async function loadDetail(): Promise<void> {
  status.value = 'loading'; safeError.value = undefined;
  try { detail.value = await getAdminAdapter().getRobotReview(submissionId.value); status.value = 'ready'; }
  catch (error) { const presented = presentInventoryError(error instanceof AdminApiError ? error : {}, 'detail'); status.value = presented.status; safeError.value = presented.safeError; }
}
async function approve(): Promise<void> {
  if (!detail.value || detail.value.state !== 'pending_review') return; const current = detail.value;
  await runOperation(async () => { await getAdminAdapter().approveRobotReview({ contractVersion: 'agent-lifecycle.v1alpha1', kind: 'approve_robot_review', commandId: crypto.randomUUID(), correlationId: crypto.randomUUID(), submissionId: current.submissionId, expectedSubmissionRevision: current.submissionRevision }); operationNotice.value = '审核结果已返回，详情和审核列表已刷新。'; await reloadAfterOperation(); });
}
function showRejectReason(): void { rejectReasonVisible.value = true; rejectReasonError.value = ''; }
function cancelReject(): void { rejectReasonVisible.value = false; rejectReason.value = ''; rejectReasonError.value = ''; }
async function reject(): Promise<void> {
  if (!detail.value || detail.value.state !== 'pending_review') return;
  const reasonError = validateRejectionReason(rejectReason.value); rejectReasonError.value = reasonError; if (reasonError) return;
  const current = detail.value; const reason = rejectReason.value.trim();
  await runOperation(async () => { await getAdminAdapter().rejectRobotReview({ contractVersion: 'agent-lifecycle.v1alpha1', kind: 'reject_robot_review', commandId: crypto.randomUUID(), correlationId: crypto.randomUUID(), submissionId: current.submissionId, expectedSubmissionRevision: current.submissionRevision, reason }); operationNotice.value = '审核结果已返回，详情和审核列表已刷新。'; rejectReasonVisible.value = false; rejectReason.value = ''; await reloadAfterOperation(); });
}
async function runOperation(operation: () => Promise<void>): Promise<void> {
  if (operationLoading.value) return; operationLoading.value = true; operationError.value = ''; operationNotice.value = '';
  try { await operation(); } catch (error) { const apiError = error instanceof AdminApiError ? error : undefined; operationError.value = presentRobotReviewOperationError(apiError ?? {}); if (apiError?.code === 'agentlifecycle.revision_conflict') await reloadAfterOperation(); } finally { operationLoading.value = false; }
}
async function reloadAfterOperation(): Promise<void> {
  await loadDetail();
  try {
    await getAdminAdapter().listRobotReviews();
  } catch {
    operationError.value = operationError.value || '审核详情已刷新，审核列表稍后会自动同步。';
  }
}
function formatTime(value: string): string { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function presentTimeField(field: RobotReviewField): string {
  return field.label.endsWith('时间') ? formatTime(field.value) : field.value;
}
</script>

<style scoped>
.robot-behavior-rules { margin: 0; white-space: pre-wrap; font: inherit; line-height: 1.6; }
.robot-review-terminal-note { color: var(--admin-color-text-muted); }
.robot-reject-form { display: grid; gap: 0.75rem; margin: 1rem 0; max-width: 42rem; }
.robot-reject-form textarea {
  min-width: 0;
  resize: vertical;
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius-sm);
  padding: 0.75rem;
  font: inherit;
}
.robot-reject-form p { margin: 0; color: var(--admin-color-text-muted); }
</style>
