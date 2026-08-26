package com.robothree.central.modelgateway.application;

import com.robothree.central.modelgateway.application.ModelInvocationRuntime.AcceptCommand;
import com.robothree.central.modelgateway.domain.ModelInvocation;
import com.robothree.central.modelgateway.domain.ModelInvocationDurableEvent;
import java.util.List;
import java.util.UUID;

/** Typed application boundary used by the thin HTTP/SSE service. */
public interface ModelInvocationApplicationRuntime {

    ModelInvocation accept(String compactAccessToken, AcceptCommand command);

    ModelInvocation execute(UUID invocationId, String ownerNodeId);

    ModelInvocation recover(UUID invocationId, String ownerNodeId);

    ModelInvocation requestCancel(
            String compactAccessToken,
            UUID invocationId,
            long expectedStatusRevision,
            String reason);

    ModelInvocation status(String compactAccessToken, UUID invocationId);

    List<ModelInvocationDurableEvent> durableEvents(
            String compactAccessToken,
            UUID invocationId,
            long afterSequence,
            int limit);
}
