import type {
  TaskCapabilityLock,
  TaskRuntimeSelection,
} from "@robothree/contracts";

import type {
  EnterpriseIdentityScope,
} from "../ports/enterprise-access-token-provider.js";
import type {
  EnterpriseConfigurationPersistence,
} from "../ports/enterprise-configuration-persistence.js";
import type {
  RuntimeActivationAttempt,
  RuntimeActivationPersistence,
  RuntimeActivationTarget,
} from "../ports/runtime-activation-persistence.js";
import type {
  PersistedTask,
  TaskPersistence,
} from "../ports/task-persistence.js";
import {
  hasValidTaskRuntimeSelection,
} from "./runtime-selection-revisions.js";

export type EnterpriseTaskGenerationRecoveryStatus =
  | "local_task"
  | "current_generation"
  | "locked_previous_generation"
  | "waiting_enterprise_session"
  | "generation_unavailable"
  | "integrity_mismatch";

export type EnterpriseTaskGenerationRecoveryDecision = Readonly<{
  taskId: string;
  taskStatus: PersistedTask["head"]["status"];
  status: EnterpriseTaskGenerationRecoveryStatus;
  candidateKey?: string;
  snapshotRevision?: string;
  registryRevision?: string;
  errorCode?: string;
}>;

export type EnterpriseTaskGenerationRecoveryReport = Readonly<{
  scope: EnterpriseIdentityScope;
  runtimeActiveCandidateKey?: string;
  decisions: readonly EnterpriseTaskGenerationRecoveryDecision[];
}>;

/**
 * Joins the two persistence authorities in a fixed read order. It never writes,
 * rebinds a Task, or promotes a generation.
 */
export class EnterpriseTaskGenerationRecoveryCoordinator {
  readonly #configuration: EnterpriseConfigurationPersistence;
  readonly #activation: RuntimeActivationPersistence;
  readonly #tasks: TaskPersistence;

  constructor(input: {
    configurationPersistence: EnterpriseConfigurationPersistence;
    runtimeActivationPersistence: RuntimeActivationPersistence;
    taskPersistence: TaskPersistence;
  }) {
    this.#configuration = input.configurationPersistence;
    this.#activation = input.runtimeActivationPersistence;
    this.#tasks = input.taskPersistence;
  }

  async recover(input: Readonly<{
    scope: EnterpriseIdentityScope;
    enterpriseSessionValid: boolean;
  }>): Promise<EnterpriseTaskGenerationRecoveryReport> {
    // Enterprise activation facts are authoritative and must be read first.
    const activationState = await this.#activation
      .loadRuntimeActivationState(input.scope);
    const attempts = await this.#activation
      .listRuntimeActivationAttempts(input.scope);
    const targets = knownTargets(activationState.runtimeActive?.target, attempts);

    // Task facts come from the independent Task database only after the
    // enterprise authority has been read.
    const tasks = await this.#tasks.listRecoveryCandidates();
    const decisions: EnterpriseTaskGenerationRecoveryDecision[] = [];
    for (const task of tasks) {
      const selection = await this.#tasks.loadTaskRuntimeSelection(
        task.head.taskId,
      );
      const locks = await this.#tasks.listTaskCapabilityLocks(task.head.taskId);
      decisions.push(await this.#decide({
        task,
        selection,
        locks,
        targets,
        enterpriseSessionValid: input.enterpriseSessionValid,
        ...(activationState.runtimeActive === undefined
          ? {}
          : {
            runtimeActiveCandidateKey:
              activationState.runtimeActive.target.candidateKey,
          }),
        scope: input.scope,
      }));
    }
    return Object.freeze({
      scope: input.scope,
      ...(activationState.runtimeActive === undefined
        ? {}
        : {
          runtimeActiveCandidateKey:
            activationState.runtimeActive.target.candidateKey,
        }),
      decisions: Object.freeze(decisions),
    });
  }

  async #decide(input: Readonly<{
    task: PersistedTask;
    selection: TaskRuntimeSelection | undefined;
    locks: readonly TaskCapabilityLock[];
    targets: readonly RuntimeActivationTarget[];
    enterpriseSessionValid: boolean;
    runtimeActiveCandidateKey?: string;
    scope: EnterpriseIdentityScope;
  }>): Promise<EnterpriseTaskGenerationRecoveryDecision> {
    const taskId = input.task.head.taskId;
    const base = {
      taskId,
      taskStatus: input.task.head.status,
    } as const;
    if (input.selection === undefined) {
      return Object.freeze({
        ...base,
        status: "integrity_mismatch",
        errorCode: "enterprise_recovery.selection_missing",
      });
    }
    if (!hasValidTaskRuntimeSelection(input.selection)
      || !locksMatchSelection(input.selection, input.locks)) {
      return Object.freeze({
        ...base,
        status: "integrity_mismatch",
        errorCode: "enterprise_recovery.lock_mismatch",
      });
    }
    if (input.selection.enterpriseConfigRevision === undefined) {
      return Object.freeze({ ...base, status: "local_task" });
    }
    if (!input.enterpriseSessionValid) {
      return Object.freeze({
        ...base,
        status: "waiting_enterprise_session",
        snapshotRevision: input.selection.enterpriseConfigRevision,
        registryRevision: input.selection.registryRevision,
        errorCode: "enterprise_recovery.session_invalid",
      });
    }
    const matches = input.targets.filter((target) =>
      taskEnterpriseConfigRevision(target.snapshotRevision)
        === input.selection?.enterpriseConfigRevision
      && target.registryRevision === input.selection.registryRevision);
    if (matches.length !== 1) {
      return Object.freeze({
        ...base,
        status: matches.length === 0
          ? "generation_unavailable"
          : "integrity_mismatch",
        snapshotRevision: input.selection.enterpriseConfigRevision,
        registryRevision: input.selection.registryRevision,
        errorCode: matches.length === 0
          ? "enterprise_recovery.generation_unavailable"
          : "enterprise_recovery.generation_ambiguous",
      });
    }
    const target = matches[0]!;
    const generation = await this.#configuration.loadSealedGeneration(
      input.scope,
      target.candidateKey,
    );
    if (generation === undefined || !generationMatchesTarget(generation, target)) {
      return Object.freeze({
        ...base,
        status: "integrity_mismatch",
        candidateKey: target.candidateKey,
        snapshotRevision: taskEnterpriseConfigRevision(
          target.snapshotRevision,
        ),
        registryRevision: target.registryRevision,
        errorCode: "enterprise_recovery.generation_integrity_mismatch",
      });
    }
    return Object.freeze({
      ...base,
      status: target.candidateKey === input.runtimeActiveCandidateKey
        ? "current_generation"
        : "locked_previous_generation",
      candidateKey: target.candidateKey,
      snapshotRevision: taskEnterpriseConfigRevision(target.snapshotRevision),
      registryRevision: target.registryRevision,
    });
  }
}

