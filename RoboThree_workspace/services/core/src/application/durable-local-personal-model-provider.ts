import { createHash } from "node:crypto";

import {
  JsonValueSchema,
  ModelStreamEventSchema,
  type ModelRequest,
  type ModelStreamEvent,
  type RuntimeError,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import type { ReadableModelRequest } from "@robothree/contracts/model-protocol/v1alpha2";

import {
  type LocalPersonalModelStreamTransport,
  type LocalPersonalModelProviderError,
} from "../adapters/https/local-personal-openai-compatible-model-provider.js";
import type { Clock } from "../ports/clock.js";
import type {
  LocalPersonalModelInvocationPersistence,
} from "../ports/local-personal-model-invocation-persistence.js";
import type { ModelProvider } from "../ports/model-provider.js";
import type { ModelProviderInvocation } from "../ports/model-provider-invocation.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";
import { providerAttemptKey } from "../ports/provider-usage.js";
import { withUsageProjectionDigest } from
  "../ports/provider-usage-projection-persistence.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  createLocalPersonalModelInvocationLink,
  type LocalPersonalModelInvocationLink,
} from "./local-personal-model-invocation.js";
import {
  createLocalPersonalInvocationTimeoutFact,
  validateLocalPersonalInvocationTimeoutFact,
  validateModelInvocationTimeoutMaterial,
  type LocalPersonalInvocationTimeoutFact,
  type ModelInvocationTimeoutPolicy,
} from "./model-invocation-timeout-policy.js";
import { createLocalPersonalOpenAiUsageFact } from "./local-personal-provider-usage.js";
import {
  createPersonalModelStatusFact,
  type PersonalModelDefinition,
  type PersonalModelOwnerIdentity,
} from "./personal-model-domain.js";
import { mapPersonalModelProviderObservation } from "./personal-model-provider-status.js";
import { createPersonalModelCommandReceipt } from "../ports/personal-model-persistence.js";
import { ModelStreamResumeUnavailableError } from "./durable-enterprise-model-provider.js";
import { requireLegacyModelRequestForUnmappedProvider } from "./model-reasoning-protocol.js";
import {
  validateDynamicRequestFacts,
  type DynamicRequestFactsSubject,
  type DynamicRequestFactsV1,
} from "./dynamic-request-facts.js";

export type LocalPersonalInvocationFaultPoint =
  | "local_personal.accepted_committed"
  | "local_personal.dispatch_claimed"
  | "local_personal.provider_event_before_output_started"
  | "local_personal.output_started_committed"
  | "local_personal.terminal_before_commit"
  | "local_personal.terminal_committed";

type TerminalKind = "success" | LocalPersonalModelProviderError["kind"];

/**
 * Durable application wrapper around the raw local HTTPS/SSE provider.
 * Stream content stays ephemeral; migration 24 stores only identities,
 * terminal/Usage/status facts and fencing evidence.
 */
export class DurableLocalPersonalModelProvider implements ModelProvider {
  public readonly adapterKind = "model_provider" as const;
  public readonly adapterDescriptorId: string;
  public readonly adapterDescriptorRevision: string;

  readonly #raw: LocalPersonalModelStreamTransport;
  readonly #invocations: LocalPersonalModelInvocationPersistence;
  readonly #personal: PersonalModelPersistence;
  readonly #ownerIdentity: PersonalModelOwnerIdentity;
  readonly #definition: PersonalModelDefinition;
  readonly #clock: Clock;
  readonly #timeoutPolicy: ModelInvocationTimeoutPolicy;
  readonly #faultInjector: ((point: LocalPersonalInvocationFaultPoint) => void) | undefined;

  public constructor(input: Readonly<{
    raw: LocalPersonalModelStreamTransport;
    invocations: LocalPersonalModelInvocationPersistence;
    personal: PersonalModelPersistence;
    ownerIdentity: PersonalModelOwnerIdentity;
    definition: PersonalModelDefinition;
    clock: Clock;
    timeoutPolicy: ModelInvocationTimeoutPolicy;
    faultInjector?: (point: LocalPersonalInvocationFaultPoint) => void;
  }>) {
    this.#raw = input.raw;
    this.adapterDescriptorId = input.raw.adapterDescriptorId;
    this.adapterDescriptorRevision = input.raw.adapterDescriptorRevision;
    this.#invocations = input.invocations;
    this.#personal = input.personal;
    this.#ownerIdentity = Object.freeze({ ...input.ownerIdentity });
    this.#definition = input.definition;
    this.#clock = input.clock;
    this.#timeoutPolicy = input.timeoutPolicy;
    this.#faultInjector = input.faultInjector;
  }

