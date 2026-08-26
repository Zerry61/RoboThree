package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelInvocationRecoveryLease;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface ModelInvocationRecoveryLeaseRepository {

    ModelInvocationRecoveryLease insert(ModelInvocationRecoveryLease lease);

    Optional<ModelInvocationRecoveryLease> find(UUID invocationId);

    Optional<ModelInvocationRecoveryLease> findForUpdate(UUID invocationId);

    Instant currentDatabaseTime();

    ModelInvocationRecoveryLease replace(
            ModelInvocationRecoveryLease lease,
            long expectedFencingEpoch);
}
