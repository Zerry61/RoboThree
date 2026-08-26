import type { Clock } from "../ports/clock.js";
import type {
  LocalPersonalModelInvocationPersistence,
} from "../ports/local-personal-model-invocation-persistence.js";
import {
  createLocalPersonalModelInvocationLink,
  type LocalPersonalModelInvocationLink,
} from "./local-personal-model-invocation.js";
import {
  validateLocalPersonalInvocationTimeoutFact,
  type ModelInvocationTimeoutPolicy,
} from "./model-invocation-timeout-policy.js";

export type LocalPersonalInvocationRecoveryDisposition =
  | "resume_on_task_owner"
  | "at_least_once_on_task_owner"
  | "recovery_exhausted"
  | "invalidated";

export type LocalPersonalInvocationRecoveryClassification = Readonly<{
  invocationKind: LocalPersonalModelInvocationLink["invocationKind"];
  invocationLinkId: string;
  disposition: LocalPersonalInvocationRecoveryDisposition;
  fencingEpoch: number;
}>;

export type LocalPersonalInvocationRecoveryEvidence = Readonly<{
  scannedCount: number;
  hasMore: boolean;
  resumeOnTaskOwnerCount: number;
  atLeastOnceRiskCount: number;
  recoveryExhaustedCount: number;
  invalidatedCount: number;
  classifications: readonly LocalPersonalInvocationRecoveryClassification[];
}>;

/**
 * Startup-only bounded classifier. It never dispatches a Provider request:
 * accepted/dispatching links may only resume after the normal Task owner,
 * exact lock and admission path has been re-established.
 */
export class LocalPersonalModelInvocationRecoveryCoordinator {
  readonly #persistence: LocalPersonalModelInvocationPersistence;
  readonly #clock: Clock;
  readonly #validate: ((link: LocalPersonalModelInvocationLink) => Promise<boolean>) | undefined;
  readonly #timeoutPolicy: ModelInvocationTimeoutPolicy;

  public constructor(input: Readonly<{
    persistence: LocalPersonalModelInvocationPersistence;
    clock: Clock;
    timeoutPolicy: ModelInvocationTimeoutPolicy;
    validate?: (link: LocalPersonalModelInvocationLink) => Promise<boolean>;
  }>) {
    this.#persistence = input.persistence;
    this.#clock = input.clock;
    this.#timeoutPolicy = input.timeoutPolicy;
    this.#validate = input.validate;
  }

  public async classify(limit = 200): Promise<LocalPersonalInvocationRecoveryEvidence> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new Error("Local Personal recovery limit must be between 1 and 200");
    }
    const pending = await this.#persistence.listPending(limit);
    const classifications: LocalPersonalInvocationRecoveryClassification[] = [];
    for (const link of pending) {
      const timeoutFact = await this.#persistence.loadInvocationTimeoutFact(
        link.authorityInvocationId,
      );
      if (timeoutFact === undefined) {
        await this.#markExhausted(link, "local_personal.timeout_fact_legacy_missing");
        classifications.push(classification(link, "recovery_exhausted"));
        continue;
      }
      try {
        const exactTimeout = validateLocalPersonalInvocationTimeoutFact(
          timeoutFact,
          this.#timeoutPolicy,
        );
        if (exactTimeout.authorityInvocationId !== link.authorityInvocationId) {
          throw new Error("local_personal.timeout_fact_drift");
        }
        if (Date.parse(exactTimeout.invocationDeadlineAt) <= Date.parse(this.#clock.now())) {
          await this.#markExhausted(link, "personal_model.invocation_deadline_exceeded");
          classifications.push(classification(link, "recovery_exhausted"));
          continue;
        }
      } catch {
        await this.#markExhausted(link, "local_personal.timeout_fact_drift");
        classifications.push(classification(link, "recovery_exhausted"));
        continue;
      }
      const valid = this.#validate === undefined ? true : await this.#validate(link);
      if (!valid) {
        await this.#markExhausted(link, "local_personal_invocation.recovery_identity_invalid");
        classifications.push(classification(link, "invalidated"));
        continue;
      }
      if (link.status === "output_started" || link.outputStartedAt !== undefined) {
        await this.#markExhausted(link, "model_stream_resume_unavailable");
        classifications.push(classification(link, "recovery_exhausted"));
        continue;
      }
      classifications.push(classification(
        link,
        link.status === "dispatching"
          ? "at_least_once_on_task_owner"
          : "resume_on_task_owner",
      ));
    }
    return Object.freeze({
      scannedCount: pending.length,
      hasMore: pending.length === limit,
      resumeOnTaskOwnerCount: count(classifications, "resume_on_task_owner"),
      atLeastOnceRiskCount: count(classifications, "at_least_once_on_task_owner"),
      recoveryExhaustedCount: count(classifications, "recovery_exhausted"),
      invalidatedCount: count(classifications, "invalidated"),
      classifications: Object.freeze(classifications),
    });
  }

  async #markExhausted(
    link: LocalPersonalModelInvocationLink,
    typedErrorCode: string,
  ): Promise<void> {
    const at = this.#clock.now();
    const result = await this.#persistence.advanceInvocation({
      expectedRecordDigest: link.recordDigest,
      next: createLocalPersonalModelInvocationLink({
        ...withoutDigest(link),
        status: "recovery_exhausted",
        terminalAt: at,
        typedErrorCode,
        updatedAt: at,
      }),
    });
    if (result.ok) return;
    const current = await this.#persistence.loadInvocation({
      invocationKind: link.invocationKind,
      invocationLinkId: link.invocationLinkId,
    });
    if (current?.status !== "terminal" && current?.status !== "recovery_exhausted") {
      throw new Error(result.error.code);
    }
  }
}

function classification(
  link: LocalPersonalModelInvocationLink,
  disposition: LocalPersonalInvocationRecoveryDisposition,
): LocalPersonalInvocationRecoveryClassification {
  return Object.freeze({
    invocationKind: link.invocationKind,
    invocationLinkId: link.invocationLinkId,
    disposition,
    fencingEpoch: link.fencingEpoch,
  });
}

function count(
  values: readonly LocalPersonalInvocationRecoveryClassification[],
  disposition: LocalPersonalInvocationRecoveryDisposition,
): number {
  return values.filter((value) => value.disposition === disposition).length;
}

function withoutDigest(link: LocalPersonalModelInvocationLink) {
  const { recordDigest: _recordDigest, ...material } = link;
  return material;
}
