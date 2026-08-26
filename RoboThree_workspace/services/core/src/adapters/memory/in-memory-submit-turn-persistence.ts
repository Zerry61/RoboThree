import {
  DesktopDeliveryRecordSchema,
  SubmitTurnRecordV1Alpha2Schema,
} from "@robothree/contracts";
import type {
  ComponentHealth,
  DesktopDeliveryRecord,
  RuntimeError,
  SubmitTurnRecord,
  SubmitTurnRecordV1Alpha2,
} from "@robothree/contracts";
import {
  ReadablePersistedSubmitTurnReceiptSchema,
  ReadableSubmitTurnRecordSchema,
  type ReadablePersistedSubmitTurnReceipt,
  type ReadableSubmitTurnRecord,
} from "@robothree/contracts/submit-turn-coordination/v1alpha3";

import type { Clock } from "../../ports/clock.js";
import type {
  DesktopDeliveryBounds,
  DesktopDeliveryDraft,
  SubmitTurnPersistence,
  SubmitTurnPersistenceFaultInjector,
  SubmitTurnWriteResult,
} from "../../ports/submit-turn-persistence.js";

export class InMemorySubmitTurnPersistence implements SubmitTurnPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.submit-turn.memory";
  readonly #clock: Clock;
  readonly #faultInjector: SubmitTurnPersistenceFaultInjector | undefined;
  readonly #records = new Map<string, ReadableSubmitTurnRecord>();
  readonly #clientTurns = new Map<string, string>();
  readonly #receipts = new Map<string, ReadablePersistedSubmitTurnReceipt>();
  readonly #deliveries: DesktopDeliveryRecord[] = [];
  readonly #deliveryRetentionLimit: number;
  #nextDeliverySequence = 1;
  #started = false;

  constructor(input: {
    clock: Clock;
    faultInjector?: SubmitTurnPersistenceFaultInjector;
    deliveryRetentionLimit?: number;
  }) {
    this.#clock = input.clock;
    this.#faultInjector = input.faultInjector;
    this.#deliveryRetentionLimit = boundedRetention(input.deliveryRetentionLimit);
  }

  async start(): Promise<void> {
    this.#started = true;
  }

  async stop(): Promise<void> {
    this.#started = false;
  }

  async health(): Promise<ComponentHealth> {
    return {
      componentId: this.componentId,
      status: this.#started ? "ready" : "unavailable",
      checkedAt: this.#clock.now(),
    };
  }

  async prepareAccepted(
    input: ReadableSubmitTurnRecord,
  ): Promise<SubmitTurnWriteResult<ReadableSubmitTurnRecord>> {
    this.#requireStarted();
    const parsed = ReadableSubmitTurnRecordSchema.safeParse(input);
    if (!parsed.success || parsed.data.status !== "accepted") {
      return failure("submit_turn.invalid_record", "accepted SubmitTurnRecord is invalid");
    }
    const record = parsed.data;
    const existing = this.#records.get(record.submitTurnCommandId);
    if (existing !== undefined) {
      return sameAcceptedIdentity(existing, record)
        ? { ok: true, replayed: true, value: cloneRecord(existing) }
        : conflict();
    }
    const commandForClientTurn = this.#clientTurns.get(record.clientTurnId);
    if (commandForClientTurn !== undefined) return conflict();
    this.#records.set(record.submitTurnCommandId, cloneRecord(record));
    this.#clientTurns.set(record.clientTurnId, record.submitTurnCommandId);
    this.#faultInjector?.("submit_turn.accepted.after_commit");
    return { ok: true, replayed: false, value: cloneRecord(record) };
  }

  async loadRecord(
    submitTurnCommandId: string,
  ): Promise<ReadableSubmitTurnRecord | undefined> {
    this.#requireStarted();
    const record = this.#records.get(submitTurnCommandId);
    return record === undefined ? undefined : cloneRecord(record);
  }

  async loadRecordByClientTurnId(
    clientTurnId: string,
  ): Promise<ReadableSubmitTurnRecord | undefined> {
    this.#requireStarted();
    const commandId = this.#clientTurns.get(clientTurnId);
    return commandId === undefined ? undefined : this.loadRecord(commandId);
  }

  async loadReceipt(
    submitTurnCommandId: string,
  ): Promise<ReadablePersistedSubmitTurnReceipt | undefined> {
    this.#requireStarted();
    const receipt = this.#receipts.get(submitTurnCommandId);
    return receipt === undefined ? undefined : cloneReceipt(receipt);
  }

  async transition(
    input: ReadableSubmitTurnRecord,
    expectedStatus: ReadableSubmitTurnRecord["status"],
  ): Promise<SubmitTurnWriteResult<ReadableSubmitTurnRecord>> {
    this.#requireStarted();
    const parsed = ReadableSubmitTurnRecordSchema.safeParse(input);
    if (!parsed.success) {
      return failure("submit_turn.invalid_record", "SubmitTurn transition record is invalid");
    }
    const current = this.#records.get(parsed.data.submitTurnCommandId);
    if (current === undefined) {
      return failure("submit_turn.not_found", "SubmitTurnRecord does not exist");
    }
    if (sameJson(current, parsed.data)) {
      return { ok: true, replayed: true, value: cloneRecord(current) };
    }
    if (
      current.status !== expectedStatus
      || !sameImmutableIdentity(current, parsed.data)
      || !allowedTransition(current.status, parsed.data.status)
    ) {
      return conflict();
    }
    this.#records.set(parsed.data.submitTurnCommandId, cloneRecord(parsed.data));
    this.#faultInjector?.(parsed.data.status === "message_appended"
      ? "submit_turn.message_appended.after_commit"
      : "submit_turn.task_committed.after_commit");
    return { ok: true, replayed: false, value: cloneRecord(parsed.data) };
  }

  async normalizeLegacyRecoverableRecord(
    expected: SubmitTurnRecord,
    replacement: SubmitTurnRecordV1Alpha2,
  ): Promise<SubmitTurnWriteResult<SubmitTurnRecordV1Alpha2>> {
    this.#requireStarted();
    const parsedReplacement = SubmitTurnRecordV1Alpha2Schema.safeParse(replacement);
    if (
      !parsedReplacement.success
      || expected.schemaVersion !== "v1alpha1"
      || !sameNormalizationIdentity(expected, parsedReplacement.data)
    ) {
      return failure(
        "submit_turn.invalid_normalization",
        "legacy SubmitTurn normalization is invalid",
      );
    }
    const current = this.#records.get(expected.submitTurnCommandId);
    if (current === undefined) {
      return failure("submit_turn.not_found", "SubmitTurnRecord does not exist");
    }
    if (current.schemaVersion === "v1alpha2") {
      return sameJson(current, parsedReplacement.data)
        ? { ok: true, replayed: true, value: cloneV1Alpha2Record(current) }
        : conflict();
    }
    if (!sameJson(current, expected)) return conflict();
    this.#records.set(
      parsedReplacement.data.submitTurnCommandId,
      cloneRecord(parsedReplacement.data),
    );
    return {
      ok: true,
      replayed: false,
      value: cloneV1Alpha2Record(parsedReplacement.data),
    };
  }

  async complete(input: {
    record: ReadableSubmitTurnRecord;
    expectedStatus: "task_committed";
    receipt: ReadablePersistedSubmitTurnReceipt;
    delivery: DesktopDeliveryDraft;
  }): Promise<SubmitTurnWriteResult<ReadablePersistedSubmitTurnReceipt>> {
    return this.#terminalCommit(input, "completed");
  }

  async failTerminal(input: {
    record: ReadableSubmitTurnRecord;
    expectedStatus: "accepted" | "message_appended";
    receipt: ReadablePersistedSubmitTurnReceipt;
    delivery: DesktopDeliveryDraft;
  }): Promise<SubmitTurnWriteResult<ReadablePersistedSubmitTurnReceipt>> {
    return this.#terminalCommit(input, "failed_terminal");
  }

  async markLoopStarted(
    submitTurnCommandId: string,
    startedAt: string,
  ): Promise<SubmitTurnWriteResult<ReadableSubmitTurnRecord>> {
    this.#requireStarted();
    const current = this.#records.get(submitTurnCommandId);
    if (current === undefined) {
      return failure("submit_turn.not_found", "SubmitTurnRecord does not exist");
    }
    if (current.status !== "completed") return conflict();
    if (current.loopStartedAt !== undefined) {
      return { ok: true, replayed: true, value: cloneRecord(current) };
    }
    const next = ReadableSubmitTurnRecordSchema.parse({
      ...current,
      loopStartedAt: startedAt,
      updatedAt: startedAt,
    });
    this.#records.set(submitTurnCommandId, cloneRecord(next));
    this.#faultInjector?.("submit_turn.loop_started.after_commit");
    return { ok: true, replayed: false, value: cloneRecord(next) };
  }

  async listRecoverable(
    limit: number,
  ): Promise<readonly ReadableSubmitTurnRecord[]> {
    this.#requireStarted();
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 256);
    return [...this.#records.values()]
      .filter((record) =>
        record.status === "accepted"
        || record.status === "message_appended"
        || record.status === "task_committed"
        || (record.schemaVersion !== "v1alpha3"
          && record.status === "completed"
          && record.loopStartedAt === undefined))
      .sort((left, right) =>
        left.updatedAt.localeCompare(right.updatedAt)
        || left.submitTurnCommandId.localeCompare(right.submitTurnCommandId))
      .slice(0, bounded)
      .map(cloneRecord);
  }

  async listDeliveriesAfter(
    sequence: number,
    limit: number,
  ): Promise<readonly DesktopDeliveryRecord[]> {
    this.#requireStarted();
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 256);
    return this.#deliveries
      .filter((record) => record.sequence > sequence)
      .slice(0, bounded)
      .map(cloneDelivery);
  }

  async appendDelivery(
    input: DesktopDeliveryDraft,
  ): Promise<SubmitTurnWriteResult<DesktopDeliveryRecord>> {
    this.#requireStarted();
    const existing = this.#deliveries.find((item) =>
      item.deliveryId === input.deliveryId);
    if (existing !== undefined) {
      const { sequence: _sequence, ...identity } = existing;
      return sameJson(identity, input)
        ? { ok: true, replayed: true, value: cloneDelivery(existing) }
        : conflict();
    }
    if (!this.#records.has(input.submitTurnCommandId)) {
      return failure("submit_turn.not_found", "SubmitTurnRecord does not exist");
    }
    const parsed = DesktopDeliveryRecordSchema.safeParse({
      ...input,
      sequence: this.#nextDeliverySequence,
    });
    if (!parsed.success) {
      return failure("submit_turn.invalid_delivery", "Desktop delivery is invalid");
    }
    this.#nextDeliverySequence += 1;
    this.#deliveries.push(cloneDelivery(parsed.data));
    if (this.#deliveries.length > this.#deliveryRetentionLimit) {
      this.#deliveries.splice(
        0,
        this.#deliveries.length - this.#deliveryRetentionLimit,
      );
    }
    return { ok: true, replayed: false, value: cloneDelivery(parsed.data) };
  }

  async deliveryBounds(): Promise<DesktopDeliveryBounds> {
    this.#requireStarted();
    return {
      oldestSequence: this.#deliveries.at(0)?.sequence ?? this.#nextDeliverySequence,
      latestSequence: this.#nextDeliverySequence - 1,
    };
  }

  #terminalCommit(
    input: {
      record: ReadableSubmitTurnRecord;
      expectedStatus: "accepted" | "message_appended" | "task_committed";
      receipt: ReadablePersistedSubmitTurnReceipt;
      delivery: DesktopDeliveryDraft;
    },
    expectedNext: "completed" | "failed_terminal",
  ): SubmitTurnWriteResult<ReadablePersistedSubmitTurnReceipt> {
    this.#requireStarted();
    const record = ReadableSubmitTurnRecordSchema.safeParse(input.record);
    const receipt = ReadablePersistedSubmitTurnReceiptSchema.safeParse(input.receipt);
    if (
      !record.success
      || !receipt.success
      || record.data.status !== expectedNext
      || receipt.data.submitTurnCommandId !== record.data.submitTurnCommandId
      || receipt.data.clientTurnId !== record.data.clientTurnId
      || receipt.data.requestDigest !== record.data.requestDigest
      || !receiptMatchesTransport(record.data, receipt.data)
      || (expectedNext === "completed") !== (receipt.data.status === "accepted")
    ) {
      return failure("submit_turn.invalid_terminal_commit", "terminal SubmitTurn facts are inconsistent");
    }
    const current = this.#records.get(record.data.submitTurnCommandId);
    const existingReceipt = this.#receipts.get(record.data.submitTurnCommandId);
    if (existingReceipt !== undefined) {
      return existingReceipt.requestDigest === receipt.data.requestDigest
        ? { ok: true, replayed: true, value: cloneReceipt(existingReceipt) }
        : conflict();
    }
    if (
      current === undefined
      || current.status !== input.expectedStatus
      || !sameImmutableIdentity(current, record.data)
      || !allowedTransition(current.status, record.data.status)
    ) return conflict();
    const delivery = DesktopDeliveryRecordSchema.safeParse({
      ...input.delivery,
      sequence: this.#nextDeliverySequence,
    });
    if (
      !delivery.success
      || delivery.data.submitTurnCommandId !== record.data.submitTurnCommandId
    ) {
      return failure("submit_turn.invalid_delivery", "Desktop delivery is invalid");
    }
    this.#records.set(record.data.submitTurnCommandId, cloneRecord(record.data));
    this.#receipts.set(record.data.submitTurnCommandId, cloneReceipt(receipt.data));
    this.#deliveries.push(cloneDelivery(delivery.data));
    this.#nextDeliverySequence += 1;
    if (this.#deliveries.length > this.#deliveryRetentionLimit) {
      this.#deliveries.splice(
        0,
        this.#deliveries.length - this.#deliveryRetentionLimit,
      );
    }
    this.#faultInjector?.(expectedNext === "completed"
      ? "submit_turn.completed.after_commit"
      : "submit_turn.failed_terminal.after_commit");
    return { ok: true, replayed: false, value: cloneReceipt(receipt.data) };
  }

  #requireStarted(): void {
    if (!this.#started) throw new Error("SubmitTurn persistence is not started");
  }
}

