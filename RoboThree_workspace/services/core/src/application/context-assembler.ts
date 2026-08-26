import {
  ConversationMessageSchema,
  CompactionRecordSchema,
  JsonValueSchema,
  MODEL_PROTOCOL_VERSION,
  ModelInstructionMessageSchema,
  ModelToolDefinitionSchema,
  Sha256DigestSchema,
  TurnContextSnapshotSchema,
} from "@robothree/contracts";
import type {
  ConversationMessage,
  ModelToolDefinition,
  ProviderNeutralMessage,
  TurnContextSnapshot,
} from "@robothree/contracts";

import { sha256CanonicalJson } from "../persistence/digest.js";
import { validateTaskCapabilityLockRevisions } from "../registry/capability-revision.js";
import {
  validateInstructionBundleDescriptorV1,
  validateTaskInstructionBindingV1,
} from "./instruction-bundle-domain.js";
import type { DynamicRequestFactsV1 } from "./dynamic-request-facts.js";
import { RequestScopedSystemMessageMaterializer } from
  "./request-scoped-system-message.js";
import type {
  AssembledContext,
  AssembledInstruction,
  CompactionSummaryEvidence,
  CompactionSummaryContextSource,
  ContextSegmentReceipt,
  ContextSourceExclusion,
  ContextSourceExclusionReason,
  MaterializedInstructionSource,
  LockedInstructionBundleContextV1,
  SelectedSkillContext,
  ToolContextEvidence,
  ToolSchemaCandidate,
} from "./context-types.js";

export type AssembleContextInput = Readonly<{
  snapshot: TurnContextSnapshot;
  conversationMessages: readonly ConversationMessage[];
  instructions?: readonly MaterializedInstructionSource[];
  selectedSkills?: readonly SelectedSkillContext[];
  toolCandidates?: readonly ToolSchemaCandidate[];
  compactionSummary?: CompactionSummaryContextSource;
  lockedInstructionBundle?: LockedInstructionBundleContextV1;
  dynamicRequestFacts?: DynamicRequestFactsV1;
}>;

