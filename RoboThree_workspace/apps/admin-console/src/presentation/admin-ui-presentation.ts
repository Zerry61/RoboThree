import { assertNever } from '../app/route-meta';
import type {
  AdminActionState,
  AdminBadgeTone,
  AdminButtonVariant,
  AdminComponentSize,
  PaginationPresentation,
  SecretDisplayStatus
} from '../types/admin-ui';

export type ButtonPresentation = Readonly<{
  className: string;
  disabled: boolean;
  ariaDisabled: 'true' | 'false';
  ariaBusy: 'true' | 'false';
}>;

export type BadgePresentation = Readonly<{
  className: string;
}>;

export type SecretStatusPresentation = Readonly<{
  label: string;
  tone: AdminBadgeTone;
}>;

export type OperationPresentation = Readonly<{
  showAction: boolean;
  disabled: boolean;
  reason: string;
}>;

export function presentButton(input: {
  variant: AdminButtonVariant;
  size: AdminComponentSize;
  disabled: boolean;
  loading: boolean;
}): ButtonPresentation {
  return {
    className: `admin-button admin-button--${input.variant} admin-button--${input.size}`,
    disabled: input.disabled || input.loading,
    ariaDisabled: input.disabled || input.loading ? 'true' : 'false',
    ariaBusy: input.loading ? 'true' : 'false'
  };
}

export function presentBadge(tone: AdminBadgeTone): BadgePresentation {
  return {
    className: `admin-badge admin-badge--${tone}`
  };
}

export function presentSecretStatus(status: SecretDisplayStatus): SecretStatusPresentation {
  switch (status) {
    case 'configured':
      return { label: '已配置', tone: 'success' };
    case 'missing':
      return { label: '未配置', tone: 'warning' };
    case 'unavailable':
      return { label: '暂不可用', tone: 'neutral' };
    default:
      return assertNever(status);
  }
}

export function presentOperationGate(action: AdminActionState): OperationPresentation {
  if (action.allowed) {
    return {
      showAction: true,
      disabled: false,
      reason: ''
    };
  }

  return {
    showAction: true,
    disabled: true,
    reason: action.disabledReason ?? '当前操作不可用'
  };
}

export function presentPagination(input: { page: number; pageSize: number; total: number }): PaginationPresentation {
  const safePage = Math.max(1, input.page);
  const safePageSize = Math.max(1, input.pageSize);
  const safeTotal = Math.max(0, input.total);
  const maxPage = Math.max(1, Math.ceil(safeTotal / safePageSize));

  return {
    page: safePage,
    pageSize: safePageSize,
    total: safeTotal,
    canGoPrevious: safePage > 1,
    canGoNext: safePage < maxPage,
    summary: `第 ${safePage} 页 / 共 ${maxPage} 页`
  };
}

