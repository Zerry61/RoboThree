import type { TaskCapabilityLock } from "@robothree/contracts";
import type { ReasoningProfileSubject } from
  "@robothree/contracts/reasoning-mode/v1alpha1";

import {
  type ExactSubjectProviderReleaseMaterializationInput,
  type ExactSubjectProviderReleaseMaterializationResult,
} from "./exact-subject-provider-release-materializer.js";
import type {
  Dfi541ProviderReleaseAdmissionResolver,
  Dfi541ProviderReleaseAdmissionResult,
} from "./reasoning-mode-lock-planner-v1alpha2.js";

export interface Dfi541ExactSubjectAdmissionInputSource {
  loadExact(input: Readonly<{
    subject: ReasoningProfileSubject;
    modelLock: TaskCapabilityLock;
  }>): Promise<ExactSubjectProviderReleaseMaterializationInput | undefined>;
}

export class Dfi541ExactSubjectProviderReleaseAdmissionResolver
implements Dfi541ProviderReleaseAdmissionResolver {
  readonly #materializer: Readonly<{
    materialize(input: ExactSubjectProviderReleaseMaterializationInput):
      ExactSubjectProviderReleaseMaterializationResult;
  }>;

  public constructor(
    private readonly source: Dfi541ExactSubjectAdmissionInputSource,
    materializer: Readonly<{
      materialize(input: ExactSubjectProviderReleaseMaterializationInput):
        ExactSubjectProviderReleaseMaterializationResult;
    }>,
  ) {
    this.#materializer = materializer;
  }

  public async resolve(input: Parameters<
    Dfi541ProviderReleaseAdmissionResolver["resolve"]
  >[0]): Promise<Dfi541ProviderReleaseAdmissionResult> {
    let exact;
    try {
      exact = await this.source.loadExact({
        subject: input.subject,
        modelLock: input.modelLock,
      });
    } catch {
      return rejected("provider_release.subject_invalid");
    }
    if (exact === undefined) {
      return unavailable("provider_release.policy_unavailable");
    }
    const materialized = this.#materializer.materialize(exact);
    if (materialized.state === "rejected") {
      return materialized.code === "provider_release.policy_unavailable"
        || materialized.code === "provider_release.policy_not_admitted"
        ? unavailable(materialized.code)
        : rejected(materialized.code);
    }
    if (materialized.state === "pending_conformance_materialized") {
      return unavailable("provider_release.policy_not_admitted");
    }
    const envelope = materialized.envelope;
    const release = materialized.release;
    if (
      envelope.profileRef.profileRevision !== input.profileRevision
      || envelope.profileRef.profileDigest !== input.profileDigest
      || envelope.strategyRef.strategyRevision !== input.strategyRevision
      || envelope.strategyRef.strategyDigest !== input.strategyDigest
      || envelope.strategyRef.timeoutPolicyRef !== input.timeoutPolicyRef
      || release.mapping.profileRef.profileId !== input.profileId
      || release.mapping.strategyRef.strategyId !== input.strategyId
    ) {
      return rejected("provider_release.materialization_conflict");
    }
    return Object.freeze({
      state: "admitted",
      evidence: Object.freeze({
        state: "admitted",
        policyRef: exactRef(
          envelope.policyRef.policyRevision,
          envelope.policyRef.policyDigest,
        ),
        profileRef: exactRef(
          envelope.profileRef.profileRevision,
          envelope.profileRef.profileDigest,
        ),
        strategyRef: exactRef(
          envelope.strategyRef.strategyRevision,
          envelope.strategyRef.strategyDigest,
        ),
        mappingRef: exactRef(
          envelope.mappingRef.mappingRevision,
          envelope.mappingRef.mappingDigest,
        ),
        materializationDigest: envelope.materializationDigest,
        manifestRef: exactRef(
          envelope.conformanceManifestRef.manifestRevision,
          envelope.conformanceManifestRef.manifestDigest,
        ),
      }),
    });
  }
}

function exactRef(revision: string, digest: string) {
  return Object.freeze({ revision, digest });
}

function unavailable(
  code: "provider_release.policy_unavailable" | "provider_release.policy_not_admitted",
): Dfi541ProviderReleaseAdmissionResult {
  return Object.freeze({ state: "unavailable", code });
}

function rejected(code: string): Dfi541ProviderReleaseAdmissionResult {
  return Object.freeze({ state: "rejected", code });
}
