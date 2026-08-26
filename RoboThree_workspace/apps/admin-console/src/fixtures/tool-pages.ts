import type { AdminToolCreateEntry, AdminToolListItem, AdminToolStep } from '../types/admin-tool-pages';

export const prototypeToolRows: readonly AdminToolListItem[] = [
  {
    toolId: 'fake_tool_document_pdf',
    title: '文档内容读取',
    technicalName: 'tool.fake.document.read',
    source: 'code',
    executionLocation: 'localWorker',
    status: {
      configuration: 'configured',
      validation: 'configured',
      health: 'unavailable',
      effectiveness: 'gated'
    },
    riskLevel: 'read',
    rangeSummary: '演示范围',
    updatedAtLabel: '2026-08-25',
    prototype: true
  },
  {
    toolId: 'fake_tool_api_case',
    title: '业务系统查询',
    technicalName: 'tool.fake.business.query',
    source: 'httpApi',
    executionLocation: 'centralGateway',
    status: {
      configuration: 'missing',
      validation: 'gated',
      health: 'unknown',
      effectiveness: 'gated'
    },
    riskLevel: 'external',
    rangeSummary: '待接入',
    updatedAtLabel: '2026-08-25',
    prototype: true
  },
  {
    toolId: 'fake_tool_mcp_search',
    title: '远程资料检索',
    technicalName: 'tool.fake.remote.search',
    source: 'mcp',
    executionLocation: 'remoteMcp',
    status: {
      configuration: 'missing',
      validation: 'gated',
      health: 'unknown',
      effectiveness: 'gated'
    },
    riskLevel: 'read',
    rangeSummary: '演示范围',
    updatedAtLabel: '2026-08-25',
    prototype: true
  }
] as const;

export const toolCreateEntries: readonly AdminToolCreateEntry[] = [
  {
    key: 'api',
    title: '连接 API',
    description: '使用两步表单规划受控接口 Tool，真实保存、测试和启用待接入。',
    path: '/tools/new/api'
  },
  {
    key: 'mcp',
    title: '连接 MCP 服务',
    description: '使用三步流程规划远程 MCP 服务发现，真实连接和发现待接入。',
    path: '/tools/new/mcp'
  }
] as const;

export const apiCreateSteps: readonly AdminToolStep[] = [
  {
    index: 1,
    title: '基础配置',
    description: '填写工具标题、工具名称、描述与能力边界。',
    gated: false
  },
  {
    index: 2,
    title: '连接配置',
    description: '规划访问地址、认证、方法、参数和使用范围；真实连接待接入。',
    gated: true
  }
] as const;

export const mcpCreateSteps: readonly AdminToolStep[] = [
  {
    index: 1,
    title: '验证并发现工具',
    description: '填写远程服务名称、地址和认证方式；真实验证待接入。',
    gated: true
  },
  {
    index: 2,
    title: '选择 Tool',
    description: '查看固定演示发现结果；读取能力可默认选择，写入和外发默认不选。',
    gated: true
  },
  {
    index: 3,
    title: '设置范围并保存草稿',
    description: '规划所有人或指定范围，以及额外确认策略；真实保存待接入。',
    gated: true
  }
] as const;

