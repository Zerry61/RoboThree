package com.robothree.central.modelgateway.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.RecoveryEvidence;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Request;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Result;
import com.robothree.central.modelgateway.domain.ModelInvocationStatus;
import com.robothree.central.modelgateway.domain.ProviderUsageFact;
import com.robothree.central.modelgateway.development.DevelopmentModelBindingStateProvider;
import com.robothree.central.modelgateway.development.DevelopmentModelCredentialResolver;
import com.robothree.central.modelgateway.development.ScriptedFakeModelInvocationBackend;
import com.robothree.central.modelgateway.development.StrictModelEndpointValidator;
import com.robothree.central.modelgateway.development.VersionedDevelopmentModelBindingRegistry;
import com.robothree.central.modelgateway.port.ModelBindingRuntimeStateProvider.RuntimeState;
import com.robothree.central.modelgateway.port.ModelInvocationAccessAuthorizer;
import com.robothree.central.modelgateway.port.ModelInvocationEntropySource;
import com.robothree.central.modelgateway.port.ModelInvocationExecutionBackend;
import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;

class ModelInvocationRuntimeTest {

    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);
    private static final String E = "e".repeat(64);
    private static final String F = "f".repeat(64);
    private static final Instant NOW = Instant.parse("2026-07-31T01:00:00Z");

    @Test
    void acceptsIdempotentlyAndPersistsOnlyDurableSafeFacts() {
        RuntimeHarness harness = harness(
                RecoveryMode.IDEMPOTENT_RETRY,
                new ScriptedFakeModelInvocationBackend());
        ModelInvocationRuntime.AcceptCommand command =
                harness.command(NOW.plusSeconds(60));

        ModelInvocation accepted = harness.runtime().accept("valid-token", command);
        ModelInvocation replayed = harness.runtime().accept("valid-token", command);
        ModelInvocation completed =
                harness.runtime().execute(accepted.invocationId(), "central.node-a");

        assertThat(replayed.invocationId()).isEqualTo(accepted.invocationId());
        assertThat(completed.status()).isEqualTo(ModelInvocationStatus.COMPLETED);
        assertThat(completed.statusRevision()).isEqualTo(2);
        assertThat(completed.lastDurableEventSequence()).isEqualTo(4);
        assertThat(harness.persistence().findAfter(
                        completed.invocationId(),
                        0,
                        10))
                .extracting(event -> event.eventType())
                .containsExactly(
                        "accepted",
                        "dispatch_decided",
                        "usage_recorded",
                        "completed");
        assertThat(harness.persistence().findPending(10)).hasSize(4);
        assertThat(harness.persistence().findByInvocation(completed.invocationId()))
                .singleElement()
                .satisfies(fact -> {
                    assertThat(fact.attemptDisposition())
                            .isEqualTo(ProviderUsageFact.AttemptDisposition.TERMINAL_WINNER);
                    assertThat(fact.normalizedTotalInputTokens()).isEqualTo(1);
                    assertThat(fact.usageDigest()).hasSize(64);
                });
        assertThat(completed.dispatchDecision())
                .isEqualTo(ModelDispatchDecision.fromBinding(
                        harness.binding()).decisionDigest())
                .hasSize(64);
        assertThat(harness.runtime().ephemeralSnapshot(
                        "valid-token",
                        completed.invocationId()).events())
                .extracting(event -> event.delta())
                .containsExactly("fixture");
        assertThat(new ModelInvocationEphemeralBuffer(8, 8_192)
                        .snapshot(completed.invocationId()).events())
                .isEmpty();
        assertThat(completed.toString())
                .doesNotContain("fixture")
                .doesNotContain("https://")
                .doesNotContain("credential.development");
        harness.state().set(
                harness.binding().reference(),
                new RuntimeState(false, false, false));
        harness.clock().advance(Duration.ofMinutes(2));
        assertThat(harness.runtime().accept("valid-token", command))
                .isEqualTo(completed);

        ModelInvocationRuntime.AcceptCommand drifted = new ModelInvocationRuntime.AcceptCommand(
                command.clientRequestId(),
                UUID.randomUUID(),
                F,
                command.modelId(),
                command.modelRevision(),
                command.configurationRevision(),
                command.runtimeRegistryGeneration(),
                command.admissionType(),
                command.admissionDigest(),
                command.providerRequestDeadlineAt(),
                command.providerStreamIdleTimeoutMillis());
        assertThatThrownBy(() -> harness.runtime().accept("valid-token", drifted))
                .isInstanceOf(ModelGatewayException.class)
                .extracting("code")
                .isEqualTo("model_gateway.client_request_conflict");
    }

    @Test
    void failsClosedBeforeDispatchWhenBindingOrCredentialNarrows() {
        ScriptedFakeModelInvocationBackend backend =
                new ScriptedFakeModelInvocationBackend();
        RuntimeHarness harness = harness(
                RecoveryMode.IDEMPOTENT_RETRY,
                backend);
        harness.state().set(
                harness.binding().reference(),
                new RuntimeState(false, false, true));

        assertThatThrownBy(() -> harness.runtime().accept(
                        "valid-token",
                        harness.command(NOW.plusSeconds(60))))
                .isInstanceOf(ModelGatewayException.class)
                .extracting("code")
                .isEqualTo("model_gateway.binding_disabled");
        assertThat(backend.executionCount()).isZero();
        assertThat(harness.persistence().findPending(10)).isEmpty();

        harness.state().set(
                harness.binding().reference(),
                new RuntimeState(true, true, true));
        assertThatThrownBy(() -> harness.runtime().accept(
                        "valid-token",
                        harness.command(NOW.plusSeconds(60))))
                .isInstanceOf(ModelGatewayException.class)
                .extracting("code")
                .isEqualTo("model_gateway.binding_revoked");
        assertThat(backend.executionCount()).isZero();
        assertThat(harness.persistence().findPending(10)).isEmpty();

        harness.state().set(
                harness.binding().reference(),
                new RuntimeState(true, false, false));
        assertThatThrownBy(() -> harness.runtime().accept(
                        "valid-token",
                        harness.command(NOW.plusSeconds(60))))
                .isInstanceOf(ModelGatewayException.class)
                .extracting("code")
                .isEqualTo("model_gateway.binding_unhealthy");
        assertThat(backend.executionCount()).isZero();
        assertThat(harness.persistence().findPending(10)).isEmpty();

        harness.state().set(
                harness.binding().reference(),
                new RuntimeState(true, false, true));
        harness.credentials().remove("credential.development");
        assertThatThrownBy(() -> harness.runtime().accept(
                        "valid-token",
                        harness.command(NOW.plusSeconds(60))))
                .isInstanceOf(ModelGatewayException.class)
                .extracting("code")
                .isEqualTo("model_gateway.credential_unavailable");
        assertThat(harness.persistence().findPending(10)).isEmpty();
    }

    @Test
    void handlesPreDispatchCancellationAndDeadlineWithoutCallingTheBackend() {
        ScriptedFakeModelInvocationBackend backend =
                new ScriptedFakeModelInvocationBackend();
        RuntimeHarness cancelHarness = harness(
                RecoveryMode.IDEMPOTENT_RETRY,
                backend);
        ModelInvocation accepted = cancelHarness.runtime().accept(
                "valid-token",
                cancelHarness.command(NOW.plusSeconds(60)));
        ModelInvocation cancelled = cancelHarness.runtime().requestCancel(
                "valid-token",
                accepted.invocationId(),
                0,
                "user_requested");

        assertThat(cancelled.status()).isEqualTo(ModelInvocationStatus.CANCELLED);
        assertThat(cancelled.dispatchDecision()).isNull();
        assertThat(backend.executionCount()).isZero();

        ScriptedFakeModelInvocationBackend timeoutBackend =
                new ScriptedFakeModelInvocationBackend();
        RuntimeHarness timeoutHarness = harness(
                RecoveryMode.IDEMPOTENT_RETRY,
                timeoutBackend);
        ModelInvocation expiring = timeoutHarness.runtime().accept(
                "valid-token",
                timeoutHarness.command(NOW.plusSeconds(5)));
        timeoutHarness.clock().advance(Duration.ofSeconds(6));
        ModelInvocation timedOut = timeoutHarness.runtime().execute(
                expiring.invocationId(),
                "central.node-a");

        assertThat(timedOut.status()).isEqualTo(ModelInvocationStatus.TIMED_OUT);
        assertThat(timedOut.dispatchDecision()).isNull();
        assertThat(timeoutBackend.executionCount()).isZero();
    }

    @Test
    void passesTheLockedDeadlineAndIdleTimeoutThroughTheExecutionPort() {
        CapturingBackend backend = new CapturingBackend();
        RuntimeHarness harness = harness(
                RecoveryMode.MANUAL_RECONCILIATION,
                backend);
        Instant deadline = NOW.plusSeconds(60);
        ModelInvocation accepted = harness.runtime().accept(
                "valid-token",
                harness.command(deadline));

        ModelInvocation completed = harness.runtime().execute(
                accepted.invocationId(),
                "central.node-a");

        assertThat(completed.status()).isEqualTo(ModelInvocationStatus.COMPLETED);
        assertThat(backend.request.get().providerRequestDeadlineAt())
                .isEqualTo(deadline);
        assertThat(backend.request.get().providerStreamIdleTimeout())
                .isEqualTo(Duration.ofSeconds(30));
    }

    @Test
    void appliesTheThreeFrozenEvidenceBasedRecoveryModes() {
        assertRecoveryOutcome(
                RecoveryMode.IDEMPOTENT_RETRY,
                RecoveryEvidence.notFound(),
                ModelInvocationStatus.COMPLETED,
                1);
        assertRecoveryOutcome(
                RecoveryMode.QUERY_THEN_RETRY,
                RecoveryEvidence.unknown(),
                ModelInvocationStatus.UNCERTAIN,
                0);
        assertRecoveryOutcome(
                RecoveryMode.MANUAL_RECONCILIATION,
                RecoveryEvidence.notFound(),
                ModelInvocationStatus.UNCERTAIN,
                0);
    }

    @Test
    void keepsOldBindingDecisionsResolvableWithoutSilentReplacement() {
        ModelEndpointBinding oldBinding = binding(
                RecoveryMode.QUERY_THEN_RETRY);
        ModelEndpointBinding newBinding = new ModelEndpointBinding(
                "binding.development",
                F,
                "1".repeat(64),
                oldBinding.modelId(),
                oldBinding.upstreamModelId(),
                "2".repeat(64),
                "3".repeat(64),
                "4".repeat(64),
                ConnectionMode.DIRECT_PROVIDER,
                Protocol.OPENAI_COMPATIBLE,
                URI.create("https://provider.invalid/v1"),
                "credential.development.next",
                "5".repeat(64),
                "6".repeat(64),
                "7".repeat(64),
                RecoveryMode.IDEMPOTENT_RETRY);
        VersionedDevelopmentModelBindingRegistry registry =
                new VersionedDevelopmentModelBindingRegistry(
                        List.of(oldBinding, newBinding));
        String oldDecision =
                ModelDispatchDecision.fromBinding(oldBinding).decisionDigest();

        assertThat(registry.resolveDispatchDecision(oldDecision))
                .isEqualTo(oldBinding);
        assertThat(registry.resolveForSelection(newBinding.selection()))
                .isEqualTo(newBinding);
        assertThat(oldDecision)
                .isNotEqualTo(ModelDispatchDecision.fromBinding(
                        newBinding).decisionDigest());
        assertThatThrownBy(() -> registry.resolveDispatchDecision(
                        "9".repeat(64)))
                .isInstanceOf(ModelGatewayException.class)
                .extracting("code")
                .isEqualTo("model_gateway.binding_revision_missing");
    }

    @Test
    void rejectsTheStaleOwnerAfterDatabaseTimeLeaseTakeover() throws Exception {
        BlockingBackend staleBackend = new BlockingBackend();
        RuntimeHarness harness = harness(
                RecoveryMode.QUERY_THEN_RETRY,
                staleBackend);
        ModelInvocation accepted = harness.runtime().accept(
                "valid-token",
                harness.command(NOW.plusSeconds(120)));

        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var staleExecution = executor.submit(() -> harness.runtime().execute(
                    accepted.invocationId(),
                    "central.node-a"));
            assertThat(staleBackend.entered.await(5, TimeUnit.SECONDS)).isTrue();

            harness.clock().advance(Duration.ofSeconds(31));
            ScriptedFakeModelInvocationBackend takeoverBackend =
                    new ScriptedFakeModelInvocationBackend();
            takeoverBackend.setRecoveryEvidence(
                    accepted.invocationId(),
                    RecoveryEvidence.terminal(
                            Result.completed(1, 2, "stop", List.of())));
            ModelInvocationRuntime takeoverRuntime = harness.newRuntime(takeoverBackend);
            ModelInvocation completed = takeoverRuntime.recover(
                    accepted.invocationId(),
                    "central.node-b");
            staleBackend.release.countDown();

            assertThat(completed.status()).isEqualTo(ModelInvocationStatus.COMPLETED);
            assertThatThrownBy(staleExecution::get)
                    .isInstanceOf(ExecutionException.class)
                    .cause()
                    .isInstanceOf(ModelGatewayException.class)
                    .extracting("code")
                    .isEqualTo("model_gateway.fencing_epoch_conflict");
            assertThat(harness.persistence().findAfter(
                            accepted.invocationId(),
                            0,
                            20))
                    .extracting(event -> event.eventType())
                    .containsExactly(
                            "accepted",
                            "dispatch_decided",
                            "usage_recorded",
                            "completed");
            assertThat(harness.persistence().findByInvocation(accepted.invocationId()))
                    .extracting(ProviderUsageFact::attemptDisposition)
                    .containsExactly(
                            ProviderUsageFact.AttemptDisposition.SUPERSEDED_CONFIRMED,
                            ProviderUsageFact.AttemptDisposition.TERMINAL_WINNER);
        }
    }

    private static void assertRecoveryOutcome(
            RecoveryMode mode,
            RecoveryEvidence evidence,
            ModelInvocationStatus expectedStatus,
            int expectedExecutions) {
        RuntimeHarness crashed = harness(mode, new CrashAfterDispatchBackend());
        ModelInvocation accepted = crashed.runtime().accept(
                "valid-token",
                crashed.command(NOW.plusSeconds(120)));
        assertThatThrownBy(() -> crashed.runtime().execute(
                        accepted.invocationId(),
                        "central.node-a"))
                .isInstanceOf(AssertionError.class)
                .hasMessage("simulated process crash");
        assertThat(crashed.persistence().findById(accepted.invocationId()))
                .get()
                .extracting(ModelInvocation::status)
                .isEqualTo(ModelInvocationStatus.RUNNING);

        crashed.clock().advance(Duration.ofSeconds(31));
        ScriptedFakeModelInvocationBackend recoveryBackend =
                new ScriptedFakeModelInvocationBackend();
        recoveryBackend.setRecoveryEvidence(accepted.invocationId(), evidence);
        ModelInvocation recovered = crashed.newRuntime(recoveryBackend).recover(
                accepted.invocationId(),
                "central.node-b");

        assertThat(recovered.status()).isEqualTo(expectedStatus);
        assertThat(recoveryBackend.executionCount()).isEqualTo(expectedExecutions);
        assertThat(recovered.dispatchDecision())
                .isEqualTo(ModelDispatchDecision.fromBinding(
                        crashed.binding()).decisionDigest());
    }

    private static RuntimeHarness harness(
            RecoveryMode recoveryMode,
            ModelInvocationExecutionBackend backend) {
        MutableClock clock = new MutableClock(NOW);
        InMemoryCentralPersistence persistence =
                new InMemoryCentralPersistence(clock);
        ModelEndpointBinding binding = binding(recoveryMode);
        DevelopmentModelBindingStateProvider state =
                new DevelopmentModelBindingStateProvider();
        state.set(binding.reference(), new RuntimeState(true, false, true));
        DevelopmentModelCredentialResolver credentials =
                new DevelopmentModelCredentialResolver();
        credentials.register("credential.development", E);
        VersionedDevelopmentModelBindingRegistry registry =
                new VersionedDevelopmentModelBindingRegistry(List.of(binding));
        ModelInvocationRuntimePolicy policy =
                ModelInvocationRuntimePolicy.developmentDefaults();
        ModelInvocationEphemeralBuffer ephemeral =
                new ModelInvocationEphemeralBuffer(
                        policy.maximumEphemeralEvents(),
                        policy.maximumEphemeralUtf8Bytes());
        ModelInvocationEntropySource entropy = new DeterministicEntropy();
        ModelInvocationAccessAuthorizer authorizer = token -> {
            if (!"valid-token".equals(token)) {
                throw ModelGatewayException.validation(
                        "access_token_invalid",
                        "The access token is invalid.");
            }
            return new ModelInvocationAccessAuthorizer.AuthorizedSubject(
                    "enterprise.alpha",
                    "user.alpha",
                    "device.alpha",
                    "client.alpha");
        };
        ModelInvocationRuntime runtime = new ModelInvocationRuntime(
                authorizer,
                registry,
                state,
                credentials,
                new StrictModelEndpointValidator(),
                backend,
                persistence,
                persistence,
                persistence,
                persistence,
                persistence,
                persistence,
                policy,
                entropy,
                ephemeral,
                clock);
        return new RuntimeHarness(
                runtime,
                persistence,
                binding,
                state,
                credentials,
                registry,
                authorizer,
                policy,
                entropy,
                ephemeral,
                clock);
    }

    private static ModelEndpointBinding binding(RecoveryMode recoveryMode) {
        return new ModelEndpointBinding(
                "binding.development",
                B,
                C,
                "model.development",
                "model.development",
                A,
                C,
                D,
                ConnectionMode.CUSTOM_RELAY,
                Protocol.ANTHROPIC_COMPATIBLE,
                URI.create("https://model.invalid/anthropic"),
                "credential.development",
                E,
                A,
                B,
                recoveryMode);
    }

    private record RuntimeHarness(
            ModelInvocationRuntime runtime,
            InMemoryCentralPersistence persistence,
            ModelEndpointBinding binding,
            DevelopmentModelBindingStateProvider state,
            DevelopmentModelCredentialResolver credentials,
            VersionedDevelopmentModelBindingRegistry registry,
            ModelInvocationAccessAuthorizer authorizer,
            ModelInvocationRuntimePolicy policy,
            ModelInvocationEntropySource entropy,
            ModelInvocationEphemeralBuffer ephemeral,
            MutableClock clock) {

        ModelInvocationRuntime.AcceptCommand command(Instant deadline) {
            return new ModelInvocationRuntime.AcceptCommand(
                    UUID.fromString("00000000-0000-4000-8000-00000000a201"),
                    UUID.fromString("00000000-0000-4000-8000-00000000a202"),
                    A,
                    binding.modelId(),
                    binding.modelRevision(),
                    binding.configurationRevision(),
                    binding.runtimeRegistryGeneration(),
                    "development_synthetic",
                    B,
                    deadline,
                    30_000);
        }

        ModelInvocationRuntime newRuntime(ModelInvocationExecutionBackend backend) {
            return new ModelInvocationRuntime(
                    authorizer,
                    registry,
                    state,
                    credentials,
                    new StrictModelEndpointValidator(),
                    backend,
                    persistence,
                    persistence,
                    persistence,
                    persistence,
                    persistence,
                    persistence,
                    policy,
                    entropy,
                    new ModelInvocationEphemeralBuffer(
                            policy.maximumEphemeralEvents(),
                            policy.maximumEphemeralUtf8Bytes()),
                    clock);
        }
    }

    private static final class DeterministicEntropy
            implements ModelInvocationEntropySource {

        private final AtomicLong sequence = new AtomicLong(1);

        @Override
        public UUID nextUuid() {
            long value = sequence.getAndIncrement();
            return new UUID(0x4000_0000_0000_0000L, 0x8000_0000_0000_0000L | value);
        }
    }

    private static final class CrashAfterDispatchBackend
            implements ModelInvocationExecutionBackend {

        @Override
        public Result execute(
                Request request,
                BooleanSupplier cancellationRequested) {
            throw new AssertionError("simulated process crash");
        }

        @Override
        public RecoveryEvidence query(Request request) {
            return RecoveryEvidence.unknown();
        }
    }

    private static final class BlockingBackend
            implements ModelInvocationExecutionBackend {

        private final CountDownLatch entered = new CountDownLatch(1);
        private final CountDownLatch release = new CountDownLatch(1);

        @Override
        public Result execute(
                Request request,
                BooleanSupplier cancellationRequested) {
            entered.countDown();
            try {
                if (!release.await(5, TimeUnit.SECONDS)) {
                    throw new AssertionError("blocking backend timed out");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AssertionError("blocking backend interrupted", exception);
            }
            return Result.completed(1, 1, "stop", List.of());
        }

        @Override
        public RecoveryEvidence query(Request request) {
            return RecoveryEvidence.unknown();
        }
    }

    private static final class CapturingBackend
            implements ModelInvocationExecutionBackend {

        private final AtomicReference<Request> request = new AtomicReference<>();

        @Override
        public Result execute(
                Request executionRequest,
                BooleanSupplier cancellationRequested) {
            request.set(executionRequest);
            return Result.completed(1, 1, "stop", List.of());
        }

        @Override
        public RecoveryEvidence query(Request executionRequest) {
            return RecoveryEvidence.unknown();
        }
    }

    private static final class MutableClock extends Clock {

        private Instant current;

        private MutableClock(Instant current) {
            this.current = current;
        }

        void advance(Duration duration) {
            current = current.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            if (!ZoneOffset.UTC.equals(zone)) {
                throw new IllegalArgumentException("test clock uses UTC");
            }
            return this;
        }

        @Override
        public Instant instant() {
            return current;
        }
    }
}
