package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelInvocationDurableEvent;
import java.util.List;
import java.util.UUID;

public interface ModelInvocationEventRepository {

    ModelInvocationDurableEvent append(ModelInvocationDurableEvent event);

    List<ModelInvocationDurableEvent> findAfter(
            UUID invocationId,
            long afterSequence,
            int limit);
}
