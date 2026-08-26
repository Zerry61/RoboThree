import type {
  EnterpriseRegistryMaterialization,
} from "../application/enterprise-registry-materializer.js";
import type {
  RuntimeActivationTarget,
} from "./runtime-activation-persistence.js";

export type RuntimeRegistryInstallation = Readonly<{
  target: RuntimeActivationTarget;
  materialization: EnterpriseRegistryMaterialization;
}>;

/**
 * Bootstrap-only boundary. Runtime handles remain behind the implementation;
 * no handle enters the persistence or public Contract.
 */
export interface RuntimeRegistryInstaller {
  installAndCheckInternalReadiness(
    installation: RuntimeRegistryInstallation,
  ): Promise<void>;
  exposePublicReadiness(target: RuntimeActivationTarget): Promise<void>;
  failClosedEnterprisePartition(target: RuntimeActivationTarget): Promise<void>;
}
