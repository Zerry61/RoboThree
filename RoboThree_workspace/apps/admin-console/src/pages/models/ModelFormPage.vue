<template>
  <section class="page-scaffold model-form-page">
    <header class="page-scaffold__header">
      <p class="page-scaffold__eyebrow">模型管理</p>
      <h2>{{ isNew ? '添加企业模型' : '编辑企业模型' }}</h2>
      <p>配置 OpenAI-compatible 模型。本页不会显示或回传已保存密钥明文。</p>
      <a class="inventory-back-link" :href="backHref">返回模型管理</a>
    </header>
    <InlineNotice>测试身份 / 非生产环境：当前仅用于 internal-trial 管理链路，不代表 production identity 已就绪。</InlineNotice>
    <PageState v-if="status !== 'ready' && safeError" :status="status" :safe-error="safeError" />
    <PageState v-else-if="status !== 'ready'" :status="status" />
    <form v-else class="model-form" @submit.prevent="submit">
      <TextInput
        id="model-display-name"
        label="模型名称"
        :value="form.displayName"
        :error="validation.errors.displayName ?? ''"
        required
        placeholder="例如：企业默认模型"
        @input="updateField('displayName', $event)"
      />
      <ReadonlyField label="供应方" value="OpenAI-compatible" />
      <TextInput
        id="model-endpoint"
        label="服务地址"
        :value="form.endpoint"
        :error="validation.errors.endpoint ?? ''"
        required
        placeholder="https://provider.example/v1"
        help="仅保存服务地址，不在审计中展示完整变更值。"
        @input="updateField('endpoint', $event)"
      />
      <TextInput
        id="model-provider-id"
        label="供应方模型 ID"
        :value="form.providerModelId"
        :error="validation.errors.providerModelId ?? ''"
        required
        placeholder="例如：gpt-compatible"
        @input="updateField('providerModelId', $event)"
      />
      <section class="model-form__credential" aria-label="访问密钥">
        <ReadonlyField label="当前密钥状态" :value="credentialStatusLabel" />
        <div v-if="!isNew" class="model-form__credential-choice">
          <label>
            <input
              type="radio"
              value="retain"
              :checked="form.credentialMode === 'retain'"
              @change="updateCredentialMode('retain')"
            />
            保留现有密钥
          </label>
          <label>
            <input
              type="radio"
              value="replace"
              :checked="form.credentialMode === 'replace'"
              @change="updateCredentialMode('replace')"
            />
            替换密钥
          </label>
        </div>
        <FieldShell
          v-if="isNew || form.credentialMode === 'replace'"
          input-id="model-secret"
          label="访问密钥"
          :error="validation.errors.secret ?? ''"
          required
          help="密钥只随本次提交发送给受控 Adapter，不会展示、复制或写入页面状态。"
        >
          <template #default="{ inputId, describedBy }">
            <input
              :id="inputId"
              :value="form.secret"
              class="text-input"
              type="password"
              autocomplete="off"
              :aria-describedby="describedBy"
              :aria-invalid="validation.errors.secret ? 'true' : 'false'"
              @input="onSecretInput"
            />
          </template>
        </FieldShell>
      </section>
      <div v-if="submitError" class="model-form__error" role="alert">{{ submitError }}</div>
      <div v-if="submitNotice" class="model-form__notice" role="status">{{ submitNotice }}</div>
      <div class="model-form__actions">
        <AdminButton variant="secondary" label="取消" @click="goBack">取消</AdminButton>
        <AdminButton :disabled="submitting" :loading="submitting" label="提交模型配置" @click="submit">
          {{ submitting ? '提交中' : '提交' }}
        </AdminButton>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, ref } from 'vue';
import type { AdminPageStatus, SafeErrorSummary } from '../../adapters/admin-adapter';
import { AdminApiError } from '../../adapters/admin-api-error';
import { getAdminAdapter } from '../../app/admin-runtime';
import { presentManagedCredentialStatus, validateManagedModelForm } from '../../presentation/model-management-presentation';
import type { ManagedModelFormState } from '../../presentation/model-management-presentation';
import AdminButton from '../../components/ui/AdminButton.vue';
import FieldShell from '../../components/ui/FieldShell.vue';
import InlineNotice from '../../components/state/InlineNotice.vue';
import PageState from '../../components/state/PageState.vue';
import ReadonlyField from '../../components/ui/ReadonlyField.vue';
import TextInput from '../../components/ui/TextInput.vue';

type RouteLike = Readonly<{ params?: Readonly<Record<string, string | undefined>> }>;

