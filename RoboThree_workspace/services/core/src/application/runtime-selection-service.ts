import {
  AgentProjectionSchema,
  JsonValueSchema,
  ModelProjectionSchema,
  TaskSelectionRequestSchema,
} from "@robothree/contracts";
import type {
  AgentDefinitionRevision,
  AgentProjection,
  ModelDefinition,
  ModelProjection,
  RequiredModelCapabilities,
  RuntimeError,
  TaskRuntimeSelection,
  TaskSelectionRequest,
  TaskCapabilityLock,
  SubmitTurnReasoningPreferenceV1Alpha3,
} from "@robothree/contracts";
import type {
  ReasoningModeLock,
} from "@robothree/contracts/reasoning-mode/v1alpha1";
import type {
  TaskRuntimeSelectionV1Alpha2,
} from "@robothree/contracts/runtime-selection/v1alpha2";

import type { Clock } from "../ports/clock.js";
import type { WorkspaceGrantPersistence } from "../ports/desktop-foundation-persistence.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import type {
  TrustedAgentRepository,
  TrustedModelRepository,
} from "../ports/trusted-runtime-catalog.js";
import type { CapabilityAvailability } from "../registry/capability-resolver.js";
import type { PersonalModelOwnerAuthority } from "../ports/personal-model-owner-authority.js";
import type { PersonalModelPreference } from "./personal-model-domain.js";
import type { CompositeModelTaskLockPlanner } from "./composite-personal-model-runtime.js";
import {
  UnifiedModelSelectionError,
  type CompositeTrustedModelCatalog,
  type ModelSelectionIntentResolver,
  type UnifiedModelCandidate,
} from "./unified-model-selection.js";
import type { TaskCapabilityLockService } from "./task-capability-lock-service.js";
import type {
  ModelEligibilityEvaluator,
  ModelLiveEligibility,
} from "./model-eligibility-evaluator.js";
import {
  createTaskRuntimeSelection,
  createTaskRuntimeSelectionV1Alpha2,
  hasValidAgentDefinitionRevision,
  hasValidModelDefinition,
  hasValidTaskRuntimeSelection,
} from "./runtime-selection-revisions.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type { ReasoningModeLockPlanner } from "./reasoning-mode-lock-planner.js";
import { isPersonalModelLock } from "./personal-model-task-lock.js";
import { validateReasoningModeLock } from "./reasoning-mode-lock-domain.js";

export type RuntimeSelectionResult =
  | { ok: true; replayed: boolean; value: TaskRuntimeSelection }
  | { ok: false; error: RuntimeError };

export type PreparedRuntimeSelectionResult =
  | {
    ok: true;
    value: {
      selection: TaskRuntimeSelection;
      capabilityLocks: readonly TaskCapabilityLock[];
    };
  }
  | { ok: false; error: RuntimeError };

export type PreparedRuntimeSelectionV1Alpha2Result =
  | {
    ok: true;
    value: {
      selection: TaskRuntimeSelectionV1Alpha2;
      capabilityLocks: readonly TaskCapabilityLock[];
    };
  }
  | { ok: false; error: RuntimeError };

export class RuntimeSelectionService {
  readonly #agents: TrustedAgentRepository;
  readonly #models: TrustedModelRepository;
  readonly #tasks: TaskPersistence;
  readonly #workspaces: WorkspaceGrantPersistence;
  readonly #locks: TaskCapabilityLockService;
  readonly #eligibility: ModelEligibilityEvaluator;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #compositeCatalog: CompositeTrustedModelCatalog | undefined;
  readonly #selectionIntent: ModelSelectionIntentResolver | undefined;
  readonly #modelLockPlanner: CompositeModelTaskLockPlanner | undefined;
  readonly #reasoningModeLockPlanner: ReasoningModeLockPlanner | undefined;

