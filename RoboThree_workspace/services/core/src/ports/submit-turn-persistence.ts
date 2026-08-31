import type {
  DesktopDeliveryRecord,
  RuntimeError,
  SubmitTurnRecord,
  SubmitTurnRecordV1Alpha2,
} from "@robothree/contracts";
import type { ReadablePersistedSubmitTurnReceiptV1Alpha5 as ReadablePersistedSubmitTurnReceipt } from
  "@robothree/contracts/submit-turn-coordination/v1alpha5";
import type { ReadableSubmitTurnRecordV1Alpha5 as ReadableSubmitTurnRecord } from
  "@robothree/contracts/submit-turn-coordination/v1alpha5";

import type { PersistenceAdapter } from "./persistence.js";
import type { PersistedR2D3CoordinationEnvelopeV1 } from
  "../application/r2d3-durable-acceptance.js";
import type { PersistedDfi541CoordinationEnvelopeV1 } from
  "../application/dfi541-durable-acceptance.js";

export type SubmitTurnWriteResult<T> =
  | { ok: true; replayed: boolean; value: T }
  | { ok: false; error: RuntimeError };

export type DesktopDeliveryDraft = Omit<DesktopDeliveryRecord, "sequence">;

export type DesktopDeliveryBounds = Readonly<{
  oldestSequence: number;
  latestSequence: number;
}>;

export type SubmitTurnPersistenceFaultPoint =
  | "submit_turn.accepted.after_commit"
  | "submit_turn.message_appended.after_commit"
  | "submit_turn.task_committed.after_commit"
  | "submit_turn.completed.after_commit"
  | "submit_turn.failed_terminal.after_commit"
  | "submit_turn.loop_started.after_commit";

export type SubmitTurnPersistenceFaultInjector = (
  point: SubmitTurnPersistenceFaultPoint,
) => void;

export interface SubmitTurnPersistence extends PersistenceAdapter {
  prepareAccepted(
    record: ReadableSubmitTurnRecord,
  ): Promise<SubmitTurnWriteResult<ReadableSubmitTurnRecord>>;
  prepareAcceptedR2D3(
    envelope: PersistedR2D3CoordinationEnvelopeV1,
  ): Promise<SubmitTurnWriteResult<ReadableSubmitTurnRecord>>;
  prepareAcceptedDfi541(
    envelope: PersistedDfi541CoordinationEnvelopeV1,
  ): Promise<SubmitTurnWriteResult<ReadableSubmitTurnRecord>>;
  loadRecord(
    submitTurnCommandId: string,
  ): Promise<ReadableSubmitTurnRecord | undefined>;
  loadRecordByClientTurnId(
    clientTurnId: string,
  ): Promise<ReadableSubmitTurnRecord | undefined>;
  loadR2D3Envelope(
    submitTurnCommandId: string,
  ): Promise<PersistedR2D3CoordinationEnvelopeV1 | undefined>;
  loadDfi541Envelope(
    submitTurnCommandId: string,
  ): Promise<PersistedDfi541CoordinationEnvelopeV1 | undefined>;
  loadReceipt(
    submitTurnCommandId: string,
  ): Promise<ReadablePersistedSubmitTurnReceipt | undefined>;
  transition(
    record: ReadableSubmitTurnRecord,
    expectedStatus: ReadableSubmitTurnRecord["status"],
  ): Promise<SubmitTurnWriteResult<ReadableSubmitTurnRecord>>;
  normalizeLegacyRecoverableRecord(
    expected: SubmitTurnRecord,
    replacement: SubmitTurnRecordV1Alpha2,
  ): Promise<SubmitTurnWriteResult<SubmitTurnRecordV1Alpha2>>;
  complete(input: {
    record: ReadableSubmitTurnRecord;
    expectedStatus: "task_committed";
    receipt: ReadablePersistedSubmitTurnReceipt;
    delivery: DesktopDeliveryDraft;
  }): Promise<SubmitTurnWriteResult<ReadablePersistedSubmitTurnReceipt>>;
  failTerminal(input: {
    record: ReadableSubmitTurnRecord;
    expectedStatus: "accepted" | "message_appended";
    receipt: ReadablePersistedSubmitTurnReceipt;
    delivery: DesktopDeliveryDraft;
  }): Promise<SubmitTurnWriteResult<ReadablePersistedSubmitTurnReceipt>>;
  markLoopStarted(
    submitTurnCommandId: string,
    startedAt: string,
  ): Promise<SubmitTurnWriteResult<ReadableSubmitTurnRecord>>;
  listRecoverable(limit: number): Promise<readonly ReadableSubmitTurnRecord[]>;
  listDeliveriesAfter(
    sequence: number,
    limit: number,
  ): Promise<readonly DesktopDeliveryRecord[]>;
  appendDelivery(
    delivery: DesktopDeliveryDraft,
  ): Promise<SubmitTurnWriteResult<DesktopDeliveryRecord>>;
  deliveryBounds(): Promise<DesktopDeliveryBounds>;
}