export type EnterpriseGenerationReferenceKind =
  | "storage_active"
  | "storage_previous"
  | "runtime_active"
  | "pending_activation"
  | "activation_failure_target"
  | "activation_failure_fallback"
  | "non_terminal_task_selection"
  | "recovering_task"
  | "task_capability_lock";

export type EnterpriseGenerationReference = Readonly<{
  kind: EnterpriseGenerationReferenceKind;
  referenceId: string;
}>;

export type EnterpriseGenerationDeletionBlock = Readonly<{
  candidateKey: string;
  referenced: boolean;
  safeToDelete: false;
  references: readonly EnterpriseGenerationReference[];
}>;

/**
 * Produces auditable blockers only. Alpha deliberately has no delete decision
 * and no destructive GC operation.
 */
export class EnterpriseGenerationReferenceAnalyzer {
  readonly #configuration: EnterpriseConfigurationPersistence;
  readonly #activation: RuntimeActivationPersistence;
  readonly #tasks: TaskPersistence;

  constructor(input: {
    configurationPersistence: EnterpriseConfigurationPersistence;
    runtimeActivationPersistence: RuntimeActivationPersistence;
    taskPersistence: TaskPersistence;
  }) {
    this.#configuration = input.configurationPersistence;
    this.#activation = input.runtimeActivationPersistence;
    this.#tasks = input.taskPersistence;
  }

  async analyze(input: Readonly<{
    scope: EnterpriseIdentityScope;
    candidateKey: string;
  }>): Promise<EnterpriseGenerationDeletionBlock> {
    const references: EnterpriseGenerationReference[] = [];
    const active = await this.#configuration.loadActive(input.scope);
    const previous = await this.#configuration.loadPrevious(input.scope);
    if (active?.configuration.identity.candidateKey === input.candidateKey) {
      references.push({ kind: "storage_active", referenceId: input.candidateKey });
    }
    if (previous?.configuration.identity.candidateKey === input.candidateKey) {
      references.push({ kind: "storage_previous", referenceId: input.candidateKey });
    }

    const state = await this.#activation.loadRuntimeActivationState(input.scope);
    const attempts = await this.#activation
      .listRuntimeActivationAttempts(input.scope);
    if (state.runtimeActive?.target.candidateKey === input.candidateKey) {
      references.push({
        kind: "runtime_active",
        referenceId: state.runtimeActive.activationAttemptId,
      });
    }
    const targetRegistryRevisions = new Set<string>();
    for (const attempt of attempts) {
      this.#collectAttemptReferences(
        attempt,
        input.candidateKey,
        references,
        targetRegistryRevisions,
      );
    }

