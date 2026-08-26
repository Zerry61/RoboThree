import type {
  CompactionJob,
  ConversationMessage,
  Sha256Digest,
} from "@robothree/contracts";

export type CompactionSummary = Readonly<{
  summary: string;
  summarySchemaVersion: string;
  summarizerModelRef: string;
  summarizerPromptRevision: Sha256Digest;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  invocationCommit?: Readonly<{
    compactionJobId: string;
    clientRequestId: string;
    expectedRecordDigest: string;
    summaryCommittedAt: string;
  }>;
}>;

export type CompactionSummarizationInput = Readonly<{
  job: Extract<CompactionJob, { status: "pending" }>;
  baseSummary?: Readonly<{
    compactionId: string;
    sourceEndSequence: number;
    sourceDigest: Sha256Digest;
    summary: string;
    summaryDigest: Sha256Digest;
  }>;
  rawExtension: readonly ConversationMessage[];
  fullSourceRangeEvidence: Readonly<{
    sourceStartSequence: number;
    sourceEndSequence: number;
    sourceDigest: Sha256Digest;
  }>;
}>;

export interface CompactionSummarizer {
  summarize(
    input: CompactionSummarizationInput,
    modelRequestId: string,
    signal: AbortSignal,
  ): Promise<CompactionSummary>;
}
