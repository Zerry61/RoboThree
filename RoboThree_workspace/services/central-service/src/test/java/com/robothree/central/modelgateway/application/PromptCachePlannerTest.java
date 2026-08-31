package com.robothree.central.modelgateway.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationCacheContext;
import com.robothree.central.modelgateway.domain.ModelInvocationStatus;
import com.robothree.central.modelgateway.domain.PromptCacheCompatibility;
import com.robothree.central.modelgateway.domain.PromptCachePlan;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.shared.json.CanonicalJson;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PromptCachePlannerTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);
    private static final String E = "e".repeat(64);
    private static final Instant NOW = Instant.parse("2026-08-14T01:00:00Z");

    @Test
    void createsEligibleAnthropicPlanWithoutInventingExternalKey() {
        Fixture fixture = fixture(
                PromptCacheProfile.Status.ACTIVE,
                PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT,
                PromptCacheProfile.Assurance.PROVEN,
                ModelEndpointBinding.Protocol.ANTHROPIC_COMPATIBLE,
                ModelEndpointBinding.ConnectionMode.CUSTOM_RELAY);
        PromptCachePlan plan = fixture.plan(request(A, A, "platform", "hello", true));
        assertThat(plan.eligible()).isTrue();
        assertThat(plan.cacheKeyDigest()).isNull();
        assertThat(plan.skipReason()).isNull();
    }

    @Test
    void createsExplicitOpenAiKeyOnlyForExplicitProfile() {
        Fixture fixture = fixture(
                PromptCacheProfile.Status.ACTIVE,
                PromptCacheProfile.ProjectionMode.OPENAI_PROMPT_CACHE_KEY,
                PromptCacheProfile.Assurance.PROVEN,
                ModelEndpointBinding.Protocol.OPENAI_COMPATIBLE,
                ModelEndpointBinding.ConnectionMode.DIRECT_PROVIDER);
        assertThat(fixture.plan(request(A, A, "platform", "hello", true))
                        .cacheKeyDigest())
                .hasSize(64);
    }

    @Test
    void disabledProfileProducesBoundedSkip() {
        Fixture fixture = fixture(
                PromptCacheProfile.Status.DISABLED,
                PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT,
                PromptCacheProfile.Assurance.PROVEN,
                ModelEndpointBinding.Protocol.ANTHROPIC_COMPATIBLE,
                ModelEndpointBinding.ConnectionMode.CUSTOM_RELAY);
        assertThat(fixture.plan(request(A, A, "platform", "hello", true)).skipReason())
                .isEqualTo(PromptCachePlan.SkipReason.PROFILE_DISABLED);
    }

    @Test
    void automaticObservedModeDoesNotPretendToOwnAReusableKey() {
        Fixture fixture = fixture(
                PromptCacheProfile.Status.ACTIVE,
                PromptCacheProfile.ProjectionMode.OPENAI_PROVIDER_AUTOMATIC_OBSERVED,
                PromptCacheProfile.Assurance.PROVEN,
                ModelEndpointBinding.Protocol.OPENAI_COMPATIBLE,
                ModelEndpointBinding.ConnectionMode.CUSTOM_RELAY);
        PromptCachePlan plan = fixture.plan(request(A, A, "platform", "hello", true));
        assertThat(plan.eligible()).isFalse();
        assertThat(plan.skipReason())
                .isEqualTo(PromptCachePlan.SkipReason.PROVIDER_AUTOMATIC_OBSERVED);
    }

    @Test
    void noStaticPrefixRemainsNoCacheSafe() {
        Fixture fixture = standard();
        assertThat(fixture.plan(request(A, A, "platform", "hello", false)).skipReason())
                .isEqualTo(PromptCachePlan.SkipReason.NO_STATIC_PREFIX);
    }

    @Test
    void unprovenIsolationFailsClosedToNoCache() {
        Fixture fixture = fixture(
                PromptCacheProfile.Status.ACTIVE,
                PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT,
                PromptCacheProfile.Assurance.UNPROVEN,
                ModelEndpointBinding.Protocol.ANTHROPIC_COMPATIBLE,
                ModelEndpointBinding.ConnectionMode.CUSTOM_RELAY);
        assertThat(fixture.plan(request(A, A, "platform", "hello", true)).skipReason())
                .isEqualTo(PromptCachePlan.SkipReason.ISOLATION_UNPROVEN);
    }

    @Test
    void unknownProviderNeutralFieldDisablesCacheUntilReviewed() {
        Fixture fixture = standard();
        ObjectNode request = CanonicalJson.parseObject(
                request(A, A, "platform", "hello", true),
                1_000_000);
        request.put("futureField", "unknown");
        PromptCacheCompatibility result = fixture.classifier().classify(
                CanonicalJson.canonicalize(request),
                fixture.profile());
        assertThat(result.classification()).isEqualTo(
                PromptCacheCompatibility.Classification.CACHE_DISABLED_UNTIL_REVIEWED);
    }

    @Test
    void dynamicConversationGrowthDoesNotChangeStaticDigests() {
        StaticPromptPrefixProjector projector = new StaticPromptPrefixProjector();
        var first = projector.project(request(A, A, "platform", "one", true));
        var second = projector.project(request(A, A, "platform", "two", true));
        assertThat(second.staticSourceLockDigest()).isEqualTo(first.staticSourceLockDigest());
        assertThat(second.staticPrefixDigest()).isEqualTo(first.staticPrefixDigest());
    }

    @Test
    void requestScopedSystemFactsAreExcludedFromTheStaticCachePrefix() {
        StaticPromptPrefixProjector projector = new StaticPromptPrefixProjector();
        ObjectNode firstRequest = CanonicalJson.parseObject(
                request(A, A, "core.request-context.v1", "one", true),
                1_000_000);
        ObjectNode secondRequest = firstRequest.deepCopy();
        ((ObjectNode) secondRequest.withArray("messages").get(0))
                .put("sourceDigest", B)
                .set("content", textContent("same instructions, later request facts"));

        var first = projector.project(CanonicalJson.canonicalize(firstRequest));
        var second = projector.project(CanonicalJson.canonicalize(secondRequest));

        assertThat(first.systemSourceCount()).isZero();
        assertThat(second.systemSourceCount()).isZero();
        assertThat(second.staticSourceLockDigest())
                .isEqualTo(first.staticSourceLockDigest());
        assertThat(second.staticPrefixDigest())
                .isEqualTo(first.staticPrefixDigest());
    }

    @Test
    void taskScopedInstructionBundlesAreExcludedFromTheStaticCachePrefix() {
        StaticPromptPrefixProjector projector = new StaticPromptPrefixProjector();
        ObjectNode firstRequest = CanonicalJson.parseObject(
                request(A, A, "core.instruction-bundle.v1", "one", true),
                1_000_000);
        ObjectNode secondRequest = firstRequest.deepCopy();
        ((ObjectNode) secondRequest.withArray("messages").get(0))
                .put("sourceDigest", B)
                .set("content", textContent("next task instruction bundle"));

        var first = projector.project(CanonicalJson.canonicalize(firstRequest));
        var second = projector.project(CanonicalJson.canonicalize(secondRequest));

        assertThat(first.systemSourceCount()).isZero();
        assertThat(second.systemSourceCount()).isZero();
        assertThat(second.staticSourceLockDigest())
                .isEqualTo(first.staticSourceLockDigest());
        assertThat(second.staticPrefixDigest())
                .isEqualTo(first.staticPrefixDigest());
    }

    @Test
    void toolRegistrationOrderIsCanonical() {
        StaticPromptPrefixProjector projector = new StaticPromptPrefixProjector();
        String first = requestWithTools(false);
        String second = requestWithTools(true);
        assertThat(projector.project(first)).isEqualTo(projector.project(second));
    }

    @Test
    void sourceRevisionChangeProducesNewSourceLockAndKey() {
        Fixture fixture = explicitOpenAi();
        PromptCachePlan first = fixture.plan(request(A, A, "agent", "hello", true));
        PromptCachePlan second = fixture.plan(request(B, A, "agent", "hello", true));
        assertThat(second.staticSourceLockDigest())
                .isNotEqualTo(first.staticSourceLockDigest());
        assertThat(second.cacheKeyDigest()).isNotEqualTo(first.cacheKeyDigest());
    }

    @Test
    void sameSourceRevisionContentDriftChangesPrefixButNotSourceLock() {
        StaticPromptPrefixProjector projector = new StaticPromptPrefixProjector();
        var first = projector.project(request(A, A, "agent", "hello", true));
        var second = projector.project(request(A, B, "agent", "changed", true));
        assertThat(second.staticSourceLockDigest()).isEqualTo(first.staticSourceLockDigest());
        assertThat(second.staticPrefixDigest()).isNotEqualTo(first.staticPrefixDigest());
    }

    @Test
    void modelRevisionChangesKeyWithoutChangingSessionScope() {
        Fixture fixture = explicitOpenAi();
        PromptCachePlan first = fixture.plan(request(A, A, "agent", "hello", true));
        Fixture revised = fixture.withBinding(binding(
                fixture.binding().protocol(),
                fixture.binding().connectionMode(),
                B));
        PromptCachePlan second = revised.plan(request(A, A, "agent", "hello", true));
        assertThat(second.cacheScopeIdDigest()).isEqualTo(first.cacheScopeIdDigest());
        assertThat(second.cacheKeyDigest()).isNotEqualTo(first.cacheKeyDigest());
    }

    @Test
    void differentExactSessionChangesScopeAndKey() {
        Fixture fixture = explicitOpenAi();
        PromptCachePlan first = fixture.plan(request(A, A, "agent", "hello", true));
        PromptCachePlan second = fixture.withSession(B)
                .plan(request(A, A, "agent", "hello", true));
        assertThat(second.cacheScopeIdDigest()).isNotEqualTo(first.cacheScopeIdDigest());
        assertThat(second.cacheKeyDigest()).isNotEqualTo(first.cacheKeyDigest());
    }

    @Test
    void differentEnterpriseAndUserChangeScopeAndKey() {
        Fixture fixture = explicitOpenAi();
        PromptCachePlan first = fixture.plan(request(A, A, "agent", "hello", true));
        PromptCachePlan second = fixture.withInvocation(invocation(
                        "enterprise.beta",
                        "user.beta",
                        "device.beta",
                        "client.beta"))
                .plan(request(A, A, "agent", "hello", true));
        assertThat(second.cacheScopeIdDigest()).isNotEqualTo(first.cacheScopeIdDigest());
        assertThat(second.cacheKeyDigest()).isNotEqualTo(first.cacheKeyDigest());
    }

    @Test
    void threeSessionFoundationKeepsCrossTurnStableAndCrossScopeIsolated() {
        Fixture a1 = explicitOpenAi();
        PromptCachePlan a1TurnOne = a1.plan(request(A, A, "agent", "one", true));
        PromptCachePlan a1TurnTwo = a1.plan(request(A, A, "agent", "two", true));
        PromptCachePlan a2 = a1.withSession(B)
                .plan(request(A, A, "agent", "one", true));
        PromptCachePlan b1 = a1.withSession(C)
                .withInvocation(invocation(
                        "enterprise.beta",
                        "user.beta",
                        "device.beta",
                        "client.beta"))
                .plan(request(A, A, "agent", "one", true));

        assertThat(a1TurnTwo.cacheScopeIdDigest())
                .isEqualTo(a1TurnOne.cacheScopeIdDigest());
        assertThat(a1TurnTwo.cacheKeyDigest())
                .isEqualTo(a1TurnOne.cacheKeyDigest());
        assertThat(List.of(
                        a1TurnOne.cacheScopeIdDigest(),
                        a2.cacheScopeIdDigest(),
                        b1.cacheScopeIdDigest()))
                .doesNotHaveDuplicates();
        assertThat(List.of(
                        a1TurnOne.cacheKeyDigest(),
                        a2.cacheKeyDigest(),
                        b1.cacheKeyDigest()))
                .doesNotHaveDuplicates();
    }

    @Test
    void deviceAndClientAreAuditFactsNotCacheKeyMaterial() {
        Fixture fixture = explicitOpenAi();
        PromptCachePlan first = fixture.plan(request(A, A, "agent", "hello", true));
        PromptCachePlan second = fixture.withInvocation(invocation("device.other", "client.other"))
                .plan(request(A, A, "agent", "hello", true));
        assertThat(second.cacheScopeIdDigest()).isEqualTo(first.cacheScopeIdDigest());
        assertThat(second.cacheKeyDigest()).isEqualTo(first.cacheKeyDigest());
    }

    @Test
    void retiredProfileCannotCreateNewPlan() {
        Fixture fixture = fixture(
                PromptCacheProfile.Status.RETIRED,
                PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT,
                PromptCacheProfile.Assurance.PROVEN,
                ModelEndpointBinding.Protocol.ANTHROPIC_COMPATIBLE,
                ModelEndpointBinding.ConnectionMode.CUSTOM_RELAY);
        assertThatThrownBy(() -> fixture.registry().resolveForNewPlan(fixture.binding()))
                .isInstanceOf(ModelGatewayException.class)
                .extracting("code")
                .isEqualTo("model_gateway.cache_profile_retired");
    }

    @Test
    void retiredExactProfileCanRecoverPersistedPlan() {
        Fixture fixture = fixture(
                PromptCacheProfile.Status.RETIRED,
                PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT,
                PromptCacheProfile.Assurance.PROVEN,
                ModelEndpointBinding.Protocol.ANTHROPIC_COMPATIBLE,
                ModelEndpointBinding.ConnectionMode.CUSTOM_RELAY);
        assertThat(fixture.registry().resolveForRecovery(
                        fixture.profile().profileId(),
                        fixture.profile().profileRevision(),
                        fixture.profile().profileDigest()))
                .isEqualTo(fixture.profile());
    }

    @Test
    void missingProfileFailsClosed() {
        VersionedPromptCacheProfileRegistry registry =
                new VersionedPromptCacheProfileRegistry(List.of());
        assertThatThrownBy(() -> registry.resolveForNewPlan(standard().binding()))
                .isInstanceOf(ModelGatewayException.class)
                .extracting("code")
                .isEqualTo("model_gateway.cache_profile_missing");
    }

    @Test
    void protocolMismatchFailsClosed() {
        Fixture fixture = standard();
        ModelEndpointBinding mismatched = binding(
                ModelEndpointBinding.Protocol.OPENAI_COMPATIBLE,
                fixture.binding().connectionMode(),
                A);
        assertThatThrownBy(() -> fixture.registry().resolveForNewPlan(mismatched))
                .isInstanceOf(ModelGatewayException.class)
                .extracting("code")
                .isEqualTo("model_gateway.cache_profile_binding_mismatch");
    }

    @Test
    void duplicateProfileRevisionIsRejected() {
        Fixture fixture = standard();
        assertThatThrownBy(() -> new VersionedPromptCacheProfileRegistry(
                        List.of(fixture.profile(), fixture.profile())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("duplicate");
    }

    @Test
    void cacheContextDigestSelfCheckRejectsDrift() {
        ModelInvocationCacheContext valid = context(UUID.randomUUID(), A);
        assertThatThrownBy(() -> new ModelInvocationCacheContext(
                        valid.invocationId(),
                        valid.cacheExecutionAuthority(),
                        valid.gatewayContractVersion(),
                        valid.sessionScopeDigest(),
                        valid.cacheContextDigest(),
                        B,
                        valid.createdAt()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("contextRecordDigest");
    }

    private static Fixture standard() {
        return fixture(
                PromptCacheProfile.Status.ACTIVE,
                PromptCacheProfile.ProjectionMode.ANTHROPIC_EXPLICIT,
                PromptCacheProfile.Assurance.PROVEN,
                ModelEndpointBinding.Protocol.ANTHROPIC_COMPATIBLE,
                ModelEndpointBinding.ConnectionMode.CUSTOM_RELAY);
    }

    private static Fixture explicitOpenAi() {
        return fixture(
                PromptCacheProfile.Status.ACTIVE,
                PromptCacheProfile.ProjectionMode.OPENAI_PROMPT_CACHE_KEY,
                PromptCacheProfile.Assurance.PROVEN,
                ModelEndpointBinding.Protocol.OPENAI_COMPATIBLE,
                ModelEndpointBinding.ConnectionMode.DIRECT_PROVIDER);
    }

    private static Fixture fixture(
            PromptCacheProfile.Status status,
            PromptCacheProfile.ProjectionMode mode,
            PromptCacheProfile.Assurance isolation,
            ModelEndpointBinding.Protocol protocol,
            ModelEndpointBinding.ConnectionMode connectionMode) {
        PromptCacheProfile profile = PromptCacheProfile.create(
                "profile.cache",
                A,
                status,
                protocol,
                List.of(connectionMode),
                mode,
                "route.test",
                isolation,
                PromptCacheProfile.Assurance.PROVIDER_DOCUMENTED,
                B,
                128);
        ModelEndpointBinding binding = binding(protocol, connectionMode, A);
        ModelInvocation invocation = invocation("device.alpha", "client.alpha");
        ModelInvocationCacheContext context = context(invocation.invocationId(), C);
        return new Fixture(
                invocation,
                binding,
                profile,
                context,
                new VersionedPromptCacheProfileRegistry(List.of(profile)),
                new PromptCacheCompatibilityClassifier(),
                new StaticPromptPrefixProjector(),
                new DeterministicPromptCachePlanner());
    }

    private static ModelEndpointBinding binding(
            ModelEndpointBinding.Protocol protocol,
            ModelEndpointBinding.ConnectionMode mode,
            String modelRevision) {
        return new ModelEndpointBinding(
                "binding.cache",
                B,
                C,
                "model.cache",
                "upstream.cache",
                modelRevision,
                C,
                D,
                mode,
                protocol,
                URI.create("https://provider.invalid/model"),
                "credential.cache",
                E,
                A,
                B,
                ModelEndpointBinding.RecoveryMode.IDEMPOTENT_RETRY);
    }

    private static ModelInvocation invocation(String deviceId, String clientId) {
        return invocation("enterprise.alpha", "user.alpha", deviceId, clientId);
    }

    private static ModelInvocation invocation(
            String enterpriseId,
            String userId,
            String deviceId,
            String clientId) {
        return new ModelInvocation(
                UUID.randomUUID(),
                enterpriseId,
                userId,
                deviceId,
                clientId,
                UUID.randomUUID(),
                UUID.randomUUID(),
                A,
                "model.cache",
                A,
                C,
                D,
                "user_confirmed",
                B,
                NOW.plusSeconds(60),
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
                NOW,
                null,
                null,
                NOW);
    }

    private static ModelInvocationCacheContext context(UUID invocationId, String session) {
        String contextDigest = CanonicalJson.sha256(
                "{\"sessionScopeDigest\":\"" + session + "\"}");
        return ModelInvocationCacheContext.create(invocationId, session, contextDigest, NOW);
    }

    private static String request(
            String sourceRevision,
            String sourceDigest,
            String sourceId,
            String userText,
            boolean includeSystem) {
        ObjectNode request = baseRequest();
        ArrayNode messages = request.putArray("messages");
        if (includeSystem) {
            messages.addObject()
                    .put("role", "system")
                    .put("sourceId", sourceId)
                    .put("sourceRevision", sourceRevision)
                    .put("sourceDigest", sourceDigest)
                    .set("content", textContent("static instructions"));
        }
        messages.addObject()
                .put("role", "user")
                .set("content", textContent(userText));
        request.putArray("tools");
        return CanonicalJson.canonicalize(request);
    }

    private static String requestWithTools(boolean reverse) {
        ObjectNode request = CanonicalJson.parseObject(
                request(A, A, "platform", "hello", true),
                1_000_000);
        ArrayNode tools = request.putArray("tools");
        ObjectNode first = tool("tool.alpha", "alpha", A);
        ObjectNode second = tool("tool.beta", "beta", B);
        tools.add(reverse ? second : first);
        tools.add(reverse ? first : second);
        return CanonicalJson.canonicalize(request);
    }

    private static ObjectNode baseRequest() {
        ObjectNode request = JSON.createObjectNode();
        request.put("snapshotId", "00000000-0000-4000-8000-000000000001");
        request.put("contextSourceDigest", A);
        request.putObject("model")
                .put("modelId", "model.cache")
                .put("modelRevision", A)
                .put("configurationRevision", C)
                .put("runtimeRegistryGeneration", D);
        request.put("maxOutputTokens", 100);
        return request;
    }

    private static ArrayNode textContent(String text) {
        ArrayNode content = JSON.createArrayNode();
        content.addObject().put("type", "text").put("text", text);
        return content;
    }

    private static ObjectNode tool(String id, String name, String revision) {
        ObjectNode schema = JSON.createObjectNode().put("type", "object");
        ObjectNode tool = JSON.createObjectNode()
                .put("capabilityId", id)
                .put("capabilityRevision", revision)
                .put("name", name)
                .put("description", name + " description");
        tool.set("inputSchema", schema);
        tool.put("inputSchemaDigest", CanonicalJson.sha256(
                CanonicalJson.canonicalize(schema)));
        return tool;
    }

    private record Fixture(
            ModelInvocation invocation,
            ModelEndpointBinding binding,
            PromptCacheProfile profile,
            ModelInvocationCacheContext context,
            VersionedPromptCacheProfileRegistry registry,
            PromptCacheCompatibilityClassifier classifier,
            StaticPromptPrefixProjector projector,
            DeterministicPromptCachePlanner planner) {

        PromptCachePlan plan(String request) {
            PromptCacheProfile exact = registry.resolveForNewPlan(binding);
            return planner.plan(
                    invocation,
                    binding,
                    exact,
                    context,
                    classifier.classify(request, exact),
                    projector.project(request),
                    NOW);
        }

        Fixture withSession(String session) {
            return new Fixture(
                    invocation,
                    binding,
                    profile,
                    PromptCachePlannerTest.context(invocation.invocationId(), session),
                    registry,
                    classifier,
                    projector,
                    planner);
        }

        Fixture withInvocation(ModelInvocation replacement) {
            return new Fixture(
                    replacement,
                    binding,
                    profile,
                    PromptCachePlannerTest.context(
                            replacement.invocationId(), context.sessionScopeDigest()),
                    registry,
                    classifier,
                    projector,
                    planner);
        }

        Fixture withBinding(ModelEndpointBinding replacement) {
            ModelInvocation replacedInvocation = new ModelInvocation(
                    invocation.invocationId(),
                    invocation.enterpriseId(),
                    invocation.userId(),
                    invocation.deviceId(),
                    invocation.clientInstanceId(),
                    invocation.clientRequestId(),
                    invocation.requestId(),
                    invocation.requestDigest(),
                    replacement.modelId(),
                    replacement.modelRevision(),
                    replacement.configurationRevision(),
                    replacement.runtimeRegistryGeneration(),
                    invocation.admissionType(),
                    invocation.admissionDigest(),
                    invocation.providerRequestDeadlineAt(),
                    invocation.providerStreamIdleTimeoutMillis(),
                    invocation.status(),
                    invocation.statusRevision(),
                    invocation.lastDurableEventSequence(),
                    invocation.durableEventStreamDigest(),
                    invocation.dispatchDecision(),
                    invocation.cancelRequestedAt(),
                    invocation.cancelReason(),
                    invocation.timeoutIntentAt(),
                    invocation.usageJson(),
                    invocation.finishReason(),
                    invocation.safeErrorCode(),
                    invocation.safeSummary(),
                    invocation.createdAt(),
                    invocation.startedAt(),
                    invocation.endedAt(),
                    invocation.updatedAt());
            return new Fixture(
                    replacedInvocation,
                    replacement,
                    profile,
                    context,
                    registry,
                    classifier,
                    projector,
                    planner);
        }
    }
}