    const generation = await this.#configuration.loadSealedGeneration(
      input.scope,
      input.candidateKey,
    );
    if (generation !== undefined) {
      const recoveryCandidates = await this.#tasks.listRecoveryCandidates();
      for (const task of recoveryCandidates) {
        const selection = await this.#tasks.loadTaskRuntimeSelection(
          task.head.taskId,
        );
        if (selection === undefined
          || selection.enterpriseConfigRevision
          !== taskEnterpriseConfigRevision(
            generation.configuration.identity.snapshotRevision,
          )) {
          continue;
        }
        references.push({
          kind: "non_terminal_task_selection",
          referenceId: task.head.taskId,
        });
        references.push({
          kind: "recovering_task",
          referenceId: task.head.taskId,
        });
        const locks = await this.#tasks.listTaskCapabilityLocks(task.head.taskId);
        if (locks.some((lock) =>
          lock.registryRevision === selection.registryRevision
          && (targetRegistryRevisions.size === 0
            || targetRegistryRevisions.has(lock.registryRevision)))) {
          references.push({
            kind: "task_capability_lock",
            referenceId: task.head.taskId,
          });
        }
      }
    }

    const unique = dedupeReferences(references);
    return Object.freeze({
      candidateKey: input.candidateKey,
      referenced: unique.length > 0,
      safeToDelete: false,
      references: Object.freeze(unique),
    });
  }

  #collectAttemptReferences(
    attempt: RuntimeActivationAttempt,
    candidateKey: string,
    references: EnterpriseGenerationReference[],
    targetRegistryRevisions: Set<string>,
  ): void {
    if (attempt.target.candidateKey === candidateKey) {
      targetRegistryRevisions.add(attempt.target.registryRevision);
      if (attempt.status === "failed") {
        references.push({
          kind: "activation_failure_target",
          referenceId: attempt.activationAttemptId,
        });
      } else if (attempt.status !== "completed") {
        references.push({
          kind: "pending_activation",
          referenceId: attempt.activationAttemptId,
        });
      }
    }
    if (attempt.failure?.fallbackRuntimeActive?.target.candidateKey
      === candidateKey) {
      targetRegistryRevisions.add(
        attempt.failure.fallbackRuntimeActive.target.registryRevision,
      );
      references.push({
        kind: "activation_failure_fallback",
        referenceId: attempt.activationAttemptId,
      });
    }
  }
}

function knownTargets(
  active: RuntimeActivationTarget | undefined,
  attempts: readonly RuntimeActivationAttempt[],
): readonly RuntimeActivationTarget[] {
  const targets = [
    ...(active === undefined ? [] : [active]),
    ...attempts.flatMap((attempt) => [
      attempt.target,
      ...(attempt.expectedPreviousRuntimeActive === undefined
        ? []
        : [attempt.expectedPreviousRuntimeActive.target]),
      ...(attempt.failure?.fallbackRuntimeActive === undefined
        ? []
        : [attempt.failure.fallbackRuntimeActive.target]),
    ]),
  ];
  const byCandidate = new Map<string, RuntimeActivationTarget>();
  for (const target of targets) {
    const existing = byCandidate.get(target.candidateKey);
    if (existing !== undefined
      && (existing.snapshotRevision !== target.snapshotRevision
        || existing.registryRevision !== target.registryRevision
        || existing.snapshotDigest !== target.snapshotDigest
        || existing.materializationDigest !== target.materializationDigest)) {
      // Preserve both facts so recovery fails closed as ambiguous.
      byCandidate.set(
        `${target.candidateKey}:${target.registryRevision}`,
        target,
      );
    } else {
      byCandidate.set(target.candidateKey, target);
    }
  }
  return Object.freeze([...byCandidate.values()]);
}

function locksMatchSelection(
  selection: TaskRuntimeSelection,
  locks: readonly TaskCapabilityLock[],
): boolean {
  const expected = [
    selection.resolvedModelLock,
    ...selection.toolLocks,
  ];
  return expected.length === locks.length
    && expected.every((reference) => locks.some((lock) =>
      lock.lockId === reference.lockId
      && lock.definitionSnapshot.capabilityId === reference.capabilityId
      && lock.registryRevision === selection.registryRevision));
}

function generationMatchesTarget(
  generation: Awaited<
    ReturnType<EnterpriseConfigurationPersistence["loadSealedGeneration"]>
  > & {},
  target: RuntimeActivationTarget,
): boolean {
  return generation.configuration.identity.candidateKey === target.candidateKey
    && generation.configuration.identity.snapshotRevision
      === target.snapshotRevision
    && generation.configuration.identity.snapshotDigest === target.snapshotDigest
    && generation.configuration.materializationDigest
      === target.materializationDigest;
}

function dedupeReferences(
  references: readonly EnterpriseGenerationReference[],
): EnterpriseGenerationReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.referenceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function taskEnterpriseConfigRevision(snapshotRevision: string): string {
  return snapshotRevision.startsWith("sha256:")
    ? snapshotRevision
    : `sha256:${snapshotRevision}`;
}
