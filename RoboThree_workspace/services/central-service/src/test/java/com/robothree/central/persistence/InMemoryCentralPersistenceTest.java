package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.domain.VerifiedEnterpriseIdentity;
import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class InMemoryCentralPersistenceTest {

    @Test
    void satisfiesTheTypedRepositoryConformanceSuite() {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        CentralPersistenceConformance.verify(CentralPersistenceConformance.harness(
                persistence,
                persistence,
                persistence,
                persistence,
                persistence,
                persistence,
                persistence,
                persistence,
                persistence));
    }

    @Test
    void satisfiesModelInvocationPersistenceConformance() {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        ModelInvocationPersistenceConformance.verify(
                ModelInvocationPersistenceConformance.harness(
                        persistence,
                        persistence,
                        persistence,
                        persistence,
                        persistence));
    }

    @Test
    void satisfiesEnterpriseSessionPersistenceConformance() {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        EnterpriseSessionPersistenceConformance.verify(
                EnterpriseSessionPersistenceConformance.harness(
                        persistence, persistence, persistence, persistence));
    }

    @Test
    void rollsBackEnterpriseSessionSecondaryIndexes() {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        EnterpriseSessionPersistenceConformance.verifyOuterRollback(
                EnterpriseSessionPersistenceConformance.harness(
                        persistence, persistence, persistence, persistence));
    }

    @Test
    void supportsTransactionalEnterpriseSessionApplicationFlow() {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        EnterpriseSessionTransactionalPersistenceConformance.verify(
                CentralPersistenceConformance.harness(
                        persistence,
                        persistence,
                        persistence,
                        persistence,
                        persistence,
                        persistence,
                        persistence,
                        persistence,
                        persistence),
                persistence,
                persistence);
    }

    @Test
    void serializesConcurrentModelInvocationAccepts() throws Exception {
        ModelInvocationPersistenceConformance.verifyConcurrentAccept(
                new InMemoryCentralPersistence());
    }

    @Test
    void domainRejectsMalformedDigestBeforePersistence() {
        assertThatThrownBy(() -> new VerifiedEnterpriseIdentity(
                        UUID.randomUUID(),
                        "enterprise.alpha",
                        "user.alpha",
                        "fake-oa",
                        "not-a-digest",
                        "a".repeat(64),
                        Instant.parse("2026-07-25T04:00:00Z"),
                        Instant.parse("2026-07-25T04:05:00Z"),
                        null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("SHA-256");
    }
}
