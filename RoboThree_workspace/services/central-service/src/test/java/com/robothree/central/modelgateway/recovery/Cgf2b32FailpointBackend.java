package com.robothree.central.modelgateway.recovery;

import com.robothree.central.modelgateway.domain.ModelInvocationExecution.RecoveryEvidence;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Request;
import com.robothree.central.modelgateway.domain.ModelInvocationExecution.Result;
import com.robothree.central.modelgateway.port.ModelInvocationExecutionBackend;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;

final class Cgf2b32FailpointBackend implements ModelInvocationExecutionBackend {

    private final ModelInvocationExecutionBackend delegate;
    private final AtomicReference<Session> session =
            new AtomicReference<>(new Session(Failpoint.NONE));
    private final AtomicInteger executeCount = new AtomicInteger();
    private final AtomicInteger queryCount = new AtomicInteger();
    private final AtomicInteger cancelCount = new AtomicInteger();

    Cgf2b32FailpointBackend(ModelInvocationExecutionBackend delegate) {
        this.delegate = Objects.requireNonNull(delegate, "delegate");
    }

    State configure(Command command) {
        session.set(new Session(Failpoint.valueOf(command.failpoint())));
        return state();
    }

    State awaitBlocked(UUID sessionId) {
        Session current = requireSession(sessionId);
        try {
            if (!current.entered().await(15, TimeUnit.SECONDS)) {
                throw new IllegalStateException(
                        "CGF-2B.3.2 failpoint handshake deadline exceeded");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(
                    "CGF-2B.3.2 failpoint handshake interrupted",
                    exception);
        }
        if (session.get() != current || current.release().getCount() == 0) {
            throw new IllegalStateException(
                    "CGF-2B.3.2 failpoint session changed before handshake completed");
        }
        return state(current);
    }

    State release(UUID sessionId) {
        Session current = requireSession(sessionId);
        current.release().countDown();
        return state(current);
    }

    State state() {
        Session current = session.get();
        return state(current);
    }

    private State state(Session current) {
        return new State(
                current.sessionId(),
                current.failpoint().name(),
                executeCount.get(),
                queryCount.get(),
                cancelCount.get(),
                current.entered().getCount() == 0
                        && current.release().getCount() != 0);
    }

    private Session requireSession(UUID sessionId) {
        Session current = session.get();
        if (!current.sessionId().equals(sessionId)) {
            throw new IllegalStateException(
                    "CGF-2B.3.2 failpoint session identity mismatch");
        }
        return current;
    }

    @Override
    public Result execute(Request request, BooleanSupplier cancellationRequested) {
        executeCount.incrementAndGet();
        Session current = session.get();
        if (current.failpoint() == Failpoint.BEFORE_DELEGATE) {
            awaitRelease(current);
        }
        Result result = delegate.execute(request, cancellationRequested);
        if (current.failpoint() == Failpoint.AFTER_DELEGATE) {
            awaitRelease(current);
        }
        return result;
    }

    @Override
    public RecoveryEvidence query(Request request) {
        queryCount.incrementAndGet();
        return delegate.query(request);
    }

    @Override
    public void requestCancel(UUID invocationId) {
        cancelCount.incrementAndGet();
        delegate.requestCancel(invocationId);
    }

    private static void awaitRelease(Session session) {
        session.entered().countDown();
        try {
            if (!session.release().await(45, TimeUnit.SECONDS)) {
                throw new IllegalStateException("CGF-2B.3.2 failpoint deadline exceeded");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("CGF-2B.3.2 failpoint interrupted", exception);
        }
    }

    enum Failpoint {
        NONE,
        BEFORE_DELEGATE,
        AFTER_DELEGATE
    }

    record Command(String failpoint) {}

    record State(
            UUID sessionId,
            String failpoint,
            int executeCount,
            int queryCount,
            int cancelCount,
            boolean blocked) {}

    private record Session(
            UUID sessionId,
            Failpoint failpoint,
            CountDownLatch entered,
            CountDownLatch release) {

        private Session(Failpoint failpoint) {
            this(
                    UUID.randomUUID(),
                    failpoint,
                    new CountDownLatch(1),
                    new CountDownLatch(1));
        }
    }
}
