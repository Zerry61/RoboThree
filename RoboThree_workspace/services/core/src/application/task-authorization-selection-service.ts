import {
  AuthorizationPreferenceV1Alpha2Schema,
  JsonValueSchema,
  TaskAuthorizationSelectionMaterialSchema,
  TaskAuthorizationSelectionSchema,
  TaskExecutionSelectionIdentityMaterialSchema,
  TaskExecutionSelectionIdentitySchema,
} from "@robothree/contracts";
import type {
  AuthorizationPreferenceV1Alpha2,
  RuntimeError,
  TaskAuthorizationSelection,
  TaskExecutionSelectionIdentity,
} from "@robothree/contracts";

import type { TaskAuthorizationModePolicySnapshot } from
  "../ports/task-authorization-mode-policy.js";
import { hasValidTaskAuthorizationModePolicySnapshot } from
  "../ports/task-authorization-mode-policy.js";
import { sha256CanonicalJson } from "../persistence/digest.js";

export type TaskAuthorizationRequest =
  | Readonly<{
    kind: "explicit";
    preference: AuthorizationPreferenceV1Alpha2;
  }>
  | Readonly<{ kind: "legacy" }>;

export type TaskAuthorizationSelectionResult =
  | Readonly<{
    ok: true;
    selection: TaskAuthorizationSelection;
    executionIdentity: TaskExecutionSelectionIdentity;
  }>
  | Readonly<{ ok: false; error: RuntimeError }>;

export class TaskAuthorizationSelectionService {
  resolve(input: Readonly<{
    taskId: string;
    runtimeSelection: Readonly<{
      taskId: string;
      runtimeSelectionId: string;
      selectionDigest: string;
    }>;
    authorization: TaskAuthorizationRequest;
    policySnapshot: TaskAuthorizationModePolicySnapshot | unknown;
    createdAt: string;
  }>): TaskAuthorizationSelectionResult {
    if (input.taskId !== input.runtimeSelection.taskId) {
      return fail(
        "authorization_mode.runtime_selection_mismatch",
        "Task and Runtime Selection identity do not match",
      );
    }
    if (!hasValidTaskAuthorizationModePolicySnapshot(input.policySnapshot)) {
      return fail(
        "authorization_mode.policy_invalid",
        "Task authorization mode policy snapshot is invalid",
        "configuration",
      );
    }
    const policy = input.policySnapshot;
    const resolved = this.#resolveMode(input.authorization, policy);
    if (!resolved.ok) return resolved;

    const material = TaskAuthorizationSelectionMaterialSchema.safeParse({
      schemaVersion: "v1alpha1",
      taskId: input.taskId,
      runtimeSelectionId: input.runtimeSelection.runtimeSelectionId,
      requestedMode: resolved.mode,
      resolvedMode: resolved.mode,
      policyRevision: policy.policyRevision,
      source: resolved.source,
      createdAt: input.createdAt,
    });
    if (!material.success) {
      return fail(
        "authorization_mode.selection_invalid",
        "Task authorization selection material is invalid",
      );
    }
    const selection = TaskAuthorizationSelectionSchema.parse({
      ...material.data,
      authorizationSelectionDigest: sha256CanonicalJson(
        JsonValueSchema.parse(material.data),
      ),
    });
    const executionMaterial =
      TaskExecutionSelectionIdentityMaterialSchema.safeParse({
        schemaVersion: "v1alpha1",
        taskId: input.taskId,
        runtimeSelectionId: input.runtimeSelection.runtimeSelectionId,
        runtimeSelectionDigest: input.runtimeSelection.selectionDigest,
        authorizationSelectionDigest:
          selection.authorizationSelectionDigest,
      });
    if (!executionMaterial.success) {
      return fail(
        "authorization_mode.execution_identity_invalid",
        "Task execution selection identity is invalid",
      );
    }
    const executionIdentity = TaskExecutionSelectionIdentitySchema.parse({
      ...executionMaterial.data,
      executionSelectionDigest: sha256CanonicalJson(
        JsonValueSchema.parse(executionMaterial.data),
      ),
    });
    return { ok: true, selection, executionIdentity };
  }

  #resolveMode(
    authorization: TaskAuthorizationRequest,
    policy: TaskAuthorizationModePolicySnapshot,
  ):
    | Readonly<{
      ok: true;
      mode: TaskAuthorizationSelection["resolvedMode"];
      source: TaskAuthorizationSelection["source"];
    }>
    | Readonly<{ ok: false; error: RuntimeError }> {
    if (authorization.kind === "legacy") {
      if (!policy.supportedModes.includes(policy.legacyDefaultMode)) {
        return fail(
          "authorization_mode.legacy_default_unsupported",
          "Legacy authorization default is not supported by the locked policy",
          "configuration",
        );
      }
      return {
        ok: true,
        mode: policy.legacyDefaultMode,
        source: "legacy_default",
      };
    }
    const preference = AuthorizationPreferenceV1Alpha2Schema.safeParse(
      authorization.preference,
    );
    if (!preference.success) {
      return fail(
        "authorization_mode.preference_invalid",
        "Task authorization preference is invalid",
      );
    }
    if (!policy.supportedModes.includes(preference.data.requestedMode)) {
      return fail(
        "authorization_mode.mode_unsupported",
        "Requested task authorization mode is unavailable",
        "authorization",
      );
    }
    return {
      ok: true,
      mode: preference.data.requestedMode,
      source: "user_selected",
    };
  }
}

export function hasValidTaskAuthorizationSelection(
  input: unknown,
): input is TaskAuthorizationSelection {
  const parsed = TaskAuthorizationSelectionSchema.safeParse(input);
  if (!parsed.success) return false;
  const { authorizationSelectionDigest, ...material } = parsed.data;
  return authorizationSelectionDigest === sha256CanonicalJson(
    JsonValueSchema.parse(
      TaskAuthorizationSelectionMaterialSchema.parse(material),
    ),
  );
}

export function hasValidTaskExecutionSelectionIdentity(
  input: unknown,
): input is TaskExecutionSelectionIdentity {
  const parsed = TaskExecutionSelectionIdentitySchema.safeParse(input);
  if (!parsed.success) return false;
  const { executionSelectionDigest, ...material } = parsed.data;
  return executionSelectionDigest === sha256CanonicalJson(
    JsonValueSchema.parse(
      TaskExecutionSelectionIdentityMaterialSchema.parse(material),
    ),
  );
}

function fail(
  code: string,
  message: string,
  category: RuntimeError["category"] = "validation",
): Readonly<{ ok: false; error: RuntimeError }> {
  return {
    ok: false,
    error: {
      code,
      category,
      message,
      retryable: false,
    },
  };
}
