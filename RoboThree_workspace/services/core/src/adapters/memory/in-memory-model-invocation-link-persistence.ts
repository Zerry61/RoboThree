import {
  ModelInvocationLinkSchema,
  type ModelInvocationLink,
  type ModelInvocationLinkPersistence,
  type ModelInvocationLinkWriteResult,
  type PrepareModelInvocationLinkInput,
} from "../../ports/model-invocation-link-persistence.js";
import {
  calculateModelInvocationLinkDigest,
  samePreparedModelInvocationLink,
} from "../../application/model-invocation-link-digest.js";

export class InMemoryModelInvocationLinkPersistence
implements ModelInvocationLinkPersistence {
  readonly #records = new Map<string, ModelInvocationLink>();
  #started = false;

  async start(): Promise<void> { this.#started = true; }
  async stop(): Promise<void> { this.#started = false; }

  async loadByClientRequestId(clientRequestId: string): Promise<ModelInvocationLink | undefined> {
    this.#requireStarted();
    return cloneOptional(this.#records.get(clientRequestId));
  }

  async loadRound(taskId: string, runId: string, round: number): Promise<ModelInvocationLink | undefined> {
    this.#requireStarted();
    return cloneOptional([...this.#records.values()].find((record) =>
      record.taskId === taskId && record.runId === runId && record.round === round));
  }

  async listIncomplete(limit: number): Promise<readonly ModelInvocationLink[]> {
    this.#requireStarted();
    return [...this.#records.values()]
      .filter((record) => record.messageCommittedAt === undefined)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit)
      .map(clone);
  }

  async prepare(input: PrepareModelInvocationLinkInput): Promise<ModelInvocationLinkWriteResult> {
    this.#requireStarted();
    const material = { ...input, updatedAt: input.createdAt };
    const record = validate({
      ...material,
      recordDigest: calculateModelInvocationLinkDigest(material),
    });
    const existing = this.#records.get(input.clientRequestId)
      ?? [...this.#records.values()].find((candidate) =>
        candidate.taskId === input.taskId
        && candidate.runId === input.runId
        && candidate.round === input.round);
    if (existing !== undefined) {
      return samePreparedModelInvocationLink(existing, input)
        ? success(existing, true)
        : conflict("Model invocation round or clientRequestId already has different facts");
    }
    this.#records.set(record.clientRequestId, clone(record));
    return success(record, false);
  }

  async recordAccepted(input: Parameters<ModelInvocationLinkPersistence["recordAccepted"]>[0]): Promise<ModelInvocationLinkWriteResult> {
    return this.#advance(input.clientRequestId, input.expectedRecordDigest, (record) => ({
      ...record,
      invocationId: input.invocationId,
      statusRevision: input.statusRevision,
      ...(input.durableCursor === undefined ? {} : { durableCursor: input.durableCursor }),
      acceptedAt: input.acceptedAt,
      updatedAt: input.acceptedAt,
    }));
  }

  async recordStreamProgress(input: Parameters<ModelInvocationLinkPersistence["recordStreamProgress"]>[0]): Promise<ModelInvocationLinkWriteResult> {
    return this.#advance(input.clientRequestId, input.expectedRecordDigest, (record) => ({
      ...record,
      statusRevision: input.statusRevision,
      ...(input.durableCursor === undefined ? {} : { durableCursor: input.durableCursor }),
      ...(record.outputStartedAt !== undefined
        ? {}
        : input.outputStartedAt === undefined ? {} : { outputStartedAt: input.outputStartedAt }),
      updatedAt: input.updatedAt,
    }));
  }

  async recordMessageCommitted(input: Parameters<ModelInvocationLinkPersistence["recordMessageCommitted"]>[0]): Promise<ModelInvocationLinkWriteResult> {
    return this.#advance(input.clientRequestId, input.expectedRecordDigest, (record) => ({
      ...record,
      messageCommittedAt: input.messageCommittedAt,
      updatedAt: input.messageCommittedAt,
    }));
  }

  async #advance(
    clientRequestId: string,
    expectedRecordDigest: string,
    mutate: (record: ModelInvocationLink) => Omit<ModelInvocationLink, "recordDigest">,
  ): Promise<ModelInvocationLinkWriteResult> {
    this.#requireStarted();
    const existing = this.#records.get(clientRequestId);
    if (existing === undefined) return notFound();
    if (existing.recordDigest !== expectedRecordDigest) {
      return conflict("Model invocation link revision changed", "model_invocation_link.stale_revision");
    }
    const material = mutate(existing);
    const updated = validate({
      ...material,
      recordDigest: calculateModelInvocationLinkDigest(material),
    });
    this.#records.set(clientRequestId, clone(updated));
    return success(updated, false);
  }

  #requireStarted(): void {
    if (!this.#started) throw new Error("Model invocation link persistence is not started");
  }
}

function validate(record: ModelInvocationLink): ModelInvocationLink {
  return ModelInvocationLinkSchema.parse(record);
}
function clone(record: ModelInvocationLink): ModelInvocationLink {
  return ModelInvocationLinkSchema.parse(record);
}
function cloneOptional(record: ModelInvocationLink | undefined): ModelInvocationLink | undefined {
  return record === undefined ? undefined : clone(record);
}
function success(value: ModelInvocationLink, replayed: boolean): ModelInvocationLinkWriteResult {
  return { ok: true, replayed, value: clone(value) };
}
function conflict(
  message: string,
  code: "model_invocation_link.conflict" | "model_invocation_link.stale_revision" = "model_invocation_link.conflict",
): ModelInvocationLinkWriteResult {
  return { ok: false, error: { code, message } };
}
function notFound(): ModelInvocationLinkWriteResult {
  return { ok: false, error: { code: "model_invocation_link.not_found", message: "Model invocation link does not exist" } };
}
