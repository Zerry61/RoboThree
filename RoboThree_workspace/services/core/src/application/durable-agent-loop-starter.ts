import { createHash } from "node:crypto";

import { JsonValueSchema } from "@robothree/contracts";
import type {
  ConversationMessage,
  TaskCapabilityLock,
} from "@robothree/contracts";
import {
  TaskRuntimeSelectionV1Alpha2Schema,
} from "@robothree/contracts/runtime-selection/v1alpha2";
import {
  TaskRuntimeSelectionV1Alpha4Schema,
  type ReadableTaskRuntimeSelectionV1Alpha4,
} from "@robothree/contracts/runtime-selection/v1alpha4";

import type {
  AgentLoopStarter,
  AgentLoopStartResult,
} from "../ports/agent-loop-starter.js";
import type { Clock } from "../ports/clock.js";
import type { ConversationPersistence } from "../ports/conversation-persistence.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { SubmitTurnPersistence } from "../ports/submit-turn-persistence.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import type { ScheduledTask, Scheduler } from "../ports/scheduler.js";
import type { TokenEstimator } from "../ports/token-estimator.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type {
  AgentLoopCoordinator,
  AgentLoopModelProgressPhase,
} from "./agent-loop-coordinator.js";
import type { ContextPipeline } from "./context-pipeline.js";
import type { DesktopEphemeralEventBus } from "./desktop-ephemeral-event-bus.js";
import type { TurnSnapshotBuilder } from "./turn-snapshot-builder.js";
import type { DurableTaskRuntime } from "./durable-task-runtime.js";
import type { RuntimeAdapterHandles } from "../registry/runtime-adapter-handles.js";
import type { TaskLockedModelProviderResolver } from
  "../ports/task-locked-model-provider-resolver.js";
import { RuntimeAdapterTaskLockedModelProviderResolver } from
  "./task-locked-model-provider-resolution.js";
import type { ModelInvocationAdmission } from "./model-invocation-admission.js";
import type {
  ModelInvocationLink,
  ModelInvocationLinkPersistence,
} from "../ports/model-invocation-link-persistence.js";
import type { AgentLoopRecoverySeed } from "./agent-loop-coordinator.js";
import { ModelInvocationAdmissionPending } from "./model-invocation-admission.js";
import type { ModelContextProvenanceClassifier } from "./model-context-provenance-classifier.js";
import type {
  AssistantMessageProvenance,
  CompactionSummaryProvenance,
} from "./model-context-provenance-classifier.js";
import { ModelStreamResumeUnavailableError } from "./durable-enterprise-model-provider.js";
import {
  documentToolCandidatesForContext,
  isDocumentToolCapabilityId,
} from "./document-tool-context.js";
import type { ToolSchemaCandidate } from "./context-types.js";
import type { ContextPipelineInput } from "./context-types.js";
import {
  ContextPreparationCoordinator,
  ContextPreparationAdmissionInterruption,
  ContextPreparationError,
} from "./context-preparation-coordinator.js";
import { CompactionCoordinator, type CompactionRunResult } from "./compaction-coordinator.js";
import { CompactionProvenanceResolver } from "./compaction-provenance-resolver.js";
import {
  COMPACTION_SUMMARIZER_PROMPT_REVISION,
  ModelBackedCompactionSummarizer,
} from "./model-backed-compaction-summarizer.js";
import {
  createModelInvocationTimeoutMaterial,
  type ModelInvocationTimeoutPolicy,
} from "./model-invocation-timeout-policy.js";
import {
  ReasoningAwareContextRequestFinalizer,
  TaskReasoningRequestMaterializer,
} from "./task-reasoning-request-materializer.js";
import {
  CpcInstructionFoundationError,
} from "./instruction-bundle-domain.js";
import type {
  TaskLockedInstructionRuntimeMaterial,
} from "./task-locked-instruction-runtime.js";
import type { TaskLockedInstructionRuntimeResolver } from
  "./task-locked-instruction-runtime.js";
import {
  DynamicRequestFactsError,
  dynamicRequestFactsSafeSummary,
  mainDynamicRequestFactsSubject,
  type DynamicRequestFactsRuntime,
  type DynamicRequestFactsV1,
} from "./dynamic-request-facts.js";
import { RoundOutputRequirementError } from "./round-output-requirement.js";
import { ExactModelCapabilityProfileError } from
  "./exact-model-capability-profile.js";
import type { ReadableAgentDefinitionRevision } from "./agent-definition-v1alpha2.js";
import { clampEnterpriseInvocationDeadline } from "./agent-turn-timeout-policy.js";
import type { TaskContextBudgetResolver } from "./task-context-budget-resolver.js";
import type { RoundOutputMaterial } from "./round-output-requirement.js";
import type { ContextBudgetPolicy } from "./context-budget-policy.js";
import { ContextMaterialIdentityError } from "./context-material-policy.js";

export interface ExecutionAgentRevisionRepository {
  loadAgentRevision(
    agentDefinitionId: string,
    revision: string,
  ): Promise<ReadableAgentDefinitionRevision | undefined>;
}

export interface RoundOutputMaterialResolver {
  resolve(input: Readonly<{
    taskId: string;
    sessionId: string;
    round: number;
    modelLock: TaskCapabilityLock;
    conversationMessages: ContextPipelineInput["conversationMessages"];
  }>): Promise<RoundOutputMaterial | undefined>;
}

type StartInput = Parameters<AgentLoopStarter["start"]>[0];

type StartupRecoverySeed = AgentLoopRecoverySeed & Readonly<{
  runId: string;
  stepId: string;
  actionId: string;
  runtimeSelectionDigest: string;
  modelRequestId: string;
  modelRequestDigest: string;
  providerRequestDeadlineAt: string;
}>;

export type CompactionRecoveryFaultPoint =
  | "compaction.admission_authorized_before_request"
  | "compaction.context_prepared_before_model_invocation";

/**
 * DCF-1.2 production binding for the durable SubmitTurn hand-off. It does not
 * create another Agent Loop: it validates the persisted SubmitTurn bundle,
 * builds the existing KAF-5 Context Pipeline and invokes AgentLoopCoordinator.
 */
export class DurableAgentLoopStarter implements AgentLoopStarter {
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #conversation: ConversationPersistence;
  readonly #tasks: TaskPersistence;
  readonly #agents: ExecutionAgentRevisionRepository;
  readonly #loop: AgentLoopCoordinator;
  readonly #taskRuntime: DurableTaskRuntime;
  readonly #coordination: SubmitTurnPersistence | undefined;
  readonly #ephemeralEvents: DesktopEphemeralEventBus | undefined;
  readonly #modelProviders: TaskLockedModelProviderResolver | undefined;
  readonly #modelAdmission: ModelInvocationAdmission | undefined;
  readonly #modelProvenance: ModelContextProvenanceClassifier | undefined;
  readonly #localPersonalTimeoutPolicy: ModelInvocationTimeoutPolicy | undefined;
  readonly #contextPreparation: ContextPreparationCoordinator;
  readonly #contextBudgets: TaskContextBudgetResolver | undefined;
  readonly #roundOutputMaterial: RoundOutputMaterialResolver | undefined;
  readonly #instructionRuntime: TaskLockedInstructionRuntimeResolver | undefined;
  readonly #dynamicRequestFacts: DynamicRequestFactsRuntime | undefined;
  readonly #modelInvocationLinks: ModelInvocationLinkPersistence | undefined;
  readonly #scheduler: Scheduler;
  readonly #tokenEstimator: TokenEstimator;
  readonly #compactionRecoveryFaultInjector:
    | ((point: CompactionRecoveryFaultPoint) => void)
    | undefined;
  readonly #mailboxes = new Map<string, Promise<void>>();
  readonly #identities = new Map<string, string>();
  readonly #activeRuns = new Map<string, AbortController>();

