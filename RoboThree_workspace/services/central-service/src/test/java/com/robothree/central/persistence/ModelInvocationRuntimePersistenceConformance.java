package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import com.robothree.central.modelgateway.application.ModelInvocationEphemeralBuffer;
import com.robothree.central.modelgateway.application.ModelInvocationRuntime;
import com.robothree.central.modelgateway.application.ModelInvocationRuntimePolicy;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationStatus;
import com.robothree.central.modelgateway.development.DevelopmentModelBindingStateProvider;
import com.robothree.central.modelgateway.development.DevelopmentModelCredentialResolver;
import com.robothree.central.modelgateway.development.ScriptedFakeModelInvocationBackend;
import com.robothree.central.modelgateway.development.StrictModelEndpointValidator;
import com.robothree.central.modelgateway.development.VersionedDevelopmentModelBindingRegistry;
import com.robothree.central.modelgateway.port.ModelBindingRuntimeStateProvider.RuntimeState;
import com.robothree.central.modelgateway.port.ModelInvocationAccessAuthorizer;
import com.robothree.central.modelgateway.port.ModelInvocationEntropySource;
import com.robothree.central.persistence.mybatis.adapter.MyBatisModelInvocationPersistence;
import com.robothree.central.persistence.mybatis.transaction.SpringCentralTransactionRunner;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

final class ModelInvocationRuntimePersistenceConformance {

    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);
    private static final String E = "e".repeat(64);
    private static final Instant NOW = Instant.parse("2026-07-31T01:00:00Z");

    private ModelInvocationRuntimePersistenceConformance() {}

    static void verify(
            CentralPersistenceVariants.MyBatisContext first,
            CentralPersistenceVariants.MyBatisContext reopened) {
        ModelEndpointBinding binding = binding();
        VersionedDevelopmentModelBindingRegistry registry =
                new VersionedDevelopmentModelBindingRegistry(List.of(binding));
        DevelopmentModelBindingStateProvider state =
                new DevelopmentModelBindingStateProvider();
        state.set(binding.reference(), new RuntimeState(true, false, true));
        DevelopmentModelCredentialResolver credentials =
                new DevelopmentModelCredentialResolver();
        credentials.register(binding.credentialReference(), E);
        ModelInvocationAccessAuthorizer authorizer =
                token -> new ModelInvocationAccessAuthorizer.AuthorizedSubject(
                        "enterprise.alpha",
                        "user.alpha",
                        "device.alpha",
                        "client.alpha");
        ModelInvocationRuntimePolicy policy =
                ModelInvocationRuntimePolicy.developmentDefaults();
        Clock clock = Clock.systemUTC();
        ModelInvocationRuntime firstRuntime = runtime(
                first,
                registry,
                state,
                credentials,
                authorizer,
                policy,
                clock,
                new Entropy());
        ModelInvocationRuntime.AcceptCommand command =
                new ModelInvocationRuntime.AcceptCommand(
                        UUID.fromString("00000000-0000-4000-8000-00000000a221"),
                        UUID.fromString("00000000-0000-4000-8000-00000000a222"),
                        A,
                        binding.modelId(),
                        binding.modelRevision(),
                        binding.configurationRevision(),
                        binding.runtimeRegistryGeneration(),
                        "development_synthetic",
                        B,
                        clock.instant().plusSeconds(60),
                        30_000);

        ModelInvocation accepted = firstRuntime.accept("valid-token", command);
        ModelInvocation completed =
                firstRuntime.execute(accepted.invocationId(), "central.node-a");
        assertThat(completed.status()).isEqualTo(ModelInvocationStatus.COMPLETED);

        ModelInvocationRuntime reopenedRuntime = runtime(
                reopened,
                registry,
                state,
                credentials,
                authorizer,
                policy,
                clock,
                new Entropy());
        ModelInvocation restored = reopenedRuntime.status(
                "valid-token",
                accepted.invocationId());

        assertThat(restored).isEqualTo(completed);
        assertThat(reopenedRuntime.durableEvents(
                        "valid-token",
                        restored.invocationId(),
                        0,
                        10))
                .extracting(event -> event.eventType())
                .containsExactly(
                        "accepted",
                        "dispatch_decided",
                        "usage_recorded",
                        "completed");
        assertThat(reopened.modelInvocations().find(restored.invocationId())).isPresent();
        assertThat(reopened.modelInvocations().findPending(10)).hasSize(4);
        assertThat(reopened.modelInvocations().currentDatabaseTime())
                .isBeforeOrEqualTo(Instant.now().plusSeconds(5));
        assertThat(reopenedRuntime.ephemeralSnapshot(
                        "valid-token",
                        restored.invocationId()).events())
                .isEmpty();
    }

    private static ModelInvocationRuntime runtime(
            CentralPersistenceVariants.MyBatisContext context,
            VersionedDevelopmentModelBindingRegistry registry,
            DevelopmentModelBindingStateProvider state,
            DevelopmentModelCredentialResolver credentials,
            ModelInvocationAccessAuthorizer authorizer,
            ModelInvocationRuntimePolicy policy,
            Clock clock,
            ModelInvocationEntropySource entropy) {
        MyBatisModelInvocationPersistence persistence = context.modelInvocations();
        return new ModelInvocationRuntime(
                authorizer,
                registry,
                state,
                credentials,
                new StrictModelEndpointValidator(),
                new ScriptedFakeModelInvocationBackend(),
                persistence,
                persistence,
                persistence,
                persistence,
                persistence,
                new SpringCentralTransactionRunner(context.transactionManager()),
                policy,
                entropy,
                new ModelInvocationEphemeralBuffer(
                        policy.maximumEphemeralEvents(),
                        policy.maximumEphemeralUtf8Bytes()),
                clock);
    }

    private static ModelEndpointBinding binding() {
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
                Protocol.OPENAI_COMPATIBLE,
                URI.create("https://model.invalid/v1"),
                "credential.development",
                E,
                A,
                B,
                RecoveryMode.QUERY_THEN_RETRY);
    }

    private static final class Entropy implements ModelInvocationEntropySource {

        private final AtomicLong sequence = new AtomicLong(1);

        @Override
        public UUID nextUuid() {
            return new UUID(0x4000_0000_0000_0000L, sequence.getAndIncrement());
        }
    }
}
