import {
  EntityIdSchema,
  JsonValueSchema,
  Sha256DigestSchema,
  type TaskCapabilityLock,
} from "@robothree/contracts";
import type { AgentModelRestrictionRefV1Alpha2 } from
  "@robothree/contracts/runtime-selection/agent-definition/v1alpha2";
import { z } from "zod";

import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { PersonalCredentialStore } from "../ports/personal-credential-store.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";
import type { R2D3AcceptanceAuthority } from
  "../ports/r2d3-acceptance-authority.js";
import type { TaskAuthorizationModePolicyProvider } from
  "../ports/task-authorization-mode-policy.js";
import type {
  TaskResourceEntitlementLoadInput,
  TaskResourceEntitlementSource,
} from "../ports/task-resource-entitlement-source.js";
import type { TaskToolCandidatePolicy } from
  "../ports/task-tool-candidate-policy.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import {
  AgentResourceDecisionPlanner,
  AgentResourceRegistrySnapshotV1Schema,
  type AgentResourceRegistrySnapshotV1,
  type ExactResourcePermissionsV1,
} from "./agent-resource-decision-planner.js";
import type { ReadableAgentDefinitionRevision } from
  "./agent-definition-v1alpha2.js";
import {
  BUILT_IN_GENERAL_AGENT_ID,
  BuiltInGeneralAgentSource,
} from "./built-in-general-agent-source.js";
import {
  deriveLocalDesktopSubjectAuthority,
  validateLocalDesktopSubjectAuthority,
  type LocalDesktopSubjectAuthorityV1,
} from "./local-desktop-subject-authority.js";
import {
  validatePersonalModelDefinition,
  validatePersonalModelHead,
  validatePersonalModelPreference,
  validatePersonalModelStatusFact,
  type PersonalModelDefinition,
  type PersonalModelOwnerNamespace,
} from "./personal-model-domain.js";
import { PersonalModelProviderProfileRegistry } from
  "./personal-model-provider-profile.js";
import {
  materializePersonalModelRegistryFacts,
  PersonalModelTaskLockMaterializer,
} from "./personal-model-task-lock.js";
import {
  R2D3_CORE_DELTA_DEFAULT_ENABLED,
  R2D3DurableAcceptancePlanner,
} from "./r2d3-durable-acceptance-planner.js";
import type { ReasoningModeLockPlanner } from "./reasoning-mode-lock-planner.js";
import type { ReasoningModeLockPlannerV1Alpha2 } from
  "./reasoning-mode-lock-planner-v1alpha2.js";
import {
  createTaskResourceEntitlementSnapshotV2,
  type AgentResourceDecisionV1,
  type EntitledToolRefV1,
  type TaskResourceEntitlementSnapshotV2,
} from "./task-resource-entitlement.js";

export const LOCAL_DESKTOP_R2D_SUBJECT_PROOF_DIGEST_DOMAIN =
  "robothree.local-desktop-r2d-subject-proof.v1\n" as const;
export const LOCAL_DESKTOP_R2D_REGISTRY_REVISION_DOMAIN =
  "robothree.local-desktop-r2d-registry.v1\n" as const;
export const LOCAL_DESKTOP_R2D_PERMISSION_FACTS_DOMAIN =
  "robothree.local-desktop-r2d-permissions.v1\n" as const;
export const R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED = false as const;

const SubjectProofMaterialSchema = z.object({
  schemaVersion: z.literal("v1"),
  acceptanceLeaseId: EntityIdSchema,
  verifiedRuntimeSubjectBindingDigest: Sha256DigestSchema,
  acceptedClientBindingDigest: Sha256DigestSchema,
  issuedAt: z.string().datetime(),
}).strict();

export const LocalDesktopR2DSubjectBindingProofV1Schema =
  SubjectProofMaterialSchema.extend({
    proofDigest: Sha256DigestSchema,
  }).strict();

export type LocalDesktopR2DSubjectBindingProofV1 = z.infer<
  typeof LocalDesktopR2DSubjectBindingProofV1Schema
>;

export interface LocalDesktopR2DSessionBindingVerifier {
  verifyExact(input: Readonly<{
    desktopSessionId: string;
    internalSessionId: string;
  }>): Promise<Readonly<{
    verifiedRuntimeSubjectBindingDigest: string;
    acceptedClientBindingDigest: string;
  }>>;
}

