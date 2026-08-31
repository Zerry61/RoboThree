import { DatabaseSync } from "node:sqlite";

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
  ReadablePersistedSubmitTurnReceiptV1Alpha5Schema as ReadablePersistedSubmitTurnReceiptSchema,
  ReadableSubmitTurnRecordV1Alpha5Schema as ReadableSubmitTurnRecordSchema,
  type ReadablePersistedSubmitTurnReceiptV1Alpha5 as ReadablePersistedSubmitTurnReceipt,
  type ReadableSubmitTurnRecordV1Alpha5 as ReadableSubmitTurnRecord,
} from "@robothree/contracts/submit-turn-coordination/v1alpha5";

import type { Clock } from "../../ports/clock.js";
import type {
  DesktopDeliveryBounds,
  DesktopDeliveryDraft,
  SubmitTurnPersistence,
  SubmitTurnPersistenceFaultInjector,
  SubmitTurnWriteResult,
} from "../../ports/submit-turn-persistence.js";
import { configureSqlite, migrateAndPreflight } from "./schema-preflight.js";
import {
  createR2D3CoordinationEnvelopeV1,
  parsePersistedR2D3CoordinationValue,
  validateR2D3CoordinationEnvelopeV1,
  type PersistedR2D3CoordinationEnvelopeV1,
} from "../../application/r2d3-durable-acceptance.js";
import {
  createDfi541CoordinationEnvelopeV1,
  parsePersistedDfi541CoordinationValue,
  validateDfi541CoordinationEnvelopeV1,
  type PersistedDfi541CoordinationEnvelopeV1,
} from "../../application/dfi541-durable-acceptance.js";

export class SqliteSubmitTurnPersistence implements SubmitTurnPersistence {
  readonly adapterKind = "persistence" as const;
  readonly componentId = "persistence.submit-turn.sqlite";
  readonly #databasePath: string;
  readonly #clock: Clock;
  readonly #faultInjector: SubmitTurnPersistenceFaultInjector | undefined;
  readonly #deliveryRetentionLimit: number;
  #database: DatabaseSync | undefined;
  #startupError: string | undefined;

  constructor(input: {
    databasePath: string;
    clock: Clock;
    faultInjector?: SubmitTurnPersistenceFaultInjector;
    deliveryRetentionLimit?: number;
  }) {
    this.#databasePath = input.databasePath;
    this.#clock = input.clock;
    this.#faultInjector = input.faultInjector;
    this.#deliveryRetentionLimit = boundedRetention(input.deliveryRetentionLimit);
  }

