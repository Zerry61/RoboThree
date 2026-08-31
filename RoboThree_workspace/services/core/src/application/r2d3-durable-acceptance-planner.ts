import {
  JsonValueSchema,
  SubmitTurnCommandV1Alpha3Schema,
  TaskSubmitTurnBindingSchema,
  type RuntimeError,
  type SubmitTurnCommandV1Alpha3,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import {
  SubmitTurnCommandV1Alpha5Schema,
  type SubmitTurnCommandV1Alpha5,
} from "@robothree/contracts/desktop-local/v1alpha5";
import {
  SubmitTurnRecordV1Alpha4Schema,
} from "@robothree/contracts/submit-turn-coordination/v1alpha4";
import { SubmitTurnRecordV1Alpha5Schema } from
  "@robothree/contracts/submit-turn-coordination/v1alpha5";

import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { R2D3AcceptanceAuthority } from
  "../ports/r2d3-acceptance-authority.js";
import type { TaskAuthorizationModePolicyProvider } from
  "../ports/task-authorization-mode-policy.js";
import type { TaskResourceEntitlementSource } from
  "../ports/task-resource-entitlement-source.js";
import type { TaskToolCandidatePolicy } from
  "../ports/task-tool-candidate-policy.js";
import type { Dfi541SubmitTurnTaskBundle } from "../ports/task-persistence.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import { deriveR2D3SubmitTurnBinding } from
  "../persistence/r2d3-task-bundle-validation.js";
import type { AgentResourceDecisionPlanner } from "./agent-resource-decision-planner.js";
import type { ReadableAgentDefinitionRevision } from
  "./agent-definition-v1alpha2.js";
import type { BuiltInGeneralAgentSource } from "./built-in-general-agent-source.js";
import { createInitialPersistedTask } from "./durable-task-runtime.js";
import {
  deriveTaskInstructionBindingV1FromValidatedSelection,
  deriveTaskInstructionBindingV1FromValidatedSelectionV1Alpha4,
} from "./instruction-bundle-domain.js";
import {
  createDfi541CoordinationEnvelopeV1,
  createDurableDfi541AcceptancePlanV1,
  type PersistedDfi541CoordinationEnvelopeV1,
} from "./dfi541-durable-acceptance.js";
import {
  createModelInvocationTimeoutMaterial,
  LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
} from "./model-invocation-timeout-policy.js";
import {
  createDurableR2D3AcceptancePlanV1,
  createR2D3CoordinationEnvelopeV1,
  type PersistedR2D3CoordinationEnvelopeV1,
} from "./r2d3-durable-acceptance.js";
import { createTaskRuntimeSelectionV1Alpha3, createTaskRuntimeSelectionV1Alpha4 } from
  "./runtime-selection-revisions.js";
import type { ReasoningModeLockPlanner } from "./reasoning-mode-lock-planner.js";
import type { ReasoningModeLockPlannerV1Alpha2 } from
  "./reasoning-mode-lock-planner-v1alpha2.js";
import { resolutionEvidenceRef } from
  "./reasoning-mode-lock-v1alpha2-domain.js";
import { isPersonalModelLock } from "./personal-model-task-lock.js";
import { enterpriseAgentTurnDeadlineAt } from "./agent-turn-timeout-policy.js";
import { TaskAuthorizationSelectionService } from
  "./task-authorization-selection-service.js";
import { platformPromptRevisionForNewTask } from
  "./task-locked-instruction-runtime.js";

export const R2D3_CORE_DELTA_DEFAULT_ENABLED = false as const;

export type PreparedR2D3FirstAccept = Readonly<{
  envelope: PersistedR2D3CoordinationEnvelopeV1;
  task: ReturnType<typeof createInitialPersistedTask>;
}>;

export type PreparedR2D3FirstAcceptResult =
  | Readonly<{ ok: true; value: PreparedR2D3FirstAccept }>
  | Readonly<{ ok: false; error: RuntimeError }>;

export type PreparedDfi543FirstAccept = Readonly<{
  envelope: PersistedDfi541CoordinationEnvelopeV1;
  bundle: Dfi541SubmitTurnTaskBundle;
}>;

export type PreparedDfi543FirstAcceptResult =
  | Readonly<{ ok: true; value: PreparedDfi543FirstAccept }>
  | Readonly<{ ok: false; error: RuntimeError }>;

type R2D3ExactAgent = Extract<
  ReadableAgentDefinitionRevision,
  { schemaVersion: "v1alpha2" }
>;

export class R2D3DurableAcceptancePlanner {
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #authority: R2D3AcceptanceAuthority;
  readonly #entitlements: TaskResourceEntitlementSource;
  readonly #toolPolicy: TaskToolCandidatePolicy;
  readonly #decisionPlanner: AgentResourceDecisionPlanner;
  readonly #builtInAgent: BuiltInGeneralAgentSource;
  readonly #reasoningPlanner: ReasoningModeLockPlanner;
  readonly #reasoningPlannerV1Alpha2: ReasoningModeLockPlannerV1Alpha2 | undefined;
  readonly #authorizationPolicies: TaskAuthorizationModePolicyProvider;
  readonly #platformPromptRevision: ReturnType<typeof platformPromptRevisionForNewTask>;
  readonly #enterpriseConfigRevision: string | undefined;
  readonly #authorization = new TaskAuthorizationSelectionService();

  constructor(input: Readonly<{
    clock: Clock;
    ids: IdGenerator;
    authority: R2D3AcceptanceAuthority;
    entitlements: TaskResourceEntitlementSource;
    toolPolicy: TaskToolCandidatePolicy;
    decisionPlanner: AgentResourceDecisionPlanner;
    builtInAgent: BuiltInGeneralAgentSource;
    reasoningPlanner: ReasoningModeLockPlanner;
    reasoningPlannerV1Alpha2?: ReasoningModeLockPlannerV1Alpha2;
    authorizationPolicies: TaskAuthorizationModePolicyProvider;
    platformPromptRevision?: ReturnType<typeof platformPromptRevisionForNewTask>;
    enterpriseConfigRevision?: string;
  }>) {
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#authority = input.authority;
    this.#entitlements = input.entitlements;
    this.#toolPolicy = input.toolPolicy;
    this.#decisionPlanner = input.decisionPlanner;
    this.#builtInAgent = input.builtInAgent;
    this.#reasoningPlanner = input.reasoningPlanner;
    this.#reasoningPlannerV1Alpha2 = input.reasoningPlannerV1Alpha2;
    this.#authorizationPolicies = input.authorizationPolicies;
    this.#platformPromptRevision = input.platformPromptRevision
      ?? platformPromptRevisionForNewTask(false);
    this.#enterpriseConfigRevision = input.enterpriseConfigRevision;
  }

  async prepare(input: Readonly<{
    command: SubmitTurnCommandV1Alpha3;
    requestDigest: string;
    internalSessionId: string;
  }>): Promise<PreparedR2D3FirstAcceptResult> {
    let acceptanceLeaseId: string | undefined;
    try {
      const command = SubmitTurnCommandV1Alpha3Schema.parse(input.command);
      const common = await this.#prepareResourceKernel(command, input.internalSessionId);
      acceptanceLeaseId = common.acceptanceLeaseId;
      const { acceptedAt, taskId, userMessageId, runtimeSelectionId,
        checkpointId, reasoningModeLockId, preallocatedDeliveryId, exactAgent,
        subject, entitlement, registry, decision, capabilityLocks, modelLock } = common;
      const reasoning = await this.#reasoningPlanner.plan({
        reasoningPreference: command.selectionRequest.reasoningPreference,
        taskId,
        reasoningModeLockId,
        lockedAt: acceptedAt,
        modelLock,
        candidateAuthority: isPersonalModelLock(modelLock)
          ? "local_personal"
          : "central_enterprise",
        ...(common.personalOwnerAuthority === undefined
          ? {}
          : { personalOwnerAuthority: common.personalOwnerAuthority }),
      });
      if (!reasoning.ok) return reasoning;
      const selection = createTaskRuntimeSelectionV1Alpha3({
        schemaVersion: "v1alpha3",
        runtimeSelectionId,
        taskId,
        agent: exactAgentRef(exactAgent),
        agentResourceDecisionDigest: decision.decisionDigest,
        resourceEntitlementSnapshotDigest: entitlement.snapshotDigest,
        modelSelectionSource: decision.modelSelectionSource,
        ...(decision.requestedModelId === undefined
          ? {}
          : { requestedModelId: decision.requestedModelId }),
        resolvedModelLock: lockRef(capabilityLocks[0]!),
        activeSkillRevisions: decision.activeSkillRefs,
        toolLocks: capabilityLocks.slice(1).map(lockRef),
        knowledgeRevisions: decision.knowledgeRefs,
        reasoningModeLock: reasoning.lock,
        ...(command.selectionRequest.workspaceGrantId === undefined
          ? {}
          : { workspaceGrantId: command.selectionRequest.workspaceGrantId }),
        platformPromptRevision: this.#platformPromptRevision,
        registryRevision: registry.registryRevision,
        ...(this.#enterpriseConfigRevision === undefined
          ? {}
          : { enterpriseConfigRevision: this.#enterpriseConfigRevision }),
        createdAt: acceptedAt,
      });
      const policy = await this.#authorizationPolicies.loadSnapshot();
      const authorization = this.#authorization.resolve({
        taskId,
        runtimeSelection: selection,
        authorization: {
          kind: "explicit",
          preference: command.selectionRequest.authorizationPreference,
        },
        policySnapshot: policy,
        createdAt: acceptedAt,
      });
      if (!authorization.ok) return authorization;
      const task = createInitialPersistedTask({
        taskId,
        sessionId: input.internalSessionId,
        agentDefinition: {
          agentDefinitionId: exactAgent.agentDefinitionId,
          version: exactAgent.revision,
        },
        goal: command.userInput,
        createdAt: acceptedAt,
      }, checkpointId);
      const submitTurnBinding = deriveR2D3SubmitTurnBinding({
        submitTurnCommandId: command.commandId,
        userMessageId,
        task,
        capabilityLocks: [...capabilityLocks],
        runtimeSelection: selection,
        committedAt: acceptedAt,
      });
      const taskInstructionBinding =
        deriveTaskInstructionBindingV1FromValidatedSelection({
          runtimeSelection: selection,
          submitTurnBundleDigest: submitTurnBinding.bundleDigest,
        });
      const plan = createDurableR2D3AcceptancePlanV1({
        schemaVersion: "v1",
        submitTurnCommandId: command.commandId,
        clientTurnId: command.clientTurnId,
        internalSessionId: input.internalSessionId,
        internalTaskId: taskId,
        userMessageId,
        initialCheckpointId: checkpointId,
        runtimeSelectionId,
        requestDigest: input.requestDigest,
        selectionRequestDigest: sha256CanonicalJson(
          JsonValueSchema.parse(command.selectionRequest),
        ),
        acceptedClientBindingDigest: subject.acceptedClientBindingDigest,
        exactAgent: {
          ...exactAgentRef(exactAgent),
          managementClass: exactAgent.managementClass,
        },
        resourceEntitlementSnapshotDigest: entitlement.snapshotDigest,
        agentResourceDecision: decision,
        capabilityLocks: [...capabilityLocks],
        runtimeSelection: selection,
        authorizationSelection: authorization.selection,
        executionSelectionIdentity: authorization.executionIdentity,
        taskHead: task.head,
        initialTaskStateDigest: task.checkpoint.stateDigest,
        submitTurnBinding,
        taskInstructionBinding,
        acceptanceReceiptIdentity: command.commandId,
        preallocatedDeliveryId,
        acceptedAt,
      });
      const record = SubmitTurnRecordV1Alpha4Schema.parse({
        schemaVersion: "v1alpha4",
        transportContractVersion: "v1alpha3",
        submitTurnCommandId: command.commandId,
        clientTurnId: command.clientTurnId,
        desktopSessionId: command.sessionId,
        internalSessionId: input.internalSessionId,
        requestDigest: input.requestDigest,
        selectionRequest: command.selectionRequest,
        lockedAgent: selection.agent,
        registryRevision: selection.registryRevision,
        platformPromptRevision: selection.platformPromptRevision,
        plannedSelectionDigest: selection.selectionDigest,
        authorizationPlan: {
          requestedMode: authorization.selection.requestedMode,
          resolvedMode: authorization.selection.resolvedMode,
          policyRevision: authorization.selection.policyRevision,
          source: authorization.selection.source,
          authorizationSelectionDigest:
            authorization.selection.authorizationSelectionDigest,
          executionSelectionDigest:
            authorization.executionIdentity.executionSelectionDigest,
        },
        reasoningPlan: {
          reasoningModeLock: selection.reasoningModeLock,
          plannedRuntimeSelectionDigest: selection.selectionDigest,
        },
        resourcePlan: {
          resourceEntitlementSnapshotDigest: entitlement.snapshotDigest,
          agentResourceDecisionDigest: decision.decisionDigest,
          plannedRuntimeSelectionDigest: selection.selectionDigest,
          authorizationSelectionDigest:
            authorization.selection.authorizationSelectionDigest,
          executionSelectionDigest:
            authorization.executionIdentity.executionSelectionDigest,
          plannedTaskBundleDigest: submitTurnBinding.bundleDigest,
          plannedInstructionBindingDigest: taskInstructionBinding.bindingDigest,
          modelLockId: selection.resolvedModelLock.lockId,
          toolLockIds: selection.toolLocks.map((lock) => lock.lockId),
          reasoningModeLockId: selection.reasoningModeLock.reasoningModeLockId,
          durableAcceptanceRevision: plan.planDigest,
          acceptanceReceiptIdentity: command.commandId,
        },
        capabilityLockIds: capabilityLocks.map((lock) => lock.lockId),
        internalUserMessageId: userMessageId,
        internalTaskId: taskId,
        internalRuntimeSelectionId: runtimeSelectionId,
        initialCheckpointId: checkpointId,
        status: "accepted",
        createdAt: acceptedAt,
        updatedAt: acceptedAt,
      });
      return {
        ok: true,
        value: {
          task,
          envelope: createR2D3CoordinationEnvelopeV1({
            record,
            acceptedPlan: plan,
          }),
        },
      };
    } catch {
      return fail("r2d.acceptance_plan_invalid", "任务运行配置无法验证");
    } finally {
      if (acceptanceLeaseId !== undefined) {
        await this.#authority.releaseAcceptanceLease?.({ acceptanceLeaseId });
      }
    }
  }

  async prepareDfi543(input: Readonly<{
    command: SubmitTurnCommandV1Alpha5;
    requestDigest: string;
    internalSessionId: string;
  }>): Promise<PreparedDfi543FirstAcceptResult> {
    let acceptanceLeaseId: string | undefined;
    try {
      if (this.#reasoningPlannerV1Alpha2 === undefined) {
        throw new Error("DFI-5.4.3 reasoning planner is unavailable");
      }
      const command = SubmitTurnCommandV1Alpha5Schema.parse(input.command);
      const common = await this.#prepareResourceKernel(command, input.internalSessionId);
      acceptanceLeaseId = common.acceptanceLeaseId;
      const reasoning = await this.#reasoningPlannerV1Alpha2.plan({
        reasoningPreference: command.selectionRequest.reasoningPreference,
        taskId: common.taskId,
        reasoningModeLockId: common.reasoningModeLockId,
        lockedAt: common.acceptedAt,
        modelLock: common.modelLock,
        candidateAuthority: isPersonalModelLock(common.modelLock)
          ? "local_personal"
          : "central_enterprise",
        ...(common.personalOwnerAuthority === undefined
          ? {}
          : { personalOwnerAuthority: common.personalOwnerAuthority }),
      });
      if (!reasoning.ok) return reasoning;
      const selection = createTaskRuntimeSelectionV1Alpha4({
        schemaVersion: "v1alpha4",
        runtimeSelectionId: common.runtimeSelectionId,
        taskId: common.taskId,
        agent: exactAgentRef(common.exactAgent),
        agentResourceDecisionDigest: common.decision.decisionDigest,
        resourceEntitlementSnapshotDigest: common.entitlement.snapshotDigest,
        modelSelectionSource: common.decision.modelSelectionSource,
        ...(common.decision.requestedModelId === undefined
          ? {}
          : { requestedModelId: common.decision.requestedModelId }),
        resolvedModelLock: lockRef(common.modelLock),
        activeSkillRevisions: common.decision.activeSkillRefs,
        toolLocks: common.capabilityLocks.slice(1).map(lockRef),
        knowledgeRevisions: common.decision.knowledgeRefs,
        reasoningModeLock: reasoning.lock,
        ...(command.selectionRequest.workspaceGrantId === undefined
          ? {}
          : { workspaceGrantId: command.selectionRequest.workspaceGrantId }),
        platformPromptRevision: this.#platformPromptRevision,
        registryRevision: common.registry.registryRevision,
        ...(this.#enterpriseConfigRevision === undefined
          ? {}
          : { enterpriseConfigRevision: this.#enterpriseConfigRevision }),
        createdAt: common.acceptedAt,
      });
      const policy = await this.#authorizationPolicies.loadSnapshot();
      const authorization = this.#authorization.resolve({
        taskId: common.taskId,
        runtimeSelection: selection,
        authorization: { kind: "explicit",
          preference: command.selectionRequest.authorizationPreference },
        policySnapshot: policy,
        createdAt: common.acceptedAt,
      });
      if (!authorization.ok) return authorization;
      const timeout = createModelInvocationTimeoutMaterial({
        policy: LOCAL_PERSONAL_MODEL_TIMEOUT_POLICY_V1,
        invocationStartedAt: common.acceptedAt,
      });
      const taskDeadlineAt = isPersonalModelLock(common.modelLock)
        ? timeout.invocationDeadlineAt
        : enterpriseAgentTurnDeadlineAt(common.acceptedAt);
      const task = createInitialPersistedTask({
        taskId: common.taskId,
        sessionId: input.internalSessionId,
        agentDefinition: {
          agentDefinitionId: common.exactAgent.agentDefinitionId,
          version: common.exactAgent.revision,
        },
        goal: command.userInput,
        createdAt: common.acceptedAt,
        deadlineAt: taskDeadlineAt,
      }, common.checkpointId);
      const bindingMaterial = {
        submitTurnCommandId: command.commandId,
        userMessageId: common.userMessageId,
        task,
        capabilityLocks: [...common.capabilityLocks],
        runtimeSelection: selection,
        committedAt: common.acceptedAt,
      };
      const submitTurnBinding = TaskSubmitTurnBindingSchema.parse({
        schemaVersion: "v1alpha1",
        submitTurnCommandId: command.commandId,
        taskId: common.taskId,
        userMessageId: common.userMessageId,
        runtimeSelectionId: common.runtimeSelectionId,
        bundleDigest: sha256CanonicalJson(JsonValueSchema.parse(bindingMaterial)),
        committedAt: common.acceptedAt,
      });
      const taskInstructionBinding =
        deriveTaskInstructionBindingV1FromValidatedSelectionV1Alpha4({
          runtimeSelection: selection,
          submitTurnBundleDigest: submitTurnBinding.bundleDigest,
        });
      const bundle: Dfi541SubmitTurnTaskBundle = {
        ...bindingMaterial,
        selection: authorization.selection,
        executionIdentity: authorization.executionIdentity,
        submitTurnBinding,
        taskInstructionBinding,
        admissionEvidence: reasoning.admissionEvidence,
        ...(reasoning.resolutionEvidence === undefined
          ? {}
          : { resolutionEvidence: reasoning.resolutionEvidence }),
      };
      const plan = createDurableDfi541AcceptancePlanV1({
        schemaVersion: "v1",
        submitTurnCommandId: command.commandId,
        internalTaskId: common.taskId,
        userMessageId: common.userMessageId,
        requestDigest: input.requestDigest,
        runtimeSelection: selection,
        taskInstructionBinding,
        admissionEvidence: reasoning.admissionEvidence,
        ...(reasoning.resolutionEvidence === undefined
          ? {}
          : { resolutionEvidence: reasoning.resolutionEvidence }),
        recoveryMaterial: JsonValueSchema.parse(bundle),
        invocationDeadlineAt: timeout.invocationDeadlineAt,
        acceptedAt: common.acceptedAt,
      });
      const resolutionRef = reasoning.resolutionEvidence === undefined
        ? undefined
        : resolutionEvidenceRef(reasoning.resolutionEvidence);
      const record = SubmitTurnRecordV1Alpha5Schema.parse({
        schemaVersion: "v1alpha5",
        transportContractVersion: "v1alpha5",
        submitTurnCommandId: command.commandId,
        clientTurnId: command.clientTurnId,
        desktopSessionId: command.sessionId,
        internalSessionId: input.internalSessionId,
        requestDigest: input.requestDigest,
        selectionRequest: command.selectionRequest,
        lockedAgent: selection.agent,
        registryRevision: selection.registryRevision,
        platformPromptRevision: selection.platformPromptRevision,
        plannedSelectionDigest: selection.selectionDigest,
        authorizationPlan: {
          requestedMode: authorization.selection.requestedMode,
          resolvedMode: authorization.selection.resolvedMode,
          policyRevision: authorization.selection.policyRevision,
          source: authorization.selection.source,
          authorizationSelectionDigest:
            authorization.selection.authorizationSelectionDigest,
          executionSelectionDigest:
            authorization.executionIdentity.executionSelectionDigest,
        },
        reasoningPlan: {
          reasoningModeLock: reasoning.lock,
          plannedRuntimeSelectionDigest: selection.selectionDigest,
          ...(resolutionRef === undefined ? {} : { resolutionEvidence: resolutionRef }),
          admissionEvidence: reasoning.admissionEvidence,
        },
        resourcePlan: {
          resourceEntitlementSnapshotDigest: common.entitlement.snapshotDigest,
          agentResourceDecisionDigest: common.decision.decisionDigest,
          plannedRuntimeSelectionDigest: selection.selectionDigest,
          authorizationSelectionDigest:
            authorization.selection.authorizationSelectionDigest,
          executionSelectionDigest:
            authorization.executionIdentity.executionSelectionDigest,
          plannedTaskBundleDigest: submitTurnBinding.bundleDigest,
          plannedInstructionBindingDigest: taskInstructionBinding.bindingDigest,
          modelLockId: selection.resolvedModelLock.lockId,
          toolLockIds: selection.toolLocks.map((lock) => lock.lockId),
          reasoningModeLockId: reasoning.lock.reasoningModeLockId,
          durableAcceptanceRevision: plan.planDigest,
          acceptanceReceiptIdentity: command.commandId,
          ...(resolutionRef === undefined ? {} : {
            reasoningResolutionEvidenceDigest:
              resolutionRef.resolutionEvidenceDigest,
          }),
          ...(reasoning.admissionEvidence.state !== "admitted" ? {} : {
            admissionMaterializationDigest:
              reasoning.admissionEvidence.materializationDigest,
          }),
        },
        capabilityLockIds: common.capabilityLocks.map((lock) => lock.lockId),
        internalUserMessageId: common.userMessageId,
        internalTaskId: common.taskId,
        internalRuntimeSelectionId: common.runtimeSelectionId,
        initialCheckpointId: common.checkpointId,
        status: "accepted",
        createdAt: common.acceptedAt,
        updatedAt: common.acceptedAt,
      });
      return { ok: true, value: { bundle,
        envelope: createDfi541CoordinationEnvelopeV1({ record, acceptedPlan: plan }) } };
    } catch {
      return { ok: false, error: { code: "dfi543.acceptance_plan_invalid",
        category: "configuration", message: "任务运行配置无法验证", retryable: false } };
    } finally {
      if (acceptanceLeaseId !== undefined) {
        await this.#authority.releaseAcceptanceLease?.({ acceptanceLeaseId });
      }
    }
  }

  async #loadExactAgent(agentId: string): Promise<R2D3ExactAgent> {
    const agent = agentId === "agent.general"
      ? this.#builtInAgent.loadDefault()
      : await this.#authority.loadExactAgent(agentId);
    if (agent === undefined || agent.schemaVersion !== "v1alpha2"
      || agent.agentDefinitionId !== agentId) {
      throw new Error("Agent is unavailable");
    }
    return agent;
  }

  async #prepareResourceKernel(
    command: SubmitTurnCommandV1Alpha3 | SubmitTurnCommandV1Alpha5,
    internalSessionId: string,
  ) {
    const acceptedAt = this.#clock.now();
    const taskId = this.#ids.next();
    const userMessageId = this.#ids.next();
    const runtimeSelectionId = this.#ids.next();
    const checkpointId = this.#ids.next();
    const reasoningModeLockId = this.#ids.next();
    const preallocatedDeliveryId = this.#ids.next();
    const exactAgent = await this.#loadExactAgent(command.selectionRequest.agentId);
    const subject = await this.#authority.captureSubjectBindings({
      desktopSessionId: command.sessionId,
      internalSessionId,
    });
    const entitlement = await this.#entitlements.loadExact({
      acceptanceLeaseId: subject.acceptanceLeaseId,
      verifiedRuntimeSubjectBindingDigest: subject.verifiedRuntimeSubjectBindingDigest,
      acceptedClientBindingDigest: subject.acceptedClientBindingDigest,
      requestedAgentRef: exactAgentRef(exactAgent),
    });
    const registry = await this.#authority.captureRegistrySnapshot({
      acceptanceLeaseId: subject.acceptanceLeaseId,
    });
    const workspaceFacts = await this.#authority.captureWorkspaceAndAuthorizationFacts({
      acceptanceLeaseId: subject.acceptanceLeaseId,
      ...(command.selectionRequest.workspaceGrantId === undefined
        ? {}
        : { workspaceGrantId: command.selectionRequest.workspaceGrantId }),
    });
    const selectedSkillRefs = selectExactRefs(command.selectionRequest.selectedSkillIds,
      entitlement.skills, (entry) => entry.skillId).map((reference) => ({
      skillId: reference.skillId,
      revision: reference.revision,
      contentDigest: reference.contentDigest,
    }));
    const selectedKnowledgeRefs = selectExactRefs(
      command.selectionRequest.selectedKnowledgeIds, entitlement.knowledge,
      (entry) => entry.knowledgeId).map((reference) => ({
      knowledgeId: reference.knowledgeId,
      revision: reference.revision,
      contentDigest: reference.contentDigest,
    }));
    const preference = command.selectionRequest.requestedModelId === undefined
      ? await this.#authority.loadExactUserModelPreference({
        acceptanceLeaseId: subject.acceptanceLeaseId,
      })
      : undefined;
    const toolCandidates = await this.#toolPolicy.resolveExact({
      exactAgent, selectedSkillRefs, entitlementSnapshot: entitlement,
      registryRevision: registry.registryRevision,
      workspaceAndAuthorizationFactsDigest: workspaceFacts.factsDigest,
    });
    const decision = this.#decisionPlanner.plan({
      taskId, exactAgent, exactEntitlementSnapshot: entitlement,
      acceptedSelectionRequest: {
        ...(command.selectionRequest.requestedModelId === undefined
          ? {}
          : { requestedModelId: command.selectionRequest.requestedModelId }),
        selectedSkillRefs, selectedKnowledgeRefs,
      },
      ...(preference === undefined ? {} : { exactUserModelPreference: preference }),
      registrySnapshot: registry,
      workspaceAndAuthorizationFacts: workspaceFacts,
      taskToolCandidates: toolCandidates,
    });
    const orderedLockIds = Array.from(
      { length: 1 + decision.toolCandidateRefs.length }, () => this.#ids.next());
    const capabilityLocks = await this.#authority.prepareExactCapabilityLocks({
      acceptanceLeaseId: subject.acceptanceLeaseId, taskId, decision,
      registrySnapshot: registry, orderedLockIds, lockedAt: acceptedAt,
    });
    validateExactLocks(capabilityLocks, decision, orderedLockIds);
    const personalOwnerAuthority = await this.#authority.loadPersonalOwnerAuthority?.({
      acceptanceLeaseId: subject.acceptanceLeaseId,
    });
    return { acceptedAt, taskId, userMessageId, runtimeSelectionId, checkpointId,
      reasoningModeLockId, preallocatedDeliveryId, exactAgent, subject, entitlement,
      registry, decision, capabilityLocks, modelLock: capabilityLocks[0]!,
      acceptanceLeaseId: subject.acceptanceLeaseId, personalOwnerAuthority };
  }
}

