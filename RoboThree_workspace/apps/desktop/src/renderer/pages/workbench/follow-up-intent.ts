export type WorkbenchFollowUpArtifact = Readonly<{
  displayName: string;
  relativePath: string;
}>;

export type WorkbenchFollowUpIntent = Readonly<{
  sessionId: string;
  originTaskId: string;
  candidateAgentId: string;
  candidateModelId: string;
  previousArtifact?: WorkbenchFollowUpArtifact;
}>;

let pendingIntent: WorkbenchFollowUpIntent | undefined;

export function setFollowUpIntent(intent: WorkbenchFollowUpIntent): void {
  pendingIntent = freezeIntent(intent);
}

export function consumeFollowUpIntent(): WorkbenchFollowUpIntent | undefined {
  const consumed = pendingIntent;
  pendingIntent = undefined;
  return consumed;
}

function freezeIntent(intent: WorkbenchFollowUpIntent): WorkbenchFollowUpIntent {
  assertBounded("sessionId", intent.sessionId, false);
  assertBounded("originTaskId", intent.originTaskId, false);
  assertBounded("candidateAgentId", intent.candidateAgentId, true);
  assertBounded("candidateModelId", intent.candidateModelId, true);
  const previousArtifact = intent.previousArtifact === undefined
    ? undefined
    : Object.freeze({
      displayName: bounded("previousArtifact.displayName", intent.previousArtifact.displayName),
      relativePath: bounded(
        "previousArtifact.relativePath",
        intent.previousArtifact.relativePath,
      ),
    });
  return Object.freeze({
    sessionId: intent.sessionId,
    originTaskId: intent.originTaskId,
    candidateAgentId: intent.candidateAgentId,
    candidateModelId: intent.candidateModelId,
    ...(previousArtifact === undefined ? {} : { previousArtifact }),
  });
}

function bounded(name: string, value: string): string {
  assertBounded(name, value, false);
  return value;
}

function assertBounded(name: string, value: string, allowEmpty: boolean): void {
  if (typeof value !== "string" || value.length > 512 || (!allowEmpty && value.length === 0)) {
    throw new Error(`Invalid Workbench follow-up intent ${name}`);
  }
}
