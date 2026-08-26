import {
  calculateModelInvocationCacheContextDigest,
  calculatePromptCacheNamespaceDigest,
} from "../../application/session-scope-digest-provider.js";
import {
  ModelInvocationCacheContextSchema,
  PromptCacheScopeNamespaceSchema,
  type CacheExecutionAuthority,
  type ModelInvocationCacheContext,
  type ModelInvocationKind,
  type PromptCacheContextPersistence,
  type PromptCacheScopeNamespace,
  type PromptCacheWriteResult,
} from "../../ports/session-scope-digest-provider.js";

export class InMemoryPromptCacheContextPersistence
implements PromptCacheContextPersistence {
  readonly #namespaces = new Map<string, PromptCacheScopeNamespace>();
  readonly #contexts = new Map<string, ModelInvocationCacheContext>();
  #started = false;

  async start(): Promise<void> { this.#started = true; }
  async stop(): Promise<void> { this.#started = false; }

  async loadContext(
    invocationKind: ModelInvocationKind,
    invocationLinkId: string,
  ): Promise<ModelInvocationCacheContext | undefined> {
    this.#requireStarted();
    return cloneContext(this.#contexts.get(contextKey(invocationKind, invocationLinkId)));
  }

  async loadNamespace(namespaceRevision: string): Promise<PromptCacheScopeNamespace | undefined> {
    this.#requireStarted();
    return cloneNamespace(this.#namespaces.get(namespaceRevision));
  }

  async loadActiveNamespace(
    authority: CacheExecutionAuthority,
  ): Promise<PromptCacheScopeNamespace | undefined> {
    this.#requireStarted();
    return cloneNamespace([...this.#namespaces.values()].find((candidate) =>
      candidate.cacheExecutionAuthority === authority && candidate.status === "active"));
  }

  async listNamespaces(
    authority: CacheExecutionAuthority,
  ): Promise<readonly PromptCacheScopeNamespace[]> {
    this.#requireStarted();
    return [...this.#namespaces.values()]
      .filter((candidate) => candidate.cacheExecutionAuthority === authority)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
        || left.namespaceRevision.localeCompare(right.namespaceRevision))
      .map((candidate) => cloneNamespace(candidate)!);
  }

  async createNamespace(
    namespace: PromptCacheScopeNamespace,
  ): Promise<PromptCacheWriteResult<PromptCacheScopeNamespace>> {
    this.#requireStarted();
    const validated = validateNamespace(namespace);
    const existing = this.#namespaces.get(validated.namespaceRevision);
    if (existing !== undefined) {
      return existing.recordDigest === validated.recordDigest
        ? success(cloneNamespace(existing)!, true)
        : failure("prompt_cache.namespace_conflict", "Prompt Cache namespace revision has different facts");
    }
    const active = [...this.#namespaces.values()].find((candidate) =>
      candidate.cacheExecutionAuthority === validated.cacheExecutionAuthority
      && candidate.status === "active");
    if (active !== undefined && validated.status === "active") {
      return failure("prompt_cache.namespace_conflict", "Prompt Cache authority already has an active namespace");
    }
    this.#namespaces.set(validated.namespaceRevision, cloneNamespace(validated)!);
    return success(validated, false);
  }

  async createContext(
    context: ModelInvocationCacheContext,
  ): Promise<PromptCacheWriteResult<ModelInvocationCacheContext>> {
    this.#requireStarted();
    const validated = validateContext(context);
    const key = contextKey(validated.invocationKind, validated.invocationLinkId);
    const existing = this.#contexts.get(key);
    if (existing !== undefined) {
      return existing.recordDigest === validated.recordDigest
        ? success(cloneContext(existing)!, true)
        : failure("prompt_cache.context_conflict", "Invocation link already has a different Prompt Cache context");
    }
    const namespace = this.#namespaces.get(validated.scopeNamespaceRevision);
    if (namespace === undefined || namespace.status !== "active") {
      return failure("prompt_cache.namespace_unavailable", "Prompt Cache namespace is not active");
    }
    this.#contexts.set(key, cloneContext(validated)!);
    return success(validated, false);
  }

  async retireNamespace(
    namespaceRevision: string,
    expectedRecordDigest: string,
  ): Promise<PromptCacheWriteResult<PromptCacheScopeNamespace>> {
    this.#requireStarted();
    const existing = this.#namespaces.get(namespaceRevision);
    if (existing === undefined) {
      return failure("prompt_cache.namespace_unavailable", "Prompt Cache namespace does not exist");
    }
    if (existing.recordDigest !== expectedRecordDigest) {
      return failure("prompt_cache.namespace_conflict", "Prompt Cache namespace revision changed");
    }
    if (existing.status === "retired") return success(existing, true);
    const material = { ...existing, status: "retired" as const };
    const { recordDigest: _oldDigest, ...withoutDigest } = material;
    const retired = validateNamespace({
      ...withoutDigest,
      recordDigest: calculatePromptCacheNamespaceDigest(withoutDigest),
    });
    this.#namespaces.set(namespaceRevision, cloneNamespace(retired)!);
    return success(retired, false);
  }

  #requireStarted(): void {
    if (!this.#started) throw new Error("Prompt Cache context persistence is not started");
  }
}

function validateNamespace(value: PromptCacheScopeNamespace): PromptCacheScopeNamespace {
  const parsed = PromptCacheScopeNamespaceSchema.parse(value);
  const { recordDigest, ...material } = parsed;
  if (recordDigest !== calculatePromptCacheNamespaceDigest(material)) {
    throw new Error("Prompt Cache namespace record digest is invalid");
  }
  return parsed;
}

function validateContext(value: ModelInvocationCacheContext): ModelInvocationCacheContext {
  const parsed = ModelInvocationCacheContextSchema.parse(value);
  const { recordDigest, ...material } = parsed;
  if (recordDigest !== calculateModelInvocationCacheContextDigest(material)) {
    throw new Error("Prompt Cache context record digest is invalid");
  }
  return parsed;
}

function contextKey(kind: ModelInvocationKind, id: string): string {
  return `${kind}:${id}`;
}

function cloneNamespace(
  value: PromptCacheScopeNamespace | undefined,
): PromptCacheScopeNamespace | undefined {
  return value === undefined ? undefined : PromptCacheScopeNamespaceSchema.parse(value);
}

function cloneContext(
  value: ModelInvocationCacheContext | undefined,
): ModelInvocationCacheContext | undefined {
  return value === undefined ? undefined : ModelInvocationCacheContextSchema.parse(value);
}

function success<T>(value: T, replayed: boolean): PromptCacheWriteResult<T> {
  return { ok: true, replayed, value };
}

function failure<T>(
  code: Exclude<PromptCacheWriteResult<T>, { ok: true }>["error"]["code"],
  message: string,
): PromptCacheWriteResult<T> {
  return { ok: false, error: { code, message } };
}
