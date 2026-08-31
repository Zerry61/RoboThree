<template>
  <section class="page-scaffold model-management-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">模型管理</p>
      <h2>企业模型</h2>
      <p>配置 internal-trial 可用于新任务的企业模型。密钥只显示配置状态，不回显明文或引用。</p>
    </header>
    <InlineNotice>测试身份 / 非生产环境：当前写入链路仅用于 internal-trial，不代表 production identity 已就绪。</InlineNotice>
    <PageState v-if="status !== 'ready' && safeError" :status="status" :safe-error="safeError" />
    <PageState v-else-if="status !== 'ready'" :status="status" />
    <template v-else>
      <div v-if="operationNotice" class="model-operation-notice" role="status">{{ operationNotice }}</div>
      <div v-if="operationError" class="model-operation-error" role="alert">{{ operationError }}</div>
      <div class="model-toolbar">
        <TextInput
          id="model-search"
          label="搜索模型"
          :value="search"
          placeholder="按模型名称或供应方筛选"
          @input="search = $event"
        />
        <SelectShell
          id="model-lifecycle-filter"
          label="状态筛选"
          :value="lifecycleFilter"
          :options="lifecycleOptions"
          @change="lifecycleFilter = $event"
        />
        <a class="admin-button model-toolbar__create" href="#/models/new" aria-label="添加企业模型">添加模型</a>
      </div>
      <AdminTable :columns="columns" :empty="filteredRows.length === 0" caption="企业模型">
        <template #empty>
          <TableEmptyState title="暂无模型" message="当前筛选条件下没有可展示的模型。可以清空筛选后重试。" />
        </template>
        <tr v-for="row in filteredRows" :key="row.id">
          <td>
            <a :href="`#/models/${row.id}`" :aria-label="`查看${row.displayName}详情`">{{ row.displayName }}</a>
            <span v-if="row.defaultLabel === '企业默认'" class="model-default-label">{{ row.defaultLabel }}</span>
          </td>
          <td><AdminBadge :tone="row.lifecycleTone">{{ row.lifecycleLabel }}</AdminBadge></td>
          <td><AdminBadge :tone="row.connectionTone">{{ row.connectionLabel }}</AdminBadge></td>
          <td>{{ row.credentialLabel }}</td>
          <td class="model-actions">
            <a class="model-action-link" :href="`#/models/${row.id}`" :aria-label="`查看${row.displayName}详情`">详情</a>
            <a class="model-action-link" :href="`#/models/${row.id}/edit`" :aria-label="`编辑${row.displayName}`">编辑</a>
            <AdminButton size="sm" variant="secondary" :disabled="operationLoadingId === row.id" :label="`校验${row.displayName}连接`" @click="testConnection(row.id)">
              校验连接
            </AdminButton>
            <AdminButton
              size="sm"
              variant="secondary"
              :disabled="operationLoadingId === row.id"
              :label="`${row.lifecycleLabel === '已启用' ? '停用' : '启用'}${row.displayName}`"
              @click="toggleLifecycle(row.id)"
            >
              {{ row.lifecycleLabel === '已启用' ? '停用' : '启用' }}
            </AdminButton>
            <AdminButton
              size="sm"
              variant="secondary"
              :disabled="row.defaultLabel === '企业默认' || operationLoadingId === row.id"
              :label="`设为默认模型：${row.displayName}`"
              @click="setDefault(row.id)"
            >
              设为默认
            </AdminButton>
          </td>
        </tr>
      </AdminTable>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AdminManagedModelSummary } from '@robothree/contracts/admin-control/v1alpha2';
import type { AdminPageStatus, SafeErrorSummary } from '../../adapters/admin-adapter';
import { AdminApiError } from '../../adapters/admin-api-error';
import { getAdminAdapter } from '../../app/admin-runtime';
import { presentInventoryError } from '../../presentation/read-only-inventory';
import { presentManagedModelRow } from '../../presentation/model-management-presentation';
import type { ManagedModelRow } from '../../presentation/model-management-presentation';
import type { TableColumn } from '../../types/admin-ui';
import AdminBadge from '../../components/ui/AdminBadge.vue';
import AdminButton from '../../components/ui/AdminButton.vue';
import AdminTable from '../../components/ui/AdminTable.vue';
import InlineNotice from '../../components/state/InlineNotice.vue';
import PageState from '../../components/state/PageState.vue';
import SelectShell from '../../components/ui/SelectShell.vue';
import TableEmptyState from '../../components/ui/TableEmptyState.vue';
import TextInput from '../../components/ui/TextInput.vue';

const columns: readonly TableColumn[] = [
  { key: 'name', label: '模型名称' },
  { key: 'lifecycle', label: '状态' },
  { key: 'connection', label: '连接校验' },
  { key: 'credential', label: '访问密钥' },
  { key: 'actions', label: '操作' }
];
const lifecycleOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' }
] as const;

