import { createHash } from "node:crypto";

import {
  EntityIdSchema,
  JsonValueSchema,
  NamespacedResourceIdSchema,
  Sha256DigestSchema,
  canonicalJsonStringify,
} from "@robothree/contracts";
import { z } from "zod";

import {
  validatePersonalModelDefinition,
  validatePersonalModelHead,
  validatePersonalModelOwnerNamespace,
  type PersonalModelOwnerIdentity,
} from "./personal-model-domain.js";
import {
  PersonalModelOwnerAuthorityError,
  StrictPersonalModelOwnerAuthorityResolver,
} from "./personal-model-owner-authority.js";
import {
  InMemoryPersonalModelOperationGate,
  type PersonalModelOperationGate,
  type PersonalModelOperationLease,
} from "./personal-model-operation-gate.js";
import type { Clock } from "../ports/clock.js";
import type {
  PersonalCredentialStore,
  PersonalCredentialStoreErrorCode,
} from "../ports/personal-credential-store.js";
import type { PersonalModelOwnerAuthorityContextProvider } from "../ports/personal-model-credential-coordination.js";
import type { PersonalModelPersistence } from "../ports/personal-model-persistence.js";

const DeadlineSchema = z.string().datetime({ offset: true });
const MAX_SECRET_BYTES = 16_384;
const CORE_DEADLINE_MS = 5_000;

const RevealMaterialSchema = z.object({
  commandId: EntityIdSchema,
  commandType: z.literal("reveal"),
  personalModelId: NamespacedResourceIdSchema,
  expectedConfigurationRevision: Sha256DigestSchema,
  expectedExecutionDefinitionDigest: Sha256DigestSchema,
}).strict();

export const RevealPersonalModelCredentialCommandSchema = RevealMaterialSchema.extend({
  requestDigest: Sha256DigestSchema,
  deadlineAt: DeadlineSchema,
}).strict();

export type PersonalModelCredentialRevealMaterial = z.infer<typeof RevealMaterialSchema>;
export type RevealPersonalModelCredentialCommand = z.infer<
  typeof RevealPersonalModelCredentialCommandSchema
>;

export type PersonalModelCredentialRevealErrorCode =
  | "personal_model.reveal_unavailable"
  | "personal_model.reveal_rate_limited"
  | "personal_model.reveal_busy"
  | "personal_model.reveal_replay_forbidden"
  | "personal_model.permission_denied"
  | "personal_model.not_found"
  | "personal_model.conflict"
  | "personal_model.deadline_exceeded"
  | "personal_model.cancelled"
  | "personal_model.credential_unavailable"
  | "personal_model.credential_operation_uncertain";

export type PersonalModelCredentialRevealResult =
  | Readonly<{
    ok: true;
    status: "completed";
    commandId: string;
    personalModelId: string;
    secret: Uint8Array;
  }>
  | Readonly<{
    ok: false;
    error: Readonly<{
      code: PersonalModelCredentialRevealErrorCode;
      message: string;
    }>;
  }>;

type AttemptTerminal = "completed" | "rejected" | "cancelled" | "timed_out" | "uncertain";

type ActiveAttempt = Readonly<{
  requestDigest: string;
  ownerModelKey: string;
}>;

type Tombstone = Readonly<{
  requestDigest: string;
  terminal: AttemptTerminal;
  expiresAt: number;
}>;

export class PersonalModelRevealAttemptRegistry {
  readonly #activeByCommand = new Map<string, ActiveAttempt>();
  readonly #activeOwnerModels = new Set<string>();
  readonly #attemptsByOwnerModel = new Map<string, number[]>();
  readonly #tombstones = new Map<string, Tombstone>();

