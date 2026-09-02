import {
  JsonValueSchema,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import type { Clock } from "../ports/clock.js";
import type { EnterpriseIdentityScope } from
  "../ports/enterprise-access-token-provider.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { R2D3AcceptanceAuthority } from
  "../ports/r2d3-acceptance-authority.js";
import type { TaskAuthorizationModePolicyProvider } from
  "../ports/task-authorization-mode-policy.js";
import type {
  TaskResourceEntitlementLoadInput,
} from "../ports/task-resource-entitlement-source.js";
import type { TaskToolCandidatePolicy } from
  "../ports/task-tool-candidate-policy.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type { TaskCapabilityLockService } from
  "./task-capability-lock-service.js";
import {
  AgentResourceDecisionPlanner,
  AgentResourceRegistrySnapshotV1Schema,
  type AgentResourceRegistrySnapshotV1,
  type ExactResourcePermissionsV1,
} from "./agent-resource-decision-planner.js";
import type {
  PortableAgentModelRestrictionRef,
  PortableAgentSkillRestrictionRef,
  PortableAgentToolRestrictionRef,
  ReadableAgentDefinitionRevision,
} from
  "./agent-definition-v1alpha2.js";
import {
  BUILT_IN_GENERAL_AGENT_ID,
  BuiltInGeneralAgentSource,
} from "./built-in-general-agent-source.js";
import {
  BUILT_IN_PRESENTATION_AGENT_ID,
  type BuiltInPresentationAgentSource,
} from "./built-in-presentation-agent-source.js";
import {
  BUILT_IN_SKILL_CREATOR_AGENT_ID,
  type BuiltInSkillCreatorAgentSource,
} from "./built-in-skill-creator-agent-source.js";
import {
  LocalDesktopR2DSubjectBindingAuthority,
  LocalDesktopR2DSubjectProofRegistry,
  type LocalDesktopR2DSessionBindingVerifier,
} from "./local-desktop-r2d-production.js";
import { R2D3DurableAcceptancePlanner } from
  "./r2d3-durable-acceptance-planner.js";
import type { ReasoningModeLockPlanner } from
  "./reasoning-mode-lock-planner.js";
import type { ReasoningModeLockPlannerV1Alpha2 } from
  "./reasoning-mode-lock-planner-v1alpha2.js";
import type { ReadableAgentDefinitionRepository } from
  "../ports/readable-agent-definition-repository.js";

type AdditionalEnterpriseAgentSource = ReadableAgentDefinitionRepository & Readonly<{
  loadActiveAgent(agentDefinitionId: string): Promise<ReadableAgentDefinitionRevision | undefined>;
}>;
import type { platformPromptRevisionForNewTask } from
  "./task-locked-instruction-runtime.js";
import {
  createInternalTrialEntitlementSnapshot,
  type InternalTrialEntitlementSnapshot,
  type InternalTrialResourceDecision,
} from "./task-resource-entitlement.js";

const AUTHORITY_REVISION_DOMAIN =
  "robothree.internal-trial-enterprise-entitlement-authority.v1" as const;

type Lease = Readonly<{
  registry: AgentResourceRegistrySnapshotV1;
  permissions: ExactResourcePermissionsV1;
  model: PortableAgentModelRestrictionRef;
  skills: readonly PortableAgentSkillRestrictionRef[];
  tools: readonly PortableAgentToolRestrictionRef[];
}>;

class InternalTrialEnterpriseLeaseRegistry {
  readonly #leases = new Map<string, Lease>();

  put(acceptanceLeaseId: string, lease: Lease): void {
    if (this.#leases.has(acceptanceLeaseId)) {
      throw new Error("selection.entitlement_stale");
    }
    this.#leases.set(acceptanceLeaseId, lease);
  }

  get(acceptanceLeaseId: string): Lease {
    const lease = this.#leases.get(acceptanceLeaseId);
    if (lease === undefined) throw new Error("selection.entitlement_stale");
    return lease;
  }

  close(acceptanceLeaseId: string): void {
    this.#leases.delete(acceptanceLeaseId);
  }
}

class InternalTrialEnterpriseEntitlementSource {
  constructor(private readonly dependencies: Readonly<{
    clock: Clock;
    proofs: LocalDesktopR2DSubjectProofRegistry;
    leases: InternalTrialEnterpriseLeaseRegistry;
    builtInAgent: BuiltInGeneralAgentSource;
    presentationAgent?: BuiltInPresentationAgentSource;
    skillCreatorAgent?: BuiltInSkillCreatorAgentSource;
    additionalAgents?: AdditionalEnterpriseAgentSource;
    authorityRevision: string;
    registry: AgentResourceRegistrySnapshotV1;
    permissions: ExactResourcePermissionsV1;
    model: PortableAgentModelRestrictionRef;
    skills: readonly PortableAgentSkillRestrictionRef[];
    tools: readonly PortableAgentToolRestrictionRef[];
  }>) {}

  async loadExact(
    input: TaskResourceEntitlementLoadInput,
  ): Promise<InternalTrialEntitlementSnapshot> {
    const proof = this.dependencies.proofs.consume(input);
    const agent = input.requestedAgentRef.agentDefinitionId
      === BUILT_IN_GENERAL_AGENT_ID
      ? this.dependencies.builtInAgent.loadDefault()
      : input.requestedAgentRef.agentDefinitionId === BUILT_IN_PRESENTATION_AGENT_ID
        ? this.dependencies.presentationAgent?.loadDefault()
        : input.requestedAgentRef.agentDefinitionId === BUILT_IN_SKILL_CREATOR_AGENT_ID
          ? this.dependencies.skillCreatorAgent?.loadDefault()
        : await this.dependencies.additionalAgents?.loadExactAgent(
          input.requestedAgentRef.agentDefinitionId,
          input.requestedAgentRef.revision,
        );
    if (agent === undefined
      || input.requestedAgentRef.revision !== agent.revision
      || input.requestedAgentRef.digest !== agent.digest) {
      throw new Error("selection.entitlement_invalid");
    }
    this.dependencies.leases.put(input.acceptanceLeaseId, Object.freeze({
      registry: this.dependencies.registry,
      permissions: this.dependencies.permissions,
      model: this.dependencies.model,
      skills: this.dependencies.skills,
      tools: this.dependencies.tools,
    }));
    return createInternalTrialEntitlementSnapshot({
      schemaVersion: "v1",
      subjectBindingDigest: proof.verifiedRuntimeSubjectBindingDigest,
      authorityKind: "runtime_active_enterprise_identity",
      authorityRevision: this.dependencies.authorityRevision,
      observedAt: this.dependencies.clock.now(),
      models: [{ ...this.dependencies.model, stableOrdinal: 0 }],
      skills: this.dependencies.skills.map((skill, stableOrdinal) => ({
        ...skill,
        stableOrdinal,
      })),
      tools: this.dependencies.tools.map((tool, stableOrdinal) => ({
        ...tool,
        stableOrdinal,
      })),
      knowledge: [],
      identityEvidence: {
        testIdentityUsed: false,
        productionIdentityReady: false,
      },
    });
  }
}

class InternalTrialEnterpriseAcceptanceAuthority
implements R2D3AcceptanceAuthority {
  constructor(private readonly dependencies: Readonly<{
    subjectBindings: LocalDesktopR2DSubjectBindingAuthority;
    leases: InternalTrialEnterpriseLeaseRegistry;
    modelLocks: TaskCapabilityLockService;
    presentationAgent?: BuiltInPresentationAgentSource;
    skillCreatorAgent?: BuiltInSkillCreatorAgentSource;
    additionalAgents?: AdditionalEnterpriseAgentSource;
  }>) {}

  async loadExactAgent(
    agentId: string,
  ): Promise<ReadableAgentDefinitionRevision | undefined> {
    if (agentId === BUILT_IN_PRESENTATION_AGENT_ID) {
      return this.dependencies.presentationAgent?.loadDefault();
    }
    if (agentId === BUILT_IN_SKILL_CREATOR_AGENT_ID) {
      return this.dependencies.skillCreatorAgent?.loadDefault();
    }
    return this.dependencies.additionalAgents?.loadActiveAgent(agentId);
  }

  captureSubjectBindings(input: Readonly<{
    desktopSessionId: string;
    internalSessionId: string;
  }>) {
    return this.dependencies.subjectBindings.capture(input);
  }

  async captureRegistrySnapshot(input: Readonly<{ acceptanceLeaseId: string }>) {
    return structuredClone(this.dependencies.leases.get(input.acceptanceLeaseId).registry);
  }

  async captureWorkspaceAndAuthorizationFacts(
    input: Readonly<{ acceptanceLeaseId: string; workspaceGrantId?: string }>,
  ) {
    return structuredClone(
      this.dependencies.leases.get(input.acceptanceLeaseId).permissions,
    );
  }

  async loadExactUserModelPreference(
    _input: Readonly<{ acceptanceLeaseId: string }>,
  ) {
    return undefined;
  }

  async prepareExactCapabilityLocks(input: Readonly<{
    acceptanceLeaseId: string;
    taskId: string;
    decision: InternalTrialResourceDecision;
    registrySnapshot: AgentResourceRegistrySnapshotV1;
    orderedLockIds: readonly string[];
    lockedAt: string;
  }>): Promise<readonly TaskCapabilityLock[]> {
    const lease = this.dependencies.leases.get(input.acceptanceLeaseId);
    if (input.orderedLockIds.length !== 1 + input.decision.toolCandidateRefs.length
      || input.decision.resolvedModelRef.modelId !== lease.model.modelId
      || input.decision.resolvedModelRef.revision !== lease.model.revision
      || input.decision.resolvedModelRef.digest !== lease.model.digest
      || input.registrySnapshot.registryRevision !== lease.registry.registryRevision) {
      throw new Error("selection.entitlement_invalid");
    }
    const prepared = this.dependencies.modelLocks.prepare({
      taskId: input.taskId,
      registryRevision: input.registrySnapshot.registryRevision,
      capabilityId: lease.model.modelId,
      lockId: input.orderedLockIds[0]!,
      lockedAt: input.lockedAt,
    });
    if (prepared.lock.definitionSnapshot.revision !== lease.model.revision) {
      throw new Error("selection.model_unavailable");
    }
    const toolLocks = input.decision.toolCandidateRefs.map((reference, index) => {
      const exactTool = lease.tools.find((tool) =>
        reference.capabilityId === tool.capabilityId
        && reference.capabilityRevision === tool.capabilityRevision);
      if (exactTool === undefined) {
        throw new Error("selection.tool_policy_unavailable");
      }
      return this.dependencies.modelLocks.prepare({
        taskId: input.taskId,
        registryRevision: input.registrySnapshot.registryRevision,
        capabilityId: reference.capabilityId,
        lockId: input.orderedLockIds[index + 1]!,
        lockedAt: input.lockedAt,
      }).lock;
    });
    return Object.freeze([prepared.lock, ...toolLocks]);
  }

  releaseAcceptanceLease(input: Readonly<{ acceptanceLeaseId: string }>): void {
    this.dependencies.leases.close(input.acceptanceLeaseId);
  }
}

export function createInternalTrialEnterpriseR2DProductionComposition(
  input: Readonly<{
    clock: Clock;
    ids: IdGenerator;
    sessionBindingVerifier: LocalDesktopR2DSessionBindingVerifier;
    identityScope: EnterpriseIdentityScope;
    registry: AgentResourceRegistrySnapshotV1;
    model: PortableAgentModelRestrictionRef;
    skill?: PortableAgentSkillRestrictionRef;
    skills?: readonly PortableAgentSkillRestrictionRef[];
    tools?: readonly PortableAgentToolRestrictionRef[];
    presentationAgent?: BuiltInPresentationAgentSource;
    skillCreatorAgent?: BuiltInSkillCreatorAgentSource;
    additionalAgents?: AdditionalEnterpriseAgentSource;
    modelLocks: TaskCapabilityLockService;
    toolPolicy: TaskToolCandidatePolicy;
    reasoningPlanner: ReasoningModeLockPlanner;
    reasoningPlannerV1Alpha2: ReasoningModeLockPlannerV1Alpha2;
    authorizationPolicies: TaskAuthorizationModePolicyProvider;
    enterpriseConfigRevision: string;
    platformPromptRevision?: ReturnType<typeof platformPromptRevisionForNewTask>;
  }>,
) {
  const registry = Object.freeze(AgentResourceRegistrySnapshotV1Schema.parse(
    input.registry,
  ));
  const permissionsMaterial = {
    schemaVersion: "v1" as const,
    models: [input.model],
    skills: [...(input.skill === undefined ? [] : [input.skill]), ...(input.skills ?? [])],
    tools: [...(input.tools ?? [])],
    knowledge: [],
  };
  const permissions = Object.freeze({
    ...permissionsMaterial,
    factsDigest: sha256CanonicalJson(JsonValueSchema.parse({
      domain: "robothree.internal-trial-enterprise-permissions.v1",
      material: permissionsMaterial,
    })),
  });
  const authorityRevision = sha256CanonicalJson(JsonValueSchema.parse({
    domain: AUTHORITY_REVISION_DOMAIN,
    scope: input.identityScope,
  }));
  const builtInAgent = new BuiltInGeneralAgentSource();
  const proofs = new LocalDesktopR2DSubjectProofRegistry();
  const leases = new InternalTrialEnterpriseLeaseRegistry();
  const subjectBindings = new LocalDesktopR2DSubjectBindingAuthority({
    clock: input.clock,
    ids: input.ids,
    verifier: input.sessionBindingVerifier,
    proofs,
  });
  const entitlements = new InternalTrialEnterpriseEntitlementSource({
    clock: input.clock,
    proofs,
    leases,
    builtInAgent,
    authorityRevision,
    registry,
    permissions,
    model: input.model,
    tools: input.tools ?? [],
    skills: permissions.skills,
    ...(input.presentationAgent === undefined
      ? {}
      : { presentationAgent: input.presentationAgent }),
    ...(input.skillCreatorAgent === undefined
      ? {}
      : { skillCreatorAgent: input.skillCreatorAgent }),
    ...(input.additionalAgents === undefined
      ? {}
      : { additionalAgents: input.additionalAgents }),
  });
  const authority = new InternalTrialEnterpriseAcceptanceAuthority({
    subjectBindings,
    leases,
    modelLocks: input.modelLocks,
    ...(input.presentationAgent === undefined
      ? {}
      : { presentationAgent: input.presentationAgent }),
    ...(input.skillCreatorAgent === undefined
      ? {}
      : { skillCreatorAgent: input.skillCreatorAgent }),
    ...(input.additionalAgents === undefined
      ? {}
      : { additionalAgents: input.additionalAgents }),
  });
  const planner = new R2D3DurableAcceptancePlanner({
    clock: input.clock,
    ids: input.ids,
    authority,
    entitlements,
    toolPolicy: input.toolPolicy,
    decisionPlanner: new AgentResourceDecisionPlanner(),
    builtInAgent,
    reasoningPlanner: input.reasoningPlanner,
    reasoningPlannerV1Alpha2: input.reasoningPlannerV1Alpha2,
    authorizationPolicies: input.authorizationPolicies,
    enterpriseConfigRevision: input.enterpriseConfigRevision,
    ...(input.platformPromptRevision === undefined
      ? {}
      : { platformPromptRevision: input.platformPromptRevision }),
  });
  return Object.freeze({ enabled: true as const, planner, authority, entitlements });
}
