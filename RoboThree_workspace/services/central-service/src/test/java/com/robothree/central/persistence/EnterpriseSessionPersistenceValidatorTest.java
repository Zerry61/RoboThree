package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.domain.EnterpriseSessionPersistenceValidator;
import com.robothree.central.authentication.port.EnterpriseSessionPersistence;
import org.junit.jupiter.api.Test;

class EnterpriseSessionPersistenceValidatorTest {

    @Test
    void rejectsChallengeRecordDigestTampering() {
        var bundle = new EnterpriseSessionPersistence.EnterpriseSessionChallengeBundle(
                EnterpriseSessionPersistenceFixtures.challenge(),
                EnterpriseSessionPersistenceFixtures.bindingWithRecordDigest(
                        EnterpriseSessionPersistenceFixtures.D));

        assertThatThrownBy(() -> EnterpriseSessionPersistenceValidator
                        .validateChallengeBundle(bundle))
                .isInstanceOf(PersistenceIntegrityException.class)
                .extracting("code")
                .isEqualTo("persistence.enterprise_session_binding_corrupt");
    }

    @Test
    void rejectsLeaseRecordDigestTampering() {
        var bundle = new EnterpriseSessionPersistence.EnterpriseSessionChallengeBundle(
                EnterpriseSessionPersistenceFixtures.challenge(),
                EnterpriseSessionPersistenceFixtures.binding());

        assertThatThrownBy(() -> EnterpriseSessionPersistenceValidator.validateLease(
                        EnterpriseSessionPersistenceFixtures.leaseWithRecordDigest(
                                EnterpriseSessionPersistenceFixtures.D),
                        bundle,
                        EnterpriseSessionPersistenceFixtures.identity(),
                        EnterpriseSessionPersistenceFixtures.device()))
                .isInstanceOf(PersistenceIntegrityException.class)
                .extracting("code")
                .isEqualTo("persistence.enterprise_session_lease_corrupt");
    }

    @Test
    void rejectsNonCanonicalAssertionJson() {
        var bundle = new EnterpriseSessionPersistence.EnterpriseSessionChallengeBundle(
                EnterpriseSessionPersistenceFixtures.challenge(),
                EnterpriseSessionPersistenceFixtures.binding());
        String nonCanonical = "{ \"kind\": \"enterprise_session_assertion\" }";

        assertThatThrownBy(() -> EnterpriseSessionPersistenceValidator.validateLease(
                        EnterpriseSessionPersistenceFixtures.leaseWithAssertionJson(nonCanonical),
                        bundle,
                        EnterpriseSessionPersistenceFixtures.identity(),
                        EnterpriseSessionPersistenceFixtures.device()))
                .isInstanceOf(PersistenceIntegrityException.class)
                .extracting("code")
                .isEqualTo("persistence.enterprise_session_lease_corrupt");
    }
}
