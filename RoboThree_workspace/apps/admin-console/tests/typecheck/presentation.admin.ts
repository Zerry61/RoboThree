import { describe, expect, it } from 'vitest';
import { presentCapability } from '../../src/app/capability-projection';
import {
  presentButton,
  presentOperationGate,
  presentPagination,
  presentSecretStatus
} from '../../src/presentation/admin-ui-presentation';
import { presentPageState } from '../../src/presentation/page-state-presentation';
import { presentUnknownError } from '../../src/presentation/safe-error-presentation';
import {
  presentToolDetail,
  presentToolExecutionLocation,
  presentToolListRow,
  presentToolRisk,
  presentToolSource,
  presentToolStatusState
} from '../../src/presentation/tool-pages-presentation';
import { prototypeToolRows } from '../../src/fixtures/tool-pages';
import type { CapabilityState } from '../../src/app/route-meta';
import type { AdminPageStatus } from '../../src/adapters/admin-adapter';
import type {
  AdminToolExecutionLocation,
  AdminToolRiskLevel,
  AdminToolSource,
  AdminToolStatusState
} from '../../src/types/admin-tool-pages';
import type { SecretDisplayStatus } from '../../src/types/admin-ui';

describe('Admin presentation functions', () => {
  it('covers all capability states with explicit labels', () => {
    const states: readonly CapabilityState[] = ['ready', 'unavailable', 'gated', 'partial'];
    const labels = states.map((state) => presentCapability({ capabilityKey: state, state }).label);

    expect(labels).toEqual(['可用', '暂不可用', '待接入', '部分可用']);
  });

  it('covers all page states with safe summaries', () => {
    const statuses: readonly AdminPageStatus[] = [
      'loading',
      'empty',
      'ready',
      'unavailable',
      'permissionDenied',
      'error',
      'disabled',
      'partial'
    ];

    for (const status of statuses) {
      const presentation = presentPageState(status);
      expect(presentation.title.length).toBeGreaterThan(0);
      expect(presentation.message).not.toContain('{');
    }
  });

  it('does not expose unknown error object fields', () => {
    const summary = presentUnknownError({
      code: 'unknown',
      retryable: true,
      correlationId: 'corr-admin-1'
    });

    expect(summary.message).toBe('当前请求可以稍后重试');
    expect(JSON.stringify(summary)).not.toContain('unknown');
  });

  it('covers secret status with enum-only labels', () => {
    const statuses: readonly SecretDisplayStatus[] = ['configured', 'missing', 'unavailable'];
    const labels = statuses.map((status) => presentSecretStatus(status).label);

    expect(labels).toEqual(['已配置', '未配置', '暂不可用']);
    expect(JSON.stringify(labels)).not.toContain('cred_');
  });

  it('keeps button and operation presentation safe', () => {
    expect(
      presentButton({
        variant: 'primary',
        size: 'md',
        disabled: false,
        loading: true
      })
    ).toMatchObject({
      disabled: true,
      ariaBusy: 'true'
    });

    expect(presentOperationGate({ allowed: false, disabledReason: '待接入' })).toEqual({
      showAction: true,
      disabled: true,
      reason: '待接入'
    });
  });

  it('presents pagination without creating cursor semantics', () => {
    expect(presentPagination({ page: 1, pageSize: 20, total: 0 })).toEqual({
      page: 1,
      pageSize: 20,
      total: 0,
      canGoPrevious: false,
      canGoNext: false,
      summary: '第 1 页 / 共 1 页'
    });
  });

  it('covers Tool source, location, status and risk display decisions', () => {
    const sources: readonly AdminToolSource[] = ['code', 'httpApi', 'mcp'];
    expect(sources.map((source) => presentToolSource(source))).toEqual(['代码工具', '连接 API', 'MCP 服务']);

    const locations: readonly AdminToolExecutionLocation[] = ['localWorker', 'centralGateway', 'remoteMcp'];
    expect(locations.map((location) => presentToolExecutionLocation(location))).toEqual([
      '受控本地执行',
      '中央网关',
      '远程服务'
    ]);

    const states: readonly AdminToolStatusState[] = ['configured', 'missing', 'unavailable', 'gated', 'unknown'];
    expect(states.map((state) => presentToolStatusState(state))).toEqual([
      '已配置',
      '未配置',
      '暂不可用',
      '待接入',
      '未知'
    ]);

    const risks: readonly AdminToolRiskLevel[] = ['read', 'write', 'external'];
    expect(risks.map((risk) => presentToolRisk(risk).label)).toEqual(['读取', '写入', '外发']);
  });

  it('keeps Tool presentation free of sensitive operational data', () => {
    const listRows = prototypeToolRows.map(presentToolListRow);
    const details = prototypeToolRows.map(presentToolDetail);
    const serialized = JSON.stringify({ listRows, details });

    expect(serialized).toContain('待接入');
    expect(serialized).not.toContain('Credential');
    expect(serialized).not.toContain(['Capability', 'Lock'].join(''));
    expect(serialized).not.toContain(['Bear', 'er'].join(''));
    expect(serialized).not.toContain('requestDigest');
    expect(serialized).not.toContain('stack');
    expect(serialized).not.toContain(['End', 'point'].join(''));
  });
});
