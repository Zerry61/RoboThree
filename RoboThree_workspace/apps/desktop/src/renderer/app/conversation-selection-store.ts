export type ConversationSelection = Readonly<{
  agentId: string;
  requestedModelId: string;
  selectedSkillIds: readonly string[];
  selectedKnowledgeIds: readonly string[];
  workspaceGrantId?: string;
}>;

const selections = new Map<string, ConversationSelection>();

export function rememberConversationSelection(
  sessionId: string,
  selection: ConversationSelection,
): void {
  selections.set(sessionId, Object.freeze({
    agentId: selection.agentId,
    requestedModelId: selection.requestedModelId,
    selectedSkillIds: Object.freeze([...selection.selectedSkillIds]),
    selectedKnowledgeIds: Object.freeze([...selection.selectedKnowledgeIds]),
    ...(selection.workspaceGrantId === undefined
      ? {}
      : { workspaceGrantId: selection.workspaceGrantId }),
  }));
}

export function conversationSelection(
  sessionId: string,
): ConversationSelection | undefined {
  return selections.get(sessionId);
}

export function clearConversationSelections(): void {
  selections.clear();
}
