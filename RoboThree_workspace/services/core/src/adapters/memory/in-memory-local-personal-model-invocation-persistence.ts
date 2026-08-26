import {
  JsonValueSchema,
} from "@robothree/contracts";
import {
  validateLocalPersonalModelInvocationLink,
  type LocalPersonalModelInvocationLink,
} from "../../application/local-personal-model-invocation.js";
import { sha256CanonicalJson } from "../../persistence/digest.js";
import {
  validateLocalPersonalInvocationTimeoutFact,
  type LocalPersonalInvocationTimeoutFact,
} from "../../application/model-invocation-timeout-policy.js";
import type {
  LocalPersonalInvocationWriteResult,
  LocalPersonalModelInvocationPersistence,
} from "../../ports/local-personal-model-invocation-persistence.js";
import {
  validatePersonalModelStatusFact,
  type PersonalModelStatusFact,
} from "../../application/personal-model-domain.js";
import {
  InvocationUsageProjectionSchema,
  type InvocationUsageProjection,
} from "../../ports/provider-usage-projection-persistence.js";
import {
  validatePersonalModelCommandReceipt,
  type PersonalModelCommandReceipt,
} from "../../ports/personal-model-persistence.js";
import {
  ProviderUsageFactSchema,
  providerAttemptKey,
  type ProviderUsageFact,
  type ProviderUsageWriteResult,
} from "../../ports/provider-usage.js";

