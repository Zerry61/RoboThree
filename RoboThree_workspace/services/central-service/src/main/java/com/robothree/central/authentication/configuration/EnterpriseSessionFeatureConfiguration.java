package com.robothree.central.authentication.configuration;

import com.robothree.central.bootstrap.production.CentralProductionStartupException;
import java.util.Set;
import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
public class EnterpriseSessionFeatureConfiguration {

    @Bean
    EnterpriseSessionFeatureState enterpriseSessionFeatureState(Environment environment) {
        String raw = environment.getProperty("robothree.enterprise-session.enabled", "false");
        if (!Set.of("true", "false").contains(raw)) {
            throw new CentralProductionStartupException(
                    "central.enterprise_session_property_invalid",
                    "Enterprise Session enabled property must be true or false");
        }
        return new EnterpriseSessionFeatureState(Boolean.parseBoolean(raw));
    }

    @Bean
    EnterpriseSessionFeatureStartupGate enterpriseSessionFeatureStartupGate(
            ListableBeanFactory beanFactory,
            EnterpriseSessionFeatureState state,
            Environment environment) {
        return new EnterpriseSessionFeatureStartupGate(
                beanFactory,
                state,
                environment.matchesProfiles("production"));
    }

    @Bean
    SmartInitializingSingleton enterpriseSessionFeatureStartupValidation(
            EnterpriseSessionFeatureStartupGate gate) {
        return gate::validate;
    }
}
