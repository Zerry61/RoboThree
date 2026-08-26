package com.robothree.central.authentication.configuration;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.authentication.application.CompositeEnterpriseBearerAuthorizer;
import com.robothree.central.authentication.application.EnterpriseSessionTokenValidator;
import com.robothree.central.authentication.application.IssueEnterpriseSessionChallengeService;
import com.robothree.central.authentication.application.IssueEnterpriseSessionLeaseService;
import com.robothree.central.authentication.port.EnterpriseSessionPersistence;
import com.robothree.central.authentication.port.EnterpriseSessionSigningKeyHandleProvider;
import com.robothree.central.authentication.port.EnterpriseSessionTokenCodec;
import com.robothree.central.authentication.port.EnterpriseSessionVerificationKeyHandleProvider;
import com.robothree.central.authentication.port.VerifiedIdentityHandleResolver;
import com.robothree.central.bootstrap.production.CentralProductionStartupException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.beans.factory.support.RootBeanDefinition;

class EnterpriseSessionFeatureStartupGateTest {

    @Test
    void disabledDoesNotRequireOrCreateSessionDependencies() {
        var beans = new DefaultListableBeanFactory();
        var gate = new EnterpriseSessionFeatureStartupGate(
                beans, new EnterpriseSessionFeatureState(false), true);
        assertThatCode(gate::validate).doesNotThrowAnyException();
        org.assertj.core.api.Assertions.assertThat(beans.getBeanDefinitionCount()).isZero();
    }

    @Test
    void requestedFeatureFailsBeforeReadyWhenAnyDependencyIsMissing() {
        var gate = new EnterpriseSessionFeatureStartupGate(
                completeBeans(false), new EnterpriseSessionFeatureState(true), false);
        assertThatThrownBy(gate::validate)
                .isInstanceOf(CentralProductionStartupException.class)
                .extracting("code")
                .isEqualTo("central.enterprise_session_dependency_missing");
    }

    @Test
    void requestedFeatureRejectsAmbiguousDependencies() {
        var beans = completeBeans(true);
        beans.registerBeanDefinition("secondCodec", new RootBeanDefinition(EnterpriseSessionTokenCodec.class));
        var gate = new EnterpriseSessionFeatureStartupGate(
                beans, new EnterpriseSessionFeatureState(true), false);
        assertThatThrownBy(gate::validate)
                .isInstanceOf(CentralProductionStartupException.class)
                .extracting("code")
                .isEqualTo("central.enterprise_session_dependency_ambiguous");
    }

    @Test
    void completeNonProductionHarnessCanProveTheCardinalityContract() {
        var gate = new EnterpriseSessionFeatureStartupGate(
                completeBeans(true), new EnterpriseSessionFeatureState(true), false);
        assertThatCode(gate::validate).doesNotThrowAnyException();
    }

    private static DefaultListableBeanFactory completeBeans(boolean includeResolver) {
        var beans = new DefaultListableBeanFactory();
        if (includeResolver) {
            register(beans, "resolver", VerifiedIdentityHandleResolver.class);
        }
        register(beans, "codec", EnterpriseSessionTokenCodec.class);
        register(beans, "signing", EnterpriseSessionSigningKeyHandleProvider.class);
        register(beans, "verification", EnterpriseSessionVerificationKeyHandleProvider.class);
        register(beans, "persistence", EnterpriseSessionPersistence.class);
        register(beans, "challengeService", IssueEnterpriseSessionChallengeService.class);
        register(beans, "leaseService", IssueEnterpriseSessionLeaseService.class);
        register(beans, "validator", EnterpriseSessionTokenValidator.class);
        register(beans, "composite", CompositeEnterpriseBearerAuthorizer.class);
        return beans;
    }

    private static void register(
            DefaultListableBeanFactory beans, String name, Class<?> beanType) {
        beans.registerBeanDefinition(name, new RootBeanDefinition(beanType));
    }
}
