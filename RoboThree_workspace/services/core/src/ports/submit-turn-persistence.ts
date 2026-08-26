import type {
  DesktopDeliveryRecord,
  RuntimeError,
  SubmitTurnRecord,
  SubmitTurnRecordV1Alpha2,
} from "@robothree/contracts";
import type {
  ReadablePersistedSubmitTurnReceipt,
  ReadableSubmitTurnRecord,
} from "@robothree/contracts/submit-turn-coordination/v1alpha3";

import type { PersistenceAdapter } from "./persistence.js";

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
  loadRecord(
    submitTurnCommandId: string,
  ): Promise<ReadableSubmitTurnRecord | undefined>;
  loadRecordByClientTurnId(
    clientTurnId: string,
  ): Promise<ReadableSubmitTurnRecord | undefined>;
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
