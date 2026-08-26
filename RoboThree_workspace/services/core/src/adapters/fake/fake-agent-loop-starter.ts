import type {
  AgentLoopStarter,
  AgentLoopStartResult,
} from "../../ports/agent-loop-starter.js";

export class FakeAgentLoopStarter implements AgentLoopStarter {
  readonly #started = new Map<string, {
    submitTurnCommandId: string;
    taskId: string;
    runtimeSelectionId: string;
    sessionId: string;
    userMessageId: string;
  }>();
  #failuresRemaining = 0;

  failNext(count = 1): void {
    this.#failuresRemaining = Math.max(0, Math.trunc(count));
  }

  async start(input: {
    submitTurnCommandId: string;
    taskId: string;
    runtimeSelectionId: string;
    sessionId: string;
    userMessageId: string;
  }): Promise<AgentLoopStartResult> {
    if (this.#failuresRemaining > 0) {
      this.#failuresRemaining -= 1;
      throw new Error("injected Agent Loop start failure");
    }
    const existing = this.#started.get(input.submitTurnCommandId);
    if (existing !== undefined) {
      if (JSON.stringify(existing) !== JSON.stringify(input)) {
        throw new Error("Agent Loop start identity conflict");
      }
      return { replayed: true };
    }
    this.#started.set(input.submitTurnCommandId, structuredClone(input));
    return { replayed: false };
  }

  startedCount(): number {
    return this.#started.size;
  }

  hasStarted(submitTurnCommandId: string): boolean {
    return this.#started.has(submitTurnCommandId);
  }
}
