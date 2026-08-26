package com.robothree.central.shared.observability;

import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationRegistry;
import java.util.Locale;
import java.util.Objects;
import java.util.function.Supplier;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public final class CentralObservationRunner {

    @NonNull
    private final ObservationRegistry registry;

    public <T> T observe(CentralObservedOperation operation, Supplier<T> work) {
        Objects.requireNonNull(operation, "operation");
        Objects.requireNonNull(work, "work");
        Observation observation = Observation
                .createNotStarted(operation.observationName(), registry)
                .lowCardinalityKeyValue(
                        "robothree.operation",
                        operation.name().toLowerCase(Locale.ROOT))
                .start();
        try (Observation.Scope ignored = observation.openScope()) {
            T result = work.get();
            observation.lowCardinalityKeyValue("robothree.outcome", "success");
            return result;
        } catch (RuntimeException exception) {
            observation.lowCardinalityKeyValue("robothree.outcome", "error");
            throw exception;
        } finally {
            observation.stop();
        }
    }

    public static CentralObservationRunner noop() {
        return new CentralObservationRunner(ObservationRegistry.NOOP);
    }
}