  async start(): Promise<void> {
    if (this.#database !== undefined) return;
    const database = new DatabaseSync(this.#databasePath, {
      allowExtension: false,
    });
    try {
      configureSqlite(database);
      migrateAndPreflight(database, this.#clock);
      database.enableDefensive(true);
      this.#database = database;
      this.#startupError = undefined;
    } catch (error) {
      this.#startupError = error instanceof Error ? error.message : String(error);
      database.close();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.#database?.close();
    this.#database = undefined;
  }

  async health(): Promise<ComponentHealth> {
    return {
      componentId: this.componentId,
      status: this.#database === undefined ? "unavailable" : "ready",
      checkedAt: this.#clock.now(),
      ...(this.#startupError === undefined
        ? {}
        : { details: { startupError: this.#startupError } }),
    };
  }

  async prepareAccepted(
    input: ReadableSubmitTurnRecord,
  ): Promise<SubmitTurnWriteResult<ReadableSubmitTurnRecord>> {
    const parsed = ReadableSubmitTurnRecordSchema.safeParse(input);
    if (!parsed.success || parsed.data.status !== "accepted"
      || parsed.data.schemaVersion === "v1alpha4"
      || parsed.data.schemaVersion === "v1alpha5") {
      return failure("submit_turn.invalid_record", "accepted SubmitTurnRecord is invalid");
    }
    try {
      const result = withTransaction(this.#requireDatabase(), () => {
        const database = this.#requireDatabase();
        const existing = selectRecord(database, parsed.data.submitTurnCommandId);
        if (existing !== undefined) {
          return sameAcceptedIdentity(existing, parsed.data)
            ? { ok: true, replayed: true, value: existing } as const
            : conflict();
        }
        if (selectRecordByClientTurn(database, parsed.data.clientTurnId) !== undefined) {
          return conflict();
        }
        insertRecord(database, parsed.data);
        return { ok: true, replayed: false, value: parsed.data } as const;
      });
      this.#faultInjector?.("submit_turn.accepted.after_commit");
      return result;
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async prepareAcceptedR2D3(
    input: PersistedR2D3CoordinationEnvelopeV1,
  ): Promise<SubmitTurnWriteResult<ReadableSubmitTurnRecord>> {
    let envelope: PersistedR2D3CoordinationEnvelopeV1;
    try {
      envelope = validateR2D3CoordinationEnvelopeV1(input);
    } catch {
      return failure("r2d.acceptance_plan_invalid", "R2D3 acceptance plan is invalid");
    }
    if (envelope.record.status !== "accepted") {
      return failure("submit_turn.invalid_record", "accepted R2D3 record is invalid");
    }
    try {
      const result = withTransaction(this.#requireDatabase(), () => {
        const database = this.#requireDatabase();
        const existing = selectRecord(database, envelope.record.submitTurnCommandId);
        if (existing !== undefined) {
          const existingEnvelope = selectR2D3Envelope(
            database,
            envelope.record.submitTurnCommandId,
          );
          return existingEnvelope !== undefined
            && existingEnvelope.acceptedPlan.planDigest === envelope.acceptedPlan.planDigest
            && sameAcceptedIdentity(existing, envelope.record)
            ? { ok: true, replayed: true, value: existing } as const
            : conflict();
        }
        if (selectRecordByClientTurn(database, envelope.record.clientTurnId) !== undefined) {
          return conflict();
        }
        insertRecordValue(database, envelope.record, envelope);
        return { ok: true, replayed: false, value: envelope.record } as const;
      });
      this.#faultInjector?.("submit_turn.accepted.after_commit");
      return result;
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async prepareAcceptedDfi541(
    input: PersistedDfi541CoordinationEnvelopeV1,
  ): Promise<SubmitTurnWriteResult<ReadableSubmitTurnRecord>> {
    let envelope: PersistedDfi541CoordinationEnvelopeV1;
    try {
      envelope = validateDfi541CoordinationEnvelopeV1(input);
    } catch {
      return failure("dfi541.acceptance_plan_invalid",
        "DFI-5.4.1 acceptance plan is invalid");
    }
    if (envelope.record.status !== "accepted") {
      return failure("submit_turn.invalid_record",
        "accepted DFI-5.4.1 record is invalid");
    }
    try {
      const result = withTransaction(this.#requireDatabase(), () => {
        const database = this.#requireDatabase();
        const existing = selectRecord(database, envelope.record.submitTurnCommandId);
        if (existing !== undefined) {
          const existingEnvelope = selectDfi541Envelope(
            database,
            envelope.record.submitTurnCommandId,
          );
          return existingEnvelope !== undefined
            && existingEnvelope.acceptedPlan.planDigest === envelope.acceptedPlan.planDigest
            && sameAcceptedIdentity(existing, envelope.record)
            ? { ok: true, replayed: true, value: existing } as const
            : conflict();
        }
        if (selectRecordByClientTurn(database,
          envelope.record.clientTurnId) !== undefined) return conflict();
        insertRecordValue(database, envelope.record, envelope);
        return { ok: true, replayed: false, value: envelope.record } as const;
      });
      this.#faultInjector?.("submit_turn.accepted.after_commit");
      return result;
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async loadRecord(
    submitTurnCommandId: string,
  ): Promise<ReadableSubmitTurnRecord | undefined> {
    return selectRecord(this.#requireDatabase(), submitTurnCommandId);
  }

  async loadRecordByClientTurnId(
    clientTurnId: string,
  ): Promise<ReadableSubmitTurnRecord | undefined> {
    return selectRecordByClientTurn(this.#requireDatabase(), clientTurnId);
  }

  async loadR2D3Envelope(
    submitTurnCommandId: string,
  ): Promise<PersistedR2D3CoordinationEnvelopeV1 | undefined> {
    return selectR2D3Envelope(this.#requireDatabase(), submitTurnCommandId);
  }

  async loadDfi541Envelope(
    submitTurnCommandId: string,
  ): Promise<PersistedDfi541CoordinationEnvelopeV1 | undefined> {
    return selectDfi541Envelope(this.#requireDatabase(), submitTurnCommandId);
  }

  async loadReceipt(
    submitTurnCommandId: string,
  ): Promise<ReadablePersistedSubmitTurnReceipt | undefined> {
    return selectReceipt(this.#requireDatabase(), submitTurnCommandId);
  }

  async transition(
    input: ReadableSubmitTurnRecord,
    expectedStatus: ReadableSubmitTurnRecord["status"],
  ): Promise<SubmitTurnWriteResult<ReadableSubmitTurnRecord>> {
    const parsed = ReadableSubmitTurnRecordSchema.safeParse(input);
    if (!parsed.success) {
      return failure("submit_turn.invalid_record", "SubmitTurn transition record is invalid");
    }
    try {
      const result = withTransaction(this.#requireDatabase(), () => {
        const database = this.#requireDatabase();
        const current = selectRecord(database, parsed.data.submitTurnCommandId);
        if (current === undefined) {
          return failure("submit_turn.not_found", "SubmitTurnRecord does not exist");
        }
        if (sameJson(current, parsed.data)) {
          return { ok: true, replayed: true, value: current } as const;
        }
        if (
          current.status !== expectedStatus
          || !sameImmutableIdentity(current, parsed.data)
          || !allowedTransition(current.status, parsed.data.status)
        ) return conflict();
        updateRecord(database, parsed.data, expectedStatus);
        return { ok: true, replayed: false, value: parsed.data } as const;
      });
      this.#faultInjector?.(parsed.data.status === "message_appended"
        ? "submit_turn.message_appended.after_commit"
        : "submit_turn.task_committed.after_commit");
      return result;
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async normalizeLegacyRecoverableRecord(
    expected: SubmitTurnRecord,
    replacement: SubmitTurnRecordV1Alpha2,
  ): Promise<SubmitTurnWriteResult<SubmitTurnRecordV1Alpha2>> {
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
    try {
      return withTransaction(this.#requireDatabase(), () => {
        const database = this.#requireDatabase();
        const current = selectRecord(database, expected.submitTurnCommandId);
        if (current === undefined) {
          return failure("submit_turn.not_found", "SubmitTurnRecord does not exist");
        }
        if (current.schemaVersion === "v1alpha2") {
          return sameJson(current, parsedReplacement.data)
            ? { ok: true, replayed: true, value: current } as const
            : conflict();
        }
        if (!sameJson(current, expected)) return conflict();
        updateRecord(database, parsedReplacement.data, expected.status);
        return {
          ok: true,
          replayed: false,
          value: parsedReplacement.data,
        } as const;
      });
    } catch (error) {
      return sqliteFailure(error);
    }
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
    try {
      const result = withTransaction(this.#requireDatabase(), () => {
        const database = this.#requireDatabase();
        const current = selectRecord(database, submitTurnCommandId);
        if (current === undefined) {
          return failure("submit_turn.not_found", "SubmitTurnRecord does not exist");
        }
        if (current.status !== "completed") return conflict();
        if (current.loopStartedAt !== undefined) {
          return { ok: true, replayed: true, value: current } as const;
        }
        const next = ReadableSubmitTurnRecordSchema.parse({
          ...current,
          loopStartedAt: startedAt,
          updatedAt: startedAt,
        });
        updateRecord(database, next, "completed");
        return { ok: true, replayed: false, value: next } as const;
      });
      this.#faultInjector?.("submit_turn.loop_started.after_commit");
      return result;
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async listRecoverable(
    limit: number,
  ): Promise<readonly ReadableSubmitTurnRecord[]> {
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 256);
    const rows = this.#requireDatabase().prepare(`
      SELECT record_json FROM submit_turn_records
      WHERE status IN ('accepted', 'message_appended', 'task_committed')
         OR status = 'completed'
      ORDER BY updated_at, submit_turn_command_id
      LIMIT 256
    `).all() as Record<string, unknown>[];
    return rows.map((row) => parseStoredCoordinationRecord(
      JSON.parse(requireString(row.record_json, "record_json")),
    )).filter((record) =>
      record.status !== "completed"
      || (record.schemaVersion !== "v1alpha3" && record.loopStartedAt === undefined))
      .slice(0, bounded);
  }

  async listDeliveriesAfter(
    sequence: number,
    limit: number,
  ): Promise<readonly DesktopDeliveryRecord[]> {
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 256);
    const rows = this.#requireDatabase().prepare(`
      SELECT delivery_sequence, delivery_json
      FROM desktop_delivery_records
      WHERE delivery_sequence > ?
      ORDER BY delivery_sequence
      LIMIT ?
    `).all(sequence, bounded) as Record<string, unknown>[];
    return rows.map((row) => {
      const delivery = DesktopDeliveryRecordSchema.parse(
        JSON.parse(requireString(row.delivery_json, "delivery_json")),
      );
      if (delivery.sequence !== row.delivery_sequence) {
        throw new Error("Desktop delivery indexed sequence is invalid");
      }
      return delivery;
    });
  }

  async appendDelivery(
    input: DesktopDeliveryDraft,
  ): Promise<SubmitTurnWriteResult<DesktopDeliveryRecord>> {
    try {
      return withTransaction(this.#requireDatabase(), () => {
        const database = this.#requireDatabase();
        const existingRow = database.prepare(`
          SELECT delivery_sequence, delivery_json
          FROM desktop_delivery_records WHERE delivery_id = ?
        `).get(input.deliveryId) as Record<string, unknown> | undefined;
        if (existingRow !== undefined) {
          const existing = DesktopDeliveryRecordSchema.parse(
            JSON.parse(requireString(existingRow.delivery_json, "delivery_json")),
          );
          const { sequence: _sequence, ...identity } = existing;
          return sameJson(identity, input)
            ? { ok: true, replayed: true, value: existing } as const
            : conflict();
        }
        if (selectRecord(database, input.submitTurnCommandId) === undefined) {
          return failure("submit_turn.not_found", "SubmitTurnRecord does not exist");
        }
        const nextSequence = nextDeliverySequence(database);
        const delivery = DesktopDeliveryRecordSchema.safeParse({
          ...input,
          sequence: nextSequence,
        });
        if (!delivery.success) {
          return failure("submit_turn.invalid_delivery", "Desktop delivery is invalid");
        }
        insertDelivery(database, delivery.data);
        pruneDeliveries(database, this.#deliveryRetentionLimit);
        return { ok: true, replayed: false, value: delivery.data } as const;
      });
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  async deliveryBounds(): Promise<DesktopDeliveryBounds> {
    const row = this.#requireDatabase().prepare(`
      SELECT COALESCE(MIN(delivery_sequence), 0) AS oldest,
             COALESCE(MAX(delivery_sequence), 0) AS latest
      FROM desktop_delivery_records
    `).get() as Record<string, unknown>;
    const latest = requireNumber(row.latest, "latest");
    const oldest = requireNumber(row.oldest, "oldest");
    return {
      oldestSequence: oldest === 0 ? latest + 1 : oldest,
      latestSequence: latest,
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
    try {
      const result = withTransaction(this.#requireDatabase(), () => {
        const database = this.#requireDatabase();
        const existingReceipt = selectReceipt(
          database,
          record.data.submitTurnCommandId,
        );
        if (existingReceipt !== undefined) {
          return existingReceipt.requestDigest === receipt.data.requestDigest
            ? { ok: true, replayed: true, value: existingReceipt } as const
            : conflict();
        }
        const current = selectRecord(database, record.data.submitTurnCommandId);
        if (
          current === undefined
          || current.status !== input.expectedStatus
          || !sameImmutableIdentity(current, record.data)
          || !allowedTransition(current.status, record.data.status)
        ) return conflict();
        const nextSequence = nextDeliverySequence(database);
        const delivery = DesktopDeliveryRecordSchema.safeParse({
          ...input.delivery,
          sequence: nextSequence,
        });
        if (
          !delivery.success
          || delivery.data.submitTurnCommandId
            !== record.data.submitTurnCommandId
        ) {
          return failure("submit_turn.invalid_delivery", "Desktop delivery is invalid");
        }
        updateRecord(database, record.data, input.expectedStatus);
        database.prepare(`
          INSERT INTO submit_turn_receipts (
            submit_turn_command_id, status, completed_at, receipt_json
          ) VALUES (?, ?, ?, ?)
        `).run(
          receipt.data.submitTurnCommandId,
          receipt.data.status,
          receipt.data.completedAt,
          JSON.stringify(receipt.data),
        );
        insertDelivery(database, delivery.data);
        pruneDeliveries(database, this.#deliveryRetentionLimit);
        return { ok: true, replayed: false, value: receipt.data } as const;
      });
      this.#faultInjector?.(expectedNext === "completed"
        ? "submit_turn.completed.after_commit"
        : "submit_turn.failed_terminal.after_commit");
      return result;
    } catch (error) {
      return sqliteFailure(error);
    }
  }

  #requireDatabase(): DatabaseSync {
    if (this.#database === undefined) {
      throw new Error("SQLite SubmitTurn persistence is not started");
    }
    return this.#database;
  }
}

function nextDeliverySequence(database: DatabaseSync): number {
  const row = database.prepare(
    "SELECT COALESCE(MAX(delivery_sequence), 0) AS sequence FROM desktop_delivery_records",
  ).get() as Record<string, unknown>;
  return requireNumber(row.sequence, "sequence") + 1;
}

function insertDelivery(
  database: DatabaseSync,
  delivery: DesktopDeliveryRecord,
): void {
  database.prepare(`
    INSERT INTO desktop_delivery_records (
      delivery_sequence, delivery_id, submit_turn_command_id,
      type, created_at, delivery_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    delivery.sequence,
    delivery.deliveryId,
    delivery.submitTurnCommandId,
    delivery.type,
    delivery.createdAt,
    JSON.stringify(delivery),
  );
}

function pruneDeliveries(database: DatabaseSync, retentionLimit: number): void {
  database.prepare(`
    DELETE FROM desktop_delivery_records
    WHERE delivery_sequence <= (
      SELECT COALESCE(MAX(delivery_sequence), 0) - ?
      FROM desktop_delivery_records
    )
  `).run(retentionLimit);
}

function boundedRetention(value: number | undefined): number {
  return Math.min(Math.max(Math.trunc(value ?? 2_048), 1), 100_000);
}

function insertRecord(
  database: DatabaseSync,
  record: ReadableSubmitTurnRecord,
): void {
  database.prepare(`
    INSERT INTO submit_turn_records (
      submit_turn_command_id, client_turn_id, status, request_digest,
      internal_session_id, internal_task_id, updated_at, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.submitTurnCommandId,
    record.clientTurnId,
    record.status,
    record.requestDigest,
    record.internalSessionId,
    record.internalTaskId,
    record.updatedAt,
    JSON.stringify(record),
  );
}

function insertRecordValue(
  database: DatabaseSync,
  record: ReadableSubmitTurnRecord,
  persistedValue: ReadableSubmitTurnRecord
    | PersistedR2D3CoordinationEnvelopeV1
    | PersistedDfi541CoordinationEnvelopeV1,
): void {
  database.prepare(`
    INSERT INTO submit_turn_records (
      submit_turn_command_id, client_turn_id, status, request_digest,
      internal_session_id, internal_task_id, updated_at, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.submitTurnCommandId,
    record.clientTurnId,
    record.status,
    record.requestDigest,
    record.internalSessionId,
    record.internalTaskId,
    record.updatedAt,
    JSON.stringify(persistedValue),
  );
}

function updateRecord(
  database: DatabaseSync,
  record: ReadableSubmitTurnRecord,
  expectedStatus: ReadableSubmitTurnRecord["status"],
): void {
  const persistedValue = record.schemaVersion === "v1alpha4"
    ? (() => {
      const current = selectR2D3Envelope(database, record.submitTurnCommandId);
      if (current === undefined) {
        throw new Error("R2D3 acceptance plan is missing");
      }
      return createR2D3CoordinationEnvelopeV1({
        record,
        acceptedPlan: current.acceptedPlan,
      });
    })()
    : record.schemaVersion === "v1alpha5"
      ? (() => {
        const current = selectDfi541Envelope(database, record.submitTurnCommandId);
        if (current === undefined) {
          throw new Error("DFI-5.4.1 acceptance plan is missing");
        }
        return createDfi541CoordinationEnvelopeV1({
          record,
          acceptedPlan: current.acceptedPlan,
        });
      })()
      : record;
  const result = database.prepare(`
    UPDATE submit_turn_records
    SET status = ?, updated_at = ?, record_json = ?
    WHERE submit_turn_command_id = ? AND status = ?
  `).run(
    record.status,
    record.updatedAt,
    JSON.stringify(persistedValue),
    record.submitTurnCommandId,
    expectedStatus,
  );
  if (Number(result.changes) !== 1) {
    throw new SubmitTurnAbort(conflict());
  }
}

function selectRecord(
  database: DatabaseSync,
  submitTurnCommandId: string,
): ReadableSubmitTurnRecord | undefined {
  const row = database.prepare(`
    SELECT client_turn_id, status, request_digest, internal_session_id,
           internal_task_id, record_json
    FROM submit_turn_records WHERE submit_turn_command_id = ?
  `).get(submitTurnCommandId) as Record<string, unknown> | undefined;
  return parseOptionalRecord(row);
}

function selectRecordByClientTurn(
  database: DatabaseSync,
  clientTurnId: string,
): ReadableSubmitTurnRecord | undefined {
  const row = database.prepare(`
    SELECT client_turn_id, status, request_digest, internal_session_id,
           internal_task_id, record_json
    FROM submit_turn_records WHERE client_turn_id = ?
  `).get(clientTurnId) as Record<string, unknown> | undefined;
  return parseOptionalRecord(row);
}

function parseOptionalRecord(
  row: Record<string, unknown> | undefined,
): ReadableSubmitTurnRecord | undefined {
  if (row === undefined) return undefined;
  const raw = JSON.parse(requireString(row.record_json, "record_json"));
  const record = typeof raw === "object" && raw !== null
      && Reflect.get(raw, "schemaVersion") === "dfi541_coordination_envelope_v1"
    ? parsePersistedDfi541CoordinationValue(raw).record
    : parsePersistedR2D3CoordinationValue(raw).record;
  if (
    record.clientTurnId !== row.client_turn_id
    || record.status !== row.status
    || record.requestDigest !== row.request_digest
    || record.internalSessionId !== row.internal_session_id
    || record.internalTaskId !== row.internal_task_id
  ) throw new Error("SubmitTurnRecord indexed fields are invalid");
  return record;
}

function parseStoredCoordinationRecord(input: unknown): ReadableSubmitTurnRecord {
  return typeof input === "object" && input !== null
      && Reflect.get(input, "schemaVersion") === "dfi541_coordination_envelope_v1"
    ? parsePersistedDfi541CoordinationValue(input).record
    : parsePersistedR2D3CoordinationValue(input).record;
}

function selectR2D3Envelope(
  database: DatabaseSync,
  submitTurnCommandId: string,
): PersistedR2D3CoordinationEnvelopeV1 | undefined {
  const row = database.prepare(`
    SELECT record_json FROM submit_turn_records WHERE submit_turn_command_id = ?
  `).get(submitTurnCommandId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  return parsePersistedR2D3CoordinationValue(
    JSON.parse(requireString(row.record_json, "record_json")),
  ).envelope;
}

function selectDfi541Envelope(
  database: DatabaseSync,
  submitTurnCommandId: string,
): PersistedDfi541CoordinationEnvelopeV1 | undefined {
  const row = database.prepare(`
    SELECT record_json FROM submit_turn_records WHERE submit_turn_command_id = ?
  `).get(submitTurnCommandId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const raw = JSON.parse(requireString(row.record_json, "record_json"));
  if (typeof raw !== "object" || raw === null
    || Reflect.get(raw, "schemaVersion") !== "dfi541_coordination_envelope_v1") {
    return undefined;
  }
  return parsePersistedDfi541CoordinationValue(raw).envelope;
}

function selectReceipt(
  database: DatabaseSync,
  submitTurnCommandId: string,
): ReadablePersistedSubmitTurnReceipt | undefined {
  const row = database.prepare(`
    SELECT status, completed_at, receipt_json
    FROM submit_turn_receipts WHERE submit_turn_command_id = ?
  `).get(submitTurnCommandId) as Record<string, unknown> | undefined;
  if (row === undefined) return undefined;
  const receipt = ReadablePersistedSubmitTurnReceiptSchema.parse(
    JSON.parse(requireString(row.receipt_json, "receipt_json")),
  );
  if (
    receipt.status !== row.status
    || receipt.completedAt !== row.completed_at
  ) throw new Error("SubmitTurnReceipt indexed fields are invalid");
  return receipt;
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

function sqliteFailure(error: unknown): SubmitTurnWriteResult<never> {
  if (error instanceof SubmitTurnAbort) return error.failure;
  const runtimeError: RuntimeError = {
    code: "submit_turn.sqlite_write_failed",
    category: "persistence",
    message: error instanceof Error
      ? error.message
      : "SQLite SubmitTurn write failed",
    retryable: true,
  };
  return { ok: false, error: runtimeError };
}

class SubmitTurnAbort extends Error {
  readonly failure: SubmitTurnWriteResult<never>;

  constructor(failure: SubmitTurnWriteResult<never>) {
    super(failure.ok ? "unexpected success" : failure.error.message);
    this.failure = failure;
  }
}

function withTransaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve original error.
    }
    throw error;
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`SQLite field ${field} must be a string`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`SQLite field ${field} must be an integer`);
  }
  return value;
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
