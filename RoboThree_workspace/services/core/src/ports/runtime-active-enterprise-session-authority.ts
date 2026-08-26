import type {
  RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1,
} from "@robothree/contracts";

export type RuntimeActiveEnterpriseSessionAuthorityRequest = Readonly<{
  runtimeInstanceId: string;
  clientInstanceId: string;
  requiredEntitlement: "personal_model.configure";
}>;

/**
 * Core-private production boundary. EIPC-0 freezes the result semantics only;
 * no production implementation is installed until EIPC-1/EIPC-2.
 */
export interface RuntimeActiveEnterpriseSessionAuthorityProvider {
  loadCurrent(
    request: RuntimeActiveEnterpriseSessionAuthorityRequest,
  ): Promise<RuntimeActiveEnterpriseAuthoritySnapshotV1Alpha1>;
}
