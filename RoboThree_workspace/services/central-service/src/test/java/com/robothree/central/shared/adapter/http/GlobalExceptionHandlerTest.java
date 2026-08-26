package com.robothree.central.shared.adapter.http;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.robothree.central.authentication.application.EnterpriseAuthenticationException;
import com.robothree.central.persistence.PersistenceConflictException;
import com.robothree.central.persistence.PersistenceIntegrityException;
import com.robothree.central.shared.observability.CentralTraceContext;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler =
            new GlobalExceptionHandler(CentralTraceContext.noop());

    @Test
    void mapsPersistenceFailuresWithoutLeakingInternalMessages() {
        var conflict = handler.persistenceConflict(new PersistenceConflictException(
                "revision_conflict",
                "token=secret SQL update private_table"));
        var integrity = handler.persistenceIntegrity(new PersistenceIntegrityException(
                "schema_integrity_failed",
                "select * from private_table where token=secret"));

        assertThat(conflict.getStatusCode().value()).isEqualTo(409);
        assertThat(conflict.getBody().code()).isEqualTo("revision_conflict");
        assertSafe(conflict.getBody());

        assertThat(integrity.getStatusCode().value()).isEqualTo(500);
        assertThat(integrity.getBody().code()).isEqualTo("schema_integrity_failed");
        assertSafe(integrity.getBody());
    }

    @Test
    void mapsServiceCategoryToTheExistingStrictAvailabilityEnum() {
        var response = handler.authentication(EnterpriseAuthenticationException.service(
                "configuration_unavailable",
                true,
                "Enterprise configuration is currently unavailable."));

        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getBody().category()).isEqualTo("availability");
        assertThat(response.getBody().retryable()).isTrue();
    }

    @Test
    void keepsTheAcceptedErrorEnvelopeAtExactlySixFields() {
        var response = handler.unexpected(new IllegalStateException("not exposed")).getBody();
        var json = new ObjectMapper().valueToTree(response);
        Set<String> fields = new HashSet<>();
        json.fieldNames().forEachRemaining(fields::add);

        assertThat(fields).containsExactlyInAnyOrder(
                "contractVersion",
                "code",
                "category",
                "retryable",
                "safeSummary",
                "correlationId");
    }

    @Test
    void unexpectedErrorsReturnUniqueCorrelationIdsUnderConcurrency() throws Exception {
        List<Callable<GatewayErrorResponse>> calls = IntStream.range(0, 64)
                .mapToObj(index -> (Callable<GatewayErrorResponse>) () ->
                        handler.unexpected(new IllegalStateException(
                                        "Bearer secret-" + index + " SQL private_table"))
                                .getBody())
                .toList();

        try (var executor = Executors.newFixedThreadPool(8)) {
            Set<java.util.UUID> correlationIds = new HashSet<>();
            for (var future : executor.invokeAll(calls)) {
                GatewayErrorResponse error = future.get();
                assertSafe(error);
                correlationIds.add(error.correlationId());
            }
            assertThat(correlationIds).hasSize(calls.size());
        }
    }

    private static void assertSafe(GatewayErrorResponse error) {
        assertThat(error).isNotNull();
        assertThat(error.safeSummary())
                .doesNotContain("secret")
                .doesNotContain("SQL")
                .doesNotContain("private_table")
                .doesNotContain("Bearer");
        assertThat(error.correlationId()).isNotNull();
    }
}
