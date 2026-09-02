<template>
  <section class="page-scaffold inventory-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">企业技能草稿</p>
      <h2>{{ draftPresentation?.title ?? '企业技能草稿' }}</h2>
      <p>编辑展示信息并按上传解析、保存、测试、发布四个独立步骤推进。</p>
      <a class="inventory-back-link" href="#/skills" aria-label="返回技能审核列表">返回技能审核</a>
    </header>
    <InlineNotice>包事实由服务端解析产生，技术名称、包摘要、文件数量和总量只读；浏览器不展示包正文。</InlineNotice>
    <PageState v-if="status !== 'ready' && safeError" :status="status" :safe-error="safeError" />
    <PageState v-else-if="status !== 'ready'" :status="status" />
    <template v-else-if="draft && draftPresentation">
      <section class="admin-form-section" aria-label="展示信息">
        <h3>展示信息</h3>
        <TextInput id="skill-title" label="技能标题" :value="displayTitle" required :disabled="operationLoading" @input="displayTitle = $event" />
        <label for="skill-description">技能描述</label>
        <textarea id="skill-description" v-model="displayDescription" :disabled="operationLoading" rows="4" />
        <TextInput id="skill-version" label="企业版本" :value="semanticVersion" required :disabled="operationLoading" @input="semanticVersion = $event" />
        <SelectShell id="skill-usage-scope" label="使用范围" :value="usageScope" :options="usageScopeSelectOptions" :disabled="operationLoading" @change="onUsageScopeChange" />
        <p class="form-help">受限范围依赖用户与权限模块提供真实授权对象，SSO/RBAC 接入前不可选择。</p>
        <p v-if="metadataError" class="field-error">{{ metadataError }}</p>
        <AdminButton :disabled="operationLoading" :loading="saveLoading" label="保存企业技能草稿" @click="saveMetadata">{{ saveLoading ? '保存中' : '保存草稿' }}</AdminButton>
      </section>

      <section v-for="section in draftPresentation.immutableSections" :key="section.title" class="inventory-detail-section" :aria-label="section.title">
        <h3>{{ section.title }}</h3>
        <dl class="inventory-detail">
          <template v-for="row in section.rows">
            <dt :key="`${section.title}-${row.label}-label`">{{ row.label }}</dt>
            <dd :key="`${section.title}-${row.label}-value`">{{ row.value }}</dd>
          </template>
        </dl>
      </section>

      <section class="review-status-line" aria-label="草稿测试状态">
        <AdminBadge :tone="draftPresentation.testTone">{{ draftPresentation.testLabel }}</AdminBadge>
        <span>{{ draftPresentation.publishHint }}</span>
      </section>

      <section class="review-actions" aria-label="草稿操作">
        <AdminButton variant="secondary" :disabled="operationLoading" :loading="testLoading" label="运行企业技能草稿测试" @click="startTest">{{ testLoading ? '测试中' : '运行测试' }}</AdminButton>
        <AdminButton :disabled="operationLoading || !draftPresentation.canPublish" :loading="publishLoading" label="发布企业技能草稿" @click="publishDraft">{{ publishLoading ? '发布中' : '发布' }}</AdminButton>
      </section>

      <InlineNotice v-if="operationNotice">{{ operationNotice }}</InlineNotice>
      <InlineNotice v-if="operationError">{{ operationError }}</InlineNotice>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AdminPageStatus, SafeErrorSummary } from '../../adapters/admin-adapter';
import { AdminApiError } from '../../adapters/admin-api-error';
import { getAdminAdapter } from '../../app/admin-runtime';
import { presentInventoryError } from '../../presentation/read-only-inventory';
import { presentEnterpriseSkillDraft, presentSkillLifecycleError, presentSkillOperationState, validateEnterpriseSkillMetadata } from '../../presentation/skill-lifecycle-presentation';
import type { EnterpriseSkillDraft } from '@robothree/contracts/skill-lifecycle/v1alpha1';
import AdminBadge from '../../components/ui/AdminBadge.vue';
import AdminButton from '../../components/ui/AdminButton.vue';
import InlineNotice from '../../components/state/InlineNotice.vue';
import PageState from '../../components/state/PageState.vue';
import SelectShell from '../../components/ui/SelectShell.vue';
import TextInput from '../../components/ui/TextInput.vue';

