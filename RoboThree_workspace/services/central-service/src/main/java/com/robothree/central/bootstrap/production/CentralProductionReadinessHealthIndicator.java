package com.robothree.central.bootstrap.production;

import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;

public final class CentralProductionReadinessHealthIndicator implements HealthIndicator {

    private final ProductionDependencyValidator dependencyValidator;
    private final CentralProductionReadinessVerifier readinessVerifier;

    public CentralProductionReadinessHealthIndicator(
            ProductionDependencyValidator dependencyValidator,
            CentralProductionReadinessVerifier readinessVerifier) {
        this.dependencyValidator = dependencyValidator;
        this.readinessVerifier = readinessVerifier;
    }

    @Override
    public Health health() {
        try {
            dependencyValidator.validate();
            readinessVerifier.validate();
            return Health.up()
                    .withDetail("manifestVersion", ProductionDependencyManifest.VERSION)
                    .build();
        } catch (CentralProductionStartupException exception) {
            return Health.down()
                    .withDetail("errorCode", exception.code())
                    .build();
        }
    }
}