  public async *stream(
    candidate: ReadableModelRequest,
    signal: AbortSignal,
    invocation?: ModelProviderInvocation,
  ): AsyncIterable<ModelStreamEvent> {
    // DFI-5.3 owns real reasoning parameter mapping. Reject v1alpha2 before
    // durable invocation preparation, credential resolution or any upstream I/O.
    const request = requireLegacyModelRequestForUnmappedProvider(candidate);
    const exact = requireInvocation(request, invocation, this);
    const identity = invocationIdentity(exact);
    const loaded = await this.#loadOrPrepare(exact, identity);
    let link = loaded.link;
    if (link.status === "terminal") {
      if (link.terminalClass === "completed") throw new ModelStreamResumeUnavailableError();
      yield ModelStreamEventSchema.parse({ type: "started" });
      yield failedEvent(link.typedErrorCode ?? "personal_model.provider_failed", link.terminalClass);
      return;
    }
    if (link.status === "recovery_exhausted") throw new ModelStreamResumeUnavailableError();
    if (loaded.timeoutFact === undefined) {
      await this.#exhaust(link, "local_personal.timeout_fact_legacy_missing");
      throw new ModelStreamResumeUnavailableError();
    }
    if (link.outputStartedAt !== undefined || link.status === "output_started") {
      await this.#exhaust(link);
      throw new ModelStreamResumeUnavailableError();
    }

    const nextEpoch = link.status === "dispatching" ? link.fencingEpoch + 1 : link.fencingEpoch;
    link = requireWrite(await this.#invocations.advanceInvocation({
      expectedRecordDigest: link.recordDigest,
      next: createLocalPersonalModelInvocationLink({
        ...withoutDigest(link),
        status: "dispatching",
        fencingEpoch: nextEpoch,
        updatedAt: this.#clock.now(),
      }),
    }));
    this.#faultInjector?.("local_personal.dispatch_claimed");
    const attemptKey = providerAttemptKey(
      "local_personal",
      link.authorityInvocationId,
      link.fencingEpoch,
    );
    await this.#invocations.registerAttempt({
      authorityInvocationId: link.authorityInvocationId,
      fencingEpoch: link.fencingEpoch,
      providerAttemptKey: attemptKey,
    });

    let rawUsage: unknown;
    let observedTerminal: TerminalKind | undefined;
    const effectiveInvocation: ModelProviderInvocation = {
      ...exact,
      deadlineAt: loaded.timeoutFact.invocationDeadlineAt,
      timeout: timeoutMaterialFromFact(loaded.timeoutFact),
    };
    const iterator = this.#raw.streamWithTelemetry(
      request,
      signal,
      effectiveInvocation,
      {
        onUsage: (value) => { rawUsage = structuredClone(value); },
        onTerminal: (kind) => { observedTerminal = kind; },
      },
    )[Symbol.asyncIterator]();
    try {
      const started = await iterator.next();
      if (started.done || started.value.type !== "started") {
        throw new Error("Local Personal raw Provider did not begin with started");
      }
      const first = await iterator.next();
      this.#faultInjector?.("local_personal.provider_event_before_output_started");
      link = requireWrite(await this.#invocations.advanceInvocation({
        expectedRecordDigest: link.recordDigest,
        next: createLocalPersonalModelInvocationLink({
          ...withoutDigest(link),
          status: "output_started",
          outputStartedAt: this.#clock.now(),
          updatedAt: this.#clock.now(),
        }),
      }));
      this.#faultInjector?.("local_personal.output_started_committed");
      yield ModelStreamEventSchema.parse({ type: "started" });

      let current = first;
      while (!current.done) {
        const event = current.value;
        if (event.type === "completed" || event.type === "failed") {
          const terminalKind = signal.aborted
            ? "cancelled"
            : observedTerminal ?? terminalKindFromEvent(event);
          this.#faultInjector?.("local_personal.terminal_before_commit");
          link = await this.#commitTerminal({
            link,
            event,
            terminalKind,
            rawUsage,
          });
          this.#faultInjector?.("local_personal.terminal_committed");
          yield event;
          return;
        }
        yield event;
        current = await iterator.next();
      }
      await this.#exhaust(link);
      throw new ModelStreamResumeUnavailableError();
    } catch (error) {
      const current = await this.#invocations.loadInvocation({
        invocationKind: link.invocationKind,
        invocationLinkId: link.invocationLinkId,
      });
      if (current?.status === "terminal") throw error;
      if (current?.outputStartedAt !== undefined || current?.status === "output_started") {
        await this.#exhaust(current);
        throw new ModelStreamResumeUnavailableError();
      }
      throw error;
    } finally {
      rawUsage = undefined;
      await iterator.return?.();
    }
  }

  public async messageCommitted(invocation: ModelProviderInvocation): Promise<void> {
    if (invocation.purpose === "compaction_summary") {
      throw new Error("Compaction Summary cannot be committed as an Assistant Message");
    }
    const link = await this.#invocations.loadInvocation({
      invocationKind: "assistant_message",
      invocationLinkId: invocationIdentity(invocation).invocationLinkId,
    });
    if (link?.status !== "terminal" || link.terminalClass !== "completed") {
      throw new Error("Local Personal invocation terminal is unavailable for Message commit");
    }
  }

  public async loadDynamicRequestFacts(
    subject: DynamicRequestFactsSubject,
  ): Promise<DynamicRequestFactsV1 | undefined> {
    const invocationKind = subject.invocationKind === "main"
      ? "assistant_message" as const
      : "compaction_summary" as const;
    const invocationLinkId = subject.invocationKind === "main"
      ? stableUuid(
        `${subject.taskId}:${subject.runId}:${subject.round}`,
        "local-personal-main-link",
      )
      : subject.compactionJobId;
    const link = await this.#invocations.loadInvocation({
      invocationKind,
      invocationLinkId,
    });
    if (link === undefined || link.schemaVersion === "v1alpha1") return undefined;
    return validateDynamicRequestFacts(link.dynamicRequestFacts, subject);
  }

  async #loadOrPrepare(
    invocation: ModelProviderInvocation,
    identity: ReturnType<typeof invocationIdentity>,
  ): Promise<Readonly<{
    link: LocalPersonalModelInvocationLink;
    timeoutFact?: LocalPersonalInvocationTimeoutFact;
  }>> {
    const existing = await this.#invocations.loadInvocation({
      invocationKind: identity.invocationKind,
      invocationLinkId: identity.invocationLinkId,
    });
    if (existing !== undefined) {
      assertExistingIdentity(existing, invocation, this.#ownerIdentity, this.#definition);
      const timeoutFact = await this.#invocations.loadInvocationTimeoutFact(
        existing.authorityInvocationId,
      );
      if (timeoutFact === undefined) return { link: existing };
      return {
        link: existing,
        timeoutFact: validateLocalPersonalInvocationTimeoutFact(timeoutFact, this.#timeoutPolicy),
      };
    }
    if (invocation.timeout === undefined) {
      throw new Error("local_personal.timeout_fact_drift");
    }
    const timeout = validateModelInvocationTimeoutMaterial(
      invocation.timeout,
      this.#timeoutPolicy,
    );
    if (invocation.deadlineAt !== timeout.invocationDeadlineAt) {
      throw new Error("local_personal.timeout_fact_drift");
    }
    const at = this.#clock.now();
    const link = createLocalPersonalModelInvocationLink({
      ...(invocation.dynamicContext === undefined
        ? { schemaVersion: "v1alpha1" as const }
        : {
          schemaVersion: "v1alpha2" as const,
          dynamicRequestFacts: invocation.dynamicContext.facts,
          contextAssemblyReceiptDigest:
            invocation.dynamicContext.contextAssemblyReceiptDigest,
        }),
      invocationKind: identity.invocationKind,
      invocationLinkId: identity.invocationLinkId,
      authorityInvocationId: identity.authorityInvocationId,
      sessionId: invocation.sessionId,
      taskId: invocation.taskId,
      runId: invocation.runId,
      round: invocation.round,
      taskRuntimeSelectionId: invocation.runtimeSelection.runtimeSelectionId,
      taskRuntimeSelectionDigest: invocation.runtimeSelection.selectionDigest,
      modelLockId: invocation.modelLock.lockId,
      modelLockDigest: lockDigest(invocation.modelLock),
      ownerScopeNamespaceRevision: this.#ownerIdentity.ownerScopeNamespaceRevision,
      ownerScopeDigest: this.#ownerIdentity.ownerScopeDigest,
      personalModelId: this.#definition.personalModelId,
      configurationRevision: this.#definition.configurationRevision,
      executionDefinitionDigest: this.#definition.executionDefinitionDigest,
      providerProfileRevision: this.#definition.providerProfileRevision,
      endpointIdentityDigest: this.#definition.endpointIdentityDigest,
      credentialBindingDigest: this.#definition.credentialBindingDigest,
      modelRequestDigest: invocation.modelRequest.requestDigest,
      admissionScopeDigest: invocation.admission.scopeDigest,
      status: "accepted",
      fencingEpoch: 1,
      createdAt: at,
      updatedAt: at,
    });
    const timeoutFact = createLocalPersonalInvocationTimeoutFact({
      authorityInvocationId: identity.authorityInvocationId,
      timeout,
      policy: this.#timeoutPolicy,
    });
    const prepared = requireWrite(await this.#invocations.prepareInvocation({
      link,
      timeoutFact,
    }));
    this.#faultInjector?.("local_personal.accepted_committed");
    return { link: prepared, timeoutFact };
  }

  async #commitTerminal(input: Readonly<{
    link: LocalPersonalModelInvocationLink;
    event: Extract<ModelStreamEvent, { type: "completed" | "failed" }>;
    terminalKind: TerminalKind;
    rawUsage?: unknown;
  }>): Promise<LocalPersonalModelInvocationLink> {
    const at = this.#clock.now();
    const terminalClass = input.event.type === "completed"
      ? "completed" as const
      : input.terminalKind === "cancelled"
        ? "cancelled" as const
        : input.terminalKind === "deadline"
          ? "timed_out" as const
          : "failed" as const;
    const terminal = createLocalPersonalModelInvocationLink({
      ...withoutDigest(input.link),
      status: "terminal",
      terminalAt: at,
      terminalClass,
      ...(input.event.type === "failed" ? { typedErrorCode: input.event.error.code } : {}),
      updatedAt: at,
    });
    const usageFact = createLocalPersonalOpenAiUsageFact({
      usageFactId: stableUuid(input.link.authorityInvocationId, "local-personal-usage-fact"),
      authorityInvocationId: input.link.authorityInvocationId,
      fencingEpoch: input.link.fencingEpoch,
      ...(input.rawUsage === undefined ? {} : { rawUsage: input.rawUsage }),
      attemptDisposition: "terminal_winner",
      recordedAt: at,
    });
    const usageProjection = usageFact === undefined
      ? undefined
      : withUsageProjectionDigest({
        invocationKind: input.link.invocationKind,
        invocationLinkId: input.link.invocationLinkId,
        sessionId: input.link.sessionId,
        usageAuthority: "local_personal",
        authorityInvocationId: input.link.authorityInvocationId,
        usageEventId: stableUuid(input.link.authorityInvocationId, "local-personal-usage-event"),
        usageEventDigest: usageFact.usageDigest,
        inputTokens: usageFact.providerInputTokens,
        outputTokens: usageFact.providerOutputTokens,
        usageRecordedAt: at,
      });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const statusObservation = await this.#statusObservation(input.link, input.terminalKind, at);
      const result = await this.#invocations.commitTerminalOutcome({
        expectedRecordDigest: input.link.recordDigest,
        terminal,
        ...(usageFact === undefined ? {} : { usageFact, usageProjection: usageProjection! }),
        ...(statusObservation === undefined ? {} : { statusObservation }),
      });
      if (result.ok) return result.value;
      const current = await this.#invocations.loadInvocation({
        invocationKind: input.link.invocationKind,
        invocationLinkId: input.link.invocationLinkId,
      });
      if (current?.status === "terminal") return current;
      if (current?.fencingEpoch !== input.link.fencingEpoch) {
        throw new Error("local_personal_invocation.stale_fencing");
      }
      if (attempt === 1) throw new Error(result.error.code);
    }
    throw new Error("local_personal_invocation.conflict");
  }

  async #statusObservation(
    link: LocalPersonalModelInvocationLink,
    terminalKind: TerminalKind,
    at: string,
  ) {
    const mapped = mapPersonalModelProviderObservation(terminalKind);
    if (mapped === undefined) return undefined;
    const current = await this.#personal.loadStatus(
      this.#ownerIdentity,
      this.#definition.personalModelId,
      this.#definition.configurationRevision,
    );
    if (current === undefined
      || current.executionDefinitionDigest !== this.#definition.executionDefinitionDigest) {
      throw new Error("personal_model.status_unavailable");
    }
    const commandId = stableUuid(link.authorityInvocationId, "local-personal-status-observation");
    const requestDigest = sha256CanonicalJson(JsonValueSchema.parse({
      domain: "robothree.local-personal-model.status-observation.v1",
      authorityInvocationId: link.authorityInvocationId,
      terminalKind,
      configurationRevision: this.#definition.configurationRevision,
      executionDefinitionDigest: this.#definition.executionDefinitionDigest,
    }));
    const status = createPersonalModelStatusFact({
      ownerScopeNamespaceRevision: this.#ownerIdentity.ownerScopeNamespaceRevision,
      ownerScopeDigest: this.#ownerIdentity.ownerScopeDigest,
      personalModelId: this.#definition.personalModelId,
      configurationRevision: this.#definition.configurationRevision,
      executionDefinitionDigest: this.#definition.executionDefinitionDigest,
      statusRevision: current.statusRevision + 1,
      status: mapped.status,
      detailCode: mapped.detailCode,
      ...(mapped.detailDigest === undefined ? {} : { detailDigest: mapped.detailDigest }),
      statusOrigin: "provider_observation",
      updatedAt: at,
    });
    return Object.freeze({
      status,
      expectedStatusRevision: current.statusRevision,
      receipt: createPersonalModelCommandReceipt({
        ownerScopeNamespaceRevision: this.#ownerIdentity.ownerScopeNamespaceRevision,
        ownerScopeDigest: this.#ownerIdentity.ownerScopeDigest,
        commandId,
        commandType: "status",
        requestDigest,
        modelId: this.#definition.personalModelId,
        committedConfigurationRevision: this.#definition.configurationRevision,
        outcome: "status_committed",
        committedAt: at,
      }),
    });
  }

  async #exhaust(
    link: LocalPersonalModelInvocationLink,
    typedErrorCode = "model_stream_resume_unavailable",
  ): Promise<void> {
    if (link.status === "recovery_exhausted") return;
    const at = this.#clock.now();
    const result = await this.#invocations.advanceInvocation({
      expectedRecordDigest: link.recordDigest,
      next: createLocalPersonalModelInvocationLink({
        ...withoutDigest(link),
        status: "recovery_exhausted",
        terminalAt: at,
        typedErrorCode,
        updatedAt: at,
      }),
    });
    if (!result.ok) {
      const current = await this.#invocations.loadInvocation({
        invocationKind: link.invocationKind,
        invocationLinkId: link.invocationLinkId,
      });
      if (current?.status !== "recovery_exhausted" && current?.status !== "terminal") {
        throw new Error(result.error.code);
      }
    }
  }
}

