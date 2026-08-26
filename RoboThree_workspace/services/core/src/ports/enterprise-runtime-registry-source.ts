import type {
  ActivatedEnterpriseConfiguration,
} from "../application/enterprise-configuration-types.js";
import type {
  EnterpriseIdentityScope,
} from "./enterprise-access-token-provider.js";

/**
 * Semantic read boundary for CGF-1.3A. Implementations may read only the exact
 * sealed Storage Active generation. Runtime activation facts are deliberately
 * not part of this Port until CGF-1.3B.
 */
export interface EnterpriseRuntimeRegistrySource {
  loadStorageActive(
    scope: EnterpriseIdentityScope,
  ): Promise<ActivatedEnterpriseConfiguration | undefined>;
  loadSealedGeneration(
    scope: EnterpriseIdentityScope,
    candidateKey: string,
  ): Promise<ActivatedEnterpriseConfiguration | undefined>;
}

/**
 * Narrow session gate consumed by the Registry materializer. The existing
 * EnterpriseAccessTokenProvider satisfies this shape without exposing bearer
 * material to the materializer.
 */
export interface EnterpriseRuntimeSessionVerifier {
  assertCurrentSession(
    expectedScope: EnterpriseIdentityScope,
    requiredPermission: string,
  ): Promise<void>;
}