  public begin(input: Readonly<{
    owner: PersonalModelOwnerIdentity;
    personalModelId: string;
    commandId: string;
    requestDigest: string;
    now: number;
  }> ):
    | Readonly<{ ok: true }>
    | Readonly<{ ok: false; code: PersonalModelCredentialRevealErrorCode }> {
    this.#prune(input.now);
    const tombstone = this.#tombstones.get(input.commandId);
    if (tombstone !== undefined) {
      return {
        ok: false,
        code: tombstone.requestDigest === input.requestDigest
          ? "personal_model.reveal_replay_forbidden"
          : "personal_model.conflict",
      };
    }
    const activeCommand = this.#activeByCommand.get(input.commandId);
    if (activeCommand !== undefined) {
      return {
        ok: false,
        code: activeCommand.requestDigest === input.requestDigest
          ? "personal_model.reveal_busy"
          : "personal_model.conflict",
      };
    }
    const ownerModelKey = revealOwnerModelKey(input.owner, input.personalModelId);
    if (this.#activeOwnerModels.has(ownerModelKey) || this.#activeByCommand.size >= 4) {
      return { ok: false, code: "personal_model.reveal_busy" };
    }
    const attempts = this.#attemptsByOwnerModel.get(ownerModelKey) ?? [];
    if (attempts.length >= 5) {
      return { ok: false, code: "personal_model.reveal_rate_limited" };
    }
    if (this.#attemptsByOwnerModel.size >= 256 && !this.#attemptsByOwnerModel.has(ownerModelKey)) {
      return { ok: false, code: "personal_model.reveal_busy" };
    }
    attempts.push(input.now);
    this.#attemptsByOwnerModel.set(ownerModelKey, attempts);
    this.#activeOwnerModels.add(ownerModelKey);
    this.#activeByCommand.set(input.commandId, {
      requestDigest: input.requestDigest,
      ownerModelKey,
    });
    return { ok: true };
  }

  public finish(input: Readonly<{
    commandId: string;
    requestDigest: string;
    terminal: AttemptTerminal;
    now: number;
  }>): void {
    const active = this.#activeByCommand.get(input.commandId);
    if (active !== undefined) {
      this.#activeByCommand.delete(input.commandId);
      this.#activeOwnerModels.delete(active.ownerModelKey);
    }
    this.#tombstones.set(input.commandId, {
      requestDigest: input.requestDigest,
      terminal: input.terminal,
      expiresAt: input.now + 10 * 60_000,
    });
    this.#prune(input.now);
  }

  public resourceSnapshot(): Readonly<{
    active: number;
    ownerModels: number;
    rateKeys: number;
    tombstones: number;
  }> {
    return {
      active: this.#activeByCommand.size,
      ownerModels: this.#activeOwnerModels.size,
      rateKeys: this.#attemptsByOwnerModel.size,
      tombstones: this.#tombstones.size,
    };
  }

  public clear(): void {
    this.#activeByCommand.clear();
    this.#activeOwnerModels.clear();
    this.#attemptsByOwnerModel.clear();
    this.#tombstones.clear();
  }

  #prune(now: number): void {
    const windowStart = now - 60_000;
    for (const [key, attempts] of this.#attemptsByOwnerModel) {
      const current = attempts.filter((attempt) => attempt > windowStart);
      if (current.length === 0 && !this.#activeOwnerModels.has(key)) {
        this.#attemptsByOwnerModel.delete(key);
      } else {
        this.#attemptsByOwnerModel.set(key, current);
      }
    }
    for (const [commandId, tombstone] of this.#tombstones) {
      if (tombstone.expiresAt <= now) this.#tombstones.delete(commandId);
    }
    while (this.#tombstones.size > 256) {
      const first = this.#tombstones.keys().next().value as string | undefined;
      if (first === undefined) break;
      this.#tombstones.delete(first);
    }
  }
}

export class PersonalModelCredentialRevealService {
  readonly #persistence: PersonalModelPersistence;
  readonly #credentials: PersonalCredentialStore;
  readonly #authorityContexts: PersonalModelOwnerAuthorityContextProvider;
  readonly #authority = new StrictPersonalModelOwnerAuthorityResolver();
  readonly #clock: Clock;
  readonly #attempts: PersonalModelRevealAttemptRegistry;
  readonly #operationGate: PersonalModelOperationGate;

  public constructor(input: {
    persistence: PersonalModelPersistence;
    credentials: PersonalCredentialStore;
    authorityContexts: PersonalModelOwnerAuthorityContextProvider;
    clock: Clock;
    attempts?: PersonalModelRevealAttemptRegistry;
    operationGate?: PersonalModelOperationGate;
  }) {
    this.#persistence = input.persistence;
    this.#credentials = input.credentials;
    this.#authorityContexts = input.authorityContexts;
    this.#clock = input.clock;
    this.#attempts = input.attempts ?? new PersonalModelRevealAttemptRegistry();
    this.#operationGate = input.operationGate ?? new InMemoryPersonalModelOperationGate();
  }

