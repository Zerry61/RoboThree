package com.robothree.central.modelgateway.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationCacheContext;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution;
import com.robothree.central.modelgateway.domain.ModelInvocationStatus;
import com.robothree.central.modelgateway.domain.PromptCachePlan;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.modelgateway.development.DevelopmentModelBindingStateProvider;
import com.robothree.central.modelgateway.development.DevelopmentModelCredentialResolver;
import com.robothree.central.modelgateway.development.StrictModelEndpointValidator;
import com.robothree.central.modelgateway.development.VersionedDevelopmentModelBindingRegistry;
import com.robothree.central.modelgateway.port.ModelBindingRuntimeStateProvider.RuntimeState;
import com.robothree.central.modelgateway.port.ModelInvocationCacheContextRepository;
import com.robothree.central.modelgateway.port.ModelInvocationExecutionBackend;
import com.robothree.central.modelgateway.port.PromptCachePlanRepository;
import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import com.robothree.central.shared.json.CanonicalJson;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;

class PromptCacheRuntimeTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);
    private static final String E = "e".repeat(64);
    private static final Instant NOW = Instant.parse("2026-08-14T03:00:00Z");

    @Test
    void transactionAAcceptsContextAtomicallyAndReplaysIdempotently() {
        Harness harness = harness(new CapturingBackend(), null, null);
        var command = harness.command(A, 1);
        harness.requests().register(A, request(A, "static"));

        ModelInvocation first = harness.runtime().acceptV1Alpha2("token", command, C, D);
        ModelInvocation replay = harness.runtime().acceptV1Alpha2("token", command, C, D);

        assertThat(replay.invocationId()).isEqualTo(first.invocationId());
        assertThat(harness.persistence().findContextByInvocationId(first.invocationId()))
                .get()
                .extracting(ModelInvocationCacheContext::cacheContextDigest)
                .isEqualTo(D);
    }

    @Test
    void transactionARejectsSameClientRequestWithDifferentCacheContext() {
        Harness harness = harness(new CapturingBackend(), null, null);
        var command = harness.command(A, 1);
        harness.requests().register(A, request(A, "static"));
        harness.runtime().acceptV1Alpha2("token", command, C, D);

        assertThatThrownBy(() -> harness.runtime().acceptV1Alpha2(
                        "token", command, C, E))
                .isInstanceOf(ModelGatewayException.class)
                .extracting("code")
                .isEqualTo("model_gateway.client_request_conflict");
    }

    @Test
    void transactionARollsBackInvocationWhenContextWriteFails() {
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        ModelInvocationCacheContextRepository failing = new FailingContextRepository(persistence);
        Harness harness = harness(new CapturingBackend(), persistence, failing, persistence);
        var command = harness.command(A, 1);
        harness.requests().register(A, request(A, "static"));

        assertThatThrownBy(() -> harness.runtime().acceptV1Alpha2(
                        "token", command, C, D))
                .isInstanceOf(NamedFailure.class);
        assertThat(persistence.findByClientRequest(new ModelInvocation.ClientRequestScope(
                        "enterprise.alpha",
                        "user.alpha",
                        "device.alpha",
                        "client.alpha",
                        command.clientRequestId())))
                .isEmpty();
    }

    @Test
    void transactionBPersistsPlanBeforeBackendAndExposesReadOnlyContext() {
        CapturingBackend backend = new CapturingBackend();
        Harness harness = harness(backend, null, null);
        ModelInvocation accepted = harness.accept(A, 1, A, "static");

        ModelInvocation completed = harness.runtime().execute(
                accepted.invocationId(), "central.node-a");

        assertThat(completed.status()).isEqualTo(ModelInvocationStatus.COMPLETED);
        PromptCachePlan plan = harness.persistence()
                .findPlanByInvocationId(accepted.invocationId())
                .orElseThrow();
        assertThat(backend.request().get().promptCacheExecutionContext())
                .isNotNull()
                .extracting(ModelInvocationExecution.PromptCacheExecutionContext::planDigest)
                .isEqualTo(plan.planDigest());
    }

    @Test
    void transactionBFailureRollsBackPlanAndNeverCallsBackend() {
        CapturingBackend backend = new CapturingBackend();
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        PromptCachePlanRepository failing = new FailingPlanRepository(persistence);
        Harness harness = harness(backend, persistence, persistence, failing);
        ModelInvocation accepted = harness.accept(A, 1, A, "static");

        assertThatThrownBy(() -> harness.runtime().execute(
                        accepted.invocationId(), "central.node-a"))
                .isInstanceOf(NamedFailure.class);
        assertThat(persistence.findPlanByInvocationId(accepted.invocationId())).isEmpty();
        assertThat(persistence.findById(accepted.invocationId()))
                .get()
                .extracting(ModelInvocation::status)
                .isEqualTo(ModelInvocationStatus.ACCEPTED);
        assertThat(backend.executionCount()).isZero();
    }

    @Test
    void c5PlannerFailureLeavesAcceptedInvocationWithoutPlanOrProviderCall() {
        CapturingBackend backend = new CapturingBackend();
        Harness harness = harness(backend, null, null);
        var command = harness.command(A, 1);
        ModelInvocation accepted = harness.runtime().acceptV1Alpha2("token", command, C, D);

        assertThatThrownBy(() -> harness.runtime().execute(
                        accepted.invocationId(), "central.node-a"))
                .isInstanceOf(ModelGatewayException.class)
                .extracting("code")
                .isEqualTo("model_gateway.provider_request_unavailable");
        assertThat(harness.persistence().findPlanByInvocationId(accepted.invocationId()))
                .isEmpty();
        assertThat(harness.persistence().findById(accepted.invocationId()))
                .get()
                .extracting(ModelInvocation::status)
                .isEqualTo(ModelInvocationStatus.ACCEPTED);
        assertThat(backend.executionCount()).isZero();
    }

    @Test
    void v1Alpha1InvocationRemainsNoCacheAndDoesNotCreateContextOrPlan() {
        CapturingBackend backend = new CapturingBackend();
        Harness harness = harness(backend, null, null);
        var command = harness.command(A, 1);
        harness.requests().register(A, request(A, "static"));
        ModelInvocation accepted = harness.runtime().accept("token", command);

        ModelInvocation completed = harness.runtime().execute(
                accepted.invocationId(), "central.node-a");

        assertThat(completed.status()).isEqualTo(ModelInvocationStatus.COMPLETED);
        assertThat(harness.persistence().findContextByInvocationId(accepted.invocationId()))
                .isEmpty();
        assertThat(harness.persistence().findPlanByInvocationId(accepted.invocationId()))
                .isEmpty();
        assertThat(backend.request().get().promptCacheExecutionContext()).isNull();
    }

    @Test
    void c7TakeoverRestoresExactPlanAfterCommitBeforeProviderCompletion() {
        CrashingBackend crash = new CrashingBackend();
        Harness harness = harness(crash, null, null);
        ModelInvocation accepted = harness.accept(A, 1, A, "static");

        assertThatThrownBy(() -> harness.runtime().execute(
                        accepted.invocationId(), "central.node-a"))
                .isInstanceOf(AssertionError.class);
        PromptCachePlan committed = harness.persistence()
                .findPlanByInvocationId(accepted.invocationId())
                .orElseThrow();
        assertThat(harness.persistence().findById(accepted.invocationId()))
                .get()
                .extracting(ModelInvocation::status)
                .isEqualTo(ModelInvocationStatus.RUNNING);

        harness.clock().advance(Duration.ofSeconds(31));
        CapturingBackend recoveredBackend = new CapturingBackend();
        ModelInvocation recovered = harness.newRuntime(recoveredBackend).recover(
                accepted.invocationId(), "central.node-b");

        assertThat(recovered.status()).isEqualTo(ModelInvocationStatus.COMPLETED);
        assertThat(recoveredBackend.request().get().promptCacheExecutionContext().planDigest())
                .isEqualTo(committed.planDigest());
    }

    @Test
    void sameSourceLockWithDifferentStaticContentFailsMonotonicityGuard() {
        CapturingBackend backend = new CapturingBackend();
        Harness harness = harness(backend, null, null);
        ModelInvocation first = harness.accept(A, 1, A, "static-one");
        harness.runtime().execute(first.invocationId(), "central.node-a");
        ModelInvocation second = harness.accept(B, 2, A, "static-two");

        assertThatThrownBy(() -> harness.runtime().execute(
                        second.invocationId(), "central.node-b"))
                .isInstanceOf(ModelGatewayException.class)
                .extracting("code")
                .isEqualTo("model_gateway.cache_static_prefix_drift");
        assertThat(backend.executionCount()).isEqualTo(1);
    }

    @Test
    void legalAgentRevisionSwitchCreatesNewKeyWithoutOverwritingOldPlan() {
        CapturingBackend backend = new CapturingBackend();
        Harness harness = harness(backend, null, null);
        ModelInvocation first = harness.accept(A, 1, A, "same-static");
        harness.runtime().execute(first.invocationId(), "central.node-a");
        PromptCachePlan firstPlan = harness.persistence()
                .findPlanByInvocationId(first.invocationId()).orElseThrow();
        ModelInvocation second = harness.accept(B, 2, B, "same-static");
        harness.runtime().execute(second.invocationId(), "central.node-b");
        PromptCachePlan secondPlan = harness.persistence()
                .findPlanByInvocationId(second.invocationId()).orElseThrow();

        assertThat(secondPlan.staticSourceLockDigest())
                .isNotEqualTo(firstPlan.staticSourceLockDigest());
        assertThat(secondPlan.cacheKeyDigest()).isNotEqualTo(firstPlan.cacheKeyDigest());
        assertThat(harness.persistence().findPlanByInvocationId(first.invocationId()))
                .contains(firstPlan);
        System.out.println("ROBOTHREE_PROMPT_CACHE_RESULT={\"status\":\"PASS\","
                + "\"cachePlanCount\":2,"
                + "\"legalRevisionSwitchCount\":1,"
                + "\"oldPlanPreservedCount\":1}");
    }

    private static Harness harness(
            ModelInvocationExecutionBackend backend,
            InMemoryCentralPersistence provided,
            ModelInvocationCacheContextRepository contextRepository) {
        return harness(backend, provided, contextRepository, null);
    }

    private static Harness harness(
            ModelInvocationExecutionBackend backend,
            InMemoryCentralPersistence provided,
            ModelInvocationCacheContextRepository contextRepository,
            PromptCachePlanRepository planRepository) {
        MutableClock clock = new MutableClock(NOW);
        InMemoryCentralPersistence persistence = provided == null
                ? new InMemoryCentralPersistence(clock)
                : provided;
        ModelInvocationCacheContextRepository contexts = contextRepository == null
                ? persistence
                : contextRepository;
        PromptCachePlanRepository plans = planRepository == null ? persistence : planRepository;
        ModelEndpointBinding binding = binding();
        DevelopmentModelBindingStateProvider states =
                new DevelopmentModelBindingStateProvider();
        states.set(binding.reference(), new RuntimeState(true, false, true));
        DevelopmentModelCredentialResolver credentials =
                new DevelopmentModelCredentialResolver();
        credentials.register("credential.cache", E);
        VersionedDevelopmentModelBindingRegistry bindings =
                new VersionedDevelopmentModelBindingRegistry(List.of(binding));
        PromptCacheProfile profile = PromptCacheProfile.create(
                "profile.cache",
                A,
                PromptCacheProfile.Status.ACTIVE,
                ModelEndpointBinding.Protocol.OPENAI_COMPATIBLE,
                List.of(ModelEndpointBinding.ConnectionMode.DIRECT_PROVIDER),
                PromptCacheProfile.ProjectionMode.OPENAI_PROMPT_CACHE_KEY,
                "route.cache",
                PromptCacheProfile.Assurance.PROVEN,
                PromptCacheProfile.Assurance.PROVIDER_DOCUMENTED,
                B,
                128);
        TransientModelProviderRequestSource requests =
                new TransientModelProviderRequestSource();
        PromptCachePlanningService planning = new PromptCachePlanningService(
                contexts,
                plans,
                new VersionedPromptCacheProfileRegistry(List.of(profile)),
                new PromptCacheCompatibilityClassifier(),
                new StaticPromptPrefixProjector(),
                new DeterministicPromptCachePlanner(),
                requests,
                clock);
        ModelInvocationRuntimePolicy policy =
                ModelInvocationRuntimePolicy.developmentDefaults();
        ModelInvocationEphemeralBuffer ephemeral = new ModelInvocationEphemeralBuffer(
                policy.maximumEphemeralEvents(),
                policy.maximumEphemeralUtf8Bytes());
        var authorizer = (com.robothree.central.modelgateway.port.ModelInvocationAccessAuthorizer)
                token -> new com.robothree.central.modelgateway.port.ModelInvocationAccessAuthorizer
                        .AuthorizedSubject(
                                "enterprise.alpha",
                                "user.alpha",
                                "device.alpha",
                                "client.alpha");
        var entropy = new DeterministicEntropy();
        ModelInvocationRuntime runtime = new ModelInvocationRuntime(
                authorizer,
                bindings,
                states,
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
                ModelInvocationAdmissionPolicy.development(),
                contexts,
                planning,
                clock);
        return new Harness(
                runtime,
                persistence,
                binding,
                states,
                credentials,
                bindings,
                authorizer,
                policy,
                entropy,
                ephemeral,
                planning,
                requests,
                clock);
    }

    private static ModelEndpointBinding binding() {
        return new ModelEndpointBinding(
                "binding.cache",
                B,
                C,
                "model.cache",
                "upstream.cache",
                A,
                C,
                D,
                ModelEndpointBinding.ConnectionMode.DIRECT_PROVIDER,
                ModelEndpointBinding.Protocol.OPENAI_COMPATIBLE,
                URI.create("https://provider.invalid/model"),
                "credential.cache",
                E,
                A,
                B,
                ModelEndpointBinding.RecoveryMode.IDEMPOTENT_RETRY);
    }

    private static String request(String sourceRevision, String staticText) {
        ObjectNode request = JSON.createObjectNode();
        request.put("snapshotId", "00000000-0000-4000-8000-000000000001");
        request.put("contextSourceDigest", A);
        request.putObject("model")
                .put("modelId", "model.cache")
                .put("modelRevision", A)
                .put("configurationRevision", C)
                .put("runtimeRegistryGeneration", D);
        ArrayNode messages = request.putArray("messages");
        ObjectNode system = messages.addObject()
                .put("role", "system")
                .put("sourceId", "agent.cache")
                .put("sourceRevision", sourceRevision)
                .put("sourceDigest", CanonicalJson.sha256(staticText));
        system.set("content", text(staticText));
        ObjectNode user = messages.addObject().put("role", "user");
        user.set("content", text("user text"));
        request.putArray("tools");
        request.put("maxOutputTokens", 100);
        return CanonicalJson.canonicalize(request);
    }

    private static ArrayNode text(String value) {
        ArrayNode result = JSON.createArrayNode();
        result.addObject().put("type", "text").put("text", value);
        return result;
    }

    private record Harness(
            ModelInvocationRuntime runtime,
            InMemoryCentralPersistence persistence,
            ModelEndpointBinding binding,
            DevelopmentModelBindingStateProvider states,
            DevelopmentModelCredentialResolver credentials,
            VersionedDevelopmentModelBindingRegistry bindings,
            com.robothree.central.modelgateway.port.ModelInvocationAccessAuthorizer authorizer,
            ModelInvocationRuntimePolicy policy,
            DeterministicEntropy entropy,
            ModelInvocationEphemeralBuffer ephemeral,
            PromptCachePlanningService planning,
            TransientModelProviderRequestSource requests,
            MutableClock clock) {

        ModelInvocationRuntime.AcceptCommand command(String requestDigest, long ordinal) {
            return new ModelInvocationRuntime.AcceptCommand(
                    new UUID(0x4000L, 0x8000L + ordinal),
                    new UUID(0x5000L, 0x9000L + ordinal),
                    requestDigest,
                    binding.modelId(),
                    binding.modelRevision(),
                    binding.configurationRevision(),
                    binding.runtimeRegistryGeneration(),
                    "development_synthetic",
                    B,
                    clock.instant().plusSeconds(120),
                    30_000);
        }

        ModelInvocation accept(
                String requestDigest,
                long ordinal,
                String sourceRevision,
                String staticText) {
            requests.register(requestDigest, request(sourceRevision, staticText));
            return runtime.acceptV1Alpha2(
                    "token",
                    command(requestDigest, ordinal),
                    C,
                    D);
        }

        ModelInvocationRuntime newRuntime(ModelInvocationExecutionBackend backend) {
            return new ModelInvocationRuntime(
                    authorizer,
                    bindings,
                    states,
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
                    ModelInvocationAdmissionPolicy.development(),
                    persistence,
                    planning,
                    clock);
        }
    }

    private static final class CapturingBackend implements ModelInvocationExecutionBackend {
        private final AtomicInteger count = new AtomicInteger();
        private final AtomicReference<ModelInvocationExecution.Request> request =
                new AtomicReference<>();

        @Override
        public ModelInvocationExecution.Result execute(
                ModelInvocationExecution.Request value,
                BooleanSupplier cancellationRequested) {
            request.set(value);
            count.incrementAndGet();
            return ModelInvocationExecution.Result.completed(1, 1, "stop", List.of());
        }

        @Override
        public ModelInvocationExecution.RecoveryEvidence query(
                ModelInvocationExecution.Request request) {
            return ModelInvocationExecution.RecoveryEvidence.notFound();
        }

        int executionCount() { return count.get(); }
        AtomicReference<ModelInvocationExecution.Request> request() { return request; }
    }

    private static final class CrashingBackend implements ModelInvocationExecutionBackend {
        @Override
        public ModelInvocationExecution.Result execute(
                ModelInvocationExecution.Request request,
                BooleanSupplier cancellationRequested) {
            throw new AssertionError("simulated process death after Transaction B");
        }

        @Override
        public ModelInvocationExecution.RecoveryEvidence query(
                ModelInvocationExecution.Request request) {
            return ModelInvocationExecution.RecoveryEvidence.unknown();
        }
    }

    private static final class FailingContextRepository
            implements ModelInvocationCacheContextRepository {
        private final ModelInvocationCacheContextRepository delegate;
        private FailingContextRepository(ModelInvocationCacheContextRepository delegate) {
            this.delegate = delegate;
        }
        @Override
        public Optional<ModelInvocationCacheContext> findContextByInvocationId(UUID id) {
            return delegate.findContextByInvocationId(id);
        }
        @Override
        public ModelInvocationCacheContext insertImmutable(ModelInvocationCacheContext value) {
            delegate.insertImmutable(value);
            throw new NamedFailure();
        }
    }

    private static final class FailingPlanRepository implements PromptCachePlanRepository {
        private final PromptCachePlanRepository delegate;
        private FailingPlanRepository(PromptCachePlanRepository delegate) {
            this.delegate = delegate;
        }
        @Override
        public Optional<PromptCachePlan> findPlanByInvocationId(UUID id) {
            return delegate.findPlanByInvocationId(id);
        }
        @Override
        public Optional<PromptCachePlan> findLatestByMonotonicityIdentity(
                PromptCachePlan.MonotonicityIdentity identity) {
            return delegate.findLatestByMonotonicityIdentity(identity);
        }
        @Override
        public PromptCachePlan insertImmutable(PromptCachePlan value) {
            delegate.insertImmutable(value);
            throw new NamedFailure();
        }
    }

    private static final class NamedFailure extends RuntimeException {}

    private static final class DeterministicEntropy
            implements com.robothree.central.modelgateway.port.ModelInvocationEntropySource {
        private final AtomicLong sequence = new AtomicLong(1);
        @Override
        public UUID nextUuid() {
            long value = sequence.getAndIncrement();
            return new UUID(0x7000_0000_0000_0000L, 0x8000_0000_0000_0000L | value);
        }
    }

    private static final class MutableClock extends Clock {
        private Instant current;
        private MutableClock(Instant current) { this.current = current; }
        void advance(Duration duration) { current = current.plus(duration); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return current; }
    }
}
