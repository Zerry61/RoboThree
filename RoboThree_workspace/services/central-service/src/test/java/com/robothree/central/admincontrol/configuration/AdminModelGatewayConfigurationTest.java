package com.robothree.central.admincontrol.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import com.robothree.central.admincontrol.application.AdminManagedModelCredentialMaterialSource;
import com.robothree.central.admincontrol.application.AdminManagedModelGatewaySource;
import com.robothree.central.admincontrol.application.AdminModelCredentialCipher;
import com.robothree.central.admincontrol.application.AdminModelStore;
import com.robothree.central.authentication.port.EnterpriseBearerAuthorizer;
import com.robothree.central.modelgateway.application.ModelInvocationGatewayService;
import com.robothree.central.modelgateway.application.ModelInvocationRuntime;
import com.robothree.central.persistence.mybatis.adapter.MyBatisModelInvocationPersistence;
import com.robothree.central.persistence.mybatis.mapper.ModelInvocationPersistenceMapper;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import java.lang.reflect.Proxy;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Base64;
import java.util.Optional;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

final class AdminModelGatewayConfigurationTest {

    @Test
    void installsTheCompleteInternalTrialGatewayOnlyWhenExplicitlyEnabled() {
        var runner = baseRunner();

        runner.run(context -> {
            assertThat(context).doesNotHaveBean(ModelInvocationRuntime.class);
            assertThat(context).doesNotHaveBean(ModelInvocationGatewayService.class);
        });

        runner.withPropertyValues(
                        "robothree.admin-api.internal-trial-model-gateway-enabled=true")
                .run(context -> {
                    assertThat(context).hasSingleBean(ModelInvocationRuntime.class);
                    assertThat(context).hasSingleBean(ModelInvocationGatewayService.class);
                });
    }

    private static ApplicationContextRunner baseRunner() {
        Clock clock = Clock.systemUTC();
        AdminModelStore store = noOpProxy(AdminModelStore.class);
        var cipher = new AdminModelCredentialCipher(
                Base64.getEncoder().encodeToString(new byte[32]),
                new SecureRandom(),
                clock);
        return new ApplicationContextRunner()
                .withPropertyValues("spring.profiles.active=test")
                .withUserConfiguration(AdminModelGatewayConfiguration.class)
                .withBean(Clock.class, () -> clock)
                .withBean(AdminModelStore.class, () -> store)
                .withBean(AdminManagedModelGatewaySource.class,
                        () -> new AdminManagedModelGatewaySource(store, clock))
                .withBean(AdminManagedModelCredentialMaterialSource.class,
                        () -> new AdminManagedModelCredentialMaterialSource(store, cipher))
                .withBean(MyBatisModelInvocationPersistence.class,
                        () -> new MyBatisModelInvocationPersistence(
                                noOpProxy(ModelInvocationPersistenceMapper.class)))
                .withBean(CentralTransactionRunner.class,
                        () -> new CentralTransactionRunner() {
                            @Override
                            public <T> T required(Supplier<T> work) {
                                return work.get();
                            }
                        })
                .withBean(EnterpriseBearerAuthorizer.class,
                        () -> (compactToken, requiredPermission, now) ->
                                new com.robothree.central.authentication.domain
                                        .EnterpriseBearerAuthorizationResult.Unavailable(
                                                "test_authorizer_unavailable"));
    }

    @SuppressWarnings("unchecked")
    private static <T> T noOpProxy(Class<T> type) {
        return (T) Proxy.newProxyInstance(
                type.getClassLoader(),
                new Class<?>[] {type},
                (proxy, method, arguments) -> {
                    if (method.getReturnType().equals(Optional.class)) {
                        return Optional.empty();
                    }
                    if (method.getReturnType().equals(int.class)) {
                        return 0;
                    }
                    if (method.getReturnType().equals(long.class)) {
                        return 0L;
                    }
                    if (method.getReturnType().equals(boolean.class)) {
                        return false;
                    }
                    return null;
                });
    }
}