  constructor(input: {
    clock: Clock;
    ids: IdGenerator;
    conversation: ConversationPersistence;
    tasks: TaskPersistence;
    agents: ExecutionAgentRevisionRepository;
    snapshots: TurnSnapshotBuilder;
    context: ContextPipeline;
    contextBudgetResolver?: TaskContextBudgetResolver;
    roundOutputMaterialResolver?: RoundOutputMaterialResolver;
    loop: AgentLoopCoordinator;
    taskRuntime: DurableTaskRuntime;
    coordination?: SubmitTurnPersistence;
    ephemeralEvents?: DesktopEphemeralEventBus;
    adapterHandles?: RuntimeAdapterHandles;
    modelProviderResolver?: TaskLockedModelProviderResolver;
    modelAdmission?: ModelInvocationAdmission;
    modelProvenance?: ModelContextProvenanceClassifier;
    localPersonalTimeoutPolicy?: ModelInvocationTimeoutPolicy;
    instructionRuntimeResolver?: TaskLockedInstructionRuntimeResolver;
    dynamicRequestFactsRuntime?: DynamicRequestFactsRuntime;
    modelInvocationLinks?: ModelInvocationLinkPersistence;
    scheduler: Scheduler;
    tokenEstimator: TokenEstimator;
    compactionRecoveryFaultInjector?: (point: CompactionRecoveryFaultPoint) => void;
  }) {
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#conversation = input.conversation;
    this.#tasks = input.tasks;
    this.#agents = input.agents;
    this.#loop = input.loop;
    this.#taskRuntime = input.taskRuntime;
    this.#coordination = input.coordination;
    this.#ephemeralEvents = input.ephemeralEvents;
    this.#modelProviders = input.modelProviderResolver
      ?? (input.adapterHandles === undefined
        ? undefined
        : new RuntimeAdapterTaskLockedModelProviderResolver(input.adapterHandles));
    this.#modelAdmission = input.modelAdmission;
    this.#modelProvenance = input.modelProvenance;
    this.#localPersonalTimeoutPolicy = input.localPersonalTimeoutPolicy;
    this.#instructionRuntime = input.instructionRuntimeResolver;
    this.#dynamicRequestFacts = input.dynamicRequestFactsRuntime;
    this.#modelInvocationLinks = input.modelInvocationLinks;
    this.#scheduler = input.scheduler;
    this.#tokenEstimator = input.tokenEstimator;
    this.#contextBudgets = input.contextBudgetResolver;
    this.#roundOutputMaterial = input.roundOutputMaterialResolver;
    this.#compactionRecoveryFaultInjector = input.compactionRecoveryFaultInjector;
    this.#contextPreparation = new ContextPreparationCoordinator({
      conversation: input.conversation,
      snapshots: input.snapshots,
      context: input.context,
    });
  }

  start(input: StartInput): Promise<AgentLoopStartResult> {
    return this.#enqueue(input.submitTurnCommandId, () => this.#start(input, false));
  }

  cancel(taskId: string): void {
    this.#activeRuns.get(taskId)?.abort();
  }

  async resume(taskId: string): Promise<void> {
    const binding = await this.#tasks.loadSubmitTurnBindingByTaskId(taskId);
    const task = await this.#tasks.loadTask(taskId);
    if (
      binding === undefined
      || task?.checkpoint.state.sessionId === undefined
    ) {
      throw new Error("Task continuation facts are unavailable");
    }
    await this.#enqueue(`task-control:${taskId}`, async () => {
      await this.#start({
        submitTurnCommandId: binding.submitTurnCommandId,
        taskId,
        runtimeSelectionId: binding.runtimeSelectionId,
        sessionId: task.checkpoint.state.sessionId!,
        userMessageId: binding.userMessageId,
      }, true);
    });
  }

  async resumeFromStartup(taskId: string): Promise<void> {
    await this.#enqueue(`startup-recovery:${taskId}`, async () => {
      const recovery = await this.#buildStartupRecovery(taskId);
      await this.#start(recovery.input, true, recovery.seed);
    });
  }

  async #buildStartupRecovery(taskId: string): Promise<Readonly<{
    input: StartInput;
    seed: StartupRecoverySeed;
  }>> {
    if (this.#modelInvocationLinks === undefined) {
      throw new Error("Agent Loop startup recovery link authority is unavailable");
    }
    const binding = await this.#tasks.loadSubmitTurnBindingByTaskId(taskId);
    const task = await this.#tasks.loadTask(taskId);
    const state = task?.checkpoint.state;
    if (
      binding === undefined
      || state === undefined
      || state.status !== "running"
      || state.sessionId === undefined
    ) throw new Error("Agent Loop startup recovery Task is not eligible");
    const run = state.runs.find((candidate) =>
      candidate.runId === state.activeRunId
      && candidate.status === "running");
    const step = run?.steps.find((candidate) =>
      candidate.stepId === run.activeStepId
      && candidate.status === "running"
      && candidate.action.kind === "model.generate");
    if (run === undefined || step === undefined) {
      throw new Error("Agent Loop startup recovery active execution is unavailable");
    }
    const matches = (await this.#modelInvocationLinks.listIncomplete(1_000)).filter((link) =>
      link.taskId === taskId
      && link.runId === run.runId
      && link.stepId === step.stepId
      && link.actionId === step.action.actionId);
    if (matches.length !== 1) {
      throw new Error("Agent Loop startup recovery invocation identity is ambiguous");
    }
    const link = matches[0]!;
    if (
      link.invocationId === undefined
      || link.messageCommittedAt !== undefined
      || link.outputStartedAt !== undefined
      || link.providerRequestDeadlineAt === undefined
    ) throw new Error("Agent Loop startup recovery invocation is outside the safe window");
    const head = await this.#conversation.loadSession(state.sessionId);
    if (head === undefined) throw new Error("Agent Loop startup recovery Session is unavailable");
    const messages = await loadMessages(this.#conversation, state.sessionId);
    const evidence = head.messageSequence === 0 ? []
      : await this.#conversation.listToolCallBatchEvidenceBySessionRange(
        state.sessionId,
        1,
        head.messageSequence,
      );
    const seed = buildAgentLoopStartupRecoverySeed({
      taskId,
      runId: run.runId,
      stepId: step.stepId,
      actionId: step.action.actionId,
      link,
      messages,
      evidence,
    });
    return Object.freeze({
      input: Object.freeze({
        submitTurnCommandId: binding.submitTurnCommandId,
        taskId,
        runtimeSelectionId: binding.runtimeSelectionId,
        sessionId: state.sessionId,
        userMessageId: binding.userMessageId,
      }),
      seed,
    });
  }

  async #start(
    input: StartInput,
    forceContinuation: boolean,
    recoverySeed?: StartupRecoverySeed,
  ): Promise<AgentLoopStartResult> {
    const identityDigest = sha256CanonicalJson(JsonValueSchema.parse(input));
    const existingIdentity = this.#identities.get(input.submitTurnCommandId);
    if (existingIdentity !== undefined && existingIdentity !== identityDigest) {
      throw new Error("Agent Loop start identity conflict");
    }
    this.#identities.set(input.submitTurnCommandId, identityDigest);

    const bundle = await this.#tasks.loadExecutableSubmitTurnTaskBundle(
      input.submitTurnCommandId,
    );
    if (
      bundle === undefined
      || bundle.task.head.taskId !== input.taskId
      || bundle.runtimeSelection.runtimeSelectionId !== input.runtimeSelectionId
      || bundle.binding.userMessageId !== input.userMessageId
      || bundle.task.checkpoint.state.sessionId !== input.sessionId
    ) {
      throw new Error("Agent Loop start identity does not match the durable Task bundle");
    }
    if (
      recoverySeed !== undefined
      && bundle.runtimeSelection.selectionDigest !== recoverySeed.runtimeSelectionDigest
    ) throw new Error("Agent Loop recovery Runtime Selection digest drifted");
    const agent = await this.#agents.loadAgentRevision(
      bundle.runtimeSelection.agent.agentDefinitionId,
      bundle.runtimeSelection.agent.revision,
    );
    if (
      agent === undefined
      || agent.digest !== bundle.runtimeSelection.agent.digest
    ) {
      throw new Error("Locked Agent Definition revision is unavailable");
    }

    const head = await this.#conversation.loadSession(input.sessionId);
    if (head === undefined) throw new Error("Agent Loop Session is unavailable");
    const currentMessages = await loadMessages(this.#conversation, input.sessionId);
    const modelLock = bundle.capabilityLocks.find((lock) =>
      lock.lockId === bundle.runtimeSelection.resolvedModelLock.lockId
    );
    if (modelLock === undefined) {
      throw new Error("Locked Model Capability is unavailable");
    }
    const reasoningSelection = bundle.runtimeSelection.schemaVersion === "v1alpha2"
      ? TaskRuntimeSelectionV1Alpha2Schema.parse(bundle.runtimeSelection)
      : bundle.runtimeSelection.schemaVersion === "v1alpha4"
        ? TaskRuntimeSelectionV1Alpha4Schema.parse(bundle.runtimeSelection)
        : undefined;
    const reasoningMaterializer = reasoningSelection === undefined
      ? undefined
      : new TaskReasoningRequestMaterializer();
    const reasoningFinalizer = reasoningMaterializer === undefined
      ? undefined
      : new ReasoningAwareContextRequestFinalizer(reasoningMaterializer);
    const existingAssistant = terminalAssistant(currentMessages, input.taskId);
    if (existingAssistant !== undefined && !forceContinuation) {
      await this.#modelProviders?.reconcileMessageCommitted?.({
        taskId: input.taskId,
        modelLock,
        assistantMessageId: existingAssistant.envelope.messageId,
        committedAt: existingAssistant.envelope.createdAt,
      });
      await this.#completeTaskExecution(input.taskId);
      await this.#ensureMessageDelivery(input, existingAssistant);
      return { replayed: true };
    }
    let instructionRuntime: TaskLockedInstructionRuntimeMaterial;
    try {
      instructionRuntime = this.#instructionRuntime === undefined
        ? legacyInstructionRuntime(agent)
        : await this.#instructionRuntime.resolve({
          runtimeSelection: bundle.runtimeSelection,
          submitTurnBundleDigest: bundle.binding.bundleDigest,
          agent,
        });
    } catch (error) {
      if (error instanceof CpcInstructionFoundationError) {
        await this.#failTaskExecution(input.taskId, cpcSafeSummary(error.code), {
          code: error.code,
          category: "validation",
          retryable: false,
        });
      }
      throw error;
    }
    const userMessage = currentMessages.find((message) =>
      message.envelope.messageId === input.userMessageId
      && message.envelope.taskId === input.taskId
      && message.message.role === "user");
    if (userMessage === undefined) {
      throw new Error("Agent Loop user Message is unavailable");
    }
    const toolLocks = bundle.runtimeSelection.toolLocks.map((reference) => {
      const lock = bundle.capabilityLocks.find((candidate) => candidate.lockId === reference.lockId);
      if (
        lock === undefined
        || lock.definitionSnapshot.kind !== "tool"
        || lock.definitionSnapshot.capabilityId !== reference.capabilityId
        || sha256CanonicalJson(JsonValueSchema.parse(lock)) !== reference.lockDigest
      ) {
        throw new Error("Locked Tool Capability does not match the exact Task runtime selection");
      }
      return { reference, lock };
    });
    const toolNames = toolLocks.map(({ lock }) => lock.definitionSnapshot.name);
    if (new Set(toolNames).size !== toolNames.length) {
      throw new Error("Locked Tool names must be unique within one Model request");
    }
    const resolvedModel = await this.#modelProviders?.resolve({
      taskId: input.taskId,
      runtimeSelection: bundle.runtimeSelection,
      modelLock,
      purpose: "assistant_message",
    });
    const model = resolvedModel?.provider;
    const externalTarget = resolvedModel?.externalTarget
      ?? modelLock.adapterDescriptorSnapshot.implementationRef;
    let execution = await this.#ensureTaskExecution(input.taskId);
    if (
      recoverySeed !== undefined
      && (
        execution.runId !== recoverySeed.runId
        || execution.stepId !== recoverySeed.stepId
        || execution.actionId !== recoverySeed.actionId
      )
    ) throw new Error("Agent Loop recovery active execution drifted");
    if (this.#activeRuns.has(input.taskId)) {
      throw new Error("Agent Loop already has an active execution for this Task");
    }
    const abort = new AbortController();
    this.#activeRuns.set(input.taskId, abort);
    const deadlineTask = this.#scheduleTaskDeadline(
      input.taskId,
      execution.deadlineAt,
      abort,
    );

    const roundContext = new Map<number, Readonly<{
      receipt: ReturnType<ContextPipeline["run"]>["receipt"];
      messages: readonly ConversationMessage[];
      assistantProvenance: readonly AssistantMessageProvenance[];
      compactionSummaryProvenance?: CompactionSummaryProvenance;
      dynamicRequestFacts?: DynamicRequestFactsV1;
    }>>();
    const roundExecutions = new Map<number, Readonly<{
      runId: string;
      stepId: string;
      actionId: string;
    }>>();
    let activeCompactionAuthorization: Awaited<ReturnType<typeof authorizeCompaction>> | undefined;
    const provenanceResolver = new CompactionProvenanceResolver(this.#conversation);
    const compactionCoordinator = model === undefined
      ? undefined
      : new CompactionCoordinator({
        persistence: this.#conversation,
        clock: this.#clock,
        idGenerator: this.#ids,
        summarizerResolver: {
          resolve: async ({ job, binding }) => {
            const authorization = activeCompactionAuthorization;
            const authorizationUsesReasoning = authorization?.executionBinding
              .modelRequestProtocolVersion === "v1alpha2";
            if (
              authorization === undefined
              || authorization.sourceDigest !== job.sourceDigest
              || authorization.executionBinding.taskId !== binding.taskId
              || authorization.executionBinding.runtimeSelectionDigest !== binding.runtimeSelectionDigest
              || authorization.executionBinding.modelLockDigest !== binding.modelLockDigest
              || authorization.executionBinding.registryRevision !== binding.registryRevision
              || authorization.executionBinding.adapterDescriptorId !== binding.adapterDescriptorId
              || authorization.executionBinding.adapterDescriptorRevision !== binding.adapterDescriptorRevision
              || authorization.executionBinding.externalTargetDigest !== binding.externalTargetDigest
              || authorization.executionBinding.summarizerPromptRevision !== binding.summarizerPromptRevision
              || authorizationUsesReasoning !== (binding.schemaVersion === "v1alpha2")
              || (binding.schemaVersion === "v1alpha2"
                && (
                  authorization.executionBinding.reasoningModeLockId
                    !== binding.reasoningModeLockId
                  || authorization.executionBinding.reasoningModeLockDigest
                    !== binding.reasoningModeLockDigest
                  || authorization.executionBinding.modelRequestProtocolVersion
                    !== binding.modelRequestProtocolVersion
                ))
            ) throw new Error("Compaction summarizer authorization does not match its immutable Binding");
            const exact = await this.#modelProviders?.resolve({
              taskId: input.taskId,
              runtimeSelection: bundle.runtimeSelection,
              modelLock,
              purpose: "compaction_summary",
            });
            const exactProvider = exact?.provider ?? model;
            if (exact !== undefined
              && (exact.exactLockDigest !== binding.modelLockDigest
                || sha256CanonicalJson(JsonValueSchema.parse(exact.externalTarget))
                  !== binding.externalTargetDigest)) {
              throw new Error("Compaction Provider does not match its immutable Binding");
            }
            return new ModelBackedCompactionSummarizer({
              provider: exactProvider,
              modelLock,
              links: this.#conversation,
              estimator: this.#tokenEstimator,
              now: () => this.#clock.now(),
              ...(reasoningSelection === undefined || reasoningMaterializer === undefined
                ? {}
                : {
                  requestMaterializer: (request) => reasoningMaterializer.materialize({
                    baseRequest: request,
                    runtimeSelection: reasoningSelection,
                    modelLock,
                  }),
                }),
              ...(this.#dynamicRequestFacts === undefined
                ? {}
                : { dynamicRequestFactsRuntime: this.#dynamicRequestFacts }),
              invocation: async (request) => {
                const timeout = this.#invocationTimeout(
                  exact?.authority ?? resolvedModel?.authority,
                  execution.deadlineAt,
                );
                return {
                  purpose: "compaction_summary",
                  compactionJobId: job.compactionJobId,
                  executionBindingDigest: binding.bindingDigest,
                  sessionId: input.sessionId,
                  taskId: input.taskId,
                  runId: authorization.execution.runId,
                  stepId: authorization.execution.stepId,
                  actionId: authorization.execution.actionId,
                  round: authorization.round,
                  runtimeSelection: bundle.runtimeSelection,
                  modelLock,
                  modelRequest: request,
                  deadlineAt: timeout.deadlineAt,
                  ...(timeout.timeout === undefined ? {} : { timeout: timeout.timeout }),
                  externalTarget: exact?.externalTarget ?? externalTarget,
                  dataCategories: authorization.dataCategories,
                  dataScopeDigest: authorization.dataScopeDigest,
                  admission: authorization.admission,
                };
              },
            });
          },
        },
      });

    const authorizeCompaction = async (facts: Readonly<{
      sourceStartSequence: number;
      sourceEndSequence: number;
      sourceDigest: string;
      activeCompactionId?: string;
    }>, round: number) => {
      const executionForRound = roundExecutions.get(round) ?? execution;
      const sourceMessages = await this.#conversation.loadMessageRange(
        input.sessionId,
        facts.sourceStartSequence,
        facts.sourceEndSequence,
      );
      const assistantProvenance = await exactAssistantProvenance(
        sourceMessages,
        this.#tasks,
      );
      const base = facts.activeCompactionId === undefined
        ? undefined
        : await this.#conversation.loadCompactionRecord(facts.activeCompactionId);
      const classified = await provenanceResolver.resolve({
        taskId: input.taskId,
        runId: executionForRound.runId,
        round,
        sessionId: input.sessionId,
        sourceStartSequence: facts.sourceStartSequence,
        sourceEndSequence: facts.sourceEndSequence,
        sourceDigest: facts.sourceDigest,
        ...(facts.activeCompactionId === undefined ? {} : { baseActiveCompactionId: facts.activeCompactionId }),
        ...(base === undefined ? {} : { baseSummaryDigest: sha256CanonicalJson(JsonValueSchema.parse(base.summary)) }),
        runtimeSelection: bundle.runtimeSelection,
        modelLock,
        externalTarget,
        summarizerPromptRevision: COMPACTION_SUMMARIZER_PROMPT_REVISION,
        assistantProvenance,
      });
      const admission = this.#modelAdmission === undefined
        ? syntheticLocalAdmission(input.taskId, round, classified.dataScopeDigest)
        : await this.#modelAdmission.authorize({
          taskId: input.taskId,
          runId: executionForRound.runId,
          stepId: executionForRound.stepId,
          actionId: executionForRound.actionId,
          runtimeSelection: bundle.runtimeSelection,
          modelLock,
          externalTarget,
          dataCategories: classified.dataCategories,
          dataScopeDigest: classified.dataScopeDigest,
        });
      return Object.freeze({
        sourceDigest: facts.sourceDigest,
        execution: executionForRound,
        round,
        dataCategories: classified.dataCategories,
        dataScopeDigest: classified.dataScopeDigest,
        admission,
        executionBinding: {
          taskId: input.taskId,
          runtimeSelectionId: bundle.runtimeSelection.runtimeSelectionId,
          runtimeSelectionDigest: bundle.runtimeSelection.selectionDigest,
          modelLockId: modelLock.lockId,
          modelCapabilityId: modelLock.definitionSnapshot.capabilityId,
          modelLockDigest: sha256CanonicalJson(JsonValueSchema.parse(modelLock)),
          registryRevision: bundle.runtimeSelection.registryRevision,
          adapterDescriptorId: modelLock.adapterDescriptorSnapshot.adapterDescriptorId,
          adapterDescriptorRevision: modelLock.adapterDescriptorSnapshot.revision,
          externalTargetDigest: sha256CanonicalJson(JsonValueSchema.parse(externalTarget)),
          summarizerPromptRevision: COMPACTION_SUMMARIZER_PROMPT_REVISION,
          ...(reasoningSelection === undefined
            ? {}
            : {
              reasoningModeLockId:
                reasoningSelection.reasoningModeLock.reasoningModeLockId,
              reasoningModeLockDigest:
                reasoningSelection.reasoningModeLock.reasoningModeLockDigest,
              modelRequestProtocolVersion: "v1alpha2" as const,
            }),
          },
      });
    };
    try {
      const result = await this.#loop.run({
        ...(model === undefined ? {} : { model }),
        sessionId: input.sessionId,
        taskId: input.taskId,
        runId: execution.runId,
        signal: abort.signal,
        now: () => this.#clock.now(),
        ...(recoverySeed === undefined ? {} : { recoverySeed }),
        createAssistantMessageId: () => this.#ids.next(),
        onTextDelta: ({ messageId, deltaSequence, delta }) => {
          if (messageId === undefined) return;
          this.#ephemeralEvents?.publish({
            type: "assistant_token_delta",
            sessionId: `session:${input.sessionId}`,
            messageId: `message:${messageId}`,
            deltaSequence,
            delta,
          });
        },
        onModelProgress: ({ round, phase }) => {
          const presentation = presentModelProgress(phase, round);
          this.#ephemeralEvents?.publish({
            type: "progress_delta",
            taskId: `task:${input.taskId}`,
            progressKey: presentation.progressKey,
            safeSummary: presentation.safeSummary,
          });
        },
        buildRequest: async (round) => {
          execution = await this.#ensureTaskExecution(input.taskId);
          roundExecutions.set(round, execution);
          const requestIdentity = [
            input.taskId,
            execution.runId,
            execution.stepId,
            execution.actionId,
            String(round),
          ].join(":");
          let snapshotOrdinal = 0;
          let requestOrdinal = 0;
          const dynamicRequestFacts = this.#dynamicRequestFacts === undefined
            ? undefined
            : model === undefined
              ? (() => {
                throw new DynamicRequestFactsError(
                  "context.dynamic_facts_unavailable",
                  "The locked Provider is unavailable for controlled request facts",
                );
              })()
              : await this.#dynamicRequestFacts.resolve({
                provider: model,
                subject: mainDynamicRequestFactsSubject({
                  taskId: input.taskId,
                  runId: execution.runId,
                  round,
                }),
              });
          const outputMaterial = this.#roundOutputMaterial === undefined
            ? undefined
            : await this.#roundOutputMaterial.resolve({
              taskId: input.taskId,
              sessionId: input.sessionId,
              round,
              modelLock,
              conversationMessages: await loadMessages(
                this.#conversation,
                input.sessionId,
              ),
            });
          const contextBudget = this.#contextBudgets?.resolve({
            modelLock,
            ...(outputMaterial === undefined ? {} : { outputMaterial }),
            allowLegacyTaskLock: true,
          });
          const prepared = await this.#contextPreparation.prepare({
            sessionId: input.sessionId,
            snapshotId: () => {
              this.#ids.next();
              snapshotOrdinal += 1;
              return stableUuid(requestIdentity, `turn-snapshot:${snapshotOrdinal}`);
            },
            requestId: () => {
              this.#ids.next();
              requestOrdinal += 1;
              return stableUuid(requestIdentity, `model-request:${requestOrdinal}`);
            },
            createdAt: () => this.#clock.now(),
            pipelineInput: (facts) => ({
              phase: round === 1 ? "pre_call" : "mid_turn",
              requestId: facts.requestId,
              snapshot: facts.snapshot,
              conversationMessages: facts.messages,
              ...(facts.compactionSummary === undefined ? {} : { compactionSummary: facts.compactionSummary }),
              toolCallBatches: facts.toolCallBatches,
              model: {
                capabilityId: bundle.runtimeSelection.resolvedModelLock.capabilityId,
                capabilityRevision: modelLock.definitionSnapshot.revision,
              },
              ...instructionContext(
                instructionRuntime,
                facts.snapshot.snapshotId,
                agent,
                contextBudget?.policy,
              ),
              ...(contextBudget === undefined
                ? {}
                : { budgetPolicy: contextBudget.policy }),
              ...(dynamicRequestFacts === undefined
                ? {}
                : { dynamicRequestFacts }),
              toolCandidates: toolSchemaCandidates({
                snapshotId: facts.snapshot.snapshotId,
                runtimeSelection: bundle.runtimeSelection,
                toolLocks,
              }),
            }),
            authorizeAndCompact: async (facts): Promise<CompactionRunResult> => {
              if (compactionCoordinator === undefined) {
                return { status: "rejected", errorCode: "context.compaction_model_unavailable" };
              }
              const pending = (await this.#conversation.listPendingCompactionJobs())
                .find((job) => job.sessionId === input.sessionId);
              const authorizationFacts = pending === undefined
                ? facts
                : {
                  sourceStartSequence: pending.sourceStartSequence,
                  sourceEndSequence: pending.sourceEndSequence,
                  sourceDigest: pending.sourceDigest,
                  ...(pending.baseActiveCompactionId === undefined
                    ? {}
                    : { activeCompactionId: pending.baseActiveCompactionId }),
                };
              activeCompactionAuthorization = await authorizeCompaction(authorizationFacts, round);
              if (pending !== undefined) {
                return (await compactionCoordinator.recoverSessionPending(input.sessionId, abort.signal))!;
              }
              this.#compactionRecoveryFaultInjector?.(
                "compaction.admission_authorized_before_request",
              );
              return compactionCoordinator.compact({
                sessionId: input.sessionId,
                sourceStartSequence: facts.sourceStartSequence,
                sourceEndSequence: facts.sourceEndSequence,
                executionBinding: activeCompactionAuthorization.executionBinding,
                signal: abort.signal,
              });
            },
          });
          const compactionSummaryProvenance = prepared.context.receipt.compactionSummaryEvidence === undefined
            ? undefined
            : await verifyCompactionSummaryProvenance({
              evidence: prepared.context.receipt.compactionSummaryEvidence,
              taskId: input.taskId,
              runId: execution.runId,
              round,
              runtimeSelection: bundle.runtimeSelection,
              modelLock,
              externalTarget,
              persistence: this.#conversation,
              tasks: this.#tasks,
            });
          if (
            prepared.receipt.decision === "compacted"
            || prepared.receipt.decision === "pending_recovered"
            || prepared.receipt.decision === "stale_reloaded"
          ) {
            this.#compactionRecoveryFaultInjector?.(
              "compaction.context_prepared_before_model_invocation",
            );
          }
          const finalized = reasoningSelection === undefined || reasoningFinalizer === undefined
            ? prepared.context
            : reasoningFinalizer.finalize({
              request: prepared.request,
              receipt: prepared.context.receipt,
              runtimeSelection: reasoningSelection,
              modelLock,
            });
          roundContext.set(round, {
            receipt: finalized.receipt,
            messages: prepared.conversationMessages,
            assistantProvenance: await exactAssistantProvenance(
              prepared.conversationMessages,
              this.#tasks,
            ),
            ...(compactionSummaryProvenance === undefined
              ? {}
              : { compactionSummaryProvenance }),
            ...(dynamicRequestFacts === undefined
              ? {}
              : { dynamicRequestFacts }),
          });
          if (
            recoverySeed !== undefined
            && round === recoverySeed.activeRound
            && (
              finalized.request.requestId !== recoverySeed.modelRequestId
              || finalized.request.requestDigest !== recoverySeed.modelRequestDigest
            )
          ) throw new Error("Agent Loop recovery Model Request digest drifted");
          return finalized.request;
        },
        buildInvocation: async (request, round, assistantMessageId) => {
          const roundExecution = roundExecutions.get(round);
          if (roundExecution === undefined) {
            throw new Error("Model invocation Task execution is unavailable");
          }
          if (this.#modelAdmission === undefined || this.#modelProvenance === undefined) {
            const current = roundContext.get(round);
            const dataScopeDigest = sha256CanonicalJson(JsonValueSchema.parse({
              requestDigest: request.requestDigest,
              taskId: input.taskId,
              round,
            }));
            const timeout = recoverySeed !== undefined
              && round === recoverySeed.activeRound
              ? { deadlineAt: recoverySeed.providerRequestDeadlineAt }
              : this.#invocationTimeout(resolvedModel?.authority, execution.deadlineAt);
            return {
              sessionId: input.sessionId,
              taskId: input.taskId,
              runId: roundExecution.runId,
              stepId: roundExecution.stepId,
              actionId: roundExecution.actionId,
              round,
              runtimeSelection: bundle.runtimeSelection,
              modelLock,
              modelRequest: request,
              assistantMessageId,
              deadlineAt: timeout.deadlineAt,
              ...(timeout.timeout === undefined ? {} : { timeout: timeout.timeout }),
              externalTarget,
              dataCategories: instructionRuntime.mode === "cpc_v1"
                && instructionRuntime.bundle.sources.some((source) => source.sourceKind === "skill")
                ? ["platform_agent_instructions", "skill_content", "tool_schema", "user_text"]
                : ["user_text", "platform_agent_instructions", "tool_schema"],
              dataScopeDigest,
              admission: {
                type: "user_confirmed" as const,
                confirmationId: "00000000-0000-4000-8000-000000000000",
                scopeDigest: dataScopeDigest,
                confirmationDigest: sha256CanonicalJson(JsonValueSchema.parse({
                  localModelInvocation: true,
                  dataScopeDigest,
                })),
              },
              ...(current?.dynamicRequestFacts === undefined
                ? {}
                : {
                  dynamicContext: {
                    facts: current.dynamicRequestFacts,
                    contextAssemblyReceiptDigest: sha256CanonicalJson(
                      JsonValueSchema.parse(current.receipt),
                    ),
                  },
                }),
            };
          }
          const current = roundContext.get(round);
          if (current === undefined) {
            throw new Error("Model invocation context receipt is unavailable");
          }
          const classified = this.#modelProvenance.classify({
            receipt: current.receipt,
            conversationMessages: current.messages,
            runtimeSelection: bundle.runtimeSelection,
            modelLock,
            externalTarget,
            assistantProvenance: current.assistantProvenance,
            ...(current.compactionSummaryProvenance === undefined
              ? {}
              : { compactionSummaryProvenance: current.compactionSummaryProvenance }),
          });
          const admission = await this.#modelAdmission.authorize({
            taskId: input.taskId,
            runId: roundExecution.runId,
            stepId: roundExecution.stepId,
            actionId: roundExecution.actionId,
            runtimeSelection: bundle.runtimeSelection,
            modelLock,
            externalTarget,
            dataCategories: classified.dataCategories,
            dataScopeDigest: classified.dataScopeDigest,
          });
          const timeout = recoverySeed !== undefined
            && round === recoverySeed.activeRound
            ? { deadlineAt: recoverySeed.providerRequestDeadlineAt }
            : this.#invocationTimeout(resolvedModel?.authority, execution.deadlineAt);
          return {
            sessionId: input.sessionId,
            taskId: input.taskId,
            runId: roundExecution.runId,
            stepId: roundExecution.stepId,
            actionId: roundExecution.actionId,
            round,
            runtimeSelection: bundle.runtimeSelection,
            modelLock,
            modelRequest: request,
            assistantMessageId,
            deadlineAt: timeout.deadlineAt,
            ...(timeout.timeout === undefined ? {} : { timeout: timeout.timeout }),
            externalTarget,
            dataCategories: classified.dataCategories,
            dataScopeDigest: classified.dataScopeDigest,
            admission,
            ...(current.dynamicRequestFacts === undefined
              ? {}
              : {
                dynamicContext: {
                  facts: current.dynamicRequestFacts,
                  contextAssemblyReceiptDigest: sha256CanonicalJson(
                    JsonValueSchema.parse(current.receipt),
                  ),
                },
              }),
          };
        },
        onModelRoundCompleted: async ({ round, finishReason }) => {
          const roundExecution = roundExecutions.get(round);
          if (roundExecution === undefined) {
            throw new Error("Completed Model round has no Task execution");
          }
          await this.#completeActiveStep(input.taskId, roundExecution, {
            finishReason,
          });
        },
      });
      if (result.status === "failed") {
        if (result.error?.category === "timeout" && execution.deadlineAt !== undefined) {
          await this.#expireTaskExecution(input.taskId, execution.deadlineAt);
        }
        throw new Error(result.error?.message ?? "Agent Loop failed");
      }
      if (result.status === "waiting_user_confirmation") {
        return { replayed: false };
      }
      if (result.status !== "completed") {
        throw new Error(`Agent Loop stopped in ${result.status}`);
      }
    } catch (error) {
      if (error instanceof ContextPreparationAdmissionInterruption) {
        if (error.code === "model.user_confirmation_required") return { replayed: false };
        await this.#failTaskExecution(input.taskId, error.message, {
          code: error.code,
          category: "validation",
          retryable: false,
        });
        throw error.original;
      }
      if (error instanceof ModelInvocationAdmissionPending) {
        return { replayed: false };
      }
      if (error instanceof ModelStreamResumeUnavailableError) {
        await this.#waitForExternalDependency(input.taskId, execution, error.code);
        return { replayed: false };
      }
      if (error instanceof ContextPreparationError) {
        await this.#failTaskExecution(input.taskId, error.safeSummary, {
          code: error.code,
          category: "validation",
          retryable: error.retryable,
        });
        throw error;
      }
      if (error instanceof CpcInstructionFoundationError) {
        await this.#failTaskExecution(input.taskId, cpcSafeSummary(error.code), {
          code: error.code,
          category: "validation",
          retryable: false,
        });
        throw error;
      }
      if (error instanceof DynamicRequestFactsError) {
        await this.#failTaskExecution(input.taskId, dynamicRequestFactsSafeSummary(error.code), {
          code: error.code,
          category: "validation",
          retryable: false,
        });
        throw error;
      }
      if (error instanceof RoundOutputRequirementError) {
        await this.#failTaskExecution(
          input.taskId,
          "当前模型无法一次完整生成这次文件修改，请缩小修改范围或选择输出容量更大的模型。",
          {
            code: error.code,
            category: "validation",
            retryable: false,
          },
        );
        throw error;
      }
      if (error instanceof ExactModelCapabilityProfileError) {
        await this.#failTaskExecution(
          input.taskId,
          "当前任务锁定的模型上下文能力不可用，请新建任务或联系管理员检查模型配置。",
          {
            code: error.code,
            category: "validation",
            retryable: false,
          },
        );
        throw error;
      }
      if (error instanceof ContextMaterialIdentityError) {
        await this.#failTaskExecution(
          input.taskId,
          "任务中的工具结果无法通过完整性校验，请重新执行当前任务。",
          {
            code: error.code,
            category: "validation",
            retryable: false,
          },
        );
        throw error;
      }
      await this.#failTaskExecution(
        input.taskId,
        error instanceof Error ? error.message : "Agent Loop failed",
      );
      throw error;
    } finally {
      deadlineTask?.cancel();
      if (this.#activeRuns.get(input.taskId) === abort) {
        this.#activeRuns.delete(input.taskId);
      }
    }
    const completedMessages = await loadMessages(
      this.#conversation,
      input.sessionId,
    );
    const committedAssistant = terminalAssistant(completedMessages, input.taskId);
    if (committedAssistant === undefined) {
      throw new Error("Agent Loop completed without a durable Assistant Message");
    }
    await this.#completeTaskExecution(input.taskId);
    await this.#ensureMessageDelivery(input, committedAssistant);
    return { replayed: false };
  }

  #invocationTimeout(
    authority: "central_enterprise" | "local_personal" | undefined,
    turnDeadlineAt: string | undefined,
  ): Readonly<{
    deadlineAt: string;
    timeout?: ReturnType<typeof createModelInvocationTimeoutMaterial>;
  }> {
    const now = this.#clock.now();
    if (authority !== "local_personal") {
      return {
        deadlineAt: clampEnterpriseInvocationDeadline(now, turnDeadlineAt),
      };
    }
    if (this.#localPersonalTimeoutPolicy === undefined) {
      throw new Error("Local Personal timeout policy is unavailable in Core composition");
    }
    const timeout = createModelInvocationTimeoutMaterial({
      policy: this.#localPersonalTimeoutPolicy,
      invocationStartedAt: now,
      ...(turnDeadlineAt === undefined ? {} : { outerDeadlineAt: turnDeadlineAt }),
    });
    return { deadlineAt: timeout.invocationDeadlineAt, timeout };
  }

  async #waitForExternalDependency(
    taskId: string,
    execution: Readonly<{ runId: string; stepId: string; actionId: string }>,
    errorCode: string,
  ): Promise<void> {
    const result = await this.#taskRuntime.dispatch({
      commandId: this.#ids.next(),
      taskId,
      type: "wait_step",
      issuedAt: this.#clock.now(),
      runId: execution.runId,
      stepId: execution.stepId,
      reason: "external_dependency",
      context: {
        errorCode,
        reconciliationRequired: true,
      },
    });
    if (!result.accepted) throw new Error(result.error.message);
  }

  async #ensureTaskExecution(taskId: string): Promise<{
    runId: string;
    stepId: string;
    actionId: string;
    deadlineAt?: string;
  }> {
    let state = await this.#taskRuntime.snapshot(taskId);
    if (state === undefined) throw new Error("Agent Loop Task is unavailable");
    if (
      state.deadlineAt !== undefined
      && Date.parse(state.deadlineAt) <= Date.parse(this.#clock.now())
      && ["created", "running", "waiting"].includes(state.status)
    ) {
      await this.#expireTaskExecution(taskId, state.deadlineAt);
      state = await this.#taskRuntime.snapshot(taskId);
      if (state === undefined) throw new Error("Agent Loop Task is unavailable");
    }
    if (state.status === "created") {
      const started = await this.#taskRuntime.dispatch({
        commandId: this.#ids.next(),
        taskId,
        type: "start_run",
        issuedAt: this.#clock.now(),
        runId: this.#ids.next(),
      });
      if (!started.accepted) throw new Error(started.error.message);
      state = started.state;
    }
    if (state.status !== "running") {
      throw new Error(`Agent Loop Task cannot start from ${state.status}`);
    }
    const run = state.runs.find((candidate) =>
      candidate.runId === state.activeRunId);
    if (run === undefined) throw new Error("Agent Loop active Run is unavailable");
    if (run.activeStepId !== undefined) {
      const step = run.steps.find((candidate) => candidate.stepId === run.activeStepId);
      if (step === undefined) throw new Error("Agent Loop active Step is unavailable");
      if (step.action.kind !== "model.generate") {
        throw new Error(`Agent Loop expected an active model Step, found ${step.action.kind}`);
      }
      return {
        runId: run.runId,
        stepId: step.stepId,
        actionId: step.action.actionId,
        ...(state.deadlineAt === undefined ? {} : { deadlineAt: state.deadlineAt }),
      };
    }
    const stepId = this.#ids.next();
    const actionId = this.#ids.next();
    const started = await this.#taskRuntime.dispatch({
      commandId: this.#ids.next(),
      taskId,
      type: "start_step",
      issuedAt: this.#clock.now(),
      runId: run.runId,
      stepId,
      planRevision: {
        executionPlanId: this.#ids.next(),
        planRevisionId: this.#ids.next(),
        revision: 1,
      },
      action: {
        actionId,
        kind: "model.generate",
        payload: {},
      },
    });
    if (!started.accepted) throw new Error(started.error.message);
    return {
      runId: run.runId,
      stepId,
      actionId,
      ...(state.deadlineAt === undefined ? {} : { deadlineAt: state.deadlineAt }),
    };
  }

  #scheduleTaskDeadline(
    taskId: string,
    deadlineAt: string | undefined,
    abort: AbortController,
  ): ScheduledTask | undefined {
    if (deadlineAt === undefined) return undefined;
    const delayMs = Math.max(0, Date.parse(deadlineAt) - Date.parse(this.#clock.now()));
    return this.#scheduler.schedule(delayMs, () => {
      void this.#expireTaskExecution(taskId, deadlineAt)
        .then(() => abort.abort(), () => abort.abort());
    });
  }

  async #expireTaskExecution(taskId: string, deadlineAt: string): Promise<void> {
    const state = await this.#taskRuntime.snapshot(taskId);
    if (state === undefined || !["created", "running", "waiting"].includes(state.status)) return;
    await this.#taskRuntime.dispatch({
      commandId: this.#ids.next(),
      taskId,
      type: "expire_deadline",
      issuedAt: new Date(Math.max(
        Date.parse(deadlineAt),
        Date.parse(this.#clock.now()),
      )).toISOString(),
    });
  }

  async #completeTaskExecution(taskId: string): Promise<void> {
    const state = await this.#taskRuntime.snapshot(taskId);
    if (state === undefined) throw new Error("Agent Loop Task is unavailable");
    if (state.status === "completed") return;
    if (state.status !== "running") {
      throw new Error(`Agent Loop Task cannot complete from ${state.status}`);
    }
    const activeRunId = state.activeRunId;
    let run = state.runs.find((candidate) =>
      candidate.runId === activeRunId);
    if (run === undefined) throw new Error("Agent Loop active Run is unavailable");
    if (run.activeStepId !== undefined) {
      const step = run.steps.find((candidate) =>
        candidate.stepId === run!.activeStepId);
      if (step === undefined) throw new Error("Agent Loop active Step is unavailable");
      await this.#completeActiveStep(taskId, {
        runId: run.runId,
        stepId: step.stepId,
        actionId: step.action.actionId,
      }, {});
      const recordedState = await this.#taskRuntime.snapshot(taskId);
      if (recordedState === undefined) throw new Error("Agent Loop Task is unavailable");
      if (recordedState.activeRunId === undefined) {
        throw new Error("Agent Loop active Run is unavailable");
      }
      run = recordedState.runs.find((candidate) =>
        candidate.runId === recordedState.activeRunId);
    }
    if (run === undefined) throw new Error("Agent Loop Run completion is unavailable");
    const completed = await this.#taskRuntime.dispatch({
      commandId: this.#ids.next(),
      taskId,
      type: "complete_run",
      issuedAt: this.#clock.now(),
      runId: run.runId,
    });
    if (!completed.accepted) throw new Error(completed.error.message);
  }

  async #completeActiveStep(
    taskId: string,
    execution: Readonly<{ runId: string; stepId: string; actionId: string }>,
    output: Record<string, unknown>,
  ): Promise<void> {
    const state = await this.#taskRuntime.snapshot(taskId);
    const run = state?.runs.find((candidate) => candidate.runId === execution.runId);
    const step = run?.steps.find((candidate) => candidate.stepId === execution.stepId);
    if (
      state === undefined
      || state.status !== "running"
      || run === undefined
      || run.status !== "running"
      || run.activeStepId !== execution.stepId
      || step === undefined
      || step.status !== "running"
    ) return;
    const observedAt = this.#clock.now();
    const observation = {
      observationId: this.#ids.next(),
      actionId: execution.actionId,
      observedAt,
      outcome: "succeeded" as const,
      ...(Object.keys(output).length === 0 ? {} : { output: JsonValueSchema.parse(output) }),
    };
    const recorded = await this.#taskRuntime.dispatch({
      commandId: this.#ids.next(),
      taskId,
      type: "record_observation",
      issuedAt: observedAt,
      runId: execution.runId,
      stepId: execution.stepId,
      observation,
    });
    if (!recorded.accepted) throw new Error(recorded.error.message);
  }

  async #failTaskExecution(
    taskId: string,
    message: string,
    details: Readonly<{
      code: string;
      category: "validation" | "provider";
      retryable: boolean;
    }> = {
      code: "agent_loop.failed",
      category: "provider",
      retryable: true,
    },
  ): Promise<void> {
    const state = await this.#taskRuntime.snapshot(taskId);
    if (
      state === undefined
      || !["running", "waiting"].includes(state.status)
      || state.activeRunId === undefined
    ) return;
    await this.#taskRuntime.dispatch({
      commandId: this.#ids.next(),
      taskId,
      type: "fail_run",
      issuedAt: this.#clock.now(),
      runId: state.activeRunId,
      error: {
        code: details.code,
        category: details.category,
        message,
        retryable: details.retryable,
      },
    });
  }

  async #ensureMessageDelivery(
    input: StartInput,
    message: ConversationMessage,
  ): Promise<void> {
    if (this.#coordination === undefined) return;
    const record = await this.#coordination.loadRecord(input.submitTurnCommandId);
    if (record === undefined) {
      throw new Error("SubmitTurnRecord is unavailable for Message delivery");
    }
    const result = await this.#coordination.appendDelivery({
      schemaVersion: "v1alpha1",
      deliveryId: message.envelope.messageId,
      submitTurnCommandId: input.submitTurnCommandId,
      type: "message.committed",
      sessionId: record.desktopSessionId,
      taskId: `task:${input.taskId}`,
      messageId: `message:${message.envelope.messageId}`,
      messageRevision: message.envelope.sequence,
      messageStatus: "completed",
      createdAt: message.envelope.createdAt,
    });
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }
  }

  async #enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#mailboxes.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => next);
    this.#mailboxes.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.#mailboxes.get(key) === tail) this.#mailboxes.delete(key);
    }
  }
}

