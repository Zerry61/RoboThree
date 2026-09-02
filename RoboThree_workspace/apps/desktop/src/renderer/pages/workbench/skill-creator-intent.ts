export type SkillCreatorWorkbenchIntent = Readonly<{
  skillId: string;
  draftId: string;
  workspaceGrantId: string;
  workspaceDisplayName: string;
  agentId: "agent.skill-creator";
  firstUserMessage: string;
}>;

let pendingIntent: SkillCreatorWorkbenchIntent | undefined;

export function setSkillCreatorWorkbenchIntent(intent: SkillCreatorWorkbenchIntent): void {
  pendingIntent = Object.freeze({
    skillId: bounded(intent.skillId, 256),
    draftId: bounded(intent.draftId, 256),
    workspaceGrantId: bounded(intent.workspaceGrantId, 256),
    workspaceDisplayName: bounded(intent.workspaceDisplayName, 128),
    agentId: "agent.skill-creator",
    firstUserMessage: bounded(intent.firstUserMessage, 64 * 1024),
  });
}

export function consumeSkillCreatorWorkbenchIntent(): SkillCreatorWorkbenchIntent | undefined {
  const value = pendingIntent;
  pendingIntent = undefined;
  return value;
}

function bounded(value: string, limit: number): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > limit) {
    throw new Error("Invalid Skill Creator Workbench intent");
  }
  return value;
}
