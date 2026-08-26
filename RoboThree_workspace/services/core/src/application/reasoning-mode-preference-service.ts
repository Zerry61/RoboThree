import {
  ReasoningModePreferenceReceiptSchema,
  UpdateReasoningModePreferenceCommandSchema,
  type ReasoningModePreferenceReceipt,
  type UpdateReasoningModePreferenceCommand,
} from "@robothree/contracts";

import type { Clock } from "../ports/clock.js";
import type {
  DesktopReasoningModeOwnerAuthorityProvider,
  DesktopReasoningModePreferencePersistence,
} from "../ports/desktop-reasoning-mode.js";
import {
  calculateReasoningModePreferenceRequestDigest,
  createDesktopReasoningModePreference,
  createDesktopReasoningModePreferenceReceipt,
} from "./desktop-reasoning-mode-domain.js";
import { resolveDesktopReasoningModeOwner } from "./desktop-reasoning-mode-owner.js";

export type ReasoningModePreferenceCommandErrorCode =
  | "reasoning_mode.preference_unavailable"
  | "reasoning_mode.preference_conflict";

export type ReasoningModePreferenceCommandResult =
  | Readonly<{ ok: true; replayed: boolean; receipt: ReasoningModePreferenceReceipt }>
  | Readonly<{ ok: false; error: Readonly<{ code: ReasoningModePreferenceCommandErrorCode }> }>;

export class ReasoningModePreferenceService {
  public constructor(private readonly dependencies: Readonly<{
    persistence: DesktopReasoningModePreferencePersistence;
    ownerAuthority: DesktopReasoningModeOwnerAuthorityProvider;
    clock: Clock;
  }>) {}

  public async update(
    raw: UpdateReasoningModePreferenceCommand,
  ): Promise<ReasoningModePreferenceCommandResult> {
    const command = UpdateReasoningModePreferenceCommandSchema.parse(raw);
    const owner = await resolveDesktopReasoningModeOwner({
      authorityProvider: this.dependencies.ownerAuthority,
      persistence: this.dependencies.persistence,
      clock: this.dependencies.clock,
      expectedClientInstanceId: command.clientInstanceId,
    });
    if (owner === undefined) {
      return { ok: false, error: { code: "reasoning_mode.preference_unavailable" } };
    }

    const requestDigest = calculateReasoningModePreferenceRequestDigest(command);
    const existingReceipt = await this.dependencies.persistence.loadReceipt(
      owner.identity,
      command.commandId,
    );
    if (existingReceipt !== undefined) {
      return existingReceipt.requestDigest === requestDigest
        ? { ok: true, replayed: true, receipt: publicReceipt(existingReceipt) }
        : { ok: false, error: { code: "reasoning_mode.preference_conflict" } };
    }

    const committedAt = this.dependencies.clock.now();
    const nextRevision = command.expectedPreferenceRevision + 1;
    const result = await this.dependencies.persistence.commitPreference({
      expectedPreferenceRevision: command.expectedPreferenceRevision,
      preference: createDesktopReasoningModePreference({
        ownerIdentity: owner.identity,
        preferenceRevision: nextRevision,
        requestedMode: command.requestedMode,
        updatedAt: committedAt,
      }),
      receipt: createDesktopReasoningModePreferenceReceipt({
        ownerIdentity: owner.identity,
        commandId: command.commandId,
        requestDigest,
        expectedPreferenceRevision: command.expectedPreferenceRevision,
        committedPreferenceRevision: nextRevision,
        requestedMode: command.requestedMode,
        committedAt,
      }),
    });
    if (!result.ok) {
      return { ok: false, error: { code: "reasoning_mode.preference_conflict" } };
    }
    return {
      ok: true,
      replayed: result.replayed,
      receipt: publicReceipt(result.value),
    };
  }
}

function publicReceipt(input: ReasoningModePreferenceReceipt): ReasoningModePreferenceReceipt {
  return ReasoningModePreferenceReceiptSchema.parse({
    contractVersion: input.contractVersion,
    commandId: input.commandId,
    requestDigest: input.requestDigest,
    expectedPreferenceRevision: input.expectedPreferenceRevision,
    committedPreferenceRevision: input.committedPreferenceRevision,
    requestedMode: input.requestedMode,
    outcome: input.outcome,
    committedAt: input.committedAt,
    receiptDigest: input.receiptDigest,
  });
}