function presentModelProgress(
  phase: AgentLoopModelProgressPhase,
  round: number,
): Readonly<{ progressKey: string; safeSummary: string }> {
  switch (phase) {
    case "core_context_preparing":
      return {
        progressKey: `core.context_preparing.round_${round}`,
        safeSummary: "正在整理当前任务所需的上下文",
      };
    case "model_request_dispatched":
      return {
        progressKey: `model.request_dispatched.round_${round}`,
        safeSummary: "已向模型发出请求，正在等待响应",
      };
    case "model_stream_started":
      return {
        progressKey: `model.stream_started.round_${round}`,
        safeSummary: "模型已开始处理当前请求",
      };
    case "model_response_streaming":
      return {
        progressKey: `model.response_streaming.round_${round}`,
        safeSummary: "模型正在生成回复",
      };
    case "model_tool_call_preparing":
      return {
        progressKey: `model.tool_call_preparing.round_${round}`,
        safeSummary: "模型正在准备调用已授权工具",
      };
    default:
      return assertNeverModelProgress(phase);
  }
}

function assertNeverModelProgress(value: never): never {
  throw new Error(`Unhandled model progress phase: ${String(value)}`);
}

function legacyInstructionRuntime(
  agent: ReadableAgentDefinitionRevision,
): TaskLockedInstructionRuntimeMaterial {
  const instruction = [
    `Identity: ${agent.identity}`,
    `Goal: ${agent.goal}`,
    agent.instructions,
  ].join("\n\n");
  return Object.freeze({
    mode: "legacy" as const,
    instruction,
    instructionDigest: sha256CanonicalJson(JsonValueSchema.parse(instruction)),
  });
}

