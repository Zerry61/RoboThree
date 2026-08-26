package com.robothree.central.authentication.configuration;

import com.robothree.central.authentication.application.CompositeEnterpriseBearerAuthorizer;
import com.robothree.central.authentication.application.EnterpriseSessionTokenValidator;
import com.robothree.central.authentication.application.LegacyBearerAuthorizerAdapter;
import com.robothree.central.authentication.application.RoboThreeAccessTokenValidator;
import com.robothree.central.authentication.port.EnterpriseBearerAuthorizer;
import com.robothree.central.authentication.port.EnterpriseSessionPersistence;
import com.robothree.central.authentication.port.EnterpriseSessionTokenCodec;
import com.robothree.central.authentication.port.EnterpriseSessionVerificationKeyHandleProvider;
import com.robothree.central.authentication.application.AccessTokenSecurityPolicy;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration(proxyBeanMethods = false)
public class EnterpriseBearerAuthorizationConfiguration {

    @Bean
    @ConditionalOnBean(RoboThreeAccessTokenValidator.class)
    LegacyBearerAuthorizerAdapter legacyBearerAuthorizerAdapter(
            RoboThreeAccessTokenValidator validator) {
        return new LegacyBearerAuthorizerAdapter(validator);
    }

    @Bean
    @ConditionalOnProperty(
            name = "robothree.enterprise-session.enabled",
            havingValue = "true")
    @ConditionalOnBean({
        EnterpriseSessionTokenCodec.class,
        EnterpriseSessionVerificationKeyHandleProvider.class,
        EnterpriseSessionPersistence.class,
        AccessTokenSecurityPolicy.class
    })
    EnterpriseSessionTokenValidator enterpriseSessionTokenValidator(
            EnterpriseSessionTokenCodec codec,
            EnterpriseSessionVerificationKeyHandleProvider verificationKeys,
            EnterpriseSessionPersistence sessions,
            AccessTokenSecurityPolicy policy) {
        return new EnterpriseSessionTokenValidator(codec, verificationKeys, sessions, policy);
    }

    @Bean
    @Primary
    @ConditionalOnBean(LegacyBearerAuthorizerAdapter.class)
    CompositeEnterpriseBearerAuthorizer enterpriseBearerAuthorizer(
            LegacyBearerAuthorizerAdapter legacy,
            ObjectProvider<EnterpriseSessionTokenValidator> session) {
        List<EnterpriseBearerAuthorizer> branches = new ArrayList<>();
        branches.add(legacy);
        session.ifAvailable(branches::add);
        return new CompositeEnterpriseBearerAuthorizer(branches);
    }
}
