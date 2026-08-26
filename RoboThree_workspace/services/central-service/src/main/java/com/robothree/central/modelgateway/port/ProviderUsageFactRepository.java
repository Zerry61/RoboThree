package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelProviderAttempt;
import com.robothree.central.modelgateway.domain.ProviderUsageFact;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProviderUsageFactRepository {

    ProviderUsageFact insert(ProviderUsageFact fact);

    Optional<ProviderUsageFact> findUsageFact(ModelProviderAttempt.AttemptIdentity identity);

    List<ProviderUsageFact> findByInvocation(UUID authorityInvocationId);
}