  constructor(input: {
    agents: TrustedAgentRepository;
    models: TrustedModelRepository;
    tasks: TaskPersistence;
    workspaces: WorkspaceGrantPersistence;
    locks: TaskCapabilityLockService;
    eligibility: ModelEligibilityEvaluator;
    clock: Clock;
    ids: IdGenerator;
    compositeCatalog?: CompositeTrustedModelCatalog;
    selectionIntent?: ModelSelectionIntentResolver;
    modelLockPlanner?: CompositeModelTaskLockPlanner;
    reasoningModeLockPlanner?: ReasoningModeLockPlanner;
  }) {
    this.#agents = input.agents;
    this.#models = input.models;
    this.#tasks = input.tasks;
    this.#workspaces = input.workspaces;
    this.#locks = input.locks;
    this.#eligibility = input.eligibility;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#compositeCatalog = input.compositeCatalog;
    this.#selectionIntent = input.selectionIntent;
    this.#modelLockPlanner = input.modelLockPlanner;
    this.#reasoningModeLockPlanner = input.reasoningModeLockPlanner;
    const compositeDependencyCount = [
      input.compositeCatalog,
      input.selectionIntent,
      input.modelLockPlanner,
    ].filter((dependency) => dependency !== undefined).length;
    if (compositeDependencyCount !== 0 && compositeDependencyCount !== 3) {
      throw new Error("composite model selection dependencies must be installed atomically");
    }
  }

