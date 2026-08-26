import type {
  AgentDefinitionRevision,
  ModelDefinition,
  RequiredModelCapabilities,
} from "@robothree/contracts";

import type { PersonalCredentialStore } from "../ports/personal-credential-store.js";
import type { PersonalModelOwnerAuthority } from "../ports/personal-model-owner-authority.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";
import type { TrustedModelRepository } from "../ports/trusted-runtime-catalog.js";
import {
  validatePersonalModelDefinition,
  validatePersonalModelHead,
  validatePersonalModelPreference,
  validatePersonalModelStatusFact,
  type PersonalModelPreference,
} from "./personal-model-domain.js";
import { PersonalModelProviderProfileRegistry } from "./personal-model-provider-profile.js";
import type { ModelLiveEligibility } from "./model-eligibility-evaluator.js";

export type UnifiedContextWindow =
  | Readonly<{ state: "known"; value: number }>
  | Readonly<{ state: "unknown" }>;

export type UnifiedModelCandidate = Readonly<{
  authority: "central_enterprise" | "local_personal";
  modelId: string;
  displayName: string;
  exactRevision: string;
  capabilityFacts: Readonly<{
    inputModalities: readonly ("text" | "image" | "audio")[];
    outputModalities: readonly ("text" | "image" | "audio")[];
    supportsToolCalling: boolean;
    supportsStreaming: boolean;
    contextWindow: UnifiedContextWindow;
  }>;
  selectionState: "eligible" | "blocked";
  safeReasonCode?: string;
  enterpriseOrder?: number;
}>;

export type ModelSelectionIntent = Readonly<{
  requestedModelId?: string;
}>;

export type PreferenceMutationIntent = "none" | "requires_explicit_safe_command";

export type ModelSelectionResult = Readonly<{
  candidate: UnifiedModelCandidate;
  selectionSource: "explicit" | "user_preference" | "agent_default" | "enterprise_first";
  preferenceMutation: PreferenceMutationIntent;
  /**
   * The normalized per-Task model request. It may be derived from a durable
   * preference or enterprise ordering and therefore never proves a preference
   * mutation or a user click by itself.
   */
  normalizedRequestedModelId?: string;
  safeReasonCode?: string;
}>;

export class UnifiedModelSelectionError extends Error {
  public constructor(public readonly code:
    | "model.identity_ambiguous"
    | "model.personal_id_not_capability_id"
    | "model.context_window_unknown"
    | "personal_model.explicit_selection_required"
    | "personal_model.preference_stale"
    | "selection.model_unavailable"
    | "selection.model_ineligible"
    | "selection.model_override_forbidden") {
    super(code);
    this.name = "UnifiedModelSelectionError";
  }
}

export class CompositeTrustedModelCatalog {
  readonly #enterprise: TrustedModelRepository;
  readonly #personal: PersonalModelPersistence;
  readonly #credentials: PersonalCredentialStore;
  readonly #profiles: PersonalModelProviderProfileRegistry;

  public constructor(input: Readonly<{
    enterprise: TrustedModelRepository;
    personal: PersonalModelPersistence;
    credentials: PersonalCredentialStore;
    profiles?: PersonalModelProviderProfileRegistry;
  }>) {
    this.#enterprise = input.enterprise;
    this.#personal = input.personal;
    this.#credentials = input.credentials;
    this.#profiles = input.profiles ?? new PersonalModelProviderProfileRegistry();
  }

  public async list(input: Readonly<{
    ownerAuthority: PersonalModelOwnerAuthority;
    liveEnterpriseModels: readonly ModelLiveEligibility[];
  }>): Promise<readonly UnifiedModelCandidate[]> {
    const enterpriseDefinitions = await this.#enterprise.listModels();
    const enterprise = enterpriseDefinitions.map((definition, enterpriseOrder) =>
      enterpriseCandidate(
        definition,
        input.liveEnterpriseModels.find((live) => live.modelId === definition.modelId),
        enterpriseOrder,
      ));
    const personal = await this.#listPersonal(input.ownerAuthority);
    const ids = new Set<string>();
    for (const candidate of [...enterprise, ...personal]) {
      if (ids.has(candidate.modelId)) {
        throw new UnifiedModelSelectionError("model.identity_ambiguous");
      }
      ids.add(candidate.modelId);
    }
    return Object.freeze([...enterprise, ...personal]);
  }

