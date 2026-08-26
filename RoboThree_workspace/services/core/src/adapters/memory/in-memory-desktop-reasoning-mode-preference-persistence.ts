import {
  validateDesktopExperienceOwnerNamespace,
  validateDesktopReasoningModePreference,
  validateDesktopReasoningModePreferenceReceipt,
  type DesktopExperienceOwnerNamespace,
  type DesktopExperiencePreferenceOwnerIdentity,
  type DesktopReasoningModePreference,
} from "../../application/desktop-reasoning-mode-domain.js";
import type {
  DesktopReasoningModePreferencePersistence,
  DesktopReasoningModePreferenceReceiptRecord,
  DesktopReasoningModeWriteResult,
} from "../../ports/desktop-reasoning-mode.js";

export class InMemoryDesktopReasoningModePreferencePersistence
implements DesktopReasoningModePreferencePersistence {
  #namespace: DesktopExperienceOwnerNamespace | undefined;
  readonly #preferences = new Map<string, DesktopReasoningModePreference>();
  readonly #receipts = new Map<string, DesktopReasoningModePreferenceReceiptRecord>();
  #started = false;

  public async start(): Promise<void> { this.#started = true; }
  public async stop(): Promise<void> { this.#started = false; }

  public async loadActiveOwnerNamespace(): Promise<DesktopExperienceOwnerNamespace | undefined> {
    this.#requireStarted();
    return this.#namespace === undefined ? undefined : cloneNamespace(this.#namespace);
  }

  public async initializeOwnerNamespace(
    namespace: DesktopExperienceOwnerNamespace,
  ): Promise<DesktopReasoningModeWriteResult<DesktopExperienceOwnerNamespace>> {
    this.#requireStarted();
    const validated = validateDesktopExperienceOwnerNamespace(namespace);
    if (this.#namespace !== undefined) {
      return this.#namespace.recordDigest === validated.recordDigest
        ? success(cloneNamespace(this.#namespace), true)
        : failure("reasoning_mode.owner_namespace_unavailable", "An active owner namespace already exists");
    }
    this.#namespace = cloneNamespace(validated);
    return success(cloneNamespace(validated), false);
  }

  public async loadPreference(
    owner: DesktopExperiencePreferenceOwnerIdentity,
  ): Promise<DesktopReasoningModePreference | undefined> {
    this.#requireOwner(owner);
    const value = this.#preferences.get(ownerKey(owner));
    return value === undefined ? undefined : validateDesktopReasoningModePreference({ ...value });
  }

  public async loadReceipt(
    owner: DesktopExperiencePreferenceOwnerIdentity,
    commandId: string,
  ): Promise<DesktopReasoningModePreferenceReceiptRecord | undefined> {
    this.#requireOwner(owner);
    const value = this.#receipts.get(receiptKey(owner, commandId));
    return value === undefined ? undefined : validateDesktopReasoningModePreferenceReceipt({ ...value });
  }

  public async commitPreference(input: Readonly<{
    preference: DesktopReasoningModePreference;
    receipt: DesktopReasoningModePreferenceReceiptRecord;
    expectedPreferenceRevision: number;
  }>): Promise<DesktopReasoningModeWriteResult<DesktopReasoningModePreferenceReceiptRecord>> {
    const preference = validateDesktopReasoningModePreference(input.preference);
    const receipt = validateDesktopReasoningModePreferenceReceipt(input.receipt);
    this.#requireOwner(ownerOf(preference));
    const key = receiptKey(ownerOf(receipt), receipt.commandId);
    const replay = this.#receipts.get(key);
    if (replay !== undefined) {
      return replay.requestDigest === receipt.requestDigest && replay.receiptDigest === receipt.receiptDigest
        ? success(validateDesktopReasoningModePreferenceReceipt({ ...replay }), true)
        : failure("reasoning_mode.preference_conflict", "Command id already represents another preference update");
    }
    const current = this.#preferences.get(ownerKey(ownerOf(preference)));
    if (!sameOwner(preference, receipt)
      || (current?.preferenceRevision ?? 0) !== input.expectedPreferenceRevision
      || preference.preferenceRevision !== input.expectedPreferenceRevision + 1
      || receipt.expectedPreferenceRevision !== input.expectedPreferenceRevision
      || receipt.committedPreferenceRevision !== preference.preferenceRevision
      || receipt.requestedMode !== preference.requestedMode) {
      return failure("reasoning_mode.preference_conflict", "Preference CAS or Receipt material is stale");
    }
    this.#preferences.set(ownerKey(ownerOf(preference)), { ...preference });
    this.#receipts.set(key, { ...receipt });
    return success({ ...receipt }, false);
  }

  #requireStarted(): void {
    if (!this.#started) throw new Error("Reasoning Mode preference persistence is not started");
  }

  #requireOwner(owner: DesktopExperiencePreferenceOwnerIdentity): void {
    this.#requireStarted();
    if (this.#namespace === undefined
      || this.#namespace.namespaceRevision !== owner.ownerScopeNamespaceRevision) {
      throw new Error("Reasoning Mode owner namespace is unavailable");
    }
    validateDesktopExperienceOwnerNamespace(this.#namespace);
  }
}

function ownerOf(value: DesktopExperiencePreferenceOwnerIdentity): DesktopExperiencePreferenceOwnerIdentity {
  return {
    ownerScopeNamespaceRevision: value.ownerScopeNamespaceRevision,
    ownerScopeDigest: value.ownerScopeDigest,
  };
}

function sameOwner(
  left: DesktopExperiencePreferenceOwnerIdentity,
  right: DesktopExperiencePreferenceOwnerIdentity,
): boolean {
  return left.ownerScopeNamespaceRevision === right.ownerScopeNamespaceRevision
    && left.ownerScopeDigest === right.ownerScopeDigest;
}

function ownerKey(owner: DesktopExperiencePreferenceOwnerIdentity): string {
  return `${owner.ownerScopeNamespaceRevision}:${owner.ownerScopeDigest}`;
}

function receiptKey(owner: DesktopExperiencePreferenceOwnerIdentity, commandId: string): string {
  return `${ownerKey(owner)}:${commandId}`;
}

function cloneNamespace(namespace: DesktopExperienceOwnerNamespace): DesktopExperienceOwnerNamespace {
  return validateDesktopExperienceOwnerNamespace({
    ...namespace,
    namespaceKey: Uint8Array.from(namespace.namespaceKey),
  });
}

function success<T>(value: T, replayed: boolean): DesktopReasoningModeWriteResult<T> {
  return { ok: true, replayed, value };
}

function failure<T>(
  code: "reasoning_mode.preference_conflict" | "reasoning_mode.owner_namespace_unavailable",
  message: string,
): DesktopReasoningModeWriteResult<T> {
  return { ok: false, error: { code, message } };
}
