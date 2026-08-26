import type {
  CompactionModelInvocationLink,
  CompactionModelInvocationLinkPersistence,
  CompactionModelInvocationLinkWriteResult,
  PrepareCompactionModelInvocationLinkInput,
} from "../../ports/compaction-model-invocation-link-persistence.js";
import {
  samePreparedCompactionModelInvocationLink,
  withCompactionInvocationDigest,
} from "../../ports/compaction-model-invocation-link-persistence.js";

export class InMemoryCompactionModelInvocationLinks {
  readonly records = new Map<string, CompactionModelInvocationLink>();

  load(jobId: string): CompactionModelInvocationLink | undefined {
    return clone(this.records.get(jobId));
  }

  prepare(input: PrepareCompactionModelInvocationLinkInput): CompactionModelInvocationLinkWriteResult {
    const next = withCompactionInvocationDigest({ ...input, updatedAt: input.createdAt });
    const existing = this.records.get(next.compactionJobId);
    if (existing !== undefined) {
      return samePreparedCompactionModelInvocationLink(existing, input)
        ? { ok: true, replayed: true, value: clone(existing)! }
        : conflict();
    }
    if ([...this.records.values()].some((record) =>
      record.clientRequestId === next.clientRequestId
      || record.modelRequestId === next.modelRequestId)) return conflict();
    this.records.set(next.compactionJobId, next);
    return { ok: true, replayed: false, value: clone(next)! };
  }

  advance(
    jobId: string,
    expectedRecordDigest: string,
    update: (record: CompactionModelInvocationLink) => Omit<CompactionModelInvocationLink, "recordDigest">,
  ): CompactionModelInvocationLinkWriteResult {
    const current = this.records.get(jobId);
    if (current === undefined) return failure("compaction_model_invocation_link.not_found", "link not found");
    if (current.recordDigest !== expectedRecordDigest) {
      return failure("compaction_model_invocation_link.stale_revision", "link digest changed");
    }
    const next = withCompactionInvocationDigest(update(current));
    this.records.set(jobId, next);
    return { ok: true, replayed: false, value: clone(next)! };
  }

  commitSummary(input: Readonly<{
    compactionJobId: string;
    clientRequestId: string;
    expectedRecordDigest: string;
    summaryCommittedAt: string;
  }>): CompactionModelInvocationLinkWriteResult {
    return this.advance(input.compactionJobId, input.expectedRecordDigest, (current) => {
      if (current.clientRequestId !== input.clientRequestId || current.outputStartedAt === undefined) {
        throw new Error("Compaction summary invocation commit identity is invalid");
      }
      return {
        ...withoutDigest(current),
        summaryCommittedAt: input.summaryCommittedAt,
        updatedAt: input.summaryCommittedAt,
      };
    });
  }
}

export function memoryCompactionInvocationMethods(
  store: InMemoryCompactionModelInvocationLinks,
): Pick<CompactionModelInvocationLinkPersistence,
  "loadByCompactionJobId" | "prepare" | "recordAccepted" | "recordStreamProgress"> {
  return {
    loadByCompactionJobId: async (jobId) => store.load(jobId),
    prepare: async (input) => store.prepare(input),
    recordAccepted: async (input) => store.advance(
      input.compactionJobId,
      input.expectedRecordDigest,
      (current) => ({
        ...withoutDigest(current),
        invocationId: input.invocationId,
        statusRevision: input.statusRevision,
        ...(input.durableCursor === undefined ? {} : { durableCursor: input.durableCursor }),
        acceptedAt: input.acceptedAt,
        updatedAt: input.acceptedAt,
      }),
    ),
    recordStreamProgress: async (input) => store.advance(
      input.compactionJobId,
      input.expectedRecordDigest,
      (current) => ({
        ...withoutDigest(current),
        statusRevision: input.statusRevision,
        ...(input.durableCursor === undefined ? {} : { durableCursor: input.durableCursor }),
        ...(current.outputStartedAt === undefined && input.outputStartedAt !== undefined
          ? { outputStartedAt: input.outputStartedAt }
          : {}),
        updatedAt: input.updatedAt,
      }),
    ),
  };
}

function withoutDigest(value: CompactionModelInvocationLink): Omit<CompactionModelInvocationLink, "recordDigest"> {
  const { recordDigest: _recordDigest, ...material } = value;
  return material;
}

const clone = (value: CompactionModelInvocationLink | undefined) =>
  value === undefined ? undefined : structuredClone(value);
const conflict = () => failure("compaction_model_invocation_link.conflict", "link identity conflicts");
const failure = (
  code: "compaction_model_invocation_link.conflict" | "compaction_model_invocation_link.not_found" | "compaction_model_invocation_link.stale_revision",
  message: string,
): CompactionModelInvocationLinkWriteResult => ({ ok: false, error: { code, message } });