function requireInvocation(
  request: ModelRequest,
  invocation: ModelProviderInvocation | undefined,
  provider: DurableLocalPersonalModelProvider,
): ModelProviderInvocation {
  if (invocation === undefined
    || invocation.modelRequest.requestId !== request.requestId
    || invocation.modelRequest.requestDigest !== request.requestDigest
    || invocation.modelLock.adapterDescriptorSnapshot.adapterDescriptorId
      !== provider.adapterDescriptorId
    || invocation.modelLock.adapterDescriptorSnapshot.revision
      !== provider.adapterDescriptorRevision) {
    throw new Error("Local Personal Provider requires the exact locked invocation context");
  }
  return invocation;
}

function invocationIdentity(invocation: ModelProviderInvocation): Readonly<{
  invocationKind: "assistant_message" | "compaction_summary";
  invocationLinkId: string;
  authorityInvocationId: string;
}> {
  const invocationKind = invocation.purpose === "compaction_summary"
    ? "compaction_summary" as const
    : "assistant_message" as const;
  const invocationLinkId = "compactionJobId" in invocation
    ? invocation.compactionJobId
    : stableUuid(`${invocation.taskId}:${invocation.runId}:${invocation.round}`, "local-personal-main-link");
  return Object.freeze({
    invocationKind,
    invocationLinkId,
    authorityInvocationId: stableUuid(JSON.stringify({
      invocationKind,
      invocationLinkId,
      modelLockDigest: lockDigest(invocation.modelLock),
      modelRequestDigest: invocation.modelRequest.requestDigest,
      admissionScopeDigest: invocation.admission.scopeDigest,
    }), "local-personal-authority-invocation"),
  });
}

