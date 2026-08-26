package com.robothree.central.modelgateway.port;

import com.robothree.central.modelgateway.domain.ModelInvocationExecution.RecoveryEvidence;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Request;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Result;
import java.util.UUID;
import java.util.function.BooleanSupplier;

public interface ModelInvocationExecutionBackend {

    Result execute(Request request, BooleanSupplier cancellationRequested);

    RecoveryEvidence query(Request request);

    default void requestCancel(UUID invocationId) {}
}
