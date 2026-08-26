package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.OpaqueVerifiedIdentityHandle;
import java.util.Objects;
import java.util.UUID;

public interface VerifiedIdentityHandleResolver {

    ResolvedVerifiedIdentityHandle resolveForChallenge(
            OpaqueVerifiedIdentityHandle opaqueHandle);

    ResolvedVerifiedIdentityHandle resolveForLeaseForUpdate(
            OpaqueVerifiedIdentityHandle opaqueHandle,
            String expectedIdentitySourceRevision);

    record ResolvedVerifiedIdentityHandle(
            UUID verifiedIdentityId,
            String identitySourceRevision) {

        public ResolvedVerifiedIdentityHandle {
            Objects.requireNonNull(verifiedIdentityId, "verifiedIdentityId");
            EnterpriseSessionPortChecks.boundedOpaqueRevision(
                    identitySourceRevision, "identitySourceRevision");
        }
    }
}