  async resolveAndPersist(input: {
    taskId: string;
    request: TaskSelectionRequest;
    registryRevision: string;
    liveModels: readonly ModelLiveEligibility[];
    capabilityAvailability?: Readonly<Record<string, CapabilityAvailability>>;
    inputRequirements?: Partial<RequiredModelCapabilities>;
    platformPromptRevision: string;
    enterpriseConfigRevision?: string;
    personalOwnerAuthority?: PersonalModelOwnerAuthority;
    personalPreference?: PersonalModelPreference;
  }): Promise<RuntimeSelectionResult> {
    const existing = await this.#tasks.loadTaskRuntimeSelection(input.taskId);
    if (existing !== undefined) return this.#validatePersisted(existing);
    const request = TaskSelectionRequestSchema.safeParse(input.request);
    if (!request.success) return fail("selection.invalid_request", "Task selection request is invalid");
    const agent = await this.#agents.loadActiveAgent(request.data.agentId);
    if (agent === undefined || !hasValidAgentDefinitionRevision(agent)) {
      return fail("selection.agent_unavailable", "trusted Agent revision is unavailable or invalid");
    }
    const selectedSkills = selectMaterialized(
      agent.skillReferences,
      request.data.selectedSkillIds,
      "selection.skill_not_allowed",
    );
    if (!selectedSkills.ok) return selectedSkills;
    const selectedKnowledge = selectMaterialized(
      agent.knowledgeReferences,
      request.data.selectedKnowledgeIds,
      "selection.knowledge_not_allowed",
    );
    if (!selectedKnowledge.ok) return selectedKnowledge;
    if (request.data.workspaceGrantId !== undefined) {
      const workspace = await this.#workspaces.loadWorkspaceGrant(request.data.workspaceGrantId);
      if (workspace === undefined || workspace.status !== "active") {
        return fail("selection.workspace_unavailable", "WorkspaceGrant is missing or revoked");
      }
    }

    const selected = await this.#selectModel({
      agent,
      ...(request.data.requestedModelId === undefined
        ? {}
        : { requestedModelId: request.data.requestedModelId }),
      liveModels: input.liveModels,
      ...(input.inputRequirements === undefined
        ? {}
        : { inputRequirements: input.inputRequirements }),
      ...(input.personalOwnerAuthority === undefined
        ? {}
        : { ownerAuthority: input.personalOwnerAuthority }),
      ...(input.personalPreference === undefined
        ? {}
        : { preference: input.personalPreference }),
    });
    if (!selected.ok) return selected;
    const { candidate, normalizedRequestedModelId } = selected.value;

    try {
      const modelLock = this.#modelLockPlanner === undefined
        ? (await this.#locks.resolveAndLock({
          taskId: input.taskId,
          registryRevision: input.registryRevision,
          capabilityId: candidate.modelId,
          ...(input.capabilityAvailability?.[candidate.modelId] === undefined
            ? {}
            : { availability: input.capabilityAvailability[candidate.modelId] }),
        })).lock
        : await this.#modelLockPlanner.resolveAndLock({
          candidate,
          ...(input.personalOwnerAuthority === undefined
            ? {}
            : { ownerAuthority: input.personalOwnerAuthority }),
          taskId: input.taskId,
          registryRevision: input.registryRevision,
          lockId: this.#ids.next(),
          lockedAt: this.#clock.now(),
          ...(input.capabilityAvailability?.[candidate.modelId] === undefined
            ? {}
            : { availability: input.capabilityAvailability[candidate.modelId] }),
        });
      const enterpriseModel = candidate.authority === "central_enterprise"
        ? await this.#models.loadModel(candidate.modelId)
        : undefined;
      if (enterpriseModel !== undefined
        && modelLock.definitionSnapshot.revision !== enterpriseModel.capability.capabilityRevision) {
        return fail("selection.model_revision_drift", "Model definition and Capability revision differ");
      }
      const toolLocks = [];
      for (const reference of agent.toolReferences) {
        const locked = await this.#locks.resolveAndLock({
          taskId: input.taskId,
          registryRevision: input.registryRevision,
          capabilityId: reference.capabilityId,
          ...(input.capabilityAvailability?.[reference.capabilityId] === undefined
            ? {}
            : { availability: input.capabilityAvailability[reference.capabilityId] }),
        });
        if (locked.lock.definitionSnapshot.revision !== reference.capabilityRevision) {
          return fail("selection.tool_revision_drift", "Agent Tool reference and lock revision differ");
        }
        toolLocks.push(lockRef(locked.lock));
      }
      const selection = createTaskRuntimeSelection({
        schemaVersion: "v1alpha1",
        runtimeSelectionId: this.#ids.next(),
        taskId: input.taskId,
        agent: {
          agentDefinitionId: agent.agentDefinitionId,
          revision: agent.revision,
          digest: agent.digest,
        },
        agentDefaultModelId: agent.defaultModelId,
        ...(normalizedRequestedModelId === undefined
          ? {}
          : { requestedModelId: normalizedRequestedModelId }),
        resolvedModelLock: lockRef(modelLock),
        activeSkillRevisions: [...selectedSkills.value],
        toolLocks,
        knowledgeRevisions: [...selectedKnowledge.value],
        ...(request.data.workspaceGrantId === undefined
          ? {}
          : { workspaceGrantId: request.data.workspaceGrantId }),
        ...(input.enterpriseConfigRevision === undefined
          ? {}
          : { enterpriseConfigRevision: input.enterpriseConfigRevision }),
        platformPromptRevision: input.platformPromptRevision,
        registryRevision: input.registryRevision,
        createdAt: this.#clock.now(),
      });
      const committed = await this.#tasks.commitTaskRuntimeSelection(selection);
      return committed.ok
        ? { ok: true, replayed: committed.replayed, value: committed.value }
        : committed;
    } catch (error) {
      return fail(
        "selection.capability_lock_failed",
        error instanceof Error ? error.message : "capability lock failed",
      );
    }
  }

  async prepareForTaskBundle(input: {
    taskId: string;
    request: TaskSelectionRequest;
    registryRevision: string;
    liveModels: readonly ModelLiveEligibility[];
    capabilityAvailability?: Readonly<Record<string, CapabilityAvailability>>;
    inputRequirements?: Partial<RequiredModelCapabilities>;
    platformPromptRevision: string;
    enterpriseConfigRevision?: string;
    runtimeSelectionId?: string;
    capabilityLockIds?: readonly string[];
    createdAt?: string;
    expectedAgent?: TaskRuntimeSelection["agent"];
    personalOwnerAuthority?: PersonalModelOwnerAuthority;
    personalPreference?: PersonalModelPreference;
  }): Promise<PreparedRuntimeSelectionResult> {
    const request = TaskSelectionRequestSchema.safeParse(input.request);
    if (!request.success) {
      return fail("selection.invalid_request", "Task selection request is invalid");
    }
    const agent = input.expectedAgent === undefined
      ? await this.#agents.loadActiveAgent(request.data.agentId)
      : await this.#agents.loadAgentRevision(
        input.expectedAgent.agentDefinitionId,
        input.expectedAgent.revision,
      );
    if (
      agent === undefined
      || !hasValidAgentDefinitionRevision(agent)
      || agent.agentDefinitionId !== request.data.agentId
      || (input.expectedAgent !== undefined
        && (agent.revision !== input.expectedAgent.revision
          || agent.digest !== input.expectedAgent.digest))
    ) {
      return fail(
        "selection.agent_unavailable",
        "trusted exact Agent revision is unavailable or invalid",
      );
    }
    const selectedSkills = selectMaterialized(
      agent.skillReferences,
      request.data.selectedSkillIds,
      "selection.skill_not_allowed",
    );
    if (!selectedSkills.ok) return selectedSkills;
    const selectedKnowledge = selectMaterialized(
      agent.knowledgeReferences,
      request.data.selectedKnowledgeIds,
      "selection.knowledge_not_allowed",
    );
    if (!selectedKnowledge.ok) return selectedKnowledge;
    if (request.data.workspaceGrantId !== undefined) {
      const workspace = await this.#workspaces.loadWorkspaceGrant(
        request.data.workspaceGrantId,
      );
      if (workspace === undefined || workspace.status !== "active") {
        return fail(
          "selection.workspace_unavailable",
          "WorkspaceGrant is missing or revoked",
        );
      }
    }
    const selected = await this.#selectModel({
      agent,
      ...(request.data.requestedModelId === undefined
        ? {}
        : { requestedModelId: request.data.requestedModelId }),
      liveModels: input.liveModels,
      ...(input.inputRequirements === undefined
        ? {}
        : { inputRequirements: input.inputRequirements }),
      ...(input.personalOwnerAuthority === undefined
        ? {}
        : { ownerAuthority: input.personalOwnerAuthority }),
      ...(input.personalPreference === undefined
        ? {}
        : { preference: input.personalPreference }),
    });
    if (!selected.ok) return selected;
    const { candidate, normalizedRequestedModelId } = selected.value;
    const expectedLockCount = 1 + agent.toolReferences.length;
    if (
      input.capabilityLockIds !== undefined
      && input.capabilityLockIds.length !== expectedLockCount
    ) {
      return fail(
        "selection.lock_identity_mismatch",
        "capabilityLockIds do not match the exact Model and Tool set",
      );
    }
    const lockIds = input.capabilityLockIds === undefined
      ? Array.from({ length: expectedLockCount }, () => this.#ids.next())
      : [...input.capabilityLockIds];
    const createdAt = input.createdAt ?? this.#clock.now();
    try {
      const modelLock = this.#modelLockPlanner === undefined
        ? this.#locks.prepare({
          taskId: input.taskId,
          registryRevision: input.registryRevision,
          capabilityId: candidate.modelId,
          lockId: lockIds[0]!,
          lockedAt: createdAt,
          ...(input.capabilityAvailability?.[candidate.modelId] === undefined
            ? {}
            : { availability: input.capabilityAvailability[candidate.modelId] }),
        }).lock
        : await this.#modelLockPlanner.prepare({
          candidate,
          ...(input.personalOwnerAuthority === undefined
            ? {}
            : { ownerAuthority: input.personalOwnerAuthority }),
          taskId: input.taskId,
          registryRevision: input.registryRevision,
          lockId: lockIds[0]!,
          lockedAt: createdAt,
          ...(input.capabilityAvailability?.[candidate.modelId] === undefined
            ? {}
            : { availability: input.capabilityAvailability[candidate.modelId] }),
        });
      const enterpriseModel = candidate.authority === "central_enterprise"
        ? await this.#models.loadModel(candidate.modelId)
        : undefined;
      if (
        enterpriseModel !== undefined
        && modelLock.definitionSnapshot.revision
        !== enterpriseModel.capability.capabilityRevision
      ) {
        return fail(
          "selection.model_revision_drift",
          "Model definition and Capability revision differ",
        );
      }
      const toolLocks: TaskCapabilityLock[] = [];
      for (const [index, reference] of agent.toolReferences.entries()) {
        const locked = this.#locks.prepare({
          taskId: input.taskId,
          registryRevision: input.registryRevision,
          capabilityId: reference.capabilityId,
          lockId: lockIds[index + 1]!,
          lockedAt: createdAt,
          ...(input.capabilityAvailability?.[reference.capabilityId] === undefined
            ? {}
            : {
              availability:
                input.capabilityAvailability[reference.capabilityId],
            }),
        });
        if (
          locked.lock.definitionSnapshot.revision
          !== reference.capabilityRevision
        ) {
          return fail(
            "selection.tool_revision_drift",
            "Agent Tool reference and lock revision differ",
          );
        }
        toolLocks.push(locked.lock);
      }
      const selection = createTaskRuntimeSelection({
        schemaVersion: "v1alpha1",
        runtimeSelectionId: input.runtimeSelectionId ?? this.#ids.next(),
        taskId: input.taskId,
        agent: {
          agentDefinitionId: agent.agentDefinitionId,
          revision: agent.revision,
          digest: agent.digest,
        },
        agentDefaultModelId: agent.defaultModelId,
        ...(normalizedRequestedModelId === undefined
          ? {}
          : { requestedModelId: normalizedRequestedModelId }),
        resolvedModelLock: lockRef(modelLock),
        activeSkillRevisions: [...selectedSkills.value],
        toolLocks: toolLocks.map(lockRef),
        knowledgeRevisions: [...selectedKnowledge.value],
        ...(request.data.workspaceGrantId === undefined
          ? {}
          : { workspaceGrantId: request.data.workspaceGrantId }),
        ...(input.enterpriseConfigRevision === undefined
          ? {}
          : { enterpriseConfigRevision: input.enterpriseConfigRevision }),
        platformPromptRevision: input.platformPromptRevision,
        registryRevision: input.registryRevision,
        createdAt,
      });
      return {
        ok: true,
        value: {
          selection,
          capabilityLocks: [modelLock, ...toolLocks],
        },
      };
    } catch (error) {
      return fail(
        "selection.capability_lock_failed",
        error instanceof Error ? error.message : "capability lock preparation failed",
      );
    }
  }

  async prepareForTaskBundleV1Alpha2(input: Parameters<
    RuntimeSelectionService["prepareForTaskBundle"]
  >[0] & Readonly<{
    reasoningPreference: SubmitTurnReasoningPreferenceV1Alpha3;
    reasoningModeLockId: string;
  }>): Promise<PreparedRuntimeSelectionV1Alpha2Result> {
    const prepared = await this.prepareForTaskBundle(input);
    if (!prepared.ok) return prepared;
    if (this.#reasoningModeLockPlanner === undefined) {
      return fail(
        "reasoning_profile_unavailable",
        "Reasoning Mode planning is not installed",
      );
    }
    const modelLock = prepared.value.capabilityLocks.find(
      (lock) => lock.lockId === prepared.value.selection.resolvedModelLock.lockId,
    );
    if (modelLock === undefined) {
      return fail(
        "reasoning_profile_unavailable",
        "Resolved Model lock is unavailable for reasoning planning",
      );
    }
    const planned = await this.#reasoningModeLockPlanner.plan({
      reasoningPreference: input.reasoningPreference,
      taskId: input.taskId,
      reasoningModeLockId: input.reasoningModeLockId,
      lockedAt: prepared.value.selection.createdAt,
      modelLock,
      candidateAuthority: isPersonalModelLock(modelLock)
        ? "local_personal"
        : "central_enterprise",
      ...(input.personalOwnerAuthority === undefined
        ? {}
        : { personalOwnerAuthority: input.personalOwnerAuthority }),
    });
    if (!planned.ok) return planned;
    return this.#upgradePreparedSelection(prepared.value, planned.lock);
  }

  async prepareForTaskBundleV1Alpha2FromAcceptedPlan(input: Parameters<
    RuntimeSelectionService["prepareForTaskBundle"]
  >[0] & Readonly<{
    reasoningModeLock: ReasoningModeLock;
  }>): Promise<PreparedRuntimeSelectionV1Alpha2Result> {
    const prepared = await this.prepareForTaskBundle(input);
    if (!prepared.ok) return prepared;
    return this.#upgradePreparedSelection(
      prepared.value,
      input.reasoningModeLock,
    );
  }

  #upgradePreparedSelection(
    prepared: Extract<PreparedRuntimeSelectionResult, { ok: true }>["value"],
    reasoningModeLock: ReasoningModeLock,
  ): PreparedRuntimeSelectionV1Alpha2Result {
    try {
      const lock = validateReasoningModeLock(reasoningModeLock, {
        taskId: prepared.selection.taskId,
        modelLockRef: prepared.selection.resolvedModelLock,
      });
      const {
        schemaVersion: _schemaVersion,
        selectionDigest: _selectionDigest,
        ...material
      } = prepared.selection;
      const selection = createTaskRuntimeSelectionV1Alpha2({
        ...material,
        schemaVersion: "v1alpha2",
        reasoningModeLock: lock,
      });
      return {
        ok: true,
        value: {
          selection,
          capabilityLocks: prepared.capabilityLocks,
        },
      };
    } catch {
      return fail(
        "reasoning_lock_integrity_invalid",
        "Reasoning Mode lock does not match the exact Task and Model lock",
      );
    }
  }

  async #validatePersisted(selection: TaskRuntimeSelection): Promise<RuntimeSelectionResult> {
    if (!hasValidTaskRuntimeSelection(selection)) {
      return fail("selection.corrupt", "persisted TaskRuntimeSelection digest is invalid");
    }
    const agent = await this.#agents.loadAgentRevision(
      selection.agent.agentDefinitionId,
      selection.agent.revision,
    );
    if (agent === undefined || agent.digest !== selection.agent.digest) {
      return fail("selection.agent_revision_missing", "locked Agent revision is unavailable");
    }
    if (
      !exactMaterializedReferences(selection.activeSkillRevisions, agent.skillReferences)
      || !exactMaterializedReferences(selection.knowledgeRevisions, agent.knowledgeReferences)
    ) {
      return fail(
        "selection.materialized_reference_missing",
        "locked Skill or Knowledge revision is unavailable or drifted",
      );
    }
    if (selection.workspaceGrantId !== undefined) {
      const workspace = await this.#workspaces.loadWorkspaceGrant(selection.workspaceGrantId);
      if (workspace === undefined || workspace.status !== "active") {
        return fail("selection.workspace_unavailable", "locked WorkspaceGrant is missing or revoked");
      }
    }
    const locks = await this.#tasks.listTaskCapabilityLocks(selection.taskId);
    const byId = new Map(locks.map((lock) => [lock.lockId, lock]));
    for (const reference of [selection.resolvedModelLock, ...selection.toolLocks]) {
      const lock = byId.get(reference.lockId);
      if (
        lock === undefined
        || lock.registryRevision !== selection.registryRevision
        || lock.definitionSnapshot.capabilityId !== reference.capabilityId
        || lockRef(lock).lockDigest !== reference.lockDigest
      ) return fail("selection.capability_lock_missing", "locked capability fact is missing or drifted");
    }
    return { ok: true, replayed: true, value: selection };
  }

  async #selectModel(input: Readonly<{
    agent: AgentDefinitionRevision;
    requestedModelId?: string;
    liveModels: readonly ModelLiveEligibility[];
    inputRequirements?: Partial<RequiredModelCapabilities>;
    ownerAuthority?: PersonalModelOwnerAuthority;
    preference?: PersonalModelPreference;
  }>): Promise<
    | Readonly<{ ok: true; value: Readonly<{
      candidate: UnifiedModelCandidate;
      normalizedRequestedModelId?: string;
    }> }>
    | Readonly<{ ok: false; error: RuntimeError }>
  > {
    if (this.#compositeCatalog !== undefined
      && this.#selectionIntent !== undefined
      && input.ownerAuthority !== undefined) {
      try {
        const candidates = await this.#compositeCatalog.list({
          ownerAuthority: input.ownerAuthority,
          liveEnterpriseModels: input.liveModels,
        });
        const resolved = this.#selectionIntent.resolve({
          agent: input.agent,
          intent: input.requestedModelId === undefined
            ? {}
            : { requestedModelId: input.requestedModelId },
          ...(input.preference === undefined ? {} : { preference: input.preference }),
          candidates,
          ...(input.inputRequirements === undefined
            ? {}
            : { inputRequirements: input.inputRequirements }),
        });
        return {
          ok: true,
          value: {
            candidate: resolved.candidate,
            ...(resolved.normalizedRequestedModelId === undefined
              ? {}
              : { normalizedRequestedModelId: resolved.normalizedRequestedModelId }),
          },
        };
      } catch (error) {
        return fail(
          error instanceof UnifiedModelSelectionError
            ? error.code
            : "selection.model_unavailable",
          "model selection could not resolve an eligible exact candidate",
        );
      }
    }
    const modelId = input.requestedModelId ?? input.agent.defaultModelId;
    if (input.requestedModelId !== undefined && !input.agent.allowModelOverride) {
      return fail("selection.model_override_forbidden", "Agent does not allow a task model override");
    }
    const model = await this.#models.loadModel(modelId);
    const live = input.liveModels.find((state) => state.modelId === modelId);
    if (model === undefined || live === undefined || !hasValidModelDefinition(model)) {
      return fail("selection.model_unavailable", "selected Model definition or live facts are unavailable");
    }
    const eligible = this.#eligibility.evaluate({
      agent: input.agent,
      model,
      live,
      ...(input.inputRequirements === undefined
        ? {}
        : { inputRequirements: input.inputRequirements }),
    });
    if (!eligible.eligible) {
      return fail("selection.model_ineligible", "selected Model does not satisfy deterministic eligibility", {
        reasons: eligible.reasons,
      });
    }
    return {
      ok: true,
      value: {
        candidate: {
          authority: "central_enterprise",
          modelId: model.modelId,
          displayName: model.name,
          exactRevision: model.revision,
          capabilityFacts: {
            ...model.capabilities,
            contextWindow: { state: "known", value: model.capabilities.contextWindow },
          },
          selectionState: "eligible",
        },
        ...(input.requestedModelId === undefined
          ? {}
          : { normalizedRequestedModelId: input.requestedModelId }),
      },
    };
  }
}

