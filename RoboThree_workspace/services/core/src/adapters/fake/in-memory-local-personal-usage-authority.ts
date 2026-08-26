import {
  ProviderUsageFactSchema,
  providerAttemptKey,
  type LocalPersonalUsageAuthorityPort,
  type ProviderUsageFact,
  type ProviderUsageWriteResult,
} from "../../ports/provider-usage.js";

export class InMemoryLocalPersonalUsageAuthority
implements LocalPersonalUsageAuthorityPort {
  readonly #attempts = new Set<string>();
  readonly #facts = new Map<string, ProviderUsageFact>();

  async registerAttempt(input: Readonly<{
    authorityInvocationId: string;
    fencingEpoch: number;
    providerAttemptKey: string;
  }>): Promise<void> {
    if (input.providerAttemptKey !== providerAttemptKey(
      "local_personal",
      input.authorityInvocationId,
      input.fencingEpoch,
    )) throw new Error("Local Provider attempt key mismatch");
    this.#attempts.add(key(input.authorityInvocationId, input.providerAttemptKey));
  }

  async record(fact: ProviderUsageFact): Promise<ProviderUsageWriteResult> {
    const parsed = ProviderUsageFactSchema.parse(fact);
    if (parsed.usageAuthority !== "local_personal") {
      return conflict("provider_usage.conflict", "Local authority rejects enterprise facts");
    }
    const identity = key(parsed.authorityInvocationId, parsed.providerAttemptKey);
    if (!this.#attempts.has(identity)) {
      return conflict(
        "provider_usage.attempt_not_registered",
        "Provider Usage references an unregistered attempt",
      );
    }
    const existing = this.#facts.get(identity);
    if (existing === undefined) {
      this.#facts.set(identity, parsed);
      return { ok: true, replayed: false, value: clone(parsed) };
    }
    if (existing.usageDigest !== parsed.usageDigest) {
      return conflict("provider_usage.conflict", "Provider Usage digest changed");
    }
    return { ok: true, replayed: true, value: clone(existing) };
  }

  async load(input: Readonly<{
    authorityInvocationId: string;
    providerAttemptKey: string;
  }>): Promise<ProviderUsageFact | undefined> {
    const value = this.#facts.get(key(
      input.authorityInvocationId,
      input.providerAttemptKey,
    ));
    return value === undefined ? undefined : clone(value);
  }
}

function key(invocationId: string, attemptKey: string): string {
  return `${invocationId}:${attemptKey}`;
}

function clone(value: ProviderUsageFact): ProviderUsageFact {
  return ProviderUsageFactSchema.parse(JSON.parse(JSON.stringify(value)) as unknown);
}

function conflict(
  code: "provider_usage.conflict" | "provider_usage.attempt_not_registered",
  message: string,
): ProviderUsageWriteResult {
  return { ok: false, error: { code, message } };
}
