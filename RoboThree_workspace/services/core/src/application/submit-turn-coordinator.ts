import {
  JsonValueSchema,
  PersistedSubmitTurnReceiptSchema,
  PersistedSubmitTurnReceiptV1Alpha2Schema,
  RuntimeSelectionSummarySchema,
  RuntimeSelectionSummaryV1Alpha2Schema,
  RuntimeSelectionSummaryV1Alpha3Schema,
  SubmitTurnCommandSchema,
  SubmitTurnCommandV1Alpha2Schema,
  SubmitTurnCommandV1Alpha3Schema,
  SubmitTurnReceiptSchema,
  SubmitTurnReceiptV1Alpha2Schema,
  SubmitTurnReceiptV1Alpha3Schema,
  SubmitTurnRecordV1Alpha2Schema,
} from "@robothree/contracts";
import type {
  RuntimeError,
  RuntimeSelectionSummary,
  RuntimeSelectionSummaryV1Alpha2,
  RuntimeSelectionSummaryV1Alpha3,
  SubmitTurnCommand,
  SubmitTurnCommandV1Alpha2,
  SubmitTurnCommandV1Alpha3,
  SubmitTurnReceipt,
  SubmitTurnReceiptV1Alpha2,
  SubmitTurnReceiptV1Alpha3,
  SubmitTurnRecord,
  SubmitTurnRecordV1Alpha2,
  TaskAuthorizationSelection,
  TaskExecutionSelectionIdentity,
} from "@robothree/contracts";
import {
  PersistedSubmitTurnReceiptV1Alpha3Schema,
  ReadableSubmitTurnRecordSchema,
  SubmitTurnRecordV1Alpha3Schema,
  type ReadablePersistedSubmitTurnReceipt,
  type ReadableSubmitTurnRecord,
} from "@robothree/contracts/submit-turn-coordination/v1alpha3";

import type { AgentLoopStarter } from "../ports/agent-loop-starter.js";
import type { Clock } from "../ports/clock.js";
import type { ConversationPersistence } from "../ports/conversation-persistence.js";
import type { DesktopSessionMetadataPersistence } from "../ports/desktop-foundation-persistence.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type {
  RuntimeSelectionContext,
  RuntimeSelectionContextProvider,
} from "../ports/runtime-selection-context-provider.js";
import type {
  DesktopDeliveryDraft,
  SubmitTurnPersistence,
} from "../ports/submit-turn-persistence.js";
import type {
  PersistedAuthorizationAwareSubmitTurnTaskBundle,
  PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle,
  PersistedSubmitTurnTaskBundle,
  TaskPersistence,
} from "../ports/task-persistence.js";
import type { TaskAuthorizationModePolicyProvider } from
  "../ports/task-authorization-mode-policy.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import { createInitialPersistedTask } from "./durable-task-runtime.js";
import { FixedTaskAuthorizationModePolicyProvider } from
  "./fixed-task-authorization-mode-policy.js";
import type {
  PreparedRuntimeSelectionResult,
  PreparedRuntimeSelectionV1Alpha2Result,
  RuntimeSelectionService,
} from "./runtime-selection-service.js";
import {
  hasValidTaskAuthorizationSelection,
  hasValidTaskExecutionSelectionIdentity,
  TaskAuthorizationSelectionService,
} from "./task-authorization-selection-service.js";
import type { TaskAuthorizationRequest } from
  "./task-authorization-selection-service.js";

export type SubmitTurnCoordinatorResult =
  | {
    ok: true;
    receipt: SubmitTurnReceipt | SubmitTurnReceiptV1Alpha2 | SubmitTurnReceiptV1Alpha3;
  }
  | { ok: false; error: RuntimeError };

type SubmitTurnCommandAny =
  | SubmitTurnCommand
  | SubmitTurnCommandV1Alpha2
  | SubmitTurnCommandV1Alpha3;
type PreparedSelection =
  | Extract<PreparedRuntimeSelectionResult, { ok: true }>["value"]
  | Extract<PreparedRuntimeSelectionV1Alpha2Result, { ok: true }>["value"];
type PersistedReadableAuthorizationBundle =
  | PersistedAuthorizationAwareSubmitTurnTaskBundle
  | PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle;

export type SubmitTurnCoordinatorFaultPoint =
  | "submit_turn.coordinator.after_plan_before_accept"
  | "submit_turn.coordinator.after_message_append"
  | "submit_turn.coordinator.after_task_bundle"
  | "submit_turn.coordinator.after_completion"
  | "submit_turn.coordinator.after_loop_start";

export type SubmitTurnCoordinatorFaultInjector = (
  point: SubmitTurnCoordinatorFaultPoint,
) => void;

export class SubmitTurnCoordinator {
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #conversation: ConversationPersistence;
  readonly #sessions: DesktopSessionMetadataPersistence;
  readonly #tasks: TaskPersistence;
  readonly #selection: RuntimeSelectionService;
  readonly #selectionContexts: RuntimeSelectionContextProvider;
  readonly #coordination: SubmitTurnPersistence;
  readonly #loopStarter: AgentLoopStarter;
  readonly #authorizationPolicies: TaskAuthorizationModePolicyProvider;
  readonly #authorizationSelection: TaskAuthorizationSelectionService;
  readonly #faultInjector: SubmitTurnCoordinatorFaultInjector | undefined;
  readonly #mailboxes = new Map<string, Promise<void>>();

