import {
  GetTaskReasoningModeQueryV1Alpha1Schema,
  TaskReasoningModeProjectionV1Alpha1Schema,
  type GetTaskReasoningModeQueryV1Alpha1,
  type TaskReasoningModeProjectionV1Alpha1,
} from "@robothree/contracts/desktop-local/task-reasoning/v1alpha1";
import { SubmitTurnReceiptV1Alpha5Schema } from
  "@robothree/contracts/desktop-local/v1alpha5";
import { ReadablePersistedSubmitTurnReceiptV1Alpha5Schema } from
  "@robothree/contracts/submit-turn-coordination/v1alpha5";

import type { SubmitTurnPersistence } from "../ports/submit-turn-persistence.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import { validateDfi541CoordinationEnvelopeV1 } from
  "./dfi541-durable-acceptance.js";

export type TaskReasoningModeProjectionErrorCode =
  | "task_reasoning.not_found"
  | "task_reasoning.integrity_invalid";

export type TaskReasoningModeProjectionResult =
  | Readonly<{ ok: true; value: TaskReasoningModeProjectionV1Alpha1 }>
  | Readonly<{ ok: false; code: TaskReasoningModeProjectionErrorCode }>;

/**
 * Projects only the safe, durable reasoning result that belongs to one Task.
 * Current Profile, Preference, Registry and Provider state are intentionally
 * outside this read path.
 */
export class TaskReasoningModeProjectionService {
  readonly #tasks: TaskPersistence;
  readonly #coordination: SubmitTurnPersistence;

  constructor(input: Readonly<{
    tasks: TaskPersistence;
    coordination: SubmitTurnPersistence;
  }>) {
    this.#tasks = input.tasks;
    this.#coordination = input.coordination;
  }

  async get(
    input: GetTaskReasoningModeQueryV1Alpha1,
  ): Promise<TaskReasoningModeProjectionResult> {
    const query = GetTaskReasoningModeQueryV1Alpha1Schema.parse(input);
    const internalTaskId = parsePublicTaskId(query.taskId);
    if (internalTaskId === undefined) {
      return { ok: false, code: "task_reasoning.not_found" };
    }

    const binding = await this.#tasks.loadSubmitTurnBindingByTaskId(internalTaskId);
    if (binding === undefined) {
      return { ok: false, code: "task_reasoning.not_found" };
    }
    if (binding.taskId !== internalTaskId) {
      return { ok: false, code: "task_reasoning.integrity_invalid" };
    }

    const record = await this.#coordination.loadRecord(binding.submitTurnCommandId);
    if (record === undefined) {
      return { ok: false, code: "task_reasoning.integrity_invalid" };
    }
    if (record.internalTaskId !== internalTaskId) {
      return { ok: false, code: "task_reasoning.integrity_invalid" };
    }
    if (record.schemaVersion !== "v1alpha5") {
      return {
        ok: true,
        value: TaskReasoningModeProjectionV1Alpha1Schema.parse({
          state: "legacy",
          taskId: query.taskId,
          safeSummary: "该任务创建时未记录 Max 推理摘要",
        }),
      };
    }

    try {
      const envelopeValue = await this.#coordination.loadDfi541Envelope(
        binding.submitTurnCommandId,
      );
      const receiptValue = await this.#coordination.loadReceipt(
        binding.submitTurnCommandId,
      );
      if (envelopeValue === undefined || receiptValue === undefined) {
        return { ok: false, code: "task_reasoning.integrity_invalid" };
      }
      const envelope = validateDfi541CoordinationEnvelopeV1(envelopeValue);
      const persistedReceipt = ReadablePersistedSubmitTurnReceiptV1Alpha5Schema.parse(
        receiptValue,
      );
      const { requestDigest: _requestDigest, completedAt: _completedAt,
        terminalError: _terminalError, ...publicReceipt } = persistedReceipt;
      const receipt = SubmitTurnReceiptV1Alpha5Schema.parse(publicReceipt);
      const summary = receipt.runtimeSelectionSummary?.reasoning;
      if (
        envelope.record.internalTaskId !== internalTaskId
        || envelope.record.submitTurnCommandId !== binding.submitTurnCommandId
        || envelope.acceptedPlan.internalTaskId !== internalTaskId
        || envelope.acceptedPlan.submitTurnCommandId !== binding.submitTurnCommandId
        || envelope.acceptedPlan.runtimeSelection.runtimeSelectionId
          !== binding.runtimeSelectionId
        || receipt.taskId !== query.taskId
        || receipt.submitTurnCommandId !== binding.submitTurnCommandId
        || receipt.runtimeSelectionId !== `runtime-selection:${binding.runtimeSelectionId}`
        || receipt.status === "rejected"
        || summary === undefined
      ) {
        return { ok: false, code: "task_reasoning.integrity_invalid" };
      }
      return {
        ok: true,
        value: TaskReasoningModeProjectionV1Alpha1Schema.parse({
          state: "available",
          taskId: query.taskId,
          requestedMode: summary.requestedMode,
          resolvedMode: summary.resolvedMode,
          resolutionReason: summary.resolutionReason,
          acceptedAt: receipt.acceptedAt,
        }),
      };
    } catch {
      return { ok: false, code: "task_reasoning.integrity_invalid" };
    }
  }
}

function parsePublicTaskId(taskId: string): string | undefined {
  if (!taskId.startsWith("task:")) return undefined;
  const internalTaskId = taskId.slice("task:".length);
  return internalTaskId.length === 0 ? undefined : internalTaskId;
}