function allowedTransition(
  current: ReadableSubmitTurnRecord["status"],
  next: ReadableSubmitTurnRecord["status"],
): boolean {
  return (current === "accepted"
      && (next === "message_appended" || next === "failed_terminal"))
    || (current === "message_appended"
      && (next === "task_committed" || next === "failed_terminal"))
    || (current === "task_committed" && next === "completed");
}

function sameAcceptedIdentity(
  left: ReadableSubmitTurnRecord,
  right: ReadableSubmitTurnRecord,
): boolean {
  return left.status === "accepted"
    && right.status === "accepted"
    && sameImmutableIdentity(left, right);
}

function sameImmutableIdentity(
  left: ReadableSubmitTurnRecord,
  right: ReadableSubmitTurnRecord,
): boolean {
  const mutable = new Set(["status", "updatedAt", "lastFailure", "loopStartedAt"]);
  return sameJson(
    Object.fromEntries(Object.entries(left).filter(([key]) => !mutable.has(key))),
    Object.fromEntries(Object.entries(right).filter(([key]) => !mutable.has(key))),
  );
}

function conflict(): SubmitTurnWriteResult<never> {
  return failure(
    "submit_turn.idempotency_conflict",
    "SubmitTurn identity or transition conflicts with persisted facts",
  );
}