export class ContextAssembler {
  assemble(input: AssembleContextInput): AssembledContext {
    const snapshot = TurnContextSnapshotSchema.parse(input.snapshot);
    const messages = validateConversation(snapshot, input.conversationMessages);
    const exclusions: ContextSourceExclusion[] = [];
    if (
      input.lockedInstructionBundle !== undefined
      && ((input.instructions?.length ?? 0) > 0 || (input.selectedSkills?.length ?? 0) > 0)
    ) {
      throw new Error("Locked instruction bundle cannot be combined with legacy instruction sources");
    }
    const locked = input.lockedInstructionBundle === undefined
      ? undefined
      : collectLockedInstructionBundle(snapshot, input.lockedInstructionBundle);
    if (input.dynamicRequestFacts !== undefined && locked === undefined) {
      throw new Error("Dynamic request facts require an exact locked instruction bundle");
    }
    const requestScoped = input.dynamicRequestFacts === undefined || locked === undefined
      ? undefined
      : new RequestScopedSystemMessageMaterializer().materialize({
        stableMessage: locked.instruction.message!,
        stableInstructionBundleDigest: locked.evidence.instructionBundleDigest,
        dynamicRequestFacts: input.dynamicRequestFacts,
      });
    const instructions = locked === undefined
      ? [
        ...collectInstructions(snapshot, input.instructions ?? [], exclusions),
        ...collectSkills(snapshot, input.selectedSkills ?? [], exclusions),
      ].sort(compareInstructions)
      : [requestScoped === undefined
        ? locked.instruction
        : Object.freeze({
          ...locked.instruction,
          sourceId: requestScoped.message.sourceId,
          sourceRevision: requestScoped.message.sourceRevision,
          sourceDigest: requestScoped.message.sourceDigest,
          content: requestScoped.message.content[0]!.text,
          message: requestScoped.message,
        })];
    const { tools, evidence: toolEvidence } = collectTools(
      snapshot,
      input.toolCandidates ?? [],
      exclusions,
    );
    const compaction = collectCompactionSummary(snapshot, input.compactionSummary);
    const derivedMessages = compaction.entries;
    const segments = createSegments(
      instructions,
      derivedMessages,
      messages,
      tools,
      toolEvidence,
    );
    const contextSourceDigest = sha256CanonicalJson(JsonValueSchema.parse({
      snapshotId: snapshot.snapshotId,
      snapshotSourceDigest: snapshot.sourceDigest,
      instructions: instructions.map((instruction) => ({
        sourceKind: instruction.sourceKind,
        sourceId: instruction.sourceId,
        sourceRevision: instruction.sourceRevision,
        sourceDigest: instruction.sourceDigest,
      })),
      ...(locked === undefined
        ? {}
        : { instructionBundleEvidence: locked.evidence }),
      ...(requestScoped === undefined
        ? {}
        : {
          dynamicRequestFactsEvidence: requestScoped.dynamicRequestFactsEvidence,
          requestScopedSystemMessageDigest: requestScoped.requestScopedSystemMessageDigest,
        }),
      messages: messages.map((message) => ({
        messageId: message.envelope.messageId,
        sequence: message.envelope.sequence,
        digest: message.envelope.messageDigest,
      })),
      derivedMessages: derivedMessages.map((entry) => ({
        segmentId: entry.segmentId,
        sourceDigest: entry.sourceDigest,
      })),
      ...(compaction.evidence === undefined
        ? {}
        : { compactionSummaryEvidence: compaction.evidence }),
      tools: toolEvidence,
    }));
    return Object.freeze({
      snapshot,
      contextSourceDigest,
      instructions: Object.freeze(instructions),
      messages: Object.freeze(messages),
      derivedMessages: Object.freeze(derivedMessages.map((entry) => Object.freeze({
        segmentId: entry.segmentId,
        message: entry.message,
      }))),
      ...(compaction.evidence === undefined
        ? {}
        : { compactionSummaryEvidence: Object.freeze(compaction.evidence) }),
      ...(locked === undefined
        ? {}
        : { instructionBundleEvidence: Object.freeze(locked.evidence) }),
      ...(requestScoped === undefined
        ? {}
        : {
          dynamicRequestFactsEvidence: Object.freeze(
            requestScoped.dynamicRequestFactsEvidence,
          ),
          requestScopedSystemMessageDigest:
            requestScoped.requestScopedSystemMessageDigest,
        }),
      tools: Object.freeze(tools),
      toolEvidence: Object.freeze(toolEvidence),
      segments: Object.freeze(segments),
      exclusions: Object.freeze(exclusions),
    });
  }
}

function collectLockedInstructionBundle(
  snapshot: TurnContextSnapshot,
  locked: LockedInstructionBundleContextV1,
): Readonly<{
  instruction: AssembledInstruction;
  evidence: NonNullable<AssembledContext["instructionBundleEvidence"]>;
}> {
  const binding = validateTaskInstructionBindingV1(locked.binding);
  const descriptor = validateInstructionBundleDescriptorV1(locked.descriptor);
  const message = ModelInstructionMessageSchema.parse(locked.message);
  if (
    locked.schemaVersion !== "v1"
    || locked.snapshotId !== snapshot.snapshotId
    || !snapshot.tasks.some((task) => task.taskId === binding.taskId)
    || binding.bindingDigest !== descriptor.taskInstructionBindingDigest
    || binding.assemblyRevision !== descriptor.assemblyRevision
    || message.role !== "system"
    || message.sourceId !== "core.instruction-bundle.v1"
    || message.sourceRevision !== binding.assemblyRevision
    || message.sourceDigest !== descriptor.instructionBundleDigest
    || message.content.length !== 1
    || message.content[0]?.type !== "text"
  ) {
    throw new Error("Locked instruction bundle does not match the current Context snapshot");
  }
  const evidence = Object.freeze({
    schemaVersion: "v1" as const,
    taskInstructionBindingDigest: binding.bindingDigest,
    assemblyRevision: descriptor.assemblyRevision,
    instructionBundleDigest: descriptor.instructionBundleDigest,
    orderedSources: Object.freeze([...descriptor.orderedSources]),
  });
  return Object.freeze({
    instruction: Object.freeze({
      sourceKind: "system_instruction" as const,
      sourceId: message.sourceId,
      sourceRevision: message.sourceRevision,
      sourceDigest: message.sourceDigest,
      content: message.content[0].text,
      message,
    }),
    evidence,
  });
}

