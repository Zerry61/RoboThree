import { JsonObjectSchema, JsonValueSchema } from "@robothree/contracts";
import { TEXT_FILE_READ_CAPABILITY_ID } from "@robothree/document-worker";

import { sha256CanonicalJson } from "../persistence/digest.js";

import type { TaskPersistence } from "../ports/task-persistence.js";

const PROOF_DOMAIN = "robothree.wte-edit-read-proof.v1";
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;

export type WorkspaceTextEditReadProof = Readonly<{
  digest: string;
  taskId: string;
  sourceUserMessageId: string;
  sourceActionId: string;
  sourceObservationId: string;
  workspaceGrantId: string;
  relativePath: string;
  sha256: string;
  byteSize: number;
  mediaType: string;
}>;

export async function assertWorkspaceTextPathIsExplicitlyRequested(input: Readonly<{
  taskId: string;
  relativePath: string;
  tasks: TaskPersistence;
}>): Promise<void> {
  const task = await input.tasks.loadTask(input.taskId);
  if (task === undefined) throw new Error("workspace_text_read.task_not_found");
  if (!task.checkpoint.state.goal.includes(input.relativePath)) {
    throw new Error("workspace.file.policy_denied");
  }
}

export async function deriveWorkspaceTextEditReadProof(input: Readonly<{
  taskId: string;
  workspaceGrantId: string;
  relativePath: string;
  expectedPreviousSha256: string;
  tasks: TaskPersistence;
}>): Promise<WorkspaceTextEditReadProof> {
  const task = await input.tasks.loadTask(input.taskId);
  if (task === undefined) throw new Error("workspace_text_read.task_not_found");
  const binding = await input.tasks.loadSubmitTurnBindingByTaskId(input.taskId);
  if (binding === undefined) throw new Error("workspace_text_read.user_turn_not_found");
  const selection = await input.tasks.loadReadableTaskRuntimeSelection(input.taskId);
  if (selection?.workspaceGrantId !== input.workspaceGrantId) {
    throw new Error("workspace_text_read.workspace_authority_mismatch");
  }
  const lock = await input.tasks.loadTaskCapabilityLock(
    input.taskId,
    TEXT_FILE_READ_CAPABILITY_ID,
  );
  if (lock === undefined) throw new Error("workspace_text_read.capability_lock_missing");

  const candidates = task.checkpoint.state.runs.flatMap((run) => run.steps)
    .flatMap((step) => {
      if (
        step.action.kind !== TEXT_FILE_READ_CAPABILITY_ID
        || step.observation?.outcome !== "succeeded"
      ) return [];
      const action = JsonObjectSchema.parse(step.action.payload);
      const envelope = objectRecord(step.observation.output);
      const result = objectRecord(envelope.result);
      return [{
        actionId: step.action.actionId,
        observationId: step.observation.observationId,
        sequence: step.sequence,
        observedAt: step.observation.observedAt,
        relativePath: requireString(result.relativePath, "workspace_text_read.relative_path"),
        sha256: requireSha256(result.sha256, "workspace_text_read.sha256"),
        byteSize: requireNonNegativeInteger(result.byteSize, "workspace_text_read.byte_size"),
        mediaType: requireString(result.mediaType, "workspace_text_read.media_type"),
        modelRelativePath: requireString(action.relativePath, "workspace_text_read.action_path"),
      }];
    })
    .filter((candidate) =>
      candidate.relativePath === input.relativePath
      && candidate.modelRelativePath === input.relativePath)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const current = candidates.at(-1);
  if (current === undefined) throw new Error("workspace_text_read.proof_missing");
  const latestConflictSequence = task.checkpoint.state.runs.flatMap((run) => run.steps)
    .filter((step) =>
      step.action.kind === "tool.workspace.file.write_text"
      && step.observation?.outcome === "failed"
      && workspaceErrorCode(step.observation.error) === "workspace.file.content_changed")
    .reduce((latest, step) => Math.max(latest, step.sequence), 0);
  if (current.sequence <= latestConflictSequence) {
    throw new Error("workspace_text_read.rebase_read_required");
  }
  if (current.sha256 !== input.expectedPreviousSha256) {
    throw new Error("workspace_text_read.proof_not_current");
  }
  const material = JsonValueSchema.parse({
    domain: PROOF_DOMAIN,
    taskId: input.taskId,
    sourceUserMessageId: binding.userMessageId,
    sourceActionId: current.actionId,
    sourceObservationId: current.observationId,
    capabilityId: TEXT_FILE_READ_CAPABILITY_ID,
    capabilityRevision: lock.definitionSnapshot.revision,
    workspaceGrantId: input.workspaceGrantId,
    relativePath: input.relativePath,
    sha256: current.sha256,
    byteSize: current.byteSize,
    mediaType: current.mediaType,
  });
  return {
    digest: sha256CanonicalJson(material),
    taskId: input.taskId,
    sourceUserMessageId: binding.userMessageId,
    sourceActionId: current.actionId,
    sourceObservationId: current.observationId,
    workspaceGrantId: input.workspaceGrantId,
    relativePath: input.relativePath,
    sha256: current.sha256,
    byteSize: current.byteSize,
    mediaType: current.mediaType,
  };
}

export async function assertWorkspaceTextEditAttemptCanWrite(input: Readonly<{
  taskId: string;
  relativePath: string;
  tasks: TaskPersistence;
}>): Promise<void> {
  const task = await input.tasks.loadTask(input.taskId);
  if (task === undefined) throw new Error("workspace_text_read.task_not_found");
  let contentChangedCount = 0;
  for (const step of task.checkpoint.state.runs.flatMap((run) => run.steps)) {
    if (step.action.kind !== "tool.workspace.file.write_text") continue;
    const payload = objectRecord(step.action.payload);
    if (payload.relativePath !== input.relativePath || step.observation === undefined) continue;
    const code = step.observation.outcome === "succeeded"
      ? undefined
      : workspaceErrorCode(step.observation.error);
    if (code === "workspace.file.write_uncertain") {
      throw new Error("workspace.file.write_uncertain");
    }
    if (code === "workspace.file.content_changed") contentChangedCount += 1;
  }
  if (contentChangedCount >= 2) {
    throw new Error("workspace.file.content_changed_repeated");
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function workspaceErrorCode(error: Readonly<{
  code: string;
  details?: Readonly<Record<string, unknown>> | undefined;
}>): string {
  const detailCode = error.details?.detailCode;
  return typeof detailCode === "string" ? detailCode : error.code;
}

function requireString(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(code);
  return value;
}

function requireSha256(value: unknown, code: string): string {
  const parsed = requireString(value, code);
  if (!SHA256_PATTERN.test(parsed)) throw new Error(code);
  return parsed;
}

function requireNonNegativeInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(code);
  }
  return value;
}
