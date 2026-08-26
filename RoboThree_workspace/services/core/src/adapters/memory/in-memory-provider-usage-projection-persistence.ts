import {
  InvocationUsageProjectionSchema,
  type InvocationUsageProjection,
  type PrepareInvocationUsageProjection,
  type ProviderUsageProjectionPersistence,
  type UsageProjectionWriteResult,
  withUsageProjectionDigest,
} from "../../ports/provider-usage-projection-persistence.js";

export class InMemoryProviderUsageProjectionPersistence
implements ProviderUsageProjectionPersistence {
  readonly #records = new Map<string, InvocationUsageProjection>();
  readonly #eventOwners = new Map<string, string>();

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async record(input: PrepareInvocationUsageProjection): Promise<UsageProjectionWriteResult> {
    const next = withUsageProjectionDigest(input);
    const identity = key(next.invocationKind, next.invocationLinkId);
    const eventOwner = this.#eventOwners.get(next.usageEventId);
    if (eventOwner !== undefined && eventOwner !== identity) return conflict();
    const current = this.#records.get(identity);
    if (current !== undefined) {
      return current.recordDigest === next.recordDigest
        ? { ok: true, replayed: true, value: clone(current) }
        : conflict();
    }
    this.#records.set(identity, next);
    this.#eventOwners.set(next.usageEventId, identity);
    return { ok: true, replayed: false, value: clone(next) };
  }

  async loadByLink(
    invocationKind: InvocationUsageProjection["invocationKind"],
    invocationLinkId: string,
  ): Promise<InvocationUsageProjection | undefined> {
    const value = this.#records.get(key(invocationKind, invocationLinkId));
    return value === undefined ? undefined : clone(value);
  }

  async listBySession(sessionId: string): Promise<readonly InvocationUsageProjection[]> {
    return [...this.#records.values()]
      .filter((record) => record.sessionId === sessionId)
      .sort((left, right) => left.recordDigest.localeCompare(right.recordDigest))
      .map(clone);
  }
}

const key = (kind: string, id: string): string => `${kind}:${id}`;
const clone = (value: InvocationUsageProjection): InvocationUsageProjection =>
  InvocationUsageProjectionSchema.parse(JSON.parse(JSON.stringify(value)) as unknown);
const conflict = (): UsageProjectionWriteResult => ({
  ok: false,
  error: { code: "usage_projection.conflict", message: "Usage projection identity changed" },
});
