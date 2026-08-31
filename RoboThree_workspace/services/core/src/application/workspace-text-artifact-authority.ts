import { JsonObjectSchema, JsonValueSchema } from "@robothree/contracts";
import { TEXT_FILE_WRITE_CAPABILITY_ID } from "@robothree/document-worker";

import { projectArtifactIndexForTask } from "./artifact-preview-projection.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type { ArtifactLifecyclePersistence } from "../ports/desktop-foundation-persistence.js";
import type { TaskPersistence } from "../ports/task-persistence.js";

const PROOF_DOMAIN = "robothree.wfw-owned-artifact-proof.v1";

export type WorkspaceTextArtifactProofMaterial = Readonly<{
  sessionId: string;
  sourceTaskId: string;
  sourceObservationId: string;
  artifactId: string;
  capabilityRevision: string;
  workspaceGrantId: string;
  relativePath: string;
  sourceFileSha256: string;
  artifactLifecycleRevision: number;
}>;

export type WorkspaceTextArtifactProof = Readonly<{
  digest: string;
  sourceTaskId: string;
  sourceObservationId: string;
  artifactId: string;
  sourceFileSha256: string;
}>;

export async function deriveWorkspaceTextArtifactProof(input: Readonly<{
  taskId: string;
  workspaceGrantId: string;
  relativePath: string;
  expectedPreviousSha256: string;
  tasks: TaskPersistence;
  artifactLifecycles: ArtifactLifecyclePersistence;
}>): Promise<WorkspaceTextArtifactProof> {
  const current = await input.tasks.loadTask(input.taskId);
  if (current === undefined) throw new Error("workspace_text.task_not_found");
  const sessionId = current.checkpoint.state.sessionId;
  if (sessionId === undefined) throw new Error("workspace_text.session_not_found");
  const tasks = await input.tasks.listTasksBySession(sessionId);
  const nodes: Array<Readonly<{
    sha256: string;
    previousSha256?: string;
    sourceTaskId: string;
    sourceObservationId: string;
    artifactId: string;
    capabilityRevision: string;
    artifactLifecycleRevision: number;
  }>> = [];

  for (const task of tasks) {
    const candidates = task.checkpoint.state.runs.flatMap((run) => run.steps)
      .flatMap((step) => {
        const observation = step.observation;
        if (
          step.action.kind !== TEXT_FILE_WRITE_CAPABILITY_ID
          || observation?.outcome !== "succeeded"
        ) return [];
        return [{
          observation,
          payload: JsonObjectSchema.parse(step.action.payload),
        }];
      })
      .filter(({ payload }) => payload.relativePath === input.relativePath);
    if (candidates.length === 0) continue;
    const sourceSelection = await input.tasks.loadReadableTaskRuntimeSelection(
      task.checkpoint.state.taskId,
    );
    if (sourceSelection?.workspaceGrantId === undefined) {
      throw new Error("workspace_text.artifact_head_mismatch");
    }
    if (sourceSelection.workspaceGrantId !== input.workspaceGrantId) continue;
    const artifacts = projectArtifactIndexForTask({
      task,
      desktopSessionId: sessionId,
    });
    for (const { observation } of candidates) {
      const envelope = objectRecord(observation.output);
      const result = objectRecord(envelope.result);
      const sha256 = requireSha256(result.sha256, "workspace_text.output_sha256");
      const previousSha256 = result.previousSha256 === undefined
        ? undefined
        : requireSha256(result.previousSha256, "workspace_text.previous_sha256");
      const artifact = artifacts.find((candidate) =>
        candidate.sourceId === observation.observationId
        && candidate.metadata.capabilityId === TEXT_FILE_WRITE_CAPABILITY_ID);
      if (artifact === undefined) throw new Error("workspace_text.artifact_projection_missing");
      const lifecycle = await input.artifactLifecycles.loadArtifactLifecycle(artifact.artifactId);
      if (
        lifecycle !== undefined
        && lifecycle.sourceDigest !== artifact.sourceDigest
      ) {
        throw new Error("workspace_text.artifact_lifecycle_source_mismatch");
      }
      if (lifecycle?.lifecycle.deleted === true || lifecycle?.lifecycle.sourceDeleted === true) {
        throw new Error("workspace_text.artifact_deleted");
      }
      const lock = await input.tasks.loadTaskCapabilityLock(
        task.checkpoint.state.taskId,
        TEXT_FILE_WRITE_CAPABILITY_ID,
      );
      if (lock === undefined) throw new Error("workspace_text.capability_lock_missing");
      nodes.push({
        sha256,
        ...(previousSha256 === undefined ? {} : { previousSha256 }),
        sourceTaskId: task.checkpoint.state.taskId,
        sourceObservationId: observation.observationId,
        artifactId: artifact.artifactId,
        capabilityRevision: lock.definitionSnapshot.revision,
        artifactLifecycleRevision: lifecycle?.lifecycle.revision ?? 0,
      });
    }
  }

  const bySha = new Map<string, typeof nodes>();
  for (const node of nodes) {
    bySha.set(node.sha256, [...(bySha.get(node.sha256) ?? []), node]);
  }
  if ([...bySha.values()].some((matches) => matches.length !== 1)) {
    throw new Error("workspace_text.artifact_history_ambiguous");
  }
  const replacedShas = new Set(nodes.flatMap((node) =>
    node.previousSha256 === undefined ? [] : [node.previousSha256]));
  const heads = nodes.filter((node) => !replacedShas.has(node.sha256));
  if (heads.length !== 1 || heads[0]!.sha256 !== input.expectedPreviousSha256) {
    throw new Error("workspace_text.artifact_head_mismatch");
  }
  const head = heads[0]!;
  const material: WorkspaceTextArtifactProofMaterial = {
    sessionId,
    sourceTaskId: head.sourceTaskId,
    sourceObservationId: head.sourceObservationId,
    artifactId: head.artifactId,
    capabilityRevision: head.capabilityRevision,
    workspaceGrantId: input.workspaceGrantId,
    relativePath: input.relativePath,
    sourceFileSha256: head.sha256,
    artifactLifecycleRevision: head.artifactLifecycleRevision,
  };
  const digest = calculateWorkspaceTextArtifactProofDigest(material);
  return {
    digest,
    sourceTaskId: head.sourceTaskId,
    sourceObservationId: head.sourceObservationId,
    artifactId: head.artifactId,
    sourceFileSha256: head.sha256,
  };
}

export function calculateWorkspaceTextArtifactProofDigest(
  material: WorkspaceTextArtifactProofMaterial,
): string {
  return sha256CanonicalJson(JsonValueSchema.parse({
    domain: PROOF_DOMAIN,
    sessionId: material.sessionId,
    sourceTaskId: material.sourceTaskId,
    sourceObservationId: material.sourceObservationId,
    artifactId: material.artifactId,
    capabilityId: TEXT_FILE_WRITE_CAPABILITY_ID,
    capabilityRevision: material.capabilityRevision,
    workspaceGrantId: material.workspaceGrantId,
    relativePath: material.relativePath,
    sourceFileSha256: material.sourceFileSha256,
    artifactLifecycleRevision: material.artifactLifecycleRevision,
  }));
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function requireSha256(value: unknown, code: string): string {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new Error(code);
  }
  return value;
}