const status = ref<AdminPageStatus>('loading');
const safeError = ref<SafeErrorSummary>();
const models = ref<AdminManagedModelSummary[]>([]);
const search = ref('');
const lifecycleFilter = ref('all');
const operationLoadingId = ref('');
const operationNotice = ref('');
const operationError = ref('');

const rows = computed(() => models.value.map(presentManagedModelRow));
const filteredRows = computed(() => rows.value.filter(matchesFilters));

onMounted(() => loadModels());

async function loadModels(): Promise<void> {
  status.value = 'loading';
  safeError.value = undefined;
  try {
    const page = await getAdminAdapter().listManagedModels({ limit: 100 });
    models.value = [...page.items];
    status.value = models.value.length === 0 ? 'empty' : 'ready';
    safeError.value = models.value.length === 0
      ? { title: '暂无企业模型', message: '当前管理身份还没有可展示的企业模型。' }
      : undefined;
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    const presented = presentInventoryError(apiError ?? {}, 'list');
    status.value = presented.status;
    safeError.value = presented.safeError;
  }
}

function matchesFilters(row: ManagedModelRow): boolean {
  const query = search.value.trim().toLowerCase();
  const matchesQuery = query.length === 0
    || row.displayName.toLowerCase().includes(query)
    || row.provider.toLowerCase().includes(query);
  const lifecycle = getModel(row.id)?.lifecycle;
  const matchesLifecycle = lifecycleFilter.value === 'all' || lifecycle === lifecycleFilter.value;
  return matchesQuery && matchesLifecycle;
}

async function testConnection(modelId: string): Promise<void> {
  const model = getModel(modelId);
  if (model === undefined) return;
  await runOperation(modelId, async () => {
    const receipt = await getAdminAdapter().testModelConnection({
      contractVersion: 'admin-control.v1alpha2',
      ...newCommandIdentity(),
      kind: 'test_admin_model_connection',
      modelId,
      expectedModelRevision: model.modelRevision
    });
    operationNotice.value = `连接校验已返回：${presentManagedModelRow({ ...model, lastConnectionCheck: receipt.connectionCheck }).connectionLabel}`;
    await loadModels();
  });
}

async function toggleLifecycle(modelId: string): Promise<void> {
  const model = getModel(modelId);
  if (model === undefined) return;
  const nextLifecycle = model.lifecycle === 'enabled' ? 'disabled' : 'enabled';
  if (model.defaultForNewTasks && nextLifecycle === 'disabled') {
    const confirmed = window.confirm('停用当前默认模型后，新任务将暂时没有企业默认模型。是否继续？');
    if (!confirmed) return;
  }
  await runOperation(modelId, async () => {
    await getAdminAdapter().setModelLifecycle({
      contractVersion: 'admin-control.v1alpha2',
      ...newCommandIdentity(),
      kind: 'set_admin_model_lifecycle',
      modelId,
      expectedModelRevision: model.modelRevision,
      lifecycle: nextLifecycle,
      defaultDisposition: nextLifecycle === 'disabled' && model.defaultForNewTasks
        ? { mode: 'no_default' }
        : { mode: 'unchanged' }
    });
    operationNotice.value = nextLifecycle === 'enabled' ? '模型已提交启用。' : '模型已提交停用。';
    await loadModels();
  });
}

async function setDefault(modelId: string): Promise<void> {
  const model = getModel(modelId);
  if (model === undefined || model.defaultForNewTasks) return;
  await runOperation(modelId, async () => {
    const current = models.value.find((item) => item.defaultForNewTasks);
    await getAdminAdapter().setDefaultModel({
      contractVersion: 'admin-control.v1alpha2',
      ...newCommandIdentity(),
      kind: 'set_default_admin_model',
      modelId,
      expectedModelRevision: model.modelRevision,
      expectedCurrentDefault: current === undefined
        ? { state: 'none' }
        : { state: 'model', modelId: current.modelId, modelRevision: current.modelRevision }
    });
    operationNotice.value = '默认模型变更已提交。';
    await loadModels();
  });
}

async function runOperation(modelId: string, operation: () => Promise<void>): Promise<void> {
  if (operationLoadingId.value) return;
  operationLoadingId.value = modelId;
  operationNotice.value = '';
  operationError.value = '';
  try {
    await operation();
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    operationError.value = apiError?.code === 'revision_conflict'
      ? '模型已被其他操作更新，请刷新后重试。'
      : apiError?.message ?? '模型操作暂不可用。';
    if (apiError?.code === 'revision_conflict') await loadModels();
  } finally {
    operationLoadingId.value = '';
  }
}

function getModel(modelId: string): AdminManagedModelSummary | undefined {
  return models.value.find((item) => item.modelId === modelId);
}

function newCommandIdentity(): { commandId: string; correlationId: string } {
  return { commandId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
}
</script>
