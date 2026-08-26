package com.robothree.central.cluster;

import com.robothree.central.authentication.adapter.security.Es256DeviceProofVerifier;
import com.robothree.central.authentication.adapter.security.SecureAuthenticationEntropySource;
import com.robothree.central.authentication.application.AccessTokenSecurityPolicy;
import com.robothree.central.authentication.application.AuthenticationSecurityPolicy;
import com.robothree.central.authentication.application.DefaultEnterpriseDeviceTrustProvider;
import com.robothree.central.authentication.application.FrozenCompatibilityEvaluator;
import com.robothree.central.authentication.application.IssueDeviceChallengeService;
import com.robothree.central.authentication.application.ManualDeviceEnrollmentService;
import com.robothree.central.authentication.application.RoboThreeAccessTokenService;
import com.robothree.central.authentication.application.RoboThreeAccessTokenValidator;
import com.robothree.central.authentication.domain.EnterpriseCompatibility;
import com.robothree.central.authentication.port.AuthenticationEntropySource;
import com.robothree.central.authentication.port.CompatibilityEvaluator;
import com.robothree.central.authentication.port.DeviceProofVerifier;
import com.robothree.central.authentication.port.EnterpriseDeviceTrustProvider;
import com.robothree.central.authentication.port.RoboThreeAccessTokenCodec;
import com.robothree.central.bootstrap.production.CentralProductionReadinessVerifier;
import com.robothree.central.configuration.application.ConfigurationIntegrityVerifier;
import com.robothree.central.configuration.application.ConfigurationReadService;
import com.robothree.central.configuration.application.TrustedConfigurationSeeder;
import com.robothree.central.credentials.port.EnterpriseSecretStore;
import com.robothree.central.persistence.mybatis.adapter.MyBatisAuthenticationPersistence;
import com.robothree.central.persistence.mybatis.adapter.MyBatisConfigurationPersistence;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import javax.sql.DataSource;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

@TestConfiguration(proxyBeanMethods = false)
@Profile("cluster-harness")
public class ClusterHarnessConfiguration {

    @Bean(destroyMethod = "close")
    HikariDataSource clusterHarnessDataSource(Environment environment) {
        String nodeId = required(environment, "ROBOTHREE_CLUSTER_NODE_ID");
        HikariConfig configuration = new HikariConfig();
        configuration.setJdbcUrl(required(environment, "ROBOTHREE_CLUSTER_JDBC_URL"));
        configuration.setUsername(required(environment, "ROBOTHREE_CLUSTER_DB_USER"));
        configuration.setPassword(required(environment, "ROBOTHREE_CLUSTER_DB_PASSWORD"));
        configuration.setPoolName("robothree-cluster-" + nodeId);
        configuration.setMaximumPoolSize(4);
        configuration.setMinimumIdle(0);
        configuration.setInitializationFailTimeout(10_000);
        configuration.setConnectionTimeout(5_000);
        configuration.addDataSourceProperty(
                "ApplicationName",
                "robothree-cluster-" + nodeId);
        configuration.addDataSourceProperty("connectTimeout", "2");
        configuration.addDataSourceProperty("socketTimeout", "2");
        return new HikariDataSource(configuration);
    }

    @Bean
    PlatformTransactionManager clusterHarnessTransactionManager(
            DataSource dataSource) {
        return new DataSourceTransactionManager(dataSource);
    }

    @Bean
    Clock clusterHarnessClock() {
        return Clock.systemUTC();
    }

    @Bean
    AuthenticationEntropySource clusterHarnessEntropy() {
        return new SecureAuthenticationEntropySource();
    }

    @Bean
    EnterpriseDeviceTrustProvider clusterHarnessDeviceTrust() {
        return new DefaultEnterpriseDeviceTrustProvider();
    }

    @Bean
    DeviceProofVerifier clusterHarnessDeviceProofVerifier() {
        return new Es256DeviceProofVerifier();
    }

    @Bean
    EnterpriseSecretStore clusterHarnessSecretStore() {
        return new EnterpriseSecretStore() {
            @Override
            public TokenSigningKeyHandle resolveTokenSigningKeyHandle() {
                return new TokenSigningKeyHandle(
                        ClusterHarnessTokenCodec.SIGNING_HANDLE);
            }

            @Override
            public TokenVerificationKeyHandle resolveTokenVerificationKeyHandle() {
                return new TokenVerificationKeyHandle(
                        ClusterHarnessTokenCodec.VERIFICATION_HANDLE);
            }
        };
    }

    @Bean
    RoboThreeAccessTokenCodec clusterHarnessTokenCodec(
            Environment environment) {
        return new ClusterHarnessTokenCodec(
                required(environment, "ROBOTHREE_CLUSTER_TOKEN_KEY"));
    }

    @Bean
    CompatibilityEvaluator clusterHarnessCompatibility(
            Environment environment) {
        String clientInstanceId =
                required(environment, "ROBOTHREE_CLUSTER_CLIENT_INSTANCE_ID");
        return new FrozenCompatibilityEvaluator(
                new EnterpriseCompatibility(
                        "v1alpha1",
                        "0.0.0-cja.2b.2",
                        List.of("v1alpha1"),
                        "0.0.0-dcf.1.0",
                        "0.0.0-dcf.1.0",
                        List.of(
                                "configuration_snapshot",
                                "fixed_permissions",
                                "enterprise_identity",
                                "managed_device_trust"),
                        "available",
                        List.of("v1alpha1"),
                        1),
                Set.of(clientInstanceId));
    }