  constructor(input: {
    clock: Clock;
    ids: IdGenerator;
    conversation: ConversationPersistence;
    sessions: DesktopSessionMetadataPersistence;
    tasks: TaskPersistence;
    selection: RuntimeSelectionService;
    selectionContexts: RuntimeSelectionContextProvider;
    coordination: SubmitTurnPersistence;
    loopStarter: AgentLoopStarter;
    authorizationPolicies?: TaskAuthorizationModePolicyProvider;
    authorizationSelection?: TaskAuthorizationSelectionService;
    faultInjector?: SubmitTurnCoordinatorFaultInjector;
  }) {
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#conversation = input.conversation;
    this.#sessions = input.sessions;
    this.#tasks = input.tasks;
    this.#selection = input.selection;
    this.#selectionContexts = input.selectionContexts;
    this.#coordination = input.coordination;
    this.#loopStarter = input.loopStarter;
    this.#authorizationPolicies = input.authorizationPolicies
      ?? new FixedTaskAuthorizationModePolicyProvider();
    this.#authorizationSelection = input.authorizationSelection
      ?? new TaskAuthorizationSelectionService();
    this.#faultInjector = input.faultInjector;
  }

  async submit(
    input: SubmitTurnCommand,
  ): Promise<SubmitTurnCoordinatorResult> {
    const parsed = SubmitTurnCommandSchema.safeParse(input);
    if (!parsed.success) {
      return failed(
        "submit_turn.invalid_command",
        parsed.error.issues[0]?.message ?? "SubmitTurn command is invalid",
        false,
        "validation",
      );
    }
    return this.#enqueue(
      parsed.data.commandId,
      () => this.#submit(parsed.data, "v1alpha1"),
    );
  }

  async submitV1Alpha2(
    input: SubmitTurnCommandV1Alpha2,
  ): Promise<SubmitTurnCoordinatorResult> {
    const parsed = SubmitTurnCommandV1Alpha2Schema.safeParse(input);
    if (!parsed.success) {
      return failed(
        "submit_turn.invalid_command",
        parsed.error.issues[0]?.message ?? "SubmitTurn command is invalid",
        false,
        "validation",
      );
    }
    return this.#enqueue(
      parsed.data.commandId,
      () => this.#submit(parsed.data, "v1alpha2"),
    );
  }

  async submitV1Alpha3(
    input: SubmitTurnCommandV1Alpha3,
  ): Promise<SubmitTurnCoordinatorResult> {
    const parsed = SubmitTurnCommandV1Alpha3Schema.safeParse(input);
    if (!parsed.success) {
      return failed(
        "submit_turn.invalid_command",
        parsed.error.issues[0]?.message ?? "SubmitTurn command is invalid",
        false,
        "validation",
      );
    }
    return this.#enqueue(
      parsed.data.commandId,
      () => this.#submit(parsed.data, "v1alpha3"),
    );
  }

  async resume(
    submitTurnCommandId: string,
  ): Promise<SubmitTurnCoordinatorResult> {
    return this.#enqueue(submitTurnCommandId, async () => {
      const record = await this.#coordination.loadRecord(submitTurnCommandId);
      if (record === undefined) {
        return failed(
          "submit_turn.not_found",
          "SubmitTurn coordination record does not exist",
          false,
          "persistence",
        );
      }
      return this.#progress(record);
    });
  }

  async #submit(
    command: SubmitTurnCommandAny,
    transportContractVersion: "v1alpha1" | "v1alpha2" | "v1alpha3",
  ): Promise<SubmitTurnCoordinatorResult> {
    const requestDigest = sha256CanonicalJson(JsonValueSchema.parse(command));
    const existingByCommand = await this.#coordination.loadRecord(command.commandId);
    const existingByClientTurn = await this.#coordination
      .loadRecordByClientTurnId(command.clientTurnId);
    const existing = existingByCommand ?? existingByClientTurn;
    if (existing !== undefined) {
      if (
        existing.submitTurnCommandId !== command.commandId
        || existing.clientTurnId !== command.clientTurnId
        || existing.requestDigest !== requestDigest
      ) return idempotencyConflict();
      return this.#progress(existing, undefined, true);
    }

    const session = await this.#sessions.loadDesktopSession(command.sessionId);
    if (session === undefined || session.summary.tombstoned) {
      return failed(
        "submit_turn.session_unavailable",
        "Desktop Session is missing or tombstoned",
        false,
        "validation",
      );
    }
    const sessionHead = await this.#conversation.loadSession(
      session.internalSessionId,
    );
    if (sessionHead === undefined) {
      return failed(
        "submit_turn.session_integrity",
        "Desktop Session does not reference a Conversation SessionHead",
        false,
        "persistence",
      );
    }
    const context = await this.#selectionContexts.resolve();
    if (context === undefined) {
      return failed(
        "submit_turn.registry_unavailable",
        "no frozen Runtime Selection context is available",
        true,
        "configuration",
      );
    }

    const createdAt = this.#clock.now();
    const internalTaskId = this.#ids.next();
    const internalUserMessageId = this.#ids.next();
    const internalRuntimeSelectionId = this.#ids.next();
    const initialCheckpointId = this.#ids.next();
    const reasoningModeLockId = command.contractVersion === "v1alpha3"
      ? this.#ids.next()
      : undefined;
    const prepared = await this.#prepareSelection({
      taskId: internalTaskId,
      command,
      context,
      runtimeSelectionId: internalRuntimeSelectionId,
      createdAt,
      ...(reasoningModeLockId === undefined ? {} : { reasoningModeLockId }),
    });
    if (!prepared.ok) return { ok: false, error: prepared.error };

    const authorization = await this.#resolveAuthorization({
      authorization: command.contractVersion !== "v1alpha1"
        ? {
          kind: "explicit",
          preference: command.selectionRequest.authorizationPreference,
        }
        : { kind: "legacy" },
      taskId: internalTaskId,
      runtimeSelection: prepared.value.selection,
      createdAt,
    });
    if (!authorization.ok) return authorization;

    const userMessage = {
      schemaVersion: "v1alpha1" as const,
      role: "user" as const,
      content: [{ type: "text" as const, text: command.userInput }],
    };
    const messageIntent = await this.#conversation.prepareMessage({
      messageId: internalUserMessageId,
      sessionId: session.internalSessionId,
      taskId: internalTaskId,
      messageDigest: sha256CanonicalJson(JsonValueSchema.parse(userMessage)),
      message: userMessage,
      createdAt,
    });
    if (!messageIntent.ok) return { ok: false, error: messageIntent.error };

    const selection = prepared.value.selection;
    const commonRecord = {
      submitTurnCommandId: command.commandId,
      clientTurnId: command.clientTurnId,
      desktopSessionId: command.sessionId,
      internalSessionId: session.internalSessionId,
      requestDigest,
      selectionRequest: normalizedSelectionRequest(command),
      lockedAgent: selection.agent,
      registryRevision: selection.registryRevision,
      platformPromptRevision: selection.platformPromptRevision,
      ...(selection.enterpriseConfigRevision === undefined
        ? {}
        : { enterpriseConfigRevision: selection.enterpriseConfigRevision }),
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
      capabilityLockIds: [
        selection.resolvedModelLock.lockId,
        ...selection.toolLocks.map((lock) => lock.lockId),
      ],
      internalUserMessageId,
      internalTaskId,
      internalRuntimeSelectionId,
      initialCheckpointId,
      status: "accepted",
      createdAt,
      updatedAt: createdAt,
    };
    const record = command.contractVersion === "v1alpha3"
      ? prepared.value.selection.schemaVersion === "v1alpha2"
        ? SubmitTurnRecordV1Alpha3Schema.parse({
          ...commonRecord,
          schemaVersion: "v1alpha3",
          transportContractVersion: "v1alpha3",
          reasoningPlan: {
            reasoningModeLock: prepared.value.selection.reasoningModeLock,
            plannedRuntimeSelectionDigest:
              prepared.value.selection.selectionDigest,
          },
        })
        : undefined
      : SubmitTurnRecordV1Alpha2Schema.parse({
        ...commonRecord,
        schemaVersion: "v1alpha2",
        transportContractVersion,
      });
    if (record === undefined) {
      return failed(
        "reasoning_lock_integrity_invalid",
        "SubmitTurn v1alpha3 requires Runtime Selection v1alpha2",
        false,
        "internal",
      );
    }
    this.#faultInjector?.("submit_turn.coordinator.after_plan_before_accept");
    const accepted = await this.#coordination.prepareAccepted(record);
    if (!accepted.ok) return { ok: false, error: accepted.error };
    return this.#progress(accepted.value, prepared.value);
  }

  async #progress(
    initial: ReadableSubmitTurnRecord,
    initiallyPrepared?: PreparedSelection,
    replayResponse = false,
  ): Promise<SubmitTurnCoordinatorResult> {
    let record = initial;
    let prepared = initiallyPrepared;
    if (
      record.schemaVersion === "v1alpha1"
      && record.status !== "completed"
      && record.status !== "failed_terminal"
    ) {
      const normalized = await this.#normalizeLegacyRecoverableRecord(record);
      if (!normalized.ok) return normalized;
      record = normalized.record;
      prepared = normalized.prepared;
    }
    while (true) {
      if (record.status === "failed_terminal") {
        const receipt = await this.#coordination.loadReceipt(
          record.submitTurnCommandId,
        );
        return receipt === undefined
          ? failed(
            "submit_turn.receipt_missing",
            "terminal SubmitTurn record is missing its receipt",
            false,
            "persistence",
          )
          : { ok: true, receipt: publicReceipt(receipt, replayResponse) };
      }
      if (record.status === "accepted") {
        const appended = await this.#conversation.appendPreparedMessage(
          record.internalUserMessageId,
          record.createdAt,
        );
        if (!appended.ok) return { ok: false, error: appended.error };
        this.#faultInjector?.("submit_turn.coordinator.after_message_append");
        const transitioned = await this.#coordination.transition(
          parseReadableRecord({
            ...record,
            status: "message_appended",
            updatedAt: this.#clock.now(),
          }),
          "accepted",
        );
        if (!transitioned.ok) return { ok: false, error: transitioned.error };
        record = transitioned.value;
        continue;
      }
      if (record.status === "message_appended") {
        let ready = prepared;
        if (ready === undefined) {
          const context = await this.#selectionContexts.resolve(
            record.registryRevision,
          );
          if (context === undefined) {
            return failed(
              "submit_turn.registry_revision_unavailable",
              "locked Registry revision is unavailable for recovery",
              true,
              "configuration",
            );
          }
          const recovered = await this.#prepareSelection({
            taskId: record.internalTaskId,
            record,
            context,
            runtimeSelectionId: record.internalRuntimeSelectionId,
            createdAt: record.createdAt,
          });
          if (!recovered.ok) {
            if (isDeterministicSelectionFailure(recovered.error)) {
              return this.#terminalFailure(record, recovered.error);
            }
            return { ok: false, error: recovered.error };
          }
          ready = recovered.value;
          prepared = recovered.value;
        }
        if (
          ready.selection.selectionDigest
            !== record.plannedSelectionDigest
          || !sameStrings(
            [
              ready.selection.resolvedModelLock.lockId,
              ...ready.selection.toolLocks.map((lock) => lock.lockId),
            ],
            record.capabilityLockIds,
          )
        ) {
          return this.#terminalFailure(record, runtimeError(
            "submit_turn.selection_drift",
            "recovered Runtime Selection differs from the accepted plan",
            false,
            "configuration",
          ));
        }
        const message = await this.#conversation.loadMessageById(
          record.internalUserMessageId,
        );
        if (
          message === undefined
          || message.envelope.sessionId !== record.internalSessionId
          || message.envelope.taskId !== record.internalTaskId
          || message.message.role !== "user"
        ) {
          return failed(
            "submit_turn.message_integrity",
            "persisted user message does not match SubmitTurn identity",
            false,
            "persistence",
          );
        }
        const task = createInitialPersistedTask({
          taskId: record.internalTaskId,
          sessionId: record.internalSessionId,
          agentDefinition: {
            agentDefinitionId:
              ready.selection.agent.agentDefinitionId,
            version: ready.selection.agent.revision,
          },
          goal: message.message.content.map((part) => part.text).join("\n"),
          createdAt: record.createdAt,
        }, record.initialCheckpointId);
        const authorization = await this.#authorizationFacts(record);
        if (!authorization.ok) {
          return this.#terminalFailure(record, authorization.error);
        }
        const bundleInput = {
          submitTurnCommandId: record.submitTurnCommandId,
          userMessageId: record.internalUserMessageId,
          task,
          capabilityLocks: ready.capabilityLocks,
          runtimeSelection: ready.selection,
          selection: authorization.selection,
          executionIdentity: authorization.executionIdentity,
          committedAt: record.createdAt,
        };
        const committed = record.schemaVersion === "v1alpha3"
          ? ready.selection.schemaVersion === "v1alpha2"
            ? await this.#tasks.commitReasoningAwareSubmitTurnTaskBundle({
              ...bundleInput,
              runtimeSelection: ready.selection,
            })
            : failedPersistence(
              "reasoning_lock_integrity_invalid",
              "Reasoning-aware Task bundle requires Runtime Selection v1alpha2",
            )
          : ready.selection.schemaVersion === "v1alpha1"
            ? await this.#tasks.commitAuthorizationAwareSubmitTurnTaskBundle({
              ...bundleInput,
              runtimeSelection: ready.selection,
            })
            : failedPersistence(
              "persistence.invalid_runtime_selection",
              "Legacy Task bundle cannot persist Runtime Selection v1alpha2",
            );
        if (!committed.ok) return { ok: false, error: committed.error };
        this.#faultInjector?.("submit_turn.coordinator.after_task_bundle");
        const transitioned = await this.#coordination.transition(
          parseReadableRecord({
            ...record,
            status: "task_committed",
            updatedAt: this.#clock.now(),
          }),
          "message_appended",
        );
        if (!transitioned.ok) return { ok: false, error: transitioned.error };
        record = transitioned.value;
        continue;
      }
      if (record.status === "task_committed") {
        const bundle = record.schemaVersion === "v1alpha3"
          ? await this.#tasks.loadReasoningAwareSubmitTurnTaskBundle(
            record.submitTurnCommandId,
          )
          : await this.#tasks.loadAuthorizationAwareSubmitTurnTaskBundle(
            record.submitTurnCommandId,
          );
        if (bundle === undefined) {
          return failed(
            "submit_turn.task_bundle_missing",
            "SubmitTurn Task bundle is missing after commit",
            false,
            "persistence",
          );
        }
        const completedAt = this.#clock.now();
        const receipt = acceptedReceipt(record, bundle, completedAt);
        const completedRecord = parseReadableRecord({
          ...record,
          status: "completed",
          updatedAt: completedAt,
        });
        const completed = await this.#coordination.complete({
          record: completedRecord,
          expectedStatus: "task_committed",
          receipt,
          delivery: acceptedDelivery(record, completedAt, this.#ids.next()),
        });
        if (!completed.ok) return { ok: false, error: completed.error };
        this.#faultInjector?.("submit_turn.coordinator.after_completion");
        record = completedRecord;
        prepared = undefined;
        continue;
      }

      const receipt = await this.#coordination.loadReceipt(
        record.submitTurnCommandId,
      );
      if (receipt === undefined) {
        return failed(
          "submit_turn.receipt_missing",
          "completed SubmitTurn record is missing its receipt",
          false,
          "persistence",
        );
      }
      if (record.loopStartedAt === undefined && receipt.status === "accepted") {
        if (record.schemaVersion === "v1alpha1") {
          const historical = await this.#tasks
            .loadAuthorizationAwareSubmitTurnTaskBundle(
              record.submitTurnCommandId,
            );
          if (historical === undefined) {
            return failed(
              "submit_turn.authorization_facts_missing",
              "completed SubmitTurn is missing materialized authorization facts",
              false,
              "persistence",
            );
          }
          const validated = validatePersistedAuthorizationPlan({
            record,
            selection: historical.selection,
            executionIdentity: historical.executionIdentity,
          });
          if (!validated.ok) return validated;
        }
        try {
          await this.#loopStarter.start({
            submitTurnCommandId: record.submitTurnCommandId,
            taskId: record.internalTaskId,
            runtimeSelectionId: record.internalRuntimeSelectionId,
            sessionId: record.internalSessionId,
            userMessageId: record.internalUserMessageId,
          });
          this.#faultInjector?.("submit_turn.coordinator.after_loop_start");
          await this.#coordination.markLoopStarted(
            record.submitTurnCommandId,
            this.#clock.now(),
          );
        } catch {
          // The accepted receipt is durable. Startup recovery retries the
          // idempotent AgentLoopStarter; it must not retract the accepted turn.
        }
      }
      return { ok: true, receipt: publicReceipt(receipt, replayResponse) };
    }
  }

  async #prepareSelection(input: {
    taskId: string;
    command?: SubmitTurnCommandAny;
    record?: ReadableSubmitTurnRecord;
    context: RuntimeSelectionContext;
    runtimeSelectionId: string;
    createdAt: string;
    reasoningModeLockId?: string;
  }): Promise<PreparedRuntimeSelectionResult | PreparedRuntimeSelectionV1Alpha2Result> {
    const request = input.command === undefined
      ? input.record === undefined
        ? undefined
        : runtimeSelectionRequest(input.record.selectionRequest)
      : runtimeSelectionRequest(input.command.selectionRequest);
    if (request === undefined) {
      return {
        ok: false,
        error: runtimeError(
          "submit_turn.selection_request_missing",
          "SubmitTurn selection request is missing",
          false,
          "internal",
        ),
      };
    }
    const enterpriseConfigRevision = input.record === undefined
      ? input.context.enterpriseConfigRevision
      : input.record.enterpriseConfigRevision;
    const common = {
      taskId: input.taskId,
      request,
      registryRevision: input.record?.registryRevision
        ?? input.context.registryRevision,
      liveModels: input.context.liveModels,
      ...(input.context.capabilityAvailability === undefined
        ? {}
        : { capabilityAvailability: input.context.capabilityAvailability }),
      ...(input.context.inputRequirements === undefined
        ? {}
        : { inputRequirements: input.context.inputRequirements }),
      platformPromptRevision: input.record?.platformPromptRevision
        ?? input.context.platformPromptRevision,
      ...(enterpriseConfigRevision === undefined
        ? {}
        : { enterpriseConfigRevision }),
      runtimeSelectionId: input.runtimeSelectionId,
      ...(input.record === undefined
        ? {}
        : {
          capabilityLockIds: input.record.capabilityLockIds,
          expectedAgent: input.record.lockedAgent,
        }),
      createdAt: input.createdAt,
    };
    if (input.command?.contractVersion === "v1alpha3") {
      if (input.reasoningModeLockId === undefined) {
        return failedSelection(
          "reasoning_lock_integrity_invalid",
          "Reasoning Mode lock identity is missing",
        );
      }
      return this.#selection.prepareForTaskBundleV1Alpha2({
        ...common,
        reasoningPreference: input.command.selectionRequest.reasoningPreference,
        reasoningModeLockId: input.reasoningModeLockId,
      });
    }
    if (input.record?.schemaVersion === "v1alpha3") {
      return this.#selection.prepareForTaskBundleV1Alpha2FromAcceptedPlan({
        ...common,
        reasoningModeLock: input.record.reasoningPlan.reasoningModeLock,
      });
    }
    return this.#selection.prepareForTaskBundle(common);
  }

  async #resolveAuthorization(input: {
    authorization: TaskAuthorizationRequest;
    taskId: string;
    runtimeSelection: PreparedSelection["selection"];
    createdAt: string;
  }): Promise<
    | {
      ok: true;
      selection: TaskAuthorizationSelection;
      executionIdentity: TaskExecutionSelectionIdentity;
    }
    | { ok: false; error: RuntimeError }
  > {
    const policySnapshot = await this.#authorizationPolicies.loadSnapshot();
    return this.#authorizationSelection.resolve({
      taskId: input.taskId,
      runtimeSelection: input.runtimeSelection,
      authorization: input.authorization,
      policySnapshot,
      createdAt: input.createdAt,
    });
  }

  async #authorizationFacts(record: ReadableSubmitTurnRecord): Promise<
    | {
      ok: true;
      selection: TaskAuthorizationSelection;
      executionIdentity: TaskExecutionSelectionIdentity;
    }
    | { ok: false; error: RuntimeError }
  > {
    if (record.schemaVersion === "v1alpha1") {
      return failedAuthorization(
        "submit_turn.authorization_plan_missing",
        "recoverable SubmitTurn record is missing its authorization plan",
      );
    }
    const selection: TaskAuthorizationSelection = {
      schemaVersion: "v1alpha1",
      taskId: record.internalTaskId,
      runtimeSelectionId: record.internalRuntimeSelectionId,
      requestedMode: record.authorizationPlan.requestedMode,
      resolvedMode: record.authorizationPlan.resolvedMode,
      policyRevision: record.authorizationPlan.policyRevision,
      source: record.authorizationPlan.source,
      createdAt: record.createdAt,
      authorizationSelectionDigest:
        record.authorizationPlan.authorizationSelectionDigest,
    };
    const executionIdentity: TaskExecutionSelectionIdentity = {
      schemaVersion: "v1alpha1",
      taskId: record.internalTaskId,
      runtimeSelectionId: record.internalRuntimeSelectionId,
      runtimeSelectionDigest: record.plannedSelectionDigest,
      authorizationSelectionDigest:
        record.authorizationPlan.authorizationSelectionDigest,
      executionSelectionDigest:
        record.authorizationPlan.executionSelectionDigest,
    };
    return validatePersistedAuthorizationPlan({
      record,
      selection,
      executionIdentity,
    });
  }

  async #normalizeLegacyRecoverableRecord(
    record: SubmitTurnRecord,
  ): Promise<
    | { ok: true; record: SubmitTurnRecordV1Alpha2; prepared?: PreparedSelection }
    | { ok: false; error: RuntimeError }
  > {
    const context = await this.#selectionContexts.resolve(record.registryRevision);
    if (context === undefined) {
      return failedAuthorization(
        "submit_turn.registry_revision_unavailable",
        "locked Registry revision is unavailable for recovery",
        true,
        "configuration",
      );
    }
    const recovered = await this.#prepareSelection({
      taskId: record.internalTaskId,
      record,
      context,
      runtimeSelectionId: record.internalRuntimeSelectionId,
      createdAt: record.createdAt,
    });
    if (!recovered.ok) return recovered;
    const authorization = await this.#resolveAuthorization({
      authorization: { kind: "legacy" },
      taskId: record.internalTaskId,
      runtimeSelection: recovered.value.selection,
      createdAt: record.createdAt,
    });
    if (!authorization.ok) return authorization;
    const replacement = SubmitTurnRecordV1Alpha2Schema.parse({
      ...record,
      schemaVersion: "v1alpha2",
      transportContractVersion: "v1alpha1",
      selectionRequest: normalizedSelectionRequestFromLegacy(
        record.selectionRequest,
      ),
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
    });
    const normalized = await this.#coordination
      .normalizeLegacyRecoverableRecord(record, replacement);
    return normalized.ok
      ? { ok: true, record: normalized.value, prepared: recovered.value }
      : normalized;
  }

  async #terminalFailure(
    record: ReadableSubmitTurnRecord,
    error: RuntimeError,
  ): Promise<SubmitTurnCoordinatorResult> {
    if (
      record.status !== "accepted"
      && record.status !== "message_appended"
    ) {
      return failed(
        "submit_turn.invalid_terminal_transition",
        "only pre-Task SubmitTurn stages may fail terminally",
        false,
        "internal",
      );
    }
    const expectedStatus = record.status;
    const completedAt = this.#clock.now();
    const terminalRecord = parseReadableRecord({
      ...record,
      status: "failed_terminal",
      updatedAt: completedAt,
      lastFailure: {
        code: error.code,
        stage: "selection",
        safeSummary: error.message,
      },
    });
    const receipt = rejectedReceipt(record, completedAt, error);
    const committed = await this.#coordination.failTerminal({
      record: terminalRecord,
      expectedStatus,
      receipt,
      delivery: {
        schemaVersion: "v1alpha1",
        deliveryId: this.#ids.next(),
        submitTurnCommandId: record.submitTurnCommandId,
        type: "turn.rejected",
        sessionId: record.desktopSessionId,
        createdAt: completedAt,
      },
    });
    return committed.ok
      ? { ok: true, receipt: publicReceipt(committed.value, false) }
      : { ok: false, error: committed.error };
  }

  #enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#mailboxes.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#mailboxes.set(key, current);
    return previous
      .catch(() => undefined)
      .then(operation)
      .finally(() => {
        release();
        if (this.#mailboxes.get(key) === current) this.#mailboxes.delete(key);
      });
  }
}