function cpcSafeSummary(code: CpcInstructionFoundationError["code"]): string {
  switch (code) {
    case "context.instruction_binding_invalid":
      return "任务的系统指令绑定无效。";
    case "context.instruction_source_invalid":
    case "context.instruction_bundle_invalid":
    case "context.agent_material_invalid":
    case "context.skill_material_invalid":
      return "任务锁定的系统指令无法通过完整性校验。";
    case "context.platform_prompt_unavailable":
    case "context.skill_material_unavailable":
      return "任务锁定的系统指令来源当前不可用。";
    case "context.locked_instructions_too_large":
      return "任务锁定的系统指令超过当前模型的上下文容量。";
    case "context.instruction_runtime_unavailable":
      return "系统指令运行能力当前不可用。";
  }
}

function instructionContext(
  runtime: TaskLockedInstructionRuntimeMaterial,
  snapshotId: string,
  agent: ReadableAgentDefinitionRevision,
  budgetPolicy?: ContextBudgetPolicy,
): Pick<
  ContextPipelineInput,
  "instructions" | "lockedInstructionBundle"
> {
  if (runtime.mode === "legacy") {
    return {
      instructions: [{
        snapshotId,
        sourceId: agent.agentDefinitionId,
        revision: agent.revision,
        contentDigest: runtime.instructionDigest,
        content: runtime.instruction,
        selected: true,
        authorized: true,
      }],
    };
  }
  const decision = budgetPolicy?.decision();
  if (
    decision !== undefined
    && runtime.bundle.estimatedInputTokens > decision.availableInputTokens
  ) {
    throw new CpcInstructionFoundationError(
      "context.locked_instructions_too_large",
      "Locked instructions exceed the exact Model input budget for this round",
    );
  }
  return {
    lockedInstructionBundle: {
      schemaVersion: "v1",
      snapshotId,
      binding: runtime.bundle.binding,
      descriptor: runtime.bundle.descriptor,
      message: runtime.bundle.message,
      estimatedInputTokens: runtime.bundle.estimatedInputTokens,
      availableInputTokens: decision?.availableInputTokens
        ?? runtime.bundle.availableInputTokens,
      budgetPolicyDigest: decision?.policyDigest
        ?? runtime.bundle.budgetPolicyDigest,
    },
  };
}