const instance = getCurrentInstance();
const route = computed<RouteLike>(() => {
  const proxy = instance?.proxy as unknown as { $route?: RouteLike } | undefined;
  return proxy?.$route ?? {};
});
const status = ref<AdminPageStatus>('loading');
const safeError = ref<SafeErrorSummary>();
const submitting = ref(false);
const submitError = ref('');
const submitNotice = ref('');
const modelRevision = ref('');
const credentialStatus = ref<'configured' | 'missing'>('missing');
const modelId = computed(() => route.value.params?.modelId);
const isNew = computed(() => modelId.value === undefined);
const backHref = computed(() => (isNew.value ? '#/models' : `#/models/${modelId.value}`));
const credentialStatusLabel = computed(() => presentManagedCredentialStatus(credentialStatus.value));

const form = ref<ManagedModelFormState>({
  displayName: '',
  endpoint: '',
  providerModelId: '',
  credentialMode: 'replace',
  secret: ''
});
const validation = computed(() => validateManagedModelForm(form.value, isNew.value ? 'create' : 'edit'));

onMounted(load);

async function load(): Promise<void> {
  if (isNew.value) {
    status.value = 'ready';
    return;
  }
  try {
    const detail = await getAdminAdapter().getManagedModel(String(modelId.value));
    form.value = {
      displayName: detail.displayName,
      endpoint: detail.endpoint,
      providerModelId: detail.providerModelId,
      credentialMode: 'retain',
      secret: ''
    };
    modelRevision.value = detail.modelRevision;
    credentialStatus.value = detail.credentialStatus;
    status.value = 'ready';
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    status.value = apiError?.code === 'not_found' ? 'notFound' : apiError?.code === 'permission_denied' ? 'permissionDenied' : 'unavailable';
    safeError.value = {
      title: '无法读取模型配置',
      message: apiError?.message ?? '模型管理能力暂不可用',
      ...(apiError?.correlationId === undefined ? {} : { correlationId: apiError.correlationId })
    };
  }
}

async function submit(): Promise<void> {
  submitError.value = '';
  submitNotice.value = '';
  if (!validation.value.valid || submitting.value) return;
  submitting.value = true;
  const adapter = getAdminAdapter();
  const commandId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  try {
    if (isNew.value) {
      const receipt = await adapter.createModel({
        contractVersion: 'admin-control.v1alpha2',
        commandId,
        correlationId,
        kind: 'create_admin_model',
        displayName: form.value.displayName.trim(),
        providerFamily: 'openai_compatible',
        endpoint: form.value.endpoint.trim(),
        providerModelId: form.value.providerModelId.trim(),
        credential: { mode: 'replace', secret: form.value.secret }
      });
      submitNotice.value = receipt.replayed ? '重复提交已识别，未创建第二个模型版本。' : '模型配置已提交。';
      window.location.hash = `#/models/${receipt.modelId}`;
      return;
    }
    const receipt = await adapter.updateModel({
      contractVersion: 'admin-control.v1alpha2',
      commandId,
      correlationId,
      kind: 'update_admin_model',
      modelId: String(modelId.value),
        expectedModelRevision: modelRevision.value,
        changes: {
        displayName: form.value.displayName.trim(),
        endpoint: form.value.endpoint.trim(),
        providerModelId: form.value.providerModelId.trim(),
        credential: form.value.credentialMode === 'retain'
          ? { mode: 'retain' }
          : { mode: 'replace', secret: form.value.secret }
      }
    });
    submitNotice.value = receipt.replayed ? '重复提交已识别，未创建第二个模型版本。' : '模型配置已提交。';
    window.location.hash = `#/models/${receipt.modelId}`;
  } catch (error) {
    const apiError = error instanceof AdminApiError ? error : undefined;
    submitError.value = apiError?.code === 'revision_conflict'
      ? '模型已被其他操作更新，请刷新后重试。'
      : apiError?.message ?? '模型配置提交失败';
    if (apiError?.code === 'revision_conflict') await load();
  } finally {
    submitting.value = false;
  }
}

function goBack(): void {
  window.location.hash = backHref.value;
}

function updateField(field: keyof ManagedModelFormState, value: string): void {
  form.value = { ...form.value, [field]: value };
}

function updateCredentialMode(mode: ManagedModelFormState['credentialMode']): void {
  form.value = { ...form.value, credentialMode: mode, secret: mode === 'retain' ? '' : form.value.secret };
}

function onSecretInput(event: Event): void {
  updateField('secret', (event.target as HTMLInputElement).value);
}
</script>
