import type { TaskRuntimeSelection } from "@robothree/contracts";

import type {
  PersistenceWriteResult,
  TaskAuthorizationMaterializationResult,
  TaskAuthorizationPersistenceRecord,
  TaskPersistence,
} from "../ports/task-persistence.js";
import type { TaskAuthorizationModePolicySnapshot } from
  "../ports/task-authorization-mode-policy.js";
import {
  hasValidTaskAuthorizationModePolicySnapshot,
} from "../ports/task-authorization-mode-policy.js";
import { failure } from "../persistence/validation.js";
import {
  parseTaskAuthorizationPersistenceRecord,
  validateTaskAuthorizationRecordAgainstRuntimeSelection,
} from "../persistence/task-authorization-selection-record.js";
import { hasValidTaskRuntimeSelection } from "./runtime-selection-revisions.js";
import { TaskAuthorizationSelectionService } from
  "./task-authorization-selection-service.js";
import { MVP_TASK_AUTHORIZATION_MODE_POLICY } from
  "./fixed-task-authorization-mode-policy.js";

export class LegacyTaskAuthorizationSelectionMaterializer {
  readonly #selectionService: TaskAuthorizationSelectionService;

  constructor(
    private readonly persistence: TaskPersistence,
    selectionService = new TaskAuthorizationSelectionService(),
  ) {
    this.#selectionService = selectionService;
  }

  async materialize(
    exactPolicySnapshot: TaskAuthorizationModePolicySnapshot | unknown,
  ): Promise<PersistenceWriteResult<TaskAuthorizationMaterializationResult>> {
    if (
      !hasValidTaskAuthorizationModePolicySnapshot(exactPolicySnapshot)
      || exactPolicySnapshot.policyRevision
        !== MVP_TASK_AUTHORIZATION_MODE_POLICY.policyRevision
    ) {
      return failure(
        "persistence.authorization_policy_invalid",
        "Task authorization policy snapshot is invalid",
      );
    }
    const snapshot = await this.persistence
      .loadTaskAuthorizationMaterializationSnapshot();
    const runtimeByTaskId = new Map<string, TaskRuntimeSelection>();
    try {
      for (const runtimeSelection of snapshot.runtimeSelections) {
        if (!hasValidTaskRuntimeSelection(runtimeSelection)) {
          throw new Error("Runtime Selection digest is invalid");
        }
        runtimeByTaskId.set(runtimeSelection.taskId, runtimeSelection);
      }
      for (const existing of snapshot.existingAuthorizationRecords) {
        const parsed = parseTaskAuthorizationPersistenceRecord(existing);
        const runtimeSelection = runtimeByTaskId.get(parsed.selection.taskId);
        if (runtimeSelection === undefined) {
          throw new Error("Authorization record has no Runtime Selection");
        }
        validateTaskAuthorizationRecordAgainstRuntimeSelection(
          parsed,
          runtimeSelection,
        );
      }
    } catch {
      return failure(
        "persistence.authorization_selection_corrupt",
        "Task authorization persistence facts are corrupt",
      );
    }

    const existingTaskIds = new Set(
      snapshot.existingAuthorizationRecords.map((record) => record.selection.taskId),
    );
    const records: TaskAuthorizationPersistenceRecord[] = [];
    for (const runtimeSelection of snapshot.runtimeSelections) {
      if (existingTaskIds.has(runtimeSelection.taskId)) continue;
      const resolved = this.#selectionService.resolve({
        taskId: runtimeSelection.taskId,
        runtimeSelection,
        authorization: { kind: "legacy" },
        policySnapshot: exactPolicySnapshot,
        createdAt: runtimeSelection.createdAt,
      });
      if (!resolved.ok) {
        return failure(
          "persistence.authorization_policy_invalid",
          "Task authorization policy cannot materialize legacy facts",
        );
      }
      records.push({
        selection: resolved.selection,
        executionIdentity: resolved.executionIdentity,
      });
    }
    return this.persistence.commitTaskAuthorizationMaterialization({
      expectedCoverageDigest: snapshot.coverageDigest,
      records,
    });
  }
}