function acceptedReceipt(
  record: ReadableSubmitTurnRecord,
  bundle: PersistedReadableAuthorizationBundle,
  completedAt: string,
): ReadablePersistedSubmitTurnReceipt {
  if (record.schemaVersion === "v1alpha3") {
    if (!isReasoningPersistedBundle(bundle)) {
      throw new Error("SubmitTurn v1alpha3 is missing Runtime Selection v1alpha2");
    }
    return PersistedSubmitTurnReceiptV1Alpha3Schema.parse({
      contractVersion: "v1alpha3",
      submitTurnCommandId: record.submitTurnCommandId,
      clientTurnId: record.clientTurnId,
      userMessageId: publicId("message", record.internalUserMessageId),
      taskId: publicId("task", record.internalTaskId),
      runtimeSelectionId: publicId(
        "runtime-selection",
        record.internalRuntimeSelectionId,
      ),
      status: "accepted",
      runtimeSelectionSummary: selectionSummaryV1Alpha3(bundle),
      acceptedAt: record.createdAt,
      requestDigest: record.requestDigest,
      completedAt,
    });
  }
  if (isReasoningPersistedBundle(bundle)) {
    throw new Error("Legacy SubmitTurn is bound to Runtime Selection v1alpha2");
  }
  if (
    record.schemaVersion === "v1alpha2"
    && record.transportContractVersion === "v1alpha2"
  ) {
    return PersistedSubmitTurnReceiptV1Alpha2Schema.parse({
      contractVersion: "v1alpha2",
      submitTurnCommandId: record.submitTurnCommandId,
      clientTurnId: record.clientTurnId,
      userMessageId: publicId("message", record.internalUserMessageId),
      taskId: publicId("task", record.internalTaskId),
      runtimeSelectionId: publicId(
        "runtime-selection",
        record.internalRuntimeSelectionId,
      ),
      status: "accepted",
      runtimeSelectionSummary: selectionSummaryV1Alpha2(bundle),
      acceptedAt: record.createdAt,
      requestDigest: record.requestDigest,
      completedAt,
    });
  }
  return PersistedSubmitTurnReceiptSchema.parse({
    submitTurnCommandId: record.submitTurnCommandId,
    clientTurnId: record.clientTurnId,
    userMessageId: publicId("message", record.internalUserMessageId),
    taskId: publicId("task", record.internalTaskId),
    runtimeSelectionId: publicId(
      "runtime-selection",
      record.internalRuntimeSelectionId,
    ),
    status: "accepted",
    runtimeSelectionSummary: selectionSummary(bundle),
    acceptedAt: record.createdAt,
    requestDigest: record.requestDigest,
    completedAt,
  });
}

