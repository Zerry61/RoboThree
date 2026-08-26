package com.robothree.central.persistence.schema;

import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class PostgreSqlAlignment2aSchemaIntegrationTest {

    @Container
    private final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void executesFreshBridgeAndStructuralEquivalenceOnPostgresql16() {
        Alignment2aSchemaConformance.verify(dataSource());
    }

    @Test
    void rollsBackNamedInstallerFailuresAndRejectsConflicts() {
        Alignment2aSchemaConformance.verifyInstallerFailures(dataSource());
    }

    @Test
    void failsClosedForSchemaAndLedgerDrift() {
        Alignment2aSchemaConformance.verifyPreflightFailures(dataSource());
    }

    @Test
    void rejectsOlderNewerMissingCorruptAndStructurallyIncompleteFlywayHistory() {
        Alignment2aSchemaConformance.verifyBridgeFailures(dataSource());
    }

    private PGSimpleDataSource dataSource() {
        PGSimpleDataSource dataSource = new PGSimpleDataSource();
        dataSource.setURL(postgres.getJdbcUrl());
        dataSource.setUser(postgres.getUsername());
        dataSource.setPassword(postgres.getPassword());
        return dataSource;
    }
}
