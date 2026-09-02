<template>
  <section class="page-scaffold inventory-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">技能审核</p>
      <h2>{{ presentation?.title ?? '技能审核详情' }}</h2>
      <p>{{ presentation?.decisionHint ?? '仅展示服务端返回的安全审核事实。' }}</p>
      <a class="inventory-back-link" href="#/skills" aria-label="返回技能审核列表">返回技能审核</a>
    </header>
    <InlineNotice>测试身份 / 非生产环境：审核操作只调用真实技能生命周期 Adapter，不使用本地假成功。</InlineNotice>
    <PageState v-if="status !== 'ready' && safeError" :status="status" :safe-error="safeError" />
    <PageState v-else-if="status !== 'ready'" :status="status" />
    <template v-else-if="detail && presentation">
      <div class="review-status-line">
        <AdminBadge :tone="presentation.stateTone">{{ presentation.stateLabel }}</AdminBadge>
        <span>{{ presentation.decisionHint }}</span>
      </div>
      <section v-for="section in presentation.sections" :key="section.title" class="inventory-detail-section" :aria-label="section.title">
        <h3>{{ section.title }}</h3>
        <dl class="inventory-detail">
          <template v-for="row in section.rows">
            <dt :key="`${section.title}-${row.label}-label`">{{ row.label }}</dt>
            <dd :key="`${section.title}-${row.label}-value`">{{ row.value }}</dd>
          </template>
        </dl>
      </section>
      <InlineNotice v-if="operationNotice">{{ operationNotice }}</InlineNotice>
      <InlineNotice v-if="operationError">{{ operationError }}</InlineNotice>
      <section v-if="presentation.canDecide" class="review-actions" aria-label="技能审核操作">
        <AdminButton :disabled="operationLoading" :loading="operationLoading" label="通过并发布技能" @click="approve">通过并发布</AdminButton>
        <AdminButton variant="danger" :disabled="operationLoading" :loading="operationLoading" label="驳回技能提交" @click="showReject">驳回</AdminButton>
      </section>
      <section v-if="rejectVisible" class="review-reject-panel" aria-label="驳回原因">
        <label for="skill-reject-reason">安全驳回原因</label>
        <textarea id="skill-reject-reason" v-model="rejectReason" :disabled="operationLoading" rows="4" />
        <p v-if="rejectError" class="field-error">{{ rejectError }}</p>
        <div class="review-actions">
          <AdminButton variant="danger" :disabled="operationLoading" :loading="operationLoading" label="确认驳回技能提交" @click="reject">确认驳回</AdminButton>
          <AdminButton variant="secondary" :disabled="operationLoading" label="取消驳回" @click="rejectVisible = false">取消</AdminButton>
        </div>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AdminPageStatus, SafeErrorSummary } from '../../adapters/admin-adapter';
import { AdminApiError } from '../../adapters/admin-api-error';
import { getAdminAdapter } from '../../app/admin-runtime';
import { presentInventoryError } from '../../presentation/read-only-inventory';
import { presentSkillLifecycleError, presentSkillSubmissionDetail, validateSkillRejectionReason } from '../../presentation/skill-lifecycle-presentation';
import type { SkillSubmissionDetailPresentation } from '../../presentation/skill-lifecycle-presentation';
import AdminBadge from '../../components/ui/AdminBadge.vue';
import AdminButton from '../../components/ui/AdminButton.vue';
import InlineNotice from '../../components/state/InlineNotice.vue';
import PageState from '../../components/state/PageState.vue';
import type { SkillSubmissionDetail } from '@robothree/contracts/skill-lifecycle/v1alpha1';

const props = defineProps<{ submissionId: string }>();
const status = ref<AdminPageStatus>('loading');
const detail = ref<SkillSubmissionDetail>();
const safeError = ref<SafeErrorSummary>();
const operationLoading = ref(false);
const operationNotice = ref('');
const operationError = ref('');
const rejectVisible = ref(false);
const rejectReason = ref('');
const rejectError = ref('');
const presentation = computed<SkillSubmissionDetailPresentation | undefined>(() => detail.value === undefined ? undefined : presentSkillSubmissionDetail(detail.value));

async function loadDetail(): Promise<void> {
  status.value = 'loading';
  safeError.value = undefined;
  try {
    detail.value = await getAdminAdapter().getSkillSubmission({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'get_skill_submission',
      queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      submissionId: props.submissionId
    });
    status.value = 'ready';
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    const presented = presentInventoryError(apiError ?? {}, 'detail');
    status.value = presented.status;
    safeError.value = { title: '无法读取技能审核', message: presentSkillLifecycleError(apiError ?? {}) };
  }
}

async function reloadAfterOperation(): Promise<void> {
  await loadDetail();
  try {
    await getAdminAdapter().listSkillSubmissions({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'list_skill_submissions',
      queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      limit: 50
    });
  } catch {
    if (!operationError.value) operationError.value = '审核详情已刷新，审核列表稍后会自动同步。';
  }
}

async function approve(): Promise<void> {
  const current = detail.value;
  if (current === undefined || current.state !== 'pending_review' || operationLoading.value) return;
  await runOperation(async () => {
    await getAdminAdapter().approveSkillSubmission({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'approve_skill_submission',
      commandId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      submissionId: current.submissionId,
      expectedSubmissionRevision: current.submissionRevision
    });
    operationNotice.value = '审核结果已返回，详情和审核列表已刷新。';
    await reloadAfterOperation();
  });
}

function showReject(): void {
  rejectVisible.value = true;
  rejectError.value = '';
  operationError.value = '';
}

async function reject(): Promise<void> {
  const current = detail.value;
  if (current === undefined || current.state !== 'pending_review' || operationLoading.value) return;
  const reason = rejectReason.value.trim();
  const validation = validateSkillRejectionReason(reason);
  if (validation !== undefined) {
    rejectError.value = validation;
    return;
  }
  await runOperation(async () => {
    await getAdminAdapter().rejectSkillSubmission({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'reject_skill_submission',
      commandId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      submissionId: current.submissionId,
      expectedSubmissionRevision: current.submissionRevision,
      reason
    });
    operationNotice.value = '审核结果已返回，详情和审核列表已刷新。';
    rejectVisible.value = false;
    rejectReason.value = '';
    await reloadAfterOperation();
  });
}

async function runOperation(operation: () => Promise<void>): Promise<void> {
  operationLoading.value = true;
  operationError.value = '';
  operationNotice.value = '';
  try {
    await operation();
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    operationError.value = presentSkillLifecycleError(apiError ?? {});
    if (apiError?.code === 'skilllifecycle.revision_conflict' || apiError?.code === 'skilllifecycle.submission_conflict') {
      await reloadAfterOperation();
    }
  } finally {
    operationLoading.value = false;
  }
}

onMounted(() => loadDetail());
</script>