export class InMemoryLocalPersonalModelInvocationPersistence
implements LocalPersonalModelInvocationPersistence {
  readonly #links = new Map<string, LocalPersonalModelInvocationLink>();
  readonly #timeoutFacts = new Map<string, LocalPersonalInvocationTimeoutFact>();
  readonly #attempts = new Set<string>();
  readonly #facts = new Map<string, ProviderUsageFact>();
  readonly #projections = new Map<string, InvocationUsageProjection>();
  readonly #statuses = new Map<string, PersonalModelStatusFact>();
  readonly #receipts = new Map<string, PersonalModelCommandReceipt>();

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async prepareInvocation(
    input: Readonly<{
      link: LocalPersonalModelInvocationLink;
      timeoutFact: LocalPersonalInvocationTimeoutFact;
    }>,
  ): Promise<LocalPersonalInvocationWriteResult> {
    const link = validateLocalPersonalModelInvocationLink(input.link);
    const timeoutFact = validateLocalPersonalInvocationTimeoutFact(input.timeoutFact);
    if (link.status !== "accepted") return conflict("accepted status required");
    if (timeoutFact.authorityInvocationId !== link.authorityInvocationId) {
      return timeoutDrift("timeout fact references a different authority invocation");
    }
    const identity = linkKey(link.invocationKind, link.invocationLinkId);
    const existing = this.#links.get(identity);
    if (existing !== undefined) {
      const existingTimeout = this.#timeoutFacts.get(existing.authorityInvocationId);
      if (existingTimeout === undefined) return legacyTimeoutMissing();
      return existing.recordDigest === link.recordDigest
        && existingTimeout.recordDigest === timeoutFact.recordDigest
        ? success(existing, true)
        : timeoutDrift("invocation or timeout identity changed");
    }
    if ([...this.#links.values()].some((item) =>
      item.authorityInvocationId === link.authorityInvocationId)) {
      return conflict("authority invocation identity is already bound");
    }
    this.#links.set(identity, cloneLink(link));
    this.#timeoutFacts.set(timeoutFact.authorityInvocationId, structuredClone(timeoutFact));
    return success(link, false);
  }

  async advanceInvocation(input: Readonly<{
    expectedRecordDigest: string;
    next: LocalPersonalModelInvocationLink;
  }>): Promise<LocalPersonalInvocationWriteResult> {
    const next = validateLocalPersonalModelInvocationLink(input.next);
    const identity = linkKey(next.invocationKind, next.invocationLinkId);
    const current = this.#links.get(identity);
    if (current === undefined) return notFound();
    const rejection = validateAdvance(current, next, input.expectedRecordDigest);
    if (rejection !== undefined) return rejection;
    if (current.recordDigest === next.recordDigest) return success(current, true);
    this.#links.set(identity, cloneLink(next));
    return success(next, false);
  }

  async commitTerminalOutcome(input: Readonly<{
    expectedRecordDigest: string;
    terminal: LocalPersonalModelInvocationLink;
    usageFact?: ProviderUsageFact;
    usageProjection?: InvocationUsageProjection;
    statusObservation?: Readonly<{
      status: PersonalModelStatusFact;
      expectedStatusRevision: number;
      receipt: PersonalModelCommandReceipt;
    }>;
  }>): Promise<LocalPersonalInvocationWriteResult> {
    if (input.terminal.status !== "terminal") return conflict("terminal status required");
    if (input.usageFact !== undefined) {
      const parsed = ProviderUsageFactSchema.parse(input.usageFact);
      if (parsed.authorityInvocationId !== input.terminal.authorityInvocationId) {
        return conflict("Usage fact references a different invocation");
      }
      const identity = usageKey(parsed.authorityInvocationId, parsed.providerAttemptKey);
      if (!this.#attempts.has(identity)) {
        return conflict("Usage attempt is not registered");
      }
      const existing = this.#facts.get(identity);
      if (existing !== undefined && existing.usageDigest !== parsed.usageDigest) {
        return conflict("Usage fact digest changed");
      }
      if (input.usageProjection === undefined
        || input.usageProjection.usageEventDigest !== parsed.usageDigest) {
        return conflict("Usage fact and projection must converge together");
      }
    }
    if (input.usageFact === undefined && input.usageProjection !== undefined) {
      return conflict("Usage projection cannot exist without Provider Usage fact");
    }
    const projection = input.usageProjection === undefined
      ? undefined
      : InvocationUsageProjectionSchema.parse(input.usageProjection);
    if (projection !== undefined
      && (projection.invocationKind !== input.terminal.invocationKind
        || projection.invocationLinkId !== input.terminal.invocationLinkId
        || projection.authorityInvocationId !== input.terminal.authorityInvocationId
        || projection.usageAuthority !== "local_personal")) {
      return conflict("Usage projection references a different invocation");
    }
    const projectionKey = projection === undefined
      ? undefined
      : linkKey(projection.invocationKind, projection.invocationLinkId);
    const existingProjection = projectionKey === undefined
      ? undefined
      : this.#projections.get(projectionKey);
    if (existingProjection !== undefined
      && existingProjection.recordDigest !== projection?.recordDigest) {
      return conflict("Usage projection identity changed");
    }
    const observation = input.statusObservation;
    if (observation !== undefined) {
      const status = validatePersonalModelStatusFact(observation.status);
      const receipt = validatePersonalModelCommandReceipt(observation.receipt);
      if (status.ownerScopeNamespaceRevision !== input.terminal.ownerScopeNamespaceRevision
        || status.ownerScopeDigest !== input.terminal.ownerScopeDigest
        || status.personalModelId !== input.terminal.personalModelId
        || status.configurationRevision !== input.terminal.configurationRevision
        || status.executionDefinitionDigest !== input.terminal.executionDefinitionDigest
        || status.statusRevision !== observation.expectedStatusRevision + 1
        || receipt.commandType !== "status"
        || receipt.modelId !== status.personalModelId
        || receipt.committedConfigurationRevision !== status.configurationRevision) {
        return conflict("Status observation does not match exact invocation configuration");
      }
      const statusKey = `${status.ownerScopeDigest}:${status.personalModelId}:${status.configurationRevision}`;
      const receiptKey = `${receipt.ownerScopeDigest}:${receipt.commandId}`;
      const existingReceipt = this.#receipts.get(receiptKey);
      const current = this.#statuses.get(statusKey);
      if (existingReceipt !== undefined) {
        if (existingReceipt.receiptDigest !== receipt.receiptDigest) {
          return conflict("Status receipt identity changed");
        }
        if (current?.recordDigest !== status.recordDigest) {
          return conflict("Status receipt has no matching durable status fact");
        }
      } else if (current !== undefined
        && current.statusRevision !== observation.expectedStatusRevision) {
        return conflict("Status observation revision changed");
      }
    }
    const result = await this.advanceInvocation({
      expectedRecordDigest: input.expectedRecordDigest,
      next: input.terminal,
    });
    if (!result.ok) return result;
    if (input.usageFact !== undefined) {
      const fact = ProviderUsageFactSchema.parse(input.usageFact);
      this.#facts.set(usageKey(fact.authorityInvocationId, fact.providerAttemptKey), cloneFact(fact));
    }
    if (projection !== undefined && projectionKey !== undefined) {
      this.#projections.set(projectionKey, structuredClone(projection));
    }
    if (observation !== undefined) {
      const status = validatePersonalModelStatusFact(observation.status);
      const receipt = validatePersonalModelCommandReceipt(observation.receipt);
      this.#statuses.set(
        `${status.ownerScopeDigest}:${status.personalModelId}:${status.configurationRevision}`,
        structuredClone(status),
      );
      this.#receipts.set(`${receipt.ownerScopeDigest}:${receipt.commandId}`, structuredClone(receipt));
    }
    return result;
  }

  async loadInvocation(input: Readonly<{
    invocationKind: LocalPersonalModelInvocationLink["invocationKind"];
    invocationLinkId: string;
  }>): Promise<LocalPersonalModelInvocationLink | undefined> {
    const link = this.#links.get(linkKey(input.invocationKind, input.invocationLinkId));
    return link === undefined ? undefined : cloneLink(link);
  }

  async loadInvocationTimeoutFact(
    authorityInvocationId: string,
  ): Promise<LocalPersonalInvocationTimeoutFact | undefined> {
    const fact = this.#timeoutFacts.get(authorityInvocationId);
    return fact === undefined
      ? undefined
      : validateLocalPersonalInvocationTimeoutFact(structuredClone(fact));
  }

  async listPending(limit: number): Promise<readonly LocalPersonalModelInvocationLink[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new Error("Local invocation pending limit must be between 1 and 200");
    }
    return [...this.#links.values()]
      .filter((link) => link.status !== "terminal" && link.status !== "recovery_exhausted")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
        || left.invocationLinkId.localeCompare(right.invocationLinkId))
      .slice(0, limit)
      .map(cloneLink);
  }

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
    if (![...this.#links.values()].some((link) =>
      link.authorityInvocationId === input.authorityInvocationId
      && link.fencingEpoch === input.fencingEpoch
      && link.status !== "terminal"
      && link.status !== "recovery_exhausted")) {
      throw new Error("Local Provider attempt has no exact invocation link");
    }
    this.#attempts.add(usageKey(input.authorityInvocationId, input.providerAttemptKey));
  }

  async record(fact: ProviderUsageFact): Promise<ProviderUsageWriteResult> {
    const parsed = ProviderUsageFactSchema.parse(fact);
    if (parsed.usageAuthority !== "local_personal") return usageConflict();
    const identity = usageKey(parsed.authorityInvocationId, parsed.providerAttemptKey);
    if (!this.#attempts.has(identity)) {
      return {
        ok: false,
        error: {
          code: "provider_usage.attempt_not_registered",
          message: "Provider Usage references an unregistered attempt",
        },
      };
    }
    const existing = this.#facts.get(identity);
    if (existing !== undefined) {
      return existing.usageDigest === parsed.usageDigest
        ? { ok: true, replayed: true, value: cloneFact(existing) }
        : usageConflict();
    }
    this.#facts.set(identity, cloneFact(parsed));
    return { ok: true, replayed: false, value: cloneFact(parsed) };
  }

  async load(input: Readonly<{
    authorityInvocationId: string;
    providerAttemptKey: string;
  }>): Promise<ProviderUsageFact | undefined> {
    const fact = this.#facts.get(usageKey(input.authorityInvocationId, input.providerAttemptKey));
    return fact === undefined ? undefined : cloneFact(fact);
  }
}

