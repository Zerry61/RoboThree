import {
  GetRobotCatalogQuerySchema,
  GetToolCatalogQuerySchema,
  JsonValueSchema,
  ListRobotCatalogQuerySchema,
  ListToolCatalogQuerySchema,
  RegistrySnapshotSchema,
  RobotCatalogDetailSchema,
  RobotCatalogPageSchema,
  RobotCatalogSummarySchema,
  ToolCatalogDetailSchema,
  ToolCatalogPageSchema,
  ToolCatalogSummarySchema,
  type AgentDefinitionRevision,
  type CatalogResourceSummaryV1Alpha2,
  type CatalogRestrictionState,
  type CatalogUnavailableReason,
  type GetRobotCatalogQuery,
  type GetToolCatalogQuery,
  type ListRobotCatalogQuery,
  type ListToolCatalogQuery,
  type ModelDefinition,
  type RegistrySnapshot,
  type RobotCatalogDetail,
  type RobotCatalogPage,
  type RobotCatalogSummary,
  type ToolCatalogDetail,
  type ToolCatalogSummary,
  type ToolCatalogPage,
  type ToolCapabilityDefinition,
} from "@robothree/contracts";

import type {
  CatalogCursorCodec,
  CatalogCursorProof,
  CatalogKind,
  RobotCatalogQuery,
  ToolCatalogQuery,
  TrustedRegistrySnapshotProvider,
} from "../ports/catalog-query.js";
import { CatalogQueryError } from "../ports/catalog-query.js";
import type { RuntimeSelectionContextProvider } from "../ports/runtime-selection-context-provider.js";
import type {
  TrustedAgentRepository,
  TrustedModelRepository,
} from "../ports/trusted-runtime-catalog.js";
import {
  CapabilityResolutionError,
  CapabilityResolver,
  type CapabilityAvailability,
} from "../registry/capability-resolver.js";
import {
  hasValidAdapterDescriptorRevision,
  hasValidCapabilityBindingRevision,
  hasValidCapabilityDefinitionRevision,
  hasValidRegistrySnapshotRevision,
} from "../registry/capability-revision.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type { ModelEligibilityEvaluator } from "./model-eligibility-evaluator.js";
import type { ModelLiveEligibility } from "./model-eligibility-evaluator.js";
import {
  hasValidAgentDefinitionRevision,
  hasValidModelDefinition,
} from "./runtime-selection-revisions.js";

const DEFAULT_LIMIT = 50;
const MAX_RESPONSE_BYTES = 256 * 1024;

type CatalogRuntimeState = Readonly<{
  snapshot: RegistrySnapshot;
  availability: Readonly<Record<string, CapabilityAvailability>>;
  liveModels: readonly ModelLiveEligibility[];
}>;

export class RobotCatalogQueryService implements RobotCatalogQuery {
  readonly #agents: TrustedAgentRepository;
  readonly #models: TrustedModelRepository;
  readonly #registries: TrustedRegistrySnapshotProvider;
  readonly #contexts: RuntimeSelectionContextProvider;
  readonly #eligibility: ModelEligibilityEvaluator;
  readonly #cursors: CatalogCursorCodec;

  constructor(input: Readonly<{
    agents: TrustedAgentRepository;
    models: TrustedModelRepository;
    registries: TrustedRegistrySnapshotProvider;
    contexts: RuntimeSelectionContextProvider;
    eligibility: ModelEligibilityEvaluator;
    cursors: CatalogCursorCodec;
  }>) {
    this.#agents = input.agents;
    this.#models = input.models;
    this.#registries = input.registries;
    this.#contexts = input.contexts;
    this.#eligibility = input.eligibility;
    this.#cursors = input.cursors;
  }