function toolSchemaCandidates(input: {
  snapshotId: string;
  runtimeSelection: ReadableTaskRuntimeSelectionV1Alpha4;
  toolLocks: readonly {
    reference: ReadableTaskRuntimeSelectionV1Alpha4["toolLocks"][number];
    lock: TaskCapabilityLock;
  }[];
}): readonly ToolSchemaCandidate[] {
  const documentCandidates = documentToolCandidatesForContext({
    snapshotId: input.snapshotId,
    runtimeSelection: input.runtimeSelection,
    locks: input.toolLocks.map(({ lock }) => lock),
    authorization: {
      outcome: "allowed",
      decisionDigest: sha256CanonicalJson(JsonValueSchema.parse({
        runtimeSelectionDigest: input.runtimeSelection.selectionDigest,
        documentToolLockDigests: input.toolLocks
          .filter(({ reference }) => isDocumentToolCapabilityId(reference.capabilityId))
          .map(({ reference }) => reference.lockDigest),
      })),
    },
  });
  const genericCandidates = input.toolLocks
    .filter(({ reference }) => !isDocumentToolCapabilityId(reference.capabilityId))
    .map(({ reference, lock }): ToolSchemaCandidate => ({
      snapshotId: input.snapshotId,
      selected: true,
      authorization: {
        outcome: "allowed",
        decisionDigest: sha256CanonicalJson(JsonValueSchema.parse({
          runtimeSelectionDigest: input.runtimeSelection.selectionDigest,
          lockDigest: reference.lockDigest,
        })),
      },
      lockDigest: reference.lockDigest,
      lock,
      registration: {
        registryRevision: lock.registryRevision,
        capabilityRevision: lock.definitionSnapshot.revision,
        bindingRevision: lock.bindingSnapshot.revision,
        adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
        versionCompatible: true,
      },
    }));
  return Object.freeze([...genericCandidates, ...documentCandidates]);
}