function validateAdvance(
  current: LocalPersonalModelInvocationLink,
  next: LocalPersonalModelInvocationLink,
  expectedRecordDigest: string,
): LocalPersonalInvocationWriteResult | undefined {
  if (current.recordDigest !== expectedRecordDigest) return conflict("invocation CAS conflict");
  if (next.fencingEpoch < current.fencingEpoch) {
    return {
      ok: false,
      error: {
        code: "local_personal_invocation.stale_fencing",
        message: "stale invocation owner cannot advance durable facts",
      },
    };
  }
  const immutable = [
    "invocationKind", "invocationLinkId", "authorityInvocationId", "sessionId", "taskId",
    "runId", "round", "taskRuntimeSelectionId", "taskRuntimeSelectionDigest", "modelLockId",
    "modelLockDigest", "ownerScopeNamespaceRevision", "ownerScopeDigest", "personalModelId",
    "configurationRevision", "executionDefinitionDigest", "providerProfileRevision",
    "endpointIdentityDigest", "credentialBindingDigest", "modelRequestDigest",
    "admissionScopeDigest", "createdAt",
  ] as const;
  if (immutable.some((field) => current[field] !== next[field])) {
    return conflict("immutable invocation identity changed");
  }
  if (current.schemaVersion !== next.schemaVersion
    || (current.schemaVersion === "v1alpha2" && next.schemaVersion === "v1alpha2"
      && (current.contextAssemblyReceiptDigest !== next.contextAssemblyReceiptDigest
        || sha256CanonicalJson(JsonValueSchema.parse(current.dynamicRequestFacts))
          !== sha256CanonicalJson(JsonValueSchema.parse(next.dynamicRequestFacts))))) {
    return conflict("immutable dynamic invocation context changed");
  }
  if (next.updatedAt < current.updatedAt) return conflict("invocation timestamp regressed");
  if (current.outputStartedAt !== undefined
    && next.outputStartedAt !== current.outputStartedAt) {
    return conflict("output-started evidence changed");
  }
  const order = ["accepted", "dispatching", "output_started", "terminal", "recovery_exhausted"];
  if (order.indexOf(next.status) < order.indexOf(current.status)) {
    return conflict("invocation status regressed");
  }
  if ((current.status === "terminal" || current.status === "recovery_exhausted")
    && current.recordDigest !== next.recordDigest) {
    return conflict("terminal invocation is immutable");
  }
  return undefined;
}

