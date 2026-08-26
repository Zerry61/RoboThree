import type {
  LocalPersonalModelInvocationLink,
} from "../application/local-personal-model-invocation.js";
import type {
  LocalPersonalUsageAuthorityPort,
  ProviderUsageFact,
} from "./provider-usage.js";
import type { InvocationUsageProjection } from "./provider-usage-projection-persistence.js";
import type {
  PersonalModelCommandReceipt,
} from "./personal-model-persistence.js";
import type { PersonalModelStatusFact } from "../application/personal-model-domain.js";
import type {
  LocalPersonalInvocationTimeoutFact,
} from "../application/model-invocation-timeout-policy.js";

export type LocalPersonalInvocationWriteResult =
  | Readonly<{ ok: true; replayed: boolean; value: LocalPersonalModelInvocationLink }>
  | Readonly<{ ok: false; error: Readonly<{
    code:
      | "local_personal_invocation.conflict"
      | "local_personal_invocation.not_found"
      | "local_personal_invocation.stale_fencing"
      | "local_personal.timeout_fact_legacy_missing"
      | "local_personal.timeout_fact_drift";
    message: string;
  }> }>;

export interface LocalPersonalModelInvocationPersistence
extends LocalPersonalUsageAuthorityPort {
  start(): Promise<void>;
  stop(): Promise<void>;
  prepareInvocation(
    input: Readonly<{
      link: LocalPersonalModelInvocationLink;
      timeoutFact: LocalPersonalInvocationTimeoutFact;
    }>,
  ): Promise<LocalPersonalInvocationWriteResult>;
  advanceInvocation(input: Readonly<{
    expectedRecordDigest: string;
    next: LocalPersonalModelInvocationLink;
  }>): Promise<LocalPersonalInvocationWriteResult>;
  commitTerminalOutcome(input: Readonly<{
    expectedRecordDigest: string;
    terminal: LocalPersonalModelInvocationLink;
    usageFact?: ProviderUsageFact;
    usageProjection?: InvocationUsageProjection;
    statusObservation?: Readonly<{
      status: PersonalModelStatusFact;
      expectedStatusRevision: number;
      receipt: PersonalModelCommandReceipt;
    }>;
  }>): Promise<LocalPersonalInvocationWriteResult>;
  loadInvocation(input: Readonly<{
    invocationKind: LocalPersonalModelInvocationLink["invocationKind"];
    invocationLinkId: string;
  }>): Promise<LocalPersonalModelInvocationLink | undefined>;
  loadInvocationTimeoutFact(
    authorityInvocationId: string,
  ): Promise<LocalPersonalInvocationTimeoutFact | undefined>;
  listPending(limit: number): Promise<readonly LocalPersonalModelInvocationLink[]>;
}
