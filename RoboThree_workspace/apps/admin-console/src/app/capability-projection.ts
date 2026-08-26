import { assertNever } from './route-meta';
import type { CapabilityProjection, CapabilityState } from './route-meta';

export type CapabilityPresentation = Readonly<{
  label: '可用' | '暂不可用' | '待接入' | '部分可用';
  tone: 'success' | 'neutral' | 'warning' | 'info';
  safeSummary: string;
}>;

export function presentCapability(projection: CapabilityProjection): CapabilityPresentation {
  switch (projection.state) {
    case 'ready':
      return {
        label: '可用',
        tone: 'success',
        safeSummary: projection.safeReason ?? '壳层已就绪'
      };
    case 'unavailable':
      return {
        label: '暂不可用',
        tone: 'neutral',
        safeSummary: projection.safeReason ?? '真实管理能力待接入'
      };
    case 'gated':
      return {
        label: '待接入',
        tone: 'warning',
        safeSummary: projection.safeReason ?? '该能力仍在门禁中'
      };
    case 'partial':
      return {
        label: '部分可用',
        tone: 'info',
        safeSummary: projection.safeReason ?? '部分能力尚未接入'
      };
    default:
      return assertNever(projection.state);
  }
}

export function capabilityStateLabel(state: CapabilityState): CapabilityPresentation['label'] {
  switch (state) {
    case 'ready':
      return '可用';
    case 'unavailable':
      return '暂不可用';
    case 'gated':
      return '待接入';
    case 'partial':
      return '部分可用';
    default:
      return assertNever(state);
  }
}
