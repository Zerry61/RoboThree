import { createHmac, randomBytes } from "node:crypto";

import {
  EntityIdSchema,
  JsonValueSchema,
  canonicalJsonStringify,
} from "@robothree/contracts";

import type { IdGenerator } from "../ports/id-generator.js";
import {
  ModelInvocationCacheContextSchema,
  PromptCacheScopeNamespaceSchema,
  type ModelInvocationCacheContext,
  type PromptCacheContextPersistence,
  type PromptCacheScopeNamespace,
  type SessionScopeDigestInput,
  type SessionScopeDigestProvider,
} from "../ports/session-scope-digest-provider.js";
import { sha256CanonicalJson } from "../persistence/digest.js";

export class SessionScopeDigestError extends Error {
  public constructor(
    public readonly code:
      | "prompt_cache.namespace_unavailable"
      | "prompt_cache.context_conflict"
      | "prompt_cache.integrity_invalid",
    message: string,
  ) {
    super(message);
    this.name = "SessionScopeDigestError";
  }
}

export class PersistentSessionScopeDigestProvider implements SessionScopeDigestProvider {
  readonly #persistence: PromptCacheContextPersistence;
  readonly #ids: IdGenerator;
  readonly #namespaceKeyFactory: () => string;

  public constructor(input: Readonly<{
    persistence: PromptCacheContextPersistence;
    ids: IdGenerator;
    namespaceKeyFactory?: () => string;
  }>) {
    this.#persistence = input.persistence;
    this.#ids = input.ids;
    this.#namespaceKeyFactory = input.namespaceKeyFactory
      ?? (() => randomBytes(32).toString("base64url"));
  }

  public async load(
    invocationKind: SessionScopeDigestInput["invocationKind"],
    invocationLinkId: string,
  ): Promise<ModelInvocationCacheContext | undefined> {
    const context = await this.#persistence.loadContext(invocationKind, invocationLinkId);
    if (context === undefined) return undefined;
    const namespace = await this.#persistence.loadNamespace(context.scopeNamespaceRevision);
    if (namespace === undefined) {
      throw integrity("Prompt Cache namespace required by the invocation context is unavailable");
    }
    validateNamespace(namespace);
    validateContext(context);
    if (namespace.cacheExecutionAuthority !== context.cacheExecutionAuthority) {
      throw integrity("Prompt Cache context authority does not match its namespace");
    }
    return context;
  }