const props = defineProps<{ skillId: string }>();
const status = ref<AdminPageStatus>('loading');
const safeError = ref<SafeErrorSummary>();
const draft = ref<EnterpriseSkillDraft>();
const displayTitle = ref('');
const displayDescription = ref('');
const semanticVersion = ref('');
const usageScope = ref<EnterpriseSkillDraft['metadata']['usageScope']>('enterprise_all');
const allowedSubjectIds = ref<readonly string[]>([]);
const metadataError = ref('');
const operationNotice = ref('');
const operationError = ref('');
const saveLoading = ref(false);
const testLoading = ref(false);
const publishLoading = ref(false);
const operationLoading = computed(() => saveLoading.value || testLoading.value || publishLoading.value);
const draftPresentation = computed(() => draft.value === undefined ? undefined : presentEnterpriseSkillDraft(draft.value));
const usageScopeSelectOptions: readonly Readonly<{ value: EnterpriseSkillDraft['metadata']['usageScope']; label: string; disabled?: boolean }>[] = [
  { value: 'enterprise_all', label: '全企业' },
  { value: 'restricted', label: '受限范围（权限模块接入后开放）', disabled: true }
];

async function loadDraft(): Promise<void> {
  status.value = 'loading';
  safeError.value = undefined;
  try {
    const value = await getAdminAdapter().getEnterpriseSkillDraft({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'get_enterprise_skill_draft',
      queryId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      skillId: props.skillId
    });
    draft.value = value;
    displayTitle.value = value.metadata.displayTitle;
    displayDescription.value = value.metadata.displayDescription;
    semanticVersion.value = value.metadata.semanticVersion;
    usageScope.value = value.metadata.usageScope;
    allowedSubjectIds.value = value.metadata.allowedSubjectIds;
    status.value = 'ready';
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    const presented = presentInventoryError(apiError ?? {}, 'detail');
    status.value = presented.status;
    safeError.value = { title: '无法读取企业技能草稿', message: presentSkillLifecycleError(apiError ?? {}) };
  }
}

async function saveMetadata(): Promise<void> {
  const current = draft.value;
  if (current === undefined || operationLoading.value) return;
  const metadata = {
    displayTitle: displayTitle.value.trim(),
    displayDescription: displayDescription.value.trim(),
    semanticVersion: semanticVersion.value.trim(),
    usageScope: usageScope.value,
    allowedSubjectIds: usageScope.value === 'enterprise_all' ? [] : [...allowedSubjectIds.value]
  };
  const validation = validateEnterpriseSkillMetadata(metadata);
  if (validation !== undefined) {
    metadataError.value = validation;
    return;
  }
  metadataError.value = '';
  await runOperation(saveLoading, async () => {
    await getAdminAdapter().updateEnterpriseSkillDraftMetadata({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'update_enterprise_skill_draft_metadata',
      commandId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      skillId: current.skillId,
      expectedDraftRevision: current.draftRevision,
      metadata
    });
    operationNotice.value = '展示信息保存请求已返回，草稿详情已刷新。';
    await loadDraft();
  });
}

function onUsageScopeChange(value: string): void {
  if (value === 'restricted') return;
  usageScope.value = value as EnterpriseSkillDraft['metadata']['usageScope'];
}

async function startTest(): Promise<void> {
  const current = draft.value;
  if (current === undefined || operationLoading.value) return;
  await runOperation(testLoading, async () => {
    const receipt = await getAdminAdapter().startEnterpriseSkillDraftTest({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'start_enterprise_skill_draft_test',
      commandId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      skillId: current.skillId,
      expectedDraftRevision: current.draftRevision,
      testInput: '请执行企业技能草稿安全验证。'
    });
    if (receipt.operationId !== undefined) {
      const operation = await getAdminAdapter().queryEnterpriseSkillDraftTest({
        contractVersion: 'skill-lifecycle.v1alpha1',
        kind: 'query_enterprise_skill_draft_test',
        queryId: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        operationId: receipt.operationId
      });
      operationNotice.value = `测试请求${presentSkillOperationState(operation.state)}，草稿详情已刷新。`;
    } else {
      operationNotice.value = '测试请求已返回，草稿详情已刷新。';
    }
    await loadDraft();
  });
}

async function publishDraft(): Promise<void> {
  const current = draft.value;
  const currentPresentation = draftPresentation.value;
  if (current === undefined || currentPresentation === undefined || !currentPresentation.canPublish || operationLoading.value) return;
  await runOperation(publishLoading, async () => {
    await getAdminAdapter().publishEnterpriseSkillDraft({
      contractVersion: 'skill-lifecycle.v1alpha1',
      kind: 'publish_enterprise_skill_draft',
      commandId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      skillId: current.skillId,
      expectedDraftRevision: current.draftRevision
    });
    operationNotice.value = '发布请求已返回，技能发布事实以服务端状态为准。';
    await loadDraft();
  });
}

async function runOperation(flag: { value: boolean }, operation: () => Promise<void>): Promise<void> {
  flag.value = true;
  operationError.value = '';
  operationNotice.value = '';
  try {
    await operation();
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    operationError.value = presentSkillLifecycleError(apiError ?? {});
    if (apiError?.code === 'skilllifecycle.revision_conflict') {
      await loadDraft();
    }
  } finally {
    flag.value = false;
  }
}

onMounted(() => loadDraft());
</script>