export class LocalDesktopR2DSubjectProofRegistry {
  readonly #proofs = new Map<string, LocalDesktopR2DSubjectBindingProofV1>();

  register(proof: LocalDesktopR2DSubjectBindingProofV1): void {
    const parsed = validateSubjectProof(proof);
    if (this.#proofs.has(parsed.acceptanceLeaseId)) {
      throw new LocalDesktopR2DProductionError("selection.subject_binding_invalid");
    }
    this.#proofs.set(parsed.acceptanceLeaseId, parsed);
  }

  consume(input: Readonly<{
    acceptanceLeaseId: string;
    verifiedRuntimeSubjectBindingDigest: string;
    acceptedClientBindingDigest: string;
  }>): LocalDesktopR2DSubjectBindingProofV1 {
    const proof = this.#proofs.get(EntityIdSchema.parse(input.acceptanceLeaseId));
    this.#proofs.delete(input.acceptanceLeaseId);
    if (proof === undefined
      || proof.verifiedRuntimeSubjectBindingDigest
        !== input.verifiedRuntimeSubjectBindingDigest
      || proof.acceptedClientBindingDigest !== input.acceptedClientBindingDigest) {
      throw new LocalDesktopR2DProductionError("selection.subject_binding_invalid");
    }
    return proof;
  }
}

export class LocalDesktopR2DSubjectBindingAuthority {
  constructor(private readonly dependencies: Readonly<{
    clock: Clock;
    ids: IdGenerator;
    verifier: LocalDesktopR2DSessionBindingVerifier;
    proofs: LocalDesktopR2DSubjectProofRegistry;
  }>) {}

  async capture(input: Readonly<{
    desktopSessionId: string;
    internalSessionId: string;
  }>) {
    const verified = await this.dependencies.verifier.verifyExact(input);
    const material = SubjectProofMaterialSchema.parse({
      schemaVersion: "v1",
      acceptanceLeaseId: this.dependencies.ids.next(),
      verifiedRuntimeSubjectBindingDigest:
        verified.verifiedRuntimeSubjectBindingDigest,
      acceptedClientBindingDigest: verified.acceptedClientBindingDigest,
      issuedAt: this.dependencies.clock.now(),
    });
    const proof = Object.freeze(LocalDesktopR2DSubjectBindingProofV1Schema.parse({
      ...material,
      proofDigest: domainDigest(LOCAL_DESKTOP_R2D_SUBJECT_PROOF_DIGEST_DOMAIN, material),
    }));
    this.dependencies.proofs.register(proof);
    return Object.freeze({
      acceptanceLeaseId: proof.acceptanceLeaseId,
      verifiedRuntimeSubjectBindingDigest:
        proof.verifiedRuntimeSubjectBindingDigest,
      acceptedClientBindingDigest: proof.acceptedClientBindingDigest,
    });
  }
}

type LocalModelLease = Readonly<{
  namespace: PersonalModelOwnerNamespace;
  authority: LocalDesktopSubjectAuthorityV1;
  definitions: ReadonlyMap<string, PersonalModelDefinition>;
  registry: AgentResourceRegistrySnapshotV1;
  preference?: AgentModelRestrictionRefV1Alpha2;
}>;

export class LocalDesktopR2DResourceLeaseRegistry {
  readonly #leases = new Map<string, LocalModelLease>();

  put(acceptanceLeaseId: string, lease: LocalModelLease): void {
    const id = EntityIdSchema.parse(acceptanceLeaseId);
    if (this.#leases.has(id)) {
      throw new LocalDesktopR2DProductionError("selection.entitlement_stale");
    }
    this.#leases.set(id, lease);
  }

  get(acceptanceLeaseId: string): LocalModelLease {
    const lease = this.#leases.get(EntityIdSchema.parse(acceptanceLeaseId));
    if (lease === undefined) {
      throw new LocalDesktopR2DProductionError("selection.entitlement_stale");
    }
    return lease;
  }

