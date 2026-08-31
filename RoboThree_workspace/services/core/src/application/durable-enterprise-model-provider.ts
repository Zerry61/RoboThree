import { createHash } from "node:crypto";

import {
  JsonValueSchema,
  ModelStreamEventSchema,
  type AssistantToolCall,
  type JsonObject,
  type ModelStreamEvent,
  type RuntimeError,
} from "@robothree/contracts";
import type { ReadableModelRequest } from "@robothree/contracts/model-protocol/v1alpha2";

import type { Clock } from "../ports/clock.js";
import type {
  EnterpriseIdentityScope,
} from "../ports/enterprise-access-token-provider.js";
import type {
  EnterpriseModelEvent,
  EnterpriseModelGatewayClient,
  EnterpriseModelStatus,
} from "../ports/enterprise-model-gateway-client.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type {
  ModelInvocationLink,
  ModelInvocationLinkPersistence,
  ModelInvocationLinkWriteResult,
} from "../ports/model-invocation-link-persistence.js";
import type {
  ProviderUsageProjectionPersistence,
} from "../ports/provider-usage-projection-persistence.js";
import type {
  CompactionModelInvocationLink,
  CompactionModelInvocationLinkPersistence,
  CompactionModelInvocationLinkWriteResult,
} from "../ports/compaction-model-invocation-link-persistence.js";
import type { ModelProvider } from "../ports/model-provider.js";
import type { ModelProviderInvocation } from "../ports/model-provider-invocation.js";
import type {
  ModelInvocationCacheContext,
  ModelInvocationKind,
  SessionScopeDigestProvider,
} from "../ports/session-scope-digest-provider.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  EnterpriseModelRequestConverter,
  projectEnterpriseProviderToolName,
} from "./enterprise-model-request-converter.js";
import {
  deriveEnterpriseReasoningProfileSubject,
  projectEnterpriseReasoningSidecar,
  type EnterpriseReasoningMappingInstallation,
  type EnterpriseReasoningSafeSidecar,
} from "./enterprise-reasoning-mapping.js";
import { parseReadableModelRequest } from "./model-request-revisions.js";
import { ReasoningProtocolUnavailableError } from "./model-reasoning-protocol.js";
import {
  validateDynamicRequestFacts,
  type DynamicRequestFactsSubject,
  type DynamicRequestFactsV1,
} from "./dynamic-request-facts.js";

export class ModelStreamResumeUnavailableError extends Error {
  public readonly code = "model_stream_resume_unavailable";
  public readonly outputStarted: boolean;

  public constructor(outputStarted = true) {
    super("The complete Model output stream is no longer available");
    this.name = "ModelStreamResumeUnavailableError";
    this.outputStarted = outputStarted;
  }
}

/**
 * Application-level model provider that coordinates the local durable link
 * around the private Enterprise Gateway HTTP client. It persists identities
 * and digests only; prompt, output and stream deltas remain out of SQLite.
 */
export class DurableEnterpriseModelProvider implements ModelProvider {
  public readonly adapterKind = "model_provider" as const;
  public readonly adapterDescriptorId: string;
  public readonly adapterDescriptorRevision: string;

  readonly #gateway: EnterpriseModelGatewayClient;
  readonly #links: ModelInvocationLinkPersistence;
  readonly #compactionLinks: CompactionModelInvocationLinkPersistence | undefined;
  readonly #usageProjections: ProviderUsageProjectionPersistence | undefined;
  readonly #sessionScopes: SessionScopeDigestProvider | undefined;
  readonly #identityScope: EnterpriseIdentityScope;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #converter: EnterpriseModelRequestConverter;
  readonly #streamIdleTimeoutMillis: number;
  readonly #reasoning: EnterpriseReasoningMappingInstallation | undefined;

