package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelInvocationAuditOutbox;
import java.util.List;

public interface ModelInvocationAuditOutboxRepository {

    ModelInvocationAuditOutbox insert(ModelInvocationAuditOutbox outbox);

    List<ModelInvocationAuditOutbox> findPending(int limit);
}
