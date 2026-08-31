<template>
  <section class="page-scaffold model-detail-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">模型管理</p>
      <h2>{{ detail?.displayName ?? '模型详情' }}</h2>
      <p>查看企业模型配置。访问密钥只展示配置状态，不显示明文、引用或片段。</p>
      <a class="inventory-back-link" href="#/models">返回模型管理</a>
    </header>
    <InlineNotice>测试身份 / 非生产环境：当前写入链路仅用于 internal-trial，不代表 production identity 已就绪。</InlineNotice>
    <PageState v-if="status !== 'ready' && safeError" :status="status" :safe-error="safeError" />
    <PageState v-else-if="status !== 'ready'" :status="status" />
    <template v-else-if="detail">
      <div v-if="operationNotice" class="model-operation-notice" role="status">{{ operationNotice }}</div>
      <div v-if="operationError" class="model-operation-error" role="alert">{{ operationError }}</div>
      <section class="model-detail-actions" aria-label="模型操作">
        <a class="admin-button admin-button--secondary" :href="`#/models/${detail.modelId}/edit`" :aria-label="`编辑${detail.displayName}`">编辑模型</a>
        <AdminButton variant="secondary" :disabled="operationLoading" :label="`校验${detail.displayName}连接`" @click="testConnection">
          校验连接
        </AdminButton>
        <AdminButton variant="secondary" :disabled="operationLoading" :label="`${detail.lifecycle === 'enabled' ? '停用' : '启用'}${detail.displayName}`" @click="toggleLifecycle">
          {{ detail.lifecycle === 'enabled' ? '停用模型' : '启用模型' }}
        </AdminButton>
        <AdminButton variant="secondary" :disabled="detail.defaultForNewTasks || operationLoading" :label="`设为默认模型：${detail.displayName}`" @click="setDefault">
          设为默认
        </AdminButton>
      </section>
      <section class="inventory-detail-section" aria-label="模型配置">
        <h3>模型配置</h3>
        <dl class="inventory-detail">
          <template v-for="row in detailRows">
            <dt :key="`${row.label}-label`">{{ row.label }}</dt>
            <dd :key="`${row.label}-value`">{{ row.value }}</dd>
          </template>
        </dl>
      </section>
      <section v-if="detail.lastConnectionCheck.safeReason" class="inventory-detail-section" aria-label="连接说明">
        <h3>连接说明</h3>
        <p class="model-safe-reason">{{ detail.lastConnectionCheck.safeReason }}</p>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, ref } from 'vue';
import type { AdminManagedModelDetail } from '@robothree/contracts/admin-control/v1alpha2';
import type { AdminPageStatus, SafeErrorSummary } from '../../adapters/admin-adapter';
import { AdminApiError } from '../../adapters/admin-api-error';
import { getAdminAdapter } from '../../app/admin-runtime';
import { presentInventoryError } from '../../presentation/read-only-inventory';
import { presentManagedModelDetailRows, presentManagedModelRow } from '../../presentation/model-management-presentation';
import AdminButton from '../../components/ui/AdminButton.vue';
import InlineNotice from '../../components/state/InlineNotice.vue';
import PageState from '../../components/state/PageState.vue';

type RouteLike = Readonly<{ params?: Readonly<Record<string, string | undefined>> }>;

const instance = getCurrentInstance();
const route = computed<RouteLike>(() => {
  const proxy = instance?.proxy as unknown as { $route?: RouteLike } | undefined;
  return proxy?.$route ?? {};
});
const modelId = computed(() => route.value.params?.modelId ?? '');
const status = ref<AdminPageStatus>('loading');
const safeError = ref<SafeErrorSummary>();
const detail = ref<AdminManagedModelDetail>();
const operationLoading = ref(false);
const operationNotice = ref('');
const operationError = ref('');
const detailRows = computed(() => (detail.value === undefined ? [] : presentManagedModelDetailRows(detail.value)));

onMounted(loadDetail);

async function loadDetail(): Promise<void> {
  status.value = 'loading';
  safeError.value = undefined;
  try {
    detail.value = await getAdminAdapter().getManagedModel(modelId.value);
    status.value = 'ready';
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    const presented = presentInventoryError(apiError ?? {}, 'detail');
    status.value = presented.status;
    safeError.value = presented.safeError;
  }
}

async function testConnection(): Promise<void> {
  if (detail.value === undefined) return;
  const current = detail.value;
  await runOperation(async () => {
    const receipt = await getAdminAdapter().testModelConnection({
      contractVersion: 'admin-control.v1alpha2',
      ...newCommandIdentity(),
      kind: 'test_admin_model_connection',
      modelId: current.modelId,
      expectedModelRevision: current.modelRevision
    });
    operationNotice.value = `连接校验已返回：${presentManagedModelRow({ ...current, lastConnectionCheck: receipt.connectionCheck }).connectionLabel}`;
    await loadDetail();
  });
}

async function toggleLifecycle(): Promise<void> {
  if (detail.value === undefined) return;
  const current = detail.value;
  const nextLifecycle = current.lifecycle === 'enabled' ? 'disabled' : 'enabled';
  if (current.defaultForNewTasks && nextLifecycle === 'disabled') {
    const confirmed = window.confirm('停用当前默认模型后，新任务将暂时没有企业默认模型。是否继续？');
    if (!confirmed) return;
  }
  await runOperation(async () => {
    await getAdminAdapter().setModelLifecycle({
      contractVersion: 'admin-control.v1alpha2',
      ...newCommandIdentity(),
      kind: 'set_admin_model_lifecycle',
      modelId: current.modelId,
      expectedModelRevision: current.modelRevision,
      lifecycle: nextLifecycle,
      defaultDisposition: nextLifecycle === 'disabled' && current.defaultForNewTasks
        ? { mode: 'no_default' }
        : { mode: 'unchanged' }
    });
    operationNotice.value = nextLifecycle === 'enabled' ? '模型已提交启用。' : '模型已提交停用。';
    await loadDetail();
  });
}

async function setDefault(): Promise<void> {
  if (detail.value === undefined || detail.value.defaultForNewTasks) return;
  const current = detail.value;
  await runOperation(async () => {
    const page = await getAdminAdapter().listManagedModels({ limit: 100 });
    const selected = page.items.find((item) => item.defaultForNewTasks);
    await getAdminAdapter().setDefaultModel({
      contractVersion: 'admin-control.v1alpha2',
      ...newCommandIdentity(),
      kind: 'set_default_admin_model',
      modelId: current.modelId,
      expectedModelRevision: current.modelRevision,
      expectedCurrentDefault: selected === undefined
        ? { state: 'none' }
        : { state: 'model', modelId: selected.modelId, modelRevision: selected.modelRevision }
    });
    operationNotice.value = '默认模型变更已提交。';
    await loadDetail();
  });
}

async function runOperation(operation: () => Promise<void>): Promise<void> {
  if (operationLoading.value) return;
  operationLoading.value = true;
  operationNotice.value = '';
  operationError.value = '';
  try {
    await operation();
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    operationError.value = apiError?.code === 'revision_conflict'
      ? '模型已被其他操作更新，请刷新后重试。'
      : apiError?.message ?? '模型操作暂不可用。';
    if (apiError?.code === 'revision_conflict') await loadDetail();
  } finally {
    operationLoading.value = false;
  }
}

function newCommandIdentity(): { commandId: string; correlationId: string } {
  return { commandId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
}
</script>
