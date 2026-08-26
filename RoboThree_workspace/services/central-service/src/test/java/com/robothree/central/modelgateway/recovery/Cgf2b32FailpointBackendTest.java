package com.robothree.central.modelgateway.recovery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.modelgateway.domain.ModelInvocationExecution.RecoveryEvidence;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Request;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Result;
import com.robothree.central.modelgateway.port.ModelInvocationExecutionBackend;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;

class Cgf2b32FailpointBackendTest {

    @Test
    void handshakesAndReleasesTheExactConfiguredSession() throws Exception {
        Cgf2b32FailpointBackend backend = backend();
        Cgf2b32FailpointBackend.State configured = backend.configure(
                new Cgf2b32FailpointBackend.Command("BEFORE_DELEGATE"));

        CompletableFuture<Result> execution = CompletableFuture.supplyAsync(
                () -> backend.execute(null, () -> false));

        Cgf2b32FailpointBackend.State blocked =
                backend.awaitBlocked(configured.sessionId());
        assertThat(blocked.sessionId()).isEqualTo(configured.sessionId());
        assertThat(blocked.blocked()).isTrue();

        Cgf2b32FailpointBackend.State released =
                backend.release(configured.sessionId());
        assertThat(released.sessionId()).isEqualTo(configured.sessionId());
        assertThat(released.blocked()).isFalse();
        assertThat(execution.get(5, TimeUnit.SECONDS).outcome().name())
                .isEqualTo("COMPLETED");
    }

    @Test
    void rejectsAStaleSessionInsteadOfObservingOrReleasingAnotherAttempt() {
        Cgf2b32FailpointBackend backend = backend();
        UUID staleSessionId = backend.configure(
                        new Cgf2b32FailpointBackend.Command("BEFORE_DELEGATE"))
                .sessionId();
        UUID activeSessionId = backend.configure(
                        new Cgf2b32FailpointBackend.Command("NONE"))
                .sessionId();

        assertThat(activeSessionId).isNotEqualTo(staleSessionId);
        assertThatThrownBy(() -> backend.awaitBlocked(staleSessionId))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("session identity mismatch");
        assertThatThrownBy(() -> backend.release(staleSessionId))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("session identity mismatch");
    }

    private static Cgf2b32FailpointBackend backend() {
        return new Cgf2b32FailpointBackend(new ModelInvocationExecutionBackend() {
            @Override
            public Result execute(
                    Request request,
                    BooleanSupplier cancellationRequested) {
                return Result.completed(1, 1, "stop", List.of());
            }

            @Override
            public RecoveryEvidence query(Request request) {
                return null;
            }
        });
    }
}