  public async reveal(
    input: RevealPersonalModelCredentialCommand,
  ): Promise<PersonalModelCredentialRevealResult> {
    let command: RevealPersonalModelCredentialCommand;
    try {
      command = RevealPersonalModelCredentialCommandSchema.parse(input);
    } catch {
      return revealFailure("personal_model.conflict", "Personal Model reveal command is invalid");
    }
    if (command.requestDigest !== calculatePersonalModelRevealCommandDigest(command)) {
      return revealFailure("personal_model.conflict", "Personal Model reveal command digest is invalid");
    }
    const startedAt = parseClock(this.#clock.now());
    const requestedDeadline = Date.parse(command.deadlineAt);
    if (!Number.isFinite(requestedDeadline) || requestedDeadline <= startedAt) {
      return revealFailure("personal_model.deadline_exceeded", "Personal Model reveal deadline has expired");
    }
    const effectiveDeadline = Math.min(requestedDeadline, startedAt + CORE_DEADLINE_MS);
    let owner: PersonalModelOwnerIdentity | undefined;
    try {
      owner = await this.#resolveOwner();
    } catch {
      return revealFailure("personal_model.permission_denied", "Personal Model reveal permission is unavailable");
    }

    let lease: PersonalModelOperationLease | undefined;
    let attemptStarted = false;
    let terminal: AttemptTerminal = "rejected";
    try {
      lease = this.#operationGate.tryAcquire(owner, command.personalModelId, "reveal");
      if (lease === undefined) {
        return revealFailure("personal_model.reveal_busy", "Another Personal Model operation is active");
      }
      const headValue = await this.#persistence.loadHead(owner, command.personalModelId);
      if (headValue === undefined) {
        return revealFailure("personal_model.not_found", "Personal Model is unavailable");
      }
      const head = validatePersonalModelHead(headValue);
      if (!ownerMatches(owner, head)
        || head.personalModelId !== command.personalModelId
        || head.selectionState !== "active"
        || head.currentConfigurationRevision !== command.expectedConfigurationRevision
        || head.currentExecutionDefinitionDigest !== command.expectedExecutionDefinitionDigest) {
        return revealFailure("personal_model.conflict", "Personal Model revision is stale or unavailable");
      }
      const definitionValue = await this.#persistence.loadDefinition(
        owner,
        command.personalModelId,
        command.expectedConfigurationRevision,
      );
      if (definitionValue === undefined) {
        return revealFailure("personal_model.not_found", "Personal Model definition is unavailable");
      }
      const definition = validatePersonalModelDefinition(definitionValue);
      if (!ownerMatches(owner, definition)
        || definition.personalModelId !== command.personalModelId
        || definition.configurationRevision !== head.currentConfigurationRevision
        || definition.executionDefinitionDigest !== head.currentExecutionDefinitionDigest) {
        return revealFailure("personal_model.conflict", "Personal Model definition identity conflicts");
      }
      const observation = await this.#credentials.inspect(definition.credentialRef).catch(() => undefined);
      if (observation === undefined || observation.state === "unavailable") {
        return revealFailure("personal_model.credential_unavailable", "Personal Model Credential is unavailable");
      }
      if (observation.state === "absent") {
        return revealFailure("personal_model.not_found", "Personal Model Credential is unavailable");
      }
      if (observation.credentialRef !== definition.credentialRef
        || observation.credentialRevision !== definition.credentialRevision
        || observation.credentialBindingDigest !== definition.credentialBindingDigest) {
        return revealFailure("personal_model.conflict", "Personal Model Credential binding conflicts");
      }
      const admission = this.#attempts.begin({
        owner,
        personalModelId: command.personalModelId,
        commandId: command.commandId,
        requestDigest: command.requestDigest,
        now: parseClock(this.#clock.now()),
      });
      if (!admission.ok) return revealFailure(admission.code, "Personal Model reveal is unavailable");
      attemptStarted = true;
      const resolved = await this.#credentials.resolve(definition.credentialRef).catch(() => undefined);
      if (resolved === undefined) {
        terminal = "uncertain";
        return revealFailure(
          "personal_model.credential_operation_uncertain",
          "Personal Model Credential outcome is uncertain",
        );
      }
      if (!resolved.ok) {
        terminal = terminalForStoreError(resolved.error.code);
        return revealFailure(mapStoreError(resolved.error.code), "Personal Model Credential is unavailable");
      }
      const secret = resolved.value;
      if (secret.byteLength === 0 || secret.byteLength > MAX_SECRET_BYTES) {
        secret.fill(0);
        terminal = "rejected";
        return revealFailure("personal_model.credential_unavailable", "Personal Model Credential is invalid");
      }
      if (parseClock(this.#clock.now()) >= effectiveDeadline) {
        secret.fill(0);
        terminal = "timed_out";
        return revealFailure("personal_model.deadline_exceeded", "Personal Model reveal deadline has expired");
      }
      terminal = "completed";
      return {
        ok: true,
        status: "completed",
        commandId: command.commandId,
        personalModelId: command.personalModelId,
        secret,
      };
    } catch {
      terminal = "rejected";
      return revealFailure("personal_model.conflict", "Personal Model reveal validation failed");
    } finally {
      if (attemptStarted) {
        this.#attempts.finish({
          commandId: command.commandId,
          requestDigest: command.requestDigest,
          terminal,
          now: parseClock(this.#clock.now()),
        });
      }
      lease?.release();
    }
  }

  public resourceSnapshot(): ReturnType<PersonalModelRevealAttemptRegistry["resourceSnapshot"]> {
    return this.#attempts.resourceSnapshot();
  }

  public close(): void {
    this.#attempts.clear();
  }

  async #resolveOwner(): Promise<PersonalModelOwnerIdentity> {
    const loaded = await this.#persistence.loadActiveOwnerNamespace();
    if (loaded === undefined) throw new PersonalModelOwnerAuthorityError("personal_model.permission_denied");
    let namespace: ReturnType<typeof validatePersonalModelOwnerNamespace> | undefined;
    try {
      namespace = validatePersonalModelOwnerNamespace(loaded);
      const context = await this.#authorityContexts.load("reveal");
      return this.#authority.resolve({ ...context, namespace, action: "reveal" }).ownerIdentity;
    } finally {
      loaded.namespaceKey.fill(0);
      namespace?.namespaceKey.fill(0);
    }
  }
}

