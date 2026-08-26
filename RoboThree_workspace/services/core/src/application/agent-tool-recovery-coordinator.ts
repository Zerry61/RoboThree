import type {
  RecoverToolCallBatchesInput,
  ToolCallBatchCoordinator,
  ToolCallBatchDispatchResult,
} from "./tool-call-batch-coordinator.js";

export class AgentToolRecoveryCoordinator {
  readonly #batches: ToolCallBatchCoordinator;

  constructor(input: {
    batches: ToolCallBatchCoordinator;
  }) {
    this.#batches = input.batches;
  }

  async recover(
    input: RecoverToolCallBatchesInput = {},
    signal: AbortSignal = new AbortController().signal,
  ): Promise<readonly ToolCallBatchDispatchResult[]> {
    return this.#batches.recover(input, signal);
  }
}
