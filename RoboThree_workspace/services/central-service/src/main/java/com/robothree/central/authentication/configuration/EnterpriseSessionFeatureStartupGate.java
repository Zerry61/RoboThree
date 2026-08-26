package com.robothree.central.authentication.configuration;

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
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.beans.factory.ListableBeanFactory;

/** Fails startup before HTTP readiness when Session activation was requested incompletely. */
public final class EnterpriseSessionFeatureStartupGate {

    private final ListableBeanFactory beanFactory;
    private final EnterpriseSessionFeatureState state;
    private final boolean productionProfile;

    public EnterpriseSessionFeatureStartupGate(
            ListableBeanFactory beanFactory,
            EnterpriseSessionFeatureState state,
            boolean productionProfile) {
        this.beanFactory = Objects.requireNonNull(beanFactory, "beanFactory");
        this.state = Objects.requireNonNull(state, "state");
        this.productionProfile = productionProfile;
    }

    public void validate() {
        if (!state.requested()) return;
        for (Class<?> type : requiredTypes()) {
            String[] names = beanFactory.getBeanNamesForType(type, false, false);
            if (names.length == 0) {
                throw startup(
                        "central.enterprise_session_dependency_missing",
                        "required Enterprise Session dependency is unavailable");
            }
            if (names.length != 1) {
                throw startup(
                        "central.enterprise_session_dependency_ambiguous",
                        "required Enterprise Session dependency is ambiguous");
            }
            if (productionProfile) rejectNonProduction(type, names[0]);
        }
    }

    private void rejectNonProduction(Class<?> contract, String beanName) {
        Class<?> implementation = beanFactory.getType(beanName, false);
        if (implementation == null) {
            throw startup(
                    "central.enterprise_session_dependency_unresolved",
                    "Enterprise Session dependency type is unresolved");
        }
        String qualified = implementation.getName().toLowerCase(Locale.ROOT);
        String simple = implementation.getSimpleName().toLowerCase(Locale.ROOT);
        boolean forbidden = qualified.contains(".support.")
                || qualified.contains(".test.")
                || qualified.contains(".persistence.memory.")
                || simple.startsWith("fake")
                || simple.startsWith("fixed")
                || simple.startsWith("inmemory")
                || simple.contains("deterministic")
                || simple.contains("development");
        if (forbidden) {
            throw startup(
                    "central.enterprise_session_non_production_dependency",
                    "non-production Enterprise Session dependency is present: "
                            + contract.getSimpleName());
        }
    }

    private static List<Class<?>> requiredTypes() {
        return List.of(
                VerifiedIdentityHandleResolver.class,
                EnterpriseSessionTokenCodec.class,
                EnterpriseSessionSigningKeyHandleProvider.class,
                EnterpriseSessionVerificationKeyHandleProvider.class,
                EnterpriseSessionPersistence.class,
                IssueEnterpriseSessionChallengeService.class,
                IssueEnterpriseSessionLeaseService.class,
                EnterpriseSessionTokenValidator.class,
                CompositeEnterpriseBearerAuthorizer.class);
    }

    private static CentralProductionStartupException startup(String code, String message) {
        return new CentralProductionStartupException(code, message);
    }
}
