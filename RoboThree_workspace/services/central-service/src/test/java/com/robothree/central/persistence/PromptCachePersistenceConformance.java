package com.robothree.central.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationCacheContext;
import com.robothree.central.modelgateway.domain.ModelInvocationStatus;
import com.robothree.central.modelgateway.domain.PromptCachePlan;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;
import com.robothree.central.modelgateway.port.ModelInvocationCacheContextRepository;
import com.robothree.central.modelgateway.port.ModelInvocationRepository;
import com.robothree.central.modelgateway.port.PromptCachePlanRepository;
import com.robothree.central.persistence.port.CentralTransactionRunner;
import com.robothree.central.shared.json.CanonicalJson;
import java.time.Instant;
import java.util.UUID;

final class PromptCachePersistenceConformance {

    private static final String A = "a".repeat(64);
    private static final String B = "b".repeat(64);
    private static final String C = "c".repeat(64);
    private static final String D = "d".repeat(64);
    private static final Instant NOW = Instant.parse("2026-08-14T02:00:00Z");

    private PromptCachePersistenceConformance() {}

    static void verify(
            ModelInvocationRepository invocations,
            ModelInvocationCacheContextRepository contexts,
            PromptCachePlanRepository plans,
            CentralTransactionRunner transactions) {
        ModelInvocation invocation = invocation(UUID.randomUUID(), UUID.randomUUID());
        invocations.accept(invocation);
        ModelInvocationCacheContext context = context(invocation.invocationId(), A);
        assertThat(contexts.insertImmutable(context)).isEqualTo(context);
        assertThat(contexts.insertImmutable(context)).isEqualTo(context);
        assertThat(contexts.findContextByInvocationId(invocation.invocationId()))
                .contains(context);

        assertThatThrownBy(() -> contexts.insertImmutable(context(invocation.invocationId(), B)))
                .isInstanceOf(PersistenceConflictException.class);

        PromptCachePlan plan = plan(invocation.invocationId(), context.cacheContextDigest(), A);
        assertThat(plans.insertImmutable(plan)).isEqualTo(plan);
        assertThat(plans.insertImmutable(plan)).isEqualTo(plan);
        assertThat(plans.findPlanByInvocationId(invocation.invocationId())).contains(plan);
        assertThat(plans.findLatestByMonotonicityIdentity(plan.monotonicityIdentity()))
                .contains(plan);

        PromptCachePlan drift = plan(invocation.invocationId(), context.cacheContextDigest(), B);
        assertThatThrownBy(() -> plans.insertImmutable(drift))
                .isInstanceOf(PersistenceConflictException.class);

        ModelInvocation rolledBack = invocation(UUID.randomUUID(), UUID.randomUUID());
        assertThatThrownBy(() -> transactions.required(() -> {
                    invocations.accept(rolledBack);
                    contexts.insertImmutable(context(rolledBack.invocationId(), C));
                    throw new Rollback();
                }))
                .isInstanceOf(Rollback.class);
        assertThat(invocations.findById(rolledBack.invocationId())).isEmpty();
        assertThat(contexts.findContextByInvocationId(rolledBack.invocationId())).isEmpty();

        ModelInvocation planRollback = invocation(UUID.randomUUID(), UUID.randomUUID());
        invocations.accept(planRollback);
        ModelInvocationCacheContext rollbackContext = context(planRollback.invocationId(), D);
        contexts.insertImmutable(rollbackContext);
        assertThatThrownBy(() -> transactions.required(() -> {
                    plans.insertImmutable(plan(
                            planRollback.invocationId(),
                            rollbackContext.cacheContextDigest(),
                            C));
                    throw new Rollback();
                }))
                .isInstanceOf(Rollback.class);
        assertThat(plans.findPlanByInvocationId(planRollback.invocationId())).isEmpty();
    }

    static ModelInvocation invocation(UUID invocationId, UUID clientRequestId) {
        return new ModelInvocation(
                invocationId,
                "enterprise.alpha",
                "user.alpha",
                "device.alpha",
                "client.alpha",
                clientRequestId,
                UUID.randomUUID(),
                A,
                "model.cache",
                A,
                B,
                C,
                "user_confirmed",
                D,
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

    static ModelInvocationCacheContext context(UUID invocationId, String sessionDigest) {
        return ModelInvocationCacheContext.create(
                invocationId,
                sessionDigest,
                CanonicalJson.sha256(
                        "{\"sessionScopeDigest\":\"" + sessionDigest + "\"}"),
                NOW);
    }

    static PromptCachePlan plan(
            UUID invocationId,
            String cacheContextDigest,
            String staticPrefixDigest) {
        String scope = A;
        String source = B;
        String compatibility = C;
        String policy = D;
        String profileRevision = A;
        String profileDigest = B;
        String cacheKey = C;
        String planDigest = PromptCachePlan.computePlanDigest(
                cacheContextDigest,
                scope,
                source,
                staticPrefixDigest,
                compatibility,
                cacheKey,
                policy,
                A,
                B,
                "profile.cache",
                profileRevision,
                profileDigest,
                PromptCacheProfile.ProjectionMode.OPENAI_PROMPT_CACHE_KEY,
                true,
                null);
        return new PromptCachePlan(
                invocationId,
                cacheContextDigest,
                scope,
                source,
                staticPrefixDigest,
                compatibility,
                cacheKey,
                policy,
                A,
                B,
                "profile.cache",
                profileRevision,
                profileDigest,
                PromptCacheProfile.ProjectionMode.OPENAI_PROMPT_CACHE_KEY,
                true,
                null,
                planDigest,
                NOW);
    }

    private static final class Rollback extends RuntimeException {}
}
