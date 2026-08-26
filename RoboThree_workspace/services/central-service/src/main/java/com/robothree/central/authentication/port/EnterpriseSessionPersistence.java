package com.robothree.central.authentication.port;

import com.robothree.central.authentication.domain.DeviceChallenge;
import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.domain.EnterpriseSessionLeaseIssuance;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface EnterpriseSessionPersistence {

    EnterpriseSessionChallengeBundle commitChallengeOutcome(
            DeviceChallenge challenge,
            EnterpriseSessionChallengeBinding binding);

    Optional<EnterpriseSessionChallengeBundle> loadChallengeById(UUID challengeId);

    Optional<EnterpriseSessionChallengeBundle> loadChallengeByCorrelationId(UUID correlationId);

    Optional<EnterpriseSessionChallengeBundle> loadChallengeForUpdate(UUID challengeId);

    EnterpriseSessionLeaseIssuance commitLeaseOutcome(EnterpriseSessionLeaseCommit commit);

    Optional<EnterpriseSessionLeaseIssuance> loadLeaseByTokenId(UUID tokenId);

    record EnterpriseSessionChallengeBundle(
            DeviceChallenge challenge,
            EnterpriseSessionChallengeBinding binding) {}

    record EnterpriseSessionLeaseCommit(
            String expectedChallengeRecordDigest,
            String expectedBindingDigest,
            Instant consumedAt,
            String consumedBy,
            String requestDigest,
            EnterpriseSessionLeaseIssuance issuance) {

        public EnterpriseSessionLeaseCommit {
            if (!"enterprise_session_lease".equals(consumedBy)) {
                throw new IllegalArgumentException("consumedBy is unsupported");
            }
            com.robothree.central.shared.domain.DomainValueChecks.digest(
                    expectedChallengeRecordDigest, "expectedChallengeRecordDigest");
            com.robothree.central.shared.domain.DomainValueChecks.digest(
                    expectedBindingDigest, "expectedBindingDigest");
            java.util.Objects.requireNonNull(consumedAt, "consumedAt");
            com.robothree.central.shared.domain.DomainValueChecks.digest(
                    requestDigest, "requestDigest");
            java.util.Objects.requireNonNull(issuance, "issuance");
        }
    }
}