  public constructor(input: Readonly<{
    adapterDescriptorId: string;
    adapterDescriptorRevision: string;
    gateway: EnterpriseModelGatewayClient;
    links: ModelInvocationLinkPersistence;
    compactionLinks?: CompactionModelInvocationLinkPersistence;
    usageProjections?: ProviderUsageProjectionPersistence;
    sessionScopes?: SessionScopeDigestProvider;
    identityScope: EnterpriseIdentityScope;
    clock: Clock;
    ids: IdGenerator;
    converter?: EnterpriseModelRequestConverter;
    streamIdleTimeoutMillis?: number;
    reasoning?: EnterpriseReasoningMappingInstallation;
  }>) {
    this.adapterDescriptorId = input.adapterDescriptorId;
    this.adapterDescriptorRevision = input.adapterDescriptorRevision;
    this.#gateway = input.gateway;
    this.#links = input.links;
    this.#compactionLinks = input.compactionLinks;
    this.#usageProjections = input.usageProjections;
    this.#sessionScopes = input.sessionScopes;
    this.#identityScope = Object.freeze({ ...input.identityScope });
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#converter = input.converter ?? new EnterpriseModelRequestConverter();
    this.#streamIdleTimeoutMillis = input.streamIdleTimeoutMillis ?? 30_000;
    this.#reasoning = input.reasoning;
    if (
      !Number.isInteger(this.#streamIdleTimeoutMillis)
      || this.#streamIdleTimeoutMillis < 1
      || this.#streamIdleTimeoutMillis > 300_000
    ) throw new Error("streamIdleTimeoutMillis is outside its limit");
  }

  public async *stream(
    candidate: ReadableModelRequest,
    signal: AbortSignal,
    invocation?: ModelProviderInvocation,
  ): AsyncIterable<ModelStreamEvent> {
    const request = parseReadableModelRequest(candidate);
    const exact = requireInvocation(request, invocation, this);
    if (exact.purpose === "compaction_summary") {
      yield* this.#streamCompactionSummary(request, signal, exact);
      return;
    }
    const clientRequestId = stableUuid(
      `${exact.taskId}:${exact.runId}:${exact.round}`,
      "enterprise-model-client-request",
    );
    const transportRequestId = this.#ids.next();
    const existingV3Link = request.schemaVersion === "v1alpha2"
      ? await this.#links.loadRound(exact.taskId, exact.runId, exact.round)
      : undefined;
    if (existingV3Link?.messageCommittedAt !== undefined) {
      yield ModelStreamEventSchema.parse({ type: "started" });
      yield ModelStreamEventSchema.parse({ type: "completed", finishReason: "durable_replay" });
      return;
    }
    const reasoning = await this.#reasoningSidecar(request, exact);
    const v3CreatedAt = existingV3Link?.createdAt ?? this.#clock.now();
    const v3CacheContext = request.schemaVersion === "v1alpha2"
      ? await this.#cacheContext({
        invocationKind: "assistant_message",
        invocationLinkId: clientRequestId,
        sessionId: exact.sessionId,
        createdAt: v3CreatedAt,
        accepted: existingV3Link?.invocationId !== undefined,
      })
      : undefined;
    const baseMaterial = this.#converter.convert({
      invocation: exact,
      clientRequestId,
      transportRequestId,
      providerStreamIdleTimeoutMillis: this.#streamIdleTimeoutMillis,
      ...(reasoning === undefined ? {} : { reasoning }),
      ...(v3CacheContext === undefined ? {} : { cacheContext: v3CacheContext }),
    });
    let link = await this.#prepareLink(
      exact,
      clientRequestId,
      baseMaterial.requestDigest,
      request.schemaVersion === "v1alpha2" ? v3CreatedAt : undefined,
    );
    if (link.messageCommittedAt !== undefined) {
      yield ModelStreamEventSchema.parse({ type: "started" });
      yield ModelStreamEventSchema.parse({ type: "completed", finishReason: "durable_replay" });
      return;
    }
    const cacheContext = request.schemaVersion === "v1alpha2" ? v3CacheContext : await this.#cacheContext({
      invocationKind: "assistant_message",
      invocationLinkId: link.clientRequestId,
      sessionId: exact.sessionId,
      createdAt: link.createdAt,
      accepted: link.invocationId !== undefined,
    });
    const material = cacheContext === undefined
      ? baseMaterial
      : request.schemaVersion === "v1alpha2" ? baseMaterial : this.#converter.convert({
        invocation: exact,
        clientRequestId,
        transportRequestId,
        providerStreamIdleTimeoutMillis: this.#streamIdleTimeoutMillis,
        cacheContext,
      });

    const operation = this.#gateway.begin(this.#identityScope, material.gatewayContractVersion);
    if (link.invocationId === undefined) {
      const accepted = await operation.accept(material.document, signal);
      if (
        accepted.clientRequestId !== clientRequestId
        || accepted.requestDigest !== material.requestDigest
      ) throw new Error("Enterprise Model accept identity does not match the local durable link");
      link = requireWrite(await this.#links.recordAccepted({
        clientRequestId,
        expectedRecordDigest: link.recordDigest,
        invocationId: accepted.invocationId,
        statusRevision: accepted.statusRevision,
        durableCursor: accepted.durableCursor,
        acceptedAt: this.#clock.now(),
      }));
    }

    const invocationId = link.invocationId!;
    const status = await operation.status(invocationId, signal);
    assertStatusIdentity(status, link);
    if (isTerminal(status.status)) {
      link = await this.#reconcileAssistantTerminalFacts({
        operation,
        status,
        link,
        sessionId: exact.sessionId,
        signal,
      });
      if (status.status === "completed") {
        throw new ModelStreamResumeUnavailableError(link.outputStartedAt !== undefined);
      }
      yield ModelStreamEventSchema.parse({ type: "started" });
      yield failedEvent(statusError(status));
      return;
    }
    if (link.outputStartedAt !== undefined) throw new ModelStreamResumeUnavailableError();

    const toolCallIds = new Set<string>();
    let started = false;
    let terminal = false;
    try {
      for await (const event of operation.events({
        invocationId,
        ...(link.durableCursor === undefined ? {} : { durableCursor: link.durableCursor }),
        signal,
      })) {
        if (signal.aborted) {
          await bestEffortCancel(operation, link, this.#ids.next(), signal);
          return;
        }
        assertEventIdentity(event, invocationId);
        if (event.eventClass === "ephemeral") {
          if (!started) {
            if (event.eventType !== "started") throw new Error("Model stream did not begin with started");
            started = true;
            link = await this.#recordProgress(link, {
              statusRevision: link.statusRevision ?? status.statusRevision,
              outputStartedAt: this.#clock.now(),
            });
            yield ModelStreamEventSchema.parse({ type: "started" });
            continue;
          }
          if (event.eventType === "started") throw new Error("Model stream emitted started more than once");
          if (event.eventType === "text_delta") {
            yield ModelStreamEventSchema.parse({ type: "text_delta", delta: event.delta });
            continue;
          }
          if (toolCallIds.has(event.call.toolCallId)) {
            throw new Error("Model stream repeated a Tool Call identity");
          }
          toolCallIds.add(event.call.toolCallId);
          yield ModelStreamEventSchema.parse({
            type: "tool_call",
            call: mapToolCall(exact, request, event.call),
          });
          continue;
        }

        if (event.eventType === "usage_recorded") {
          await this.#recordUsageProjection({
            invocationKind: "assistant_message",
            invocationLinkId: link.clientRequestId,
            sessionId: exact.sessionId,
            event,
          });
          const startsWithUsage = !started;
          link = await this.#recordProgress(link, {
            statusRevision: event.statusRevision ?? link.statusRevision ?? status.statusRevision,
            durableCursor: event.durableCursor,
            ...(startsWithUsage ? { outputStartedAt: this.#clock.now() } : {}),
          });
          if (startsWithUsage) {
            started = true;
            yield ModelStreamEventSchema.parse({ type: "started" });
          }
          yield ModelStreamEventSchema.parse({
            type: "usage",
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
          });
          continue;
        }
        link = await this.#recordProgress(link, {
          statusRevision: event.statusRevision ?? link.statusRevision ?? status.statusRevision,
          durableCursor: event.durableCursor,
        });
        if (!isTerminal(event.eventType)) continue;
        if (!started) {
          started = true;
          link = await this.#recordProgress(link, {
            statusRevision: event.statusRevision ?? link.statusRevision ?? status.statusRevision,
            durableCursor: event.durableCursor,
            outputStartedAt: this.#clock.now(),
          });
          yield ModelStreamEventSchema.parse({ type: "started" });
        }
        terminal = true;
        if (event.eventType === "completed") {
          yield ModelStreamEventSchema.parse({
            type: "completed",
            finishReason: toolCallIds.size === 0 ? "stop" : "tool_calls",
          });
        } else {
          yield failedEvent(statusError({
            ...status,
            status: event.eventType,
          }));
        }
        return;
      }
    } catch (error) {
      if (signal.aborted) {
        await bestEffortCancel(operation, link, this.#ids.next(), signal);
        return;
      }
      if (started) throw new ModelStreamResumeUnavailableError();
      throw error;
    }
    if (!terminal) throw new ModelStreamResumeUnavailableError(started);
  }

  public async messageCommitted(
    invocation: ModelProviderInvocation,
    committedAt: string,
  ): Promise<void> {
    if (invocation.purpose === "compaction_summary") {
      throw new Error("Compaction Summary cannot be committed as an Assistant Message");
    }
    const link = await this.#links.loadRound(
      invocation.taskId,
      invocation.runId,
      invocation.round,
    );
    if (link === undefined || link.assistantMessageId !== invocation.assistantMessageId) {
      throw new Error("Model invocation link is unavailable for Assistant Message commit");
    }
    if (link.messageCommittedAt !== undefined) return;
    requireWrite(await this.#links.recordMessageCommitted({
      clientRequestId: link.clientRequestId,
      expectedRecordDigest: link.recordDigest,
      messageCommittedAt: committedAt,
    }));
  }

  public async reconcileMessageCommitted(input: Readonly<{
    taskId: string;
    assistantMessageId: string;
    committedAt: string;
  }>): Promise<void> {
    const candidates = await this.#links.listIncomplete(1_024);
    const link = candidates.find((candidate) =>
      candidate.taskId === input.taskId
      && candidate.assistantMessageId === input.assistantMessageId);
    if (link === undefined) return;
    requireWrite(await this.#links.recordMessageCommitted({
      clientRequestId: link.clientRequestId,
      expectedRecordDigest: link.recordDigest,
      messageCommittedAt: input.committedAt,
    }));
  }

  public async loadDynamicRequestFacts(
    subject: DynamicRequestFactsSubject,
  ): Promise<DynamicRequestFactsV1 | undefined> {
    if (subject.invocationKind === "main") {
      const link = await this.#links.loadRound(subject.taskId, subject.runId, subject.round);
      if (link === undefined || !("schemaVersion" in link)) return undefined;
      return validateDynamicRequestFacts(link.dynamicRequestFacts, subject);
    }
    const link = await this.#compactionLinks?.loadByCompactionJobId(
      subject.compactionJobId,
    );
    if (link === undefined || !("schemaVersion" in link)) return undefined;
    return validateDynamicRequestFacts(link.dynamicRequestFacts, subject);
  }

  async #prepareLink(
    invocation: Extract<ModelProviderInvocation, { assistantMessageId: string }>,
    clientRequestId: string,
    centralAcceptRequestDigest: string,
    createdAt?: string,
  ): Promise<ModelInvocationLink> {
    return requireWrite(await this.#links.prepare({
      ...(invocation.dynamicContext === undefined
        ? {}
        : {
          schemaVersion: "v2" as const,
          dynamicRequestFacts: invocation.dynamicContext.facts,
          contextAssemblyReceiptDigest:
            invocation.dynamicContext.contextAssemblyReceiptDigest,
        }),
      providerRequestDeadlineAt: invocation.deadlineAt,
      taskId: invocation.taskId,
      runId: invocation.runId,
      stepId: invocation.stepId,
      actionId: invocation.actionId,
      round: invocation.round,
      runtimeSelectionDigest: invocation.runtimeSelection.selectionDigest,
      assistantMessageId: invocation.assistantMessageId,
      modelRequestId: invocation.modelRequest.requestId,
      modelRequestDigest: invocation.modelRequest.requestDigest,
      confirmationId: invocation.admission.confirmationId,
      scopeDigest: invocation.admission.scopeDigest,
      dataScopeDigest: invocation.dataScopeDigest,
      clientRequestId,
      centralAcceptRequestDigest: prefixed(centralAcceptRequestDigest),
      createdAt: createdAt ?? this.#clock.now(),
    }));
  }

  async *#streamCompactionSummary(
    request: ReadableModelRequest,
    signal: AbortSignal,
    invocation: Extract<ModelProviderInvocation, { purpose: "compaction_summary" }>,
  ): AsyncIterable<ModelStreamEvent> {
    const links = this.#compactionLinks;
    if (links === undefined) throw new Error("Compaction Model invocation persistence is unavailable");
    const clientRequestId = stableUuid(invocation.compactionJobId, "compaction-summary-client-request");
    const transportRequestId = this.#ids.next();
    const existingV3Link = request.schemaVersion === "v1alpha2"
      ? await links.loadByCompactionJobId(invocation.compactionJobId)
      : undefined;
    if (existingV3Link?.summaryCommittedAt !== undefined) {
      yield ModelStreamEventSchema.parse({ type: "started" });
      yield ModelStreamEventSchema.parse({ type: "completed", finishReason: "durable_replay" });
      return;
    }
    const reasoning = await this.#reasoningSidecar(request, invocation);
    const v3CreatedAt = existingV3Link?.createdAt ?? this.#clock.now();
    const v3CacheContext = request.schemaVersion === "v1alpha2"
      ? await this.#cacheContext({
        invocationKind: "compaction_summary",
        invocationLinkId: invocation.compactionJobId,
        sessionId: invocation.sessionId,
        createdAt: v3CreatedAt,
        accepted: existingV3Link?.invocationId !== undefined,
      })
      : undefined;
    const baseMaterial = this.#converter.convert({
      invocation,
      clientRequestId,
      transportRequestId,
      providerStreamIdleTimeoutMillis: this.#streamIdleTimeoutMillis,
      ...(reasoning === undefined ? {} : { reasoning }),
      ...(v3CacheContext === undefined ? {} : { cacheContext: v3CacheContext }),
    });
    let link = requireCompactionWrite(await links.prepare({
      ...(invocation.dynamicContext === undefined
        ? {}
        : {
          schemaVersion: "v2" as const,
          dynamicRequestFacts: invocation.dynamicContext.facts,
          contextAssemblyReceiptDigest:
            invocation.dynamicContext.contextAssemblyReceiptDigest,
        }),
      compactionJobId: invocation.compactionJobId,
      clientRequestId,
      modelRequestId: invocation.modelRequest.requestId,
      modelRequestDigest: invocation.modelRequest.requestDigest,
      executionBindingDigest: invocation.executionBindingDigest,
      confirmationId: invocation.admission.confirmationId,
      scopeDigest: invocation.admission.scopeDigest,
      dataScopeDigest: invocation.dataScopeDigest,
      createdAt: request.schemaVersion === "v1alpha2" ? v3CreatedAt : this.#clock.now(),
    }));
    if (link.summaryCommittedAt !== undefined) {
      yield ModelStreamEventSchema.parse({ type: "started" });
      yield ModelStreamEventSchema.parse({ type: "completed", finishReason: "durable_replay" });
      return;
    }
    const cacheContext = request.schemaVersion === "v1alpha2" ? v3CacheContext : await this.#cacheContext({
      invocationKind: "compaction_summary",
      invocationLinkId: link.compactionJobId,
      sessionId: invocation.sessionId,
      createdAt: link.createdAt,
      accepted: link.invocationId !== undefined,
    });
    const material = cacheContext === undefined
      ? baseMaterial
      : request.schemaVersion === "v1alpha2" ? baseMaterial : this.#converter.convert({
        invocation,
        clientRequestId,
        transportRequestId,
        providerStreamIdleTimeoutMillis: this.#streamIdleTimeoutMillis,
        cacheContext,
      });

    const operation = this.#gateway.begin(this.#identityScope, material.gatewayContractVersion);
    if (link.invocationId === undefined) {
      const accepted = await operation.accept(material.document, signal);
      if (accepted.clientRequestId !== clientRequestId || accepted.requestDigest !== material.requestDigest) {
        throw new Error("Compaction Model accept identity does not match the local durable link");
      }
      link = requireCompactionWrite(await links.recordAccepted({
        compactionJobId: invocation.compactionJobId,
        expectedRecordDigest: link.recordDigest,
        invocationId: accepted.invocationId,
        statusRevision: accepted.statusRevision,
        durableCursor: accepted.durableCursor,
        acceptedAt: this.#clock.now(),
      }));
    }

    const invocationId = link.invocationId!;
    const status = await operation.status(invocationId, signal);
    assertCompactionStatusIdentity(status, link, material.requestDigest);
    if (isTerminal(status.status)) {
      link = await this.#reconcileCompactionTerminalFacts({
        operation,
        status,
        links,
        link,
        sessionId: invocation.sessionId,
        signal,
      });
      if (status.status === "completed") {
        throw new ModelStreamResumeUnavailableError(link.outputStartedAt !== undefined);
      }
      yield ModelStreamEventSchema.parse({ type: "started" });
      yield failedEvent(statusError(status));
      return;
    }
    if (link.outputStartedAt !== undefined) throw new ModelStreamResumeUnavailableError();

    let started = false;
    let terminal = false;
    try {
      for await (const event of operation.events({
        invocationId,
        ...(link.durableCursor === undefined ? {} : { durableCursor: link.durableCursor }),
        signal,
      })) {
        if (signal.aborted) {
          await bestEffortCancelCompaction(operation, link, this.#ids.next(), signal);
          return;
        }
        assertEventIdentity(event, invocationId);
        if (event.eventClass === "ephemeral") {
          if (!started) {
            if (event.eventType !== "started") throw new Error("Model stream did not begin with started");
            started = true;
            link = await this.#recordCompactionProgress(links, link, {
              statusRevision: link.statusRevision ?? status.statusRevision,
              outputStartedAt: this.#clock.now(),
            });
            yield ModelStreamEventSchema.parse({ type: "started" });
            continue;
          }
          if (event.eventType === "started") throw new Error("Model stream emitted started more than once");
          if (event.eventType === "tool_call") {
            throw new Error("Compaction Summary Model request cannot emit Tool Calls");
          }
          yield ModelStreamEventSchema.parse({ type: "text_delta", delta: event.delta });
          continue;
        }
        if (event.eventType === "usage_recorded") {
          await this.#recordUsageProjection({
            invocationKind: "compaction_summary",
            invocationLinkId: link.compactionJobId,
            sessionId: invocation.sessionId,
            event,
          });
          const startsWithUsage = !started;
          link = await this.#recordCompactionProgress(links, link, {
            statusRevision: event.statusRevision ?? link.statusRevision ?? status.statusRevision,
            durableCursor: event.durableCursor,
            ...(startsWithUsage ? { outputStartedAt: this.#clock.now() } : {}),
          });
          if (startsWithUsage) {
            started = true;
            yield ModelStreamEventSchema.parse({ type: "started" });
          }
          yield ModelStreamEventSchema.parse({
            type: "usage",
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
          });
          continue;
        }
        link = await this.#recordCompactionProgress(links, link, {
          statusRevision: event.statusRevision ?? link.statusRevision ?? status.statusRevision,
          durableCursor: event.durableCursor,
        });
        if (!isTerminal(event.eventType)) continue;
        if (!started) {
          started = true;
          link = await this.#recordCompactionProgress(links, link, {
            statusRevision: event.statusRevision ?? link.statusRevision ?? status.statusRevision,
            durableCursor: event.durableCursor,
            outputStartedAt: this.#clock.now(),
          });
          yield ModelStreamEventSchema.parse({ type: "started" });
        }
        terminal = true;
        if (event.eventType === "completed") {
          yield ModelStreamEventSchema.parse({ type: "completed", finishReason: "stop" });
        } else {
          yield failedEvent(statusError({ ...status, status: event.eventType }));
        }
        return;
      }
    } catch (error) {
      if (signal.aborted) {
        await bestEffortCancelCompaction(operation, link, this.#ids.next(), signal);
        return;
      }
      if (started) throw new ModelStreamResumeUnavailableError();
      throw error;
    }
    if (!terminal) throw new ModelStreamResumeUnavailableError(started);
  }

  async #cacheContext(input: Readonly<{
    invocationKind: ModelInvocationKind;
    invocationLinkId: string;
    sessionId: string;
    createdAt: string;
    accepted: boolean;
  }>): Promise<ModelInvocationCacheContext | undefined> {
    if (this.#sessionScopes === undefined) return undefined;
    if (input.accepted) {
      return this.#sessionScopes.load(input.invocationKind, input.invocationLinkId);
    }
    return this.#sessionScopes.resolve({
      authority: "central_enterprise",
      sessionId: input.sessionId,
      invocationKind: input.invocationKind,
      invocationLinkId: input.invocationLinkId,
      createdAt: input.createdAt,
    });
  }

  async #reasoningSidecar(
    request: ReadableModelRequest,
    invocation: ModelProviderInvocation,
  ): Promise<EnterpriseReasoningSafeSidecar | undefined> {
    if (request.schemaVersion === "v1alpha1") return undefined;
    const installed = this.#reasoning;
    if (installed === undefined) throw new ReasoningProtocolUnavailableError();
    const mapping = await installed.mapper.map({
      invocation,
      providerFamily: installed.providerFamily,
      exactSubject: deriveEnterpriseReasoningProfileSubject({
        modelLock: invocation.modelLock,
        adapterDescriptorId: this.adapterDescriptorId,
        adapterDescriptorRevision: this.adapterDescriptorRevision,
      }),
      timeoutPolicyIdentity: installed.timeoutPolicyIdentity,
    });
    return projectEnterpriseReasoningSidecar({ request, invocation, mapping });
  }

  async #reconcileAssistantTerminalFacts(input: Readonly<{
    operation: ReturnType<EnterpriseModelGatewayClient["begin"]>;
    status: EnterpriseModelStatus;
    link: ModelInvocationLink;
    sessionId: string;
    signal: AbortSignal;
  }>): Promise<ModelInvocationLink> {
    let link = input.link;
    if (link.durableCursor === input.status.durableCursor) return link;
    for await (const event of input.operation.events({
      invocationId: input.status.invocationId,
      ...(link.durableCursor === undefined ? {} : { durableCursor: link.durableCursor }),
      signal: input.signal,
    })) {
      if (input.signal.aborted) throw new Error("Enterprise Model durable reconciliation was cancelled");
      assertEventIdentity(event, input.status.invocationId);
      if (event.eventClass === "ephemeral") continue;
      if (event.eventType === "usage_recorded") {
        await this.#recordUsageProjection({
          invocationKind: "assistant_message",
          invocationLinkId: link.clientRequestId,
          sessionId: input.sessionId,
          event,
        });
      }
      link = await this.#recordProgress(link, {
        statusRevision: event.statusRevision ?? link.statusRevision ?? input.status.statusRevision,
        durableCursor: event.durableCursor,
      });
      if (event.durableCursor === input.status.durableCursor) break;
    }
    if (link.durableCursor !== input.status.durableCursor) {
      throw new Error("Enterprise Model durable reconciliation did not reach the terminal cursor");
    }
    return link;
  }

  async #reconcileCompactionTerminalFacts(input: Readonly<{
    operation: ReturnType<EnterpriseModelGatewayClient["begin"]>;
    status: EnterpriseModelStatus;
    links: CompactionModelInvocationLinkPersistence;
    link: CompactionModelInvocationLink;
    sessionId: string;
    signal: AbortSignal;
  }>): Promise<CompactionModelInvocationLink> {
    let link = input.link;
    if (link.durableCursor === input.status.durableCursor) return link;
    for await (const event of input.operation.events({
      invocationId: input.status.invocationId,
      ...(link.durableCursor === undefined ? {} : { durableCursor: link.durableCursor }),
      signal: input.signal,
    })) {
      if (input.signal.aborted) throw new Error("Compaction Model durable reconciliation was cancelled");
      assertEventIdentity(event, input.status.invocationId);
      if (event.eventClass === "ephemeral") continue;
      if (event.eventType === "usage_recorded") {
        await this.#recordUsageProjection({
          invocationKind: "compaction_summary",
          invocationLinkId: link.compactionJobId,
          sessionId: input.sessionId,
          event,
        });
      }
      link = await this.#recordCompactionProgress(input.links, link, {
        statusRevision: event.statusRevision ?? link.statusRevision ?? input.status.statusRevision,
        durableCursor: event.durableCursor,
      });
      if (event.durableCursor === input.status.durableCursor) break;
    }
    if (link.durableCursor !== input.status.durableCursor) {
      throw new Error("Compaction Model durable reconciliation did not reach the terminal cursor");
    }
    return link;
  }

  async #recordCompactionProgress(
    links: CompactionModelInvocationLinkPersistence,
    link: CompactionModelInvocationLink,
    input: Readonly<{ statusRevision: number; durableCursor?: string; outputStartedAt?: string }>,
  ): Promise<CompactionModelInvocationLink> {
    return requireCompactionWrite(await links.recordStreamProgress({
      compactionJobId: link.compactionJobId,
      expectedRecordDigest: link.recordDigest,
      statusRevision: input.statusRevision,
      ...(input.durableCursor === undefined ? {} : { durableCursor: input.durableCursor }),
      ...(input.outputStartedAt === undefined ? {} : { outputStartedAt: input.outputStartedAt }),
      updatedAt: this.#clock.now(),
    }));
  }

  async #recordProgress(
    link: ModelInvocationLink,
    input: Readonly<{
      statusRevision: number;
      durableCursor?: string;
      outputStartedAt?: string;
    }>,
  ): Promise<ModelInvocationLink> {
    return requireWrite(await this.#links.recordStreamProgress({
      clientRequestId: link.clientRequestId,
      expectedRecordDigest: link.recordDigest,
      statusRevision: input.statusRevision,
      ...(input.durableCursor === undefined ? {} : { durableCursor: input.durableCursor }),
      ...(input.outputStartedAt === undefined ? {} : { outputStartedAt: input.outputStartedAt }),
      updatedAt: this.#clock.now(),
    }));
  }

  async #recordUsageProjection(input: Readonly<{
    invocationKind: "assistant_message" | "compaction_summary";
    invocationLinkId: string;
    sessionId: string;
    event: EnterpriseModelEvent;
  }>): Promise<void> {
    if (this.#usageProjections === undefined) return;
    if (
      input.event.eventClass !== "durable"
      || input.event.eventType !== "usage_recorded"
      || input.event.inputTokens === undefined
      || input.event.outputTokens === undefined
    ) throw new Error("Enterprise Usage event is incomplete");
    const result = await this.#usageProjections.record({
      invocationKind: input.invocationKind,
      invocationLinkId: input.invocationLinkId,
      sessionId: input.sessionId,
      usageAuthority: "central_enterprise",
      authorityInvocationId: input.event.invocationId,
      usageEventId: input.event.eventId,
      usageEventDigest: input.event.eventDigest,
      inputTokens: input.event.inputTokens,
      outputTokens: input.event.outputTokens,
      usageRecordedAt: input.event.occurredAt,
    });
    if (!result.ok) throw new Error(result.error.code);
  }
}