function isReasoningPersistedBundle(
  bundle: PersistedReadableAuthorizationBundle,
): bundle is PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle {
  return bundle.runtimeSelection.schemaVersion === "v1alpha2";
}

function rejectedReceipt(
  record: ReadableSubmitTurnRecord,
  completedAt: string,
  error: RuntimeError,
): ReadablePersistedSubmitTurnReceipt {
  const common = {
    submitTurnCommandId: record.submitTurnCommandId,
    clientTurnId: record.clientTurnId,
    userMessageId: publicId("message", record.internalUserMessageId),
    taskId: publicId("task", record.internalTaskId),
    runtimeSelectionId: publicId(
      "runtime-selection",
      record.internalRuntimeSelectionId,
    ),
    status: "rejected" as const,
    acceptedAt: record.createdAt,
    requestDigest: record.requestDigest,
    completedAt,
    terminalError: error,
  };
  if (record.schemaVersion === "v1alpha3") {
    return PersistedSubmitTurnReceiptV1Alpha3Schema.parse({
      contractVersion: "v1alpha3",
      ...common,
    });
  }
  return record.schemaVersion === "v1alpha2"
    && record.transportContractVersion === "v1alpha2"
    ? PersistedSubmitTurnReceiptV1Alpha2Schema.parse({
      contractVersion: "v1alpha2",
      ...common,
    })
    : PersistedSubmitTurnReceiptSchema.parse(common);
}

