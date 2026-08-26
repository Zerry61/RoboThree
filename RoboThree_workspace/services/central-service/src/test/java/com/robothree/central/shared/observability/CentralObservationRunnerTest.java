package com.robothree.central.shared.observability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationHandler;
import io.micrometer.observation.ObservationRegistry;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class CentralObservationRunnerTest {

    @Test
    void recordsOnlyFixedLowCardinalityOperationAndOutcome() {
        RecordingHandler handler = new RecordingHandler();
        ObservationRegistry registry = ObservationRegistry.create();
        registry.observationConfig().observationHandler(handler);
        CentralObservationRunner runner = new CentralObservationRunner(registry);

        String result = runner.observe(
                CentralObservedOperation.READ_CONFIGURATION,
                () -> "private-prompt-result");

        assertThat(result).isEqualTo("private-prompt-result");
        assertThat(handler.stopped()).singleElement().satisfies(snapshot -> {
            assertThat(snapshot.name())
                    .isEqualTo("robothree.central.application.read-configuration");
            assertThat(snapshot.lowCardinality())
                    .contains("robothree.operation=read_configuration")
                    .contains("robothree.outcome=success")
                    .doesNotContain("private-prompt-result");
            assertThat(snapshot.highCardinality()).isEqualTo("[]");
            assertThat(snapshot.error()).isNull();
        });
    }

    @Test
    void recordsAStableErrorOutcomeWithoutCapturingExceptionDetails() {
        RecordingHandler handler = new RecordingHandler();
        ObservationRegistry registry = ObservationRegistry.create();
        registry.observationConfig().observationHandler(handler);
        CentralObservationRunner runner = new CentralObservationRunner(registry);

        assertThatThrownBy(() -> runner.observe(
                        CentralObservedOperation.JDBC_TRANSACTION,
                        () -> {
                            throw new IllegalStateException(
                                    "Bearer secret-token SQL private_table prompt body");
                        }))
                .isInstanceOf(IllegalStateException.class);

        assertThat(handler.stopped()).singleElement().satisfies(snapshot -> {
            assertThat(snapshot.name()).isEqualTo("robothree.central.jdbc.transaction");
            assertThat(snapshot.lowCardinality())
                    .contains("robothree.operation=jdbc_transaction")
                    .contains("robothree.outcome=error")
                    .doesNotContain("secret-token")
                    .doesNotContain("private_table")
                    .doesNotContain("prompt body");
            assertThat(snapshot.highCardinality()).isEqualTo("[]");
            assertThat(snapshot.error()).isNull();
        });
    }

    private static final class RecordingHandler
            implements ObservationHandler<Observation.Context> {

        private final List<Snapshot> stopped = new ArrayList<>();

        @Override
        public void onStop(Observation.Context context) {
            stopped.add(new Snapshot(
                    context.getName(),
                    context.getLowCardinalityKeyValues().toString(),
                    context.getHighCardinalityKeyValues().toString(),
                    context.getError()));
        }

        @Override
        public boolean supportsContext(Observation.Context context) {
            return true;
        }

        List<Snapshot> stopped() {
            return List.copyOf(stopped);
        }
    }

    private record Snapshot(
            String name,
            String lowCardinality,
            String highCardinality,
            Throwable error) {}
}
