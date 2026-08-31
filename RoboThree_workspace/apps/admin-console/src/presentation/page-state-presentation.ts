import { assertNever } from '../app/route-meta';
import type { AdminPageStatus, SafeErrorSummary } from '../adapters/admin-adapter';

export type PageStateTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

export type PageStatePresentation = Readonly<{
  title: string;
  message: string;
  tone: PageStateTone;
  busy: boolean;
  role: 'status' | 'alert' | 'note';
}>;

export function presentPageState(
  status: AdminPageStatus,
  safeError?: SafeErrorSummary
): PageStatePresentation {
  switch (status) {
    case 'loading':
      return {
        title: '正在加载',
        message: '正在读取当前页面状态',
        tone: 'neutral',
        busy: true,
        role: 'status'
      };
    case 'empty':
      return {
        title: safeError?.title ?? '暂无数据',
        message: safeError?.message ?? '当前能力可用，但还没有可展示的数据',
        tone: 'neutral',
        busy: false,
        role: 'note'
      };
    case 'ready':
      return {
        title: '壳层已就绪',
        message: '当前仅表示页面框架可用，不代表业务数据已接入',
        tone: 'success',
        busy: false,
        role: 'status'
      };
    case 'unavailable':
      return {
        title: safeError?.title ?? '暂不可用',
        message: safeError?.message ?? '真实管理能力待接入',
        tone: 'neutral',
        busy: false,
        role: 'note'
      };
    case 'permissionDenied':
      return {
        title: safeError?.title ?? '权限不足',
        message: safeError?.message ?? '当前账号没有访问该页面的权限',
        tone: 'warning',
        busy: false,
        role: 'alert'
      };
    case 'notFound':
      return {
        title: safeError?.title ?? '未找到记录',
        message: safeError?.message ?? '该记录不存在，或当前身份不可见',
        tone: 'neutral',
        busy: false,
        role: 'note'
      };
    case 'stale':
      return {
        title: safeError?.title ?? '页面状态已变化',
        message: safeError?.message ?? '列表或详情已经过期，请重新加载',
        tone: 'warning',
        busy: false,
        role: 'alert'
      };
    case 'error':
      return {
        title: safeError?.title ?? '页面出错',
        message: safeError?.message ?? '页面遇到未知错误，请稍后重试',
        tone: 'danger',
        busy: false,
        role: 'alert'
      };
    case 'disabled':
      return {
        title: '操作不可用',
        message: '该操作仍在接入门禁中',
        tone: 'warning',
        busy: false,
        role: 'note'
      };
    case 'partial':
      return {
        title: '部分可用',
        message: '页面壳层已建立，关键业务能力仍待接入',
        tone: 'info',
        busy: false,
        role: 'status'
      };
    case 'gated':
      return {
        title: '能力待接入',
        message: '该管理能力仍在门禁中，当前不提供真实业务操作',
        tone: 'warning',
        busy: false,
        role: 'note'
      };
    default:
      return assertNever(status);
  }
}