function exactMaterializedReferences(
  selected: TaskRuntimeSelection["activeSkillRevisions"],
  allowed: AgentDefinitionRevision["skillReferences"],
): boolean {
  return selected.every((reference) => allowed.some((candidate) =>
    candidate.id === reference.id
    && candidate.revision === reference.revision
    && candidate.contentDigest === reference.contentDigest
    && candidate.materializedRef === reference.materializedRef));
}

export class RuntimeCatalogProjectionService {
  readonly #agents: TrustedAgentRepository;
  readonly #models: TrustedModelRepository;
  readonly #eligibility: ModelEligibilityEvaluator;

  constructor(input: {
    agents: TrustedAgentRepository;
    models: TrustedModelRepository;
    eligibility: ModelEligibilityEvaluator;
  }) {
    this.#agents = input.agents;
    this.#models = input.models;
    this.#eligibility = input.eligibility;
  }

  async listModels(liveModels: readonly ModelLiveEligibility[]): Promise<readonly ModelProjection[]> {
    return Promise.all((await this.#models.listModels()).map(async (model) =>
      projectModel(model, liveModels.find((state) => state.modelId === model.modelId))));
  }

  async listAgents(liveModels: readonly ModelLiveEligibility[]): Promise<readonly AgentProjection[]> {
    const models = await this.#models.listModels();
    return Promise.all((await this.#agents.listActiveAgents()).map(async (agent) => {
      const candidateModels = agent.allowModelOverride
        ? models
        : models.filter((model) => model.modelId === agent.defaultModelId);
      const eligibleModels = candidateModels
        .filter((model) => {
          const live = liveModels.find((state) => state.modelId === model.modelId);
          return live !== undefined && this.#eligibility.evaluate({ agent, model, live }).eligible;
        })
        .map((model) => projectModel(
          model,
          liveModels.find((state) => state.modelId === model.modelId),
        ));
      const defaultAvailable = eligibleModels.some((model) => model.modelId === agent.defaultModelId);
      const runnable = defaultAvailable || (agent.allowModelOverride && eligibleModels.length > 0);
      return AgentProjectionSchema.parse({
        agentId: agent.agentDefinitionId,
        revision: agent.revision,
        name: agent.name,
        identity: agent.identity,
        goal: agent.goal,
        defaultModelId: agent.defaultModelId,
        allowModelOverride: agent.allowModelOverride,
        eligibleModels,
        requiredModelCapabilities: projectionRequirements(agent.requiredModelCapabilities),
        skills: agent.skillReferences.map(projectResource),
        tools: agent.toolReferences.map((tool) => ({
          id: tool.capabilityId,
          revision: tool.capabilityRevision,
          name: tool.capabilityId,
          available: true,
        })),
        knowledge: agent.knowledgeReferences.map(projectResource),
        runnable,
        ...(runnable ? {} : { unavailableReason: "No eligible model is currently available" }),
      });
    }));
  }
}

