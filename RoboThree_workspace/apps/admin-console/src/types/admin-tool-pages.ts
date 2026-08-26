export type AdminToolSource = 'code' | 'httpApi' | 'mcp';
export type AdminToolExecutionLocation = 'localWorker' | 'centralGateway' | 'remoteMcp';
export type AdminToolStatusState = 'configured' | 'missing' | 'unavailable' | 'gated' | 'unknown';
export type AdminToolRiskLevel = 'read' | 'write' | 'external';

export type AdminToolStatusGroup = Readonly<{
  configuration: AdminToolStatusState;
  validation: AdminToolStatusState;
  health: AdminToolStatusState;
  effectiveness: AdminToolStatusState;
}>;

export type AdminToolListItem = Readonly<{
  toolId: string;
  title: string;
  technicalName: string;
  source: AdminToolSource;
  executionLocation: AdminToolExecutionLocation;
  status: AdminToolStatusGroup;
  riskLevel: AdminToolRiskLevel;
  rangeSummary: string;
  updatedAtLabel: string;
  prototype: boolean;
}>;

export type AdminToolCreateEntry = Readonly<{
  key: 'api' | 'mcp';
  title: string;
  description: string;
  path: string;
}>;

export type AdminToolStep = Readonly<{
  index: number;
  title: string;
  description: string;
  gated: boolean;
}>;

export type AdminToolDetailSection = Readonly<{
  title: string;
  rows: readonly Readonly<{ label: string; value: string }>[];
}>;