function collectCompactionSummary(
  snapshot: TurnContextSnapshot,
  source: CompactionSummaryContextSource | undefined,
): Readonly<{ entries: readonly Readonly<{
  segmentId: string;
  sourceDigest: string;
  sourceRevision: string;
  message: Extract<ProviderNeutralMessage, { role: "user" }>;
}>[]; evidence?: CompactionSummaryEvidence }> {
  if (source === undefined) return { entries: [] };
  const record = CompactionRecordSchema.parse(source.record);
  const rawTailStart = snapshot.conversation.messageStartSequence;
  if (
    source.snapshotId !== snapshot.snapshotId
    || snapshot.conversation.activeCompactionId !== record.compactionId
    || snapshot.conversation.contextRevision !== source.contextRevision
    || record.sessionId !== snapshot.sessionId
    || record.sourceStartSequence !== 1
    || (rawTailStart === undefined
      ? record.sourceEndSequence !== snapshot.conversation.messageSequence
      : record.sourceEndSequence >= rawTailStart)
    || sha256CanonicalJson(JsonValueSchema.parse(record.summary)) !== source.summaryDigest
  ) throw new Error("Compaction Summary does not match the active TurnContextSnapshot view");
  const message = {
    schemaVersion: MODEL_PROTOCOL_VERSION,
    role: "user" as const,
    content: [{
      type: "text" as const,
      text: `[Compacted conversation context; derived and non-authoritative]\n${record.summary}`,
    }],
  };
  return {
    entries: [Object.freeze({
      segmentId: `compaction-summary:${record.compactionId}`,
      sourceDigest: source.summaryDigest,
      sourceRevision: `context:${source.contextRevision}`,
      message,
    })],
    evidence: {
      compactionId: record.compactionId,
      sourceStartSequence: record.sourceStartSequence,
      sourceEndSequence: record.sourceEndSequence,
      sourceDigest: record.sourceDigest,
      summaryDigest: source.summaryDigest,
      contextRevision: source.contextRevision,
    },
  };
}

function validateConversation(
  snapshot: TurnContextSnapshot,
  inputMessages: readonly ConversationMessage[],
): ConversationMessage[] {
  const messages = inputMessages.map((message) => ConversationMessageSchema.parse(message));
  const projected = snapshot.projection.filter((item) => item.type === "conversation_message");
  if (messages.length !== projected.length) {
    throw new Error("Context conversation must contain the exact Snapshot message range");
  }
  for (const [index, message] of messages.entries()) {
    const projection = projected[index];
    if (
      projection === undefined
      || message.envelope.sessionId !== snapshot.sessionId
      || message.envelope.messageId !== projection.messageId
      || message.envelope.sequence !== projection.messageSequence
      || message.envelope.messageDigest !== projection.messageDigest
      || message.envelope.messageDigest
        !== sha256CanonicalJson(JsonValueSchema.parse(message.message))
    ) {
      throw new Error("Context conversation does not match the current TurnContextSnapshot");
    }
  }
  return messages;
}

function collectInstructions(
  snapshot: TurnContextSnapshot,
  sources: readonly MaterializedInstructionSource[],
  exclusions: ContextSourceExclusion[],
): AssembledInstruction[] {
  return collectTextSources(
    snapshot,
    sources.map((source) => ({
      ...source,
      sourceKind: "system_instruction" as const,
    })),
    exclusions,
  );
}

function collectSkills(
  snapshot: TurnContextSnapshot,
  sources: readonly SelectedSkillContext[],
  exclusions: ContextSourceExclusion[],
): AssembledInstruction[] {
  return collectTextSources(
    snapshot,
    sources.map((source) => ({
      snapshotId: source.snapshotId,
      sourceId: source.skillId,
      revision: source.revision,
      contentDigest: source.contentDigest,
      content: source.content,
      selected: source.selected,
      authorized: source.authorized,
      sourceKind: "selected_skill" as const,
    })),
    exclusions,
  );
}