function lockRef(lock: TaskCapabilityLock) {
  return {
    lockId: lock.lockId,
    capabilityId: lock.definitionSnapshot.capabilityId,
    lockDigest: sha256CanonicalJson(JsonValueSchema.parse(lock)),
  };
}

function selectMaterialized<T extends { id: string }>(
  allowed: readonly T[],
  selectedIds: readonly string[],
  code: string,
): { ok: true; value: readonly T[] } | { ok: false; error: RuntimeError } {
  const map = new Map(allowed.map((item) => [item.id, item]));
  const value: T[] = [];
  for (const id of [...new Set(selectedIds)].sort()) {
    const item = map.get(id);
    if (item === undefined) return fail(code, `${id} is not allowed by the Agent`);
    value.push(item);
  }
  return { ok: true, value };
}

function projectModel(model: ModelDefinition, live?: ModelLiveEligibility): ModelProjection {
  const available = live?.userAllowed === true
    && live.enabled
    && live.credentialAvailable
    && live.callable;
  return ModelProjectionSchema.parse({
    modelId: model.modelId,
    revision: model.revision,
    name: model.name,
    source: model.source,
    capabilities: [
      ...(model.capabilities.inputModalities.includes("text") ? ["text" as const] : []),
      ...(model.capabilities.supportsStreaming ? ["streaming" as const] : []),
      ...(model.capabilities.supportsToolCalling ? ["tool_calling" as const] : []),
      ...(model.capabilities.inputModalities.includes("image") ? ["vision" as const] : []),
    ],
    available,
    ...(available ? {} : { unavailableReason: "Model is not currently eligible" }),
  });
}

function projectResource(resource: { id: string; revision: string }) {
  return { id: resource.id, revision: resource.revision, name: resource.id, available: true };
}

function projectionRequirements(required: RequiredModelCapabilities) {
  return [
    ...(required.inputModalities.includes("text") ? ["text" as const] : []),
    ...(required.supportsStreaming ? ["streaming" as const] : []),
    ...(required.supportsToolCalling ? ["tool_calling" as const] : []),
    ...(required.inputModalities.includes("image") ? ["vision" as const] : []),
  ];
}

function fail(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): { ok: false; error: RuntimeError } {
  return {
    ok: false,
    error: {
      code,
      category: "validation",
      message,
      retryable: false,
      ...(details === undefined ? {} : { details }),
    },
  };
}
