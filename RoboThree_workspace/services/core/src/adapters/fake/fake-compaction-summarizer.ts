import type {
  CompactionSummarizer,
  CompactionSummarizationInput,
  CompactionSummary,
} from "../../ports/compaction-summarizer.js";

export class FakeCompactionSummarizer implements CompactionSummarizer {
  readonly calls: Array<Readonly<{
    compactionJobId: string;
    modelRequestId: string;
    sourceSequences: readonly number[];
    baseCompactionId?: string;
  }>> = [];
  readonly #result: CompactionSummary | Error;

  constructor(result: CompactionSummary | Error) {
    this.#result = result;
  }

  async summarize(
    input: CompactionSummarizationInput,
    modelRequestId: string,
    signal: AbortSignal,
  ): Promise<CompactionSummary> {
    if (signal.aborted) throw signal.reason ?? new Error("Compaction cancelled");
    this.calls.push(Object.freeze({
      compactionJobId: input.job.compactionJobId,
      modelRequestId,
      sourceSequences: Object.freeze(
        input.rawExtension.map((message) => message.envelope.sequence),
      ),
      ...(input.baseSummary === undefined
        ? {}
        : { baseCompactionId: input.baseSummary.compactionId }),
    }));
    if (this.#result instanceof Error) throw this.#result;
    return structuredClone(this.#result);
  }
}
