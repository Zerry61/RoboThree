package com.robothree.central.modelgateway.recovery;

import com.robothree.central.modelgateway.domain.ModelInvocationExecution;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.RecoveryEvidence;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Request;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Result;
import com.robothree.central.modelgateway.port.ModelInvocationExecutionBackend;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

final class HarnessModelInvocationBackend
        implements ModelInvocationExecutionBackend {

    private final AtomicReference<ExecuteMode> executeMode =
            new AtomicReference<>(ExecuteMode.COMPLETE);
    private final AtomicReference<QueryMode> queryMode =
            new AtomicReference<>(QueryMode.NOT_FOUND);
    private final AtomicReference<BlockSession> blockSession =
            new AtomicReference<>(new BlockSession());
    private final AtomicInteger executionCount = new AtomicInteger();
    private final AtomicInteger queryCount = new AtomicInteger();
    private final AtomicInteger cancelCount = new AtomicInteger();

    BackendState configure(BackendCommand command) {
        ExecuteMode nextExecuteMode = ExecuteMode.valueOf(command.executeMode());
        QueryMode nextQueryMode = QueryMode.valueOf(command.queryMode());
        executeMode.set(nextExecuteMode);
        queryMode.set(nextQueryMode);
        if (nextExecuteMode == ExecuteMode.BLOCK) {
            blockSession.set(new BlockSession());
        }
        return state();
    }

    BackendState release() {
        blockSession.get().release().countDown();
        return state();
    }

    BackendState state() {
        BlockSession session = blockSession.get();
        return new BackendState(
                executeMode.get().name(),
                queryMode.get().name(),
                executionCount.get(),
                queryCount.get(),
                cancelCount.get(),
                session.entered().getCount() == 0
                        && session.release().getCount() != 0);
    }

    @Override
    public Result execute(
            Request request,
            BooleanSupplier cancellationRequested) {
        executionCount.incrementAndGet();
        switch (executeMode.get()) {
            case HALT -> Runtime.getRuntime().halt(82);
            case BLOCK -> awaitRelease(blockSession.get());
            case COMPLETE -> {
                // Continue below.
            }
        }
        if (cancellationRequested.getAsBoolean()) {
            return new Result(
                    ModelInvocationExecution.Outcome.CANCELLED,
                    null,
                    null,
                    null,
                    null,
                    List.of());
        }
        return Result.completed(7, 11, "stop", List.of("harness-delta"));
    }

    @Override
    public RecoveryEvidence query(Request request) {
        queryCount.incrementAndGet();
        return switch (queryMode.get()) {
            case TERMINAL -> RecoveryEvidence.terminal(
                    Result.completed(7, 11, "stop", List.of()));
            case NOT_FOUND -> RecoveryEvidence.notFound();
            case UNKNOWN -> RecoveryEvidence.unknown();
        };
    }

    @Override
    public void requestCancel(UUID invocationId) {
        cancelCount.incrementAndGet();
    }

    private static void awaitRelease(BlockSession session) {
        session.entered().countDown();
        try {
            if (!session.release().await(30, TimeUnit.SECONDS)) {
                throw new IllegalStateException(
                        "model recovery harness block deadline exceeded");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(
                    "model recovery harness block interrupted",
                    exception);
        }
    }

    enum ExecuteMode {
        COMPLETE,
        BLOCK,
        HALT
    }

    enum QueryMode {
        TERMINAL,
        NOT_FOUND,
        UNKNOWN
    }

    record BackendCommand(String executeMode, String queryMode) {}

    record BackendState(
            String executeMode,
            String queryMode,
            int executionCount,
            int queryCount,
            int cancelCount,
            boolean blocked) {}

    private record BlockSession(
            CountDownLatch entered,
            CountDownLatch release) {

        private BlockSession() {
            this(new CountDownLatch(1), new CountDownLatch(1));
        }
    }
}
