import type {
  AgentProjection,
  ModelProjection,
} from "@robothree/contracts";

export type ComposerPresentationInput = Readonly<{
  selectedAgent: AgentProjection | undefined;
  models: readonly ModelProjection[];
  requestedModelId: string;
  selectedWorkspaceId: string;
  composerText: string;
  busy: boolean;
}>;

export type ComposerModelOption = Readonly<{
  modelId: string;
  name: string;
}>;

export type ComposerPresentation = Readonly<{
  resolvedModelName: string;
  defaultModelOptionLabel: string;
  modelOverrideDisabled: boolean;
  overrideModelOptions: readonly ComposerModelOption[];
  selectionSummary: string;
  documentToolSummary: string;
  documentWorkspaceRequired: boolean;
  sendDisabled: boolean;
  sendButtonLabel: string;
}>;

export function presentComposer(
  input: ComposerPresentationInput,
): ComposerPresentation {
  const resolvedModelName = resolveModelName(
    input.selectedAgent,
    input.models,
    input.requestedModelId,
  );
  return {
    resolvedModelName,
    defaultModelOptionLabel: `默认 · ${resolvedModelName}`,
    modelOverrideDisabled: !input.selectedAgent?.allowModelOverride,
    overrideModelOptions: modelOverrideOptions(input.selectedAgent),
    selectionSummary: catalogSelectionSummary(input.selectedAgent),
    documentToolSummary: documentToolSummary(input.selectedAgent, input.selectedWorkspaceId),
    documentWorkspaceRequired: documentWorkspaceRequired(
      input.selectedAgent,
      input.selectedWorkspaceId,
    ),
    sendDisabled: isSendDisabled(input),
    sendButtonLabel: sendButtonLabel(input),
  };
}

export function resolveModelName(
  agent: AgentProjection | undefined,
  models: readonly ModelProjection[],
  requestedModelId: string,
): string {
  if (agent === undefined) return "未选择";
  const modelId = requestedModelId || agent.defaultModelId;
  return agent.eligibleModels.find((model) => model.modelId === modelId)?.name
    ?? models.find((model) => model.modelId === modelId)?.name
    ?? modelId;
}

export function modelOverrideOptions(
  agent: AgentProjection | undefined,
): readonly ComposerModelOption[] {
  if (agent?.allowModelOverride !== true) return [];
  return agent.eligibleModels
    .filter((model) => model.available)
    .filter((model) => model.modelId !== agent.defaultModelId)
    .map((model) => ({
      modelId: model.modelId,
      name: model.name,
    }));
}

export function catalogSelectionSummary(
  agent: AgentProjection | undefined,
): string {
  const toolCount = agent?.tools.filter((item) => item.available).length ?? 0;
  const skillCount = agent?.skills.filter((item) => item.available).length ?? 0;
  const documentToolCount = availableDocumentToolCount(agent);
  return documentToolCount === 0
    ? `${toolCount} Tools · ${skillCount} Skills`
    : `${toolCount} Tools · ${documentToolCount} Document · ${skillCount} Skills`;
}

export function documentToolSummary(
  agent: AgentProjection | undefined,
  selectedWorkspaceId: string,
): string {
  const count = availableDocumentToolCount(agent);
  if (count === 0) return "Document Tools unavailable";
  return selectedWorkspaceId.trim()
    ? `${count} Document Tools ready`
    : `${count} Document Tools need workspace`;
}

export function isSendDisabled(
  input: Pick<ComposerPresentationInput,
    "busy" | "composerText" | "selectedAgent" | "selectedWorkspaceId">,
): boolean {
  return input.busy || !input.composerText.trim()
    || input.selectedAgent === undefined
    || documentWorkspaceRequired(input.selectedAgent, input.selectedWorkspaceId);
}

export function documentWorkspaceRequired(
  agent: AgentProjection | undefined,
  selectedWorkspaceId: string,
): boolean {
  return availableDocumentToolCount(agent) > 0 && !selectedWorkspaceId.trim();
}

function sendButtonLabel(input: ComposerPresentationInput): string {
  if (input.busy) return "处理中…";
  if (documentWorkspaceRequired(input.selectedAgent, input.selectedWorkspaceId)) {
    return "选择工作目录";
  }
  return "发送任务 →";
}

function availableDocumentToolCount(agent: AgentProjection | undefined): number {
  return agent?.tools.filter((item) =>
    item.available && DOCUMENT_TOOL_IDS.has(item.id)).length ?? 0;
}

const DOCUMENT_TOOL_IDS = new Set([
  ["tool", "document", "pdf", "extract_text"].join("."),
  ["tool", "document", "xlsx", "read"].join("."),
  ["tool", "document", "docx", "read"].join("."),
]);
