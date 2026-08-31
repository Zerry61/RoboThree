import type { PageStateTone } from '../presentation/page-state-presentation';

export type AdminComponentSize = 'sm' | 'md';
export type AdminButtonVariant = 'primary' | 'secondary' | 'danger';
export type AdminBadgeTone = PageStateTone;
export type SecretDisplayStatus = 'configured' | 'missing' | 'unavailable';

export type AdminActionState = Readonly<{
  allowed: boolean;
  disabledReason?: string;
}>;

export type AdminListState = 'loading' | 'empty' | 'ready' | 'unavailable' | 'permissionDenied' | 'notFound' | 'stale' | 'error' | 'disabled' | 'partial' | 'gated';

export type TableColumn = Readonly<{
  key: string;
  label: string;
}>;

export type PaginationPresentation = Readonly<{
  page: number;
  pageSize: number;
  total: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  summary: string;
}>;