function selectionSummary(
  bundle: PersistedSubmitTurnTaskBundle | PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle,
): RuntimeSelectionSummary {
  const selection = bundle.runtimeSelection;
  const locks = new Map(
    bundle.capabilityLocks.map((lock) => [lock.lockId, lock]),
  );
  const modelLock = locks.get(selection.resolvedModelLock.lockId);
  if (modelLock === undefined) {
    throw new Error("Runtime Selection model lock is missing from Task bundle");
  }
  return RuntimeSelectionSummarySchema.parse({
    runtimeSelectionId: publicId(
      "runtime-selection",
      selection.runtimeSelectionId,
    ),
    digest: selection.selectionDigest,
    agent: {
      id: selection.agent.agentDefinitionId,
      revision: selection.agent.revision,
    },
    defaultModelId: selection.agentDefaultModelId,
    ...(selection.requestedModelId === undefined
      ? {}
      : { requestedModelId: selection.requestedModelId }),
    resolvedModel: {
      id: selection.resolvedModelLock.capabilityId,
      revision: modelLock.definitionSnapshot.revision,
    },
    activeSkills: selection.activeSkillRevisions.map((reference) => ({
      id: reference.id,
      revision: reference.revision,
    })),
    allowedTools: selection.toolLocks.map((reference) => {
      const lock = locks.get(reference.lockId);
      if (lock === undefined) {
        throw new Error("Runtime Selection Tool lock is missing from Task bundle");
      }
      return {
        id: reference.capabilityId,
        revision: lock.definitionSnapshot.revision,
      };
    }),
    knowledge: selection.knowledgeRevisions.map((reference) => ({
      id: reference.id,
      revision: reference.revision,
    })),
    ...(selection.workspaceGrantId === undefined
      ? {}
      : { workspaceGrantId: selection.workspaceGrantId }),
    ...(selection.enterpriseConfigRevision === undefined
      ? {}
      : { enterpriseConfigRevision: selection.enterpriseConfigRevision }),
  });
}

