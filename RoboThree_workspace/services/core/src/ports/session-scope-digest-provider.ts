import {
  EntityIdSchema,
  Sha256DigestSchema,
  TimestampSchema,
} from "@robothree/contracts";
import { z } from "zod";

export const CacheExecutionAuthoritySchema = z.enum([
  "central_enterprise",
  "local_personal",
]);
export type CacheExecutionAuthority = z.infer<typeof CacheExecutionAuthoritySchema>;

export const ModelInvocationKindSchema = z.enum([
  "assistant_message",
  "compaction_summary",
]);
export type ModelInvocationKind = z.infer<typeof ModelInvocationKindSchema>;

export const PromptCacheScopeNamespaceSchema = z.object({
  namespaceRevision: EntityIdSchema,
  cacheExecutionAuthority: CacheExecutionAuthoritySchema,
  namespaceKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  status: z.enum(["active", "retired"]),
  createdAt: TimestampSchema,
  recordDigest: Sha256DigestSchema,
}).strict();
export type PromptCacheScopeNamespace = z.infer<typeof PromptCacheScopeNamespaceSchema>;

export const ModelInvocationCacheContextSchema = z.object({
  invocationKind: ModelInvocationKindSchema,
  invocationLinkId: EntityIdSchema,
  cacheExecutionAuthority: CacheExecutionAuthoritySchema,
  sessionScopeDigest: Sha256DigestSchema,
  scopeNamespaceRevision: EntityIdSchema,
  cacheContextDigest: Sha256DigestSchema,
  gatewayContractVersion: z.literal("v1alpha2"),
  createdAt: TimestampSchema,
  recordDigest: Sha256DigestSchema,
}).strict();
export type ModelInvocationCacheContext = z.infer<typeof ModelInvocationCacheContextSchema>;

export type PromptCachePersistenceErrorCode =
  | "prompt_cache.namespace_conflict"
  | "prompt_cache.namespace_unavailable"
  | "prompt_cache.context_conflict"
  | "prompt_cache.context_not_found"
  | "prompt_cache.integrity_invalid";

export type PromptCacheWriteResult<T> =
  | Readonly<{ ok: true; replayed: boolean; value: T }>
  | Readonly<{
    ok: false;
    error: Readonly<{ code: PromptCachePersistenceErrorCode; message: string }>;
  }>;

export interface PromptCacheContextPersistence {
  start(): Promise<void>;
  stop(): Promise<void>;
  loadContext(
    invocationKind: ModelInvocationKind,
    invocationLinkId: string,
  ): Promise<ModelInvocationCacheContext | undefined>;
  loadNamespace(namespaceRevision: string): Promise<PromptCacheScopeNamespace | undefined>;
  loadActiveNamespace(
    authority: CacheExecutionAuthority,
  ): Promise<PromptCacheScopeNamespace | undefined>;
  listNamespaces(
    authority: CacheExecutionAuthority,
  ): Promise<readonly PromptCacheScopeNamespace[]>;
  createNamespace(
    namespace: PromptCacheScopeNamespace,
  ): Promise<PromptCacheWriteResult<PromptCacheScopeNamespace>>;
  createContext(
    context: ModelInvocationCacheContext,
  ): Promise<PromptCacheWriteResult<ModelInvocationCacheContext>>;
  retireNamespace(
    namespaceRevision: string,
    expectedRecordDigest: string,
  ): Promise<PromptCacheWriteResult<PromptCacheScopeNamespace>>;
}

export type SessionScopeDigestInput = Readonly<{
  authority: CacheExecutionAuthority;
  sessionId: string;
  invocationKind: ModelInvocationKind;
  invocationLinkId: string;
  createdAt: string;
}>;

export interface SessionScopeDigestProvider {
  load(
    invocationKind: ModelInvocationKind,
    invocationLinkId: string,
  ): Promise<ModelInvocationCacheContext | undefined>;
  resolve(input: SessionScopeDigestInput): Promise<ModelInvocationCacheContext>;
}