  ownerAuthority(acceptanceLeaseId: string) {
    const authority = this.get(acceptanceLeaseId).authority;
    return Object.freeze({
      ownerIdentity: {
        ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
        ownerScopeDigest: authority.ownerScopeDigest,
      },
      mayConfigure: false as const,
      mayRevealSecret: false as const,
      mayDelete: false as const,
    });
  }

  close(acceptanceLeaseId: string): void {
    const lease = this.#leases.get(acceptanceLeaseId);
    this.#leases.delete(acceptanceLeaseId);
    lease?.namespace.namespaceKey.fill(0);
  }
}

export class LocalDesktopTaskResourceEntitlementSource
implements TaskResourceEntitlementSource {
  readonly #profiles: PersonalModelProviderProfileRegistry;

  constructor(private readonly dependencies: Readonly<{
    clock: Clock;
    persistence: PersonalModelPersistence;
    credentials: PersonalCredentialStore;
    proofs: LocalDesktopR2DSubjectProofRegistry;
    leases: LocalDesktopR2DResourceLeaseRegistry;
    builtInAgent: BuiltInGeneralAgentSource;
    captureBaseRegistrySnapshot(): Promise<AgentResourceRegistrySnapshotV1>;
  }>, profiles = new PersonalModelProviderProfileRegistry()) {
    this.#profiles = profiles;
  }

  async loadExact(
    input: TaskResourceEntitlementLoadInput,
  ): Promise<TaskResourceEntitlementSnapshotV2> {
    const proof = this.dependencies.proofs.consume(input);
    const builtIn = this.dependencies.builtInAgent.loadDefault();
    if (input.requestedAgentRef.agentDefinitionId !== BUILT_IN_GENERAL_AGENT_ID
      || input.requestedAgentRef.revision !== builtIn.revision
      || input.requestedAgentRef.digest !== builtIn.digest) {
      throw new LocalDesktopR2DProductionError("selection.entitlement_invalid");
    }
    const namespace = await this.dependencies.persistence.loadActiveOwnerNamespace();
    if (namespace === undefined) {
      throw new LocalDesktopR2DProductionError(
        "selection.local_authority_unavailable",
      );
    }
    const authority = validateLocalDesktopSubjectAuthority(
      namespace,
      deriveLocalDesktopSubjectAuthority(namespace),
    );
    const owner = {
      ownerScopeNamespaceRevision: authority.ownerScopeNamespaceRevision,
      ownerScopeDigest: authority.ownerScopeDigest,
    };
    const heads = await this.#listHeads(owner);
    const definitions = new Map<string, PersonalModelDefinition>();
    const models: Array<{
      modelId: string;
      revision: string;
      digest: string;
      stableOrdinal: number;
    }> = [];
    for (const [stableOrdinal, rawHead] of heads.entries()) {
      const head = validatePersonalModelHead(rawHead);
      if (head.selectionState !== "active") continue;
      const definition = await this.dependencies.persistence.loadDefinition(
        owner,
        head.personalModelId,
        head.currentConfigurationRevision,
      );
      const status = await this.dependencies.persistence.loadStatus(
        owner,
        head.personalModelId,
        head.currentConfigurationRevision,
      );
      if (definition === undefined || status === undefined) continue;
      let parsedDefinition: PersonalModelDefinition;
      try {
        parsedDefinition = validatePersonalModelDefinition(definition);
        const parsedStatus = validatePersonalModelStatusFact(status);
        requireExactCandidate(authority, head, parsedDefinition, parsedStatus);
        this.#profiles.resolve(
          parsedDefinition.providerKind,
          parsedDefinition.providerProfileRevision,
        );
        const observation = await this.dependencies.credentials.inspect(
          parsedDefinition.credentialRef,
        );
        if (observation.state !== "present"
          || observation.credentialRevision !== parsedDefinition.credentialRevision
          || observation.credentialBindingDigest
            !== parsedDefinition.credentialBindingDigest
          || !isSelectableStatus(parsedStatus.status)
          || !parsedDefinition.capabilities.includes("text")) continue;
        const facts = materializePersonalModelRegistryFacts(
          parsedDefinition,
          this.#profiles,
        );
        models.push({
          modelId: parsedDefinition.personalModelId,
          revision: facts.capability.revision,
          digest: facts.capability.revision,
          stableOrdinal,
        });
        definitions.set(parsedDefinition.personalModelId, parsedDefinition);
      } catch (error) {
        if (error instanceof LocalDesktopR2DProductionError) throw error;
        continue;
      }
    }
    const baseRegistry = AgentResourceRegistrySnapshotV1Schema.parse(
      await this.dependencies.captureBaseRegistrySnapshot(),
    );
    const registry = createRegistrySnapshot(baseRegistry, models, definitions);
    const preference = await this.#loadPreference(owner, models, definitions);
    await this.#revalidate(namespace, owner, heads);
    const tools: EntitledToolRefV1[] = baseRegistry.tools
      .filter((entry) => entry.available)
      .map((entry, stableOrdinal) => ({ ...entry.ref, stableOrdinal }));
    const snapshot = createTaskResourceEntitlementSnapshotV2({
      schemaVersion: "v2",
      subjectBindingDigest: proof.verifiedRuntimeSubjectBindingDigest,
      authorityKind: "local_desktop_owner",
      authorityRevision: authority.authorityRevision,
      observedAt: this.dependencies.clock.now(),
      models,
      skills: [],
      tools,
      knowledge: [],
      identityEvidence: {
        localAuthorityReady: true,
        enterpriseIdentityReady: false,
        testIdentityUsed: false,
      },
    });
    this.dependencies.leases.put(input.acceptanceLeaseId, {
      namespace: cloneNamespace(namespace),
      authority,
      definitions,
      registry,
      ...(preference === undefined ? {} : { preference }),
    });
    return snapshot;
  }

  async #listHeads(owner: Readonly<{
    ownerScopeNamespaceRevision: number;
    ownerScopeDigest: string;
  }>) {
    const heads = [];
    let cursor: string | undefined;
    let queryRevision: string | undefined;
    do {
      const page = await this.dependencies.persistence.listActiveHeads(owner, cursor, 32);
      if (!page.ok) {
        throw new LocalDesktopR2DProductionError("selection.entitlement_invalid");
      }
      if (queryRevision !== undefined && page.value.queryRevision !== queryRevision) {
        throw new LocalDesktopR2DProductionError("selection.entitlement_stale");
      }
      queryRevision = page.value.queryRevision;
      heads.push(...page.value.heads);
      if (heads.length > 64) {
        throw new LocalDesktopR2DProductionError("selection.entitlement_invalid");
      }
      cursor = page.value.nextCursor;
    } while (cursor !== undefined);
    return heads;
  }

  async #loadPreference(
    owner: Readonly<{ ownerScopeNamespaceRevision: number; ownerScopeDigest: string }>,
    models: readonly { modelId: string; revision: string; digest: string }[],
    definitions: ReadonlyMap<string, PersonalModelDefinition>,
  ) {
    const raw = await this.dependencies.persistence.loadPreference(owner);
    if (raw === undefined) return undefined;
    const preference = validatePersonalModelPreference(raw);
    if (preference.modelSource !== "personal"
      || preference.modelId === undefined
      || preference.configurationRevision === undefined) return undefined;
    const definition = definitions.get(preference.modelId);
    if (definition?.configurationRevision !== preference.configurationRevision) {
      return undefined;
    }
    const match = models.find((model) => model.modelId === preference.modelId);
    return match === undefined
      ? undefined
      : { modelId: match.modelId, revision: match.revision, digest: match.digest };
  }

  async #revalidate(
    namespace: PersonalModelOwnerNamespace,
    owner: Readonly<{ ownerScopeNamespaceRevision: number; ownerScopeDigest: string }>,
    heads: readonly { personalModelId: string; recordDigest: string }[],
  ): Promise<void> {
    const latestNamespace = await this.dependencies.persistence.loadActiveOwnerNamespace();
    if (latestNamespace === undefined
      || latestNamespace.recordDigest !== namespace.recordDigest) {
      throw new LocalDesktopR2DProductionError("selection.entitlement_stale");
    }
    for (const head of heads) {
      const latest = await this.dependencies.persistence.loadHead(
        owner,
        head.personalModelId,
      );
      if (latest === undefined || latest.recordDigest !== head.recordDigest) {
        throw new LocalDesktopR2DProductionError("selection.entitlement_stale");
      }
    }
  }
}

