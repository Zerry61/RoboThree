package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.persistence.schema.Alignment2aSchemaTestAccess;
import com.robothree.central.persistence.mybatis.adapter.MyBatisModelInvocationPersistence;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.IOException;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.springframework.jdbc.core.JdbcTemplate;

@EnabledOnOs(OS.MAC)
@EnabledIfSystemProperty(named = "os.arch", matches = "aarch64|arm64")
class EmbeddedPostgreSqlMyBatisPersistenceIntegrationTest {

    @Test
    void matchesEnterpriseSessionPersistenceAndRejectsDurableTampering()
            throws IOException {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
            CentralPersistenceVariants.MyBatisContext context =
                    CentralPersistenceVariants.openMyBatis(dataSource);
            EnterpriseSessionPersistenceConformance.verify(
                    EnterpriseSessionPersistenceConformance.harness(
                            context.enterpriseSessions(),
                            context.harness().identities(),
                            context.harness().devices(),
                            new SpringCentralTransactionRunner(context.transactionManager())));

            var reconstructed = CentralPersistenceVariants.openMyBatis(dataSource);
            assertThat(reconstructed.enterpriseSessions().loadLeaseByTokenId(
                            EnterpriseSessionPersistenceFixtures.TOKEN_ID))
                    .contains(EnterpriseSessionPersistenceFixtures.lease());

            JdbcTemplate jdbc = new JdbcTemplate(dataSource);
            jdbc.update(
                    "UPDATE enterprise_session_challenge_binding "
                            + "SET record_digest = repeat('d', 64) WHERE challenge_id = ?",
                    EnterpriseSessionPersistenceFixtures.CHALLENGE_ID);
            assertThatThrownBy(() -> reconstructed.enterpriseSessions().loadChallengeById(
                            EnterpriseSessionPersistenceFixtures.CHALLENGE_ID))
                    .isInstanceOf(PersistenceIntegrityException.class)
                    .extracting("code")
                    .isEqualTo("persistence.enterprise_session_binding_corrupt");
            jdbc.update(
                    "UPDATE enterprise_session_challenge_binding SET record_digest = ? "
                            + "WHERE challenge_id = ?",
                    EnterpriseSessionPersistenceFixtures.binding().recordDigest(),
                    EnterpriseSessionPersistenceFixtures.CHALLENGE_ID);

            jdbc.update(
                    "UPDATE enterprise_session_lease_issuance "
                            + "SET session_assertion_json = '{ \"kind\": \"drift\" }' "
                            + "WHERE token_id = ?",
                    EnterpriseSessionPersistenceFixtures.TOKEN_ID);
            assertThatThrownBy(() -> reconstructed.enterpriseSessions().loadLeaseByTokenId(
                            EnterpriseSessionPersistenceFixtures.TOKEN_ID))
                    .isInstanceOf(PersistenceIntegrityException.class)
                    .extracting("code")
                    .isEqualTo("persistence.enterprise_session_lease_corrupt");
        }
    }

    @Test
    void matchesPersistenceAndTransactionConformance() throws IOException {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
            CentralPersistenceConformance.verify(
                    CentralPersistenceVariants.myBatis(dataSource));
            MyBatisTransactionConformance.verify(dataSource);
        }
    }

    @Test
    void matchesModelInvocationPersistenceConformance() throws IOException {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
            CentralPersistenceVariants.MyBatisContext context =
                    CentralPersistenceVariants.openMyBatis(dataSource);
            ModelInvocationPersistenceConformance.verify(
                    ModelInvocationPersistenceConformance.harness(
                            context.modelInvocations(),
                            context.modelInvocations(),
                            context.modelInvocations(),
                            context.modelInvocations(),
                            new SpringCentralTransactionRunner(
                                    context.transactionManager())));
        }
    }

    @Test
    void serializesConcurrentModelInvocationAccepts() throws Exception {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
            ModelInvocationPersistenceConformance.verifyConcurrentAccept(
                    CentralPersistenceVariants.openMyBatis(dataSource).modelInvocations());
        }
    }

    @Test
    void persistsTheCgf2a2ApplicationRuntimeAcrossAdapterReconstruction()
            throws IOException {
        try (EmbeddedPostgres postgres =
                EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
            ModelInvocationRuntimePersistenceConformance.verify(
                    CentralPersistenceVariants.openMyBatis(dataSource),
                    CentralPersistenceVariants.openMyBatis(dataSource));
        }
    }

    @Test
    void matchesPromptCachePersistenceConformance() throws IOException {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
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
    }

    @Test
    void recoversAndReplaysWithReconstructedMyBatisAdapters() throws IOException {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
            Cgf11dPostgreSqlRecoveryConformance.verify(
                    dataSource,
                    CentralPersistenceVariants::myBatis);
        }
    }

    @Test
    void replaysTwentyEnrollmentAttemptsIdempotently() throws IOException {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);
            DeviceEnrollmentRecoveryConformance.verify(
                    dataSource,
                    CentralPersistenceVariants::myBatis);
        }
    }

    @Test
    void wiresTheProductionMyBatisConfigurationAfterSchemaPreflight() throws IOException {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Alignment2aSchemaTestAccess.installFreshAndValidate(dataSource);

            CentralMyBatisProductionConfigurationConformance.verify(dataSource);
        }
    }
}
