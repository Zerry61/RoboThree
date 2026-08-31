import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createUnavailableAdminAdapter } from '../../src/adapters/unavailable-admin-adapter';
import { installAdminAdapter } from '../../src/app/admin-runtime';
import ModelDetailPage from '../../src/pages/models/ModelDetailPage.vue';
import ModelFormPage from '../../src/pages/models/ModelFormPage.vue';
import ModelsPage from '../../src/pages/models/ModelsPage.vue';
import type { AdminAdapter } from '../../src/adapters/admin-adapter';
import { AdminApiError } from '../../src/adapters/admin-api-error';
import type {
  AdminManagedModelDetail,
  AdminManagedModelPage,
  AdminModelConnectionCheck,
  AdminModelMutationReceipt,
  CreateAdminModelCommand,
  TestAdminModelConnectionCommand,
  UpdateAdminModelCommand
} from '@robothree/contracts/admin-control/v1alpha2';
import type VueType from 'vue';
import type { VueConstructor } from 'vue';

const revision = `sha256:${'d'.repeat(64)}`;
const nextRevision = `sha256:${'e'.repeat(64)}`;
const correlationId = '00000000-0000-4000-8000-000000000005';
const endpoint = ['https://service.example.test', '/v1'].join('');

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('Admin model management VS1 pages', () => {
  it('renders managed model list actions without delete or fake success text', async () => {
    installManagedModelAdapter();
    const wrapper = mount(ModelsPage as unknown as VueConstructor<VueType>);
    await flushAsync();

    const text = wrapper.text();
    expect(text).toContain('企业模型');
    expect(text).toContain('企业默认模型');
    expect(text).toContain('校验连接');
    expect(text).toContain('设为默认');
    expect(text).not.toContain('删除');
    expect(text).not.toContain('创建成功');
    expect(text).not.toContain('保存成功');
    expect(text).not.toContain('测试成功');
    expect(text).not.toContain('API Key');
    expect(text).not.toContain('Credential Reference');
  });

  it('submits create model through the adapter with replace credential only after receipt', async () => {
    let command: CreateAdminModelCommand | undefined;
    installManagedModelAdapter({
      async createModel(value) {
        command = value;
        return receipt('model.created');
      }
    });
    const wrapper = mount(ModelFormPage as unknown as VueConstructor<VueType>, {
      mocks: { $route: { params: {} } }
    });
    await flushAsync();

    await wrapper.find('#model-display-name').setValue('企业默认模型');
    await wrapper.find('#model-endpoint').setValue(endpoint);
    await wrapper.find('#model-provider-id').setValue('gpt-compatible');
    await wrapper.find('#model-secret').setValue('TEST_ONLY_ADMIN_MODEL_SECRET_SENTINEL');
    await wrapper.find('button[aria-label="提交模型配置"]').trigger('click');
    await flushAsync();
    await flushAsync();

    expect(command).toMatchObject({
      contractVersion: 'admin-control.v1alpha2',
      kind: 'create_admin_model',
      displayName: '企业默认模型',
      providerFamily: 'openai_compatible',
      providerModelId: 'gpt-compatible',
      credential: { mode: 'replace', secret: 'TEST_ONLY_ADMIN_MODEL_SECRET_SENTINEL' }
    });
    expect(window.location.hash).toBe('#/models/model.created');
    expect(wrapper.text()).not.toContain('保存成功');
  });

  it('submits edit model with expected revision and retain credential by default', async () => {
    let command: UpdateAdminModelCommand | undefined;
    installManagedModelAdapter({
      async updateModel(value) {
        command = value;
        return receipt('model.default');
      }
    });
    const wrapper = mount(ModelFormPage as unknown as VueConstructor<VueType>, {
      mocks: { $route: { params: { modelId: 'model.default' } } }
    });
    await flushAsync();

    await wrapper.find('#model-display-name').setValue('企业默认模型修订');
    await wrapper.find('button[aria-label="提交模型配置"]').trigger('click');
    await flushAsync();

    expect(command).toMatchObject({
      contractVersion: 'admin-control.v1alpha2',
      kind: 'update_admin_model',
      modelId: 'model.default',
      expectedModelRevision: revision,
      changes: {
        displayName: '企业默认模型修订',
        credential: { mode: 'retain' }
      }
    });
  });

  it('reloads latest model state on revision conflict without leaking raw error fields', async () => {
    let reads = 0;
    let command: UpdateAdminModelCommand | undefined;
    installManagedModelAdapter({
      async getManagedModel() {
        reads += 1;
        return reads === 1 ? model : { ...model, modelRevision: nextRevision, displayName: '服务端最新模型' };
      },
      async updateModel(value) {
        command = value;
        throw new AdminApiError('revision_conflict', '模型已被其他操作更新，请刷新后重试。', correlationId);
      }
    });
    const wrapper = mount(ModelFormPage as unknown as VueConstructor<VueType>, {
      mocks: { $route: { params: { modelId: 'model.default' } } }
    });
    await flushAsync();

    await wrapper.find('#model-display-name').setValue('本地编辑');
    await wrapper.find('button[aria-label="提交模型配置"]').trigger('click');
    await flushAsync();
    await flushAsync();
    await flushAsync();

    expect(command).toMatchObject({
      kind: 'update_admin_model',
      modelId: 'model.default',
      expectedModelRevision: revision
    });
    expect(reads).toBeGreaterThanOrEqual(2);
    expect((wrapper.find('#model-display-name').element as HTMLInputElement).value).toBe('服务端最新模型');
    expect(wrapper.text()).not.toContain(correlationId);
    expect(wrapper.text()).not.toContain('stack');
  });

  it('runs connection checks from list and detail pages through current model revisions', async () => {
    const commands: TestAdminModelConnectionCommand[] = [];
    installManagedModelAdapter({
      async testModelConnection(value) {
        commands.push(value);
        return {
          ...receipt(value.modelId),
          kind: 'admin_model_connection_test_receipt',
          connectionCheck: connectionCheck('success')
        };
      }
    });

    const list = mount(ModelsPage as unknown as VueConstructor<VueType>);
    await flushAsync();
    await list.find('button[aria-label="校验企业默认模型连接"]').trigger('click');
    await flushAsync();
    expect(commands[0]).toMatchObject({
      kind: 'test_admin_model_connection',
      modelId: 'model.default',
      expectedModelRevision: revision
    });
    expect(list.text()).toContain('连接校验已返回：连接正常');

    const detail = mount(ModelDetailPage as unknown as VueConstructor<VueType>, {
      mocks: { $route: { params: { modelId: 'model.default' } } }
    });
    await flushAsync();
    await detail.find('button[aria-label="校验企业默认模型连接"]').trigger('click');
    await flushAsync();
    expect(commands[1]).toMatchObject({
      kind: 'test_admin_model_connection',
      modelId: 'model.default',
      expectedModelRevision: revision
    });
  });
});