export class LocalDesktopR2DAcceptanceAuthority
implements R2D3AcceptanceAuthority {
  constructor(private readonly dependencies: Readonly<{
    subjectBindings: LocalDesktopR2DSubjectBindingAuthority;
    leases: LocalDesktopR2DResourceLeaseRegistry;
    captureWorkspacePermissions(input: Readonly<{
      workspaceGrantId?: string;
    }>): Promise<ExactResourcePermissionsV1>;
    prepareToolLocks(input: Readonly<{
      taskId: string;
      decision: AgentResourceDecisionV1;
      registrySnapshot: AgentResourceRegistrySnapshotV1;
      orderedLockIds: readonly string[];
      lockedAt: string;
    }>): Promise<readonly TaskCapabilityLock[]>;
    modelLocks: PersonalModelTaskLockMaterializer;
  }>) {}

  async loadExactAgent(_agentId: string): Promise<ReadableAgentDefinitionRevision | undefined> {
    return undefined;
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

  async captureWorkspaceAndAuthorizationFacts(input: Readonly<{
    acceptanceLeaseId: string;
    workspaceGrantId?: string;
  }>) {
    const lease = this.dependencies.leases.get(input.acceptanceLeaseId);
    const base = await this.dependencies.captureWorkspacePermissions(
      input.workspaceGrantId === undefined
        ? {}
        : { workspaceGrantId: input.workspaceGrantId },
    );
    const modelRefs = lease.registry.models.map((entry) => entry.ref);
    return Object.freeze({
      ...base,
      models: modelRefs,
      factsDigest: domainDigest(LOCAL_DESKTOP_R2D_PERMISSION_FACTS_DOMAIN, {
        baseFactsDigest: base.factsDigest,
        models: modelRefs,
        skills: base.skills,
        tools: base.tools,
        knowledge: base.knowledge,
      }),
    });
  }

  async loadExactUserModelPreference(input: Readonly<{
    acceptanceLeaseId: string;
  }>) {
    return this.dependencies.leases.get(input.acceptanceLeaseId).preference;
  }

  async loadPersonalOwnerAuthority(input: Readonly<{
    acceptanceLeaseId: string;
  }>) {
    return this.dependencies.leases.ownerAuthority(input.acceptanceLeaseId);
  }

  releaseAcceptanceLease(input: Readonly<{ acceptanceLeaseId: string }>): void {
    this.dependencies.leases.close(input.acceptanceLeaseId);
  }

  async prepareExactCapabilityLocks(input: Readonly<{
    acceptanceLeaseId: string;
    taskId: string;
    decision: AgentResourceDecisionV1;
    registrySnapshot: AgentResourceRegistrySnapshotV1;
    orderedLockIds: readonly string[];
    lockedAt: string;
  }>) {
    const lease = this.dependencies.leases.get(input.acceptanceLeaseId);
    const definition = lease.definitions.get(input.decision.resolvedModelRef.modelId);
    if (definition === undefined || input.orderedLockIds.length < 1) {
      throw new LocalDesktopR2DProductionError("selection.model_unavailable");
    }
    const modelLock = this.dependencies.modelLocks.prepare({
      taskId: input.taskId,
      lockId: input.orderedLockIds[0]!,
      lockedAt: input.lockedAt,
      registryRevision: input.registrySnapshot.registryRevision,
      namespace: lease.namespace,
      definition,
    });
    const toolLocks = await this.dependencies.prepareToolLocks({
      taskId: input.taskId,
      decision: input.decision,
      registrySnapshot: input.registrySnapshot,
      orderedLockIds: input.orderedLockIds.slice(1),
      lockedAt: input.lockedAt,
    });
    if (toolLocks.length !== input.decision.toolCandidateRefs.length) {
      throw new LocalDesktopR2DProductionError("selection.entitlement_invalid");
    }
    return Object.freeze([modelLock, ...toolLocks]);
  }
}

export type LocalDesktopR2DProductionCompositionDependencies = Readonly<{
  clock: Clock;
  ids: IdGenerator;
  sessionBindingVerifier: LocalDesktopR2DSessionBindingVerifier;
  persistence: PersonalModelPersistence;
  credentials: PersonalCredentialStore;
  captureBaseRegistrySnapshot(): Promise<AgentResourceRegistrySnapshotV1>;
  captureWorkspacePermissions(input: Readonly<{
    workspaceGrantId?: string;
  }>): Promise<ExactResourcePermissionsV1>;
  prepareToolLocks(input: Readonly<{
    taskId: string;
    decision: AgentResourceDecisionV1;
    registrySnapshot: AgentResourceRegistrySnapshotV1;
    orderedLockIds: readonly string[];
    lockedAt: string;
  }>): Promise<readonly TaskCapabilityLock[]>;
  toolPolicy: TaskToolCandidatePolicy;
  reasoningPlanner: ReasoningModeLockPlanner;
  reasoningPlannerV1Alpha2?: ReasoningModeLockPlannerV1Alpha2;
  authorizationPolicies: TaskAuthorizationModePolicyProvider;
}>;

export type LocalDesktopR2DProductionComposition = Readonly<{
  enabled: true;
  planner: R2D3DurableAcceptancePlanner;
  authority: LocalDesktopR2DAcceptanceAuthority;
  entitlements: LocalDesktopTaskResourceEntitlementSource;
}>;

export function createLocalDesktopR2DProductionComposition(input: Readonly<{
  enabled: boolean;
  dependencies?: LocalDesktopR2DProductionCompositionDependencies;
}>): Readonly<{ enabled: false }> | LocalDesktopR2DProductionComposition {
  if (!input.enabled) return Object.freeze({ enabled: false });
  if (input.dependencies === undefined) {
    throw new LocalDesktopR2DProductionError("selection.production_graph_incomplete");
  }
  const dependencies = input.dependencies;
  const builtInAgent = new BuiltInGeneralAgentSource();
  const proofs = new LocalDesktopR2DSubjectProofRegistry();
  const leases = new LocalDesktopR2DResourceLeaseRegistry();
  const subjectBindings = new LocalDesktopR2DSubjectBindingAuthority({
    clock: dependencies.clock,
    ids: dependencies.ids,
    verifier: dependencies.sessionBindingVerifier,
    proofs,
  });
  const modelLocks = new PersonalModelTaskLockMaterializer();
  const entitlements = new LocalDesktopTaskResourceEntitlementSource({
    clock: dependencies.clock,
    persistence: dependencies.persistence,
    credentials: dependencies.credentials,
    proofs,
    leases,
    builtInAgent,
    captureBaseRegistrySnapshot: dependencies.captureBaseRegistrySnapshot,
  });
  const authority = new LocalDesktopR2DAcceptanceAuthority({
    subjectBindings,
    leases,
    captureWorkspacePermissions: dependencies.captureWorkspacePermissions,
    prepareToolLocks: dependencies.prepareToolLocks,
    modelLocks,
  });
  const planner = new R2D3DurableAcceptancePlanner({
    clock: dependencies.clock,
    ids: dependencies.ids,
    authority,
    entitlements,
    toolPolicy: dependencies.toolPolicy,
    decisionPlanner: new AgentResourceDecisionPlanner(),
    builtInAgent,
    reasoningPlanner: dependencies.reasoningPlanner,
    ...(dependencies.reasoningPlannerV1Alpha2 === undefined ? {} : {
      reasoningPlannerV1Alpha2: dependencies.reasoningPlannerV1Alpha2,
    }),
    authorizationPolicies: dependencies.authorizationPolicies,
  });
  return Object.freeze({ enabled: true, planner, authority, entitlements });
}

export function assertR2DP2ProductionDefaults(): void {
  if (R2DP2_PRODUCTION_CONSUMPTION_DEFAULT_ENABLED
    || R2D3_CORE_DELTA_DEFAULT_ENABLED) {
    throw new LocalDesktopR2DProductionError("selection.production_graph_incomplete");
  }
}

export type LocalDesktopR2DProductionErrorCode =
  | "selection.subject_binding_invalid"
  | "selection.local_authority_unavailable"
  | "selection.entitlement_stale"
  | "selection.entitlement_invalid"
  | "selection.model_unavailable"
  | "selection.production_graph_incomplete";

export class LocalDesktopR2DProductionError extends Error {
  readonly safeSummary: string;

  constructor(readonly code: LocalDesktopR2DProductionErrorCode) {
    super(code);
    this.name = "LocalDesktopR2DProductionError";
    this.safeSummary = safeSummary(code);
  }
}

function validateSubjectProof(
  input: LocalDesktopR2DSubjectBindingProofV1,
): LocalDesktopR2DSubjectBindingProofV1 {
  const parsed = LocalDesktopR2DSubjectBindingProofV1Schema.parse(input);
  const { proofDigest, ...material } = parsed;
  if (proofDigest !== domainDigest(LOCAL_DESKTOP_R2D_SUBJECT_PROOF_DIGEST_DOMAIN, material)) {
    throw new LocalDesktopR2DProductionError("selection.subject_binding_invalid");
  }
  return Object.freeze(parsed);
}

function requireExactCandidate(
  authority: LocalDesktopSubjectAuthorityV1,
  head: ReturnType<typeof validatePersonalModelHead>,
  definition: PersonalModelDefinition,
  status: ReturnType<typeof validatePersonalModelStatusFact>,
): void {
  const items = [head, definition, status];
  if (items.some((item) =>
    item.ownerScopeNamespaceRevision !== authority.ownerScopeNamespaceRevision
      || item.ownerScopeDigest !== authority.ownerScopeDigest)
    || head.currentConfigurationRevision !== definition.configurationRevision
    || head.currentExecutionDefinitionDigest !== definition.executionDefinitionDigest
    || status.configurationRevision !== definition.configurationRevision
    || status.executionDefinitionDigest !== definition.executionDefinitionDigest) {
    throw new LocalDesktopR2DProductionError("selection.entitlement_invalid");
  }
}

function createRegistrySnapshot(
  base: AgentResourceRegistrySnapshotV1,
  models: readonly { modelId: string; revision: string; digest: string }[],
  definitions: ReadonlyMap<string, PersonalModelDefinition>,
): AgentResourceRegistrySnapshotV1 {
  const localModels = models.map((ref) => {
    const definition = definitions.get(ref.modelId)!;
    return {
      ref: { modelId: ref.modelId, revision: ref.revision, digest: ref.digest },
      capabilities: {
        inputModalities: [
          "text" as const,
          ...(definition.capabilities.includes("vision") ? ["image" as const] : []),
        ],
        outputModalities: ["text" as const],
        supportsToolCalling: definition.capabilities.includes("tool_calling"),
        supportsStreaming: definition.capabilities.includes("streaming"),
        contextWindow: { state: "unknown" as const },
      },
      available: true,
    };
  });
  const ids = [...base.models, ...localModels].map((entry) => entry.ref.modelId);
  if (new Set(ids).size !== ids.length) {
    throw new LocalDesktopR2DProductionError("selection.entitlement_invalid");
  }
  const material = {
    schemaVersion: "v1" as const,
    baseRegistryRevision: base.registryRevision,
    models: localModels.map((entry) => entry.ref),
    tools: base.tools.map((entry) => entry.ref),
  };
  return Object.freeze(AgentResourceRegistrySnapshotV1Schema.parse({
    ...base,
    registryRevision: domainDigest(LOCAL_DESKTOP_R2D_REGISTRY_REVISION_DOMAIN, material),
    models: [...base.models, ...localModels],
  }));
}

function isSelectableStatus(status: string): boolean {
  return status === "unverified" || status === "available" || status === "network_failed";
}

function cloneNamespace(namespace: PersonalModelOwnerNamespace): PersonalModelOwnerNamespace {
  return { ...namespace, namespaceKey: Uint8Array.from(namespace.namespaceKey) };
}

function domainDigest(domain: string, material: unknown): string {
  return Sha256DigestSchema.parse(sha256CanonicalJson(JsonValueSchema.parse({
    domain,
    material,
  })));
}

function safeSummary(code: LocalDesktopR2DProductionErrorCode): string {
  switch (code) {
    case "selection.subject_binding_invalid": return "当前会话无法验证，请重新打开任务";
    case "selection.local_authority_unavailable": return "本地身份状态暂不可用";
    case "selection.entitlement_stale": return "可用资源已变化，请重新提交";
    case "selection.entitlement_invalid": return "可用资源校验失败";
    case "selection.model_unavailable": return "当前没有可用模型";
    case "selection.production_graph_incomplete": return "当前运行环境未完成初始化";
  }
}