function collectTextSources(
  snapshot: TurnContextSnapshot,
  sources: readonly (MaterializedInstructionSource & {
    sourceKind: "system_instruction" | "selected_skill";
  })[],
  exclusions: ContextSourceExclusion[],
): AssembledInstruction[] {
  const included: AssembledInstruction[] = [];
  const seen = new Set<string>();
  for (const source of [...sources].sort((left, right) =>
    `${left.sourceKind}\u0000${left.sourceId}`.localeCompare(
      `${right.sourceKind}\u0000${right.sourceId}`,
    ))) {
    const key = `${source.sourceKind}\u0000${source.sourceId}`;
    const reason = textSourceExclusion(snapshot, source, seen.has(key));
    if (reason !== undefined) {
      exclusions.push({ sourceKind: source.sourceKind, sourceId: source.sourceId, reason });
      continue;
    }
    seen.add(key);
    included.push({
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      sourceRevision: source.revision,
      sourceDigest: source.contentDigest,
      content: source.content,
    });
  }
  return included;
}

function textSourceExclusion(
  snapshot: TurnContextSnapshot,
  source: MaterializedInstructionSource,
  duplicate: boolean,
): ContextSourceExclusionReason | undefined {
  if (duplicate) return "duplicate_source";
  if (!source.selected) return "not_selected";
  if (!source.authorized) return "not_authorized";
  if (source.snapshotId !== snapshot.snapshotId) return "snapshot_mismatch";
  if (
    !source.revision.trim()
    || !Sha256DigestSchema.safeParse(source.contentDigest).success
    || sha256CanonicalJson(JsonValueSchema.parse(source.content)) !== source.contentDigest
  ) {
    return "source_digest_mismatch";
  }
  return undefined;
}

function collectTools(
  snapshot: TurnContextSnapshot,
  candidates: readonly ToolSchemaCandidate[],
  exclusions: ContextSourceExclusion[],
): { tools: ModelToolDefinition[]; evidence: ToolContextEvidence[] } {
  const tools: ModelToolDefinition[] = [];
  const evidence: ToolContextEvidence[] = [];
  const seen = new Set<string>();
  const taskIds = new Set(snapshot.tasks.map((task) => task.taskId));
  for (const candidate of [...candidates].sort((left, right) =>
    `${left.lock.taskId}\u0000${left.lock.definitionSnapshot.capabilityId}`.localeCompare(
      `${right.lock.taskId}\u0000${right.lock.definitionSnapshot.capabilityId}`,
    ))) {
    const sourceId = `${candidate.lock.taskId}:${candidate.lock.definitionSnapshot.capabilityId}`;
    const reason = toolExclusion(snapshot, taskIds, candidate, seen.has(candidate.lock.lockId));
    if (reason !== undefined) {
      exclusions.push({ sourceKind: "tool_schema", sourceId, reason });
      continue;
    }
    seen.add(candidate.lock.lockId);
    const definition = candidate.lock.definitionSnapshot;
    if (definition.kind !== "tool") {
      exclusions.push({ sourceKind: "tool_schema", sourceId, reason: "not_a_tool" });
      continue;
    }
    tools.push(ModelToolDefinitionSchema.parse({
      taskId: candidate.lock.taskId,
      lockId: candidate.lock.lockId,
      capabilityId: definition.capabilityId,
      capabilityRevision: definition.revision,
      name: definition.name,
      description: definition.description,
      inputSchema: definition.tool.inputSchema,
    }));
    evidence.push({
      lockId: candidate.lock.lockId,
      lockDigest: candidate.lockDigest,
      authorizationDecisionDigest: candidate.authorization.decisionDigest,
      registryRevision: candidate.lock.registryRevision,
      capabilityRevision: candidate.lock.definitionSnapshot.revision,
    });
  }
  return { tools, evidence };
}