function installManagedModelAdapter(overrides: Partial<AdminAdapter> = {}): void {
  installAdminAdapter({
    ...createUnavailableAdminAdapter(),
    async listManagedModels() { return managedModelPage([model, secondaryModel]); },
    async getManagedModel() { return model; },
    async createModel() { return receipt('model.created'); },
    async updateModel() { return receipt('model.default'); },
    async testModelConnection(value) {
      return {
        ...receipt(value.modelId),
        kind: 'admin_model_connection_test_receipt',
        connectionCheck: connectionCheck('success')
      };
    },
    async setModelLifecycle(value) { return receipt(value.modelId); },
    async setDefaultModel(value) { return receipt(value.modelId); },
    ...overrides
  } satisfies AdminAdapter);
}

function managedModelPage(items: AdminManagedModelDetail[]): AdminManagedModelPage {
  return { contractVersion: 'admin-control.v1alpha2', queryRevision: revision, items };
}

function receipt(modelId: string): AdminModelMutationReceipt {
  return {
    kind: 'admin_model_mutation_receipt',
    contractVersion: 'admin-control.v1alpha2',
    commandId: '11111111-1111-4111-8111-111111111111',
    correlationId,
    modelId,
    modelRevision: nextRevision,
    result: 'committed',
    replayed: false
  };
}

function connectionCheck(status: AdminModelConnectionCheck['status']): AdminModelConnectionCheck {
  return {
    status,
    durationMs: 80,
    testedAt: '2026-08-30T00:00:00.000Z',
    correlationId
  };
}

const model: AdminManagedModelDetail = {
  modelId: 'model.default',
  modelRevision: revision,
  displayName: '企业默认模型',
  providerFamily: 'openai_compatible',
  lifecycle: 'enabled',
  defaultForNewTasks: true,
  credentialStatus: 'configured',
  lastConnectionCheck: connectionCheck('success'),
  endpoint,
  providerModelId: 'gpt-compatible'
};

const secondaryModel: AdminManagedModelDetail = {
  ...model,
  modelId: 'model.secondary',
  displayName: '备用模型',
  defaultForNewTasks: false,
  credentialStatus: 'missing',
  lastConnectionCheck: { status: 'unverified' }
};