function failure(code: string, message: string): SubmitTurnWriteResult<never> {
  const error: RuntimeError = {
    code,
    category: "persistence",
    message,
    retryable: false,
  };
  return { ok: false, error };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const cloneRecord = (
  value: ReadableSubmitTurnRecord,
): ReadableSubmitTurnRecord => ReadableSubmitTurnRecordSchema.parse(value);
const cloneV1Alpha2Record = (
  value: SubmitTurnRecordV1Alpha2,
): SubmitTurnRecordV1Alpha2 => SubmitTurnRecordV1Alpha2Schema.parse(value);
const cloneReceipt = (
  value: ReadablePersistedSubmitTurnReceipt,
): ReadablePersistedSubmitTurnReceipt =>
  ReadablePersistedSubmitTurnReceiptSchema.parse(value);
const cloneDelivery = (
  value: DesktopDeliveryRecord,
): DesktopDeliveryRecord => DesktopDeliveryRecordSchema.parse(value);

function boundedRetention(value: number | undefined): number {
  return Math.min(Math.max(Math.trunc(value ?? 2_048), 1), 100_000);
}

function receiptMatchesTransport(
  record: ReadableSubmitTurnRecord,
  receipt: ReadablePersistedSubmitTurnReceipt,
): boolean {
  const transport = record.schemaVersion === "v1alpha1"
    ? "v1alpha1"
    : record.transportContractVersion;
  return transport === "v1alpha1"
    ? !("contractVersion" in receipt)
    : "contractVersion" in receipt && receipt.contractVersion === transport;
}

function sameNormalizationIdentity(
  expected: SubmitTurnRecord,
  replacement: SubmitTurnRecordV1Alpha2,
): boolean {
  const { authorizationPreference: _authorizationPreference, ...selectionRequest } =
    replacement.selectionRequest;
  return replacement.transportContractVersion === "v1alpha1"
    && replacement.status === expected.status
    && replacement.submitTurnCommandId === expected.submitTurnCommandId
    && replacement.clientTurnId === expected.clientTurnId
    && replacement.desktopSessionId === expected.desktopSessionId
    && replacement.internalSessionId === expected.internalSessionId
    && replacement.requestDigest === expected.requestDigest
    && sameJson(selectionRequest, expected.selectionRequest)
    && sameJson(replacement.lockedAgent, expected.lockedAgent)
    && replacement.registryRevision === expected.registryRevision
    && replacement.platformPromptRevision === expected.platformPromptRevision
    && replacement.enterpriseConfigRevision === expected.enterpriseConfigRevision
    && replacement.plannedSelectionDigest === expected.plannedSelectionDigest
    && sameJson(replacement.capabilityLockIds, expected.capabilityLockIds)
    && replacement.internalUserMessageId === expected.internalUserMessageId
    && replacement.internalTaskId === expected.internalTaskId
    && replacement.internalRuntimeSelectionId === expected.internalRuntimeSelectionId
    && replacement.initialCheckpointId === expected.initialCheckpointId
    && replacement.createdAt === expected.createdAt
    && replacement.updatedAt === expected.updatedAt
    && sameJson(replacement.lastFailure, expected.lastFailure)
    && replacement.loopStartedAt === expected.loopStartedAt;
}
