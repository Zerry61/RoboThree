package com.robothree.central.authentication.application;

import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.authentication.port.AuthenticationEntropySource;
import com.robothree.central.authentication.port.EnterpriseUserIdentityVerifier;
import com.robothree.central.authentication.port.OAIdentityAdapter;
import com.robothree.central.authentication.port.VerifiedIdentityRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Objects;

public final class VerifyEnterpriseIdentityService
        implements EnterpriseUserIdentityVerifier {

    private final OAIdentityAdapter oaIdentityAdapter;
    private final VerifiedIdentityRepository identities;
    private final AuthenticationEntropySource entropy;
    private final Clock clock;
    private final AuthenticationSecurityPolicy policy;

    public VerifyEnterpriseIdentityService(
            OAIdentityAdapter oaIdentityAdapter,
            VerifiedIdentityRepository identities,
            AuthenticationEntropySource entropy,
            Clock clock,
            AuthenticationSecurityPolicy policy) {
        this.oaIdentityAdapter = Objects.requireNonNull(oaIdentityAdapter, "oaIdentityAdapter");
        this.identities = Objects.requireNonNull(identities, "identities");
        this.entropy = Objects.requireNonNull(entropy, "entropy");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.policy = Objects.requireNonNull(policy, "policy");
    }

    @Override
    public VerifiedEnterpriseIdentity verify(OAIdentityAdapter.OAIdentityMaterial material) {
        OAIdentityAdapter.VerifiedIdentityClaims claims;
        try {
            claims = oaIdentityAdapter.verify(material);
        } catch (RuntimeException exception) {
            throw EnterpriseAuthenticationException.authentication(
                    "enterprise_identity_invalid",
                    "Enterprise identity verification failed.");
        }
        Instant now = clock.instant();
        String identityDigest = AuthenticationCrypto.boundDigest(
                claims.enterpriseId(),
                claims.userId(),
                claims.provider(),
                claims.providerSubjectDigest(),
                now.toString());
        return identities.insert(new VerifiedEnterpriseIdentity(
                entropy.nextUuid(),
                claims.enterpriseId(),
                claims.userId(),
                claims.provider(),
                claims.providerSubjectDigest(),
                identityDigest,
                now,
                now.plus(policy.verifiedIdentityTtl()),
                null));
    }
}