  async #listPersonal(
    authority: PersonalModelOwnerAuthority,
  ): Promise<readonly UnifiedModelCandidate[]> {
    if (authority.authoritySource !== "runtime_active_enterprise_identity"
      || authority.entitlement !== "personal_model.configure") {
      throw new UnifiedModelSelectionError("selection.model_ineligible");
    }
    const heads = [];
    let cursor: string | undefined;
    do {
      const page = await this.#personal.listActiveHeads(authority.ownerIdentity, cursor, 100);
      if (!page.ok) throw new UnifiedModelSelectionError("selection.model_ineligible");
      heads.push(...page.value.heads);
      cursor = page.value.nextCursor;
      if (heads.length > 1_000) throw new UnifiedModelSelectionError("selection.model_unavailable");
    } while (cursor !== undefined);

    const candidates: UnifiedModelCandidate[] = [];
    for (const rawHead of heads) {
      const head = validatePersonalModelHead(rawHead);
      if (head.selectionState !== "active") continue;
      const definition = await this.#personal.loadDefinition(
        authority.ownerIdentity,
        head.personalModelId,
        head.currentConfigurationRevision,
      );
      const status = await this.#personal.loadStatus(
        authority.ownerIdentity,
        head.personalModelId,
        head.currentConfigurationRevision,
      );
      if (definition === undefined || status === undefined) {
        throw new UnifiedModelSelectionError("selection.model_ineligible");
      }
      validatePersonalModelDefinition(definition);
      validatePersonalModelStatusFact(status);
      if (definition.executionDefinitionDigest !== head.currentExecutionDefinitionDigest
        || status.executionDefinitionDigest !== definition.executionDefinitionDigest) {
        throw new UnifiedModelSelectionError("selection.model_ineligible");
      }
      let safeReasonCode: string | undefined;
      let eligible = isPersonalStatusSelectable(status.status)
        && authority.offlineState !== "enterprise_session_invalid";
      try {
        this.#profiles.resolve(definition.providerKind, definition.providerProfileRevision);
      } catch {
        eligible = false;
        safeReasonCode = "personal_model.provider_profile_unavailable";
      }
      const observation = await this.#credentials.inspect(definition.credentialRef);
      if (observation.state !== "present"
        || observation.credentialRevision !== definition.credentialRevision
        || observation.credentialBindingDigest !== definition.credentialBindingDigest) {
        eligible = false;
        safeReasonCode = observation.state === "unavailable"
          ? "personal_model.credential_unavailable"
          : "personal_model.credential_mismatch";
      }
      if (!definition.personalModelId.startsWith("model.")) {
        eligible = false;
        safeReasonCode = "model.personal_id_not_capability_id";
      }
      if (!definition.capabilities.includes("text")) {
        eligible = false;
        safeReasonCode = "model.input_modality_missing";
      }
      if (!eligible && safeReasonCode === undefined) {
        safeReasonCode = authority.offlineState === "enterprise_session_invalid"
          ? "model.permission_denied"
          : `personal_model.status.${status.status}`;
      }
      candidates.push(Object.freeze({
        authority: "local_personal" as const,
        modelId: definition.personalModelId,
        displayName: definition.displayName,
        exactRevision: definition.configurationRevision,
        capabilityFacts: Object.freeze({
          inputModalities: Object.freeze([
            "text" as const,
            ...(definition.capabilities.includes("vision") ? ["image" as const] : []),
          ]),
          outputModalities: Object.freeze(["text" as const]),
          supportsToolCalling: definition.capabilities.includes("tool_calling"),
          supportsStreaming: definition.capabilities.includes("streaming"),
          contextWindow: Object.freeze({ state: "unknown" as const }),
        }),
        selectionState: eligible ? "eligible" as const : "blocked" as const,
        ...(safeReasonCode === undefined ? {} : { safeReasonCode }),
      }));
    }
    return Object.freeze(candidates.sort((left, right) => left.modelId.localeCompare(right.modelId)));
  }
}

export class ModelSelectionIntentResolver {
  public resolve(input: Readonly<{
    agent: AgentDefinitionRevision;
    intent: ModelSelectionIntent;
    preference?: PersonalModelPreference;
    candidates: readonly UnifiedModelCandidate[];
    inputRequirements?: Partial<RequiredModelCapabilities>;
  }>): ModelSelectionResult {
    assertUniqueCandidates(input.candidates);
    const byId = new Map(input.candidates.map((candidate) => [candidate.modelId, candidate]));
    const eligible = (candidate: UnifiedModelCandidate | undefined) => {
      if (candidate === undefined || candidate.selectionState !== "eligible") return false;
      assertCapabilities(candidate, input.agent.requiredModelCapabilities, input.inputRequirements);
      return true;
    };
    const explicit = input.intent.requestedModelId;
    if (explicit !== undefined) {
      if (!input.agent.allowModelOverride) {
        throw new UnifiedModelSelectionError("selection.model_override_forbidden");
      }
      const candidate = byId.get(explicit);
      if (!eligible(candidate)) throw new UnifiedModelSelectionError("selection.model_ineligible");
      return selection(candidate!, "explicit", explicit);
    }
    if (!input.agent.allowModelOverride) {
      const candidate = byId.get(input.agent.defaultModelId);
      if (!eligible(candidate)) throw new UnifiedModelSelectionError("selection.model_unavailable");
      return selection(candidate!, "agent_default");
    }

    let stalePreference = false;
    if (input.preference !== undefined) {
      const preference = validatePersonalModelPreference(input.preference);
      if (preference.modelId !== undefined) {
        const candidate = byId.get(preference.modelId);
        const revisionMatches = preference.modelSource === "personal"
          ? candidate?.authority === "local_personal"
            && candidate.exactRevision === preference.configurationRevision
          : candidate?.authority === "central_enterprise";
        if (revisionMatches && eligible(candidate)) {
          return selection(candidate!, "user_preference", candidate!.modelId);
        }
        stalePreference = true;
      }
    }

    const defaultCandidate = byId.get(input.agent.defaultModelId);
    if (eligible(defaultCandidate)) {
      return selection(
        defaultCandidate!,
        "agent_default",
        undefined,
        stalePreference ? "personal_model.preference_stale" : undefined,
      );
    }
    const firstEnterprise = input.candidates
      .filter((candidate) => candidate.authority === "central_enterprise")
      .sort((left, right) => (left.enterpriseOrder ?? 0) - (right.enterpriseOrder ?? 0))
      .find(eligible);
    if (firstEnterprise !== undefined) {
      return selection(
        firstEnterprise,
        "enterprise_first",
        firstEnterprise.modelId,
        stalePreference ? "personal_model.preference_stale" : undefined,
      );
    }
    if (input.candidates.some((candidate) =>
      candidate.authority === "local_personal" && eligible(candidate))) {
      throw new UnifiedModelSelectionError("personal_model.explicit_selection_required");
    }
    throw new UnifiedModelSelectionError("selection.model_unavailable");
  }
}

