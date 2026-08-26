export type AgentLoopStartResult = Readonly<{
  replayed: boolean;
}>;

export interface AgentLoopStarter {
  start(input: {
    submitTurnCommandId: string;
    taskId: string;
    runtimeSelectionId: string;
    sessionId: string;
    userMessageId: string;
  }): Promise<AgentLoopStartResult>;
}
