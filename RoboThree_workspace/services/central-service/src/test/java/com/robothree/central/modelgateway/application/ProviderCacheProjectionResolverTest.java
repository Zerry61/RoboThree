package com.robothree.central.modelgateway.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.ConnectionMode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.Protocol;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding.RecoveryMode;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationCacheContext;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution;
import com.robothree.central.modelgateway.domain.ModelInvocationStatus;
import com.robothree.central.modelgateway.domain.PromptCachePlan;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.modelgateway.domain.ProviderCacheProjection;
import com.robothree.central.modelgateway.port.ModelProviderRequestSource.ResolvedRequest;
import com.robothree.central.persistence.memory.InMemoryCentralPersistence;
import com.robothree.central.shared.json.CanonicalJson;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ProviderCacheProjectionResolverTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);
    private static final String E = "e".repeat(64);
    private static final String F = "f".repeat(64);

    @Test
    void resolvesExactAnthropicAndOpenAiPlansToExhaustiveProjections() {
        Fixture anthropic = fixture(
                Protocol.ANTHROPIC_COMPATIBLE,
                PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT,
                VersionedPromptCacheMarkerPolicyRegistry.ANTHROPIC_SYSTEM_POLICY_ID,
                true,
                null);
        assertThat(anthropic.resolve())
                .isInstanceOf(ProviderCacheProjection.AnthropicExplicit.class);

        Fixture key = fixture(
                Protocol.OPENAI_COMPATIBLE,
                PromptCacheProfile.ProjectionMode.OPENAI_PROMPT_CACHE_KEY,
                VersionedPromptCacheMarkerPolicyRegistry.OPENAI_KEY_POLICY_ID,
                true,
                null);
        assertThat(key.resolve())
                .isInstanceOfSatisfying(
                        ProviderCacheProjection.OpenAiPromptCacheKey.class,
                        value -> assertThat(value.opaqueKey()).isEqualTo(F));

        Fixture automatic = fixture(
                Protocol.OPENAI_COMPATIBLE,
                PromptCacheProfile.ProjectionMode.OPENAI_PROVIDER_AUTOMATIC_OBSERVED,
                VersionedPromptCacheMarkerPolicyRegistry.OPENAI_AUTOMATIC_POLICY_ID,
                false,
                PromptCachePlan.SkipReason.PROVIDER_AUTOMATIC_OBSERVED);
        assertThat(automatic.resolve())
                .isInstanceOf(ProviderCacheProjection.OpenAiAutomaticObserved.class);
    }

    @Test
    void keepsSkippedReviewedPlansOnTheTypedDisabledPath() {
        Fixture fixture = fixture(
                Protocol.ANTHROPIC_COMPATIBLE,
                PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT,
                VersionedPromptCacheMarkerPolicyRegistry.ANTHROPIC_SYSTEM_POLICY_ID,
                false,
                PromptCachePlan.SkipReason.PROFILE_DISABLED);

        assertThat(fixture.resolve())
                .isInstanceOfSatisfying(
                        ProviderCacheProjection.Disabled.class,
                        value -> assertThat(value.reason())
                                .isEqualTo("profile_disabled"));
    }

    @Test
    void failsClosedBeforeProviderForPlanBindingStaticAndPolicyDrift() {
        Fixture exact = fixture(
                Protocol.ANTHROPIC_COMPATIBLE,
                PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT,
                VersionedPromptCacheMarkerPolicyRegistry.ANTHROPIC_SYSTEM_POLICY_ID,
                true,
                null);
        assertCode(
                () -> exact.resolver.resolve(
                        exact.requestWithBinding(binding(
                                Protocol.ANTHROPIC_COMPATIBLE,
                                B,
                                C)),
                        exact.providerRequest),
                "model_gateway.cache_binding_drift");

        String driftedJson = requestJson("changed");
        ResolvedRequest drifted = new ResolvedRequest(
                CanonicalJson.sha256(driftedJson),
                driftedJson);
        assertCode(
                () -> exact.resolver.resolve(exact.request, drifted),
                "model_gateway.cache_static_prefix_drift");

        ObjectNode unreviewed = CanonicalJson.parseObject(
                exact.providerRequest.canonicalRequestJson(),
                4 * 1024 * 1024);
        unreviewed.put("unreviewed", true);
        String unreviewedJson = CanonicalJson.canonicalize(unreviewed);
        assertCode(
                () -> exact.resolver.resolve(
                        exact.request,
                        new ResolvedRequest(
                                CanonicalJson.sha256(unreviewedJson),
                                unreviewedJson)),
                "model_gateway.cache_compatibility_drift");

        var wrongPolicies = new VersionedPromptCacheMarkerPolicyRegistry(List.of());
        ProviderCacheProjectionResolver missingPolicy = new ProviderCacheProjectionResolver(
                exact.persistence,
                exact.profiles,
                wrongPolicies,
                new PromptCacheCompatibilityClassifier(),
                new StaticPromptPrefixProjector());
        assertCode(
                () -> missingPolicy.resolve(exact.request, exact.providerRequest),
                "model_gateway.cache_marker_policy_missing");
    }

    @Test
    void requiresThePersistedPlanAndExactExecutionEvidence() {
        Fixture exact = fixture(
                Protocol.OPENAI_COMPATIBLE,
                PromptCacheProfile.ProjectionMode.OPENAI_PROMPT_CACHE_KEY,
                VersionedPromptCacheMarkerPolicyRegistry.OPENAI_KEY_POLICY_ID,
                true,
                null);
        ProviderCacheProjectionResolver empty = new ProviderCacheProjectionResolver(
                new InMemoryCentralPersistence(),
                exact.profiles,
                VersionedPromptCacheMarkerPolicyRegistry.defaults(),
                new PromptCacheCompatibilityClassifier(),
                new StaticPromptPrefixProjector());
        assertCode(
                () -> empty.resolve(exact.request, exact.providerRequest),
                "model_gateway.cache_plan_missing");

        assertThatThrownBy(() -> new ModelInvocationExecution.PromptCacheExecutionContext(
                        exact.plan.planDigest(),
                        exact.plan.cacheContextDigest(),
                        exact.plan.cacheScopeIdDigest(),
                        exact.plan.staticSourceLockDigest(),
                        exact.plan.staticPrefixDigest(),
                        exact.plan.compatibilityFingerprintDigest(),
                        A,
                        exact.plan.cachePolicyRevision(),
                        exact.plan.bindingRevision(),
                        exact.plan.bindingDigest(),
                        exact.plan.profileId(),
                        exact.plan.profileRevision(),
                        exact.plan.profileDigest(),
                        exact.plan.providerProjectionMode().contractValue(),
                        exact.plan.eligible(),
                        null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("planDigest");
    }

    @Test
    void returnsDisabledWithoutRepositoryAccessWhenNoPlanWasAttached() {
        Fixture fixture = fixture(
                Protocol.ANTHROPIC_COMPATIBLE,
                PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT,
                VersionedPromptCacheMarkerPolicyRegistry.ANTHROPIC_SYSTEM_POLICY_ID,
                true,
                null);
        var request = new ModelInvocationExecution.Request(
                fixture.request.invocationId(),
                fixture.request.requestDigest(),
                fixture.request.modelId(),
                fixture.request.binding(),
                fixture.request.credential(),
                fixture.request.fencingEpoch(),
                fixture.request.providerRequestDeadlineAt(),
                fixture.request.providerStreamIdleTimeout());

        assertThat(fixture.resolver.resolve(request, fixture.providerRequest))
                .isEqualTo(ProviderCacheProjection.Disabled.of("cache_not_planned"));
    }

    private static Fixture fixture(
            Protocol protocol,
            PromptCacheProfile.ProjectionMode mode,
            String policyId,
            boolean eligible,
            PromptCachePlan.SkipReason skipReason) {
        String json = requestJson("stable");
        ResolvedRequest providerRequest = new ResolvedRequest(
                CanonicalJson.sha256(json),
                json);
        var policy = VersionedPromptCacheMarkerPolicyRegistry.defaultPolicies().stream()
                .filter(value -> value.policyId().equals(policyId))
                .findFirst()
                .orElseThrow();
        ModelEndpointBinding binding = binding(protocol, A, B);
        PromptCacheProfile profile = PromptCacheProfile.create(
                "profile.cache",
                A,
                eligible ? PromptCacheProfile.Status.ACTIVE : PromptCacheProfile.Status.DISABLED,
                protocol,
                List.of(ConnectionMode.DIRECT_PROVIDER),
                mode,
                "route.cache",
                PromptCacheProfile.Assurance.PROVEN,
                PromptCacheProfile.Assurance.PROVIDER_DOCUMENTED,
                policy.policyRevision(),
                mode.supportsExplicitKey() ? 64 : null);
        var classifier = new PromptCacheCompatibilityClassifier();
        var projector = new StaticPromptPrefixProjector();
        var classified = classifier.classify(json, profile);
        var staticPrefix = projector.project(json);
        String key = eligible && mode.supportsExplicitKey() ? F : null;
        String planDigest = PromptCachePlan.computePlanDigest(
                C,
                D,
                staticPrefix.staticSourceLockDigest(),
                staticPrefix.staticPrefixDigest(),
                classified.compatibilityFingerprintDigest(),
                key,
                DeterministicPromptCachePlanner.CACHE_POLICY_REVISION,
                binding.bindingRevision(),
                binding.bindingDigest(),
                profile.profileId(),
                profile.profileRevision(),
                profile.profileDigest(),
                mode,
                eligible,
                skipReason);
        UUID invocationId = UUID.randomUUID();
        PromptCachePlan plan = new PromptCachePlan(
                invocationId,
                C,
                D,
                staticPrefix.staticSourceLockDigest(),
                staticPrefix.staticPrefixDigest(),
                classified.compatibilityFingerprintDigest(),
                key,
                DeterministicPromptCachePlanner.CACHE_POLICY_REVISION,
                binding.bindingRevision(),
                binding.bindingDigest(),
                profile.profileId(),
                profile.profileRevision(),
                profile.profileDigest(),
                mode,
                eligible,
                skipReason,
                planDigest,
                Instant.parse("2026-08-14T00:00:00Z"));
        InMemoryCentralPersistence persistence = new InMemoryCentralPersistence();
        persistence.accept(invocation(invocationId));
        persistence.insertImmutable(ModelInvocationCacheContext.create(
                invocationId,
                D,
                C,
                Instant.parse("2026-08-14T00:00:00Z")));
        persistence.insertImmutable(plan);
        var profiles = new VersionedPromptCacheProfileRegistry(List.of(profile));
        ProviderCacheProjectionResolver resolver = new ProviderCacheProjectionResolver(
                persistence,
                profiles,
                VersionedPromptCacheMarkerPolicyRegistry.defaults(),
                classifier,
                projector);
        ModelInvocationExecution.Request request = new ModelInvocationExecution.Request(
                invocationId,
                providerRequest.requestDigest(),
                "model.synthetic",
                binding,
                new ModelInvocationExecution.CredentialResolution("credential.cache", E),
                1,
                Instant.parse("2026-08-14T00:01:00Z"),
                Duration.ofSeconds(30),
                ModelInvocationExecution.PromptCacheExecutionContext.from(plan));
        return new Fixture(
                persistence,
                profiles,
                resolver,
                providerRequest,
                plan,
                request);
    }

    private static ModelEndpointBinding binding(
            Protocol protocol,
            String revision,
            String digest) {
        return new ModelEndpointBinding(
                "binding.cache",
                revision,
                digest,
                "model.synthetic",
                "model.synthetic",
                C,
                D,
                E,
                ConnectionMode.DIRECT_PROVIDER,
                protocol,
                URI.create("https://provider.invalid"),
                "credential.cache",
                E,
                A,
                F,
                RecoveryMode.MANUAL_RECONCILIATION);
    }

    private static ModelInvocation invocation(UUID invocationId) {
        Instant now = Instant.parse("2026-08-14T00:00:00Z");
        return new ModelInvocation(
                invocationId,
                "enterprise.alpha",
                "user.alpha",
                "device.alpha",
                "client.alpha",
                UUID.randomUUID(),
                UUID.randomUUID(),
                A,
                "model.synthetic",
                A,
                B,
                C,
                "user_confirmed",
                D,
                now.plusSeconds(60),
                30_000,
                ModelInvocationStatus.ACCEPTED,
                0,
                0,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                now,
                null,
                null,
                now);
    }

    private static String requestJson(String text) {
        ObjectNode root = JSON.createObjectNode();
        root.put("snapshotId", "11111111-1111-4111-8111-111111111111");
        root.put("contextSourceDigest", A);
        root.putObject("model")
                .put("modelId", "model.synthetic")
                .put("modelRevision", C)
                .put("configurationRevision", D)
                .put("runtimeRegistryGeneration", E);
        ObjectNode system = root.putArray("messages").addObject();
        system.put("role", "system");
        system.put("sourceId", "platform.rules");
        system.put("sourceRevision", A);
        system.put("sourceDigest", B);
        system.putArray("content").addObject().put("type", "text").put("text", text);
        ObjectNode userMessage = ((com.fasterxml.jackson.databind.node.ArrayNode)
                root.path("messages")).addObject();
        userMessage.put("role", "user");
        userMessage.putArray("content").addObject()
                .put("type", "text").put("text", "question");
        ObjectNode tool = root.putArray("tools").addObject();
        tool.put("capabilityId", "tool.echo");
        tool.put("capabilityRevision", B);
        tool.put("name", "echo");
        tool.put("description", "Echo one value.");
        ObjectNode schema = tool.putObject("inputSchema").put("type", "object");
        tool.put("inputSchemaDigest", CanonicalJson.sha256(
                CanonicalJson.canonicalize(schema)));
        root.put("maxOutputTokens", 64);
        return CanonicalJson.canonicalize(root);
    }

    private static void assertCode(
            org.assertj.core.api.ThrowableAssert.ThrowingCallable action,
            String code) {
        assertThatThrownBy(action)
                .isInstanceOfSatisfying(
                        ModelGatewayException.class,
                        error -> assertThat(error.code()).isEqualTo(code));
    }

    private record Fixture(
            InMemoryCentralPersistence persistence,
            VersionedPromptCacheProfileRegistry profiles,
            ProviderCacheProjectionResolver resolver,
            ResolvedRequest providerRequest,
            PromptCachePlan plan,
            ModelInvocationExecution.Request request) {

        ProviderCacheProjection resolve() {
            return resolver.resolve(request, providerRequest);
        }

        ModelInvocationExecution.Request requestWithBinding(ModelEndpointBinding binding) {
            return new ModelInvocationExecution.Request(
                    request.invocationId(),
                    request.requestDigest(),
                    request.modelId(),
                    binding,
                    request.credential(),
                    request.fencingEpoch(),
                    request.providerRequestDeadlineAt(),
                    request.providerStreamIdleTimeout(),
                    request.promptCacheExecutionContext());
        }
    }
}