function linkKey(kind: string, id: string): string { return `${kind}:${id}`; }
function usageKey(invocationId: string, attempt: string): string { return `${invocationId}:${attempt}`; }
function cloneLink(value: LocalPersonalModelInvocationLink): LocalPersonalModelInvocationLink {
  return validateLocalPersonalModelInvocationLink(structuredClone(value));
}
function cloneFact(value: ProviderUsageFact): ProviderUsageFact {
  return ProviderUsageFactSchema.parse(structuredClone(value));
}
function success(
  value: LocalPersonalModelInvocationLink,
  replayed: boolean,
): LocalPersonalInvocationWriteResult {
  return { ok: true, replayed, value: cloneLink(value) };
}
function conflict(message: string): LocalPersonalInvocationWriteResult {
  return { ok: false, error: { code: "local_personal_invocation.conflict", message } };
}
function notFound(): LocalPersonalInvocationWriteResult {
  return {
    ok: false,
    error: { code: "local_personal_invocation.not_found", message: "invocation link not found" },
  };
}
function legacyTimeoutMissing(): LocalPersonalInvocationWriteResult {
  return {
    ok: false,
    error: {
      code: "local_personal.timeout_fact_legacy_missing",
      message: "pending local invocation has no durable timeout fact",
    },
  };
}
function timeoutDrift(message: string): LocalPersonalInvocationWriteResult {
  return { ok: false, error: { code: "local_personal.timeout_fact_drift", message } };
}
function usageConflict(): ProviderUsageWriteResult {
  return {
    ok: false,
    error: { code: "provider_usage.conflict", message: "Provider Usage digest changed" },
  };
}
