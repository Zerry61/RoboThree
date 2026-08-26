import type {
  TaskAuthorizationModePolicyProvider,
  TaskAuthorizationModePolicySnapshot,
} from "../../ports/task-authorization-mode-policy.js";

export class FakeTaskAuthorizationModePolicyProvider
implements TaskAuthorizationModePolicyProvider {
  #snapshot: TaskAuthorizationModePolicySnapshot;

  constructor(snapshot: TaskAuthorizationModePolicySnapshot) {
    this.#snapshot = structuredClone(snapshot);
  }

  replace(snapshot: TaskAuthorizationModePolicySnapshot): void {
    this.#snapshot = structuredClone(snapshot);
  }

  async loadSnapshot(): Promise<TaskAuthorizationModePolicySnapshot> {
    return structuredClone(this.#snapshot);
  }
}