  async list(input: ListRobotCatalogQuery): Promise<RobotCatalogPage> {
    const query = ListRobotCatalogQuerySchema.safeParse(input);
    if (!query.success) throw invalidQuery();
    const state = await loadRuntimeState(this.#registries, this.#contexts);
    const models = await loadValidModels(this.#models);
    const agents = await loadValidAgents(this.#agents);
    const items = sortCatalogItems(
      agents.map((agent) => this.#projectSummary(agent, models, state)),
      (item) => item.robotId,
    );
    const queryRevision = digestProjection("robot", items);
    const page = paginate({
      kind: "robot",
      items,
      stableId: (item) => item.robotId,
      queryRevision,
      ...(query.data.cursor === undefined ? {} : { cursor: query.data.cursor }),
      limit: query.data.limit ?? DEFAULT_LIMIT,
      cursors: this.#cursors,
    });
    return bounded(RobotCatalogPageSchema.parse({
      contractVersion: "v1alpha2",
      queryRevision,
      items: page.items,
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    }));
  }

  async get(input: GetRobotCatalogQuery): Promise<RobotCatalogDetail> {
    const query = GetRobotCatalogQuerySchema.safeParse(input);
    if (!query.success) throw invalidQuery();
    const state = await loadRuntimeState(this.#registries, this.#contexts);
    const models = await loadValidModels(this.#models);
    const agent = await this.#agents.loadActiveAgent(query.data.robotId);
    if (agent === undefined) {
      throw new CatalogQueryError("catalog.robot_not_found", "robot is not present in the trusted catalog");
    }
    if (!hasValidAgentDefinitionRevision(agent)) throw integrityError();
    const summary = this.#projectSummary(agent, models, state);
    const detail = RobotCatalogDetailSchema.parse({
      ...summary,
      defaultModel: projectModelResource(agent.defaultModelId, models, state.liveModels, agent, this.#eligibility),
      allowModelOverride: agent.allowModelOverride,
      eligibleModels: eligibleModels(agent, models, state.liveModels, this.#eligibility)
        .map((model) => availableModelResource(model)),
      skills: agent.skillReferences.map((resource) => unknownResource(
        resource.id,
        resource.revision,
      )),
      tools: agent.toolReferences.map((reference) => projectToolReference(reference, state)),
      knowledge: agent.knowledgeReferences.map((resource) => unknownResource(
        resource.id,
        resource.revision,
      )),
    });
    return bounded(detail);
  }

  #projectSummary(
    agent: AgentDefinitionRevision,
    models: readonly ModelDefinition[],
    state: CatalogRuntimeState,
  ): RobotCatalogSummary {
    const eligible = eligibleModels(agent, models, state.liveModels, this.#eligibility);
    const defaultAvailable = eligible.some((model) => model.modelId === agent.defaultModelId);
    const runnable = defaultAvailable || (agent.allowModelOverride && eligible.length > 0);
    return RobotCatalogSummarySchema.parse({
      robotId: agent.agentDefinitionId,
      configurationRevision: agent.revision,
      displayName: agent.name,
      description: agent.goal,
      source: "local_trusted",
      restrictionSummary: {
        models: agent.allowModelOverride ? "unrestricted" : "restricted_nonempty",
        skills: restrictionFor(agent.skillReferences),
        tools: restrictionFor(agent.toolReferences),
        knowledge: restrictionFor(agent.knowledgeReferences),
      },
      runnable,
      ...(runnable ? {} : { unavailableReason: "catalog.model_unavailable" }),
    });
  }
}

export class ToolCatalogQueryService implements ToolCatalogQuery {
  readonly #registries: TrustedRegistrySnapshotProvider;
  readonly #contexts: RuntimeSelectionContextProvider;
  readonly #cursors: CatalogCursorCodec;

  constructor(input: Readonly<{
    registries: TrustedRegistrySnapshotProvider;
    contexts: RuntimeSelectionContextProvider;
    cursors: CatalogCursorCodec;
  }>) {
    this.#registries = input.registries;
    this.#contexts = input.contexts;
    this.#cursors = input.cursors;
  }

  async list(input: ListToolCatalogQuery): Promise<ToolCatalogPage> {
    const query = ListToolCatalogQuerySchema.safeParse(input);
    if (!query.success) throw invalidQuery();
    const state = await loadRuntimeState(this.#registries, this.#contexts);
    const items = sortCatalogItems(
      state.snapshot.agentVisibleCapabilities.tools
        .map((definition) => projectToolSummary(definition, state)),
      (item) => item.toolId,
    );
    const queryRevision = digestProjection("tool", items);
    const page = paginate({
      kind: "tool",
      items,
      stableId: (item) => item.toolId,
      queryRevision,
      ...(query.data.cursor === undefined ? {} : { cursor: query.data.cursor }),
      limit: query.data.limit ?? DEFAULT_LIMIT,
      cursors: this.#cursors,
    });
    return bounded(ToolCatalogPageSchema.parse({
      contractVersion: "v1alpha2",
      queryRevision,
      items: page.items,
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    }));
  }

  async get(input: GetToolCatalogQuery): Promise<ToolCatalogDetail> {
    const query = GetToolCatalogQuerySchema.safeParse(input);
    if (!query.success) throw invalidQuery();
    const state = await loadRuntimeState(this.#registries, this.#contexts);
    const definition = state.snapshot.agentVisibleCapabilities.tools
      .find((candidate) => candidate.capabilityId === query.data.toolId);
    if (definition === undefined) {
      throw new CatalogQueryError("catalog.tool_not_found", "tool is not present in the trusted catalog");
    }
    return bounded(ToolCatalogDetailSchema.parse({
      ...projectToolSummary(definition, state),
      inputShape: "structured_object",
      outputShape: definition.tool.outputSchema === undefined
        ? "unspecified"
        : "structured_object",
    }));
  }
}

async function loadRuntimeState(
  registries: TrustedRegistrySnapshotProvider,
  contexts: RuntimeSelectionContextProvider,
): Promise<CatalogRuntimeState> {
  const raw = await registries.loadCurrentRegistrySnapshot();
  if (raw === undefined) {
    throw new CatalogQueryError("catalog.registry_unavailable", "trusted registry is unavailable");
  }
  let snapshot: RegistrySnapshot;
  try {
    snapshot = RegistrySnapshotSchema.parse(raw);
    validateRegistry(snapshot);
  } catch (error) {
    if (error instanceof CatalogQueryError) throw error;
    throw integrityError();
  }
  const context = await contexts.resolve(snapshot.registryRevision);
  return {
    snapshot,
    availability: context?.capabilityAvailability ?? {},
    liveModels: context?.liveModels ?? [],
  };
}

function validateRegistry(snapshot: RegistrySnapshot): void {
  if (!hasValidRegistrySnapshotRevision(snapshot)) throw integrityError();
  for (const definition of [
    ...snapshot.agentVisibleCapabilities.models,
    ...snapshot.agentVisibleCapabilities.tools,
  ]) {
    if (!hasValidCapabilityDefinitionRevision(definition)) throw integrityError();
  }
  for (const binding of snapshot.infrastructureResources.capabilityBindings) {
    if (!hasValidCapabilityBindingRevision(binding)) throw integrityError();
  }
  for (const descriptor of snapshot.infrastructureResources.adapterDescriptors) {
    if (!hasValidAdapterDescriptorRevision(descriptor)) throw integrityError();
  }
  const resolver = new CapabilityResolver(snapshot);
  for (const tool of snapshot.agentVisibleCapabilities.tools) {
    try {
      resolver.resolveById(snapshot.registryRevision, tool.capabilityId);
    } catch {
      throw integrityError();
    }
  }
}

async function loadValidAgents(
  repository: TrustedAgentRepository,
): Promise<readonly AgentDefinitionRevision[]> {
  const agents = await repository.listActiveAgents();
  if (agents.some((agent) => !hasValidAgentDefinitionRevision(agent))) throw integrityError();
  return agents;
}

async function loadValidModels(
  repository: TrustedModelRepository,
): Promise<readonly ModelDefinition[]> {
  const models = await repository.listModels();
  if (models.some((model) => !hasValidModelDefinition(model))) throw integrityError();
  return models;
}

function eligibleModels(
  agent: AgentDefinitionRevision,
  models: readonly ModelDefinition[],
  liveModels: readonly ModelLiveEligibility[],
  evaluator: ModelEligibilityEvaluator,
): readonly ModelDefinition[] {
  const candidates = agent.allowModelOverride
    ? models
    : models.filter((model) => model.modelId === agent.defaultModelId);
  return candidates.filter((model) => {
    const live = liveModels.find((candidate) => candidate.modelId === model.modelId);
    return live !== undefined && evaluator.evaluate({ agent, model, live }).eligible;
  });
}

function projectModelResource(
  modelId: string,
  models: readonly ModelDefinition[],
  liveModels: readonly ModelLiveEligibility[],
  agent: AgentDefinitionRevision,
  evaluator: ModelEligibilityEvaluator,
): CatalogResourceSummaryV1Alpha2 {
  const model = models.find((candidate) => candidate.modelId === modelId);
  if (model === undefined) {
    return unavailableResource(modelId, undefined, "catalog.model_unavailable");
  }
  const live = liveModels.find((candidate) => candidate.modelId === modelId);
  if (live === undefined || !evaluator.evaluate({ agent, model, live }).eligible) {
    return unavailableResource(model.modelId, model.revision, "catalog.model_unavailable", model.name);
  }
  return availableModelResource(model);
}

function availableModelResource(model: ModelDefinition): CatalogResourceSummaryV1Alpha2 {
  return {
    resourceId: model.modelId,
    revision: model.revision,
    displayName: model.name,
    availability: "available",
  };
}

function unknownResource(resourceId: string, revision: string): CatalogResourceSummaryV1Alpha2 {
  return {
    resourceId,
    revision,
    displayName: resourceId,
    availability: "unknown",
    unavailableReason: "catalog.availability_unknown",
  };
}

function unavailableResource(
  resourceId: string,
  revision: string | undefined,
  unavailableReason: CatalogUnavailableReason,
  displayName = resourceId,
): CatalogResourceSummaryV1Alpha2 {
  return {
    resourceId,
    ...(revision === undefined ? {} : { revision }),
    displayName,
    availability: "unavailable",
    unavailableReason,
  };
}

function projectToolReference(
  reference: Readonly<{ capabilityId: string; capabilityRevision: string }>,
  state: CatalogRuntimeState,
): CatalogResourceSummaryV1Alpha2 {
  const definition = state.snapshot.agentVisibleCapabilities.tools.find((candidate) =>
    candidate.capabilityId === reference.capabilityId
    && candidate.revision === reference.capabilityRevision);
  if (definition === undefined) {
    return unavailableResource(
      reference.capabilityId,
      reference.capabilityRevision,
      "catalog.revision_unavailable",
    );
  }
  const summary = projectToolSummary(definition, state);
  return {
    resourceId: summary.toolId,
    revision: summary.capabilityRevision,
    displayName: summary.displayName,
    availability: summary.availability,
    ...(summary.unavailableReason === undefined
      ? {}
      : { unavailableReason: summary.unavailableReason }),
  };
}

function projectToolSummary(
  definition: ToolCapabilityDefinition,
  state: CatalogRuntimeState,
): ToolCatalogSummary {
  const availability = resolveToolAvailability(
    state.snapshot,
    definition,
    state.availability[definition.capabilityId],
  );
  return ToolCatalogSummarySchema.parse({
    toolId: definition.capabilityId,
    capabilityRevision: definition.revision,
    registryRevision: state.snapshot.registryRevision,
    displayName: definition.name,
    description: definition.description,
    source: definition.source.trust === "official"
      ? "official_package"
      : "enterprise_package",
    readOnly: definition.tool.readOnlyHint,
    riskSummary: definition.tool.risk.staticFacts,
    ...availability,
  });
}

function resolveToolAvailability(
  snapshot: RegistrySnapshot,
  definition: ToolCapabilityDefinition,
  availability: CapabilityAvailability | undefined,
): Readonly<{
  availability: "available" | "unavailable" | "unknown";
  unavailableReason?: CatalogUnavailableReason;
}> {
  const resolver = new CapabilityResolver(snapshot);
  try {
    resolver.resolveById(snapshot.registryRevision, definition.capabilityId, availability);
  } catch (error) {
    if (!(error instanceof CapabilityResolutionError)) throw integrityError();
    if (error.code === "capability.state_subject_mismatch") {
      return {
        availability: "unknown",
        unavailableReason: "catalog.availability_unknown",
      };
    }
    const reason = mapAvailabilityError(error.code);
    if (reason === undefined) throw integrityError();
    return { availability: "unavailable", unavailableReason: reason };
  }
  if (
    availability?.credentialStatus === "available"
    && availability.healthStatus === "healthy"
    && availability.disabled !== true
    && availability.revoked !== true
  ) {
    return { availability: "available" };
  }
  return {
    availability: "unknown",
    unavailableReason: "catalog.availability_unknown",
  };
}

function mapAvailabilityError(
  code: CapabilityResolutionError["code"],
): CatalogUnavailableReason | undefined {
  switch (code) {
    case "capability.credential_unavailable": return "catalog.credential_unavailable";
    case "capability.disabled": return "catalog.disabled";
    case "capability.health_unavailable": return "catalog.health_unavailable";
    case "capability.revoked": return "catalog.revoked";
    default: return undefined;
  }
}

function restrictionFor(items: readonly unknown[]): CatalogRestrictionState {
  return items.length === 0 ? "restricted_empty" : "restricted_nonempty";
}

function normalizeName(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortCatalogItems<T extends { displayName: string }>(
  items: readonly T[],
  stableId: (item: T) => string,
): readonly T[] {
  return [...items].sort((left, right) => {
    const byName = compareCodePoints(normalizeName(left.displayName), normalizeName(right.displayName));
    if (byName !== 0) return byName;
    return compareCodePoints(stableId(left), stableId(right));
  });
}

function digestProjection(kind: CatalogKind, items: readonly unknown[]): string {
  return sha256CanonicalJson(JsonValueSchema.parse({
    domain: "robothree.catalog.query-revision.v1",
    kind,
    items,
  }));
}

function paginate<T extends { displayName: string }>(input: Readonly<{
  kind: CatalogKind;
  items: readonly T[];
  stableId(item: T): string;
  queryRevision: string;
  cursor?: string;
  limit: number;
  cursors: CatalogCursorCodec;
}>): Readonly<{ items: readonly T[]; nextCursor?: string }> {
  let offset = 0;
  if (input.cursor !== undefined) {
    const proof = input.cursors.open(input.cursor);
    if (proof.kind !== input.kind || proof.queryRevision !== input.queryRevision) throw staleCursor();
    const index = input.items.findIndex((item) =>
      normalizeName(item.displayName) === proof.lastNormalizedName
      && input.stableId(item) === proof.lastStableId);
    if (index < 0 || index + 1 >= input.items.length) throw staleCursor();
    offset = index + 1;
  }
  const items = input.items.slice(offset, offset + input.limit);
  const hasMore = offset + items.length < input.items.length;
  if (!hasMore) return { items };
  const last = items.at(-1);
  if (last === undefined) throw staleCursor();
  const proof: CatalogCursorProof = {
    kind: input.kind,
    queryRevision: input.queryRevision,
    lastNormalizedName: normalizeName(last.displayName),
    lastStableId: input.stableId(last),
  };
  return { items, nextCursor: input.cursors.seal(proof) };
}

function bounded<T>(value: T): T {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_RESPONSE_BYTES) {
    throw new CatalogQueryError("catalog.response_too_large", "catalog response exceeds the bounded size limit");
  }
  return value;
}

function invalidQuery(): CatalogQueryError {
  return new CatalogQueryError("catalog.invalid_query", "catalog query is invalid");
}

function staleCursor(): CatalogQueryError {
  return new CatalogQueryError("catalog.stale_cursor", "catalog cursor is stale for the current query revision");
}

function integrityError(): CatalogQueryError {
  return new CatalogQueryError("catalog.integrity_violation", "trusted catalog integrity validation failed");
}
