package com.robothree.central.configuration.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import com.robothree.central.support.CanonicalConfigurationFixtures;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class TrustedConfigurationSeederTest {

    private static final Instant NOW = Instant.parse("2026-07-25T04:00:00Z");
    @Test
    void atomicallySeedsImmutablePackagesBeforeTheConfigurationSnapshot() {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        ConfigurationIntegrityVerifier verifier =
                new ConfigurationIntegrityVerifier(persistence);
        TrustedConfigurationSeeder seeder = new TrustedConfigurationSeeder(
                persistence,
                persistence,
                persistence,
                verifier);
        var seed = CanonicalConfigurationFixtures.validSeed(NOW);

        assertThat(seeder.seed(seed.packages(), seed.snapshot())).isEqualTo(seed.snapshot());
        var document = seed.packages().getFirst();
        assertThat(persistence.findPackage(document.packageId(), document.revision()))
                .contains(document);
        assertThat(persistence.findSnapshot(
                        seed.snapshot().snapshotId(),
                        seed.snapshot().revision()))
                .contains(seed.snapshot());
    }
}