function exactAgentRef(agent: R2D3ExactAgent) {
  return {
    agentDefinitionId: agent.agentDefinitionId,
    revision: agent.revision,
    digest: agent.digest,
  };
}

function selectExactRefs<T>(
  ids: readonly string[],
  refs: readonly T[],
  idOf: (value: T) => string,
): T[] {
  return ids.map((id) => {
    const match = refs.find((ref) => idOf(ref) === id);
    if (match === undefined) throw new Error("Requested resource is not entitled");
    return structuredClone(match);
  });
}

function validateExactLocks(
  locks: readonly TaskCapabilityLock[],
  decision: Readonly<{
    resolvedModelRef: Readonly<{ modelId: string; revision: string }>;
    toolCandidateRefs: readonly Readonly<{
      capabilityId: string;
      capabilityRevision: string;
    }>[];
  }>,
  orderedLockIds: readonly string[],
): void {
  const expected = [
    { id: decision.resolvedModelRef.modelId, revision: decision.resolvedModelRef.revision },
    ...decision.toolCandidateRefs.map((ref) => ({
      id: ref.capabilityId,
      revision: ref.capabilityRevision,
    })),
  ];
  if (locks.length !== expected.length || locks.some((lock, index) =>
    lock.lockId !== orderedLockIds[index]
    || lock.definitionSnapshot.capabilityId !== expected[index]?.id
    || lock.definitionSnapshot.revision !== expected[index]?.revision)) {
    throw new Error("Prepared capability locks do not match the exact decision");
  }
}

function lockRef(lock: TaskCapabilityLock) {
  return {
    lockId: lock.lockId,
    capabilityId: lock.definitionSnapshot.capabilityId,
    lockDigest: sha256CanonicalJson(JsonValueSchema.parse(lock)),
  };
}

function fail(code: string, message: string): PreparedR2D3FirstAcceptResult {
  return {
    ok: false,
    error: { code, category: "validation", message, retryable: false },
  };
}
