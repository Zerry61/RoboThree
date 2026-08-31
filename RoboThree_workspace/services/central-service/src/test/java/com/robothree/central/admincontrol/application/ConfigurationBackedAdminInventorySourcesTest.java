package com.robothree.central.admincontrol.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.robothree.central.admincontrol.domain.AdminModule;
import com.robothree.central.admincontrol.domain.AdminModuleAvailability;
import com.robothree.central.configuration.application.ConfigurationIntegrityVerifier;
import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import com.robothree.central.support.CanonicalConfigurationFixtures;
import java.time.Instant;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class ConfigurationBackedAdminInventorySourcesTest {

    @Test
    void mapsOnlyFactsProvenByTheVerifiedConfigurationAuthorities() {
        Instant now = Instant.parse("2026-08-27T02:00:00Z");
        var persistence = new InMemoryCentralPersistence();
        var seed = CanonicalConfigurationFixtures.validSeed(now);
        seed.packages().forEach(persistence::insert);
        persistence.insert(seed.snapshot());

        var sources = ConfigurationBackedAdminInventorySources.create(
                        persistence, new ConfigurationIntegrityVerifier(persistence))
                .stream()
                .collect(Collectors.toMap(AdminModuleInventorySource::module, Function.identity()));

        var model = sources.get(AdminModule.MODELS).capture(now);
        assertThat(model.availability()).isEqualTo(AdminModuleAvailability.PARTIAL);
        assertThat(model.items()).isEmpty();
        assertThat(model.safeReason()).contains("model_projection_fields_not_authoritative");

        var robot = sources.get(AdminModule.ROBOTS).capture(now);
        assertThat(robot.availability()).isEqualTo(AdminModuleAvailability.PARTIAL);
        assertThat(robot.items()).isEmpty();
        assertThat(robot.knownUnavailableResourceIds()).isEmpty();

        var skill = sources.get(AdminModule.SKILLS).capture(now);
        assertThat(skill.availability()).isEqualTo(AdminModuleAvailability.PARTIAL);
        assertThat(skill.items()).singleElement().satisfies(item -> {
            assertThat(item.resourceId()).isEqualTo("skill.package-alpha");
            assertThat(item.summary().path("displayName").asText()).isEqualTo("Alpha Skill");
            assertThat(item.detail().path("packageValidationState").asText()).isEqualTo("valid");
            assertThat(item.detail().toString()).doesNotContain("utf8Content", "SKILL.md");
        });

        assertThat(sources.get(AdminModule.TOOLS).capture(now).availability())
                .isEqualTo(AdminModuleAvailability.GATED);
        assertThat(sources.get(AdminModule.KNOWLEDGE).capture(now).availability())
                .isEqualTo(AdminModuleAvailability.PARTIAL);
    }

    @Test
    void missingConfigurationIsUnavailableRatherThanAnEmptySuccess() {
        Instant now = Instant.parse("2026-08-27T02:00:00Z");
        var persistence = new InMemoryCentralPersistence();
        var source = ConfigurationBackedAdminInventorySources.create(
                        persistence, new ConfigurationIntegrityVerifier(persistence))
                .getFirst();

        assertThat(source.capture(now).availability())
                .isEqualTo(AdminModuleAvailability.UNAVAILABLE);
    }
}
