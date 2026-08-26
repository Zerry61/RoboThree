package com.robothree.central.admincontrol.configuration;

import com.robothree.central.admincontrol.application.AdminCapabilityProjectionService;
import com.robothree.central.admincontrol.application.AdminPrincipalProvider;
import com.robothree.central.admincontrol.application.DevelopmentAdminPrincipalProvider;
import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
public class AdminCapabilityProjectionConfiguration {

    @Bean
    @Profile({"development", "test"})
    DevelopmentAdminPrincipalProvider developmentAdminPrincipalProvider() {
        return new DevelopmentAdminPrincipalProvider();
    }

    @Bean
    @Profile({"development", "test"})
    AdminCapabilityProjectionService adminCapabilityProjectionService(
            AdminPrincipalProvider principalProvider) {
        return new AdminCapabilityProjectionService(principalProvider);
    }

    @Bean
    AdminControlProductionGraphGuard adminControlProductionGraphGuard(
            ListableBeanFactory beanFactory,
            Environment environment) {
        return new AdminControlProductionGraphGuard(
                beanFactory,
                environment.matchesProfiles("production"));
    }

    @Bean
    SmartInitializingSingleton adminControlProductionGraphValidation(
            AdminControlProductionGraphGuard guard) {
        return guard::validate;
    }
}
