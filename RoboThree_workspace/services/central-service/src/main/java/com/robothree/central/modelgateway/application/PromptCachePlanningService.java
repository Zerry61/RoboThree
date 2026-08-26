package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationCacheContext;
import com.robothree.central.modelgateway.domain.PromptCachePlan;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.modelgateway.port.ModelInvocationCacheContextRepository;
import com.robothree.central.modelgateway.port.PromptCachePlanRepository;
import com.robothree.central.modelgateway.port.PromptCacheProfileResolver;
import java.time.Clock;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/** Application coordinator for deterministic planning and monotonicity enforcement. */
public final class PromptCachePlanningService {

    private final ModelInvocationCacheContextRepository contexts;
    private final PromptCachePlanRepository plans;
    private final PromptCacheProfileResolver profiles;
    private final PromptCacheCompatibilityClassifier compatibility;
    private final StaticPromptPrefixProjector projector;
    private final DeterministicPromptCachePlanner planner;
    private final TransientModelProviderRequestSource requests;
    private final Clock clock;

    public PromptCachePlanningService(
            ModelInvocationCacheContextRepository contexts,
            PromptCachePlanRepository plans,
            PromptCacheProfileResolver profiles,
            PromptCacheCompatibilityClassifier compatibility,
            StaticPromptPrefixProjector projector,
            DeterministicPromptCachePlanner planner,
            TransientModelProviderRequestSource requests,
            Clock clock) {
        this.contexts = Objects.requireNonNull(contexts, "contexts");
        this.plans = Objects.requireNonNull(plans, "plans");
        this.profiles = Objects.requireNonNull(profiles, "profiles");
        this.compatibility = Objects.requireNonNull(compatibility, "compatibility");
        this.projector = Objects.requireNonNull(projector, "projector");
        this.planner = Objects.requireNonNull(planner, "planner");
        this.requests = Objects.requireNonNull(requests, "requests");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public Optional<PromptCachePlan> prepareNewPlan(
            ModelInvocation invocation,
            ModelEndpointBinding binding) {
        ModelInvocationCacheContext context = contexts
                .findContextByInvocationId(invocation.invocationId())
                .orElse(null);
        if (context == null) return Optional.empty();
        PromptCacheProfile profile = profiles.resolveForNewPlan(binding);
        var providerRequest = requests.resolve(invocation.requestDigest());
        var classified = compatibility.classify(
                providerRequest.canonicalRequestJson(),
                profile);
        var projection = projector.project(providerRequest.canonicalRequestJson());
        PromptCachePlan proposed = planner.plan(
                invocation,
                binding,
                profile,
                context,
                classified,
                projection,
                clock.instant());
        enforceMonotonicity(proposed);
        return Optional.of(plans.insertImmutable(proposed));
    }

    public Optional<PromptCachePlan> resolveForExecution(UUID invocationId) {
        Optional<PromptCachePlan> plan = plans.findPlanByInvocationId(invocationId);
        plan.ifPresent(value -> profiles.resolveForRecovery(
                value.profileId(),
                value.profileRevision(),
                value.profileDigest()));
        return plan;
    }

    private void enforceMonotonicity(PromptCachePlan proposed) {
        plans.findLatestByMonotonicityIdentity(proposed.monotonicityIdentity())
                .ifPresent(existing -> {
                    if (!existing.staticPrefixDigest()
                            .equals(proposed.staticPrefixDigest())) {
                        throw ModelGatewayException.conflict(
                                "model_gateway.cache_static_prefix_drift",
                                "The same static source lock produced different content.");
                    }
                    if (!Objects.equals(
                                    existing.cacheKeyDigest(),
                                    proposed.cacheKeyDigest())
                            || !existing.planDigest().equals(proposed.planDigest())) {
                        throw ModelGatewayException.conflict(
                                "model_gateway.cache_plan_conflict",
                                "The immutable prompt cache plan conflicts with prior facts.");
                    }
                });
    }
}
