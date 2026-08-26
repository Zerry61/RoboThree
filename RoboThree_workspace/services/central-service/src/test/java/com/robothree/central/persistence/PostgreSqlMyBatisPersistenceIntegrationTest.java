package com.robothree.central.persistence;

import com.robothree.central.persistence.schema.Alignment2aSchemaTestAccess;
import com.robothree.central.persistence.mybatis.adapter.MyBatisModelInvocationPersistence;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import com.robothree.central.shared.observability.CentralObservationRunner;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationHandler;
import io.micrometer.observation.ObservationRegistry;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class PostgreSqlMyBatisPersistenceIntegrationTest {

    @Container
    private final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void matchesTheSharedPersistenceConformance() {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        CentralPersistenceConformance.verify(
                CentralPersistenceVariants.myBatis(dataSource));
    }

    @Test
    void matchesEnterpriseSessionPersistenceConformance() {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        CentralPersistenceVariants.MyBatisContext context =
                CentralPersistenceVariants.openMyBatis(dataSource);
        EnterpriseSessionPersistenceConformance.verify(
                EnterpriseSessionPersistenceConformance.harness(
                        context.enterpriseSessions(),
                        context.harness().identities(),
                        context.harness().devices(),
                        new SpringCentralTransactionRunner(context.transactionManager())));
    }

    @Test
    void rollsBackEnterpriseSessionAggregateWrites() {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        CentralPersistenceVariants.MyBatisContext context =
                CentralPersistenceVariants.openMyBatis(dataSource);
        EnterpriseSessionPersistenceConformance.verifyOuterRollback(
                EnterpriseSessionPersistenceConformance.harness(
                        context.enterpriseSessions(),
                        context.harness().identities(),
                        context.harness().devices(),
                        new SpringCentralTransactionRunner(context.transactionManager())));
    }

    @Test
    void supportsTransactionalEnterpriseSessionApplicationFlow() {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        CentralPersistenceVariants.MyBatisContext context =
                CentralPersistenceVariants.openMyBatis(dataSource);
        EnterpriseSessionTransactionalPersistenceConformance.verify(
                context.harness(),
                context.enterpriseSessions(),
                new SpringCentralTransactionRunner(context.transactionManager()));
    }

    @Test
    void matchesModelInvocationPersistenceConformance() {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        CentralPersistenceVariants.MyBatisContext context =
                CentralPersistenceVariants.openMyBatis(dataSource);
        ModelInvocationPersistenceConformance.verify(
                ModelInvocationPersistenceConformance.harness(
                        context.modelInvocations(),
                        context.modelInvocations(),
                        context.modelInvocations(),
                        context.modelInvocations(),
                        new SpringCentralTransactionRunner(context.transactionManager())));
    }

    @Test
    void serializesConcurrentModelInvocationAccepts() throws Exception {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        ModelInvocationPersistenceConformance.verifyConcurrentAccept(
                CentralPersistenceVariants.openMyBatis(dataSource).modelInvocations());
    }

    @Test
    void persistsTheCgf2a2ApplicationRuntimeAcrossAdapterReconstruction() {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        ModelInvocationRuntimePersistenceConformance.verify(
                CentralPersistenceVariants.openMyBatis(dataSource),
                CentralPersistenceVariants.openMyBatis(dataSource));
    }

    @Test
    void matchesPromptCachePersistenceConformance() {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        CentralPersistenceVariants.MyBatisContext context =
                CentralPersistenceVariants.openMyBatis(dataSource);
        MyBatisModelInvocationPersistence persistence = context.modelInvocations();
        PromptCachePersistenceConformance.verify(
                persistence,
                persistence,
                persistence,
                new SpringCentralTransactionRunner(context.transactionManager()));
    }

    @Test
    void recoversTheFullChainAndConcurrentConsumesAfterReconstruction() {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        Cgf11dPostgreSqlRecoveryConformance.verify(
                dataSource,
                CentralPersistenceVariants::myBatis);
    }

    @Test
    void sharesOneSpringTransactionConnectionForLockReadAndWrite() {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        MyBatisTransactionConformance.verify(dataSource);
    }

    @Test
    void replaysTwentyEnrollmentAttemptsIdempotently() {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        DeviceEnrollmentRecoveryConformance.verify(
                dataSource,
                CentralPersistenceVariants::myBatis);
    }

    @Test
    void wiresTheProductionMyBatisConfigurationAfterSchemaPreflight() {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);

        CentralMyBatisProductionConfigurationConformance.verify(dataSource);
    }

    @Test
    void failsProductionStartupWhenSchemaStructureDrifts() throws Exception {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        try (var connection = dataSource.getConnection();
                var statement = connection.createStatement()) {
            statement.execute(
                    "ALTER TABLE enterprise_verified_identity "
                            + "DROP COLUMN provider_subject_digest");
        }

        CentralMyBatisProductionConfigurationConformance.verifyPreflightFailsClosed(dataSource);
    }

    @Test
    void emitsOneSafeObservationAroundTheProductionTransactionRunner() {
        PGSimpleDataSource dataSource = dataSource();
        Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
        CentralPersistenceVariants.MyBatisContext context =
                CentralPersistenceVariants.openMyBatis(dataSource);
        AtomicReference<String> observed = new AtomicReference<>();
        ObservationRegistry registry = ObservationRegistry.create();
        registry.observationConfig().observationHandler(
                new ObservationHandler<Observation.Context>() {
                    @Override
                    public void onStop(Observation.Context observation) {
                        if ("robothree.central.jdbc.transaction".equals(
                                observation.getName())) {
                            observed.set(observation.getAllKeyValues().toString());
                        }
                    }

                    @Override
                    public boolean supportsContext(Observation.Context observation) {
                        return true;
                    }
                });
        SpringCentralTransactionRunner transactions =
                new SpringCentralTransactionRunner(
                        context.transactionManager(),
                        new CentralObservationRunner(registry));

        int backendPid = transactions.required(() -> context.sessions()
                .getMapper(MyBatisConnectionIdentityMapper.class)
                .currentBackendPid());

        org.assertj.core.api.Assertions.assertThat(backendPid).isPositive();
        org.assertj.core.api.Assertions.assertThat(observed.get())
                .contains("robothree.operation=jdbc_transaction")
                .contains("robothree.outcome=success")
                .doesNotContain("SELECT")
                .doesNotContain("backend");
    }

    private PGSimpleDataSource dataSource() {
        PGSimpleDataSource dataSource = new PGSimpleDataSource();
        dataSource.setURL(postgres.getJdbcUrl());
        dataSource.setUser(postgres.getUsername());
        dataSource.setPassword(postgres.getPassword());
        return dataSource;
    }
}