function assertExistingIdentity(
  link: LocalPersonalModelInvocationLink,
  invocation: ModelProviderInvocation,
  owner: PersonalModelOwnerIdentity,
  definition: PersonalModelDefinition,
): void {
  const identity = invocationIdentity(invocation);
  if (link.invocationKind !== identity.invocationKind
    || link.invocationLinkId !== identity.invocationLinkId
    || link.authorityInvocationId !== identity.authorityInvocationId
    || link.sessionId !== invocation.sessionId
    || link.taskId !== invocation.taskId
    || link.runId !== invocation.runId
    || link.round !== invocation.round
    || link.taskRuntimeSelectionId !== invocation.runtimeSelection.runtimeSelectionId
    || link.taskRuntimeSelectionDigest !== invocation.runtimeSelection.selectionDigest
    || link.modelLockId !== invocation.modelLock.lockId
    || link.modelLockDigest !== lockDigest(invocation.modelLock)
    || link.ownerScopeNamespaceRevision !== owner.ownerScopeNamespaceRevision
    || link.ownerScopeDigest !== owner.ownerScopeDigest
    || link.personalModelId !== definition.personalModelId
    || link.configurationRevision !== definition.configurationRevision
    || link.executionDefinitionDigest !== definition.executionDefinitionDigest
    || link.modelRequestDigest !== invocation.modelRequest.requestDigest
    || link.admissionScopeDigest !== invocation.admission.scopeDigest
    || ((link.schemaVersion === "v1alpha2") !== (invocation.dynamicContext !== undefined))
    || (link.schemaVersion === "v1alpha2"
      && invocation.dynamicContext !== undefined
      && (
        link.contextAssemblyReceiptDigest
          !== invocation.dynamicContext.contextAssemblyReceiptDigest
        || link.dynamicRequestFacts.factsDigest
          !== invocation.dynamicContext.facts.factsDigest
        || sha256CanonicalJson(JsonValueSchema.parse(link.dynamicRequestFacts))
          !== sha256CanonicalJson(JsonValueSchema.parse(invocation.dynamicContext.facts))
      ))) {
    throw new Error("local_personal_invocation.conflict");
  }
}

