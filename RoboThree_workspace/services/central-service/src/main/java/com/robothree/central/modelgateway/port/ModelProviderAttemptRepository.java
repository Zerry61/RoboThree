package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelProviderAttempt;
import java.util.Optional;

public interface ModelProviderAttemptRepository {

    ModelProviderAttempt register(ModelProviderAttempt attempt);

    Optional<ModelProviderAttempt> findAttempt(ModelProviderAttempt.AttemptIdentity identity);
}
