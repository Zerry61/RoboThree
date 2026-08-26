import { assertNever } from '../app/route-meta';
import type {
  AdminToolCreateEntry,
  AdminToolDetailSection,
  AdminToolExecutionLocation,
  AdminToolListItem,
  AdminToolRiskLevel,
  AdminToolSource,
  AdminToolStatusState
} from '../types/admin-tool-pages';
import type { AdminBadgeTone } from '../types/admin-ui';

export type ToolListRowPresentation = Readonly<{
  toolId: string;
  title: string;
  technicalName: string;
  sourceLabel: string;
  executionLabel: string;
  statusItems: readonly string[];
  riskLabel: string;
  riskTone: AdminBadgeTone;
  rangeSummary: string;
  updatedAtLabel: string;
  gatedLabel: string;
  detailPath: string;
}>;

export type ToolCreateEntryPresentation = AdminToolCreateEntry;

export function presentToolSource(source: AdminToolSource): string {
  switch (source) {
    case 'code':
      return '代码工具';
    case 'httpApi':
      return '连接 API';
    case 'mcp':
      return 'MCP 服务';
    default:
      return assertNever(source);
  }
}

export function presentToolExecutionLocation(location: AdminToolExecutionLocation): string {
  switch (location) {
    case 'localWorker':
      return '受控本地执行';
    case 'centralGateway':
      return '中央网关';
    case 'remoteMcp':
      return '远程服务';
    default:
      return assertNever(location);
  }
}

export function presentToolStatusState(state: AdminToolStatusState): string {
  switch (state) {
    case 'configured':
      return '已配置';
    case 'missing':
      return '未配置';
    case 'unavailable':
      return '暂不可用';
    case 'gated':
      return '待接入';
    case 'unknown':
      return '未知';
    default:
      return assertNever(state);
  }
}

export function presentToolRisk(risk: AdminToolRiskLevel): Readonly<{ label: string; tone: AdminBadgeTone }> {
  switch (risk) {
    case 'read':
      return { label: '读取', tone: 'neutral' };
    case 'write':
      return { label: '写入', tone: 'warning' };
    case 'external':
      return { label: '外发', tone: 'danger' };
    default:
      return assertNever(risk);
  }
}

export function presentToolListRow(item: AdminToolListItem): ToolListRowPresentation {
  const risk = presentToolRisk(item.riskLevel);
  return {
    toolId: item.toolId,
    title: item.title,
    technicalName: item.technicalName,
    sourceLabel: presentToolSource(item.source),
    executionLabel: presentToolExecutionLocation(item.executionLocation),
    statusItems: [
      `配置：${presentToolStatusState(item.status.configuration)}`,
      `验证：${presentToolStatusState(item.status.validation)}`,
      `健康：${presentToolStatusState(item.status.health)}`,
      `生效：${presentToolStatusState(item.status.effectiveness)}`
    ],
    riskLabel: risk.label,
    riskTone: risk.tone,
    rangeSummary: item.rangeSummary,
    updatedAtLabel: item.updatedAtLabel,
    gatedLabel: item.prototype ? '演示数据 / 待接入' : '真实投影',
    detailPath: `/tools/${item.toolId}`
  };
}

export function presentToolDetail(item: AdminToolListItem): readonly AdminToolDetailSection[] {
  return [
    {
      title: '基础信息',
      rows: [
        { label: '工具标题', value: item.title },
        { label: '技术名称', value: item.technicalName },
        { label: '接入来源', value: presentToolSource(item.source) },
        { label: '执行位置', value: presentToolExecutionLocation(item.executionLocation) }
      ]
    },
    {
      title: '治理摘要',
      rows: [
        { label: '风险摘要', value: presentToolRisk(item.riskLevel).label },
        { label: '使用范围', value: item.rangeSummary },
        { label: '启停状态', value: presentToolStatusState(item.status.effectiveness) }
      ]
    },
    {
      title: '技术详情',
      rows: [
        { label: '定义版本', value: '演示版本' },
        { label: '实现摘要', value: '仅展示只读技术摘要，真实绑定待接入' },
        { label: '兼容范围', value: '待接入' }
      ]
    }
  ];
}

