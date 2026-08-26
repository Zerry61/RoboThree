package com.robothree.central.bootstrap.production;

import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile("production")
public class CentralProductionBootstrapConfiguration {

    @Bean
    ProductionDependencyManifest productionDependencyManifest() {
        return new ProductionDependencyManifest();
    }

    @Bean
    ProductionDependencyValidator productionDependencyValidator(
            ListableBeanFactory beanFactory,
            ProductionDependencyManifest manifest) {
        return new ProductionDependencyValidator(beanFactory, manifest);
    }

    @Bean
    CentralProductionReadinessVerifier centralProductionReadinessVerifier(
            ListableBeanFactory beanFactory) {
        return new CentralProductionReadinessVerifier(beanFactory);
    }

    @Bean
    CentralProductionReadinessHealthIndicator centralProductionReadinessHealthIndicator(
            ProductionDependencyValidator dependencyValidator,
            CentralProductionReadinessVerifier readinessVerifier) {
        return new CentralProductionReadinessHealthIndicator(
                dependencyValidator, readinessVerifier);
    }

    @Bean
    SmartInitializingSingleton centralProductionStartupGate(
            ProductionDependencyValidator dependencyValidator,
            CentralProductionReadinessVerifier readinessVerifier) {
        return () -> {
            dependencyValidator.validate();
            readinessVerifier.validate();
        };
    }
}