function selectionSummaryV1Alpha3(
  bundle: PersistedReasoningAwareAuthorizationSubmitTurnTaskBundle,
): RuntimeSelectionSummaryV1Alpha3 {
  const authorization = validatePersistedAuthorizationPlan({
    selection: bundle.selection,
    executionIdentity: bundle.executionIdentity,
  });
  if (!authorization.ok) {
    throw new Error("Task authorization facts are invalid");
  }
  const lock = bundle.runtimeSelection.reasoningModeLock;
  const reasoning = lock.resolution === "default_passthrough"
    ? {
      requestedMode: "default" as const,
      resolvedMode: "model_default" as const,
      resolutionReason: "requested_default" as const,
    }
    : lock.resolution === "max_applied"
      ? {
        requestedMode: "max" as const,
        resolvedMode: "max" as const,
        resolutionReason: "applied" as const,
      }
      : lock.resolution === "max_unsupported_default"
        ? {
          requestedMode: "max" as const,
          resolvedMode: "model_default" as const,
          resolutionReason: "unsupported" as const,
        }
        : {
          requestedMode: "max" as const,
          resolvedMode: "model_default" as const,
          resolutionReason: "capability_unknown" as const,
        };
  return RuntimeSelectionSummaryV1Alpha3Schema.parse({
    ...selectionSummary(bundle),
    resolvedAuthorization: {
      requestedMode: bundle.selection.requestedMode,
      resolvedMode: bundle.selection.resolvedMode,
      policyRevision: bundle.selection.policyRevision,
      source: bundle.selection.source,
      authorizationSelectionDigest:
        bundle.selection.authorizationSelectionDigest,
    },
    executionSelectionDigest:
      bundle.executionIdentity.executionSelectionDigest,
    reasoning: {
      ...reasoning,
      reasoningModeLockId: lock.reasoningModeLockId,
      reasoningModeLockDigest: lock.reasoningModeLockDigest,
    },
  });
}

