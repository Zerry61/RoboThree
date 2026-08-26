import type {
  RuntimeActivationTarget,
} from "../../ports/runtime-activation-persistence.js";
import type {
  RuntimeRegistryInstallation,
  RuntimeRegistryInstaller,
} from "../../ports/runtime-registry-installer.js";

export class FakeRuntimeRegistryInstaller implements RuntimeRegistryInstaller {
  readonly installations: RuntimeRegistryInstallation[] = [];
  readonly publicReadiness: RuntimeActivationTarget[] = [];
  readonly failedClosedTargets: RuntimeActivationTarget[] = [];
  internalReadinessFailure: Error | undefined;
  publicReadinessFailure: Error | undefined;

  async installAndCheckInternalReadiness(
    installation: RuntimeRegistryInstallation,
  ): Promise<void> {
    this.installations.push(structuredClone(installation));
    if (this.internalReadinessFailure !== undefined) {
      throw this.internalReadinessFailure;
    }
  }

  async exposePublicReadiness(target: RuntimeActivationTarget): Promise<void> {
    this.publicReadiness.push(structuredClone(target));
    if (this.publicReadinessFailure !== undefined) {
      throw this.publicReadinessFailure;
    }
  }

  async failClosedEnterprisePartition(
    target: RuntimeActivationTarget,
  ): Promise<void> {
    this.failedClosedTargets.push(structuredClone(target));
  }
}