    @Bean
    IssueDeviceChallengeService clusterHarnessChallengeService(
            MyBatisAuthenticationPersistence persistence,
            EnterpriseDeviceTrustProvider deviceTrust,
            AuthenticationEntropySource entropy,
            Clock clock) {
        return new IssueDeviceChallengeService(
                persistence,
                persistence,
                persistence,
                persistence,
                deviceTrust,
                entropy,
                clock,
                AuthenticationSecurityPolicy.alphaDefaults());
    }

    @Bean
    ManualDeviceEnrollmentService clusterHarnessEnrollmentService(
            MyBatisAuthenticationPersistence persistence,
            DeviceProofVerifier proofVerifier,
            SpringCentralTransactionRunner transactions,
            AuthenticationEntropySource entropy,
            Clock clock) {
        return new ManualDeviceEnrollmentService(
                persistence,
                persistence,
                persistence,
                persistence,
                proofVerifier,
                transactions,
                entropy,
                clock,
                AuthenticationSecurityPolicy.alphaDefaults());
    }

    @Bean
    RoboThreeAccessTokenService clusterHarnessAccessTokenService(
            MyBatisAuthenticationPersistence persistence,
            EnterpriseDeviceTrustProvider deviceTrust,
            DeviceProofVerifier proofVerifier,
            CompatibilityEvaluator compatibility,
            RoboThreeAccessTokenCodec tokenCodec,
            EnterpriseSecretStore secretStore,
            SpringCentralTransactionRunner transactions,
            AuthenticationEntropySource entropy,
            Clock clock) {
        return new RoboThreeAccessTokenService(
                persistence,
                persistence,
                persistence,
                persistence,
                persistence,
                deviceTrust,
                proofVerifier,
                compatibility,
                tokenCodec,
                secretStore,
                transactions,
                entropy,
                clock,
                AccessTokenSecurityPolicy.alphaDefaults());
    }

    @Bean
    RoboThreeAccessTokenValidator clusterHarnessAccessTokenValidator(
            RoboThreeAccessTokenCodec tokenCodec,
            EnterpriseSecretStore secretStore,
            MyBatisAuthenticationPersistence persistence,
            Clock clock) {
        return new RoboThreeAccessTokenValidator(
                tokenCodec,
                secretStore,
                persistence,
                clock,
                AccessTokenSecurityPolicy.alphaDefaults());
    }

    @Bean
    ConfigurationIntegrityVerifier clusterHarnessIntegrityVerifier(
            MyBatisConfigurationPersistence persistence) {
        return new ConfigurationIntegrityVerifier(persistence);
    }

    @Bean
    TrustedConfigurationSeeder clusterHarnessConfigurationSeeder(
            MyBatisConfigurationPersistence persistence,
            SpringCentralTransactionRunner transactions,
            ConfigurationIntegrityVerifier integrityVerifier) {
        return new TrustedConfigurationSeeder(
                persistence,
                persistence,
                transactions,
                integrityVerifier);
    }

    @Bean
    ConfigurationReadService clusterHarnessConfigurationReadService(
            RoboThreeAccessTokenValidator tokenValidator,
            MyBatisConfigurationPersistence persistence,
            ConfigurationIntegrityVerifier integrityVerifier,
            Clock clock) {
        return new ConfigurationReadService(
                new com.robothree.central.authentication.application
                        .LegacyBearerAuthorizerAdapter(tokenValidator),
                persistence,
                integrityVerifier,
                clock);
    }

    @Bean
    CentralProductionReadinessVerifier clusterHarnessReadinessVerifier(
            ListableBeanFactory beanFactory) {
        return new CentralProductionReadinessVerifier(beanFactory);
    }

    @Bean
    ClusterHarnessApplicationService clusterHarnessApplicationService(
            Environment environment,
            MyBatisAuthenticationPersistence authenticationPersistence,
            SpringCentralTransactionRunner transactions,
            TrustedConfigurationSeeder configurationSeeder,
            CentralProductionReadinessVerifier readinessVerifier,
            HikariDataSource dataSource) {
        return new ClusterHarnessApplicationService(
                required(environment, "ROBOTHREE_CLUSTER_NODE_ID"),
                authenticationPersistence,
                authenticationPersistence,
                authenticationPersistence,
                transactions,
                configurationSeeder,
                readinessVerifier,
                dataSource);
    }

    @Bean
    SmartInitializingSingleton clusterHarnessSeedGate(
            Environment environment,
            ClusterHarnessApplicationService application) {
        Instant seedInstant = Instant.parse(
                required(environment, "ROBOTHREE_CLUSTER_SEED_INSTANT"));
        String deviceKeyId =
                required(environment, "ROBOTHREE_CLUSTER_DEVICE_KEY_ID");
        String publicKey =
                required(environment, "ROBOTHREE_CLUSTER_DEVICE_PUBLIC_KEY");
        return () -> application.seed(seedInstant, deviceKeyId, publicKey);
    }

    private static String required(Environment environment, String name) {
        String value = environment.getProperty(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "cluster harness environment is incomplete: " + name);
        }
        return value;
    }
}