function selectionSummaryV1Alpha2(
  bundle: PersistedAuthorizationAwareSubmitTurnTaskBundle,
): RuntimeSelectionSummaryV1Alpha2 {
  const authorization = validatePersistedAuthorizationPlan({
    selection: bundle.selection,
    executionIdentity: bundle.executionIdentity,
  });
  if (!authorization.ok) {
    throw new Error("Task authorization facts are invalid");
  }
  return RuntimeSelectionSummaryV1Alpha2Schema.parse({
    ...selectionSummary(bundle),
    resolvedAuthorization: {
      requestedMode: bundle.selection.requestedMode,
      resolvedMode: bundle.selection.resolvedMode,
      policyRevision: bundle.selection.policyRevision,
      source: bundle.selection.source,
      authorizationSelectionDigest:
        bundle.selection.authorizationSelectionDigest,
    },
    executionSelectionDigest:
      bundle.executionIdentity.executionSelectionDigest,
  });
}

function acceptedDelivery(
  record: ReadableSubmitTurnRecord,
  createdAt: string,
  deliveryId: string,
): DesktopDeliveryDraft {
  return {
    schemaVersion: "v1alpha1",
    deliveryId,
    submitTurnCommandId: record.submitTurnCommandId,
    type: "turn.accepted",
    sessionId: record.desktopSessionId,
    userMessageId: publicId("message", record.internalUserMessageId),
    taskId: publicId("task", record.internalTaskId),
    createdAt,
  };
}

function publicReceipt(
  receipt: ReadablePersistedSubmitTurnReceipt,
  replayed: boolean,
): SubmitTurnReceipt | SubmitTurnReceiptV1Alpha2 | SubmitTurnReceiptV1Alpha3 {
  const {
    requestDigest: _requestDigest,
    completedAt: _completedAt,
    terminalError: _terminalError,
    ...publicValue
  } = receipt;
  const result = {
    ...publicValue,
    status: publicValue.status === "accepted" && replayed
      ? "replayed"
      : publicValue.status,
  };
  if (!("contractVersion" in result)) return SubmitTurnReceiptSchema.parse(result);
  return result.contractVersion === "v1alpha3"
    ? SubmitTurnReceiptV1Alpha3Schema.parse(result)
    : SubmitTurnReceiptV1Alpha2Schema.parse(result);
}

