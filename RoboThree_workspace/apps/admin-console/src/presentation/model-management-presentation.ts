import type {
  AdminManagedModelLifecycle,
  AdminModelConnectionState,
  AdminModelCredentialDirective,
  AdminManagedModelDetail,
  AdminManagedModelSummary
} from '@robothree/contracts/admin-control/v1alpha2';
import type { AdminBadgeTone } from '../types/admin-ui';

export type ManagedModelRow = Readonly<{
  id: string;
  displayName: string;
  provider: string;
  lifecycleLabel: string;
  lifecycleTone: AdminBadgeTone;
  connectionLabel: string;
  connectionTone: AdminBadgeTone;
  credentialLabel: string;
  defaultLabel: string;
}>;

export type ManagedModelFormState = Readonly<{
  displayName: string;
  endpoint: string;
  providerModelId: string;
  credentialMode: AdminModelCredentialDirective['mode'];
  secret: string;
}>;

export type ManagedModelValidation = Readonly<{
  valid: boolean;
  errors: Readonly<Partial<Record<keyof ManagedModelFormState, string>>>;
}>;

export function presentManagedModelRow(model: AdminManagedModelSummary): ManagedModelRow {
  return {
    id: model.modelId,
    displayName: model.displayName,
    provider: 'OpenAI-compatible',
    lifecycleLabel: presentManagedModelLifecycle(model.lifecycle),
    lifecycleTone: toneForManagedModelLifecycle(model.lifecycle),
    connectionLabel: presentConnectionState(model.lastConnectionCheck.status),
    connectionTone: toneForConnectionState(model.lastConnectionCheck.status),
    credentialLabel: presentManagedCredentialStatus(model.credentialStatus),
    defaultLabel: model.defaultForNewTasks ? '企业默认' : '非默认'
  };
}

export function presentManagedModelDetailRows(model: AdminManagedModelDetail) {
  return [
    { label: '模型名称', value: model.displayName },
    { label: '供应方', value: 'OpenAI-compatible' },
    { label: '服务地址', value: model.endpoint },
    { label: '供应方模型 ID', value: model.providerModelId },
    { label: '生命周期', value: presentManagedModelLifecycle(model.lifecycle) },
    { label: '默认模型', value: model.defaultForNewTasks ? '是' : '否' },
    { label: '访问密钥', value: presentManagedCredentialStatus(model.credentialStatus) },
    { label: '连接测试', value: presentConnectionState(model.lastConnectionCheck.status) }
  ] as const;
}

export function presentManagedModelLifecycle(value: AdminManagedModelLifecycle): string {
  switch (value) {
    case 'enabled': return '已启用';
    case 'disabled': return '已停用';
    default: return assertNever(value);
  }
}

export function toneForManagedModelLifecycle(value: AdminManagedModelLifecycle): AdminBadgeTone {
  switch (value) {
    case 'enabled': return 'success';
    case 'disabled': return 'neutral';
    default: return assertNever(value);
  }
}

export function presentManagedCredentialStatus(value: 'configured' | 'missing'): string {
  switch (value) {
    case 'configured': return '已配置';
    case 'missing': return '未配置';
    default: return assertNever(value);
  }
}

export function presentConnectionState(value: AdminModelConnectionState): string {
  switch (value) {
    case 'unverified': return '未测试';
    case 'success': return '连接正常';
    case 'auth_failed': return '认证失败';
    case 'network_failed': return '网络失败';
    case 'protocol_incompatible': return '协议不兼容';
    case 'model_not_found': return '模型不存在';
    case 'service_error': return '服务异常';
    default: return assertNever(value);
  }
}

export function toneForConnectionState(value: AdminModelConnectionState): AdminBadgeTone {
  switch (value) {
    case 'success': return 'success';
    case 'unverified': return 'neutral';
    case 'auth_failed':
    case 'network_failed':
    case 'protocol_incompatible':
    case 'model_not_found':
    case 'service_error': return 'warning';
    default: return assertNever(value);
  }
}

export function validateManagedModelForm(
  state: ManagedModelFormState,
  mode: 'create' | 'edit',
): ManagedModelValidation {
  const errors: Partial<Record<keyof ManagedModelFormState, string>> = {};
  if (state.displayName.trim().length === 0) errors.displayName = '请填写模型名称';
  if (state.endpoint.trim().length === 0) {
    errors.endpoint = '请填写服务地址';
  } else {
    try {
      const url = new URL(state.endpoint);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') errors.endpoint = '服务地址必须使用 HTTP 或 HTTPS';
      if (url.username || url.password || url.search || url.hash) errors.endpoint = '服务地址不能包含账号、查询参数或片段';
    } catch {
      errors.endpoint = '服务地址格式不正确';
    }
  }
  if (state.providerModelId.trim().length === 0) errors.providerModelId = '请填写供应方模型 ID';
  if ((mode === 'create' || state.credentialMode === 'replace') && state.secret.trim().length === 0) {
    errors.secret = '请填写访问密钥';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled model presentation state: ${String(value)}`);
}