function terminalKindFromEvent(
  event: Extract<ModelStreamEvent, { type: "completed" | "failed" }>,
): TerminalKind {
  if (event.type === "completed") return "success";
  if (event.error.category === "authentication") return "authentication";
  if (event.error.category === "authorization") return "permission_denied";
  if (event.error.category === "timeout") return "deadline";
  if (event.error.category === "cancelled") return "cancelled";
  if (event.error.category === "validation") return "protocol";
  return "provider_transient";
}

function failedEvent(
  code: string,
  terminalClass: LocalPersonalModelInvocationLink["terminalClass"],
): Extract<ModelStreamEvent, { type: "failed" }> {
  const error: RuntimeError = {
    code,
    category: terminalClass === "cancelled" ? "cancelled"
      : terminalClass === "timed_out" ? "timeout"
        : "provider",
    message: "The local Personal Model invocation did not complete successfully",
    retryable: false,
  };
  ModelStreamEventSchema.parse({ type: "failed", error });
  return { type: "failed", error };
}

function timeoutMaterialFromFact(
  fact: LocalPersonalInvocationTimeoutFact,
): NonNullable<ModelProviderInvocation["timeout"]> {
  return {
    timeoutPolicyRevision: fact.timeoutPolicyRevision,
    timeoutPolicyDigest: fact.timeoutPolicyDigest,
    selectedOverallTimeoutMs: fact.selectedOverallTimeoutMs,
    effectiveDeadlineSource: fact.effectiveDeadlineSource,
    ...(fact.outerDeadlineAt === undefined ? {} : { outerDeadlineAt: fact.outerDeadlineAt }),
    invocationStartedAt: fact.invocationStartedAt,
    policyDeadlineAt: fact.policyDeadlineAt,
    invocationDeadlineAt: fact.invocationDeadlineAt,
  };
}

function lockDigest(lock: TaskCapabilityLock): string {
  return sha256CanonicalJson(JsonValueSchema.parse(lock));
}

function withoutDigest(link: LocalPersonalModelInvocationLink) {
  const { recordDigest: _recordDigest, ...material } = link;
  return material;
}

function requireWrite(result: Awaited<ReturnType<
  LocalPersonalModelInvocationPersistence["advanceInvocation"]
>>): LocalPersonalModelInvocationLink {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function stableUuid(value: string, domain: string): string {
  const bytes = createHash("sha256").update(`${domain}\u0000${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
