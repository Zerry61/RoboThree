package com.robothree.central.modelgateway.development;

import com.robothree.central.modelgateway.domain.ModelInvocationExecution.RecoveryEvidence;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Request;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Result;
import com.robothree.central.modelgateway.port.ModelInvocationExecutionBackend;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;

public final class ScriptedFakeModelInvocationBackend
        implements ModelInvocationExecutionBackend {

    private final Map<UUID, Result> results = new ConcurrentHashMap<>();
    private final Map<UUID, RecoveryEvidence> evidence = new ConcurrentHashMap<>();
    private final AtomicInteger executionCount = new AtomicInteger();
    private volatile Result defaultResult =
            Result.completed(1, 1, "stop", java.util.List.of("fixture"));

    public void setDefaultResult(Result result) {
        defaultResult = result;
    }

    public void setRecoveryEvidence(
            UUID invocationId,
            RecoveryEvidence recoveryEvidence) {
        evidence.put(invocationId, recoveryEvidence);
    }

    public int executionCount() {
        return executionCount.get();
    }

    @Override
    public Result execute(
            Request request,
            BooleanSupplier cancellationRequested) {
        executionCount.incrementAndGet();
        Result result = cancellationRequested.getAsBoolean()
                ? new Result(
                        com.robothree.central.modelgateway.domain
                                .ModelInvocationExecution.Outcome.CANCELLED,
                        null,
                        null,
                        null,
                        null,
                        java.util.List.of())
                : defaultResult;
        results.put(request.invocationId(), result);
        return result;
    }

    @Override
    public RecoveryEvidence query(Request request) {
        RecoveryEvidence configured = evidence.get(request.invocationId());
        if (configured != null) {
            return configured;
        }
        Result result = results.get(request.invocationId());
        return result == null
                ? RecoveryEvidence.notFound()
                : RecoveryEvidence.terminal(result);
    }
}