function parseReadableRecord(input: unknown): ReadableSubmitTurnRecord {
  return ReadableSubmitTurnRecordSchema.parse(input);
}

function normalizedSelectionRequest(command: SubmitTurnCommandAny) {
  return command.contractVersion === "v1alpha2"
    || command.contractVersion === "v1alpha3"
    ? command.selectionRequest
    : normalizedSelectionRequestFromLegacy(command.selectionRequest);
}

function normalizedSelectionRequestFromLegacy(
  request: SubmitTurnCommand["selectionRequest"],
): SubmitTurnCommandV1Alpha2["selectionRequest"] {
  return {
    ...request,
    authorizationPreference: {
      schemaVersion: "v1alpha1",
      requestedMode: "smart_confirm",
    },
  };
}

function runtimeSelectionRequest(
  request: SubmitTurnCommandAny["selectionRequest"],
): SubmitTurnCommand["selectionRequest"] {
  const {
    agentId,
    requestedModelId,
    selectedSkillIds,
    selectedKnowledgeIds,
    workspaceGrantId,
  } = request;
  return {
    agentId,
    ...(requestedModelId === undefined ? {} : { requestedModelId }),
    selectedSkillIds,
    selectedKnowledgeIds,
    ...(workspaceGrantId === undefined ? {} : { workspaceGrantId }),
  };
}

function failedSelection(
  code: string,
  message: string,
): { ok: false; error: RuntimeError } {
  return {
    ok: false,
    error: runtimeError(code, message, false, "configuration"),
  };
}

function failedPersistence(
  code: string,
  message: string,
): { ok: false; error: RuntimeError } {
  return {
    ok: false,
    error: runtimeError(code, message, false, "persistence"),
  };
}

function validatePersistedAuthorizationPlan(input: {
  record?: ReadableSubmitTurnRecord;
  selection: TaskAuthorizationSelection;
  executionIdentity: TaskExecutionSelectionIdentity;
}):
  | {
    ok: true;
    selection: TaskAuthorizationSelection;
    executionIdentity: TaskExecutionSelectionIdentity;
  }
  | { ok: false; error: RuntimeError } {
  if (
    !hasValidTaskAuthorizationSelection(input.selection)
    || !hasValidTaskExecutionSelectionIdentity(input.executionIdentity)
  ) {
    return failedAuthorization(
      "submit_turn.authorization_facts_corrupt",
      "persisted task authorization facts are invalid",
    );
  }
  const record = input.record;
  if (
    input.selection.taskId !== input.executionIdentity.taskId
    || input.selection.runtimeSelectionId
      !== input.executionIdentity.runtimeSelectionId
    || input.selection.authorizationSelectionDigest
      !== input.executionIdentity.authorizationSelectionDigest
    || (record !== undefined && (
      input.selection.taskId !== record.internalTaskId
      || input.selection.runtimeSelectionId
        !== record.internalRuntimeSelectionId
      || input.executionIdentity.runtimeSelectionDigest
        !== record.plannedSelectionDigest
    ))
  ) {
    return failedAuthorization(
      "submit_turn.authorization_identity_mismatch",
      "persisted task authorization identity does not match SubmitTurn",
    );
  }
  if (record !== undefined && record.schemaVersion !== "v1alpha1" && (
    input.selection.requestedMode !== record.authorizationPlan.requestedMode
    || input.selection.resolvedMode !== record.authorizationPlan.resolvedMode
    || input.selection.policyRevision !== record.authorizationPlan.policyRevision
    || input.selection.source !== record.authorizationPlan.source
    || input.selection.authorizationSelectionDigest
      !== record.authorizationPlan.authorizationSelectionDigest
    || input.executionIdentity.executionSelectionDigest
      !== record.authorizationPlan.executionSelectionDigest
  )) {
    return failedAuthorization(
      "submit_turn.authorization_plan_mismatch",
      "persisted task authorization facts differ from the accepted plan",
    );
  }
  return {
    ok: true,
    selection: input.selection,
    executionIdentity: input.executionIdentity,
  };
}

function failedAuthorization(
  code: string,
  message: string,
  retryable = false,
  category: RuntimeError["category"] = "persistence",
): { ok: false; error: RuntimeError } {
  return { ok: false, error: runtimeError(code, message, retryable, category) };
}

function publicId(kind: string, internalId: string): string {
  return `${kind}:${internalId}`;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function isDeterministicSelectionFailure(error: RuntimeError): boolean {
  if (new Set([
    "selection.invalid_request",
    "selection.agent_unavailable",
    "selection.skill_not_allowed",
    "selection.knowledge_not_allowed",
    "selection.workspace_unavailable",
    "selection.model_override_forbidden",
    "selection.model_revision_drift",
    "selection.tool_revision_drift",
    "selection.lock_identity_mismatch",
  ]).has(error.code)) return true;
  if (error.code !== "selection.model_ineligible") return false;
  const reasons = error.details?.reasons;
  return Array.isArray(reasons)
    && reasons.length > 0
    && reasons.every((reason) =>
      typeof reason === "string"
      && reason !== "model.credential_unavailable"
      && reason !== "model.not_callable");
}

function idempotencyConflict(): SubmitTurnCoordinatorResult {
  return failed(
    "submit_turn.idempotency_conflict",
    "commandId or clientTurnId was reused with different request facts",
    false,
    "persistence",
  );
}

function failed(
  code: string,
  message: string,
  retryable: boolean,
  category: RuntimeError["category"],
): SubmitTurnCoordinatorResult {
  return { ok: false, error: runtimeError(code, message, retryable, category) };
}

function runtimeError(
  code: string,
  message: string,
  retryable: boolean,
  category: RuntimeError["category"],
): RuntimeError {
  return { code, category, message, retryable };
}