async function loadMessages(
  conversation: ConversationPersistence,
  sessionId: string,
): Promise<readonly ConversationMessage[]> {
  const head = await conversation.loadSession(sessionId);
  if (head === undefined || head.messageSequence === 0) return [];
  return conversation.loadMessageRange(sessionId, 1, head.messageSequence);
}

function terminalAssistant(
  messages: readonly ConversationMessage[],
  taskId: string,
): ConversationMessage | undefined {
  return messages.findLast((message) =>
    message.envelope.taskId === taskId
    && message.message.role === "assistant"
    && message.message.toolCalls.length === 0);
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

export function buildAgentLoopStartupRecoverySeed(input: Readonly<{
  taskId: string;
  runId: string;
  stepId: string;
  actionId: string;
  link: ModelInvocationLink;
  messages: readonly ConversationMessage[];
  evidence: Awaited<ReturnType<ConversationPersistence["listToolCallBatchEvidenceBySessionRange"]>>;
}>): StartupRecoverySeed {
  if (
    input.link.taskId !== input.taskId
    || input.link.runId !== input.runId
    || input.link.stepId !== input.stepId
    || input.link.actionId !== input.actionId
    || input.link.invocationId === undefined
    || input.link.messageCommittedAt !== undefined
    || input.link.outputStartedAt !== undefined
    || input.link.providerRequestDeadlineAt === undefined
  ) throw new Error("Agent Loop startup recovery link does not match the active execution");
  if (input.messages.some((message) =>
    message.envelope.messageId === input.link.assistantMessageId)) {
    throw new Error("Agent Loop startup recovery Assistant Message is already durable");
  }
  const byMessageId = new Map(input.messages.map((message) => [
    message.envelope.messageId,
    message,
  ]));
  if (byMessageId.size !== input.messages.length) {
    throw new Error("Agent Loop startup recovery Message identity is ambiguous");
  }
  const completed = input.evidence
    .filter(({ batch }) => batch.taskId === input.taskId && batch.runId === input.runId)
    .sort((left, right) =>
      left.batch.assistantMessageSequence - right.batch.assistantMessageSequence);
  if (completed.length !== input.link.round - 1) {
    throw new Error("Agent Loop startup recovery completed round count drifted");
  }
  const priorToolResults: Array<Extract<ConversationMessage["message"], { role: "tool" }>> = [];
  for (const { batch, dispositions } of completed) {
    const assistant = byMessageId.get(batch.assistantMessageId);
    if (
      assistant === undefined
      || assistant.message.role !== "assistant"
      || assistant.envelope.taskId !== input.taskId
      || assistant.envelope.sequence !== batch.assistantMessageSequence
      || assistant.envelope.messageDigest !== batch.assistantMessageDigest
      || assistant.message.toolCalls.length !== batch.callCount
      || dispositions.length !== batch.callCount
    ) throw new Error("Agent Loop startup recovery Tool batch is inconsistent");
    const ordered = [...dispositions].sort((left, right) => left.ordinal - right.ordinal);
    for (let ordinal = 0; ordinal < ordered.length; ordinal += 1) {
      const disposition = ordered[ordinal]!;
      const call = assistant.message.toolCalls[ordinal];
      const result = disposition.resultMessageId === undefined
        ? undefined
        : byMessageId.get(disposition.resultMessageId);
      if (
        call === undefined
        || disposition.ordinal !== ordinal
        || disposition.disposition !== "result_committed"
        || disposition.toolCallId !== call.toolCallId
        || disposition.actionId !== call.actionId
        || disposition.resultDigest === undefined
        || result === undefined
        || result.message.role !== "tool"
        || result.envelope.taskId !== input.taskId
        || result.envelope.sequence <= assistant.envelope.sequence
        || result.message.taskId !== input.taskId
        || result.message.toolCallId !== call.toolCallId
        || result.message.actionId !== call.actionId
        || result.message.resultDigest !== disposition.resultDigest
        || result.envelope.messageDigest
          !== sha256CanonicalJson(JsonValueSchema.parse(result.message))
      ) throw new Error("Agent Loop startup recovery Tool Result is not exact");
      priorToolResults.push(result.message);
    }
  }
  if (
    new Set(priorToolResults.map((result) => result.toolCallId)).size
      !== priorToolResults.length
  ) throw new Error("Agent Loop startup recovery Tool Result identity is duplicated");
  return Object.freeze({
    completedRoundCount: input.link.round - 1,
    activeRound: input.link.round,
    activeAssistantMessageId: input.link.assistantMessageId,
    priorToolResults: Object.freeze(priorToolResults.map((result) => ({
      ...result,
      content: result.content.map((part) => ({ ...part })),
    }))),
    runId: input.runId,
    stepId: input.stepId,
    actionId: input.actionId,
    runtimeSelectionDigest: input.link.runtimeSelectionDigest,
    modelRequestId: input.link.modelRequestId,
    modelRequestDigest: input.link.modelRequestDigest,
    providerRequestDeadlineAt: input.link.providerRequestDeadlineAt,
  });
}

async function exactAssistantProvenance(
  messages: readonly ConversationMessage[],
  tasks: TaskPersistence,
): Promise<readonly AssistantMessageProvenance[]> {
  const result: AssistantMessageProvenance[] = [];
  for (const message of messages) {
    if (message.message.role !== "assistant") continue;
    const taskId = message.envelope.taskId;
    if (taskId === undefined) {
      throw new Error("Assistant history lacks a durable Task identity");
    }
    const runtimeSelection = await tasks.loadReadableTaskRuntimeSelection(taskId);
    if (runtimeSelection === undefined) {
      throw new Error("Assistant history lacks a durable Runtime Selection");
    }
    const lock = await tasks.loadTaskCapabilityLock(
      taskId,
      runtimeSelection.resolvedModelLock.capabilityId,
    );
    if (
      lock === undefined
      || lock.lockId !== runtimeSelection.resolvedModelLock.lockId
      || sha256CanonicalJson(JsonValueSchema.parse(lock))
        !== runtimeSelection.resolvedModelLock.lockDigest
    ) throw new Error("Assistant history lacks an exact durable Model lock");
    result.push(Object.freeze({
      messageId: message.envelope.messageId,
      externalTargetDigest: sha256CanonicalJson(JsonValueSchema.parse(
        lock.adapterDescriptorSnapshot.implementationRef,
      )),
      runtimeSelectionDigest: runtimeSelection.selectionDigest,
      modelCapabilityId: lock.definitionSnapshot.capabilityId,
      modelCapabilityRevision: lock.definitionSnapshot.revision,
      modelLockDigest: sha256CanonicalJson(JsonValueSchema.parse(lock)),
      bindingId: lock.bindingSnapshot.bindingId,
      bindingRevision: lock.bindingSnapshot.revision,
      adapterDescriptorId: lock.adapterDescriptorSnapshot.adapterDescriptorId,
      adapterDescriptorRevision: lock.adapterDescriptorSnapshot.revision,
      registryRevision: lock.registryRevision,
    }));
  }
  return Object.freeze(result);
}

function syntheticLocalAdmission(
  taskId: string,
  round: number,
  dataScopeDigest: string,
) {
  return Object.freeze({
    type: "user_confirmed" as const,
    confirmationId: "00000000-0000-4000-8000-000000000000",
    scopeDigest: sha256CanonicalJson(JsonValueSchema.parse({
      localCompactionSummary: true,
      taskId,
      round,
      dataScopeDigest,
    })),
    confirmationDigest: sha256CanonicalJson(JsonValueSchema.parse({
      localCompactionSummaryConfirmed: true,
      taskId,
      round,
      dataScopeDigest,
    })),
  });
}

async function verifyCompactionSummaryProvenance(input: Readonly<{
  evidence: NonNullable<ReturnType<ContextPipeline["run"]>["receipt"]["compactionSummaryEvidence"]>;
  taskId: string;
  runId: string;
  round: number;
  runtimeSelection: ReadableTaskRuntimeSelectionV1Alpha4;
  modelLock: TaskCapabilityLock;
  externalTarget: string;
  persistence: ConversationPersistence;
  tasks: TaskPersistence;
}>): Promise<CompactionSummaryProvenance> {
  const record = await input.persistence.loadCompactionRecord(input.evidence.compactionId);
  if (
    record === undefined
    || record.sourceDigest !== input.evidence.sourceDigest
    || record.sourceStartSequence !== input.evidence.sourceStartSequence
    || record.sourceEndSequence !== input.evidence.sourceEndSequence
  ) throw new Error("Active Compaction Summary evidence is unavailable or changed");
  const source = await input.persistence.loadMessageRange(
    record.sessionId,
    record.sourceStartSequence,
    record.sourceEndSequence,
  );
  const resolved = await new CompactionProvenanceResolver(input.persistence).resolve({
    taskId: input.taskId,
    runId: input.runId,
    round: input.round,
    sessionId: record.sessionId,
    sourceStartSequence: record.sourceStartSequence,
    sourceEndSequence: record.sourceEndSequence,
    sourceDigest: record.sourceDigest,
    ...(record.baseActiveCompactionId === undefined
      ? {}
      : { baseActiveCompactionId: record.baseActiveCompactionId }),
    runtimeSelection: input.runtimeSelection,
    modelLock: input.modelLock,
    externalTarget: input.externalTarget,
    summarizerPromptRevision: record.summarizerPromptRevision,
    assistantProvenance: await exactAssistantProvenance(source, input.tasks),
  });
  return Object.freeze({
    compactionId: record.compactionId,
    sourceDigest: record.sourceDigest,
    dataCategories: resolved.dataCategories,
  });
}