function requireInvocation(
  request: ReadableModelRequest,
  invocation: ModelProviderInvocation | undefined,
  provider: DurableEnterpriseModelProvider,
): ModelProviderInvocation {
  const parsed = parseReadableModelRequest(request);
  if (
    invocation === undefined
    || invocation.modelRequest.requestDigest !== parsed.requestDigest
    || invocation.modelRequest.requestId !== parsed.requestId
    || invocation.modelLock.adapterDescriptorSnapshot.adapterDescriptorId
      !== provider.adapterDescriptorId
    || invocation.modelLock.adapterDescriptorSnapshot.revision
      !== provider.adapterDescriptorRevision
  ) throw new Error("Enterprise Model Provider requires the exact locked invocation context");
  return invocation;
}

function mapToolCall(
  invocation: ModelProviderInvocation,
  request: ReadableModelRequest,
  call: Readonly<{
    toolCallId: string;
    name: string;
    arguments: JsonObject;
    argumentsDigest: string;
  }>,
): AssistantToolCall {
  const matches = request.tools.filter((candidate) =>
    candidate.name === call.name
    || projectEnterpriseProviderToolName(candidate.capabilityId) === call.name);
  if (matches.length > 1) {
    throw new Error("Model returned an ambiguous Tool Call name");
  }
  const tool = matches[0];
  if (tool === undefined) throw new Error("Model returned a Tool Call outside the locked request");
  const digest = sha256CanonicalJson(JsonValueSchema.parse(call.arguments));
  if (prefixed(call.argumentsDigest) !== digest) {
    throw new Error("Model Tool Call arguments digest does not match its content");
  }
  return {
    toolCallId: call.toolCallId,
    taskId: invocation.taskId,
    actionId: stableUuid(
      `${invocation.actionId}:${call.toolCallId}`,
      "model-tool-action",
    ),
    capabilityId: tool.capabilityId,
    arguments: call.arguments,
  };
}

