import type { SafeErrorSummary } from '../adapters/admin-adapter';

export type UnknownErrorInput = Readonly<{
  code?: string;
  retryable?: boolean;
  correlationId?: string;
}>;

export function presentUnknownError(error: UnknownErrorInput): SafeErrorSummary {
  const summary: SafeErrorSummary = {
    title: '页面出错',
    message: error.retryable === true ? '当前请求可以稍后重试' : '页面遇到未知错误，请稍后重试'
  };
  if (error.correlationId !== undefined) {
    return {
      ...summary,
      correlationId: error.correlationId
    };
  }
  return summary;
}
