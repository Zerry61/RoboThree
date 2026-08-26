package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelEndpointBinding;
import com.robothree.central.modelgateway.domain.PromptCacheProfile;

public interface PromptCacheProfileResolver {
    PromptCacheProfile resolveForNewPlan(ModelEndpointBinding binding);
    PromptCacheProfile resolveForRecovery(
            String profileId,
            String profileRevision,
            String profileDigest);
}
