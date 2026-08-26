import type {
  TaskAuthorizationModePolicyProvider,
  TaskAuthorizationModePolicySnapshot,
} from "../ports/task-authorization-mode-policy.js";
import {
  canonicalAuthorizationModeOrder,
  createTaskAuthorizationModePolicySnapshot,
} from "../ports/task-authorization-mode-policy.js";

export const MVP_TASK_AUTHORIZATION_MODE_POLICY =
  createTaskAuthorizationModePolicySnapshot({
    policyId: "task-authorization-policy.mvp.fixed",
    supportedModes: canonicalAuthorizationModeOrder([
      "manual_review",
      "smart_confirm",
      "task_scoped",
    ]),
    legacyDefaultMode: "smart_confirm",
    createdAt: "2026-08-17T00:00:00.000Z",
  });

export class FixedTaskAuthorizationModePolicyProvider
implements TaskAuthorizationModePolicyProvider {
  async loadSnapshot(): Promise<TaskAuthorizationModePolicySnapshot> {
    return structuredClone(MVP_TASK_AUTHORIZATION_MODE_POLICY);
  }
}
