package com.robothree.central.authentication.port;

import static com.robothree.central.shared.domain.DomainValueChecks.digest;
import static com.robothree.central.shared.domain.DomainValueChecks.text;

public interface OAIdentityAdapter {

    VerifiedIdentityClaims verify(OAIdentityMaterial material);

    interface OAIdentityMaterial {}

    record VerifiedIdentityClaims(
            String enterpriseId,
            String userId,
            String provider,
            String providerSubjectDigest) {

        public VerifiedIdentityClaims {
            text(enterpriseId, "enterpriseId");
            text(userId, "userId");
            text(provider, "provider");
            digest(providerSubjectDigest, "providerSubjectDigest");
        }
    }
}
