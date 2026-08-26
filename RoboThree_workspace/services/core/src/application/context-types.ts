import type {
  CompactionRecord,
  ConversationMessage,
  ModelContextArtifact,
  ModelInstructionMessage,
  ModelTarget,
  ModelToolDefinition,
  ProviderNeutralMessage,
  TaskCapabilityLock,
  TurnContextSnapshot,
} from "@robothree/contracts";
import type { ToolCallBatchEvidence } from "./conversation-atomic-group-planner.js";
import type {
  InstructionBundleDescriptorV1,
  TaskInstructionBindingV1,
} from "./instruction-bundle-domain.js";
import type {
  DynamicRequestFactsEvidenceV1,
  DynamicRequestFactsV1,
} from "./dynamic-request-facts.js";

export type ContextAssemblyPhase = "pre_call" | "mid_turn";

export type MaterializedInstructionSource = Readonly<{
  snapshotId: string;
  sourceId: string;
  revision: string;
  contentDigest: string;
  content: string;
  selected: boolean;
  authorized: boolean;
}>;

export type SelectedSkillContext = Readonly<{
  snapshotId: string;
  skillId: string;
  revision: string;
  contentDigest: string;
  content: string;
  selected: boolean;
  authorized: boolean;
}>;

export type CompactionSummaryContextSource = Readonly<{
  snapshotId: string;
  contextRevision: number;
  record: CompactionRecord;
  summaryDigest: string;
}>;

export type CompactionSummaryEvidence = Readonly<{
  compactionId: string;
  sourceStartSequence: number;
  sourceEndSequence: number;
  sourceDigest: string;
  summaryDigest: string;
  contextRevision: number;
}>;

export type InstructionBundleEvidenceV1 = Readonly<{
  schemaVersion: "v1";
  taskInstructionBindingDigest: string;
  assemblyRevision: string;
  instructionBundleDigest: string;
  orderedSources: readonly InstructionBundleDescriptorV1["orderedSources"][number][];
}>;

export type LockedInstructionBundleContextV1 = Readonly<{
  schemaVersion: "v1";
  snapshotId: string;
  binding: TaskInstructionBindingV1;
  descriptor: InstructionBundleDescriptorV1;
  message: ModelInstructionMessage;
  estimatedInputTokens: number;
  availableInputTokens: number;
  budgetPolicyDigest: string;
}>;

export type ToolRegistrationProof = Readonly<{
  registryRevision: string;
  capabilityRevision: string;
  bindingRevision: string;
  adapterDescriptorRevision: string;
  versionCompatible: boolean;
}>;

export type ToolSchemaCandidate = Readonly<{
  snapshotId: string;
  selected: boolean;
  authorization: Readonly<{
    outcome: "allowed" | "denied";
    decisionDigest: string;
  }>;
  lockDigest: string;
  lock: TaskCapabilityLock;
  registration: ToolRegistrationProof;
}>;

export type ContextSourceExclusionReason =
  | "not_selected"
  | "not_authorized"
  | "snapshot_mismatch"
  | "source_digest_mismatch"
  | "task_not_in_snapshot"
  | "not_a_tool"
  | "not_registered"
  | "version_incompatible"
  | "revision_mismatch"
  | "duplicate_source";

export type ContextSourceExclusion = Readonly<{
  sourceKind: "system_instruction" | "selected_skill" | "tool_schema";
  sourceId: string;
  reason: ContextSourceExclusionReason;
}>;

export type AssembledInstruction = Readonly<{
  sourceKind: "system_instruction" | "selected_skill";
  sourceId: string;
  sourceRevision: string;
  sourceDigest: string;
  content: string;
  message?: ModelInstructionMessage;
}>;

export type ContextSegmentReceipt = Readonly<{
  segmentId: string;
  segmentKind: "static" | "dynamic";
  sourceKind:
    | "system_instruction"
    | "selected_skill"
    | "compaction_summary"
    | "conversation_message"
    | "tool_schema";
  sourceRevision: string;
  sourceDigest: string;
}>;

export type ToolContextEvidence = Readonly<{
  lockId: string;
  lockDigest: string;
  authorizationDecisionDigest: string;
  registryRevision: string;
  capabilityRevision: string;
}>;

export type AssembledContext = Readonly<{
  snapshot: TurnContextSnapshot;
  contextSourceDigest: string;
  instructions: readonly AssembledInstruction[];
  messages: readonly ConversationMessage[];
  derivedMessages: readonly Readonly<{
    segmentId: string;
    message: ProviderNeutralMessage;
  }>[];
  compactionSummaryEvidence?: CompactionSummaryEvidence;
  instructionBundleEvidence?: InstructionBundleEvidenceV1;
  dynamicRequestFactsEvidence?: DynamicRequestFactsEvidenceV1;
  requestScopedSystemMessageDigest?: string;
  tools: readonly ModelToolDefinition[];
  toolEvidence: readonly ToolContextEvidence[];
  segments: readonly ContextSegmentReceipt[];
  exclusions: readonly ContextSourceExclusion[];
}>;

export type ReducedContext = Readonly<{
  snapshot: TurnContextSnapshot;
  contextSourceDigest: string;
  compactionSummaryEvidence?: CompactionSummaryEvidence;
  instructionBundleEvidence?: InstructionBundleEvidenceV1;
  dynamicRequestFactsEvidence?: DynamicRequestFactsEvidenceV1;
  requestScopedSystemMessageDigest?: string;
  instructions: readonly AssembledInstruction[];
  messages: readonly ProviderNeutralMessage[];
  messageSegmentIds: readonly string[];
  tools: readonly ModelToolDefinition[];
  artifacts: readonly ModelContextArtifact[];
  segments: readonly ContextSegmentReceipt[];
  exclusions: readonly ContextSourceExclusion[];
}>;

export type ContextPipelineInput = Readonly<{
  phase: ContextAssemblyPhase;
  requestId: string;
  snapshot: TurnContextSnapshot;
  conversationMessages: readonly ConversationMessage[];
  compactionSummary?: CompactionSummaryContextSource;
  lockedInstructionBundle?: LockedInstructionBundleContextV1;
  dynamicRequestFacts?: DynamicRequestFactsV1;
  toolCallBatches?: readonly ToolCallBatchEvidence[];
  model: ModelTarget;
  instructions?: readonly MaterializedInstructionSource[];
  selectedSkills?: readonly SelectedSkillContext[];
  toolCandidates?: readonly ToolSchemaCandidate[];
}>;

export type ContextAssemblyReceipt = Readonly<{
  phase: ContextAssemblyPhase;
  snapshotId: string;
  snapshotSourceDigest: string;
  contextSourceDigest: string;
  policyDigest: string;
  includedSegments: readonly ContextSegmentReceipt[];
  compactionSummaryEvidence?: CompactionSummaryEvidence;
  instructionBundleEvidence?: InstructionBundleEvidenceV1;
  dynamicRequestFactsEvidence?: DynamicRequestFactsEvidenceV1;
  requestScopedSystemMessageDigest?: string;
  excludedSources: readonly ContextSourceExclusion[];
  reducedSegmentIds: readonly string[];
  initialEstimatedInputTokens: number;
  finalEstimatedInputTokens: number;
  availableInputTokens: number;
  compactionThresholdTokens: number;
  reductionApplied: boolean;
  modelRequestDigest: string;
}>;