function assertStatusIdentity(
  status: EnterpriseModelStatus,
  link: ModelInvocationLink,
): void {
  if (
    status.invocationId !== link.invocationId
    || status.clientRequestId !== link.clientRequestId
    || prefixed(status.requestDigest) !== link.centralAcceptRequestDigest
  ) throw new Error("Enterprise Model status identity does not match the local durable link");
}

function assertCompactionStatusIdentity(
  status: EnterpriseModelStatus,
  link: CompactionModelInvocationLink,
  centralRequestDigest: string,
): void {
  if (
    status.invocationId !== link.invocationId
    || status.clientRequestId !== link.clientRequestId
    || status.requestDigest !== centralRequestDigest
  ) throw new Error("Enterprise Model status identity does not match the Compaction durable link");
}

function assertEventIdentity(event: EnterpriseModelEvent, invocationId: string): void {
  if (event.invocationId !== invocationId) {
    throw new Error("Enterprise Model event belongs to another invocation");
  }
}

function statusError(status: Pick<EnterpriseModelStatus, "status" | "safeErrorCode" | "safeSummary">): RuntimeError {
  const category: RuntimeError["category"] = status.status === "timed_out"
    ? "timeout"
    : status.status === "cancelled" ? "cancelled" : "provider";
  return {
    code: status.safeErrorCode ?? `model_gateway.${status.status}`,
    category,
    message: status.safeSummary ?? `Enterprise Model invocation ended as ${status.status}`,
    retryable: status.status === "uncertain",
  };
}