export function createPersonalModelRevealCommand(
  input: PersonalModelCredentialRevealMaterial & Readonly<{ deadlineAt: string }>,
): RevealPersonalModelCredentialCommand {
  const material = revealMaterial(input);
  return RevealPersonalModelCredentialCommandSchema.parse({
    ...material,
    requestDigest: calculatePersonalModelRevealCommandDigest(material),
    deadlineAt: DeadlineSchema.parse(input.deadlineAt),
  });
}

export function calculatePersonalModelRevealCommandDigest(
  input: PersonalModelCredentialRevealMaterial,
): string {
  const material = revealMaterial(input);
  const canonical = canonicalJsonStringify(JsonValueSchema.parse({
    domain: "robothree.personal-model.credential-reveal.v1",
    schemaVersion: "v1alpha1",
    material,
  }));
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`,
  );
}

function revealMaterial(input: PersonalModelCredentialRevealMaterial): PersonalModelCredentialRevealMaterial {
  return RevealMaterialSchema.parse({
    commandId: input.commandId,
    commandType: input.commandType,
    personalModelId: input.personalModelId,
    expectedConfigurationRevision: input.expectedConfigurationRevision,
    expectedExecutionDefinitionDigest: input.expectedExecutionDefinitionDigest,
  });
}

function revealOwnerModelKey(owner: PersonalModelOwnerIdentity, personalModelId: string): string {
  return `${owner.ownerScopeNamespaceRevision}:${owner.ownerScopeDigest}:${personalModelId}`;
}

function ownerMatches(
  owner: PersonalModelOwnerIdentity,
  value: Readonly<{ ownerScopeNamespaceRevision: number; ownerScopeDigest: string }>,
): boolean {
  return owner.ownerScopeNamespaceRevision === value.ownerScopeNamespaceRevision
    && owner.ownerScopeDigest === value.ownerScopeDigest;
}

function revealFailure(
  code: PersonalModelCredentialRevealErrorCode,
  message: string,
): PersonalModelCredentialRevealResult {
  return { ok: false, error: { code, message } };
}

function mapStoreError(code: PersonalCredentialStoreErrorCode): PersonalModelCredentialRevealErrorCode {
  switch (code) {
    case "credential_store_cancelled":
      return "personal_model.cancelled";
    case "credential_operation_uncertain":
    case "credential_delete_uncertain":
      return "personal_model.credential_operation_uncertain";
    case "credential_store_not_found":
      return "personal_model.not_found";
    case "credential_store_conflict":
    case "credential_input_already_bound":
      return "personal_model.conflict";
    default:
      return "personal_model.credential_unavailable";
  }
}

function terminalForStoreError(code: PersonalCredentialStoreErrorCode): AttemptTerminal {
  if (code === "credential_store_cancelled") return "cancelled";
  if (code === "credential_operation_uncertain" || code === "credential_delete_uncertain") {
    return "uncertain";
  }
  return "rejected";
}

function parseClock(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Clock returned an invalid timestamp");
  return parsed;
}
