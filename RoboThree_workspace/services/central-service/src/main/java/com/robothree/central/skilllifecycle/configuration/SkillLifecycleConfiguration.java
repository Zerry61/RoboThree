package com.robothree.central.skilllifecycle.configuration;

import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.skilllifecycle.application.SkillLifecycleAuthority;
import com.robothree.central.skilllifecycle.application.AdminSkillDraftTestService;
import com.robothree.central.skilllifecycle.application.SkillArchiveAdmission;
import com.robothree.central.skilllifecycle.application.SkillLifecycleProjectionService;
import com.robothree.central.skilllifecycle.application.SkillLifecycleStore;
import com.robothree.central.skilllifecycle.application.InternalTrialSkillLifecycleTokenAuthorizer;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile({"development", "test"})
@ConditionalOnProperty(
        name = "robothree.skill-lifecycle.internal-trial-enabled",
        havingValue = "true")
public class SkillLifecycleConfiguration {
    @Bean
    Clock skillLifecycleClock() {
        return Clock.systemUTC();
    }

    @Bean
    InternalTrialSkillLifecycleTokenAuthorizer skillLifecycleTokenAuthorizer(
            @Value("${robothree.skill-lifecycle.token-hmac-key-base64}") String key,
            @Qualifier("skillLifecycleClock") Clock clock) {
        return new InternalTrialSkillLifecycleTokenAuthorizer(key, clock);
    }

    @Bean
    SkillLifecycleAuthority skillLifecycleAuthority(
            SkillLifecycleStore store,
            CentralTransactionRunner transactions,
            @Qualifier("skillLifecycleClock") Clock clock) {
        return new SkillLifecycleAuthority(store, transactions, clock);
    }

    @Bean
    SkillArchiveAdmission skillArchiveAdmission(
            @Qualifier("skillLifecycleClock") Clock clock) {
        return new SkillArchiveAdmission(clock);
    }

    @Bean
    SkillLifecycleProjectionService skillLifecycleProjectionService(SkillLifecycleStore store) {
        return new SkillLifecycleProjectionService(store);
    }

    @Bean
    AdminSkillDraftTestService adminSkillDraftTestService(
            SkillLifecycleStore store,
            CentralTransactionRunner transactions,
            @Qualifier("skillLifecycleClock") Clock clock,
            SkillLifecycleProjectionService projections) {
        return new AdminSkillDraftTestService(store, transactions, clock, projections);
    }
}