function enterpriseCandidate(
  definition: ModelDefinition,
  live: ModelLiveEligibility | undefined,
  enterpriseOrder: number,
): UnifiedModelCandidate {
  const eligible = live !== undefined
    && live.modelId === definition.modelId
    && live.userAllowed
    && live.enabled
    && live.credentialAvailable
    && live.callable;
  return Object.freeze({
    authority: "central_enterprise",
    modelId: definition.modelId,
    displayName: definition.name,
    exactRevision: definition.revision,
    capabilityFacts: Object.freeze({
      inputModalities: Object.freeze([...definition.capabilities.inputModalities]),
      outputModalities: Object.freeze([...definition.capabilities.outputModalities]),
      supportsToolCalling: definition.capabilities.supportsToolCalling,
      supportsStreaming: definition.capabilities.supportsStreaming,
      contextWindow: Object.freeze({
        state: "known" as const,
        value: definition.capabilities.contextWindow,
      }),
    }),
    selectionState: eligible ? "eligible" : "blocked",
    ...(eligible ? {} : { safeReasonCode: "selection.model_ineligible" }),
    enterpriseOrder,
  });
}

function selection(
  candidate: UnifiedModelCandidate,
  selectionSource: ModelSelectionResult["selectionSource"],
  normalizedRequestedModelId?: string,
  safeReasonCode?: string,
): ModelSelectionResult {
  return Object.freeze({
    candidate,
    selectionSource,
    preferenceMutation: selectionSource === "explicit"
      ? "requires_explicit_safe_command"
      : "none",
    ...(normalizedRequestedModelId === undefined ? {} : { normalizedRequestedModelId }),
    ...(safeReasonCode === undefined ? {} : { safeReasonCode }),
  });
}

function assertUniqueCandidates(candidates: readonly UnifiedModelCandidate[]): void {
  if (new Set(candidates.map((candidate) => candidate.modelId)).size !== candidates.length) {
    throw new UnifiedModelSelectionError("model.identity_ambiguous");
  }
}

function assertCapabilities(
  candidate: UnifiedModelCandidate,
  base: RequiredModelCapabilities,
  extra?: Partial<RequiredModelCapabilities>,
): void {
  const inputs = new Set(candidate.capabilityFacts.inputModalities);
  const outputs = new Set(candidate.capabilityFacts.outputModalities);
  if ([...base.inputModalities, ...(extra?.inputModalities ?? [])].some((item) => !inputs.has(item))
    || [...base.outputModalities, ...(extra?.outputModalities ?? [])].some((item) => !outputs.has(item))
    || ((base.supportsToolCalling || extra?.supportsToolCalling === true)
      && !candidate.capabilityFacts.supportsToolCalling)
    || ((base.supportsStreaming || extra?.supportsStreaming === true)
      && !candidate.capabilityFacts.supportsStreaming)) {
    throw new UnifiedModelSelectionError("selection.model_ineligible");
  }
  const minimum = Math.max(
    base.minimumContextWindow ?? 0,
    extra?.minimumContextWindow ?? 0,
  );
  if (minimum > 0) {
    if (candidate.capabilityFacts.contextWindow.state === "unknown") {
      throw new UnifiedModelSelectionError("model.context_window_unknown");
    }
    if (candidate.capabilityFacts.contextWindow.value < minimum) {
      throw new UnifiedModelSelectionError("selection.model_ineligible");
    }
  }
}

function isPersonalStatusSelectable(status: string): boolean {
  return status === "unverified" || status === "available" || status === "network_failed";
}