function failedEvent(error: RuntimeError): ModelStreamEvent {
  return ModelStreamEventSchema.parse({ type: "failed", error });
}

function isTerminal(status: string): status is "completed" | "failed" | "cancelled" | "timed_out" | "uncertain" {
  return ["completed", "failed", "cancelled", "timed_out", "uncertain"].includes(status);
}

async function bestEffortCancel(
  operation: ReturnType<EnterpriseModelGatewayClient["begin"]>,
  link: ModelInvocationLink,
  requestId: string,
  signal: AbortSignal,
): Promise<void> {
  if (link.invocationId === undefined || link.statusRevision === undefined) return;
  try {
    const detached = new AbortController();
    await operation.cancel({
      invocationId: link.invocationId,
      requestId,
      expectedStatusRevision: link.statusRevision,
      reason: "task_cancelled",
      signal: signal.aborted ? detached.signal : signal,
    });
  } catch {
    // Transport cancellation cannot invent or rewrite a durable terminal fact.
  }
}

async function bestEffortCancelCompaction(
  operation: ReturnType<EnterpriseModelGatewayClient["begin"]>,
  link: CompactionModelInvocationLink,
  requestId: string,
  signal: AbortSignal,
): Promise<void> {
  if (link.invocationId === undefined || link.statusRevision === undefined) return;
  try {
    const detached = new AbortController();
    await operation.cancel({
      invocationId: link.invocationId,
      requestId,
      expectedStatusRevision: link.statusRevision,
      reason: "task_cancelled",
      signal: signal.aborted ? detached.signal : signal,
    });
  } catch {
    // Cancellation transport cannot rewrite Compaction durable facts.
  }
}

function requireWrite(result: ModelInvocationLinkWriteResult): ModelInvocationLink {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

function requireCompactionWrite(
  result: CompactionModelInvocationLinkWriteResult,
): CompactionModelInvocationLink {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

function prefixed(digest: string): string {
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error("Expected a SHA-256 hex digest");
  return `sha256:${digest}`;
}

function stableUuid(identity: string, label: string): string {
  const bytes = createHash("sha256")
    .update(`${identity}:${label}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
