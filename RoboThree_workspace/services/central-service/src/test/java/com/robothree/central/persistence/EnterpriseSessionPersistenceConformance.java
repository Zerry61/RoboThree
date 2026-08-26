package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.domain.EnterpriseSessionChallengeBinding;
import com.robothree.central.authentication.port.EnterpriseDeviceRepository;
import com.robothree.central.authentication.port.EnterpriseSessionPersistence;
import com.robothree.central.authentication.port.VerifiedIdentityRepository;
import com.robothree.central.persistence.port.CentralTransactionRunner;

final class EnterpriseSessionPersistenceConformance {

    private EnterpriseSessionPersistenceConformance() {}

    static void verify(Harness harness) {
        harness.identities().insert(EnterpriseSessionPersistenceFixtures.identity());
        harness.devices().insert(EnterpriseSessionPersistenceFixtures.device());

        var challenge = EnterpriseSessionPersistenceFixtures.challenge();
        var binding = EnterpriseSessionPersistenceFixtures.binding();
        var bundle = harness.sessions().commitChallengeOutcome(challenge, binding);
        assertThat(bundle.challenge()).isEqualTo(challenge);
        assertThat(bundle.binding()).isEqualTo(binding);
        assertThat(harness.sessions().commitChallengeOutcome(challenge, binding)).isEqualTo(bundle);
        assertThat(harness.sessions().loadChallengeById(challenge.challengeId())).contains(bundle);
        assertThat(harness.sessions().loadChallengeByCorrelationId(binding.correlationId()))
                .contains(bundle);
        assertThat(harness.sessions().loadChallengeForUpdate(challenge.challengeId()))
                .contains(bundle);

        var lease = EnterpriseSessionPersistenceFixtures.lease();
        var commit = new EnterpriseSessionPersistence.EnterpriseSessionLeaseCommit(
                binding.recordDigest(),
                binding.challengeBindingDigest(),
                EnterpriseSessionPersistenceFixtures.NOW.plusSeconds(5),
                EnterpriseSessionChallengeBinding.PURPOSE,
                EnterpriseSessionPersistenceFixtures.A,
                lease);
        assertThat(harness.sessions().commitLeaseOutcome(commit)).isEqualTo(lease);
        assertThat(harness.sessions().commitLeaseOutcome(commit)).isEqualTo(lease);
        assertThat(harness.sessions().loadLeaseByTokenId(lease.tokenId())).contains(lease);
        assertThat(harness.sessions().loadChallengeById(challenge.challengeId()))
                .get()
                .extracting(value -> value.challenge().consumedRequestDigest())
                .isEqualTo(EnterpriseSessionPersistenceFixtures.A);

        assertThatThrownBy(() -> harness.sessions().commitLeaseOutcome(
                        new EnterpriseSessionPersistence.EnterpriseSessionLeaseCommit(
                                EnterpriseSessionPersistenceFixtures.D,
                                binding.challengeBindingDigest(),
                                EnterpriseSessionPersistenceFixtures.NOW.plusSeconds(5),
                                EnterpriseSessionChallengeBinding.PURPOSE,
                                EnterpriseSessionPersistenceFixtures.A,
                                lease)))
                .isInstanceOf(PersistenceConflictException.class);
    }

    static void verifyOuterRollback(Harness harness) {
        harness.identities().insert(EnterpriseSessionPersistenceFixtures.identity());
        harness.devices().insert(EnterpriseSessionPersistenceFixtures.device());
        assertThatThrownBy(() -> harness.transactions().required(() -> {
                    harness.sessions().commitChallengeOutcome(
                            EnterpriseSessionPersistenceFixtures.challenge(),
                            EnterpriseSessionPersistenceFixtures.binding());
                    throw new IllegalStateException("named failure after aggregate challenge");
                }))
                .isInstanceOf(IllegalStateException.class);
        assertThat(harness.sessions().loadChallengeById(EnterpriseSessionPersistenceFixtures.CHALLENGE_ID))
                .isEmpty();
        assertThat(harness.sessions()
                        .loadChallengeByCorrelationId(EnterpriseSessionPersistenceFixtures.CORRELATION_ID))
                .isEmpty();
    }

    static Harness harness(
            EnterpriseSessionPersistence sessions,
            VerifiedIdentityRepository identities,
            EnterpriseDeviceRepository devices,
            CentralTransactionRunner transactions) {
        return new Harness(sessions, identities, devices, transactions);
    }

    record Harness(
            EnterpriseSessionPersistence sessions,
            VerifiedIdentityRepository identities,
            EnterpriseDeviceRepository devices,
            CentralTransactionRunner transactions) {}
}