  public async resolve(input: SessionScopeDigestInput): Promise<ModelInvocationCacheContext> {
    EntityIdSchema.parse(input.sessionId);
    EntityIdSchema.parse(input.invocationLinkId);
    const existing = await this.load(input.invocationKind, input.invocationLinkId);
    if (existing !== undefined) {
      const namespace = (await this.#persistence.loadNamespace(existing.scopeNamespaceRevision))!;
      const expected = deriveSessionScopeDigest(namespace, input.authority, input.sessionId);
      if (existing.cacheExecutionAuthority !== input.authority
        || existing.sessionScopeDigest !== expected) {
        throw new SessionScopeDigestError(
          "prompt_cache.context_conflict",
          "Prompt Cache invocation link already has a different immutable Session scope",
        );
      }
      return existing;
    }

    let namespace = await this.#persistence.loadActiveNamespace(input.authority);
    if (namespace === undefined) {
      const historical = await this.#persistence.listNamespaces(input.authority);
      if (historical.length !== 0) {
        throw new SessionScopeDigestError(
          "prompt_cache.namespace_unavailable",
          "Prompt Cache has no active namespace for new invocation contexts",
        );
      }
      namespace = await this.#createInitialNamespace(input);
    }
    validateNamespace(namespace);
    if (namespace.status !== "active") {
      throw new SessionScopeDigestError(
        "prompt_cache.namespace_unavailable",
        "Prompt Cache namespace is not active for new invocation contexts",
      );
    }
    const sessionScopeDigest = deriveSessionScopeDigest(namespace, input.authority, input.sessionId);
    const cacheContextDigest = sha256CanonicalJson(JsonValueSchema.parse({
      sessionScopeDigest: unprefixed(sessionScopeDigest),
    }));
    const material = {
      invocationKind: input.invocationKind,
      invocationLinkId: input.invocationLinkId,
      cacheExecutionAuthority: input.authority,
      sessionScopeDigest,
      scopeNamespaceRevision: namespace.namespaceRevision,
      cacheContextDigest,
      gatewayContractVersion: "v1alpha2" as const,
      createdAt: input.createdAt,
    };
    const context = ModelInvocationCacheContextSchema.parse({
      ...material,
      recordDigest: sha256CanonicalJson(JsonValueSchema.parse(material)),
    });
    const result = await this.#persistence.createContext(context);
    if (!result.ok) {
      if (result.error.code === "prompt_cache.context_conflict") {
        throw new SessionScopeDigestError(result.error.code, result.error.message);
      }
      throw integrity(result.error.message);
    }
    return result.value;
  }

  async #createInitialNamespace(
    input: SessionScopeDigestInput,
  ): Promise<PromptCacheScopeNamespace> {
    const material = {
      namespaceRevision: this.#ids.next(),
      cacheExecutionAuthority: input.authority,
      namespaceKey: this.#namespaceKeyFactory(),
      status: "active" as const,
      createdAt: input.createdAt,
    };
    const namespace = PromptCacheScopeNamespaceSchema.parse({
      ...material,
      recordDigest: sha256CanonicalJson(JsonValueSchema.parse(material)),
    });
    const result = await this.#persistence.createNamespace(namespace);
    if (result.ok) return result.value;
    const concurrent = await this.#persistence.loadActiveNamespace(input.authority);
    if (concurrent !== undefined) return concurrent;
    throw new SessionScopeDigestError(
      "prompt_cache.namespace_unavailable",
      "Prompt Cache namespace could not be initialized",
    );
  }
}

export function calculatePromptCacheNamespaceDigest(
  namespace: Omit<PromptCacheScopeNamespace, "recordDigest">,
): string {
  return sha256CanonicalJson(JsonValueSchema.parse(namespace));
}

export function calculateModelInvocationCacheContextDigest(
  context: Omit<ModelInvocationCacheContext, "recordDigest">,
): string {
  return sha256CanonicalJson(JsonValueSchema.parse(context));
}

function validateNamespace(namespace: PromptCacheScopeNamespace): void {
  const { recordDigest, ...material } = PromptCacheScopeNamespaceSchema.parse(namespace);
  if (recordDigest !== calculatePromptCacheNamespaceDigest(material)) {
    throw integrity("Prompt Cache namespace record digest is invalid");
  }
}

function validateContext(context: ModelInvocationCacheContext): void {
  const { recordDigest, ...material } = ModelInvocationCacheContextSchema.parse(context);
  if (recordDigest !== calculateModelInvocationCacheContextDigest(material)) {
    throw integrity("Prompt Cache invocation context record digest is invalid");
  }
  const expected = sha256CanonicalJson(JsonValueSchema.parse({
    sessionScopeDigest: unprefixed(context.sessionScopeDigest),
  }));
  if (context.cacheContextDigest !== expected) {
    throw integrity("Prompt Cache sidecar digest is invalid");
  }
}

function deriveSessionScopeDigest(
  namespace: PromptCacheScopeNamespace,
  authority: SessionScopeDigestInput["authority"],
  sessionId: string,
): string {
  const material = canonicalJsonStringify(JsonValueSchema.parse({
    schemaVersion: "v1alpha1",
    cacheExecutionAuthority: authority,
    sessionId,
  }));
  const key = Buffer.from(namespace.namespaceKey, "base64url");
  if (key.byteLength !== 32) throw integrity("Prompt Cache namespace key is invalid");
  return `sha256:${createHmac("sha256", key).update(material, "utf8").digest("hex")}`;
}

function unprefixed(digest: string): string {
  if (!/^sha256:[a-f0-9]{64}$/u.test(digest)) throw integrity("Prompt Cache digest is invalid");
  return digest.slice("sha256:".length);
}

function integrity(message: string): SessionScopeDigestError {
  return new SessionScopeDigestError("prompt_cache.integrity_invalid", message);
}