function toolExclusion(
  snapshot: TurnContextSnapshot,
  taskIds: ReadonlySet<string>,
  candidate: ToolSchemaCandidate,
  duplicate: boolean,
): ContextSourceExclusionReason | undefined {
  if (duplicate) return "duplicate_source";
  if (!candidate.selected) return "not_selected";
  if (
    candidate.authorization.outcome !== "allowed"
    || !Sha256DigestSchema.safeParse(candidate.authorization.decisionDigest).success
  ) {
    return "not_authorized";
  }
  if (candidate.snapshotId !== snapshot.snapshotId) return "snapshot_mismatch";
  if (!taskIds.has(candidate.lock.taskId)) return "task_not_in_snapshot";
  if (!candidate.registration.versionCompatible) return "version_incompatible";
  if (
    candidate.lockDigest !== sha256CanonicalJson(JsonValueSchema.parse(candidate.lock))
  ) {
    return "source_digest_mismatch";
  }
  const taskSource = snapshot.tasks.find((task) => task.taskId === candidate.lock.taskId);
  const lockSource = taskSource?.capabilityLocks.find(
    (lock) => lock.lockId === candidate.lock.lockId,
  );
  if (
    lockSource === undefined
    || lockSource.capabilityId !== candidate.lock.definitionSnapshot.capabilityId
    || lockSource.capabilityRevision !== candidate.lock.definitionSnapshot.revision
    || lockSource.registryRevision !== candidate.lock.registryRevision
    || lockSource.lockDigest !== candidate.lockDigest
  ) {
    return "snapshot_mismatch";
  }
  try {
    validateTaskCapabilityLockRevisions(candidate.lock);
  } catch {
    return "revision_mismatch";
  }
  const proof = candidate.registration;
  if (
    proof.registryRevision !== candidate.lock.registryRevision
    || proof.capabilityRevision !== candidate.lock.definitionSnapshot.revision
    || proof.bindingRevision !== candidate.lock.bindingSnapshot.revision
    || proof.adapterDescriptorRevision !== candidate.lock.adapterDescriptorSnapshot.revision
  ) {
    return "not_registered";
  }
  return undefined;
}

function createSegments(
  instructions: readonly AssembledInstruction[],
  derivedMessages: readonly Readonly<{
    segmentId: string;
    sourceDigest: string;
    sourceRevision: string;
  }>[],
  messages: readonly ConversationMessage[],
  tools: readonly ModelToolDefinition[],
  toolEvidence: readonly ToolContextEvidence[],
): ContextSegmentReceipt[] {
  const evidenceByLock = new Map(toolEvidence.map((evidence) => [evidence.lockId, evidence]));
  return [
    ...instructions.map((instruction) => ({
      segmentId: `${instruction.sourceKind}:${instruction.sourceId}`,
      segmentKind: "static" as const,
      sourceKind: instruction.sourceKind,
      sourceRevision: instruction.sourceRevision,
      sourceDigest: instruction.sourceDigest,
    })),
    ...derivedMessages.map((message) => ({
      segmentId: message.segmentId,
      segmentKind: "dynamic" as const,
      sourceKind: "compaction_summary" as const,
      sourceRevision: message.sourceRevision,
      sourceDigest: message.sourceDigest,
    })),
    ...messages.map((message) => ({
      segmentId: `message:${message.envelope.messageId}`,
      segmentKind: "dynamic" as const,
      sourceKind: "conversation_message" as const,
      sourceRevision: `sequence:${message.envelope.sequence}`,
      sourceDigest: message.envelope.messageDigest,
    })),
    ...tools.map((tool) => {
      const evidence = evidenceByLock.get(tool.lockId);
      if (evidence === undefined) {
        throw new Error(`Tool context evidence is missing for ${tool.lockId}`);
      }
      return {
        segmentId: `tool:${tool.lockId}`,
        segmentKind: "static" as const,
        sourceKind: "tool_schema" as const,
        sourceRevision: `${evidence.registryRevision}:${evidence.capabilityRevision}`,
        sourceDigest: evidence.lockDigest,
      };
    }),
  ];
}

function compareInstructions(left: AssembledInstruction, right: AssembledInstruction): number {
  return `${left.sourceKind}\u0000${left.sourceId}`.localeCompare(
    `${right.sourceKind}\u0000${right.sourceId}`,
  );
}
