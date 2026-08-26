package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.PromptCachePlan;
import java.util.Optional;
import java.util.UUID;

public interface PromptCachePlanRepository {
    Optional<PromptCachePlan> findPlanByInvocationId(UUID invocationId);
    Optional<PromptCachePlan> findLatestByMonotonicityIdentity(
            PromptCachePlan.MonotonicityIdentity identity);
    PromptCachePlan insertImmutable(PromptCachePlan plan);
}
