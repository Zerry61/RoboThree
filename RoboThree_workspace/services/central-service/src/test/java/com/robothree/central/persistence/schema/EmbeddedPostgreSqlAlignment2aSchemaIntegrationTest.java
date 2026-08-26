package com.robothree.central.persistence.schema;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.core.read.ListAppender;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.slf4j.LoggerFactory;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationHandler;
import io.micrometer.observation.ObservationRegistry;

@EnabledOnOs(OS.MAC)
@EnabledIfSystemProperty(named = "os.arch", matches = "aarch64|arm64")
class EmbeddedPostgreSqlAlignment2aSchemaIntegrationTest {

    private Logger mapperLogger;
    private Level previousLevel;
    private ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> mapperAppender;

    @Test
    void executesFreshBridgeAndStructuralEquivalenceOnPostgresql16() throws IOException {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            Alignment2aSchemaConformance.verify(postgres.getPostgresDatabase());
        }
    }

    @Test
    void rollsBackNamedInstallerFailuresAndRejectsConflicts() throws IOException {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            Alignment2aSchemaConformance.verifyInstallerFailures(postgres.getPostgresDatabase());
        }
    }

    @Test
    void keepsSchemaSqlAndParametersOutOfLogsAndTrace() throws IOException {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            new SchemaTestInstaller().installFresh(dataSource);
            String sentinel = "credential-secret-table";
            mapperAppender = new ListAppender<>();
            mapperAppender.start();
            mapperLogger = (Logger) LoggerFactory.getLogger("org.apache.ibatis");
            previousLevel = mapperLogger.getLevel();
            mapperLogger.setLevel(Level.TRACE);
            mapperLogger.addAppender(mapperAppender);

            AtomicReference<String> trace = new AtomicReference<>("");
            ObservationRegistry registry = ObservationRegistry.create();
            registry.observationConfig().observationHandler(
                    new ObservationHandler<Observation.Context>() {
                        @Override
                        public void onStop(Observation.Context context) {
                            trace.set(context.getAllKeyValues().toString());
                        }

                        @Override
                        public boolean supportsContext(Observation.Context context) {
                            return true;
                        }
                    });
            Observation observation =
                    Observation.start("robothree.central.schema.preflight", registry);
            try (Observation.Scope ignored = observation.openScope();
                    SchemaMapperTestSession session = SchemaMapperTestSession.open(dataSource)) {
                assertThat(session.mapper().countTable(sentinel)).isZero();
            } finally {
                observation.stop();
            }

            String capturedLogs = mapperAppender.list.stream()
                    .map(event -> event.getFormattedMessage())
                    .reduce("", (left, right) -> left + "\n" + right);
            assertThat(capturedLogs)
                    .doesNotContain(sentinel)
                    .doesNotContain("SELECT")
                    .doesNotContain("robothree_schema_version");
            assertThat(trace.get())
                    .doesNotContain(sentinel)
                    .doesNotContain("SELECT")
                    .doesNotContain("robothree_schema_version");
        }
    }

    @AfterEach
    void restoreLogger() {
        if (mapperLogger != null) {
            mapperLogger.detachAppender(mapperAppender);
            mapperLogger.setLevel(previousLevel);
        }
    }
}
