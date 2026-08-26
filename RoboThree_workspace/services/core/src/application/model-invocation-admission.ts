import {
  CONTRACT_VERSION,
  JsonValueSchema,
  TaskModelExternalConfirmationScopeSchema,
  UserConfirmationRequestSchema,
  userConfirmationDisplaySummary,
} from "@robothree/contracts";
import type {
  ModelExternalDataCategory,
  TaskCapabilityLock,
  UserConfirmationDecision,
  UserConfirmationRequest,
} from "@robothree/contracts";
import type { ReadableTaskRuntimeSelection } from
  "@robothree/contracts/runtime-selection/v1alpha2";

import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { TaskPersistence } from "../ports/task-persistence.js";
import { sha256CanonicalJson } from "../persistence/digest.js";
import type { UserConfirmationCoordinator } from "./user-confirmation-coordinator.js";

export type ModelInvocationAdmissionResult = Readonly<{
  type: "user_confirmed";
  confirmationId: string;
  scopeDigest: string;
  confirmationDigest: string;
}>;

export class ModelInvocationAdmissionPending extends Error {
  public readonly code = "model.user_confirmation_required";
  public readonly confirmationId: string;

  public constructor(confirmationId: string) {
    super("Model invocation is waiting for exact-scope user confirmation");
    this.name = "ModelInvocationAdmissionPending";
    this.confirmationId = confirmationId;
  }
}

export class ModelInvocationAdmissionRejected extends Error {
  public readonly code = "authorization.user_rejected";

  public constructor() {
    super("The user rejected this exact Model external data scope");
    this.name = "ModelInvocationAdmissionRejected";
  }
}

export interface ModelInvocationLiveAuthorizer {
  assertAllowed(input: Readonly<{
    taskId: string;
    runtimeSelection: ReadableTaskRuntimeSelection;
    modelLock: TaskCapabilityLock;
  }>): Promise<void>;
}

export class ModelInvocationAdmission {
  readonly #persistence: TaskPersistence;
  readonly #confirmations: UserConfirmationCoordinator;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;
  readonly #liveAuthorizer: ModelInvocationLiveAuthorizer;

  public constructor(input: {
    persistence: TaskPersistence;
    confirmations: UserConfirmationCoordinator;
    clock: Clock;
    ids: IdGenerator;
    liveAuthorizer: ModelInvocationLiveAuthorizer;
  }) {
    this.#persistence = input.persistence;
    this.#confirmations = input.confirmations;
    this.#clock = input.clock;
    this.#ids = input.ids;
    this.#liveAuthorizer = input.liveAuthorizer;
  }

  public async authorize(input: Readonly<{
    taskId: string;
    runId: string;
    stepId: string;
    actionId: string;
    runtimeSelection: ReadableTaskRuntimeSelection;
    modelLock: TaskCapabilityLock;
    externalTarget: string;
    dataCategories: readonly ModelExternalDataCategory[];
    dataScopeDigest: string;
  }>): Promise<ModelInvocationAdmissionResult> {
    assertExactModelLock(input);
    const scope = TaskModelExternalConfirmationScopeSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      type: "task_model_external_scope",
      taskId: input.taskId,
      runtimeSelectionDigest: input.runtimeSelection.selectionDigest,
      modelCapabilityRevision: input.modelLock.definitionSnapshot.revision,
      bindingRevision: input.modelLock.bindingSnapshot.revision,
      adapterDescriptorRevision: input.modelLock.adapterDescriptorSnapshot.revision,
      externalTarget: input.externalTarget,
      dataCategories: input.dataCategories,
      dataScopeDigest: input.dataScopeDigest,
    });
    const scopeDigest = sha256CanonicalJson(JsonValueSchema.parse(scope));
    const existing = await this.#persistence.findUserConfirmationByScopeDigest(scopeDigest);
    if (existing?.decision?.decision === "confirmed") {
      await this.#liveAuthorizer.assertAllowed({
        taskId: input.taskId,
        runtimeSelection: input.runtimeSelection,
        modelLock: input.modelLock,
      });
      return {
        type: "user_confirmed",
        confirmationId: existing.request.confirmationId,
        scopeDigest,
        confirmationDigest: confirmationDigest(existing.request, existing.decision),
      };
    }
    if (existing?.decision?.decision === "rejected") {
      throw new ModelInvocationAdmissionRejected();
    }
    if (existing !== undefined) {
      throw new ModelInvocationAdmissionPending(existing.request.confirmationId);
    }

    const confirmationId = this.#ids.next();
    const request = UserConfirmationRequestSchema.parse({
      schemaVersion: CONTRACT_VERSION,
      confirmationId,
      runId: input.runId,
      stepId: input.stepId,
      actionId: input.actionId,
      scope,
      scopeDigest,
      displaySummary: userConfirmationDisplaySummary(scope),
      requestedAt: this.#clock.now(),
    });
    const requested = await this.#confirmations.request(request);
    if (!requested.accepted) {
      const error = new Error(requested.error.message);
      error.name = requested.error.code;
      throw error;
    }
    throw new ModelInvocationAdmissionPending(confirmationId);
  }
}

function assertExactModelLock(input: Readonly<{
  taskId: string;
  runtimeSelection: ReadableTaskRuntimeSelection;
  modelLock: TaskCapabilityLock;
  externalTarget?: string;
}>): void {
  const ref = input.runtimeSelection.resolvedModelLock;
  if (
    input.runtimeSelection.taskId !== input.taskId
    || input.modelLock.taskId !== input.taskId
    || input.modelLock.lockId !== ref.lockId
    || input.modelLock.definitionSnapshot.capabilityId !== ref.capabilityId
    || sha256CanonicalJson(JsonValueSchema.parse(input.modelLock)) !== ref.lockDigest
    || input.modelLock.definitionSnapshot.kind !== "model"
    || (input.externalTarget !== undefined
      && input.modelLock.adapterDescriptorSnapshot.implementationRef !== input.externalTarget)
  ) {
    throw new Error("Locked Model Capability does not match the exact Task runtime selection");
  }
}

function confirmationDigest(
  request: UserConfirmationRequest,
  decision: UserConfirmationDecision,
): string {
  return sha256CanonicalJson(JsonValueSchema.parse(
    JSON.parse(JSON.stringify({ request, decision })) as unknown,
  ));
}
